/* src/telemetry/metrics/index.ts */
// Public API exports per monitoring-updated.md line 36

export {
  type DatabaseMetricsLabels,
  getDatabaseMetricsStatus,
  initializeDatabaseMetrics,
  recordConnectionChange,
  recordDatabaseOperation,
  recordSLIMetric,
} from "./databaseMetrics";
export {
  getMetricsStatus,
  initializeHttpMetrics,
  recordGraphQLRequest,
  recordGraphQLResponseTime,
  recordHttpRequest,
  recordHttpResponseTime,
} from "./httpMetrics";
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
export {
  getAvailableMetricNames,
  INSTRUMENT_COUNT,
  INSTRUMENT_DEFINITIONS,
  type MetricInstruments,
} from "./instruments";
export {
  getMemoryPressureState,
  getMemoryPressureThresholds,
  getProcessMetricsStatus,
  handleGCEvent,
  initializeProcessMetrics,
  isMemoryPressureCritical,
  isMemoryPressureElevated,
  type MemoryPressureLevel,
  type MemoryPressureState,
  type ProcessMetricsStatus,
  recordGCCollection,
  recordGCDuration,
  recordGCHeapSizes,
  startMemoryPressureMonitoring,
  stopMemoryPressureMonitoring,
} from "./process-metrics";
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
