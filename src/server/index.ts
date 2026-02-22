/* src/server/index.ts */

import type { Server } from "bun";
import { isIP } from "net";
import * as path from "path";
import { ulid } from "ulid";
import { fileURLToPath } from "url";

import config from "../config";
// Telemetry
import { err, initializeHttpMetrics, initializeTelemetry, log, telemetryLogger, warn } from "../telemetry";
import { dashboardHandler } from "./handlers/dashboard";
import { graphqlHandler } from "./handlers/graphql";

// Handlers
import { healthHandlers } from "./handlers/health";
// Middleware
import {
  cleanupRateLimitStore,
  compose,
  corsMiddleware,
  loggingMiddleware,
  rateLimitMiddleware,
  securityMiddleware,
  tracingMiddleware,
} from "./middleware";
import type { RequestContext, WebSocketData } from "./types";
import { StaticResponses } from "./types";
// WebSocket
import { shouldUpgradeWebSocket, websocketHandlers } from "./websocket/subscriptions";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize global paths from unified configuration
if (typeof globalThis.CN_ROOT === "undefined") {
  globalThis.CN_ROOT = config.runtime.CN_ROOT || path.resolve(__dirname, "../..");
}

if (typeof globalThis.CN_CXXCBC_CACHE_DIR === "undefined") {
  globalThis.CN_CXXCBC_CACHE_DIR =
    config.runtime.CN_CXXCBC_CACHE_DIR || path.join(globalThis.CN_ROOT, "deps", "couchbase-cxx-cache");
}

if (typeof globalThis.ENV_TRUE === "undefined") {
  globalThis.ENV_TRUE = ["true", "1", "y", "yes", "on"];
}

/**
 * Extract client IP from request headers
 */
function getClientIp(request: Request): string {
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

  return "unknown";
}

/**
 * Create request context with timing and ID
 */
function createRequestContext(request: Request): RequestContext {
  const url = new URL(request.url);
  return {
    requestId: ulid(),
    startTime: Date.now(),
    clientIp: getClientIp(request),
    url,
    headers: request.headers,
    method: request.method,
  };
}

/**
 * Wrap a handler with the middleware pipeline
 */
function withMiddleware(
  handler: (request: Request, context: RequestContext) => Promise<Response>
): (request: Request, context: RequestContext) => Promise<Response> {
  const pipeline = compose(
    rateLimitMiddleware,
    corsMiddleware,
    securityMiddleware,
    tracingMiddleware,
    loggingMiddleware
  );

  return async (request: Request, context: RequestContext) => {
    return pipeline(request, context, () => handler(request, context));
  };
}

// Pre-wrap handlers with middleware
const wrappedHealthHandlers = {
  basic: withMiddleware(healthHandlers.basic),
  telemetry: withMiddleware(healthHandlers.telemetry),
  system: withMiddleware(healthHandlers.system),
  summary: withMiddleware(healthHandlers.summary),
  performance: withMiddleware(healthHandlers.performance),
  performanceHistory: withMiddleware(healthHandlers.performanceHistory),
  cache: withMiddleware(healthHandlers.cache),
  telemetryDetailed: withMiddleware(healthHandlers.telemetryDetailed),
  comprehensive: withMiddleware(healthHandlers.comprehensive),
  graphql: withMiddleware(healthHandlers.graphql),
};

const wrappedDashboardHandler = withMiddleware(dashboardHandler);
const wrappedGraphqlHandler = withMiddleware(graphqlHandler);

let server: Server | null = null;
let isShuttingDown = false;

/**
 * Create and start the Bun HTTP server
 */
