/* src/server.ts */

import { dns } from "bun";
import pkg from "../package.json" with { type: "json" };
import { KongAdapter } from "./adapters/kong.adapter";
import type { IKongService } from "./config";
import { loadConfig } from "./config/index";
import {
  logServiceReady,
  logServiceShutdownCompleted,
  logServiceShutdownError,
  logServiceShutdownInitiated,
  logServiceStartup,
} from "./logging/critical-lifecycle";
import { handleServerError } from "./middleware/error-handler";
import { getApiDocGenerator } from "./openapi-generator";
import { createRoutes } from "./routes/router";
import { CacheFactory } from "./services/cache/cache-factory";
import { profilingService } from "./services/profiling.service";
import { shutdownCardinalityGuard } from "./telemetry/cardinality-guard";
import { shutdownConsumerVolume } from "./telemetry/consumer-volume";
import { type GCEvent, initializeGCMetrics, shutdownGCMetrics } from "./telemetry/gc-metrics";
import {
  getSimpleTelemetryStatus,
  initializeTelemetry,
  shutdownSimpleTelemetry,
} from "./telemetry/instrumentation";
import { LifecycleObservabilityLogger, lifecycleLogger } from "./telemetry/lifecycle-logger";
import {
  recordGCCollection,
  recordGCDuration,
  recordGCHeapSizes,
  recordKongOperation,
  shutdownMetrics,
} from "./telemetry/metrics";
import { shutdownTelemetryCircuitBreakers } from "./telemetry/telemetry-circuit-breaker";
import { error, log, warn } from "./utils/logger";

const config = loadConfig();

getApiDocGenerator().registerAllRoutes();

// DNS Prefetching: Warm the DNS cache for external services before first request
// Bun caches DNS entries for 30 seconds (configurable via BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS)
const prefetchDns = (): void => {
  try {
    // Prefetch Kong Admin API
    const kongUrl = new URL(config.kong.adminUrl);
    const kongPort = kongUrl.port
      ? Number.parseInt(kongUrl.port, 10)
      : kongUrl.protocol === "https:"
        ? 443
        : 80;
    dns.prefetch(kongUrl.hostname, kongPort);
    log("DNS prefetch initiated", {
      component: "dns",
      event: "prefetch",
      host: kongUrl.hostname,
      port: kongPort,
      service: "kong",
    });

    // Prefetch Redis/Valkey if configured
    if (config.caching.redisUrl) {
      const redisUrl = new URL(config.caching.redisUrl);
      const redisPort = redisUrl.port ? Number.parseInt(redisUrl.port, 10) : 6379;
      dns.prefetch(redisUrl.hostname, redisPort);
      log("DNS prefetch initiated", {
        component: "dns",
        event: "prefetch",
        host: redisUrl.hostname,
        port: redisPort,
        service: "redis",
      });
    }

    // Prefetch OTEL endpoint if configured
    if (config.telemetry.endpoint) {
      const otelUrl = new URL(config.telemetry.endpoint);
      const otelPort = otelUrl.port
        ? Number.parseInt(otelUrl.port, 10)
        : otelUrl.protocol === "https:"
          ? 443
          : 80;
      dns.prefetch(otelUrl.hostname, otelPort);
      log("DNS prefetch initiated", {
        component: "dns",
        event: "prefetch",
        host: otelUrl.hostname,
        port: otelPort,
        service: "otel",
      });
    }
  } catch (prefetchError) {
    warn("DNS prefetch failed - service will continue normally", {
      component: "dns",
      event: "prefetch_error",
      error: prefetchError instanceof Error ? prefetchError.message : "Unknown error",
    });
  }
};

// Get DNS cache statistics for observability
export const getDnsCacheStats = (): ReturnType<typeof dns.getCacheStats> => {
  return dns.getCacheStats();
};

prefetchDns();

const kongService: IKongService = new KongAdapter(
  config.kong.mode,
  config.kong.adminUrl,
  config.kong.adminToken
);

