// src/telemetry/typed-metrics-poc.ts

import {
  type Attributes,
  type Counter,
  type Gauge,
  type Histogram,
  metrics,
} from "@opentelemetry/api";

interface HttpRequestAttributes extends Attributes {
  method: string;
  endpoint: string;
  status_code: string;
  version?: "v1" | "v2";
}

interface ProcessAttributes extends Attributes {
  component: string;
  pid: string;
}

interface AuthAttributes extends Attributes {
  consumer_id: string;
  operation: "token_generation" | "validation" | "refresh";
  result: "success" | "failure";
}

interface KongAttributes extends Attributes {
  operation: "get_consumer" | "create_credential" | "health_check";
  cache_status: "hit" | "miss" | "stale";
}

interface CircuitBreakerAttributes extends Attributes {
  operation: string;
  state: "closed" | "open" | "half_open";
}

interface ApiVersionAttributes extends Attributes {
  version: "v1" | "v2";
  endpoint: string;
  source: "header" | "default" | "fallback";
}

interface SecurityAttributes extends Attributes {
  event_type: "authentication_attempt" | "security_event" | "audit_event";
  severity: "low" | "medium" | "high" | "critical";
  version: "v2";
}

interface TypedMetricInstruments {
  httpRequestCounter: Counter<HttpRequestAttributes>;
  httpResponseTimeHistogram: Histogram<HttpRequestAttributes>;
  httpRequestsByStatusCounter: Counter<HttpRequestAttributes>;
  httpActiveConnectionsGauge: Gauge<HttpRequestAttributes>;
  httpRequestSizeHistogram: Histogram<HttpRequestAttributes>;
  httpResponseSizeHistogram: Histogram<HttpRequestAttributes>;

  processMemoryUsageGauge: Gauge<ProcessAttributes>;
  processHeapUsageGauge: Gauge<ProcessAttributes>;
  processCpuUsageGauge: Gauge<ProcessAttributes>;
  processUptimeGauge: Gauge<ProcessAttributes>;
  processActiveHandlesGauge: Gauge<ProcessAttributes>;

  jwtTokensIssuedCounter: Counter<AuthAttributes>;
  jwtTokenCreationTimeHistogram: Histogram<AuthAttributes>;
  authenticationAttemptsCounter: Counter<AuthAttributes>;
  authenticationSuccessCounter: Counter<AuthAttributes>;
  authenticationFailureCounter: Counter<AuthAttributes>;

  kongOperationsCounter: Counter<KongAttributes>;
  kongResponseTimeHistogram: Histogram<KongAttributes>;
  kongCacheHitCounter: Counter<KongAttributes>;
  kongCacheMissCounter: Counter<KongAttributes>;

  redisOperationsCounter: Counter<{ operation: string }>;
  redisOperationDurationHistogram: Histogram<{ operation: string }>;
  redisConnectionsGauge: Gauge<{ status: string }>;
  redisCacheHitCounter: Counter<{ key_pattern: string }>;
  redisCacheMissCounter: Counter<{ key_pattern: string }>;
  redisErrorsCounter: Counter<{ error_type: string }>;

  errorRateCounter: Counter<{ component: string }>;
  exceptionCounter: Counter<{ type: string; component: string }>;
  telemetryExportCounter: Counter<{ exporter: string }>;
  telemetryExportErrorCounter: Counter<{ exporter: string; error: string }>;

  circuitBreakerStateGauge: Gauge<CircuitBreakerAttributes>;
  circuitBreakerRequestsCounter: Counter<CircuitBreakerAttributes>;
  circuitBreakerRejectedCounter: Counter<CircuitBreakerAttributes>;
  circuitBreakerFallbackCounter: Counter<CircuitBreakerAttributes>;
  circuitBreakerStateTransitionCounter: Counter<CircuitBreakerAttributes>;

  cacheTierUsageCounter: Counter<{ tier: string; operation: string }>;
  cacheTierLatencyHistogram: Histogram<{ tier: string; operation: string }>;
  cacheTierErrorCounter: Counter<{ tier: string; error_type: string }>;

  operationDurationHistogram: Histogram<{ operation: string; component: string }>;

  apiVersionRequestsCounter: Counter<ApiVersionAttributes>;
  apiVersionHeaderSourceCounter: Counter<ApiVersionAttributes>;
  apiVersionUnsupportedCounter: Counter<ApiVersionAttributes>;
  apiVersionFallbackCounter: Counter<ApiVersionAttributes>;
  apiVersionParsingDurationHistogram: Histogram<ApiVersionAttributes>;
  apiVersionRoutingDurationHistogram: Histogram<ApiVersionAttributes>;

