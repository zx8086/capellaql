// src/services/circuit-breaker.service.ts

import CircuitBreaker from "opossum";
import type {
  CachingConfig,
  CircuitBreakerConfig,
  ConsumerSecret,
  IKongCacheService,
  OperationCircuitBreakerConfig,
} from "../config/schemas";
import {
  recordCacheTierError,
  recordCacheTierLatency,
  recordCacheTierUsage,
  recordCircuitBreakerFallback,
  recordCircuitBreakerRejection,
  recordCircuitBreakerRequest,
  recordCircuitBreakerStateTransition,
} from "../telemetry/metrics";
import { SpanEvents, telemetryEmitter } from "../telemetry/tracer";
import type { OpossumCircuitBreakerStats } from "../types/circuit-breaker.types";

export type { OpossumCircuitBreakerStats } from "../types/circuit-breaker.types";

// Graceful degradation response types for circuit breaker fallback
type HealthCheckDegradedResponse = {
  healthy: false;
  responseTime: 0;
  error: string;
};

type GenericDegradedResponse = {
  status: "degraded";
  message: string;
  operation: string;
  timestamp: string;
};

type GracefulDegradationResponse = HealthCheckDegradedResponse | GenericDegradedResponse;

const DEFAULT_MAX_STALE_ENTRIES = 1000;

// TTL for unused circuit breakers (10 minutes) - breakers not used within this time will be cleaned up
const BREAKER_TTL_MS = 10 * 60 * 1000;
// Cleanup interval for expired breakers and stale cache entries (1 minute)
const CLEANUP_INTERVAL_MS = 60 * 1000;

export class KongCircuitBreakerService {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private staleCache?: Map<string, { data: ConsumerSecret; timestamp: number }>;
  private config: CircuitBreakerConfig & { highAvailability?: boolean };
  private readonly staleDataToleranceMinutes: number;
  private readonly staleDataToleranceMs: number;
  private readonly maxStaleEntries: number;
  private operationConfigs: Map<string, OperationCircuitBreakerConfig> = new Map();

  // Track last usage time for each breaker to enable TTL-based cleanup
  private lastUsed: Map<string, number> = new Map();
  // Cleanup interval IDs for proper shutdown
  private breakerCleanupIntervalId: ReturnType<typeof setInterval> | null = null;
  private staleCacheCleanupIntervalId: ReturnType<typeof setInterval> | null = null;
  // Flag to prevent cleanup race conditions during shutdown
  private isShuttingDown = false;
  // CPU optimization: Cache circuit breaker stats to reduce opossum status.js overhead
  // Profile analysis showed status.js consuming 1.6% CPU via frequent stats calculations
  private cachedStats: Record<string, OpossumCircuitBreakerStats> | null = null;
  private cachedStatsTimestamp = 0;
  private readonly statsCacheTtlMs = 5000; // Cache stats for 5 seconds

  constructor(
    config: CircuitBreakerConfig & { highAvailability?: boolean },
    cachingConfig: CachingConfig,
    private cacheService?: IKongCacheService
  ) {
    this.config = config;
    this.staleDataToleranceMinutes = cachingConfig.staleDataToleranceMinutes;
    this.staleDataToleranceMs = this.staleDataToleranceMinutes * 60 * 1000;
    this.maxStaleEntries = cachingConfig.maxMemoryEntries ?? DEFAULT_MAX_STALE_ENTRIES;

    this.initializeOperationConfigs();

    this.staleCache = new Map();

    // Start cleanup intervals to prevent memory leaks from accumulated breakers and stale entries
    this.startCleanupIntervals();
  }

  private startCleanupIntervals(): void {
    // Cleanup unused breakers every minute
    this.breakerCleanupIntervalId = setInterval(() => {
      this.cleanupUnusedBreakers();
    }, CLEANUP_INTERVAL_MS);

    // Cleanup expired stale cache entries every minute
    this.staleCacheCleanupIntervalId = setInterval(() => {
      this.cleanupExpiredStaleEntries();
    }, CLEANUP_INTERVAL_MS);
  }

