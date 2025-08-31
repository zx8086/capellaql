/* src/telemetry/index.ts */

// Re-export telemetry config from unified system
export { loadTelemetryConfigFromEnv, telemetryConfig } from "$config";
// Configuration exports (now unified - use $config instead)
// @deprecated Use unified config.telemetry instead of these exports
export { type TelemetryConfig, validateTelemetryConfig } from "./config";
export { CircuitBreakerState, TelemetryCircuitBreaker } from "./health/CircuitBreaker";
// Health monitoring exports
export { getTelemetryHealth, telemetryHealthMonitor } from "./health/telemetryHealth";
export {
  formatHealthReportForLog,
  generateComprehensiveHealthReport,
  getHealthStatusCode,
} from "./health/comprehensiveHealth";
// Main telemetry exports and initialization
export { getTelemetrySDK, initializeTelemetry, shutdownTelemetry } from "./instrumentation";
// Logging exports
export { debug, err, error, log, telemetryLogger, warn } from "./logger";
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
  getDatabaseMetricsStatus,
  initializeDatabaseMetrics,
  recordConnectionChange,
  recordDatabaseOperation,
  recordSLIMetric,
} from "./metrics/databaseMetrics";
// Sampling exports
export { SmartSampler, type SmartSamplingConfig } from "./sampling/SmartSampler";
// Tracing exports
export {
  createCouchbaseGetSpan,
  createCouchbaseQuerySpan,
  createCouchbaseSearchSpan,
  createDatabaseSpan,
} from "./tracing/dbSpans";
