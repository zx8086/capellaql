// src/telemetry/metrics/index.ts

import { error, log as info, warn } from "../../utils/logger";
import { stopMemoryPressureMonitoring } from "./process-metrics";
import { isMetricsInitialized, setMetricsInitialized } from "./state";

export { getCardinalityStats } from "../cardinality-guard";
export {
  recordApiVersionFallback,
  recordApiVersionHeaderSource,
  recordApiVersionParsing,
  recordApiVersionParsingDuration,
  recordApiVersionRequest,
  recordApiVersionRoutingDuration,
  recordApiVersionUnsupported,
  recordApiVersionUsage,
} from "./api-version-metrics";
export {
  recordAuthenticationAttempt,
  recordAuthenticationFailure,
  recordAuthenticationSuccess,
  recordJwtTokenCreation,
  recordJwtTokenIssued,
} from "./auth-metrics";
export {
  recordCacheTierError,
  recordCacheTierLatency,
  recordCacheTierUsage,
  recordOperationDuration,
} from "./cache-metrics";
export {
  recordCircuitBreakerFallback,
  recordCircuitBreakerOperation,
  recordCircuitBreakerRejection,
  recordCircuitBreakerRequest,
  recordCircuitBreakerState,
  recordCircuitBreakerStateTransition,
} from "./circuit-breaker-metrics";
export {
  recordConsumerError,
  recordConsumerLatency,
  recordConsumerRequest,
} from "./consumer-metrics";
export { recordError, recordException } from "./error-metrics";
export {
  recordActiveRequests,
  recordHttpRequest,
  recordHttpRequestSize,
  recordHttpResponseSize,
  recordHttpResponseTime,
} from "./http-metrics";
export { initializeMetrics } from "./initialization";
export {
  apiVersionFallbackCounter,
  apiVersionHeaderSourceCounter,
  apiVersionParsingDurationHistogram,
  apiVersionRequestsCounter,
  apiVersionRoutingDurationHistogram,
  apiVersionUnsupportedCounter,
  auditEventsCounter,
  authenticationAttemptsCounter,
  authenticationFailureCounter,
  authenticationSuccessCounter,
  cacheTierErrorCounter,
  cacheTierLatencyHistogram,
  cacheTierUsageCounter,
  circuitBreakerFallbackCounter,
  circuitBreakerRejectedCounter,
  circuitBreakerRequestsCounter,
  circuitBreakerStateGauge,
  circuitBreakerStateTransitionCounter,
  consumerErrorsByVolumeCounter,
  consumerLatencyByVolumeHistogram,
  consumerRequestsByVolumeCounter,
  errorRateCounter,
  exceptionCounter,
  fileDescriptorLimitGauge,
  fileDescriptorUsageGauge,
  gcCollectionCounter,
  gcDurationHistogram,
  gcOldGenerationSizeAfterGauge,
  gcOldGenerationSizeBeforeGauge,
  gcYoungGenerationSizeAfterGauge,
  gcYoungGenerationSizeBeforeGauge,
  handleUsageGauge,
  httpActiveRequestsGauge,
  httpRequestCounter,
  httpRequestSizeHistogram,
  httpRequestsByStatusCounter,
  httpRequestsInFlightGauge,
  httpResponseSizeHistogram,
  httpResponseTimeHistogram,
  jwtTokenCreationTimeHistogram,
  kongCacheHitCounter,
  kongCacheMissCounter,
  kongOperationsCounter,
  kongResponseTimeHistogram,
  networkBytesInCounter,
  networkBytesOutCounter,
  operationDurationHistogram,
  processCpuUsageGauge,
  processEventLoopDelayHistogram,
  processEventLoopUtilizationGauge,
  processExternalGauge,
  processHeapTotalGauge,
  processHeapUsedGauge,
  processMemoryUsageGauge,
  processRssGauge,
  processStartTimeGauge,
  processUptimeGauge,
  redisCacheHitCounter,
  redisCacheMissCounter,
  redisConnectionsGauge,
  redisErrorsCounter,
  redisOperationDurationHistogram,
  redisOperationsCounter,
  securityAnomaliesCounter,
  securityEventsCounter,
  securityHeadersAppliedCounter,
  securityRiskScoreHistogram,
  systemCpuUsageGauge,
  systemLoadAverageGauge,
  systemMemoryFreeGauge,
  systemMemoryTotalGauge,
  systemMemoryUsageGauge,
  telemetryExportCounter,
  telemetryExportErrorCounter,
  threadPoolActiveGauge,
  threadPoolIdleGauge,
  threadPoolPendingGauge,
} from "./instruments";
export {
  recordKongCacheHit,
  recordKongCacheMiss,
  recordKongOperation,
  recordKongResponseTime,
} from "./kong-metrics";
export {
  recordGCCollection,
  recordGCDuration,
  recordGCHeapSizes,
  setupSystemMetricsCollection,
  startMemoryPressureMonitoring,
  startSystemMetricsCollection,
  stopMemoryPressureMonitoring,
  stopSystemMetricsCollection,
} from "./process-metrics";
export { recordCacheOperation, recordRedisConnection, recordRedisOperation } from "./redis-metrics";
export {
  recordAuditEvent,
  recordSecurityEvent,
  recordSecurityHeaders,
  recordSecurityHeadersApplied,
} from "./security-metrics";
export { recordTelemetryExport, recordTelemetryExportError } from "./telemetry-metrics";
export type {
  ApiVersionAttributes,
  AuthAttributes,
  CacheTierAttributes,
  CircuitBreakerAttributes,
  ConsumerVolumeAttributes,
  ErrorAttributes,
  HttpRequestAttributes,
  KongAttributes,
  ProcessAttributes,
  RedisAttributes,
  SecurityAttributes,
  TelemetryAttributes,
} from "./types";

export function getMetricsStatus(): {
  initialized: boolean;
  instrumentCount: number;
  availableMetrics?: string[];
  instruments?: string[];
} {
  const metricNames = [
    "http_requests_total",
    "http_request_duration_seconds",
    "authentication_attempts_total",
    "kong_operations_total",
    "redis_operations_total",
    "security_events_total",
  ];

  return {
    initialized: isMetricsInitialized(),
    instrumentCount: isMetricsInitialized() ? 65 : 0,
    availableMetrics: isMetricsInitialized() ? metricNames : [],
    instruments: isMetricsInitialized() ? metricNames : [],
  };
}

export function shutdown(): void {
  stopMemoryPressureMonitoring();
  setMetricsInitialized(false);
  info("Metrics system shutdown completed");
}

export function shutdownMetrics(): void {
  shutdown();
}

export function testMetricRecording(): void {
  if (!isMetricsInitialized()) {
    warn("Metrics not initialized - cannot test recording");
    return;
  }

  info("Testing metric recording functionality");

  try {
    const httpMetrics = require("./http-metrics");
    const authMetrics = require("./auth-metrics");
    const kongMetrics = require("./kong-metrics");
    const redisMetrics = require("./redis-metrics");

    httpMetrics.recordHttpRequest("GET", "/test", 200);
    authMetrics.recordAuthenticationAttempt("test-consumer", true);
    kongMetrics.recordKongOperation("health_check", 50);
    redisMetrics.recordRedisOperation("get", 5);

    info("Test metric recording completed successfully");
  } catch (err) {
    error("Failed to test metric recording", {
      error: (err as Error).message,
    });
  }
}