  private cleanupUnusedBreakers(): void {
    // Guard against cleanup race conditions during shutdown
    if (this.isShuttingDown) return;

    const now = Date.now();
    const toRemove: string[] = [];

    for (const [name, timestamp] of this.lastUsed) {
      if (now - timestamp > BREAKER_TTL_MS) {
        toRemove.push(name);
      }
    }

    for (const name of toRemove) {
      const breaker = this.breakers.get(name);
      if (breaker) {
        breaker.shutdown();
        this.breakers.delete(name);
        this.lastUsed.delete(name);

        telemetryEmitter.debug(
          "circuit_breaker.cleanup.ttl",
          "Cleaned up unused circuit breaker (TTL expired)",
          {
            component: "circuit_breaker",
            action: "breaker_ttl_cleanup",
            operation: name,
            ttl_minutes: BREAKER_TTL_MS / 60000,
            remaining_breakers: this.breakers.size,
          }
        );
      }
    }
  }

  private cleanupExpiredStaleEntries(): void {
    // Guard against cleanup race conditions during shutdown
    if (this.isShuttingDown) return;
    if (!this.staleCache) return;

    const now = Date.now();
    const toRemove: string[] = [];

    for (const [key, entry] of this.staleCache) {
      if (now - entry.timestamp > this.staleDataToleranceMs) {
        toRemove.push(key);
      }
    }

    for (const key of toRemove) {
      this.staleCache.delete(key);
    }

    if (toRemove.length > 0) {
      telemetryEmitter.debug(
        "circuit_breaker.cleanup.stale_cache",
        "Cleaned up expired stale cache entries (TTL)",
        {
          component: "circuit_breaker",
          action: "stale_cache_ttl_cleanup",
          removed_count: toRemove.length,
          remaining_entries: this.staleCache.size,
          tolerance_minutes: this.staleDataToleranceMinutes,
        }
      );
    }
  }

  private initializeOperationConfigs(): void {
    const defaultConfigs: Record<string, OperationCircuitBreakerConfig> = {
      getConsumerSecret: {
        timeout: 3000,
        errorThresholdPercentage: 50,
        resetTimeout: 60000,
        fallbackStrategy: "cache",
      },
      createConsumerSecret: {
        timeout: 5000,
        errorThresholdPercentage: 30,
        resetTimeout: 120000,
        fallbackStrategy: "deny",
      },
      healthCheck: {
        timeout: 1000,
        errorThresholdPercentage: 75,
        resetTimeout: 10000,
        fallbackStrategy: "graceful_degradation",
      },
    };

    for (const [operation, opConfig] of Object.entries(defaultConfigs)) {
      this.operationConfigs.set(operation, opConfig);
    }

    if (this.config.operations) {
      for (const [operation, overrides] of Object.entries(this.config.operations)) {
        const existing = this.operationConfigs.get(operation) || {};
        this.operationConfigs.set(operation, { ...existing, ...overrides });
      }
    }
  }

