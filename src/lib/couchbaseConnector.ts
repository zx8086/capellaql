/* src/lib/couchbaseConnector.ts */

import {
  type Bucket,
  type Cluster,
  type Collection,
  CouchbaseError,
  connect,
  DocumentNotFoundError,
  type QueryMetaData,
  type QueryOptions,
  type QueryResult,
  type Scope,
  type StreamableRowPromise,
} from "couchbase";
import config from "$config";
import { getPerformanceStats } from "$lib/couchbaseMetrics";
import { CircuitBreaker, retryWithBackoff } from "$utils/bunUtils";
import { err, warn } from "../telemetry/logger";

interface QueryableCluster extends Cluster {
  query<TRow = any>(
    statement: string,
    options?: QueryOptions
  ): StreamableRowPromise<QueryResult<TRow>, TRow, QueryMetaData>;
}

export interface capellaConn {
  cluster: QueryableCluster;
  bucket: (name: string) => Bucket;
  scope: (bucket: string, name: string) => Scope;
  collection: (bucket: string, scope: string, name: string) => Collection;
  defaultBucket: Bucket;
  defaultScope: Scope;
  defaultCollection: Collection;
  errors: {
    DocumentNotFoundError: typeof DocumentNotFoundError;
    CouchbaseError: typeof CouchbaseError;
  };
}

// Create circuit breaker for database connection resilience
const dbCircuitBreaker = new CircuitBreaker(
  config.telemetry.CIRCUIT_BREAKER_THRESHOLD, // threshold
  config.telemetry.CIRCUIT_BREAKER_TIMEOUT_MS, // timeout
  30000 // reset timeout
);

export async function clusterConn(): Promise<capellaConn> {
  const connectionStartTime = Date.now();

  const clusterConnStr: string = config.capella.COUCHBASE_URL;
  const username: string = config.capella.COUCHBASE_USERNAME;
  const password: string = config.capella.COUCHBASE_PASSWORD;
  const bucketName: string = config.capella.COUCHBASE_BUCKET;
  const scopeName: string = config.capella.COUCHBASE_SCOPE;
  const collectionName: string = config.capella.COUCHBASE_COLLECTION;

  // Enhanced connection with retry and circuit breaker
  return await dbCircuitBreaker.execute(async () => {
    return await retryWithBackoff(
      async () => {
        const cluster: QueryableCluster = await connect(clusterConnStr, {
          username: username,
          password: password,
          timeouts: {
            kvTimeout: config.capella.COUCHBASE_KV_TIMEOUT,
            kvDurableTimeout: config.capella.COUCHBASE_KV_DURABLE_TIMEOUT,
            queryTimeout: config.capella.COUCHBASE_QUERY_TIMEOUT,
            analyticsTimeout: config.capella.COUCHBASE_ANALYTICS_TIMEOUT,
            searchTimeout: config.capella.COUCHBASE_SEARCH_TIMEOUT,
            connectTimeout: config.capella.COUCHBASE_CONNECT_TIMEOUT,
            bootstrapTimeout: config.capella.COUCHBASE_BOOTSTRAP_TIMEOUT,
          },
        });

        const bucket: Bucket = cluster.bucket(bucketName);
        const scope: Scope = bucket.scope(scopeName);
        const collection: Collection = scope.collection(collectionName);

        const totalConnectionTime = Date.now() - connectionStartTime;

        // Only log slow connections or errors
        if (totalConnectionTime > 5000) {
          warn("Slow Couchbase connection", {
            connectionTimeMs: totalConnectionTime,
            bucketName,
            scopeName,
            collectionName,
          });
        }

        return {
          cluster,
          bucket: (name: string) => cluster.bucket(name),
          scope: (bucket: string, name: string) => cluster.bucket(bucket).scope(name),
          collection: (bucket: string, scope: string, name: string) =>
            cluster.bucket(bucket).scope(scope).collection(name),
          defaultBucket: bucket,
          defaultScope: scope,
          defaultCollection: collection,
          errors: {
            DocumentNotFoundError,
            CouchbaseError,
          },
        };
      },
      3,
      2000,
      30000
    ); // 3 retries, starting at 2s, max 30s delay
  });
}

