/* src/telemetry/index.ts */

// Re-export telemetry config from unified system
export { loadTelemetryConfigFromEnv, telemetryConfig } from "$config";
// Configuration exports (now unified - use $config instead)
// @deprecated Use unified config.telemetry instead of these exports
export { type TelemetryConfig, validateTelemetryConfig } from "./config";
// GC metrics
export {
  forceGC,
  type GCEvent,
  type GCEventCallback,
  type GCMetricsState,
  type GCType,
  getAverageGCDuration,
  getCurrentHeapStats,
  getGCFrequency,
  getGCMetricsState,
  type HeapStats,
  initializeGCMetrics,
  isGCMetricsRunning,
  resetGCMetrics,
  shutdownGCMetrics,
} from "./gc-metrics";
export { CircuitBreakerState, TelemetryCircuitBreaker } from "./health/CircuitBreaker";
export {
  formatHealthReportForLog,
  generateComprehensiveHealthReport,
  getHealthStatusCode,
} from "./health/comprehensiveHealth";
// Health monitoring exports
export {
  type CircuitBreakerStats,
  type ExporterHealth,
  type ExportStats,
  getTelemetryHealth,
  getTelemetryHealthStatus,
  markTelemetryInitialized,
  type TelemetryHealthData,
  type TelemetryHealthStatus,
  telemetryHealthMonitor,
} from "./health/telemetryHealth";
// Main telemetry exports and initialization
export { getTelemetrySDK, initializeTelemetry, shutdownTelemetry } from "./instrumentation";
// Lifecycle logging
export {
  flushShutdownMessages,
  generateShutdownSequence,
  generateStartupSequence,
  LifecycleObservabilityLogger,
  lifecycleLogger,
  logLifecycleEvent,
  logShutdownSequence,
  type ShutdownMessage,
} from "./lifecycle-logger";
// Metrics exports (centralized via metrics/index.ts per monitoring-updated.md)
export {
  type DatabaseMetricsLabels,
  // Instrument definitions
  getAvailableMetricNames,
  // Initialization
  getCounter,
  // Database metrics
  getDatabaseMetricsStatus,
  getHistogram,
  getMetricsInitializationStatus,
  // HTTP metrics
  getMetricsStatus,
  getUpDownCounter,
  INSTRUMENT_COUNT,
  INSTRUMENT_DEFINITIONS,
  initializeDatabaseMetrics,
  initializeHttpMetrics,
  initializeMetrics,
  isMetricsInitialized,
  METER_NAMES,
  type MetricInstruments,
  recordConnectionChange,
  recordDatabaseOperation,
  recordGraphQLRequest,
  recordGraphQLResponseTime,
  recordHttpRequest,
  recordHttpResponseTime,
  recordSLIMetric,
  resetMetrics,
} from "./metrics";
// Process metrics
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
} from "./metrics/process-metrics";
// Profiling metrics
export {
  completeProfilingSession,
  failProfilingSession,
  getActiveSessions,
  getProfilingMetricsState,
  initializeProfilingMetrics,
  isProfilingActive,
  type ProfilingMetricsState,
  type ProfilingSession,
  type ProfilingTriggerReason,
  shutdownProfilingMetrics,
  startProfilingSession,
  triggerSLAViolationProfiling,
} from "./profiling-metrics";
// SLA monitoring
export {
  getSlaMonitor,
  initializeSlaMonitor,
  type PercentileMetrics,
  SlaMonitor,
  type SlaMonitorConfig,
  type SlaMonitorStats,
  type SlaThreshold,
  type SlaViolation,
  shutdownSlaMonitor,
} from "./sla-monitor";
// Per-signal circuit breakers
export {
  canExecuteSignal,
  getSignalCircuitBreaker,
  getSignalStats,
  getTelemetryCircuitBreakersStatus,
  initializeTelemetryCircuitBreakers,
  logCircuitBreaker,
  metricCircuitBreaker,
  recordSignalFailure,
  recordSignalSuccess,
  resetAllCircuitBreakers,
  type SignalCircuitBreakerStats,
  shutdownTelemetryCircuitBreakers,
  type TelemetryCircuitBreakersStatus,
  type TelemetrySignal,
  traceCircuitBreaker,
} from "./telemetry-circuit-breaker";
// Tracing exports
export {
  createCouchbaseGetSpan,
  createCouchbaseQuerySpan,
  createCouchbaseSearchSpan,
  createDatabaseSpan,
} from "./tracing/dbSpans";
export type { LogContext, LogLevel, StructuredLogData } from "./winston-logger";
// Logging exports (Winston-based with ECS field mapping and OTLP transport)
export { debug, err, error, log, telemetryLogger, warn, winstonTelemetryLogger } from "./winston-logger";
