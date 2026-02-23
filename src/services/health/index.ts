/* src/services/health/index.ts */
// Health services barrel export - matches reference format exactly

// Cache health service
export {
  CacheHealthService,
  cacheHealthService,
  getCacheHealthDetails,
  isCacheReady,
} from "./cacheHealth";
// Comprehensive health service
export {
  ComprehensiveHealthService,
  comprehensiveHealthService,
  getComprehensiveHealth,
  getLivenessCheck,
  getReadinessCheck,
} from "./comprehensiveHealth";

// Couchbase health service
export {
  CouchbaseHealthService,
  couchbaseHealthService,
  getCouchbaseHealthDetails,
  pingCouchbaseForReadiness,
} from "./couchbaseHealth";
// Telemetry health service
export {
  getTelemetryHealthDetails,
  isTelemetryReady,
  TelemetryHealthService,
  telemetryHealthService,
} from "./telemetryHealth";
// Types (simplified to match reference format)
export type {
  CacheDependency,
  CircuitBreakerState,
  CouchbaseDependency,
  HealthCheckResponse,
  HealthStatus,
  LivenessCheckResponse,
  ReadinessCheckResponse,
  TelemetryHealthDetails,
  TelemetrySignalHealth,
} from "./types";
// Utility functions
export { formatPercentage, formatResponseTime, formatUptime } from "./types";
