/* src/services/health/index.ts */
// Health services barrel export - matches reference format exactly

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

// Couchbase health service
export {
  couchbaseHealthService,
  CouchbaseHealthService,
  getCouchbaseHealthDetails,
  pingCouchbaseForReadiness,
} from "./couchbaseHealth";

// Cache health service
export {
  cacheHealthService,
  CacheHealthService,
  getCacheHealthDetails,
  isCacheReady,
} from "./cacheHealth";

// Telemetry health service
export {
  getTelemetryHealthDetails,
  isTelemetryReady,
  telemetryHealthService,
  TelemetryHealthService,
} from "./telemetryHealth";

// Comprehensive health service
export {
  comprehensiveHealthService,
  ComprehensiveHealthService,
  getComprehensiveHealth,
  getLivenessCheck,
  getReadinessCheck,
} from "./comprehensiveHealth";
