/* test/k6/utils/metrics.ts */

import { Counter, Gauge, Rate, Trend } from "k6/metrics";

// HTTP and general metrics
export const httpErrors = new Counter("http_errors");
export const httpDuration = new Trend("http_duration_custom");
export const httpSuccessRate = new Rate("http_success_rate");

// GraphQL operation metrics
export const graphqlDuration = new Trend("graphql_operation_duration");
export const graphqlErrors = new Counter("graphql_errors");
export const graphqlSuccessRate = new Rate("graphql_success_rate");
export const graphqlComplexQueries = new Counter("graphql_complex_queries");
export const graphqlSimpleQueries = new Counter("graphql_simple_queries");

// Business-specific metrics
export const businessOperations = new Counter("business_operations_completed");
export const looksRetrieved = new Counter("looks_retrieved");
export const optionsRetrieved = new Counter("options_retrieved");
export const assignmentsRetrieved = new Counter("assignments_retrieved");

// Database connection metrics
export const dbConnections = new Gauge("concurrent_db_connections");
export const dbConnectionErrors = new Counter("db_connection_errors");
export const dbQueryDuration = new Trend("db_query_duration");

// Cache performance metrics
export const cacheHits = new Counter("cache_hits");
export const cacheMisses = new Counter("cache_misses");
export const cacheHitRate = new Rate("cache_hit_rate");

// OpenTelemetry overhead metrics
export const telemetryOverhead = new Trend("telemetry_overhead");
export const telemetryErrors = new Counter("telemetry_errors");

// Performance budget metrics
export const performanceBudgetViolations = new Counter("performance_budget_violations");

export interface GraphQLOperationMetrics {
  operation: string;
  duration: number;
  success: boolean;
  complexity?: "simple" | "complex";
  errors?: any[];
}

export const recordGraphQLOperation = (metrics: GraphQLOperationMetrics): void => {
  graphqlDuration.add(metrics.duration, { operation: metrics.operation });
  graphqlSuccessRate.add(metrics.success);

  if (metrics.success) {
    businessOperations.add(1, { operation: metrics.operation });

    // Track operation type
    if (metrics.complexity === "complex") {
      graphqlComplexQueries.add(1);
    } else {
      graphqlSimpleQueries.add(1);
    }

    // Track business metrics by operation
    switch (metrics.operation) {
      case "looksSummary":
      case "looks":
        looksRetrieved.add(1);
        break;
      case "optionsSummary":
      case "optionsProductView":
        optionsRetrieved.add(1);
        break;
      case "getAllSeasonalAssignments":
      case "getDivisionalAssignment":
        assignmentsRetrieved.add(1);
        break;
    }
  } else {
    graphqlErrors.add(1, { operation: metrics.operation });
  }

  if (metrics.errors && metrics.errors.length > 0) {
    graphqlErrors.add(metrics.errors.length, { operation: metrics.operation });
  }
};

export const recordCacheMetrics = (hit: boolean): void => {
  if (hit) {
    cacheHits.add(1);
  } else {
    cacheMisses.add(1);
  }
  cacheHitRate.add(hit);
};

export const recordPerformanceBudgetViolation = (metric: string, actual: number, budget: number): void => {
  performanceBudgetViolations.add(1, {
    metric,
    actual: actual.toString(),
    budget: budget.toString(),
  });
};

// Utility function to check if response time meets performance budget
export const checkPerformanceBudget = (duration: number, operation: string, budget: number): boolean => {
  const withinBudget = duration <= budget;

  if (!withinBudget) {
    recordPerformanceBudgetViolation(`${operation}_response_time`, duration, budget);
  }

  return withinBudget;
};

export const getMetricsSummary = () => ({
  httpErrors: httpErrors,
  graphqlErrors: graphqlErrors,
  businessOperations: businessOperations,
  cacheHitRate: cacheHitRate,
  performanceBudgetViolations: performanceBudgetViolations,
});
