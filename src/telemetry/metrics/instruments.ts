/* src/telemetry/metrics/instruments.ts */
// Metric instrument definitions per monitoring-updated.md line 38
// Centralized metric definitions for consistent naming and descriptions

import type { Counter, Histogram, UpDownCounter, ObservableGauge } from "@opentelemetry/api";

// ============================================================================
// Instrument Registry Types
// ============================================================================

export interface MetricInstruments {
  // HTTP Metrics
  httpRequestsTotal: Counter;
  httpRequestDurationSeconds: Histogram;
  httpActiveRequests: UpDownCounter;

  // GraphQL Metrics
  graphqlOperationsTotal: Counter;
  graphqlOperationDurationSeconds: Histogram;
  graphqlResolverDurationSeconds: Histogram;
  graphqlErrorsTotal: Counter;

  // Database Metrics
  dbOperationsTotal: Counter;
  dbOperationDurationSeconds: Histogram;
  dbActiveConnections: UpDownCounter;
  dbConnectionPoolSize: ObservableGauge;

  // Cache Metrics
  cacheOperationsTotal: Counter;
  cacheHitsTotal: Counter;
  cacheMissesTotal: Counter;
  cacheSizeBytes: ObservableGauge;

  // Circuit Breaker Metrics
  circuitBreakerStateChangesTotal: Counter;
  circuitBreakerRequestsTotal: Counter;
  circuitBreakerRejectedTotal: Counter;

  // Process Metrics
  processMemoryUsageBytes: ObservableGauge;
  processHeapUsedBytes: ObservableGauge;
  processHeapTotalBytes: ObservableGauge;
  processCpuUsagePercent: ObservableGauge;

  // GC Metrics
  gcCollectionsTotal: Counter;
  gcDurationSeconds: Histogram;
  gcHeapSizeBeforeBytes: ObservableGauge;
  gcHeapSizeAfterBytes: ObservableGauge;

  // Telemetry Export Metrics
  telemetryExportsTotal: Counter;
  telemetryExportFailuresTotal: Counter;
  telemetryExportDurationSeconds: Histogram;
  telemetryQueueSize: ObservableGauge;

  // Error Metrics
  errorsTotal: Counter;
  errorsByTypeTotal: Counter;

  // Security Metrics (placeholder)
  securityEventsTotal: Counter;
}

// ============================================================================
// Instrument Definitions
// ============================================================================

