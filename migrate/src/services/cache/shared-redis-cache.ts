// src/services/cache/shared-redis-cache.ts

import { RedisClient } from "bun";
import {
  type CacheResilienceConfig,
  type ConsumerSecret,
  ConsumerSecretLenientSchema,
  type IKongCacheService,
  type KongCacheStats,
} from "../../config/schemas";
import { recordCacheOperation, recordRedisConnection } from "../../telemetry/metrics";
import {
  instrumentRedisOperation,
  type RedisOperationContext,
} from "../../telemetry/redis-instrumentation";
import { SpanEvents, telemetryEmitter } from "../../telemetry/tracer";
import { detectCacheError, isConnectionError } from "../../utils/cache-error-detector";
import {
  CacheReconnectManager,
  DEFAULT_RECONNECT_CONFIG,
} from "../../utils/cache-reconnect-manager";
import { validateExternalData } from "../../utils/validation";
import { CacheCircuitBreaker, DEFAULT_CACHE_CIRCUIT_BREAKER_CONFIG } from "./cache-circuit-breaker";
import { CacheHealthMonitor, DEFAULT_HEALTH_MONITOR_CONFIG } from "./cache-health-monitor";
import {
  type CacheOperationTimeouts,
  DEFAULT_OPERATION_TIMEOUTS,
  withOperationTimeout,
} from "./cache-operation-timeout";
import { CacheScanIterator, DEFAULT_SCAN_CONFIG } from "./cache-scan-iterator";

export class SharedRedisCache implements IKongCacheService {
  private client: RedisClient | null = null;
  private keyPrefix = "auth_service:";
  private staleKeyPrefix = "auth_service_stale:";
  private isConnected = false;
  private stats = {
    hits: 0,
    misses: 0,
    totalLatency: 0,
    operations: 0,
  };
  private readonly circuitBreaker: CacheCircuitBreaker;
  private readonly reconnectManager: CacheReconnectManager;
  private healthMonitor: CacheHealthMonitor | null = null;
  private readonly operationTimeouts: CacheOperationTimeouts;
  private scanIterator: CacheScanIterator | null = null;

  constructor(
    private config: {
      url: string;
      password?: string;
      db: number;
      ttlSeconds: number;
      staleDataToleranceMinutes?: number;
      resilience?: CacheResilienceConfig;
    }
  ) {
    // Initialize resilience components with config or defaults
    const resilienceConfig = config.resilience;

    this.circuitBreaker = new CacheCircuitBreaker(
      resilienceConfig?.circuitBreaker ?? DEFAULT_CACHE_CIRCUIT_BREAKER_CONFIG
    );

    this.reconnectManager = new CacheReconnectManager(
      resilienceConfig?.reconnect ?? DEFAULT_RECONNECT_CONFIG
    );

    this.operationTimeouts = resilienceConfig?.operationTimeouts ?? DEFAULT_OPERATION_TIMEOUTS;

    telemetryEmitter.debug(
      SpanEvents.CACHE_FACTORY_INITIALIZING,
      "SharedRedisCache initialized with resilience components",
      {
        component: "shared_redis_cache",
        operation: "init",
        circuit_breaker_enabled: this.circuitBreaker !== null,
        reconnect_manager_enabled: this.reconnectManager !== null,
      }
    );
  }

  /**
   * Ensures the Redis client is connected before operations.
   * Uses circuit breaker and reconnection manager for resilience.
   * @throws Error if the client is not connected and reconnection fails
   */
  private async ensureConnected(): Promise<RedisClient> {
    if (!this.client) {
      throw new Error("Redis client not connected. Call connect() first.");
    }

    if (!this.circuitBreaker.canExecute()) {
      throw new Error("Cache circuit breaker is open - operations temporarily blocked");
    }

    // If connection is broken, attempt reconnection with exponential backoff
    if (!this.isConnected) {
      const result = await this.reconnectManager.executeReconnect(async () => {
        if (!this.client) {
          throw new Error("Redis client not available for reconnection");
        }

        await withOperationTimeout(
          "CONNECT",
          this.operationTimeouts.connect,
          this.client.connect()
        );

        if (this.config.db > 0) {
          await this.client.send("SELECT", [this.config.db.toString()]);
        }

        await withOperationTimeout(
          "PING",
          this.operationTimeouts.ping,
          this.client.send("PING", [])
        );
      });

      if (result.success) {
        this.isConnected = true;
        this.circuitBreaker.recordSuccess();
        recordRedisConnection(true);

        // Reset health monitor on successful reconnection
        if (this.healthMonitor) {
          this.healthMonitor.markHealthy();
        }

        telemetryEmitter.info(SpanEvents.CACHE_RECONNECT_SUCCESS, "Redis reconnection successful", {
          component: "cache",
          operation: "reconnect_success",
          attempts: result.attempts,
          duration_ms: result.durationMs,
          client: "bun-native",
        });
      } else {
        // Record failure in circuit breaker
        this.circuitBreaker.recordFailure(result.error || new Error("Reconnection failed"));
        throw new Error(
          `Redis connection lost and reconnection failed: ${result.error?.message || "Unknown error"}`
        );
      }
    }

    return this.client;
  }