  consumerRequestsByVolumeCounter: Counter<{ volume_tier: "high" | "medium" | "low" }>;
  consumerErrorsByVolumeCounter: Counter<{ volume_tier: "high" | "medium" | "low" }>;
  consumerLatencyByVolumeHistogram: Histogram<{ volume_tier: "high" | "medium" | "low" }>;

  securityEventsCounter: Counter<SecurityAttributes>;
  securityHeadersAppliedCounter: Counter<SecurityAttributes>;
  auditEventsCounter: Counter<SecurityAttributes>;
  securityRiskScoreHistogram: Histogram<SecurityAttributes>;
  securityAnomaliesCounter: Counter<SecurityAttributes>;
}

class TypedMetricsManager {
  private static instance: TypedMetricsManager | null = null;
  private instruments: TypedMetricInstruments | null = null;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): TypedMetricsManager {
    if (!TypedMetricsManager.instance) {
      TypedMetricsManager.instance = new TypedMetricsManager();
    }
    return TypedMetricsManager.instance;
  }

  initialize(serviceName: string, serviceVersion: string): void {
    if (this.isInitialized) {
      return;
    }

    const meter = metrics.getMeter(serviceName, serviceVersion);

    this.instruments = {
      httpRequestCounter: meter.createCounter<HttpRequestAttributes>("http_requests_total", {
        description: "Total number of HTTP requests",
        unit: "requests",
      }),
      httpResponseTimeHistogram: meter.createHistogram<HttpRequestAttributes>(
        "http_request_duration_seconds",
        {
          description: "HTTP request duration in seconds",
          unit: "seconds",
        }
      ),
      httpRequestsByStatusCounter: meter.createCounter<HttpRequestAttributes>(
        "http_requests_by_status_total",
        {
          description: "HTTP requests grouped by status code",
          unit: "requests",
        }
      ),
      httpActiveConnectionsGauge: meter.createGauge<HttpRequestAttributes>(
        "http_active_connections",
        {
          description: "Number of active HTTP connections",
          unit: "connections",
        }
      ),
      httpRequestSizeHistogram: meter.createHistogram<HttpRequestAttributes>(
        "http_request_size_bytes",
        {
          description: "HTTP request size in bytes",
          unit: "bytes",
        }
      ),
      httpResponseSizeHistogram: meter.createHistogram<HttpRequestAttributes>(
        "http_response_size_bytes",
        {
          description: "HTTP response size in bytes",
          unit: "bytes",
        }
      ),

      processMemoryUsageGauge: meter.createGauge<ProcessAttributes>("process_memory_usage_bytes", {
        description: "Process memory usage in bytes",
        unit: "bytes",
      }),
      processHeapUsageGauge: meter.createGauge<ProcessAttributes>("process_heap_usage_bytes", {
        description: "Process heap usage in bytes",
        unit: "bytes",
      }),
      processCpuUsageGauge: meter.createGauge<ProcessAttributes>("process_cpu_usage_percent", {
        description: "Process CPU usage percentage",
        unit: "percent",
      }),
      processUptimeGauge: meter.createGauge<ProcessAttributes>("process_uptime_seconds", {
        description: "Process uptime in seconds",
        unit: "seconds",
      }),
      processActiveHandlesGauge: meter.createGauge<ProcessAttributes>("process_active_handles", {
        description: "Number of active handles",
        unit: "handles",
      }),

      jwtTokensIssuedCounter: meter.createCounter<AuthAttributes>("jwt_tokens_issued_total", {
        description: "Total number of JWT tokens issued",
        unit: "tokens",
      }),
      jwtTokenCreationTimeHistogram: meter.createHistogram<AuthAttributes>(
        "jwt_token_creation_duration_seconds",
        {
          description: "JWT token creation duration in seconds",
          unit: "seconds",
        }
      ),
      authenticationAttemptsCounter: meter.createCounter<AuthAttributes>(
        "authentication_attempts_total",
        {
          description: "Total authentication attempts",
          unit: "attempts",
        }
      ),
      authenticationSuccessCounter: meter.createCounter<AuthAttributes>(
        "authentication_success_total",
        {
          description: "Successful authentication attempts",
          unit: "attempts",
        }
      ),
      authenticationFailureCounter: meter.createCounter<AuthAttributes>(
        "authentication_failures_total",
        {
          description: "Failed authentication attempts",
          unit: "attempts",
        }
      ),

      kongOperationsCounter: meter.createCounter<KongAttributes>("kong_operations_total", {
        description: "Total Kong operations",
        unit: "operations",
      }),
      kongResponseTimeHistogram: meter.createHistogram<KongAttributes>(
        "kong_response_duration_seconds",
        {
          description: "Kong response duration in seconds",
          unit: "seconds",
        }
      ),
      kongCacheHitCounter: meter.createCounter<KongAttributes>("kong_cache_hits_total", {
        description: "Kong cache hits",
        unit: "hits",
      }),
      kongCacheMissCounter: meter.createCounter<KongAttributes>("kong_cache_misses_total", {
        description: "Kong cache misses",
        unit: "misses",
      }),

      redisOperationsCounter: meter.createCounter("redis_operations_total", {
        description: "Total Redis operations",
        unit: "operations",
      }),
      redisOperationDurationHistogram: meter.createHistogram("redis_operation_duration_seconds", {
        description: "Redis operation duration in seconds",
        unit: "seconds",
      }),
      redisConnectionsGauge: meter.createGauge("redis_connections", {
        description: "Number of Redis connections",
        unit: "connections",
      }),
      redisCacheHitCounter: meter.createCounter("redis_cache_hits_total", {
        description: "Redis cache hits",
        unit: "hits",
      }),
      redisCacheMissCounter: meter.createCounter("redis_cache_misses_total", {
        description: "Redis cache misses",
        unit: "misses",
      }),
      redisErrorsCounter: meter.createCounter("redis_errors_total", {
        description: "Redis errors",
        unit: "errors",
      }),

      errorRateCounter: meter.createCounter("error_rate_total", {
        description: "Error rate counter",
        unit: "errors",
      }),
      exceptionCounter: meter.createCounter("exceptions_total", {
        description: "Exception counter",
        unit: "exceptions",
      }),
      telemetryExportCounter: meter.createCounter("telemetry_exports_total", {
        description: "Telemetry export counter",
        unit: "exports",
      }),
      telemetryExportErrorCounter: meter.createCounter("telemetry_export_errors_total", {
        description: "Telemetry export error counter",
        unit: "errors",
      }),

      circuitBreakerStateGauge: meter.createGauge<CircuitBreakerAttributes>(
        "circuit_breaker_state",
        {
          description: "Circuit breaker state (0=closed, 1=open, 2=half-open)",
          unit: "state",
        }
      ),
      circuitBreakerRequestsCounter: meter.createCounter<CircuitBreakerAttributes>(
        "circuit_breaker_requests_total",
        {
          description: "Circuit breaker requests",
          unit: "requests",
        }
      ),
      circuitBreakerRejectedCounter: meter.createCounter<CircuitBreakerAttributes>(
        "circuit_breaker_rejected_total",
        {
          description: "Circuit breaker rejected requests",
          unit: "requests",
        }
      ),
      circuitBreakerFallbackCounter: meter.createCounter<CircuitBreakerAttributes>(
        "circuit_breaker_fallback_total",
        {
          description: "Circuit breaker fallback executions",
          unit: "fallbacks",
        }
      ),
      circuitBreakerStateTransitionCounter: meter.createCounter<CircuitBreakerAttributes>(
        "circuit_breaker_state_transitions_total",
        {
          description: "Circuit breaker state transitions",
          unit: "transitions",
        }
      ),

      cacheTierUsageCounter: meter.createCounter("cache_tier_usage_total", {
        description: "Cache tier usage",
        unit: "operations",
      }),
      cacheTierLatencyHistogram: meter.createHistogram("cache_tier_latency_seconds", {
        description: "Cache tier latency in seconds",
        unit: "seconds",
      }),
      cacheTierErrorCounter: meter.createCounter("cache_tier_errors_total", {
        description: "Cache tier errors",
        unit: "errors",
      }),

      operationDurationHistogram: meter.createHistogram("operation_duration_seconds", {
        description: "Operation duration in seconds",
        unit: "seconds",
      }),

      apiVersionRequestsCounter: meter.createCounter<ApiVersionAttributes>(
        "api_version_requests_total",
        {
          description: "API version requests",
          unit: "requests",
        }
      ),
      apiVersionHeaderSourceCounter: meter.createCounter<ApiVersionAttributes>(
        "api_version_header_source_total",
        {
          description: "API version header source",
          unit: "requests",
        }
      ),
      apiVersionUnsupportedCounter: meter.createCounter<ApiVersionAttributes>(
        "api_version_unsupported_total",
        {
          description: "Unsupported API version requests",
          unit: "requests",
        }
      ),
      apiVersionFallbackCounter: meter.createCounter<ApiVersionAttributes>(
        "api_version_fallback_total",
        {
          description: "API version fallback usage",
          unit: "requests",
        }
      ),
      apiVersionParsingDurationHistogram: meter.createHistogram<ApiVersionAttributes>(
        "api_version_parsing_duration_seconds",
        {
          description: "API version parsing duration",
          unit: "seconds",
        }
      ),
      apiVersionRoutingDurationHistogram: meter.createHistogram<ApiVersionAttributes>(
        "api_version_routing_duration_seconds",
        {
          description: "API version routing duration",
          unit: "seconds",
        }
      ),

      consumerRequestsByVolumeCounter: meter.createCounter("consumer_requests_by_volume_total", {
        description: "Consumer requests by volume tier",
        unit: "requests",
      }),
      consumerErrorsByVolumeCounter: meter.createCounter("consumer_errors_by_volume_total", {
        description: "Consumer errors by volume tier",
        unit: "errors",
      }),
      consumerLatencyByVolumeHistogram: meter.createHistogram(
        "consumer_latency_by_volume_seconds",
        {
          description: "Consumer latency by volume tier",
          unit: "seconds",
        }
      ),

      securityEventsCounter: meter.createCounter<SecurityAttributes>("security_events_total", {
        description: "Security events",
        unit: "events",
      }),
      securityHeadersAppliedCounter: meter.createCounter<SecurityAttributes>(
        "security_headers_applied_total",
        {
          description: "Security headers applied",
          unit: "headers",
        }
      ),
      auditEventsCounter: meter.createCounter<SecurityAttributes>("audit_events_total", {
        description: "Audit events",
        unit: "events",
      }),
      securityRiskScoreHistogram: meter.createHistogram<SecurityAttributes>("security_risk_score", {
        description: "Security risk score distribution",
        unit: "score",
      }),
      securityAnomaliesCounter: meter.createCounter<SecurityAttributes>(
        "security_anomalies_total",
        {
          description: "Security anomalies detected",
          unit: "anomalies",
        }
      ),
    };

    this.isInitialized = true;
  }

  getInstruments(): TypedMetricInstruments {
    if (!this.instruments) {
      throw new Error("TypedMetricsManager not initialized. Call initialize() first.");
    }
    return this.instruments;
  }

  isReady(): boolean {
    return this.isInitialized && this.instruments !== null;
  }
}

