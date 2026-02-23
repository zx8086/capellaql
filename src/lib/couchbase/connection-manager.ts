/* src/lib/couchbase/connection-manager.ts */

/**
 * Production-Grade Couchbase Connection Manager
 *
 * ALL PRIORITY FIXES INTEGRATED:
 * HIGH PRIORITY:
 *   - SDK error types with instanceof checks
 *   - Bucket readiness verification via getAllScopes()
 *   - diagnostics() for health checks
 *   - ping() with ServiceType.KeyValue, ServiceType.Query
 *   - Error classification (retryable vs permanent)
 *
 * MEDIUM PRIORITY:
 *   - Prepared statements
 *   - Query context
 *   - Subdocument operations
 *   - CAS conflict handling
 *   - Durability levels
 *   - Field projection
 *
 * LOW PRIORITY:
 *   - Compression enabled
 *   - Threshold logging
 *   - Collection caching
 *   - Orphan response logging
 *   - DNS SRV support
 */

import { type Bucket, type Cluster, type Collection, connect, type Scope, ServiceType } from "couchbase";
import { err, log, warn } from "../../telemetry/logger";
import { type CircuitBreaker, createCouchbaseCircuitBreaker } from "./circuit-breaker";
import { loadCouchbaseConfig, parseConnectionString, validateProductionConfig } from "./config";
import { buildConnectionOptions } from "./connection-options";
import {
  AuthenticationFailureError,
  CasMismatchError,
  CouchbaseError,
  CouchbaseErrorClassifier,
  DocumentNotFoundError,
  TemporaryFailureError,
  TimeoutError,
} from "./errors";
import type { ConnectionMetrics, CouchbaseConfig, CouchbaseConnection, HealthStatus, RetryContext } from "./types";

// =============================================================================
// CONNECTION MANAGER CLASS
// =============================================================================

/**
 * Production-ready Couchbase connection manager with SDK best practices.
 * Singleton pattern ensures single connection across the application.
 */
export class CouchbaseConnectionManager {
  private static instance: CouchbaseConnectionManager | null = null;

  private cluster: Cluster | null = null;
  private bucket: Bucket | null = null;
  private connectionPromise: Promise<Cluster> | null = null;
  private config: CouchbaseConfig | null = null;

  // LOW PRIORITY FIX: Collection caching
  private collections: Map<string, Collection> = new Map();

  private isHealthy = false;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private connectionAttempts = 0;
  private isClosing = false;

  private circuitBreaker: CircuitBreaker;

  private metrics: ConnectionMetrics = {
    totalConnections: 0,
    failedConnections: 0,
    successfulConnections: 0,
    totalQueries: 0,
    failedQueries: 0,
    avgQueryTime: 0,
    lastConnectionTime: null,
    lastQueryTime: null,
    circuitBreakerState: "closed",
  };

  private constructor() {
    this.circuitBreaker = createCouchbaseCircuitBreaker();
  }

  /**
   * Get singleton instance.
   */
  public static getInstance(): CouchbaseConnectionManager {
    if (!CouchbaseConnectionManager.instance) {
      CouchbaseConnectionManager.instance = new CouchbaseConnectionManager();
    }
    return CouchbaseConnectionManager.instance;
  }

  // =============================================================================
  // INITIALIZATION
  // =============================================================================