export const INSTRUMENT_DEFINITIONS = {
  // HTTP Instruments
  httpRequestsTotal: {
    name: "http_requests_total",
    description: "Total number of HTTP requests",
    unit: "1",
    type: "counter" as const,
  },
  httpRequestDurationSeconds: {
    name: "http_request_duration_seconds",
    description: "HTTP request duration in seconds",
    unit: "s",
    type: "histogram" as const,
  },
  httpActiveRequests: {
    name: "http_active_requests",
    description: "Number of active HTTP requests",
    unit: "1",
    type: "updowncounter" as const,
  },

  // GraphQL Instruments
  graphqlOperationsTotal: {
    name: "graphql_operations_total",
    description: "Total number of GraphQL operations",
    unit: "1",
    type: "counter" as const,
  },
  graphqlOperationDurationSeconds: {
    name: "graphql_operation_duration_seconds",
    description: "GraphQL operation duration in seconds",
    unit: "s",
    type: "histogram" as const,
  },
  graphqlResolverDurationSeconds: {
    name: "graphql_resolver_duration_seconds",
    description: "GraphQL resolver execution duration in seconds",
    unit: "s",
    type: "histogram" as const,
  },
  graphqlErrorsTotal: {
    name: "graphql_errors_total",
    description: "Total number of GraphQL errors",
    unit: "1",
    type: "counter" as const,
  },

  // Database Instruments
  dbOperationsTotal: {
    name: "db_operations_total",
    description: "Total number of database operations",
    unit: "1",
    type: "counter" as const,
  },
  dbOperationDurationSeconds: {
    name: "db_operation_duration_seconds",
    description: "Database operation duration in seconds",
    unit: "s",
    type: "histogram" as const,
  },
  dbActiveConnections: {
    name: "db_active_connections",
    description: "Number of active database connections",
    unit: "1",
    type: "updowncounter" as const,
  },
  dbConnectionPoolSize: {
    name: "db_connection_pool_size",
    description: "Current database connection pool size",
    unit: "1",
    type: "observable_gauge" as const,
  },

  // Cache Instruments
  cacheOperationsTotal: {
    name: "cache_operations_total",
    description: "Total number of cache operations",
    unit: "1",
    type: "counter" as const,
  },
  cacheHitsTotal: {
    name: "cache_hits_total",
    description: "Total number of cache hits",
    unit: "1",
    type: "counter" as const,
  },
  cacheMissesTotal: {
    name: "cache_misses_total",
    description: "Total number of cache misses",
    unit: "1",
    type: "counter" as const,
  },
  cacheSizeBytes: {
    name: "cache_size_bytes",
    description: "Current cache size in bytes",
    unit: "By",
    type: "observable_gauge" as const,
  },

  // Circuit Breaker Instruments
  circuitBreakerStateChangesTotal: {
    name: "circuit_breaker_state_changes_total",
    description: "Total number of circuit breaker state changes",
    unit: "1",
    type: "counter" as const,
  },
  circuitBreakerRequestsTotal: {
    name: "circuit_breaker_requests_total",
    description: "Total requests through circuit breaker",
    unit: "1",
    type: "counter" as const,
  },
  circuitBreakerRejectedTotal: {
    name: "circuit_breaker_rejected_total",
    description: "Total requests rejected by open circuit breaker",
    unit: "1",
    type: "counter" as const,
  },

  // Process Instruments
  processMemoryUsageBytes: {
    name: "process_memory_usage_bytes",
    description: "Process memory usage (RSS) in bytes",
    unit: "By",
    type: "observable_gauge" as const,
  },
  processHeapUsedBytes: {
    name: "process_heap_used_bytes",
    description: "Process heap used in bytes",
    unit: "By",
    type: "observable_gauge" as const,
  },
  processHeapTotalBytes: {
    name: "process_heap_total_bytes",
    description: "Process total heap in bytes",
    unit: "By",
    type: "observable_gauge" as const,
  },
  processCpuUsagePercent: {
    name: "process_cpu_usage_percent",
    description: "Process CPU usage percentage",
    unit: "1",
    type: "observable_gauge" as const,
  },

  // GC Instruments
  gcCollectionsTotal: {
    name: "gc_collections_total",
    description: "Total number of garbage collections",
    unit: "1",
    type: "counter" as const,
  },
  gcDurationSeconds: {
    name: "gc_duration_seconds",
    description: "Garbage collection duration in seconds",
    unit: "s",
    type: "histogram" as const,
  },
  gcHeapSizeBeforeBytes: {
    name: "gc_old_generation_size_before_bytes",
    description: "Heap size before garbage collection",
    unit: "By",
    type: "observable_gauge" as const,
  },
  gcHeapSizeAfterBytes: {
    name: "gc_old_generation_size_after_bytes",
    description: "Heap size after garbage collection",
    unit: "By",
    type: "observable_gauge" as const,
  },

  // Telemetry Export Instruments
  telemetryExportsTotal: {
    name: "telemetry_exports_total",
    description: "Total number of telemetry exports",
    unit: "1",
    type: "counter" as const,
  },
  telemetryExportFailuresTotal: {
    name: "telemetry_export_failures_total",
    description: "Total number of telemetry export failures",
    unit: "1",
    type: "counter" as const,
  },
  telemetryExportDurationSeconds: {
    name: "telemetry_export_duration_seconds",
    description: "Telemetry export duration in seconds",
    unit: "s",
    type: "histogram" as const,
  },
  telemetryQueueSize: {
    name: "telemetry_queue_size",
    description: "Current telemetry queue size",
    unit: "1",
    type: "observable_gauge" as const,
  },

  // Error Instruments
  errorsTotal: {
    name: "errors_total",
    description: "Total number of errors",
    unit: "1",
    type: "counter" as const,
  },
  errorsByTypeTotal: {
    name: "errors_by_type_total",
    description: "Total errors by type",
    unit: "1",
    type: "counter" as const,
  },

  // Security Instruments
  securityEventsTotal: {
    name: "security_events_total",
    description: "Total number of security events",
    unit: "1",
    type: "counter" as const,
  },
} as const;

// Count of instruments for health reporting
export const INSTRUMENT_COUNT = Object.keys(INSTRUMENT_DEFINITIONS).length;

// Get available metric names for health endpoint
export function getAvailableMetricNames(): string[] {
  return Object.values(INSTRUMENT_DEFINITIONS).map((def) => def.name);
}