export function getTypedMetrics(): TypedMetricInstruments {
  return TypedMetricsManager.getInstance().getInstruments();
}

export function initializeTypedMetrics(serviceName: string, serviceVersion: string): void {
  TypedMetricsManager.getInstance().initialize(serviceName, serviceVersion);
}

export function isTypedMetricsReady(): boolean {
  return TypedMetricsManager.getInstance().isReady();
}

export function recordHttpRequest(
  method: string,
  endpoint: string,
  statusCode: string,
  duration: number,
  version?: "v1" | "v2"
): void {
  const metrics = getTypedMetrics();
  const attributes: HttpRequestAttributes = { method, endpoint, status_code: statusCode, version };

  metrics.httpRequestCounter.add(1, attributes);
  metrics.httpResponseTimeHistogram.record(duration, attributes);
  metrics.httpRequestsByStatusCounter.add(1, attributes);
}

export function recordAuthenticationAttempt(
  consumerId: string,
  operation: "token_generation" | "validation" | "refresh",
  result: "success" | "failure"
): void {
  const metrics = getTypedMetrics();
  const attributes: AuthAttributes = { consumer_id: consumerId, operation, result };

  metrics.authenticationAttemptsCounter.add(1, attributes);
  if (result === "success") {
    metrics.authenticationSuccessCounter.add(1, attributes);
  } else {
    metrics.authenticationFailureCounter.add(1, attributes);
  }
}

export function recordKongOperation(
  operation: "get_consumer" | "create_credential" | "health_check",
  duration: number,
  cacheStatus: "hit" | "miss" | "stale"
): void {
  const metrics = getTypedMetrics();
  const attributes: KongAttributes = { operation, cache_status: cacheStatus };

  metrics.kongOperationsCounter.add(1, attributes);
  metrics.kongResponseTimeHistogram.record(duration, attributes);

  if (cacheStatus === "hit") {
    metrics.kongCacheHitCounter.add(1, attributes);
  } else if (cacheStatus === "miss") {
    metrics.kongCacheMissCounter.add(1, attributes);
  }
}

export type {
  TypedMetricInstruments,
  HttpRequestAttributes,
  ProcessAttributes,
  AuthAttributes,
  KongAttributes,
  CircuitBreakerAttributes,
  ApiVersionAttributes,
  SecurityAttributes,
};
