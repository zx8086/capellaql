/* src/telemetry/metrics/instruments.ts */

import type { Attributes, Counter, Gauge, Histogram } from "@opentelemetry/api";
import type {
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

// HTTP Metrics
export let httpRequestCounter: Counter<HttpRequestAttributes>;
export let httpRequestsByStatusCounter: Counter<HttpRequestAttributes>;
export let httpResponseTimeHistogram: Histogram<HttpRequestAttributes>;
export let httpRequestSizeHistogram: Histogram<HttpRequestAttributes>;
export let httpResponseSizeHistogram: Histogram<HttpRequestAttributes>;
export let httpActiveRequestsGauge: Gauge<HttpRequestAttributes>;
export let httpRequestsInFlightGauge: Gauge<HttpRequestAttributes>;

// Process Metrics
export let processStartTimeGauge: Gauge<ProcessAttributes>;
export let processUptimeGauge: Gauge<ProcessAttributes>;
export let processMemoryUsageGauge: Gauge<ProcessAttributes>;
export let processHeapUsedGauge: Gauge<ProcessAttributes>;
export let processHeapTotalGauge: Gauge<ProcessAttributes>;
export let processRssGauge: Gauge<ProcessAttributes>;
export let processExternalGauge: Gauge<ProcessAttributes>;
export let processCpuUsageGauge: Gauge<ProcessAttributes>;
export let processEventLoopDelayHistogram: Histogram<ProcessAttributes>;
export let processEventLoopUtilizationGauge: Gauge<ProcessAttributes>;

// System Metrics
export let systemMemoryUsageGauge: Gauge<ProcessAttributes>;
export let systemMemoryFreeGauge: Gauge<ProcessAttributes>;
export let systemMemoryTotalGauge: Gauge<ProcessAttributes>;
export let systemCpuUsageGauge: Gauge<ProcessAttributes>;
export let systemLoadAverageGauge: Gauge<ProcessAttributes>;

// GC Metrics
export let gcCollectionCounter: Counter<ProcessAttributes>;
export let gcDurationHistogram: Histogram<ProcessAttributes>;
export let gcOldGenerationSizeBeforeGauge: Gauge<ProcessAttributes>;
export let gcOldGenerationSizeAfterGauge: Gauge<ProcessAttributes>;
export let gcYoungGenerationSizeBeforeGauge: Gauge<ProcessAttributes>;
export let gcYoungGenerationSizeAfterGauge: Gauge<ProcessAttributes>;

// File/Network Metrics
export let fileDescriptorUsageGauge: Gauge<ProcessAttributes>;
export let fileDescriptorLimitGauge: Gauge<ProcessAttributes>;
export let networkBytesInCounter: Counter<ProcessAttributes>;
export let networkBytesOutCounter: Counter<ProcessAttributes>;

// Thread Pool Metrics
export let threadPoolPendingGauge: Gauge<ProcessAttributes>;
export let threadPoolActiveGauge: Gauge<ProcessAttributes>;
export let threadPoolIdleGauge: Gauge<ProcessAttributes>;
export let handleUsageGauge: Gauge<ProcessAttributes>;

// JWT/Auth Metrics
export let jwtTokenCreationTimeHistogram: Histogram<AuthAttributes>;
export let authenticationAttemptsCounter: Counter<AuthAttributes>;
export let authenticationSuccessCounter: Counter<AuthAttributes>;
export let authenticationFailureCounter: Counter<AuthAttributes>;

// Kong Metrics
export let kongOperationsCounter: Counter<KongAttributes>;
export let kongResponseTimeHistogram: Histogram<KongAttributes>;
export let kongCacheHitCounter: Counter<KongAttributes>;
export let kongCacheMissCounter: Counter<KongAttributes>;

// Redis Metrics
export let redisOperationsCounter: Counter<RedisAttributes>;
export let redisOperationDurationHistogram: Histogram<RedisAttributes>;
export let redisConnectionsGauge: Gauge<RedisAttributes>;
export let redisCacheHitCounter: Counter<RedisAttributes>;
export let redisCacheMissCounter: Counter<RedisAttributes>;
export let redisErrorsCounter: Counter<ErrorAttributes>;

// Error Metrics
export let errorRateCounter: Counter<ErrorAttributes>;
export let exceptionCounter: Counter<ErrorAttributes>;

// Telemetry Metrics
export let telemetryExportCounter: Counter<TelemetryAttributes>;
export let telemetryExportErrorCounter: Counter<TelemetryAttributes>;

// Circuit Breaker Metrics
export let circuitBreakerStateGauge: Gauge<CircuitBreakerAttributes>;
export let circuitBreakerRequestsCounter: Counter<CircuitBreakerAttributes>;
export let circuitBreakerRejectedCounter: Counter<CircuitBreakerAttributes>;
export let circuitBreakerFallbackCounter: Counter<CircuitBreakerAttributes>;
export let circuitBreakerStateTransitionCounter: Counter<CircuitBreakerAttributes>;

// Cache Tier Metrics
export let cacheTierUsageCounter: Counter<CacheTierAttributes>;
export let cacheTierLatencyHistogram: Histogram<CacheTierAttributes>;
export let cacheTierErrorCounter: Counter<ErrorAttributes>;

// General Operation Metrics
export let operationDurationHistogram: Histogram<Attributes>;

// API Versioning Metrics
export let apiVersionRequestsCounter: Counter<ApiVersionAttributes>;
export let apiVersionHeaderSourceCounter: Counter<ApiVersionAttributes>;
export let apiVersionUnsupportedCounter: Counter<ApiVersionAttributes>;
export let apiVersionFallbackCounter: Counter<ApiVersionAttributes>;
export let apiVersionParsingDurationHistogram: Histogram<ApiVersionAttributes>;
export let apiVersionRoutingDurationHistogram: Histogram<ApiVersionAttributes>;

// Consumer Volume Metrics
export let consumerRequestsByVolumeCounter: Counter<ConsumerVolumeAttributes>;
export let consumerErrorsByVolumeCounter: Counter<ConsumerVolumeAttributes>;
export let consumerLatencyByVolumeHistogram: Histogram<ConsumerVolumeAttributes>;

// Security Metrics (V2)
export let securityEventsCounter: Counter<SecurityAttributes>;
export let securityHeadersAppliedCounter: Counter<SecurityAttributes>;
export let auditEventsCounter: Counter<SecurityAttributes>;
export let securityRiskScoreHistogram: Histogram<SecurityAttributes>;
export let securityAnomaliesCounter: Counter<SecurityAttributes>;

// Instrument setters (used during initialization)
export function setHttpInstruments(instruments: {
  httpRequestCounter: Counter<HttpRequestAttributes>;
  httpRequestsByStatusCounter: Counter<HttpRequestAttributes>;
  httpResponseTimeHistogram: Histogram<HttpRequestAttributes>;
  httpRequestSizeHistogram: Histogram<HttpRequestAttributes>;
  httpResponseSizeHistogram: Histogram<HttpRequestAttributes>;
  httpActiveRequestsGauge: Gauge<HttpRequestAttributes>;
  httpRequestsInFlightGauge: Gauge<HttpRequestAttributes>;
}): void {
  httpRequestCounter = instruments.httpRequestCounter;
  httpRequestsByStatusCounter = instruments.httpRequestsByStatusCounter;
  httpResponseTimeHistogram = instruments.httpResponseTimeHistogram;
  httpRequestSizeHistogram = instruments.httpRequestSizeHistogram;
  httpResponseSizeHistogram = instruments.httpResponseSizeHistogram;
  httpActiveRequestsGauge = instruments.httpActiveRequestsGauge;
  httpRequestsInFlightGauge = instruments.httpRequestsInFlightGauge;
}

export function setProcessInstruments(instruments: {
  processStartTimeGauge: Gauge<ProcessAttributes>;
  processUptimeGauge: Gauge<ProcessAttributes>;
  processMemoryUsageGauge: Gauge<ProcessAttributes>;
  processHeapUsedGauge: Gauge<ProcessAttributes>;
  processHeapTotalGauge: Gauge<ProcessAttributes>;
  processRssGauge: Gauge<ProcessAttributes>;
  processExternalGauge: Gauge<ProcessAttributes>;
  processCpuUsageGauge: Gauge<ProcessAttributes>;
  processEventLoopDelayHistogram: Histogram<ProcessAttributes>;
  processEventLoopUtilizationGauge: Gauge<ProcessAttributes>;
  systemMemoryUsageGauge: Gauge<ProcessAttributes>;
  systemMemoryFreeGauge: Gauge<ProcessAttributes>;
  systemMemoryTotalGauge: Gauge<ProcessAttributes>;
  systemCpuUsageGauge: Gauge<ProcessAttributes>;
  systemLoadAverageGauge: Gauge<ProcessAttributes>;
  gcCollectionCounter: Counter<ProcessAttributes>;
  gcDurationHistogram: Histogram<ProcessAttributes>;
  gcOldGenerationSizeBeforeGauge: Gauge<ProcessAttributes>;
  gcOldGenerationSizeAfterGauge: Gauge<ProcessAttributes>;
  gcYoungGenerationSizeBeforeGauge: Gauge<ProcessAttributes>;
  gcYoungGenerationSizeAfterGauge: Gauge<ProcessAttributes>;
  fileDescriptorUsageGauge: Gauge<ProcessAttributes>;
  fileDescriptorLimitGauge: Gauge<ProcessAttributes>;
  networkBytesInCounter: Counter<ProcessAttributes>;
  networkBytesOutCounter: Counter<ProcessAttributes>;
  threadPoolPendingGauge: Gauge<ProcessAttributes>;
  threadPoolActiveGauge: Gauge<ProcessAttributes>;
  threadPoolIdleGauge: Gauge<ProcessAttributes>;
  handleUsageGauge: Gauge<ProcessAttributes>;
}): void {
  processStartTimeGauge = instruments.processStartTimeGauge;
  processUptimeGauge = instruments.processUptimeGauge;
  processMemoryUsageGauge = instruments.processMemoryUsageGauge;
  processHeapUsedGauge = instruments.processHeapUsedGauge;
  processHeapTotalGauge = instruments.processHeapTotalGauge;
  processRssGauge = instruments.processRssGauge;
  processExternalGauge = instruments.processExternalGauge;
  processCpuUsageGauge = instruments.processCpuUsageGauge;
  processEventLoopDelayHistogram = instruments.processEventLoopDelayHistogram;
  processEventLoopUtilizationGauge = instruments.processEventLoopUtilizationGauge;
  systemMemoryUsageGauge = instruments.systemMemoryUsageGauge;
  systemMemoryFreeGauge = instruments.systemMemoryFreeGauge;
  systemMemoryTotalGauge = instruments.systemMemoryTotalGauge;
  systemCpuUsageGauge = instruments.systemCpuUsageGauge;
  systemLoadAverageGauge = instruments.systemLoadAverageGauge;
  gcCollectionCounter = instruments.gcCollectionCounter;
  gcDurationHistogram = instruments.gcDurationHistogram;
  gcOldGenerationSizeBeforeGauge = instruments.gcOldGenerationSizeBeforeGauge;
  gcOldGenerationSizeAfterGauge = instruments.gcOldGenerationSizeAfterGauge;
  gcYoungGenerationSizeBeforeGauge = instruments.gcYoungGenerationSizeBeforeGauge;
  gcYoungGenerationSizeAfterGauge = instruments.gcYoungGenerationSizeAfterGauge;
  fileDescriptorUsageGauge = instruments.fileDescriptorUsageGauge;
  fileDescriptorLimitGauge = instruments.fileDescriptorLimitGauge;
  networkBytesInCounter = instruments.networkBytesInCounter;
  networkBytesOutCounter = instruments.networkBytesOutCounter;
  threadPoolPendingGauge = instruments.threadPoolPendingGauge;
  threadPoolActiveGauge = instruments.threadPoolActiveGauge;
  threadPoolIdleGauge = instruments.threadPoolIdleGauge;
  handleUsageGauge = instruments.handleUsageGauge;
}

export function setAuthInstruments(instruments: {
  jwtTokenCreationTimeHistogram: Histogram<AuthAttributes>;
  authenticationAttemptsCounter: Counter<AuthAttributes>;
  authenticationSuccessCounter: Counter<AuthAttributes>;
  authenticationFailureCounter: Counter<AuthAttributes>;
}): void {
  jwtTokenCreationTimeHistogram = instruments.jwtTokenCreationTimeHistogram;
  authenticationAttemptsCounter = instruments.authenticationAttemptsCounter;
  authenticationSuccessCounter = instruments.authenticationSuccessCounter;
  authenticationFailureCounter = instruments.authenticationFailureCounter;
}

export function setKongInstruments(instruments: {
  kongOperationsCounter: Counter<KongAttributes>;
  kongResponseTimeHistogram: Histogram<KongAttributes>;
  kongCacheHitCounter: Counter<KongAttributes>;
  kongCacheMissCounter: Counter<KongAttributes>;
}): void {
  kongOperationsCounter = instruments.kongOperationsCounter;
  kongResponseTimeHistogram = instruments.kongResponseTimeHistogram;
  kongCacheHitCounter = instruments.kongCacheHitCounter;
  kongCacheMissCounter = instruments.kongCacheMissCounter;
}

export function setRedisInstruments(instruments: {
  redisOperationsCounter: Counter<RedisAttributes>;
  redisOperationDurationHistogram: Histogram<RedisAttributes>;
  redisConnectionsGauge: Gauge<RedisAttributes>;
  redisCacheHitCounter: Counter<RedisAttributes>;
  redisCacheMissCounter: Counter<RedisAttributes>;
  redisErrorsCounter: Counter<ErrorAttributes>;
}): void {
  redisOperationsCounter = instruments.redisOperationsCounter;
  redisOperationDurationHistogram = instruments.redisOperationDurationHistogram;
  redisConnectionsGauge = instruments.redisConnectionsGauge;
  redisCacheHitCounter = instruments.redisCacheHitCounter;
  redisCacheMissCounter = instruments.redisCacheMissCounter;
  redisErrorsCounter = instruments.redisErrorsCounter;
}

export function setErrorInstruments(instruments: {
  errorRateCounter: Counter<ErrorAttributes>;
  exceptionCounter: Counter<ErrorAttributes>;
}): void {
  errorRateCounter = instruments.errorRateCounter;
  exceptionCounter = instruments.exceptionCounter;
}

export function setTelemetryInstruments(instruments: {
  telemetryExportCounter: Counter<TelemetryAttributes>;
  telemetryExportErrorCounter: Counter<TelemetryAttributes>;
}): void {
  telemetryExportCounter = instruments.telemetryExportCounter;
  telemetryExportErrorCounter = instruments.telemetryExportErrorCounter;
}

export function setCircuitBreakerInstruments(instruments: {
  circuitBreakerStateGauge: Gauge<CircuitBreakerAttributes>;
  circuitBreakerRequestsCounter: Counter<CircuitBreakerAttributes>;
  circuitBreakerRejectedCounter: Counter<CircuitBreakerAttributes>;
  circuitBreakerFallbackCounter: Counter<CircuitBreakerAttributes>;
  circuitBreakerStateTransitionCounter: Counter<CircuitBreakerAttributes>;
}): void {
  circuitBreakerStateGauge = instruments.circuitBreakerStateGauge;
  circuitBreakerRequestsCounter = instruments.circuitBreakerRequestsCounter;
  circuitBreakerRejectedCounter = instruments.circuitBreakerRejectedCounter;
  circuitBreakerFallbackCounter = instruments.circuitBreakerFallbackCounter;
  circuitBreakerStateTransitionCounter = instruments.circuitBreakerStateTransitionCounter;
}

export function setCacheInstruments(instruments: {
  cacheTierUsageCounter: Counter<CacheTierAttributes>;
  cacheTierLatencyHistogram: Histogram<CacheTierAttributes>;
  cacheTierErrorCounter: Counter<ErrorAttributes>;
  operationDurationHistogram: Histogram<Attributes>;
}): void {
  cacheTierUsageCounter = instruments.cacheTierUsageCounter;
  cacheTierLatencyHistogram = instruments.cacheTierLatencyHistogram;
  cacheTierErrorCounter = instruments.cacheTierErrorCounter;
  operationDurationHistogram = instruments.operationDurationHistogram;
}

export function setApiVersionInstruments(instruments: {
  apiVersionRequestsCounter: Counter<ApiVersionAttributes>;
  apiVersionHeaderSourceCounter: Counter<ApiVersionAttributes>;
  apiVersionUnsupportedCounter: Counter<ApiVersionAttributes>;
  apiVersionFallbackCounter: Counter<ApiVersionAttributes>;
  apiVersionParsingDurationHistogram: Histogram<ApiVersionAttributes>;
  apiVersionRoutingDurationHistogram: Histogram<ApiVersionAttributes>;
}): void {
  apiVersionRequestsCounter = instruments.apiVersionRequestsCounter;
  apiVersionHeaderSourceCounter = instruments.apiVersionHeaderSourceCounter;
  apiVersionUnsupportedCounter = instruments.apiVersionUnsupportedCounter;
  apiVersionFallbackCounter = instruments.apiVersionFallbackCounter;
  apiVersionParsingDurationHistogram = instruments.apiVersionParsingDurationHistogram;
  apiVersionRoutingDurationHistogram = instruments.apiVersionRoutingDurationHistogram;
}

export function setConsumerVolumeInstruments(instruments: {
  consumerRequestsByVolumeCounter: Counter<ConsumerVolumeAttributes>;
  consumerErrorsByVolumeCounter: Counter<ConsumerVolumeAttributes>;
  consumerLatencyByVolumeHistogram: Histogram<ConsumerVolumeAttributes>;
}): void {
  consumerRequestsByVolumeCounter = instruments.consumerRequestsByVolumeCounter;
  consumerErrorsByVolumeCounter = instruments.consumerErrorsByVolumeCounter;
  consumerLatencyByVolumeHistogram = instruments.consumerLatencyByVolumeHistogram;
}

export function setSecurityInstruments(instruments: {
  securityEventsCounter: Counter<SecurityAttributes>;
  securityHeadersAppliedCounter: Counter<SecurityAttributes>;
  auditEventsCounter: Counter<SecurityAttributes>;
  securityRiskScoreHistogram: Histogram<SecurityAttributes>;
  securityAnomaliesCounter: Counter<SecurityAttributes>;
}): void {
  securityEventsCounter = instruments.securityEventsCounter;
  securityHeadersAppliedCounter = instruments.securityHeadersAppliedCounter;
  auditEventsCounter = instruments.auditEventsCounter;
  securityRiskScoreHistogram = instruments.securityRiskScoreHistogram;
  securityAnomaliesCounter = instruments.securityAnomaliesCounter;
}
