/* src/telemetry/index.ts */

// Re-export telemetry config from unified system
export { loadTelemetryConfigFromEnv, telemetryConfig } from "$config";
// Configuration exports (now unified - use $config instead)
// @deprecated Use unified config.telemetry instead of these exports
export { type TelemetryConfig, validateTelemetryConfig } from "./config";
export { CircuitBreakerState, TelemetryCircuitBreaker } from "./health/CircuitBreaker";
export {
  formatHealthReportForLog,
  generateComprehensiveHealthReport,
  getHealthStatusCode,
} from "./health/comprehensiveHealth";
// Health monitoring exports
export {
  getTelemetryHealth,
  getTelemetryHealthStatus,
  markTelemetryInitialized,
  telemetryHealthMonitor,
  type CircuitBreakerStats,
  type ExporterHealth,
  type ExportStats,
  type TelemetryHealthData,
  type TelemetryHealthStatus,
} from "./health/telemetryHealth";
// Main telemetry exports and initialization
export { getTelemetrySDK, initializeTelemetry, shutdownTelemetry } from "./instrumentation";
// Logging exports (Winston-based with ECS field mapping and OTLP transport)
export { debug, err, error, log, telemetryLogger, warn, winstonTelemetryLogger } from "./winston-logger";
export type { LogContext, LogLevel, StructuredLogData } from "./winston-logger";
// Metrics exports (centralized via metrics/index.ts per monitoring-updated.md)
export {
  // Initialization
  getCounter,
  getHistogram,
  getMetricsInitializationStatus,
  getUpDownCounter,
  initializeMetrics,
  isMetricsInitialized,
  METER_NAMES,
  resetMetrics,
  // Instrument definitions
  getAvailableMetricNames,
  INSTRUMENT_COUNT,
  INSTRUMENT_DEFINITIONS,
  type MetricInstruments,
  // HTTP metrics
  getMetricsStatus,
  initializeHttpMetrics,
  recordGraphQLRequest,
  recordGraphQLResponseTime,
  recordHttpRequest,
  recordHttpResponseTime,
  // Database metrics
  getDatabaseMetricsStatus,
  initializeDatabaseMetrics,
  recordConnectionChange,
  recordDatabaseOperation,
  recordSLIMetric,
  type DatabaseMetricsLabels,
} from "./metrics";
// Tracing exports
export {
  createCouchbaseGetSpan,
  createCouchbaseQuerySpan,
  createCouchbaseSearchSpan,
  createDatabaseSpan,
} from "./tracing/dbSpans";

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
  shutdownTelemetryCircuitBreakers,
  traceCircuitBreaker,
  type SignalCircuitBreakerStats,
  type TelemetryCircuitBreakersStatus,
  type TelemetrySignal,
} from "./telemetry-circuit-breaker";

// GC metrics
export {
  forceGC,
  getAverageGCDuration,
  getCurrentHeapStats,
  getGCFrequency,
  getGCMetricsState,
  initializeGCMetrics,
  isGCMetricsRunning,
  resetGCMetrics,
  shutdownGCMetrics,
  type GCEvent,
  type GCEventCallback,
  type GCMetricsState,
  type GCType,
  type HeapStats,
} from "./gc-metrics";

// Process metrics
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
} from "./metrics/process-metrics";

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

// Profiling metrics
export {
  completeProfilingSession,
  failProfilingSession,
  getActiveSessions,
  getProfilingMetricsState,
  initializeProfilingMetrics,
  isProfilingActive,
  shutdownProfilingMetrics,
  startProfilingSession,
  triggerSLAViolationProfiling,
  type ProfilingMetricsState,
  type ProfilingSession,
  type ProfilingTriggerReason,
} from "./profiling-metrics";

// SLA monitoring
export {
  getSlaMonitor,
  initializeSlaMonitor,
  shutdownSlaMonitor,
  SlaMonitor,
  type PercentileMetrics,
  type SlaMonitorConfig,
  type SlaMonitorStats,
  type SlaThreshold,
  type SlaViolation,
} from "./sla-monitor";