  private getOrCreateBreaker<T>(operation: string): CircuitBreaker<[() => Promise<T>], T> {
    // Track usage time for TTL-based cleanup
    this.lastUsed.set(operation, Date.now());

    if (!this.breakers.has(operation)) {
      const operationConfig = this.operationConfigs.get(operation);

      const circuitBreakerOptions = {
        timeout: operationConfig?.timeout ?? this.config.timeout,
        errorThresholdPercentage:
          operationConfig?.errorThresholdPercentage ?? this.config.errorThresholdPercentage,
        resetTimeout: operationConfig?.resetTimeout ?? this.config.resetTimeout,
        rollingCountTimeout:
          operationConfig?.rollingCountTimeout ?? this.config.rollingCountTimeout,
        rollingCountBuckets:
          operationConfig?.rollingCountBuckets ?? this.config.rollingCountBuckets,
        volumeThreshold: operationConfig?.volumeThreshold ?? this.config.volumeThreshold,
        name: operation,
      };

      const actionWrapper = async (action: () => Promise<T>): Promise<T> => action();
      const breaker = new CircuitBreaker(actionWrapper, circuitBreakerOptions);

      breaker.on("open", () => {
        // Invalidate stats cache on state change so getStats() returns fresh state
        this.cachedStats = null;
        telemetryEmitter.warn(SpanEvents.CB_STATE_OPEN, `Circuit breaker opened for ${operation}`, {
          operation,
          component: "circuit_breaker",
          previous_state: "closed",
          state: "open",
        });
        recordCircuitBreakerStateTransition(operation, "closed", "open");
      });

      breaker.on("halfOpen", () => {
        // Invalidate stats cache on state change so getStats() returns fresh state
        this.cachedStats = null;
        telemetryEmitter.info(
          SpanEvents.CB_STATE_HALF_OPEN,
          `Circuit breaker half-open for ${operation}`,
          {
            operation,
            component: "circuit_breaker",
            previous_state: "open",
            state: "half_open",
          }
        );
        recordCircuitBreakerStateTransition(operation, "open", "half-open");
      });

      breaker.on("close", () => {
        // Invalidate stats cache on state change so getStats() returns fresh state
        this.cachedStats = null;
        telemetryEmitter.info(
          SpanEvents.CB_STATE_CLOSED,
          `Circuit breaker closed for ${operation}`,
          {
            operation,
            component: "circuit_breaker",
            previous_state: "half_open",
            state: "closed",
          }
        );
        recordCircuitBreakerStateTransition(operation, "half-open", "closed");
      });

      breaker.on("reject", () => {
        telemetryEmitter.warn(
          SpanEvents.CB_REQUEST_REJECTED,
          `Circuit breaker rejected request for ${operation}`,
          {
            operation,
            component: "circuit_breaker",
            action: "reject",
            reason: "circuit_open",
          }
        );
        recordCircuitBreakerRejection(operation, "circuit_open");
      });

      breaker.on("timeout", () => {
        telemetryEmitter.warn(SpanEvents.CB_TIMEOUT, `Circuit breaker timeout for ${operation}`, {
          operation,
          component: "circuit_breaker",
          action: "timeout",
        });
        recordCircuitBreakerRejection(operation, "timeout");
      });

      this.breakers.set(operation, breaker);
      // Invalidate stats cache when new breaker is created so getStats() includes it
      this.cachedStats = null;
    }
    const breaker = this.breakers.get(operation);
    if (!breaker) {
      throw new Error(`Circuit breaker not found for operation: ${operation}`);
    }
    return breaker as CircuitBreaker<[() => Promise<T>], T>;
  }

  async wrapKongOperation<T>(
    operation: string,
    action: () => Promise<T>,
    fallbackData?: T
  ): Promise<T | null> {
    if (!this.config.enabled) {
      return await action();
    }

    const breaker = this.getOrCreateBreaker<T>(operation);

    try {
      const result = await breaker.fire(action);
      recordCircuitBreakerRequest(operation, "closed");
      return result;
    } catch (error) {
      telemetryEmitter.warn(
        SpanEvents.CB_FAILURE,
        `Circuit breaker operation failed for ${operation}`,
        {
          operation,
          error: error instanceof Error ? error.message : "Unknown error",
          component: "circuit_breaker",
          action: "operation_failed",
        }
      );

      if (breaker.opened) {
        return this.handleOpenCircuit(operation, fallbackData);
      }

      recordCircuitBreakerRequest(operation, "open");
      return null;
    }
  }

  async wrapKongConsumerOperation(
    operation: string,
    consumerId: string,
    action: () => Promise<ConsumerSecret | null>
  ): Promise<ConsumerSecret | null> {
    if (!this.config.enabled) {
      return await action();
    }

    const breaker = this.getOrCreateBreaker<ConsumerSecret | null>(operation);
    const cacheKey = `consumer_secret:${consumerId}`;

    try {
      const result = await breaker.fire(action);
      recordCircuitBreakerRequest(operation, "closed");

      if (result) {
        if (result.consumer && result.consumer.id !== consumerId) {
          telemetryEmitter.error(
            SpanEvents.KONG_CONSUMER_MISMATCH,
            `Consumer ID mismatch in Kong response, not caching`,
            {
              operation,
              requested_consumer_id: consumerId,
              response_consumer_id: result.consumer.id,
              cache_key: cacheKey,
              component: "circuit_breaker",
              action: "consumer_id_mismatch",
            }
          );
          return null;
        }
        this.updateStaleCache(cacheKey, result);
      } else if (this.staleCache) {
        this.staleCache.delete(cacheKey);
      }

      return result;
    } catch (error) {
      telemetryEmitter.warn(
        SpanEvents.CB_FAILURE,
        `Circuit breaker consumer operation failed for ${operation}`,
        {
          operation,
          consumer_id: consumerId,
          error: error instanceof Error ? error.message : "Unknown error",
          component: "circuit_breaker",
          action: "consumer_operation_failed",
        }
      );

      if (breaker.opened) {
        return await this.handleOpenCircuitWithStaleData(operation, cacheKey, consumerId);
      }

      recordCircuitBreakerRequest(operation, "open");
      return null;
    }
  }