  /**
   * Marks the connection as potentially broken for reconnection handling.
   * Records failure in circuit breaker if it's a connection error.
   *
   * @param error - Optional error that caused the connection to break
   */
  private markConnectionBroken(error?: Error | string): void {
    this.isConnected = false;
    recordRedisConnection(false);

    if (error) {
      const errorInfo = detectCacheError(error);
      if (errorInfo.shouldReconnect) {
        this.circuitBreaker.recordFailure(error instanceof Error ? error : new Error(error));
      }

      telemetryEmitter.debug(SpanEvents.CACHE_CONNECTION_BROKEN, "Connection marked as broken", {
        component: "shared_redis_cache",
        operation: "mark_connection_broken",
        error_category: errorInfo.category,
        is_recoverable: errorInfo.isRecoverable,
        should_reconnect: errorInfo.shouldReconnect,
      });
    }
  }

  async connect(): Promise<void> {
    const context: RedisOperationContext = {
      operation: "CONNECT",
      connectionUrl: this.config.url,
      database: this.config.db,
    };

    return instrumentRedisOperation(context, async () => {
      const redisUrl = this.config.password
        ? this.config.url.replace("redis://", `redis://:${this.config.password}@`)
        : this.config.url;

      this.client = new RedisClient(redisUrl, {
        connectionTimeout: this.operationTimeouts.connect,
        autoReconnect: false,
        maxRetries: 1, // Let our reconnect manager handle retries
        enableOfflineQueue: false, // Fail fast, we have circuit breaker
      });

      await withOperationTimeout("CONNECT", this.operationTimeouts.connect, this.client.connect());

      if (this.config.db > 0) {
        await this.client.send("SELECT", [this.config.db.toString()]);
      }

      await withOperationTimeout("PING", this.operationTimeouts.ping, this.client.send("PING", []));

      this.isConnected = true;
      this.circuitBreaker.recordSuccess();
      this.reconnectManager.reset();
      recordRedisConnection(true);

      const resilienceConfig = this.config.resilience;
      if (resilienceConfig?.healthMonitor?.enabled !== false) {
        this.healthMonitor = new CacheHealthMonitor(
          async () => {
            if (this.client) {
              await this.client.send("PING", []);
            }
          },
          this.circuitBreaker,
          resilienceConfig?.healthMonitor ?? DEFAULT_HEALTH_MONITOR_CONFIG
        );
        this.healthMonitor.start();
      }

      this.scanIterator = new CacheScanIterator(
        async (cursor, options) => {
          if (!this.client) {
            throw new Error("Client not connected");
          }
          const result = (await this.client.send("SCAN", [
            cursor.toString(),
            "MATCH",
            options.MATCH,
            "COUNT",
            options.COUNT.toString(),
          ])) as [string, string[]];
          return {
            cursor: Number.parseInt(result[0], 10),
            keys: Array.isArray(result[1]) ? result[1] : [],
          };
        },
        {
          ...DEFAULT_SCAN_CONFIG,
          timeoutMs: this.operationTimeouts.scan,
        }
      );

      telemetryEmitter.info(
        SpanEvents.CACHE_CONNECTED,
        "Connected to Redis using Bun native client",
        {
          redis_url: this.config.url,
          redis_db: this.config.db,
          component: "cache",
          operation: "connection",
          strategy: "shared-redis",
          client: "bun-native",
          health_monitor_enabled: this.healthMonitor !== null,
          circuit_breaker_enabled: true,
        }
      );
    }).catch((error) => {
      this.isConnected = false;
      this.circuitBreaker.recordFailure(error instanceof Error ? error : new Error(String(error)));
      telemetryEmitter.warn(
        SpanEvents.CACHE_RECONNECT_FAILED,
        "Failed to connect to Redis, will use graceful fallback",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          component: "cache",
          operation: "connection_failed",
          strategy: "shared-redis",
          client: "bun-native",
        }
      );
      throw error;
    });
  }

  async get<T = ConsumerSecret>(key: string): Promise<T | null> {
    if (!this.circuitBreaker.canExecute()) {
      telemetryEmitter.debug(
        SpanEvents.CACHE_CB_FAILURE,
        "GET operation blocked by circuit breaker",
        {
          component: "shared_redis_cache",
          operation: "get_blocked",
          key,
          circuit_breaker_state: this.circuitBreaker.getState(),
        }
      );
      return null;
    }

    const redisKey = this.keyPrefix + key;
    const context: RedisOperationContext = {
      operation: "GET",
      key: redisKey,
      connectionUrl: this.config.url,
      database: this.config.db,
    };

    const start = performance.now();

    return instrumentRedisOperation(context, async () => {
      const client = await this.ensureConnected();

      const cached = await withOperationTimeout(
        "GET",
        this.operationTimeouts.get,
        client.get(redisKey)
      );

      if (cached) {
        this.recordHit(performance.now() - start);
        this.circuitBreaker.recordSuccess();
        const parsed = JSON.parse(cached);
        const validationResult = validateExternalData(ConsumerSecretLenientSchema, parsed, {
          source: "redis_cache",
          operation: "get",
          consumerId: key.replace("consumer_secret:", ""),
        });
        return (validationResult.data ?? parsed) as T;
      }

      this.recordMiss(performance.now() - start);
      this.circuitBreaker.recordSuccess();
      return null;
    }).catch((error) => {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      if (isConnectionError(error)) {
        this.markConnectionBroken(error);
      }

      telemetryEmitter.warn(
        SpanEvents.CACHE_OPERATION_FAILED,
        "Redis get operation failed, falling back to null",
        {
          error: errorMessage,
          component: "cache",
          operation: "get_failed",
          key,
          client: "bun-native",
          error_category: detectCacheError(error).category,
        }
      );
      this.recordMiss(performance.now() - start);
      return null;
    });
  }

  async set<T = ConsumerSecret>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    if (!this.circuitBreaker.canExecute()) {
      telemetryEmitter.debug(
        SpanEvents.CACHE_CB_FAILURE,
        "SET operation blocked by circuit breaker",
        {
          component: "shared_redis_cache",
          operation: "set_blocked",
          key,
          circuit_breaker_state: this.circuitBreaker.getState(),
        }
      );
      return;
    }

    const typedValue = value as Record<string, unknown>;
    if (
      key.startsWith("consumer_secret:") &&
      typedValue.consumer &&
      typeof typedValue.consumer === "object" &&
      typedValue.consumer !== null
    ) {
      const consumer = typedValue.consumer as { id?: string };
      if (consumer.id) {
        const expectedConsumerId = key.replace("consumer_secret:", "");
        if (consumer.id !== expectedConsumerId) {
          telemetryEmitter.error(
            SpanEvents.KONG_CONSUMER_MISMATCH,
            `Cache key and consumer ID mismatch detected, preventing cache pollution`,
            {
              cache_key: key,
              expected_consumer_id: expectedConsumerId,
              actual_consumer_id: consumer.id,
              component: "shared_redis_cache",
              action: "cache_pollution_prevention",
            }
          );
          return;
        }
      }
    }

    const redisKey = this.keyPrefix + key;
    const staleRedisKey = this.staleKeyPrefix + key;
    const context: RedisOperationContext = {
      operation: "SET",
      key: redisKey,
      connectionUrl: this.config.url,
      database: this.config.db,
    };

    return instrumentRedisOperation(context, async () => {
      const client = await this.ensureConnected();
      const ttl = ttlSeconds || this.config.ttlSeconds;
      const staleTtlMinutes = this.config.staleDataToleranceMinutes || 30;
      const staleTtl = staleTtlMinutes * 60;

      await withOperationTimeout(
        "SET",
        this.operationTimeouts.set,
        (async () => {
          await client.set(redisKey, JSON.stringify(value));
          await client.expire(redisKey, ttl);

          await client.set(staleRedisKey, JSON.stringify(value));
          await client.expire(staleRedisKey, staleTtl);
        })()
      );

      this.circuitBreaker.recordSuccess();
    }).catch((error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error));
      const errorMessage = err.message;

      if (isConnectionError(err)) {
        this.markConnectionBroken(err);
      }

      telemetryEmitter.warn(SpanEvents.CACHE_OPERATION_FAILED, "Redis set operation failed", {
        error: errorMessage,
        component: "cache",
        operation: "set_failed",
        key,
        client: "bun-native",
        error_category: detectCacheError(err).category,
      });
    });
  }

  async delete(key: string): Promise<void> {
    if (!this.circuitBreaker.canExecute()) {
      telemetryEmitter.debug(
        SpanEvents.CACHE_CB_FAILURE,
        "DELETE operation blocked by circuit breaker",
        {
          component: "shared_redis_cache",
          operation: "delete_blocked",
          key,
          circuit_breaker_state: this.circuitBreaker.getState(),
        }
      );
      return;
    }

    const redisKey = this.keyPrefix + key;
    const context: RedisOperationContext = {
      operation: "DELETE",
      key: redisKey,
      connectionUrl: this.config.url,
      database: this.config.db,
    };

    return instrumentRedisOperation(context, async () => {
      const client = await this.ensureConnected();

      await withOperationTimeout("DELETE", this.operationTimeouts.delete, client.del(redisKey));

      this.circuitBreaker.recordSuccess();
    }).catch((error) => {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      if (isConnectionError(error)) {
        this.markConnectionBroken(error);
      }

      telemetryEmitter.warn(SpanEvents.CACHE_OPERATION_FAILED, "Redis delete operation failed", {
        error: errorMessage,
        component: "cache",
        operation: "delete_failed",
        key,
        client: "bun-native",
        error_category: detectCacheError(error).category,
      });
    });
  }

  async clear(): Promise<void> {
    if (!this.circuitBreaker.canExecute()) {
      telemetryEmitter.debug(
        SpanEvents.CACHE_CB_FAILURE,
        "CLEAR operation blocked by circuit breaker",
        {
          component: "shared_redis_cache",
          operation: "clear_blocked",
          circuit_breaker_state: this.circuitBreaker.getState(),
        }
      );
      return;
    }

    try {
      const client = await this.ensureConnected();

      if (this.scanIterator) {
        const { keys, stats } = await this.scanIterator.collectAll(`${this.keyPrefix}*`);

        if (keys.length > 0) {
          // Delete in batches to avoid overwhelming Redis
          const batchSize = 100;
          for (let i = 0; i < keys.length; i += batchSize) {
            const batch = keys.slice(i, i + batchSize);
            await withOperationTimeout(
              "DELETE",
              this.operationTimeouts.delete,
              client.del(...batch)
            );
          }
        }

        this.circuitBreaker.recordSuccess();

        telemetryEmitter.debug(SpanEvents.CACHE_DELETE, "Clear operation completed", {
          component: "shared_redis_cache",
          operation: "clear_complete",
          keys_deleted: keys.length,
          scan_iterations: stats.iterations,
          duration_ms: stats.durationMs,
        });
      } else {
        // Fallback to direct SCAN if iterator not available
        let cursor = "0";
        do {
          const result = (await client.send("SCAN", [
            cursor,
            "MATCH",
            `${this.keyPrefix}*`,
            "COUNT",
            "100",
          ])) as [string, string[]];
          cursor = result[0];
          const keys = Array.isArray(result[1]) ? result[1] : [];

          if (keys.length > 0) {
            await client.del(...keys);
          }
        } while (cursor !== "0");

        this.circuitBreaker.recordSuccess();
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      const errorMessage = err.message;

      if (isConnectionError(err)) {
        this.markConnectionBroken(err);
      }

      telemetryEmitter.warn(SpanEvents.CACHE_OPERATION_FAILED, "Redis clear operation failed", {
        error: errorMessage,
        component: "cache",
        operation: "clear_failed",
        client: "bun-native",
        error_category: detectCacheError(err).category,
      });
    }
  }

  async getStats(): Promise<KongCacheStats> {
    try {
      const client = await this.ensureConnected();

      const primaryKeys: string[] = [];
      let primaryCursor = "0";
      do {
        const result = (await client.send("SCAN", [
          primaryCursor,
          "MATCH",
          `${this.keyPrefix}*`,
          "COUNT",
          "100",
        ])) as [string, string[]];
        primaryCursor = result[0];
        const keys = Array.isArray(result[1]) ? result[1] : [];
        const nonStaleKeys = keys.filter((key) => !key.startsWith(this.staleKeyPrefix));
        primaryKeys.push(...nonStaleKeys);
      } while (primaryCursor !== "0");

      const staleKeys: string[] = [];
      let staleCursor = "0";
      do {
        const result = (await client.send("SCAN", [
          staleCursor,
          "MATCH",
          `${this.staleKeyPrefix}*`,
          "COUNT",
          "100",
        ])) as [string, string[]];
        staleCursor = result[0];
        const staleKeysInScan = Array.isArray(result[1]) ? result[1] : [];
        staleKeys.push(...staleKeysInScan);
      } while (staleCursor !== "0");

      const totalPrimaryEntries = primaryKeys.length;
      const sampleSize = Math.min(10, totalPrimaryEntries);
      const sampleKeys = primaryKeys.slice(0, sampleSize);
      let activeCount = 0;

      let ttlCheckErrors = 0;
      for (const key of sampleKeys) {
        try {
          const ttl = (await client.send("TTL", [key])) as number;
          if (ttl > 0) activeCount++;
        } catch {
          ttlCheckErrors++;
        }
      }
      if (ttlCheckErrors > 0) {
        telemetryEmitter.debug(
          SpanEvents.CACHE_OPERATION_FAILED,
          "Some TTL checks failed during stats collection",
          {
            component: "shared_redis_cache",
            operation: "getStats",
            ttl_check_errors: ttlCheckErrors,
            sample_size: sampleSize,
          }
        );
      }

      const activeRatio = totalPrimaryEntries > 0 ? activeCount / sampleSize : 0;
      const estimatedActive = Math.round(totalPrimaryEntries * activeRatio);
      const serverType = await this.getServerType();
      const primaryKeyNames = primaryKeys.map((key) => key.replace(this.keyPrefix, ""));

      return {
        strategy: "shared-redis",
        primary: {
          entries: totalPrimaryEntries,
          activeEntries: estimatedActive,
          keys: primaryKeyNames,
        },
        stale: {
          entries: staleKeys.length,
          keys: staleKeys.map((key) => key.replace(this.staleKeyPrefix, "")),
        },
        // Backward compatibility fields (aliases for primary cache values)
        size: totalPrimaryEntries,
        activeEntries: estimatedActive,
        hitRate: this.calculateHitRate(),
        redisConnected: true,
        averageLatencyMs: this.calculateAverageLatency(),
        serverType,
      };
    } catch (error) {
      telemetryEmitter.warn(SpanEvents.CACHE_OPERATION_FAILED, "Failed to get Redis stats", {
        error: error instanceof Error ? error.message : "Unknown error",
        component: "cache",
        operation: "stats_failed",
        client: "bun-native",
      });
      return {
        strategy: "shared-redis",
        primary: {
          entries: 0,
          activeEntries: 0,
        },
        stale: {
          entries: 0,
        },
        // Backward compatibility fields
        size: 0,
        activeEntries: 0,
        hitRate: "0.00",
        redisConnected: false,
        averageLatencyMs: 0,
      };
    }
  }

  async disconnect(): Promise<void> {
    if (this.healthMonitor) {
      this.healthMonitor.stop();
      this.healthMonitor = null;
    }

    const client = this.client;
    if (client) {
      try {
        await client.close();
      } catch (error) {
        telemetryEmitter.warn(SpanEvents.CACHE_OPERATION_FAILED, "Error during Redis disconnect", {
          error: error instanceof Error ? error.message : "Unknown error",
          component: "cache",
          operation: "disconnect_error",
          client: "bun-native",
        });
      }
      this.client = null;
      this.isConnected = false;
      this.scanIterator = null;
      recordRedisConnection(false);

      this.reconnectManager.reset();

      telemetryEmitter.info(SpanEvents.CACHE_DISCONNECTED, "Disconnected from Redis", {
        component: "cache",
        operation: "disconnection",
        strategy: "shared-redis",
        client: "bun-native",
      });
    }
  }

  private recordHit(latency: number): void {
    this.stats.hits++;
    this.stats.totalLatency += latency;
    this.stats.operations++;
    recordCacheOperation("hit", "redis");
  }

  private recordMiss(latency: number): void {
    this.stats.misses++;
    this.stats.totalLatency += latency;
    this.stats.operations++;
    recordCacheOperation("miss", "redis");
  }

  private calculateHitRate(): string {
    const total = this.stats.hits + this.stats.misses;
    if (total === 0) return "0.00";
    return ((this.stats.hits / total) * 100).toFixed(2);
  }

  private calculateAverageLatency(): number {
    return this.stats.operations > 0 ? this.stats.totalLatency / this.stats.operations : 0;
  }

  getClientForHealthCheck(): RedisClient | null {
    return this.client || null;
  }

  async getServerType(): Promise<"redis" | "valkey"> {
    try {
      const client = await this.ensureConnected();
      const info = (await client.send("INFO", ["server"])) as string;

      if (typeof info === "string" && info.toLowerCase().includes("valkey")) {
        return "valkey";
      }
      return "redis";
    } catch {
      return "redis";
    }
  }

  async getStale(key: string): Promise<ConsumerSecret | null> {
    if (!this.circuitBreaker.canExecute()) {
      telemetryEmitter.debug(
        SpanEvents.CACHE_CB_FAILURE,
        "GET_STALE operation blocked by circuit breaker",
        {
          component: "shared_redis_cache",
          operation: "get_stale_blocked",
          key,
          circuit_breaker_state: this.circuitBreaker.getState(),
        }
      );
      return null;
    }

    const staleRedisKey = this.staleKeyPrefix + key;
    const context: RedisOperationContext = {
      operation: "GET_STALE",
      key: staleRedisKey,
      connectionUrl: this.config.url,
      database: this.config.db,
    };

    const start = performance.now();

    return instrumentRedisOperation(context, async () => {
      const client = await this.ensureConnected();

      const cached = await withOperationTimeout(
        "GET",
        this.operationTimeouts.get,
        client.get(staleRedisKey)
      );

      if (cached) {
        this.recordHit(performance.now() - start);
        this.circuitBreaker.recordSuccess();
        telemetryEmitter.info(SpanEvents.CACHE_STALE_RETRIEVED, "Retrieved stale cache data", {
          key,
          component: "cache",
          operation: "get_stale_success",
          client: "bun-native",
        });
        const parsed = JSON.parse(cached);
        const validationResult = validateExternalData(ConsumerSecretLenientSchema, parsed, {
          source: "redis_cache",
          operation: "getStale",
          consumerId: key.replace("consumer_secret:", ""),
        });
        return (validationResult.data ?? parsed) as ConsumerSecret;
      }

      this.recordMiss(performance.now() - start);
      this.circuitBreaker.recordSuccess();
      return null;
    }).catch((error) => {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      if (isConnectionError(error)) {
        this.markConnectionBroken(error);
      }

      telemetryEmitter.warn(SpanEvents.CACHE_OPERATION_FAILED, "Redis get stale operation failed", {
        error: errorMessage,
        component: "cache",
        operation: "get_stale_failed",
        key,
        client: "bun-native",
        error_category: detectCacheError(error).category,
      });
      this.recordMiss(performance.now() - start);
      return null;
    });
  }

  async setStale(key: string, value: ConsumerSecret, _ttlSeconds?: number): Promise<void> {
    if (!this.circuitBreaker.canExecute()) {
      telemetryEmitter.debug(
        SpanEvents.CACHE_CB_FAILURE,
        "SET_STALE operation blocked by circuit breaker",
        {
          component: "shared_redis_cache",
          operation: "set_stale_blocked",
          key,
          circuit_breaker_state: this.circuitBreaker.getState(),
        }
      );
      return;
    }

    const staleRedisKey = this.staleKeyPrefix + key;
    const context: RedisOperationContext = {
      operation: "SET_STALE",
      key: staleRedisKey,
      connectionUrl: this.config.url,
      database: this.config.db,
    };

    return instrumentRedisOperation(context, async () => {
      const client = await this.ensureConnected();
      const staleTtlMinutes = this.config.staleDataToleranceMinutes || 30;
      const staleTtl = staleTtlMinutes * 60;

      await withOperationTimeout(
        "SET",
        this.operationTimeouts.set,
        (async () => {
          await client.set(staleRedisKey, JSON.stringify(value));
          await client.expire(staleRedisKey, staleTtl);
        })()
      );

      this.circuitBreaker.recordSuccess();
    }).catch((error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error));
      const errorMessage = err.message;

      if (isConnectionError(err)) {
        this.markConnectionBroken(err);
      }

      telemetryEmitter.warn(SpanEvents.CACHE_OPERATION_FAILED, "Redis set stale operation failed", {
        error: errorMessage,
        component: "cache",
        operation: "set_stale_failed",
        key,
        client: "bun-native",
        error_category: detectCacheError(err).category,
      });
    });
  }

  async clearStale(): Promise<void> {
    if (!this.circuitBreaker.canExecute()) {
      telemetryEmitter.debug(
        SpanEvents.CACHE_CB_FAILURE,
        "CLEAR_STALE operation blocked by circuit breaker",
        {
          component: "shared_redis_cache",
          operation: "clear_stale_blocked",
          circuit_breaker_state: this.circuitBreaker.getState(),
        }
      );
      return;
    }

    try {
      const client = await this.ensureConnected();

      if (this.scanIterator) {
        const { keys, stats } = await this.scanIterator.collectAll(`${this.staleKeyPrefix}*`);

        if (keys.length > 0) {
          const batchSize = 100;
          for (let i = 0; i < keys.length; i += batchSize) {
            const batch = keys.slice(i, i + batchSize);
            await withOperationTimeout(
              "DELETE",
              this.operationTimeouts.delete,
              client.del(...batch)
            );
          }
        }

        this.circuitBreaker.recordSuccess();

        telemetryEmitter.info(SpanEvents.CACHE_DELETE, "Cleared stale cache", {
          component: "cache",
          operation: "clear_stale_success",
          client: "bun-native",
          keys_deleted: keys.length,
          scan_iterations: stats.iterations,
          duration_ms: stats.durationMs,
        });
      } else {
        // Fallback to direct SCAN
        let cursor = "0";
        do {
          const result = (await client.send("SCAN", [
            cursor,
            "MATCH",
            `${this.staleKeyPrefix}*`,
            "COUNT",
            "100",
          ])) as [string, string[]];
          cursor = result[0];
          const keys = Array.isArray(result[1]) ? result[1] : [];

          if (keys.length > 0) {
            await client.del(...keys);
          }
        } while (cursor !== "0");

        this.circuitBreaker.recordSuccess();

        telemetryEmitter.info(SpanEvents.CACHE_DELETE, "Cleared stale cache", {
          component: "cache",
          operation: "clear_stale_success",
          client: "bun-native",
        });
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      const errorMessage = err.message;

      if (isConnectionError(err)) {
        this.markConnectionBroken(err);
      }

      telemetryEmitter.warn(
        SpanEvents.CACHE_OPERATION_FAILED,
        "Redis clear stale operation failed",
        {
          error: errorMessage,
          component: "cache",
          operation: "clear_stale_failed",
          client: "bun-native",
          error_category: detectCacheError(err).category,
        }
      );
    }
  }
  getResilienceStats(): {
    circuitBreaker: ReturnType<CacheCircuitBreaker["getStats"]>;
    reconnect: ReturnType<CacheReconnectManager["getStats"]>;
    health: ReturnType<CacheHealthMonitor["getState"]> | null;
  } {
    return {
      circuitBreaker: this.circuitBreaker.getStats(),
      reconnect: this.reconnectManager.getStats(),
      health: this.healthMonitor?.getState() ?? null,
    };
  }
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
    telemetryEmitter.info(SpanEvents.CACHE_CB_RECOVERED, "Circuit breaker manually reset", {
      component: "shared_redis_cache",
      operation: "circuit_breaker_reset",
    });
  }
}
