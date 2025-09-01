/* src/lib/graphqlPerformanceTracker.ts */

import { metrics } from "@opentelemetry/api";
import { log } from "../telemetry/logger";
import { withCardinalityCheck } from "./metricsCardinalityManager";

// Get the existing meter instance to reuse
const meter = metrics.getMeter("capellaql-graphql-performance", "1.0.0");

// Create metrics for GraphQL operations
const resolverDuration = meter.createHistogram("graphql_resolver_duration_ms", {
  description: "GraphQL resolver execution time in milliseconds",
});

const resolverCallCount = meter.createCounter("graphql_resolver_calls_total", {
  description: "Total number of GraphQL resolver calls",
});

const resolverErrorCount = meter.createCounter("graphql_resolver_errors_total", {
  description: "Total number of GraphQL resolver errors",
});

export interface GraphQLPerformanceData {
  operationName: string;
  fieldName: string;
  duration: number;
  success: boolean;
  error?: string;
  timestamp: number;
}

// Store recent performance data for correlation analysis
const recentOperations: GraphQLPerformanceData[] = [];
const MAX_STORED_OPERATIONS = 100;

/**
 * Wraps a GraphQL resolver function with performance tracking
 */
export function withPerformanceTracking<T extends any[], R>(
  operationName: string,
  fieldName: string,
  resolverFn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    const startTime = Date.now();
    let success = true;
    let error: string | undefined;

    // Track the resolver call with cardinality check
    const callLabels = withCardinalityCheck("graphql_resolver_calls_total", {
      operation: operationName,
      field: fieldName,
    });

    if (callLabels.allowed) {
      resolverCallCount.add(1, callLabels.labels);
    }

    try {
      const result = await resolverFn(...args);
      return result;
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);

      // Track the error with cardinality check
      const errorLabels = withCardinalityCheck("graphql_resolver_errors_total", {
        operation: operationName,
        field: fieldName,
        error: error,
      });

      if (errorLabels.allowed) {
        resolverErrorCount.add(1, errorLabels.labels);
      }

      throw err;
    } finally {
      const duration = Date.now() - startTime;

      // Record duration metric with cardinality check
      const durationLabels = withCardinalityCheck("graphql_resolver_duration_ms", {
        operation: operationName,
        field: fieldName,
        status: success ? "success" : "error",
      });

      if (durationLabels.allowed) {
        resolverDuration.record(duration, durationLabels.labels);
      }

      // Store for correlation analysis
      const performanceData: GraphQLPerformanceData = {
        operationName,
        fieldName,
        duration,
        success,
        error,
        timestamp: Date.now(),
      };

      recentOperations.push(performanceData);

      // Keep only recent operations
      if (recentOperations.length > MAX_STORED_OPERATIONS) {
        recentOperations.shift();
      }

      // Log slow operations
      if (duration > 1000) {
        // 1 second threshold
        log(`Slow GraphQL operation detected`, {
          operation: operationName,
          field: fieldName,
          duration: `${duration}ms`,
          success,
        });
      }
    }
  };
}

/**
 * Get recent GraphQL performance data for correlation analysis
 */
export function getRecentGraphQLPerformance(): GraphQLPerformanceData[] {
  return [...recentOperations];
}

/**
 * Get performance statistics for GraphQL operations
 */
export function getGraphQLPerformanceStats() {
  if (recentOperations.length === 0) {
    return {
      totalOperations: 0,
      averageDuration: 0,
      errorRate: 0,
      slowOperations: 0,
      operationBreakdown: {},
    };
  }

  const totalOperations = recentOperations.length;
  const totalDuration = recentOperations.reduce((sum, op) => sum + op.duration, 0);
  const errorCount = recentOperations.filter((op) => !op.success).length;
  const slowOperations = recentOperations.filter((op) => op.duration > 1000).length;

  // Break down by operation
  const operationBreakdown: Record<
    string,
    {
      count: number;
      averageDuration: number;
      errorRate: number;
    }
  > = {};

  recentOperations.forEach((op) => {
    const key = `${op.operationName}.${op.fieldName}`;
    if (!operationBreakdown[key]) {
      operationBreakdown[key] = {
        count: 0,
        averageDuration: 0,
        errorRate: 0,
      };
    }

    operationBreakdown[key].count++;
    operationBreakdown[key].averageDuration += op.duration;
  });

  // Calculate averages
  Object.keys(operationBreakdown).forEach((key) => {
    const ops = recentOperations.filter((op) => `${op.operationName}.${op.fieldName}` === key);
    operationBreakdown[key].averageDuration = ops.reduce((sum, op) => sum + op.duration, 0) / ops.length;
    operationBreakdown[key].errorRate = ops.filter((op) => !op.success).length / ops.length;
  });

  return {
    totalOperations,
    averageDuration: totalDuration / totalOperations,
    errorRate: errorCount / totalOperations,
    slowOperations,
    operationBreakdown,
  };
}

/**
 * Clear stored performance data (useful for testing)
 */
export function clearPerformanceData(): void {
  recentOperations.length = 0;
}
