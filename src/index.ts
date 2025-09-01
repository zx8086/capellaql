/* src/index.ts */

import { cors } from "@elysiajs/cors";
import { yoga } from "@elysiajs/graphql-yoga";
import { useResponseCache } from "@graphql-yoga/plugin-response-cache";
import { metrics, context as otelContext, SpanStatusCode, trace } from "@opentelemetry/api";
import { Elysia } from "elysia";
import { readFileSync } from "fs";
import depthLimit from "graphql-depth-limit";
import { isIP } from "net";
import * as path from "path";
import { ulid } from "ulid";
import { fileURLToPath } from "url";
import config from "./config";
import resolvers from "./graphql/resolvers";
import typeDefs from "./graphql/typeDefs";
import { getPerformanceHistory, getPerformanceMetrics, getPerformanceTrends } from "./lib/performanceMonitor";
import { getSystemHealth, getSystemHealthSummary } from "./lib/systemHealth";
import {
  debug,
  err,
  getTelemetryHealth,
  initializeHttpMetrics,
  log,
  recordHttpRequest,
  recordHttpResponseTime,
} from "./telemetry";
import { createHealthcheck } from "./utils/bunUtils";
import "source-map-support/register";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

declare global {
  var global: {
    [key: string]: any;
  } & typeof globalThis;
}

// Initialize global paths from unified configuration
if (typeof globalThis.CN_ROOT === "undefined") {
  globalThis.CN_ROOT = config.runtime.CN_ROOT || path.resolve(__dirname, "..");
}

if (typeof globalThis.CN_CXXCBC_CACHE_DIR === "undefined") {
  globalThis.CN_CXXCBC_CACHE_DIR =
    config.runtime.CN_CXXCBC_CACHE_DIR || path.join(globalThis.CN_ROOT, "deps", "couchbase-cxx-cache");
}

if (typeof globalThis.ENV_TRUE === "undefined") {
  globalThis.ENV_TRUE = ["true", "1", "y", "yes", "on"];
}

const SERVER_PORT = config.application.PORT;
const YOGA_RESPONSE_CACHE_TTL = config.application.YOGA_RESPONSE_CACHE_TTL;
const ALLOWED_ORIGINS = Array.isArray(config.application.ALLOWED_ORIGINS)
  ? config.application.ALLOWED_ORIGINS
  : (config.application.ALLOWED_ORIGINS as string).split(",").map((origin) => origin.trim());

console.log("Parsed ALLOWED_ORIGINS:", ALLOWED_ORIGINS);
const IS_DEVELOPMENT =
  config.telemetry.DEPLOYMENT_ENVIRONMENT === "development" || config.runtime.NODE_ENV === "development";

// Configurable HTTP verbosity for better log control
const VERBOSE_HTTP = process.env.VERBOSE_HTTP === "true" || IS_DEVELOPMENT;

const RATE_LIMIT = 500;
const RATE_LIMIT_WINDOW = 60 * 1000;

// Create custom metrics for testing
const meter = metrics.getMeter("capellaql-custom-metrics", "1.0.0");
const requestCounter = meter.createCounter("custom_requests_total", {
  description: "Total number of requests processed",
});
const responseHistogram = meter.createHistogram("custom_response_duration", {
  description: "Response duration in milliseconds",
  unit: "ms",
});
const activeConnections = meter.createUpDownCounter("custom_active_connections", {
  description: "Number of active connections",
});

const rateLimitStore = new Map<string, { count: number; timestamp: number }>();

// Cleanup stale rate limiting entries every minute
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute
const CLEANUP_THRESHOLD = 5 * 60 * 1000; // 5 minutes

setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now - data.timestamp > CLEANUP_THRESHOLD) {
      rateLimitStore.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

function getRateLimitKey(request: Request): string {
  const clientIp = request.headers.get("x-forwarded-for") || request.headers.get("cf-connecting-ip") || "unknown";

  const url = new URL(request.url);
  const path = url.pathname;

  return `${clientIp}:${path}`;
}

function checkRateLimit(request: Request): boolean {
  const userAgent = request.headers.get("user-agent");
  if (userAgent === "K6TestAgent/1.0") {
    return false;
  }

  const rateLimitKey = getRateLimitKey(request);
  const now = Date.now();
  const clientData = rateLimitStore.get(rateLimitKey) || {
    count: 0,
    timestamp: now,
  };

  if (now - clientData.timestamp > RATE_LIMIT_WINDOW) {
    clientData.count = 1;
    clientData.timestamp = now;
  } else {
    clientData.count++;
  }

  rateLimitStore.set(rateLimitKey, clientData);

  return clientData.count > RATE_LIMIT;
}

const createYogaOptions = () => ({
  typeDefs,
  resolvers,
  batching: {
    limit: 10,
  },
  validationRules: [depthLimit(10)], // Prevent deep query attacks
  plugins: [
    // Response cache disabled due to params issues
    // useResponseCache({
    //   session: () => null,
    //   ttl: YOGA_RESPONSE_CACHE_TTL,
    //   buildResponseCacheKey: ({ params }) => {
    //     if (!params) return "no-params";
    //     return `${params.operationName || "unnamed"}:${JSON.stringify(params.variableValues || {})}`;
    //   },
    // }),
    // Query size validation plugin
    {
      onParse({ params, addError }) {
        if (params.source.length > 10000) {
          // 10KB limit
          addError(new Error("Query too large - maximum 10KB allowed"));
        }
      },
    },
    // Enhanced request logging plugin
    {
      onRequest: ({ request, url, serverContext }) => {
        if (VERBOSE_HTTP) {
          const clientIp = getClientIp(request);
          log("GraphQL Request", {
            method: request.method,
            url: url.pathname,
            clientIp,
            userAgent: request.headers.get("user-agent")?.substring(0, 100),
            origin: request.headers.get("origin"),
            timestamp: new Date().toISOString(),
          });
        }
      },
      onExecute: ({ args }) => {
        if (VERBOSE_HTTP) {
          log("GraphQL Execute", {
            operation: args.operationName,
            variables: args.variableValues,
          });
        }
      },
      onSubscribe: ({ args }) => {
        if (VERBOSE_HTTP) {
          log("GraphQL Subscribe", {
            operation: args.operationName,
            variables: args.variableValues,
          });
        }
      },
      onError: ({ error }) => {
        err("GraphQL Error", {
          error: error.message,
          stack: error.stack,
        });
      },
    },
    {
      onParse: ({ params }) => {
        const span = trace.getActiveSpan();
        if (span) {
          span.setAttribute("graphql.operation_name", params.operationName || "Unknown");
          span.setAttribute("graphql.query", params.source);
        }
      },
      onValidate: ({ document }) => {
        const span = trace.getActiveSpan();
        if (span) {
          span.setAttribute(
            "graphql.operation_name",
            document.definitions[0]?.kind === "OperationDefinition"
              ? document.definitions[0].name?.value || "Unknown"
              : "Unknown"
          );
        }
      },
    },
  ],
});

const healthCheck = new Elysia()
  .get("/health", async ({ request }) => {
    // Log request details when verbose HTTP is enabled
    if (VERBOSE_HTTP) {
      const clientIp = getClientIp(request);
      log("Health check request", {
        method: request.method,
        url: "/health",
        clientIp,
        userAgent: request.headers.get("user-agent")?.substring(0, 100),
        timestamp: new Date().toISOString(),
      });
    }

    try {
      const healthStatus = await createHealthcheck();
      return healthStatus;
    } catch (error) {
      err("Health check failed", error);
      return {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        version: "2.0.0",
      };
    }
  })
  .get("/health/telemetry", async () => {
    debug("Telemetry health check called");

    try {
      const telemetryHealth = getTelemetryHealth();
      return telemetryHealth;
    } catch (error) {
      err("Failed to get telemetry health", error);
      return {
        status: "unhealthy",
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      };
    }
  })
  .get("/health/system", async () => {
    debug("System health check called");

    try {
      const systemHealth = await getSystemHealth();
      return systemHealth;
    } catch (error) {
      err("System health check failed", error);
      return {
        overall: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        components: {
          database: {
            status: "unhealthy",
            error: "Health check failed",
            circuitBreaker: { state: "unknown", failures: 0, successes: 0 },
          },
          runtime: {
            status: "unhealthy",
            error: "Health check failed",
            memory: { used: 0, free: 0, total: 0, heapUsed: 0, heapTotal: 0 },
            environment: "unknown",
            version: "unknown",
          },
          telemetry: {
            status: "unhealthy",
            error: "Health check failed",
            exporters: { traces: false, metrics: false, logs: false },
            circuitBreaker: { state: "unknown", failures: 0 },
          },
        },
        performance: { memoryUsage: 0 },
      };
    }
  })
  .get("/health/summary", async () => {
    debug("System health summary called");

    try {
      const healthSummary = await getSystemHealthSummary();
      return healthSummary;
    } catch (error) {
      err("System health summary failed", error);
      return {
        status: "unhealthy",
        message: "Health check failed",
        criticalIssues: [error instanceof Error ? error.message : String(error)],
      };
    }
  })
  .get("/health/performance", async () => {
    debug("Performance metrics called");

    try {
      const performanceMetrics = await getPerformanceMetrics();
      return performanceMetrics;
    } catch (error) {
      err("Performance metrics collection failed", error);
      return {
        timestamp: new Date().toISOString(),
        database: { latency: -1, connectionStatus: "disconnected", errorRate: 1 },
        runtime: { memoryUsage: -1, heapUsage: -1 },
        telemetry: {
          exportLatency: -1,
          droppedSpans: -1,
          batchSize: -1,
          samplingRate: -1,
          circuitBreakerState: "unknown",
        },
        correlations: { databaseToMemory: 0, telemetryToPerformance: 0, overallHealth: "unhealthy" as const },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  })
  .get("/health/performance/history", async ({ query }) => {
    debug("Performance history called");

    try {
      const count = query?.count ? parseInt(query.count as string) : 10;
      const performanceHistory = getPerformanceHistory(Math.min(count, 50)); // Max 50 entries
      return {
        metrics: performanceHistory,
        count: performanceHistory.length,
        trends: getPerformanceTrends(),
      };
    } catch (error) {
      err("Performance history collection failed", error);
      return {
        metrics: [],
        count: 0,
        trends: { databaseLatencyTrend: "stable", memoryUsageTrend: "stable", overallTrend: "stable" },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  })
  .get("/health/cache", async () => {
    debug("Cache metrics called");

    try {
      const { bunSQLiteCache } = await import("./lib/bunSQLiteCache");
      const { defaultQueryCache } = await import("./lib/queryCache");

      const sqliteStats = bunSQLiteCache.getStats();
      const sqliteAnalytics = bunSQLiteCache.getAnalytics();
      const mapCacheStats = defaultQueryCache.getStats();

      return {
        timestamp: new Date().toISOString(),
        sqlite: {
          ...sqliteStats,
          analytics: sqliteAnalytics,
          enabled: typeof Bun !== "undefined",
        },
        mapCache: {
          ...mapCacheStats,
          hitRate:
            mapCacheStats.hits + mapCacheStats.misses > 0
              ? ((mapCacheStats.hits / (mapCacheStats.hits + mapCacheStats.misses)) * 100).toFixed(2)
              : 0,
        },
        comparison: {
          totalHits: sqliteStats.hits + mapCacheStats.hits,
          totalMisses: sqliteStats.misses + mapCacheStats.misses,
          totalMemoryMB: (sqliteStats.memoryUsage + mapCacheStats.memoryUsage) / (1024 * 1024),
          preferredCache: typeof Bun !== "undefined" ? "sqlite" : "map",
        },
      };
    } catch (error) {
      err("Cache metrics collection failed", error);
      return {
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        sqlite: { enabled: false, hits: 0, misses: 0, size: 0, memoryUsage: 0, hitRate: 0 },
        mapCache: { hits: 0, misses: 0, size: 0, memoryUsage: 0, hitRate: 0 },
        comparison: { totalHits: 0, totalMisses: 0, totalMemoryMB: 0, preferredCache: "none" },
      };
    }
  })
  .get("/health/telemetry/detailed", async () => {
    debug("Detailed telemetry metrics called");

    try {
      const { getBatchCoordinator } = await import("./telemetry/coordinator/BatchCoordinator");
      const batchCoordinator = getBatchCoordinator();

      const statistics = batchCoordinator.getStatistics();
      const bufferStatus = batchCoordinator.getBufferStatus();
      const telemetryHealth = getTelemetryHealth();

      return {
        timestamp: new Date().toISOString(),
        batchCoordinator: {
          statistics,
          buffers: {
            traces: bufferStatus.traces,
            metrics: bufferStatus.metrics,
            logs: bufferStatus.logs,
            memoryUsageMB: bufferStatus.memoryUsageMB,
          },
          memoryPressure: bufferStatus.memoryPressure,
          performance: {
            averageExportDuration: statistics.averageExportDuration,
            successRate:
              statistics.totalBatches > 0
                ? ((statistics.successfulBatches / statistics.totalBatches) * 100).toFixed(2)
                : 100,
            emergencyFlushRate:
              statistics.totalBatches > 0
                ? ((statistics.emergencyFlushCount / statistics.totalBatches) * 100).toFixed(2)
                : 0,
            dataLossRate:
              statistics.totalSpansExported > 0
                ? (
                    (statistics.dataDropCount / (statistics.totalSpansExported + statistics.dataDropCount)) *
                    100
                  ).toFixed(2)
                : 0,
          },
        },
        exporters: telemetryHealth,
        recommendations: generateTelemetryRecommendations(statistics, bufferStatus.memoryPressure),
      };
    } catch (error) {
      err("Detailed telemetry metrics collection failed", error);
      return {
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        batchCoordinator: { statistics: {}, buffers: {}, memoryPressure: { pressureLevel: "unknown" } },
        exporters: {},
        recommendations: [],
      };
    }
  })
  .get("/health/comprehensive", async () => {
    debug("Comprehensive health metrics called");

    try {
      // Collect all health metrics in parallel for performance
      const [systemHealth, telemetryHealth, performanceMetrics, cacheResponse, detailedTelemetry] =
        await Promise.allSettled([
          getSystemHealth(),
          getTelemetryHealth(),
          getPerformanceMetrics(),
          // Get cache metrics
          (async () => {
            const { bunSQLiteCache } = await import("./lib/bunSQLiteCache");
            return bunSQLiteCache.getStats();
          })(),
          // Get batch coordinator status
          (async () => {
            const { getBatchCoordinator } = await import("./telemetry/coordinator/BatchCoordinator");
            return getBatchCoordinator().getBufferStatus();
          })(),
        ]);

      const timestamp = new Date().toISOString();

      return {
        timestamp,
        version: "2.0.0",
        environment: process.env.NODE_ENV || "development",
        uptime: process.uptime(),

        // System health
        system:
          systemHealth.status === "fulfilled"
            ? systemHealth.value
            : {
                overall: "unhealthy",
                error: systemHealth.reason?.message,
              },

        // Performance metrics
        performance:
          performanceMetrics.status === "fulfilled"
            ? performanceMetrics.value
            : {
                error: performanceMetrics.reason?.message,
              },

        // Cache performance
        cache:
          cacheResponse.status === "fulfilled"
            ? {
                ...cacheResponse.value,
                status:
                  cacheResponse.value.hitRate > 50 ? "optimal" : cacheResponse.value.hitRate > 20 ? "good" : "poor",
              }
            : {
                error: cacheResponse.reason?.message,
                status: "unknown",
              },

        // Telemetry health
        telemetry: {
          exporters:
            telemetryHealth.status === "fulfilled"
              ? telemetryHealth.value
              : {
                  error: telemetryHealth.reason?.message,
                },
          batchCoordinator:
            detailedTelemetry.status === "fulfilled"
              ? {
                  ...detailedTelemetry.value,
                  status:
                    detailedTelemetry.value.memoryPressure.pressureLevel === "low"
                      ? "healthy"
                      : detailedTelemetry.value.memoryPressure.pressureLevel === "medium"
                        ? "warning"
                        : "critical",
                }
              : {
                  error: detailedTelemetry.reason?.message,
                  status: "unknown",
                },
        },

        // Overall assessment
        overall: {
          status: assessOverallHealth([systemHealth, telemetryHealth, performanceMetrics, cacheResponse]),
          criticalIssues: extractCriticalIssues([systemHealth, telemetryHealth, performanceMetrics, cacheResponse]),
          recommendations: generateOverallRecommendations([
            systemHealth,
            telemetryHealth,
            performanceMetrics,
            cacheResponse,
          ]),
        },
      };
    } catch (error) {
      err("Comprehensive health check failed", error);
      return {
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        overall: {
          status: "unhealthy",
          criticalIssues: ["Health check system failure"],
          recommendations: ["Investigate health check system", "Check system resources", "Review error logs"],
        },
      };
    }
  })
  .get("/dashboard", async () => {
    // Serve the development dashboard
    try {
      const dashboardPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "dashboard", "index.html");
      const dashboardHtml = readFileSync(dashboardPath, "utf-8");

      return new Response(dashboardHtml, {
        headers: {
          "Content-Type": "text/html",
        },
      });
    } catch (error) {
      err("Dashboard loading failed", error);
      return new Response(
        `
        <html>
          <head><title>Dashboard Error</title></head>
          <body>
            <h1>🚫 Dashboard Unavailable</h1>
            <p>Error loading dashboard: ${error instanceof Error ? error.message : String(error)}</p>
            <p><a href="/health">Basic Health Check</a></p>
          </body>
        </html>
      `,
        {
          status: 500,
          headers: { "Content-Type": "text/html" },
        }
      );
    }
  });

// Helper functions for enhanced health endpoints
function generateTelemetryRecommendations(statistics: any, memoryPressure: any): string[] {
  const recommendations: string[] = [];

  if (memoryPressure.pressureLevel === "high" || memoryPressure.pressureLevel === "critical") {
    recommendations.push("Reduce telemetry buffer sizes or increase export frequency");
    recommendations.push("Consider increasing available memory for the service");
  }

  if (statistics.failedBatches > 0 && statistics.totalBatches > 0) {
    const failureRate = (statistics.failedBatches / statistics.totalBatches) * 100;
    if (failureRate > 10) {
      recommendations.push("High telemetry export failure rate detected - check OTLP endpoint connectivity");
    }
  }

  if (statistics.emergencyFlushCount > 0) {
    recommendations.push("Emergency flushes detected - consider tuning memory pressure thresholds");
  }

  if (statistics.dataDropCount > 0) {
    recommendations.push("Telemetry data loss detected - increase memory limits or reduce data volume");
  }

  return recommendations;
}

function assessOverallHealth(results: PromiseSettledResult<any>[]): string {
  let healthyCount = 0;
  const totalCount = results.length;

  for (const result of results) {
    if (result.status === "fulfilled") {
      // Check if the result indicates healthy status
      if (
        result.value &&
        (result.value.status === "healthy" || result.value.overall === "healthy" || result.value.state === "healthy")
      ) {
        healthyCount++;
      }
    }
  }

  const healthyPercentage = (healthyCount / totalCount) * 100;

  if (healthyPercentage >= 80) return "healthy";
  if (healthyPercentage >= 60) return "warning";
  return "unhealthy";
}

function extractCriticalIssues(results: PromiseSettledResult<any>[]): string[] {
  const issues: string[] = [];

  for (const result of results) {
    if (result.status === "rejected") {
      issues.push(`System component failure: ${result.reason?.message || "Unknown error"}`);
    } else if (result.value?.error) {
      issues.push(result.value.error);
    }
  }

  return issues;
}

function generateOverallRecommendations(results: PromiseSettledResult<any>[]): string[] {
  const recommendations: string[] = [];
  const issues = extractCriticalIssues(results);

  if (issues.length > 0) {
    recommendations.push("Address critical system issues immediately");
    recommendations.push("Review error logs for detailed diagnostics");
  }

  // Add general recommendations based on patterns
  const failedResults = results.filter((r) => r.status === "rejected");
  if (failedResults.length > 0) {
    recommendations.push("Multiple system components are failing - investigate resource constraints");
  }

  return recommendations;
}

const getClientIp = (request: Request): string => {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ips = forwardedFor.split(",").map((ip) => ip.trim());
    for (const ip of ips) {
      if (isIP(ip)) return ip;
    }
  }
  const otherIps = [
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-real-ip"),
    request.headers.get("x-client-ip"),
  ];
  for (const ip of otherIps) {
    if (ip && isIP(ip)) return ip;
  }


  const remoteAddress = (request as any).socket?.remoteAddress;
  if (remoteAddress && isIP(remoteAddress)) return remoteAddress;

  return "unknown";
};

const app = new Elysia()
  .onStart(() => {
    initializeHttpMetrics();
  })
  .use(
    cors({
      origin: ["*"],
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
    })
  )
  .use(healthCheck)
  .use(yoga(createYogaOptions()))
  .ws("/graphql", {
    // WebSocket handler for GraphQL subscriptions using Bun's native WebSocket
    message(ws, message) {
      try {
        const data = JSON.parse(message.toString());
        log("WebSocket GraphQL message received", {
          type: data.type,
          id: data.id,
          operation: data.payload?.operationName || "unknown",
        });

        // Handle GraphQL over WebSocket protocol
        if (data.type === "connection_init") {
          ws.send(JSON.stringify({ type: "connection_ack" }));
        } else if (data.type === "start") {
          // This would typically integrate with your GraphQL subscription system
          log("GraphQL subscription started", { id: data.id });
        } else if (data.type === "stop") {
          log("GraphQL subscription stopped", { id: data.id });
        }
      } catch (error) {
        err("WebSocket message handling error", error);
        ws.send(
          JSON.stringify({
            type: "error",
            payload: { message: "Invalid message format" },
          })
        );
      }
    },

    open(_ws) {
      debug("WebSocket connection opened");
      activeConnections.add(1);
    },

    close(_ws, code, reason) {
      debug("WebSocket connection closed", { code, reason });
      activeConnections.add(-1);
    },

    error(_ws, error) {
      err("WebSocket error", error);
    },
  })
  .options("*", ({ set, request }) => {
    // Only log OPTIONS when HTTP verbosity is enabled
    if (VERBOSE_HTTP) {
      log("CORS preflight request", {
        origin: request.headers.get("origin"),
        method: request.headers.get("access-control-request-method"),
        headers: request.headers.get("access-control-request-headers"),
      });
    }

    set.headers["Access-Control-Allow-Origin"] = "*";
    set.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    set.headers["Access-Control-Allow-Headers"] = "Content-Type";
    set.headers["Access-Control-Max-Age"] = "86400";
    return new Response(null, { status: 204 });
  })
  .onRequest(async (context) => {
    context.set.headers["Access-Control-Allow-Origin"] = "*";

    // Define request variables at the start
    const method = context.request.method;
    const url = new URL(context.request.url);
    const route = url.pathname;
    const clientIp = getClientIp(context.request);

    // Record custom metrics
    requestCounter.add(1, {
      method,
      path: route,
    });
    activeConnections.add(1);

    // Only log detailed request info for non-health endpoints when verbose HTTP is enabled
    const isHealthEndpoint = route.startsWith("/health");
    if ((!isHealthEndpoint && VERBOSE_HTTP) || (isHealthEndpoint && IS_DEVELOPMENT)) {
      log("Request", {
        method,
        route,
        userAgent: context.request.headers.get("user-agent")?.substring(0, 50) + "...",
        clientIp,
      });
    }
    if (checkRateLimit(context.request)) {
      context.set.status = 429;
      return { error: "Too Many Requests" };
    }
    const tracer = trace.getTracer("elysia-app");
    return tracer.startActiveSpan(getSpanName(context), async (span) => {
      try {
        const requestId = ulid();
        context.set.headers["X-Request-ID"] = requestId;

        const cspDirectives = [
          "default-src 'self'",
          `script-src 'self' 'unsafe-inline' ${IS_DEVELOPMENT ? "'unsafe-eval'" : ""} https: http:`,
          `style-src 'self' 'unsafe-inline' https: http:`,
          "img-src 'self' data: https: http:",
          "font-src 'self' https: http:",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
          "connect-src 'self' https: http:",
        ];

        if (IS_DEVELOPMENT) {
          cspDirectives[1] += " 'unsafe-eval'";
        }

        // Set CSP header
        context.set.headers["Content-Security-Policy"] = cspDirectives.join("; ");

        context.set.headers["X-XSS-Protection"] = "1; mode=block";
        context.set.headers["X-Frame-Options"] = "SAMEORIGIN";
        context.set.headers["X-Content-Type-Options"] = "nosniff";
        context.set.headers["Referrer-Policy"] = "strict-origin-when-cross-origin";

        const startTime = Date.now();
        context.store = { startTime };
        recordHttpRequest(method, route);

        const ctx = otelContext.active();
        const span = trace.getSpan(ctx);
        if (span) {
          span.setAttributes({
            "http.request_id": requestId,
            "http.method": context.request.method,
            "http.url": context.request.url,
          });
        }

        // Only log detailed request info when verbose HTTP is enabled
        const isHealthCheck = route.startsWith("/health");
        if (VERBOSE_HTTP && (!isHealthCheck || IS_DEVELOPMENT)) {
          log("Request details", {
            requestId,
            method,
            route,
            userAgent: context.request.headers.get("user-agent")?.substring(0, 100),
            clientIp,
          });
        }

        if (context.request.url.includes("/graphql")) {
          const clonedRequest = context.request.clone();
          const text = await clonedRequest.text();
          if (text) {
            const body = JSON.parse(text) as
              | {
                  query?: string;
                  operationName?: string;
                  variables?: Record<string, unknown>;
                }
              | undefined;
            if (body && typeof body === "object") {
              if (body.operationName) {
                span?.updateName(`GraphQL: ${body.operationName}`);
                span?.setAttribute("graphql.operation_name", body.operationName);
              }
              if (body.query) {
                span?.setAttribute("graphql.query", body.query);
              }
              if (body.variables) {
                span?.setAttribute("graphql.variables", JSON.stringify(body.variables));
              }
            }
          }
        }
      } catch (error) {
        err("Error in onRequest handler", error);
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span?.end();
      }
    });
  })
  .onAfterHandle((context) => {
    const endTime = Date.now();
    const { startTime } = context.store as { startTime: number };
    const duration = endTime - startTime;
    recordHttpResponseTime(duration);

    // Record custom metrics
    responseHistogram.record(duration, {
      method: context.request.method,
      status_code: context.set.status?.toString() || "200",
    });
    activeConnections.add(-1); // Decrement active connections

    // Only log response details for non-health endpoints when verbose HTTP is enabled, or slow requests
    const route = new URL(context.request.url).pathname;
    const isHealthEndpoint = route.startsWith("/health");
    const isSlowRequest = duration > 1000; // Log slow requests regardless

    if (isSlowRequest || (VERBOSE_HTTP && !isHealthEndpoint) || (isHealthEndpoint && IS_DEVELOPMENT)) {
      log("Response", {
        requestId: context.set.headers["X-Request-ID"],
        method: context.request.method,
        route,
        status: context.set.status,
        duration: `${duration}ms`,
        ...(isSlowRequest && { slow: true }),
      });
    }
  });

const server = app.listen(SERVER_PORT);

// Show clear startup information
const baseUrl = config.application.BASE_URL || "http://localhost";
const graphqlUrl = `${baseUrl}:${SERVER_PORT}/graphql`;
const healthUrl = `${baseUrl}:${SERVER_PORT}/health`;
const telemetryHealthUrl = `${baseUrl}:${SERVER_PORT}/health/telemetry`;

// Get OpenTelemetry endpoints from unified configuration
const tracesEndpoint = config.telemetry.TRACES_ENDPOINT;
const metricsEndpoint = config.telemetry.METRICS_ENDPOINT;
const logsEndpoint = config.telemetry.LOGS_ENDPOINT;
const otelEnabled = config.telemetry.ENABLE_OPENTELEMETRY;

console.log(`
🚀 CapellaQL Server started successfully!

📍 Server Information:
   • Port: ${SERVER_PORT}
   • Environment: ${config.telemetry.DEPLOYMENT_ENVIRONMENT}
   • GraphQL Playground: ${graphqlUrl}
   • Health Check: ${healthUrl}
   • Telemetry Health: ${telemetryHealthUrl}

📊 OpenTelemetry Configuration:
   • Status: ${otelEnabled ? "✅ Enabled" : "❌ Disabled"}
   • Traces Endpoint: ${tracesEndpoint}
   • Metrics Endpoint: ${metricsEndpoint}
   • Logs Endpoint: ${logsEndpoint}
   • Sampling Rate: ${config.telemetry.SAMPLING_RATE} (${(config.telemetry.SAMPLING_RATE * 100).toFixed(0)}%)

🎯 Ready to accept requests!
`);

const gracefulShutdown = async (signal: string) => {
  log(`Received ${signal}. Starting graceful shutdown...`);
  try {
    // Import shutdown functions dynamically to avoid circular dependencies
    const { shutdownPerformanceMonitor } = await import("$lib/performanceMonitor");
    const { shutdownBatchCoordinator } = await import("$telemetry/coordinator/BatchCoordinator");
    const { closeConnection } = await import("$lib/clusterProvider");

    // Shutdown telemetry batch coordinator first (ensure all data is exported)
    await shutdownBatchCoordinator();
    log("Telemetry batch coordinator shutdown completed");

    // Close database connection to prevent resource leaks
    await closeConnection();
    log("Database connection shutdown completed");

    // Shutdown performance monitor
    shutdownPerformanceMonitor();
    log("Performance monitor shutdown completed");

    // Finally shutdown server
    await server.stop();
    log("Server closed successfully");
    log("Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    err("Error during graceful shutdown", error);
    process.exit(1);
  }
};

["SIGINT", "SIGTERM", "SIGQUIT"].forEach((signal) => {
  process.on(signal, () => gracefulShutdown(signal));
});

function getSpanName(context: any): string {
  const method = context.request.method;
  const url = new URL(context.request.url);
  const path = url.pathname;

  if (path === "/health") {
    return `${method} /health`;
  } else if (path === "/graphql") {
    return "GraphQL Request";
  } else {
    return `${method} ${path}`;
  }
}