try {
  await initializeTelemetry();
  log("Telemetry initialized successfully", {
    component: "telemetry",
    event: "initialization_success",
    mode: config.telemetry.mode,
    serviceName: config.telemetry.serviceName,
  });

  // Initialize GC metrics collection after telemetry is ready
  const gcMetricsCallback = (event: GCEvent): void => {
    recordGCCollection(event.type);
    recordGCDuration(event.durationMs / 1000, event.type);
    recordGCHeapSizes(
      event.heapBefore,
      event.heapAfter,
      event.heapBefore * 0.3,
      event.heapAfter * 0.3
    );
  };

  // CPU optimization: Increase GC metrics interval from 30s to 60s
  // Profile analysis showed collectGCMetrics consuming 10.5% CPU due to heapStats() calls.
  // 60s interval provides adequate GC visibility while reducing overhead by 50%.
  initializeGCMetrics(gcMetricsCallback, 60000);
  log("GC metrics collection started", {
    component: "gc_metrics",
    event: "initialization_success",
    intervalMs: 60000,
  });
} catch (initError) {
  error("Failed to initialize OpenTelemetry - service will continue without telemetry export", {
    component: "telemetry",
    event: "initialization_failure",
    error: initError instanceof Error ? initError.message : "Unknown error",
    stack: initError instanceof Error ? initError.stack : undefined,
    mode: config.telemetry.mode,
    tracesEndpoint: config.telemetry.tracesEndpoint || "not configured",
    metricsEndpoint: config.telemetry.metricsEndpoint || "not configured",
    logsEndpoint: config.telemetry.logsEndpoint || "not configured",
    impact: "Traces, metrics, and logs will not be exported to OTLP endpoint",
    recovery: "Service continues operating normally, telemetry data will be lost",
  });
}

// Critical lifecycle log - ALWAYS visible regardless of LOG_LEVEL
logServiceStartup(config.server.port, config.server.nodeEnv);

log("Authentication Service starting up", {
  component: "server",
  event: "startup_initiated",
  version: pkg.version || "1.0.0",
  environment: config.server.nodeEnv,
  port: config.server.port,
});

log("Checking Kong connectivity...", {
  component: "kong",
  event: "connectivity_check",
});

let startupKongHealth: Awaited<ReturnType<IKongService["healthCheck"]>>;
try {
  startupKongHealth = await kongService.healthCheck();
  recordKongOperation(
    "startup_health_check",
    startupKongHealth.responseTime,
    startupKongHealth.healthy
  );

  if (!startupKongHealth.healthy) {
    warn("Kong health check failed during startup - entering degraded mode", {
      component: "kong",
      operation: "health_check",
      duration: startupKongHealth.responseTime,
      success: false,
      error: startupKongHealth.error,
      status: "degraded",
    });
  } else {
    log("Kong connectivity verified", {
      component: "kong",
      event: "connectivity_verified",
      duration: startupKongHealth.responseTime,
    });
  }
} catch (startupError) {
  error("Kong health check failed during startup with exception - entering degraded mode", {
    component: "kong",
    operation: "health_check",
    success: false,
    error: startupError instanceof Error ? startupError.message : "Unknown error",
    status: "degraded",
  });

  recordKongOperation("startup_health_check", 0, false);

  warn("Server will start in degraded mode - Kong integration unavailable", {
    component: "kong",
    status: "degraded",
    impact: "JWT token issuance will not work until Kong connectivity is restored",
  });
}

const { routes, fallbackFetch } = createRoutes(kongService);
let server: ReturnType<typeof Bun.serve>;

