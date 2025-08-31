/* src/telemetry/index.ts */

// Main telemetry exports and initialization
export { initializeTelemetry, getTelemetrySDK, shutdownTelemetry } from './instrumentation';

// Logging exports
export { log, debug, warn, err, error, telemetryLogger } from './logger';

// Metrics exports
export {
  initializeHttpMetrics,
  recordHttpRequest,
  recordHttpResponseTime,
  recordGraphQLRequest,
  recordGraphQLResponseTime,
  getMetricsStatus
} from './metrics/httpMetrics';

// Tracing exports
export {
  createDatabaseSpan,
  createCouchbaseGetSpan,
  createCouchbaseQuerySpan,
  createCouchbaseSearchSpan
} from './tracing/dbSpans';

// Health monitoring exports
export { getTelemetryHealth, telemetryHealthMonitor } from './health/telemetryHealth';
export { TelemetryCircuitBreaker, CircuitBreakerState } from './health/CircuitBreaker';

// Configuration exports
export { validateTelemetryConfig, loadTelemetryConfigFromEnv, type TelemetryConfig } from './config';

// Sampling exports
export { SmartSampler, type SmartSamplingConfig } from './sampling/SmartSampler';