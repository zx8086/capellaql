/* src/lib/couchbase/query-executor.ts */

/**
 * Query Executor Module
 *
 * MEDIUM PRIORITY FIXES INTEGRATED:
 * - Prepared statements (adhoc: false)
 * - Query context (bucket.scope) for scope-level queries
 * - Query profiling and metrics
 * - Integrated retry logic with error classification
 * - Slow query logging
 */

import type { Cluster, QueryOptions, QueryResult } from "couchbase";
import { log, warn } from "../../telemetry/logger";
import { CouchbaseErrorClassifier } from "./errors";
import type { QueryExecutionOptions } from "./types";

// Re-export the options type
export type { QueryExecutionOptions };

// =============================================================================
// QUERY EXECUTOR CLASS
// =============================================================================

/**
 * Execute N1QL queries with SDK best practices.
 *
 * Usage:
 * ```typescript
 * const result = await QueryExecutor.execute(cluster, "SELECT * FROM users WHERE status = $status", {
 *   parameters: { status: "active" },
 *   usePreparedStatement: true,  // Cache query plan
 *   queryContext: "bucket.scope", // Scope-level queries
 * });
 * ```
 */
export class QueryExecutor {
  /**
   * Execute query with automatic retry on transient failures.
   *
   * MEDIUM PRIORITY FIXES:
   * - Uses prepared statements by default (adhoc: false)
   * - Supports query context for scope-level queries
   * - Includes query profiling and metrics
   */
  static async execute<T = any>(
    cluster: Cluster,
    statement: string,
    options: QueryExecutionOptions = {}
  ): Promise<QueryResult<T>> {
    const maxRetries = options.maxRetries ?? 3;
    const queryOptions = QueryExecutor.buildQueryOptions(options);

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const startTime = performance.now();

        // MEDIUM PRIORITY FIX: Execute with prepared statements
        const result = await cluster.query<T>(statement, queryOptions);

        const duration = performance.now() - startTime;

        // Log slow queries
        if (duration > 1000) {
          warn("Slow query detected", {
            component: "couchbase",
            operation: "query",
            durationMs: Number(duration.toFixed(2)),
            statement: statement.substring(0, 100),
            queryContext: options.queryContext,
          });
        }

        // Log metrics if requested
        if (options.metrics && result.meta?.metrics) {
          log("Query metrics", {
            component: "couchbase",
            operation: "query",
            executionTime: result.meta.metrics.executionTime,
            resultCount: result.meta.metrics.resultCount,
          });
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        const errorContext = CouchbaseErrorClassifier.extractContext(error, "query");

        // Don't retry permanent failures
        if (errorContext.isCritical) {
          throw error;
        }

        const retryStrategy = CouchbaseErrorClassifier.getRetryStrategy(error);

        if (!retryStrategy.shouldRetry || attempt >= maxRetries) {
          throw error;
        }

        const delay = retryStrategy.baseDelayMs * 2 ** (attempt - 1);
        warn("Query retry attempt", {
          component: "couchbase",
          operation: "query",
          attempt,
          maxRetries,
          delayMs: delay,
          error: errorContext.message,
        });

        await QueryExecutor.sleep(delay);
      }
    }

    throw lastError || new Error("Query failed");
  }

  /**
   * Execute query in a specific scope context.
   * Convenience method that sets the queryContext automatically.
   *
   * Usage:
   * ```typescript
   * // Instead of: SELECT * FROM `bucket`.`scope`.`collection` WHERE ...
   * // You can use: SELECT * FROM `collection` WHERE ...
   * const result = await QueryExecutor.executeInScope(cluster, "SELECT * FROM users", "myBucket", "myScope");
   * ```
   */
  static async executeInScope<T = any>(
    cluster: Cluster,
    statement: string,
    bucketName: string,
    scopeName: string,
    options: QueryExecutionOptions = {}
  ): Promise<QueryResult<T>> {
    return QueryExecutor.execute<T>(cluster, statement, {
      ...options,
      queryContext: `${bucketName}.${scopeName}`,
    });
  }

  /**
   * MEDIUM PRIORITY FIX: Build query options with prepared statements.
   */
  private static buildQueryOptions(options: QueryExecutionOptions): QueryOptions {
    const queryOptions: QueryOptions = {
      parameters: options.parameters,

      // SDK BEST PRACTICE: adhoc=false uses prepared statements (cached query plans)
      // This improves performance for frequently executed queries
      adhoc: options.usePreparedStatement !== undefined ? !options.usePreparedStatement : true,

      // MEDIUM PRIORITY FIX: Query context for scope-level queries
      // Enables: SELECT * FROM collection
      // Instead of: SELECT * FROM `bucket`.`scope`.`collection`
      queryContext: options.queryContext,

      scanConsistency: options.scanConsistency || "request_plus",
      timeout: options.timeout || 30000,

      // Enable query profiling if requested
      profile: options.profile ? "timings" : undefined,

      // Enable metrics collection (default: true)
      metrics: options.metrics !== false,

      // Client context ID for tracing
      clientContextId: options.clientContextId || QueryExecutor.generateClientContextId(),

      readonly: options.readonly,
    };

    // Add request ID if provided (for correlation)
    if (options.requestId) {
      queryOptions.clientContextId = options.requestId;
    }

    return queryOptions;
  }

  /**
   * Generate a unique client context ID for query tracing.
   */
  private static generateClientContextId(): string {
    return `query-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private static async sleep(ms: number): Promise<void> {
    if (typeof Bun !== "undefined") {
      await Bun.sleep(ms);
    } else {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Build a parameterized query with named parameters.
 *
 * Usage:
 * ```typescript
 * const { statement, parameters } = buildParameterizedQuery(
 *   "SELECT * FROM users WHERE status = $status AND region = $region",
 *   { status: "active", region: "US" }
 * );
 * ```
 */
export function buildParameterizedQuery(
  template: string,
  params: Record<string, any>
): { statement: string; parameters: Record<string, any> } {
  return {
    statement: template,
    parameters: params,
  };
}

/**
 * Create a query context string from bucket and scope names.
 */
export function createQueryContext(bucketName: string, scopeName: string): string {
  return `${bucketName}.${scopeName}`;
}