try {
  server = Bun.serve({
    port: config.server.port,
    hostname: "0.0.0.0",

    // Request size and timeout limits for security
    maxRequestBodySize: 10 * 1024 * 1024, // 10MB max request body
    idleTimeout: 30, // 30 seconds idle timeout (in seconds)
    development: config.server.nodeEnv === "development",

    // Modern Routes API
    routes,

    // Fallback fetch for OPTIONS and 404s
    async fetch(req) {
      try {
        return await fallbackFetch(req);
      } catch (error) {
        return handleServerError(error as Error);
      }
    },
  });
} catch (err) {
  if (err instanceof Error && err.message.includes("EADDRINUSE")) {
    error("Server failed to start - port already in use", {
      component: "server",
      event: "startup_failed",
      error: err.message,
      port: config.server.port,
      suggestion: `Port ${config.server.port} is already in use. Please stop the existing server or use a different port.`,
    });

    log(
      "To stop existing servers, run: pkill -f 'bun src/server.ts' or lsof -ti:3000 | xargs kill",
      {
        component: "server",
        event: "troubleshooting_hint",
      }
    );

    process.exit(1);
  } else {
    error("Server failed to start with unexpected error", {
      component: "server",
      event: "startup_failed",
      error: err instanceof Error ? err.message : "Unknown error",
    });

    process.exit(1);
  }
}

log("Authentication server started", {
  component: "server",
  event: "startup",
  "server.url": `http://localhost:${config.server.port}`,
  "server.environment": config.server.nodeEnv,
  "server.pid": process.pid,
  "server.port": config.server.port,
});

const allEndpoints = [
  "GET / - OpenAPI specification (JSON/YAML based on Accept header)",
  "GET /health - Health check",
  "GET /health/telemetry - Telemetry health status",
  "GET /health/metrics - Metrics health with circuit breaker status",
  "GET /health/ready - Readiness check (Kong connectivity)",
  "GET /metrics - Unified metrics endpoint (operational, infrastructure, telemetry, exports, config, full views)",
  "GET /tokens - Issue JWT token (requires Kong headers)",
  "GET /tokens/validate - Validate JWT token (requires Authorization header)",
  "POST /debug/metrics/test - Record test metrics",
  "POST /debug/metrics/export - Force metrics export",
  "POST /debug/profiling/start - Start profiling session (dev/staging only)",
  "POST /debug/profiling/stop - Stop profiling session (dev/staging only)",
  "GET /debug/profiling/status - Profiling status (dev/staging only)",
  "GET /debug/profiling/reports - List profiling reports (dev/staging only)",
  "GET /debug/profiling/report - Get specific profiling report (dev/staging only)",
  "POST /debug/profiling/cleanup - Clean profiling artifacts (dev/staging only)",
];

log("Server endpoints configured", {
  component: "server",
  event: "endpoints_configured",
  endpoints: allEndpoints,
});

log("Metrics debugging endpoints available", {
  component: "metrics",
  event: "debug_endpoints_ready",
  endpoints: {
    test: "POST /debug/metrics/test",
    export: "POST /debug/metrics/export",
    unified: "GET /metrics (with ?view= parameter)",
  },
  usage: {
    test_and_check:
      "curl -X POST http://localhost:3000/debug/metrics/test && sleep 15 && curl http://localhost:3000/metrics?view=exports",
    manual_export: "curl -X POST http://localhost:3000/debug/metrics/export",
    view_stats: "curl http://localhost:3000/metrics?view=exports",
    view_full: "curl http://localhost:3000/metrics?view=full",
    view_operational: "curl http://localhost:3000/metrics",
  },
});

log("OpenTelemetry configuration loaded", {
  component: "telemetry",
  event: "configuration_loaded",
  success: true,
  "otel.service.name": getSimpleTelemetryStatus().config.serviceName,
  "otel.service.version": getSimpleTelemetryStatus().config.serviceVersion,
  "otel.deployment.environment": getSimpleTelemetryStatus().config.environment,
  "otel.telemetry.mode": getSimpleTelemetryStatus().config.mode,
  "otel.exporter.traces.endpoint": getSimpleTelemetryStatus().config.tracesEndpoint,
  "otel.exporter.metrics.endpoint": getSimpleTelemetryStatus().config.metricsEndpoint,
  "otel.exporter.logs.endpoint": getSimpleTelemetryStatus().config.logsEndpoint,
  "otel.exporter.timeout_ms": getSimpleTelemetryStatus().config.exportTimeout,
  "otel.batch.size": getSimpleTelemetryStatus().config.batchSize,
  "otel.queue.max_size": getSimpleTelemetryStatus().config.maxQueueSize,
  "otel.enabled": getSimpleTelemetryStatus().config.enableOpenTelemetry,
});

