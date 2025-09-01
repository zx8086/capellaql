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
import { CircuitBreaker, retryWithBackoff } from "$utils/bunUtils";
import { log, warn, err } from "../telemetry/logger";

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
  status: "healthy" | "degraded" | "unhealthy";
  details: {
    connection: "connected" | "disconnected" | "connecting";
    ping?: any;
    diagnostics?: any;
    circuitBreaker: {
      state: string;
      failures: number;
      successes: number;
    };
    error?: string;
  };
}> {
  try {
    const connection = await clusterConn();
    const circuitBreakerStats = dbCircuitBreaker.getStats();

    // Test basic connectivity
    const ping = await connection.cluster.ping();
    const diagnostics = await connection.cluster.diagnostics();

    // Determine health status based on ping results
    let status: "healthy" | "degraded" | "unhealthy" = "healthy";

    if (circuitBreakerStats.state === "open") {
      status = "unhealthy";
    } else if (circuitBreakerStats.failures > 0 || ping.services.length === 0) {
      status = "degraded";
    }

    return {
      status,
      details: {
        connection: "connected",
        ping,
        diagnostics,
        circuitBreaker: circuitBreakerStats,
      },
    };
  } catch (error) {
    err("Couchbase health check failed", error);
    return {
      status: "unhealthy",
      details: {
        connection: "disconnected",
        circuitBreaker: dbCircuitBreaker.getStats(),
        error: error instanceof Error ? error.message : String(error),
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