  private handleOpenCircuit<T>(operation: string, fallbackData?: T): T | null {
    const operationConfig = this.operationConfigs.get(operation);
    const fallbackStrategy = operationConfig?.fallbackStrategy || "deny";

    recordCircuitBreakerFallback(operation, "circuit_open");

    switch (fallbackStrategy) {
      case "graceful_degradation":
        return this.handleGracefulDegradation(operation) as T;
      case "deny":
        telemetryEmitter.warn(
          SpanEvents.CB_REQUEST_REJECTED,
          `Circuit breaker open, denying request for ${operation}`,
          {
            operation,
            component: "circuit_breaker",
            action: "deny_fallback",
            fallback_strategy: "deny",
          }
        );
        recordCircuitBreakerRequest(operation, "open");
        return null;
      default:
        if (fallbackData !== undefined) {
          telemetryEmitter.info(
            SpanEvents.CB_FALLBACK_USED,
            `Using fallback data for ${operation}`,
            {
              operation,
              component: "circuit_breaker",
              action: "fallback_data",
              fallback_strategy: "cache",
            }
          );
          recordCircuitBreakerRequest(operation, "half_open");
          return fallbackData;
        }

        telemetryEmitter.warn(SpanEvents.CB_FAILURE, `No fallback available for ${operation}`, {
          operation,
          component: "circuit_breaker",
          action: "no_fallback",
          fallback_strategy: fallbackStrategy,
        });
        recordCircuitBreakerRequest(operation, "open");
        return null;
    }
  }

  private handleGracefulDegradation(operation: string): GracefulDegradationResponse {
    telemetryEmitter.info(
      SpanEvents.CB_FALLBACK_USED,
      `Using graceful degradation for ${operation}`,
      {
        operation,
        component: "circuit_breaker",
        action: "graceful_degradation",
        fallback_strategy: "graceful_degradation",
      }
    );

    recordCircuitBreakerRequest(operation, "half_open");

    switch (operation) {
      case "healthCheck":
        return {
          healthy: false,
          responseTime: 0,
          error: "Circuit breaker open - Kong Admin API unavailable",
        };
      default:
        return {
          status: "degraded",
          message: "Service temporarily unavailable",
          operation,
          timestamp: new Date().toISOString(),
        };
    }
  }