export async function createServer(): Promise<Server> {
  // Initialize telemetry first
  log("Server starting...");
  await initializeTelemetry();
  telemetryLogger.initialize();
  initializeHttpMetrics();
  log("Server initialization completed");

  server = Bun.serve({
    // Bun-native performance optimizations
    hostname: config.deployment.HOSTNAME || "0.0.0.0",
    port: config.application.PORT,
    maxRequestBodySize: 512 * 1024, // 512KB - prevents memory exhaustion from oversized requests
    idleTimeout: 30,
    development: config.telemetry.DEPLOYMENT_ENVIRONMENT === "development",

    // Static routes using Bun.serve() routes object (SIMD-accelerated matching)
    routes: {
      // Health endpoints
      "/health": async (request) => {
        const context = createRequestContext(request);
        return wrappedHealthHandlers.basic(request, context);
      },
      "/health/telemetry": async (request) => {
        const context = createRequestContext(request);
        return wrappedHealthHandlers.telemetry(request, context);
      },
      "/health/system": async (request) => {
        const context = createRequestContext(request);
        return wrappedHealthHandlers.system(request, context);
      },
      "/health/summary": async (request) => {
        const context = createRequestContext(request);
        return wrappedHealthHandlers.summary(request, context);
      },
      "/health/performance": async (request) => {
        const context = createRequestContext(request);
        return wrappedHealthHandlers.performance(request, context);
      },
      "/health/performance/history": async (request) => {
        const context = createRequestContext(request);
        return wrappedHealthHandlers.performanceHistory(request, context);
      },
      "/health/cache": async (request) => {
        const context = createRequestContext(request);
        return wrappedHealthHandlers.cache(request, context);
      },
      "/health/telemetry/detailed": async (request) => {
        const context = createRequestContext(request);
        return wrappedHealthHandlers.telemetryDetailed(request, context);
      },
      "/health/comprehensive": async (request) => {
        const context = createRequestContext(request);
        return wrappedHealthHandlers.comprehensive(request, context);
      },
      "/health/graphql": async (request) => {
        const context = createRequestContext(request);
        return wrappedHealthHandlers.graphql(request, context);
      },

      // Dashboard
      "/dashboard": async (request) => {
        const context = createRequestContext(request);
        return wrappedDashboardHandler(request, context);
      },

      // GraphQL with per-method handling
      "/graphql": {
        GET: async (request) => {
          const context = createRequestContext(request);
          return wrappedGraphqlHandler(request, context);
        },
        POST: async (request) => {
          const context = createRequestContext(request);
          return wrappedGraphqlHandler(request, context);
        },
        OPTIONS: () => StaticResponses.OPTIONS,
      },
    },

    // Fallback for unmatched routes and WebSocket upgrade
    async fetch(request, server) {
      const context = createRequestContext(request);

      // Handle WebSocket upgrade for GraphQL subscriptions
      if (shouldUpgradeWebSocket(request)) {
        const wsData: WebSocketData = {
          requestId: context.requestId,
          clientIp: context.clientIp,
          connectedAt: Date.now(),
        };

        const upgraded = server.upgrade(request, { data: wsData });
        if (upgraded) {
          return undefined; // WebSocket upgrade successful
        }
        return StaticResponses.WS_UPGRADE_FAILED;
      }

      // Return 404 for unmatched routes
      return StaticResponses.NOT_FOUND;
    },

    // WebSocket handlers for GraphQL subscriptions
    websocket: websocketHandlers,

    // Global error handler
    error(error) {
      err("Unhandled server error", error);
      return StaticResponses.INTERNAL_ERROR;
    },
  });

  // Log startup information
  const baseUrl = config.application.BASE_URL || "http://localhost";
  const graphqlUrl = `${baseUrl}:${config.application.PORT}/graphql`;
  const healthUrl = `${baseUrl}:${config.application.PORT}/health`;
  const telemetryHealthUrl = `${baseUrl}:${config.application.PORT}/health/telemetry`;
  const dashboardUrl = `${baseUrl}:${config.application.PORT}/dashboard`;

  log("CapellaQL Server started", {
    serverPort: config.application.PORT,
    environment: config.telemetry.DEPLOYMENT_ENVIRONMENT,
    endpoints: {
      graphql: graphqlUrl,
      health: healthUrl,
      telemetryHealth: telemetryHealthUrl,
      dashboard: dashboardUrl,
    },
    telemetry: {
      enabled: config.telemetry.ENABLE_OPENTELEMETRY,
      tracesEndpoint: config.telemetry.TRACES_ENDPOINT,
      metricsEndpoint: config.telemetry.METRICS_ENDPOINT,
      logsEndpoint: config.telemetry.LOGS_ENDPOINT,
      samplingRate: config.telemetry.SAMPLING_RATE,
    },
    runtime: {
      name: "bun",
      version: Bun.version,
    },
  });

  console.log(`
CapellaQL Server started successfully!

Server Configuration:
   - Hostname: ${config.deployment.HOSTNAME || "0.0.0.0"}
   - Port: ${config.application.PORT}
   - Max Request Body: 512KB
   - Development Mode: ${config.telemetry.DEPLOYMENT_ENVIRONMENT === "development" ? "Enabled" : "Disabled"}
   - Environment: ${config.telemetry.DEPLOYMENT_ENVIRONMENT}

Endpoints:
   - GraphQL Playground: ${graphqlUrl}
   - Health Check: ${healthUrl}
   - Telemetry Health: ${telemetryHealthUrl}
   - Dashboard: ${dashboardUrl}

OpenTelemetry:
   - Status: ${config.telemetry.ENABLE_OPENTELEMETRY ? "Enabled" : "Disabled"}
   - Traces Endpoint: ${config.telemetry.TRACES_ENDPOINT}
   - Metrics Endpoint: ${config.telemetry.METRICS_ENDPOINT}
   - Logs Endpoint: ${config.telemetry.LOGS_ENDPOINT}
   - Sampling Rate: ${config.telemetry.SAMPLING_RATE} (${(config.telemetry.SAMPLING_RATE * 100).toFixed(0)}%)

Powered by Bun.serve() native HTTP server (v${Bun.version})

Ready to accept requests!
`);

  // Setup graceful shutdown
  setupGracefulShutdown();

  return server;
}

/**
 * Setup graceful shutdown handlers
 */
function setupGracefulShutdown(): void {
  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) {
      warn(`Shutdown already in progress, ignoring ${signal}`, {
        signal,
        shutdownInProgress: true,
      });
      return;
    }

    isShuttingDown = true;
    log("Graceful shutdown initiated", {
      signal,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });

    try {
      const { shutdownPerformanceMonitor } = await import("../lib/performanceMonitor");
      const { shutdownBatchCoordinator } = await import("../telemetry/coordinator/BatchCoordinator");
      const { closeConnection } = await import("../lib/clusterProvider");

      const shutdownStartTime = Date.now();

      // Cleanup rate limit store
      cleanupRateLimitStore();

      // Shutdown telemetry batch coordinator first
      await shutdownBatchCoordinator();

      // Close database connection
      await closeConnection();

      // Shutdown performance monitor
      shutdownPerformanceMonitor();

      // Stop server
      if (server) {
        server.stop();
      }

      const shutdownDuration = Date.now() - shutdownStartTime;
      log("Graceful shutdown completed", {
        signal,
        shutdownDurationMs: shutdownDuration,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });

      process.exit(0);
    } catch (error) {
      err("Error during graceful shutdown - forcing exit", {
        error: error instanceof Error ? error.message : String(error),
        signal,
        uptime: process.uptime(),
      });
      process.exit(1);
    }
  };

  ["SIGINT", "SIGTERM", "SIGQUIT"].forEach((signal) => {
    process.on(signal, () => gracefulShutdown(signal));
  });
}

// Export for use by main entry point
export { server };
