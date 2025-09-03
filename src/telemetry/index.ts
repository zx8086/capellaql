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
export { getTelemetrySDK, initializeTelemetry, shutdownTelemetry } from "./instrumentation";
// Logging exports
export { debug, err, error, log, telemetryLogger, warn } from "./logger";
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
// Sampling exports
export { SmartSampler, type SmartSamplingConfig } from "./sampling/SmartSampler";
export { 
  SimpleSmartSampler, 
  type SimpleSmartSamplingConfig, 
  type SimpleSamplingDecision,
  createCostOptimizedSampler,
  createHighFidelitySampler,
  estimateCostImpact
} from "./sampling/SimpleSmartSampler";
export { getSimpleSmartSampler } from "./instrumentation";
// Tracing exports
export {
  createCouchbaseGetSpan,
  createCouchbaseQuerySpan,
  createCouchbaseSearchSpan,
  createDatabaseSpan,
} from "./tracing/dbSpans";