export async function getCouchbaseHealth(): Promise<{
  status: "healthy" | "degraded" | "unhealthy" | "critical";
  details: {
    connection: "connected" | "disconnected" | "connecting" | "error";
    ping?: any;
    diagnostics?: any;
    circuitBreaker: {
      state: string;
      failures: number;
      successes: number;
      totalOperations?: number;
      lastFailure?: string;
      errorRate?: number;
    };
    connectionLatency?: number;
    performance: {
      avgQueryTime?: number;
      errorRate?: number;
      documentsPerSecond?: number;
      connectionPoolSize?: number;
    };
    serviceHealth: {
      kv?: { status: string; healthy: boolean };
      query?: { status: string; healthy: boolean };
      analytics?: { status: string; healthy: boolean };
      search?: { status: string; healthy: boolean };
    };
    errors?: string[];
    warnings?: string[];
    recommendations?: string[];
  };
}> {
  const startTime = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  try {
    const connection = await clusterConn();
    const connectionLatency = Date.now() - startTime;
    const circuitBreakerStats = dbCircuitBreaker.getStats();

    // Test basic connectivity and get detailed diagnostics
    const ping = await connection.cluster.ping();
    const diagnostics = await connection.cluster.diagnostics();

    // Analyze service health
    const serviceHealth = {
      kv: { status: "unknown", healthy: false },
      query: { status: "unknown", healthy: false },
      analytics: { status: "unknown", healthy: false },
      search: { status: "unknown", healthy: false },
    };

    // Check service states from ping
    if (ping.services) {
      const kvServices = ping.services.kv || [];
      const queryServices = ping.services.query || [];
      const analyticsServices = ping.services.analytics || [];
      const searchServices = ping.services.search || [];

      serviceHealth.kv = {
        status:
          kvServices.length > 0 ? (kvServices.every((s) => s.state === "ok") ? "healthy" : "degraded") : "unavailable",
        healthy: kvServices.length > 0 && kvServices.every((s) => s.state === "ok"),
      };

      serviceHealth.query = {
        status:
          queryServices.length > 0
            ? queryServices.every((s) => s.state === "ok")
              ? "healthy"
              : "degraded"
            : "unavailable",
        healthy: queryServices.length > 0 && queryServices.every((s) => s.state === "ok"),
      };

      serviceHealth.analytics = {
        status:
          analyticsServices.length > 0
            ? analyticsServices.every((s) => s.state === "ok")
              ? "healthy"
              : "degraded"
            : "unavailable",
        healthy: analyticsServices.length > 0 && analyticsServices.every((s) => s.state === "ok"),
      };

      serviceHealth.search = {
        status:
          searchServices.length > 0
            ? searchServices.every((s) => s.state === "ok")
              ? "healthy"
              : "degraded"
            : "unavailable",
        healthy: searchServices.length > 0 && searchServices.every((s) => s.state === "ok"),
      };
    }

    // Calculate comprehensive error metrics
    const totalOperations = circuitBreakerStats.successes + circuitBreakerStats.failures;
    const errorRate = totalOperations > 0 ? (circuitBreakerStats.failures / totalOperations) * 100 : 0;

    // Enhanced circuit breaker stats
    const enhancedCircuitBreakerStats = {
      ...circuitBreakerStats,
      totalOperations,
      errorRate,
      lastFailure: circuitBreakerStats.failures > 0 ? "Recent failures detected" : undefined,
    };

    // Get real performance metrics
    const performanceStats = getPerformanceStats();
    const performance = {
      avgQueryTime: performanceStats.averageQueryTime,
      errorRate: performanceStats.errorRate,
      documentsPerSecond: performanceStats.documentsPerSecond,
      connectionPoolSize: 10, // would come from connection pool metrics when available
    };

    // Determine overall health status with enhanced logic
    let status: "healthy" | "degraded" | "unhealthy" | "critical" = "healthy";

    // Critical conditions
    if (circuitBreakerStats.state === "open") {
      status = "critical";
      errors.push("Circuit breaker is open - database operations failing");
      recommendations.push("Investigate connection issues immediately");
    } else if (!serviceHealth.kv.healthy && !serviceHealth.query.healthy) {
      status = "critical";
      errors.push("Both KV and Query services are unhealthy");
      recommendations.push("Check cluster status and node availability");
    } else if (errorRate > 50) {
      status = "critical";
      errors.push(`High error rate: ${errorRate.toFixed(1)}%`);
      recommendations.push("Investigate error patterns and consider scaling");
    }
    // Unhealthy conditions
    else if (!serviceHealth.kv.healthy || !serviceHealth.query.healthy) {
      status = "unhealthy";
      errors.push("Critical services are unhealthy");
      recommendations.push("Check individual service status");
    } else if (connectionLatency > 5000) {
      status = "unhealthy";
      errors.push(`Very slow connection: ${connectionLatency}ms`);
      recommendations.push("Check network connectivity and cluster load");
    }
    // Degraded conditions
    else if (circuitBreakerStats.failures > 0) {
      status = "degraded";
      warnings.push(`${circuitBreakerStats.failures} recent failures detected`);
      recommendations.push("Monitor for error patterns");
    } else if (connectionLatency > 2000) {
      status = "degraded";
      warnings.push(`Slow connection: ${connectionLatency}ms`);
      recommendations.push("Monitor connection performance");
    } else if (errorRate > 5) {
      status = "degraded";
      warnings.push(`Elevated error rate: ${errorRate.toFixed(1)}%`);
      recommendations.push("Monitor error trends");
    }

    // Connection quality recommendations
    if (connectionLatency > 1000) {
      recommendations.push("Consider connection pooling optimization");
    }
    if (performance.avgQueryTime > 500) {
      recommendations.push("Consider query optimization or indexing");
    }

    return {
      status,
      details: {
        connection: "connected",
        ping,
        diagnostics,
        circuitBreaker: enhancedCircuitBreakerStats,
        connectionLatency,
        performance,
        serviceHealth,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        recommendations: recommendations.length > 0 ? recommendations : undefined,
      },
    };
  } catch (error) {
    const circuitBreakerStats = dbCircuitBreaker.getStats();
    const errorMessage = error instanceof Error ? error.message : String(error);

    err("Couchbase health check failed", {
      error: errorMessage,
      connectionLatency: Date.now() - startTime,
      circuitBreakerState: circuitBreakerStats.state,
    });

    return {
      status: "critical",
      details: {
        connection: "error",
        circuitBreaker: {
          ...circuitBreakerStats,
          totalOperations: circuitBreakerStats.successes + circuitBreakerStats.failures,
          errorRate: 100,
        },
        connectionLatency: Date.now() - startTime,
        performance: {
          errorRate: 100,
          documentsPerSecond: 0,
        },
        serviceHealth: {
          kv: { status: "unavailable", healthy: false },
          query: { status: "unavailable", healthy: false },
          analytics: { status: "unavailable", healthy: false },
          search: { status: "unavailable", healthy: false },
        },
        errors: [errorMessage, "Unable to establish connection to Couchbase cluster"],
        recommendations: [
          "Check connection configuration and credentials",
          "Verify cluster availability and network connectivity",
          "Review circuit breaker thresholds if failures persist",
        ],
      },
    };
  }
}

export async function pingCouchbase(): Promise<{
  success: boolean;
  latency?: number;
  services?: any[];
  error?: string;
}> {
  try {
    const connection = await clusterConn();
    const startTime = Date.now();
    const pingResult = await connection.cluster.ping();
    const latency = Date.now() - startTime;

    return {
      success: true,
      latency,
      services: pingResult.services || [],
    };
  } catch (error) {
    err("Couchbase ping failed", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
