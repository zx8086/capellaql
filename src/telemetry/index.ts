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
export { getTelemetryHealth, telemetryHealthMonitor } from "./health/telemetryHealth";
// Main telemetry exports and initialization
export { getSimpleSmartSampler, getTelemetrySDK, initializeTelemetry, shutdownTelemetry } from "./instrumentation";
// Logging exports (Winston-based with ECS field mapping and OTLP transport)
export { debug, err, error, log, telemetryLogger, warn, winstonTelemetryLogger } from "./winston-logger";
export type { LogContext, LogLevel, StructuredLogData } from "./winston-logger";
export {
  getDatabaseMetricsStatus,
  initializeDatabaseMetrics,
  recordConnectionChange,
  recordDatabaseOperation,
  recordSLIMetric,
} from "./metrics/databaseMetrics";
// Metrics exports
export {
  getMetricsStatus,
  initializeHttpMetrics,
  recordGraphQLRequest,
  recordGraphQLResponseTime,
  recordHttpRequest,
  recordHttpResponseTime,
} from "./metrics/httpMetrics";
export {
  createCostOptimizedSampler,
  createHighFidelitySampler,
  estimateCostImpact,
  type SimpleSamplingDecision,
  SimpleSmartSampler,
  type SimpleSmartSamplingConfig,
} from "./sampling/SimpleSmartSampler";
// Sampling exports
export { SmartSampler, type SmartSamplingConfig } from "./sampling/SmartSampler";
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