  private async handleOpenCircuitWithStaleData(
    operation: string,
    cacheKey: string,
    consumerId: string
  ): Promise<ConsumerSecret | null> {
    const operationConfig = this.operationConfigs.get(operation);
    const fallbackStrategy = operationConfig?.fallbackStrategy || "deny";

    if (fallbackStrategy === "deny") {
      telemetryEmitter.warn(
        SpanEvents.CB_REQUEST_REJECTED,
        `Circuit breaker open, denying consumer operation for ${operation}`,
        {
          operation,
          consumer_id: consumerId,
          component: "circuit_breaker",
          action: "deny_consumer_operation",
          fallback_strategy: "deny",
        }
      );
      recordCircuitBreakerRequest(operation, "open");
      return null;
    }

    if (fallbackStrategy === "graceful_degradation") {
      telemetryEmitter.info(
        SpanEvents.CB_FALLBACK_USED,
        `Circuit breaker open, graceful degradation for ${operation}`,
        {
          operation,
          consumer_id: consumerId,
          component: "circuit_breaker",
          action: "graceful_degradation_consumer_operation",
          fallback_strategy: "graceful_degradation",
        }
      );
      recordCircuitBreakerRequest(operation, "half_open");
      return null;
    }

    // HA Mode: Try Redis stale cache first
    if (this.config.highAvailability && this.cacheService) {
      const start = performance.now();
      try {
        const extractedKey = this.extractKeyFromCacheKey(cacheKey);
        const redisStale = await this.cacheService.getStale?.(extractedKey);

        if (redisStale) {
          if (redisStale.consumer && redisStale.consumer.id !== consumerId) {
            telemetryEmitter.error(
              SpanEvents.KONG_CONSUMER_MISMATCH,
              `Cache pollution detected: cached consumer ID mismatch`,
              {
                operation,
                requested_consumer_id: consumerId,
                cached_consumer_id: redisStale.consumer.id,
                cache_key: cacheKey,
                extracted_key: extractedKey,
                component: "circuit_breaker",
                action: "cache_pollution_detected",
                tier: "redis-stale",
              }
            );
            recordCacheTierError("redis-stale", operation, "cache_pollution");
            return null;
          }

          const latency = performance.now() - start;
          recordCacheTierUsage("redis-stale", operation);
          recordCacheTierLatency("redis-stale", operation, latency);

          telemetryEmitter.info(
            SpanEvents.CB_FALLBACK_USED,
            `Using Redis stale cache data for ${operation}`,
            {
              operation,
              cache_key: cacheKey,
              consumer_id: consumerId,
              cached_consumer_id: redisStale.consumer?.id,
              latency_ms: latency,
              component: "circuit_breaker",
              action: "redis_stale_fallback",
              tier: "redis-stale",
            }
          );

          recordCircuitBreakerFallback(operation, "redis_stale_cache");
          recordCircuitBreakerRequest(operation, "half_open");
          return redisStale;
        }
      } catch (error) {
        const latency = performance.now() - start;
        recordCacheTierError("redis-stale", operation, "access_error");
        recordCacheTierLatency("redis-stale", operation, latency);

        telemetryEmitter.warn(
          SpanEvents.CACHE_OPERATION_FAILED,
          `Redis stale cache access failed for ${operation}`,
          {
            operation,
            cache_key: cacheKey,
            consumer_id: consumerId,
            error: error instanceof Error ? error.message : "Unknown error",
            latency_ms: latency,
            component: "circuit_breaker",
            action: "redis_stale_error",
            tier: "redis-stale",
          }
        );
      }
    }

    const start = performance.now();
    const inMemoryStale = this.getStaleData(cacheKey);
    if (inMemoryStale) {
      if (inMemoryStale.data.consumer && inMemoryStale.data.consumer.id !== consumerId) {
        telemetryEmitter.error(
          SpanEvents.KONG_CONSUMER_MISMATCH,
          `Cache pollution detected: cached consumer ID mismatch`,
          {
            operation,
            requested_consumer_id: consumerId,
            cached_consumer_id: inMemoryStale.data.consumer.id,
            cache_key: cacheKey,
            component: "circuit_breaker",
            action: "cache_pollution_detected",
            tier: this.config.highAvailability ? "in-memory-fallback" : "in-memory",
          }
        );
        recordCacheTierError(
          this.config.highAvailability ? "in-memory-fallback" : "in-memory",
          operation,
          "cache_pollution"
        );
        this.staleCache?.delete(cacheKey);
        return null;
      }

      const latency = performance.now() - start;
      const tierName = this.config.highAvailability ? "in-memory-fallback" : "in-memory";
      recordCacheTierUsage(tierName, operation);
      recordCacheTierLatency(tierName, operation, latency);

      telemetryEmitter.info(
        SpanEvents.CB_FALLBACK_USED,
        `Using in-memory stale cache data for ${operation}${this.config.highAvailability ? " (HA fallback)" : ""}`,
        {
          operation,
          cache_key: cacheKey,
          consumer_id: consumerId,
          cached_consumer_id: inMemoryStale.data.consumer?.id,
          stale_age_minutes: Math.floor((Date.now() - inMemoryStale.timestamp) / 60000),
          latency_ms: latency,
          component: "circuit_breaker",
          action: this.config.highAvailability
            ? "in_memory_ha_fallback"
            : "in_memory_stale_fallback",
          tier: tierName,
          ha_mode: this.config.highAvailability,
        }
      );

      recordCircuitBreakerFallback(
        operation,
        this.config.highAvailability ? "in_memory_ha_fallback" : "in_memory_stale_cache"
      );
      recordCircuitBreakerRequest(operation, "half_open");
      return inMemoryStale.data;
    }

    telemetryEmitter.warn(
      SpanEvents.CB_FAILURE,
      `Circuit breaker open, no cache fallback available`,
      {
        operation,
        original_consumer_id: consumerId,
        component: "circuit_breaker",
        action: "no_fallback_available",
        ha_mode: this.config.highAvailability,
      }
    );

    recordCircuitBreakerRequest(operation, "open");
    return null;
  }

  private extractKeyFromCacheKey(cacheKey: string): string {
    return cacheKey;
  }