const profilingStatus = profilingService.getStatus();
log("Profiling service status", {
  component: "profiling",
  event: "service_status",
  enabled: profilingStatus.enabled,
  environment: config.server.nodeEnv,
  integration: "Chrome DevTools Protocol",
  instructions: "Use Chrome DevTools at chrome://inspect for profiling",
  endpoints: profilingStatus.enabled
    ? [
        "POST /debug/profiling/start",
        "POST /debug/profiling/stop",
        "GET /debug/profiling/status",
        "POST /debug/profiling/cleanup",
      ]
    : ["Profiling disabled for this environment"],
});

// Critical lifecycle log - ALWAYS visible regardless of LOG_LEVEL
logServiceReady(config.server.port);

log("Server ready to serve requests", {
  component: "server",
  event: "ready",
  status: "ready",
});

let isShuttingDown = false;

const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) {
    log("Shutdown already in progress, ignoring duplicate signal", {
      component: "server",
      event: "shutdown_duplicate",
      signal,
    });
    return;
  }

  isShuttingDown = true;

  // Critical lifecycle log - ALWAYS visible regardless of LOG_LEVEL
  logServiceShutdownInitiated(signal);

  // Set environment variable for lifecycle logger
  process.env.SHUTDOWN_SIGNAL = signal;

  const shutdownTimeout = setTimeout(() => {
    error("Graceful shutdown timeout - forcing exit", {
      component: "server",
      event: "shutdown_timeout",
      pid: process.pid,
    });
    process.exit(1);
  }, 10000);

  try {
    // Phase 1: Log complete shutdown sequence (batch approach)
    const shutdownSequence = LifecycleObservabilityLogger.generateShutdownSequence(signal);
    lifecycleLogger.logShutdownSequence(shutdownSequence);

    // Phase 2: Flush all shutdown messages to OTLP
    await lifecycleLogger.flushShutdownMessages();

    // Phase 3: Actual system shutdown (no more logging after this point)
    if (server) {
      server.stop();
    }

    // Close cache connections (Redis/Valkey) to prevent connection leaks
    await CacheFactory.reset();

    // Clear all intervals to prevent memory leaks
    shutdownGCMetrics();
    shutdownConsumerVolume();
    shutdownCardinalityGuard();
    shutdownTelemetryCircuitBreakers();

    await Promise.all([shutdownMetrics(), shutdownSimpleTelemetry(), profilingService.shutdown()]);

    // Critical lifecycle log - ALWAYS visible regardless of LOG_LEVEL
    logServiceShutdownCompleted();

    clearTimeout(shutdownTimeout);
    process.exit(0);
  } catch (err) {
    // Critical lifecycle log - ALWAYS visible regardless of LOG_LEVEL
    logServiceShutdownError(err instanceof Error ? err : new Error(String(err)));

    error("Error during graceful shutdown", {
      component: "server",
      event: "shutdown_error",
      error: err instanceof Error ? err.message : "Unknown error",
    });

    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("unhandledRejection", (reason, promise) => {
  error("Unhandled promise rejection", {
    component: "server",
    event: "unhandled_rejection",
    reason: reason instanceof Error ? reason.message : String(reason),
    promise: String(promise),
  });
});

process.on("uncaughtException", (err) => {
  error("Uncaught exception", {
    component: "server",
    event: "uncaught_exception",
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

// Export the server instance for programmatic usage
// Export lifecycle logger for testing
export { lifecycleLogger };
export default server;
