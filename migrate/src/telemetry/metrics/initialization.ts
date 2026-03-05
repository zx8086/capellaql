/* src/telemetry/metrics/initialization.ts */

import { metrics } from "@opentelemetry/api";
import { error, warn } from "../../utils/logger";
import {
  setApiVersionInstruments,
  setAuthInstruments,
  setCacheInstruments,
  setCircuitBreakerInstruments,
  setConsumerVolumeInstruments,
  setErrorInstruments,
  setHttpInstruments,
  setKongInstruments,
  setProcessInstruments,
  setRedisInstruments,
  setSecurityInstruments,
  setTelemetryInstruments,
} from "./instruments";
import { setupSystemMetricsCollection, startMemoryPressureMonitoring } from "./process-metrics";
import { isMetricsInitialized, setMetricsInitialized } from "./state";

export function initializeMetrics(serviceName?: string, serviceVersion?: string): void {
  if (isMetricsInitialized()) {
    warn("Metrics already initialized", {
      serviceName,
      serviceVersion,
      initialized: true,
    });
    return;
  }

  try {
    const meter = metrics.getMeter(
      serviceName || "authentication-service",
      serviceVersion || "1.0.0"
    );

    // HTTP Metrics
    setHttpInstruments({
      httpRequestCounter: meter.createCounter("http_requests_total", {
        description: "Total number of HTTP requests",
        unit: "1",
      }),
      httpRequestsByStatusCounter: meter.createCounter("http_requests_by_status_total", {
        description: "Total HTTP requests grouped by status code and other dimensions",
        unit: "1",
      }),
      httpResponseTimeHistogram: meter.createHistogram("http_request_duration_seconds", {
        description: "HTTP request duration",
        unit: "s",
        advice: {
          explicitBucketBoundaries: [
            0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10,
          ],
        },
      }),
      httpRequestSizeHistogram: meter.createHistogram("http_request_size_bytes", {
        description: "Size of HTTP requests in bytes",
        unit: "By",
        advice: {
          explicitBucketBoundaries: [100, 1000, 10000, 100000, 1000000, 10000000],
        },
      }),
      httpResponseSizeHistogram: meter.createHistogram("http_response_size_bytes", {
        description: "Size of HTTP responses in bytes",
        unit: "By",
        advice: {
          explicitBucketBoundaries: [100, 1000, 10000, 100000, 1000000, 10000000],
        },
      }),
      httpActiveRequestsGauge: meter.createGauge("http_active_requests", {
        description: "Number of active HTTP requests",
        unit: "1",
      }),
      httpRequestsInFlightGauge: meter.createGauge("http_requests_in_flight", {
        description: "Number of HTTP requests currently in flight",
        unit: "1",
      }),
    });

    // Process Metrics
    setProcessInstruments({
      processStartTimeGauge: meter.createGauge("process_start_time_seconds", {
        description: "Start time of the process since unix epoch in seconds",
        unit: "s",
      }),
      processUptimeGauge: meter.createGauge("process_uptime_seconds", {
        description: "Process uptime in seconds",
        unit: "s",
      }),
      processMemoryUsageGauge: meter.createGauge("process_memory_usage_bytes", {
        description: "Process memory usage in bytes",
        unit: "By",
      }),
      processHeapUsedGauge: meter.createGauge("process_heap_used_bytes", {
        description: "Process heap used in bytes",
        unit: "By",
      }),
      processHeapTotalGauge: meter.createGauge("process_heap_total_bytes", {
        description: "Process heap total in bytes",
        unit: "By",
      }),
      processRssGauge: meter.createGauge("process_resident_memory_bytes", {
        description: "Resident memory size in bytes",
        unit: "By",
      }),
      processExternalGauge: meter.createGauge("process_external_memory_bytes", {
        description: "External memory usage in bytes",
        unit: "By",
      }),
      processCpuUsageGauge: meter.createGauge("process_cpu_usage_percent", {
        description: "Process CPU usage as a percentage",
        unit: "1",
      }),
      processEventLoopDelayHistogram: meter.createHistogram("process_event_loop_delay_seconds", {
        description: "Event loop delay in seconds",
        unit: "s",
        advice: {
          explicitBucketBoundaries: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
        },
      }),
      processEventLoopUtilizationGauge: meter.createGauge(
        "process_event_loop_utilization_percent",
        {
          description: "Event loop utilization as a percentage",
          unit: "1",
        }
      ),
      systemMemoryUsageGauge: meter.createGauge("system_memory_usage_bytes", {
        description: "System memory usage in bytes",
        unit: "By",
      }),
      systemMemoryFreeGauge: meter.createGauge("system_memory_free_bytes", {
        description: "System free memory in bytes",
        unit: "By",
      }),
      systemMemoryTotalGauge: meter.createGauge("system_memory_total_bytes", {
        description: "System total memory in bytes",
        unit: "By",
      }),
      systemCpuUsageGauge: meter.createGauge("system_cpu_usage_percent", {
        description: "System CPU usage as a percentage",
        unit: "1",
      }),
      systemLoadAverageGauge: meter.createGauge("system_load_average", {
        description: "System load average",
        unit: "1",
      }),
      gcCollectionCounter: meter.createCounter("gc_collections_total", {
        description: "Total number of garbage collection runs",
        unit: "1",
      }),
      gcDurationHistogram: meter.createHistogram("gc_duration_seconds", {
        description: "Time spent in garbage collection",
        unit: "s",
        advice: {
          explicitBucketBoundaries: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
        },
      }),
      gcOldGenerationSizeBeforeGauge: meter.createGauge("gc_old_generation_size_before_bytes", {
        description: "Old generation heap size before GC",
        unit: "By",
      }),
      gcOldGenerationSizeAfterGauge: meter.createGauge("gc_old_generation_size_after_bytes", {
        description: "Old generation heap size after GC",
        unit: "By",
      }),
      gcYoungGenerationSizeBeforeGauge: meter.createGauge("gc_young_generation_size_before_bytes", {
        description: "Young generation heap size before GC",
        unit: "By",
      }),
      gcYoungGenerationSizeAfterGauge: meter.createGauge("gc_young_generation_size_after_bytes", {
        description: "Young generation heap size after GC",
        unit: "By",
      }),
      fileDescriptorUsageGauge: meter.createGauge("file_descriptor_usage", {
        description: "Number of file descriptors in use",
        unit: "1",
      }),
      fileDescriptorLimitGauge: meter.createGauge("file_descriptor_limit", {
        description: "Maximum number of file descriptors",
        unit: "1",
      }),
      networkBytesInCounter: meter.createCounter("network_bytes_received_total", {
        description: "Total bytes received over the network",
        unit: "By",
      }),
      networkBytesOutCounter: meter.createCounter("network_bytes_sent_total", {
        description: "Total bytes sent over the network",
        unit: "By",
      }),
      threadPoolPendingGauge: meter.createGauge("thread_pool_pending_tasks", {
        description: "Number of pending tasks in thread pool",
        unit: "1",
      }),
      threadPoolActiveGauge: meter.createGauge("thread_pool_active_threads", {
        description: "Number of active threads in thread pool",
        unit: "1",
      }),
      threadPoolIdleGauge: meter.createGauge("thread_pool_idle_threads", {
        description: "Number of idle threads in thread pool",
        unit: "1",
      }),
      handleUsageGauge: meter.createGauge("handle_usage", {
        description: "Number of handles in use",
        unit: "1",
      }),
    });

    // Auth Metrics
    setAuthInstruments({
      jwtTokenCreationTimeHistogram: meter.createHistogram("jwt_token_creation_duration_seconds", {
        description: "Time taken to create JWT tokens",
        unit: "s",
      }),
      authenticationAttemptsCounter: meter.createCounter("authentication_attempts_total", {
        description: "Total number of authentication attempts",
        unit: "1",
      }),
      authenticationSuccessCounter: meter.createCounter("authentication_success_total", {
        description: "Total number of successful authentications",
        unit: "1",
      }),
      authenticationFailureCounter: meter.createCounter("authentication_failures_total", {
        description: "Total number of failed authentications",
        unit: "1",
      }),
    });

    // Kong Metrics
    setKongInstruments({
      kongOperationsCounter: meter.createCounter("kong_operations_total", {
        description: "Total number of Kong API operations",
        unit: "1",
      }),
      kongResponseTimeHistogram: meter.createHistogram("kong_operation_duration_seconds", {
        description: "Kong API operation response time",
        unit: "s",
      }),
      kongCacheHitCounter: meter.createCounter("kong_cache_hits_total", {
        description: "Number of Kong cache hits",
        unit: "1",
      }),
      kongCacheMissCounter: meter.createCounter("kong_cache_misses_total", {
        description: "Number of Kong cache misses",
        unit: "1",
      }),
    });

    // Redis Metrics
    setRedisInstruments({
      redisOperationsCounter: meter.createCounter("redis_operations_total", {
        description: "Total number of Redis operations",
        unit: "1",
      }),
      redisOperationDurationHistogram: meter.createHistogram("redis_operation_duration_seconds", {
        description: "Redis operation response time in seconds",
        unit: "s",
        advice: {
          explicitBucketBoundaries: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2],
        },
      }),
      redisConnectionsGauge: meter.createGauge("redis_connections_active", {
        description: "Number of active Redis connections",
        unit: "1",
      }),
      redisCacheHitCounter: meter.createCounter("redis_cache_hits_total", {
        description: "Total number of Redis cache hits",
        unit: "1",
      }),
      redisCacheMissCounter: meter.createCounter("redis_cache_misses_total", {
        description: "Total number of Redis cache misses",
        unit: "1",
      }),
      redisErrorsCounter: meter.createCounter("redis_errors_total", {
        description: "Total number of Redis operation errors",
        unit: "1",
      }),
    });

    // Error Metrics
    setErrorInstruments({
      errorRateCounter: meter.createCounter("application_errors_total", {
        description: "Total number of application errors",
        unit: "1",
      }),
      exceptionCounter: meter.createCounter("application_exceptions_total", {
        description: "Total number of uncaught exceptions",
        unit: "1",
      }),
    });

    // Telemetry Metrics
    setTelemetryInstruments({
      telemetryExportCounter: meter.createCounter("telemetry_exports_total", {
        description: "Total number of telemetry export attempts",
        unit: "1",
      }),
      telemetryExportErrorCounter: meter.createCounter("telemetry_export_errors_total", {
        description: "Total number of telemetry export errors",
        unit: "1",
      }),
    });

    // Circuit Breaker Metrics
    setCircuitBreakerInstruments({
      circuitBreakerStateGauge: meter.createGauge("circuit_breaker_state", {
        description: "Circuit breaker state (0=closed, 1=open, 2=half-open)",
        unit: "1",
      }),
      circuitBreakerRequestsCounter: meter.createCounter("circuit_breaker_requests_total", {
        description: "Total number of requests through circuit breaker",
        unit: "1",
      }),
      circuitBreakerRejectedCounter: meter.createCounter("circuit_breaker_rejected_total", {
        description: "Total number of requests rejected by circuit breaker",
        unit: "1",
      }),
      circuitBreakerFallbackCounter: meter.createCounter("circuit_breaker_fallback_total", {
        description: "Total number of fallback executions",
        unit: "1",
      }),
      circuitBreakerStateTransitionCounter: meter.createCounter(
        "circuit_breaker_state_transitions_total",
        {
          description: "Total number of circuit breaker state transitions",
          unit: "1",
        }
      ),
    });

    // Cache Tier Metrics
    setCacheInstruments({
      cacheTierUsageCounter: meter.createCounter("cache_tier_usage_total", {
        description: "Total number of cache tier usages by tier type",
        unit: "1",
      }),
      cacheTierLatencyHistogram: meter.createHistogram("cache_tier_latency_seconds", {
        description: "Cache tier access latency in seconds",
        unit: "s",
        advice: {
          explicitBucketBoundaries: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
        },
      }),
      cacheTierErrorCounter: meter.createCounter("cache_tier_errors_total", {
        description: "Total number of cache tier errors",
        unit: "1",
      }),
      operationDurationHistogram: meter.createHistogram("operation_duration_seconds", {
        description: "Duration of various operations",
        unit: "s",
      }),
    });

    // API Versioning Metrics
    setApiVersionInstruments({
      apiVersionRequestsCounter: meter.createCounter("api_version_requests_total", {
        description: "Total API requests by version, endpoint, and method",
        unit: "1",
      }),
      apiVersionHeaderSourceCounter: meter.createCounter("api_version_header_source_total", {
        description: "Count of version detection by source (Accept-Version, media-type, default)",
        unit: "1",
      }),
      apiVersionUnsupportedCounter: meter.createCounter("api_version_unsupported_total", {
        description: "Count of unsupported version requests",
        unit: "1",
      }),
      apiVersionFallbackCounter: meter.createCounter("api_version_fallback_total", {
        description: "Count of fallbacks to default version",
        unit: "1",
      }),
      apiVersionParsingDurationHistogram: meter.createHistogram(
        "api_version_parsing_duration_seconds",
        {
          description: "Time taken to parse API version from headers",
          unit: "s",
          advice: {
            explicitBucketBoundaries: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1],
          },
        }
      ),
      apiVersionRoutingDurationHistogram: meter.createHistogram(
        "api_version_routing_duration_seconds",
        {
          description: "Additional overhead from version-aware routing",
          unit: "s",
          advice: {
            explicitBucketBoundaries: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1],
          },
        }
      ),
    });

    // Consumer Volume Metrics
    setConsumerVolumeInstruments({
      consumerRequestsByVolumeCounter: meter.createCounter("consumer_requests_by_volume", {
        description: "Consumer requests grouped by volume (high/medium/low)",
        unit: "1",
      }),
      consumerErrorsByVolumeCounter: meter.createCounter("consumer_errors_by_volume", {
        description: "Consumer errors grouped by volume (high/medium/low)",
        unit: "1",
      }),
      consumerLatencyByVolumeHistogram: meter.createHistogram("consumer_latency_by_volume", {
        description: "Consumer response times grouped by volume (high/medium/low)",
        unit: "s",
        advice: {
          explicitBucketBoundaries: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
        },
      }),
    });

    // Security Metrics
    setSecurityInstruments({
      securityEventsCounter: meter.createCounter("security_events_total", {
        description: "Total number of security events recorded",
        unit: "1",
      }),
      securityHeadersAppliedCounter: meter.createCounter("security_headers_applied_total", {
        description: "Count of responses with security headers applied",
        unit: "1",
      }),
      auditEventsCounter: meter.createCounter("audit_events_total", {
        description: "Total number of audit events logged",
        unit: "1",
      }),
      securityRiskScoreHistogram: meter.createHistogram("security_risk_score", {
        description: "Distribution of security event risk scores",
        unit: "1",
        advice: {
          explicitBucketBoundaries: [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
        },
      }),
      securityAnomaliesCounter: meter.createCounter("security_anomalies_total", {
        description: "Count of security anomalies detected",
        unit: "1",
      }),
    });

    setMetricsInitialized(true);
    setupSystemMetricsCollection();
    startMemoryPressureMonitoring();
  } catch (err) {
    error("Failed to initialize metrics", {
      error: (err as Error).message,
      serviceName,
      serviceVersion,
    });
    throw err;
  }
}