  /**
   * Initialize connection with bucket readiness verification.
   */
  public async initialize(config?: CouchbaseConfig): Promise<void> {
    // Load config if not provided
    const effectiveConfig = config || loadCouchbaseConfig();

    // Validate production config
    validateProductionConfig(effectiveConfig);

    if (this.connectionPromise) {
      await this.connectionPromise;
      return;
    }

    if (this.cluster && this.config?.connectionString === effectiveConfig.connectionString) {
      log("Couchbase already initialized, reusing connection", { component: "couchbase", operation: "initialize" });
      return;
    }

    this.config = effectiveConfig;
    this.connectionPromise = this.createConnection(effectiveConfig);

    try {
      this.cluster = await this.connectionPromise;

      // Open bucket (SDK handles connection readiness internally)
      this.bucket = this.cluster.bucket(effectiveConfig.bucketName);

      // Verify bucket is accessible by getting scopes
      log("Couchbase verifying bucket access", { component: "couchbase", operation: "bucket_verify" });
      await this.waitForBucketReady(this.bucket, 5000);

      this.isHealthy = true;
      this.connectionAttempts = 0;
      this.metrics.successfulConnections++;
      this.metrics.lastConnectionTime = new Date();

      log("Couchbase connection initialized successfully", { component: "couchbase", operation: "connection_ready" });

      // Start health monitoring with SDK diagnostics
      this.startHealthMonitoring();
    } catch (error) {
      this.metrics.failedConnections++;
      this.isHealthy = false;

      const errorContext = CouchbaseErrorClassifier.extractContext(error, "initialize");
      err("Couchbase initialization failed", {
        component: "couchbase",
        operation: "initialize",
        ...errorContext,
        attempt: this.connectionAttempts,
      });

      throw error;
    } finally {
      this.connectionPromise = null;
    }
  }

  /**
   * Create cluster connection with retry logic.
   */
  private async createConnection(config: CouchbaseConfig): Promise<Cluster> {
    const maxAttempts = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.connectionAttempts = attempt;

      try {
        log("Couchbase connection attempt", { component: "couchbase", operation: "connect", attempt, maxAttempts });

        const startTime = typeof Bun !== "undefined" ? Bun.nanoseconds() : performance.now() * 1_000_000;

        // Parse connection string
        const connectionMeta = parseConnectionString(config.connectionString);

        // LOW PRIORITY FIX: Build options with all SDK features
        const options = buildConnectionOptions(config, connectionMeta);

        // Connect to cluster
        const cluster = await connect(config.connectionString, options);

        const endTime = typeof Bun !== "undefined" ? Bun.nanoseconds() : performance.now() * 1_000_000;
        const connectTime = (endTime - startTime) / 1_000_000;

        log("Couchbase connected", {
          component: "couchbase",
          operation: "connected",
          durationMs: connectTime.toFixed(2),
        });

        this.metrics.totalConnections++;
        return cluster;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on authentication errors
        if (CouchbaseErrorClassifier.isAuthError(error)) {
          err("Couchbase authentication failed - not retrying", { component: "couchbase", operation: "connect" });
          throw lastError;
        }

        if (attempt < maxAttempts) {
          const delayMs = this.calculateBackoff(attempt);
          log("Couchbase connection retry scheduled", { component: "couchbase", operation: "retry", delayMs });
          await this.sleep(delayMs);
        }
      }
    }

