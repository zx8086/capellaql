/* src/telemetry/metrics/index.ts */
// Public API exports per monitoring-updated.md line 36

// ============================================================================
// Initialization
// ============================================================================

export {
  getCounter,
  getHistogram,
  getMetricsInitializationStatus,
  getUpDownCounter,
  initializeMetrics,
  isMetricsInitialized,
  METER_NAMES,
  resetMetrics,
} from "./initialization";

// ============================================================================
// Instrument Definitions
// ============================================================================

export {
  getAvailableMetricNames,
  INSTRUMENT_COUNT,
  INSTRUMENT_DEFINITIONS,
  type MetricInstruments,
} from "./instruments";

// ============================================================================
// Type Definitions
// ============================================================================

export type {
  BaseMetricAttributes,
  CacheOperationAttributes,
  CircuitBreakerAttributes,
  DatabaseConnectionAttributes,
  DatabaseOperationAttributes,
  ErrorMetricAttributes,
  GCMetricAttributes,
  GraphQLOperationAttributes,
  GraphQLResolverAttributes,
  HttpRequestAttributes,
  HttpResponseAttributes,
  MemoryMetricAttributes,
  ProcessMetricAttributes,
  SecurityEventAttributes,
  TelemetryExportAttributes,
} from "./types";

// ============================================================================
// HTTP Metrics
// ============================================================================

export {
  getMetricsStatus,
  initializeHttpMetrics,
  recordGraphQLRequest,
  recordGraphQLResponseTime,
  recordHttpRequest,
  recordHttpResponseTime,
} from "./httpMetrics";

// ============================================================================
// Database Metrics
// ============================================================================

export {
  getDatabaseMetricsStatus,
  initializeDatabaseMetrics,
  recordConnectionChange,
  recordDatabaseOperation,
  recordSLIMetric,
  type DatabaseMetricsLabels,
} from "./databaseMetrics";

// ============================================================================
// Process Metrics
// ============================================================================

export {
  getMemoryPressureState,
  getMemoryPressureThresholds,
  getProcessMetricsStatus,
  handleGCEvent,
  initializeProcessMetrics,
  isMemoryPressureCritical,
  isMemoryPressureElevated,
  recordGCCollection,
  recordGCDuration,
  recordGCHeapSizes,
  startMemoryPressureMonitoring,
  stopMemoryPressureMonitoring,
  type MemoryPressureLevel,
  type MemoryPressureState,
  type ProcessMetricsStatus,
} from "./process-metrics";