  private updateStaleCache(key: string, data: ConsumerSecret): void {
    if (this.staleCache) {
      this.staleCache.set(key, {
        data,
        timestamp: Date.now(),
      });

      this.enforceMaxStaleEntries();
    }
  }

  private enforceMaxStaleEntries(): void {
    if (!this.staleCache || this.staleCache.size <= this.maxStaleEntries) {
      return;
    }

    // Sort entries by timestamp (oldest first) for LRU eviction
    const entries = Array.from(this.staleCache.entries()).sort(
      ([, a], [, b]) => a.timestamp - b.timestamp
    );

    // Remove oldest entries to get back to maxStaleEntries
    const toRemove = entries.slice(0, this.staleCache.size - this.maxStaleEntries);
    for (const [key] of toRemove) {
      this.staleCache.delete(key);
    }

    if (toRemove.length > 0) {
      telemetryEmitter.debug(SpanEvents.CB_CACHE_CLEARED, "Evicted stale cache entries (LRU)", {
        component: "circuit_breaker",
        action: "stale_cache_eviction",
        evicted_count: toRemove.length,
        current_size: this.staleCache.size,
        max_entries: this.maxStaleEntries,
        ha_mode: this.config.highAvailability,
      });
    }
  }

  private getStaleData(key: string): { data: ConsumerSecret; timestamp: number } | null {
    if (!this.staleCache) return null;

    const cached = this.staleCache.get(key);
    if (!cached) return null;

    const ageMinutes = (Date.now() - cached.timestamp) / 60000;
    if (ageMinutes > this.staleDataToleranceMinutes) {
      this.staleCache.delete(key);
      return null;
    }

    return cached;
  }

  getStats(): Record<string, OpossumCircuitBreakerStats> {
    const now = Date.now();

    // Return cached stats if still valid (within TTL)
    if (this.cachedStats && now - this.cachedStatsTimestamp < this.statsCacheTtlMs) {
      return this.cachedStats;
    }

    // Rebuild stats from all breakers
    const stats: Record<string, OpossumCircuitBreakerStats> = {};

    for (const [operation, breaker] of this.breakers) {
      const breakerStats = breaker.stats;
      const state = breaker.opened ? "open" : breaker.halfOpen ? "half-open" : "closed";

      stats[operation] = {
        state,
        stats: {
          fires: breakerStats.fires,
          rejections: breakerStats.rejects,
          timeouts: breakerStats.timeouts,
          failures: breakerStats.failures,
          successes: breakerStats.successes,
          fallbacks: breakerStats.fallbacks,
          semaphoreRejections: breakerStats.semaphoreRejections,
          percentiles: breakerStats.percentiles,
        },
      };
    }

    // Update cache
    this.cachedStats = stats;
    this.cachedStatsTimestamp = now;

    return stats;
  }

  clearStaleCache(): void {
    if (this.staleCache) {
      this.staleCache.clear();
      telemetryEmitter.info(SpanEvents.CB_CACHE_CLEARED, "Cleared circuit breaker stale cache", {
        component: "circuit_breaker",
        action: "cache_cleared",
        cache_mode: this.config.highAvailability ? "in-memory-fallback" : "in-memory",
        ha_mode: this.config.highAvailability,
      });
    }
  }

  getStaleDataInfo(): Array<{ key: string; ageMinutes: number }> {
    const info: Array<{ key: string; ageMinutes: number }> = [];

    if (!this.staleCache) {
      return info;
    }

    const now = Date.now();
    for (const [key, cached] of this.staleCache) {
      const ageMinutes = Math.floor((now - cached.timestamp) / 60000);
      info.push({ key, ageMinutes });
    }

    return info;
  }

  shutdown(): void {
    // Set shutdown flag first to prevent cleanup race conditions
    this.isShuttingDown = true;

    // Clear cleanup intervals to prevent memory leaks
    if (this.breakerCleanupIntervalId) {
      clearInterval(this.breakerCleanupIntervalId);
      this.breakerCleanupIntervalId = null;
    }
    if (this.staleCacheCleanupIntervalId) {
      clearInterval(this.staleCacheCleanupIntervalId);
      this.staleCacheCleanupIntervalId = null;
    }

    // Shutdown all breakers
    for (const breaker of this.breakers.values()) {
      breaker.shutdown();
    }
    this.breakers.clear();
    this.lastUsed.clear();

    if (this.staleCache) {
      this.staleCache.clear();
    }
  }
}