    throw new Error(`Failed to connect after ${maxAttempts} attempts: ${lastError?.message}`);
  }

  /**
   * HIGH PRIORITY FIX: Wait for bucket ready using collections API.
   */
  private async waitForBucketReady(bucket: Bucket, timeoutMs: number): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        // SDK BEST PRACTICE: Use collections API to verify bucket readiness
        await bucket.collections().getAllScopes();
        log("Couchbase bucket is ready", { component: "couchbase", operation: "bucket_ready" });
        return;
      } catch {
        await this.sleep(500);
      }
    }

    throw new Error(`Bucket '${bucket.name}' not ready after ${timeoutMs}ms`);
  }

  // =============================================================================
  // HEALTH MONITORING
  // =============================================================================

  /**
   * HIGH PRIORITY FIX: Start health monitoring with diagnostics().
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    const intervalMs = 60000; // 60 seconds
    log("Couchbase starting health monitoring", {
      component: "couchbase",
      operation: "health_monitor_start",
      intervalMs,
    });

    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.getHealthWithDiagnostics();
        this.isHealthy = health.status === "healthy" || health.status === "degraded";
        this.lastHealthCheck = new Date();

        if (!this.isHealthy && this.config) {
          warn("Couchbase unhealthy connection detected", { component: "couchbase", operation: "health_check" });
        }
      } catch (error) {
        err("Couchbase health check failed", {
          component: "couchbase",
          operation: "health_check",
          error: String(error),
        });
        this.isHealthy = false;
      }
    }, intervalMs);
  }

  /**
   * HIGH PRIORITY FIX: Ping with specific service types.
   */
  public async ping(): Promise<HealthStatus> {
    if (!this.cluster) {
      return {
        status: "disconnected",
        timestamp: Date.now(),
        details: { reason: "No cluster connection" },
      };
    }

    try {
      const startTime = typeof Bun !== "undefined" ? Bun.nanoseconds() : performance.now() * 1_000_000;

      // SDK BEST PRACTICE: Ping specific services
      const pingResult = await this.cluster.ping({
        serviceTypes: [ServiceType.KeyValue, ServiceType.Query],
        timeout: 5000,
      });

      const endTime = typeof Bun !== "undefined" ? Bun.nanoseconds() : performance.now() * 1_000_000;
      const latency = (endTime - startTime) / 1_000_000;

      // Analyze ping results
      const serviceHealth = new Map<string, boolean>();

      for (const [serviceType, endpoints] of Object.entries(pingResult.services || {})) {
        const hasHealthyEndpoint = (endpoints as any[]).some(
          (ep: any) => ep.state === 0 || ep.state === "ok" || ep.latency > 0
        );
        serviceHealth.set(serviceType, hasHealthyEndpoint);
      }

      const allHealthy = Array.from(serviceHealth.values()).every((h) => h);

      return {
        status: allHealthy ? "healthy" : "degraded",
        timestamp: Date.now(),
        details: {
          latency,
          services: Object.fromEntries(serviceHealth),
        },
      };
    } catch (error) {
      const errorContext = CouchbaseErrorClassifier.extractContext(error, "ping");

      return {
        status: "unhealthy",
        timestamp: Date.now(),
        error: errorContext.message,
        details: {
          errorType: errorContext.errorName,
          retryable: errorContext.isRetryable,
        },
      };
    }
  }

  /**
   * HIGH PRIORITY FIX: Use bucket-level ping() for comprehensive health.
   *
   * SDK Best Practice (from Couchbase docs):
   * - ping() is ACTIVE polling - gives real-time status
   * - diagnostics() is PASSIVE - may return stale/empty data
   * - "If you want to make sure the key-value service is included,
   *    perform ping at the bucket level."
   *
   * For Capella cloud clusters, bucket.ping() is preferred over cluster.diagnostics()
   * because diagnostics() may return empty services for cloud deployments.
   */
  public async getHealthWithDiagnostics(): Promise<HealthStatus> {
    if (!this.cluster || !this.bucket) {
      return {
        status: "disconnected",
        timestamp: Date.now(),
        details: { reason: "No cluster or bucket connection" },
      };
    }

    try {
      // SDK BEST PRACTICE: Use bucket-level ping for Capella
      // This ensures KV service is included and gives real-time status
      const pingResult = await this.bucket.ping({
        serviceTypes: [ServiceType.KeyValue, ServiceType.Query],
        timeout: 5000,
      });

      let healthyCount = 0;
      let totalCount = 0;

      // Track per-service health
      const serviceHealth: Record<string, { healthy: boolean; endpoints: number; healthyEndpoints: number }> = {};

      for (const [serviceType, endpoints] of Object.entries(pingResult.services || {})) {
        let serviceHealthyCount = 0;
        const serviceEndpoints = endpoints as any[];

        for (const endpoint of serviceEndpoints) {
          totalCount++;
          // Ping returns state as enum or string: 0/"ok" means healthy
          // Also check latency > 0 as secondary indicator
          if (endpoint.state === 0 || endpoint.state === "ok" || (endpoint.latency && endpoint.latency > 0)) {
            healthyCount++;
            serviceHealthyCount++;
          }
        }

        // Map SDK service type names to expected format (kv, n1ql/query, fts/search)
        const normalizedServiceType = serviceType.toLowerCase();
        serviceHealth[normalizedServiceType] = {
          healthy: serviceHealthyCount > 0,
          endpoints: serviceEndpoints.length,
          healthyEndpoints: serviceHealthyCount,
        };
      }

      const healthPercentage = totalCount > 0 ? (healthyCount / totalCount) * 100 : 0;

      let status: HealthStatus["status"];
      if (totalCount === 0) {
        // If ping returned no endpoints, fall back to connection state
        // This shouldn't happen with bucket-level ping, but handle defensively
        status = this.bucket && this.cluster && this.isHealthy ? "healthy" : "unhealthy";
      } else if (healthPercentage === 100) {
        status = "healthy";
      } else if (healthPercentage >= 50) {
        status = "degraded";
      } else {
        status = "unhealthy";
      }

      return {
        status,
        timestamp: Date.now(),
        details: {
          diagnosticsId: pingResult.id,
          healthyEndpoints: healthyCount,
          totalEndpoints: totalCount,
          healthPercentage: Math.round(healthPercentage),
          circuitBreaker: this.circuitBreaker.getStats(),
          serviceHealth,
        },
      };
    } catch (error) {
      const errorContext = CouchbaseErrorClassifier.extractContext(error, "ping");

      return {
        status: "unhealthy",
        timestamp: Date.now(),
        error: errorContext.message,
        details: errorContext,
      };
    }
  }

  // =============================================================================
  // CONNECTION ACCESS
  // =============================================================================

  /**
   * LOW PRIORITY FIX: Get or create cached collection.
   */
  public getCollection(bucketName?: string, scopeName?: string, collectionName?: string): Collection {
    if (!this.bucket || !this.cluster) {
      throw new Error("Couchbase not initialized");
    }

    const bucket = bucketName || this.config?.bucketName || this.bucket.name;
    const scope = scopeName || this.config?.scopeName || "_default";
    const collection = collectionName || this.config?.collectionName || "_default";

    const cacheKey = `${bucket}::${scope}::${collection}`;

    if (this.collections.has(cacheKey)) {
      return this.collections.get(cacheKey)!;
    }

    const collectionRef = this.cluster.bucket(bucket).scope(scope).collection(collection);

    this.collections.set(cacheKey, collectionRef);

    return collectionRef;
  }

  /**
   * Get scope reference.
   */
  public getScope(bucketName?: string, scopeName?: string): Scope {
    if (!this.cluster) {
      throw new Error("Couchbase not initialized");
    }

    const bucket = bucketName || this.config?.bucketName || this.bucket?.name;
    const scope = scopeName || this.config?.scopeName || "_default";

    if (!bucket) {
      throw new Error("No bucket specified");
    }

    return this.cluster.bucket(bucket).scope(scope);
  }

  /**
   * Get connection with all features.
   */
  public async getConnection(): Promise<CouchbaseConnection> {
    if (!this.cluster || !this.bucket || !this.config) {
      throw new Error("Couchbase not initialized. Call initialize() first.");
    }

    const circuitState = this.circuitBreaker.getState();
    if (circuitState === "open") {
      throw new Error("Circuit breaker is OPEN - database temporarily unavailable");
    }

    return {
      cluster: this.cluster,
      bucket: (name?: string) => this.cluster!.bucket(name || this.config!.bucketName),
      scope: (bucketName?: string, scopeName?: string) =>
        this.cluster!.bucket(bucketName || this.config!.bucketName).scope(
          scopeName || this.config!.scopeName || "_default"
        ),
      collection: (bucketName?: string, scopeName?: string, collectionName?: string) =>
        this.getCollection(bucketName, scopeName, collectionName),
      defaultBucket: this.bucket,
      defaultScope: this.bucket.scope(this.config.scopeName || "_default"),
      defaultCollection: this.getCollection(),

      getHealth: () => this.getHealthWithDiagnostics(),
      executeWithRetry: this.executeWithRetry.bind(this),

      // HIGH PRIORITY FIX: Expose SDK error classes
      errors: {
        DocumentNotFoundError,
        CouchbaseError,
        TimeoutError,
        AuthenticationFailureError,
        CasMismatchError,
        TemporaryFailureError,
      },
    };
  }

  // =============================================================================
  // RETRY LOGIC
  // =============================================================================

  /**
   * Execute operation with retry logic and circuit breaker.
   */
  public async executeWithRetry<T>(operation: () => Promise<T>, context?: RetryContext): Promise<T> {
    const retryStrategy = context || { maxAttempts: 3, baseDelayMs: 1000 };
    const fallback = retryStrategy.fallback;

    return await this.circuitBreaker.execute(async () => {
      let lastError: Error | null = null;
      const maxAttempts = retryStrategy.maxAttempts || 3;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const startTime = typeof Bun !== "undefined" ? Bun.nanoseconds() : performance.now() * 1_000_000;

          const result = await operation();

          const endTime = typeof Bun !== "undefined" ? Bun.nanoseconds() : performance.now() * 1_000_000;
          const duration = (endTime - startTime) / 1_000_000;

          this.metrics.totalQueries++;
          this.metrics.lastQueryTime = new Date();
          this.updateAverageQueryTime(duration);

          return result;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          // HIGH PRIORITY FIX: Use SDK error classifier
          const errorContext = CouchbaseErrorClassifier.extractContext(error);
          const strategy = CouchbaseErrorClassifier.getRetryStrategy(error);

          if (!strategy.shouldRetry || attempt === maxAttempts) {
            this.metrics.failedQueries++;
            throw lastError;
          }

          const delayMs = strategy.baseDelayMs * 2 ** (attempt - 1);

          if (retryStrategy.onRetry) {
            retryStrategy.onRetry(attempt, lastError, delayMs);
          } else {
            warn("Couchbase retry attempt", {
              component: "couchbase",
              operation: "retry",
              attempt,
              maxAttempts,
              delayMs,
              error: errorContext.message,
            });
          }

          await this.sleep(delayMs);
        }
      }

      throw lastError;
    }, fallback);
  }

  // =============================================================================
  // METRICS & STATE
  // =============================================================================

  /**
   * Get connection metrics.
   */
  public getMetrics(): ConnectionMetrics {
    return {
      ...this.metrics,
      circuitBreakerState: this.circuitBreaker.getState(),
    };
  }

  /**
   * Check if connected and healthy.
   */
  public isConnected(): boolean {
    return this.isHealthy && this.cluster !== null;
  }

  /**
   * Get circuit breaker state.
   */
  public getCircuitBreakerState(): "closed" | "open" | "half-open" {
    return this.circuitBreaker.getState();
  }

  /**
   * Reset circuit breaker (administrative action).
   */
  public resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }

  // =============================================================================
  // CLEANUP
  // =============================================================================

  /**
   * Close connection.
   * Idempotent - safe to call multiple times.
   */
  public async close(): Promise<void> {
    // Idempotency guard - prevent multiple close calls
    if (this.isClosing) {
      log("Couchbase close already in progress, skipping duplicate call", {
        component: "couchbase",
        operation: "close",
      });
      return;
    }
    this.isClosing = true;

    log("Couchbase closing connection", { component: "couchbase", operation: "close" });

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.cluster) {
      try {
        await this.cluster.close();
        log("Couchbase connection closed successfully", { component: "couchbase", operation: "close_complete" });
      } catch (error) {
        err("Couchbase error closing connection", { component: "couchbase", operation: "close", error: String(error) });
      }
    }

    this.cluster = null;
    this.bucket = null;
    this.collections.clear();
    this.config = null;
    this.isHealthy = false;
    // Note: Don't reset isClosing - connection is permanently closed
  }

  // =============================================================================
  // UTILITIES
  // =============================================================================

  private calculateBackoff(attempt: number): number {
    const baseDelay = 1000;
    const maxDelay = 8000;
    const delay = Math.min(baseDelay * 2 ** (attempt - 1), maxDelay);
    const jitter = delay * 0.25;
    return Math.floor(delay + (Math.random() * jitter * 2 - jitter));
  }

  private async sleep(ms: number): Promise<void> {
    if (typeof Bun !== "undefined") {
      await Bun.sleep(ms);
    } else {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  }

  private updateAverageQueryTime(duration: number): void {
    const totalQueries = this.metrics.totalQueries;
    this.metrics.avgQueryTime = (this.metrics.avgQueryTime * (totalQueries - 1) + duration) / totalQueries;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

/**
 * Singleton connection manager instance.
 * Use this for all Couchbase operations.
 */
export const connectionManager = CouchbaseConnectionManager.getInstance();

// Note: Signal handlers (SIGINT/SIGTERM) are handled centrally in src/index.ts
// to avoid multiple handler registrations causing duplicate shutdown calls.
// The connectionManager.close() method is idempotent and safe to call multiple times.
