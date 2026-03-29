/* src/lib/couchbase/query-executor.ts */

import { type Cluster, type QueryOptions, QueryProfileMode, type QueryResult, QueryScanConsistency } from "couchbase";
import { log, warn } from "../../telemetry/logger";
import { CouchbaseErrorClassifier } from "./errors";
import type { QueryExecutionOptions } from "./types";

export type { QueryExecutionOptions };

export class QueryExecutor {
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

  private static buildQueryOptions(options: QueryExecutionOptions): QueryOptions {
    const queryOptions: QueryOptions = {
      parameters: options.parameters,

      // adhoc=false uses prepared statements (cached query plans)
      adhoc: options.usePreparedStatement !== undefined ? !options.usePreparedStatement : true,

      queryContext: options.queryContext,

      scanConsistency:
        options.scanConsistency === "notBounded" ? QueryScanConsistency.NotBounded : QueryScanConsistency.RequestPlus,
      timeout: options.timeout || 30000,
      profile: options.profile ? QueryProfileMode.Timings : undefined,
      metrics: options.metrics !== false,
      clientContextId: options.clientContextId || QueryExecutor.generateClientContextId(),
      readOnly: options.readonly,
    };

    if (options.requestId) {
      queryOptions.clientContextId = options.requestId;
    }

    return queryOptions;
  }

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

export function buildParameterizedQuery(
  template: string,
  params: Record<string, any>
): { statement: string; parameters: Record<string, any> } {
  return {
    statement: template,
    parameters: params,
  };
}

export function createQueryContext(bucketName: string, scopeName: string): string {
  return `${bucketName}.${scopeName}`;
}
