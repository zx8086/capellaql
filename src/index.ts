/* src/index.ts - Main Server Entry Point */

import type { Server } from "bun";
import { isIP } from "net";
import * as path from "path";
import { ulid } from "ulid";
import { fileURLToPath } from "url";

// Initialize telemetry FIRST - before any modules that need instrumentation
import {
  err,
  initializeHttpMetrics,
  initializeTelemetry,
  log,
  shutdownTelemetry,
  telemetryLogger,
  warn,
} from "./telemetry";

// Early shutdown flag - allows interrupting initialization
let earlyShutdownRequested = false;

// Register early signal handlers BEFORE any blocking initialization
// This ensures Ctrl+C works even during Couchbase connection retries
const earlyShutdownHandler = (signal: string) => {
  // Guard against multiple calls
  if (earlyShutdownRequested) return;
  earlyShutdownRequested = true;

  console.log(`\nReceived ${signal} during initialization, forcing immediate exit...`);
  // Force immediate exit - Couchbase SDK blocks the event loop so setTimeout won't work
  process.exit(0);
};

process.on("SIGINT", () => earlyShutdownHandler("SIGINT"));
process.on("SIGTERM", () => earlyShutdownHandler("SIGTERM"));

// Initialize telemetry early (before graphql/dataloader imports)
await initializeTelemetry();

if (earlyShutdownRequested) {
  console.log("Shutdown requested, exiting before Couchbase initialization");
  process.exit(0);
}

// Initialize Couchbase connection (after telemetry for proper instrumentation)
import { connectionManager } from "./lib/couchbase";

try {
  await connectionManager.initialize();
} catch {
  // Error already logged by connectionManager - exit cleanly without Bun's ugly crash output
  process.exit(1);
}

if (earlyShutdownRequested) {
  console.log("Shutdown requested, exiting before server start");
  await connectionManager.close();
  process.exit(0);
}

// Dynamic imports for modules that need instrumentation
// This ensures they're loaded AFTER telemetry is initialized
const [{ default: config }, { graphqlHandler }, { healthHandlers }, middleware, types, websocket] = await Promise.all([
  import("./config"),
  import("./server/handlers/graphql"),
  import("./server/handlers/health"),
  import("./server/middleware"),
  import("./server/types"),
  import("./server/websocket/subscriptions"),
]);

const {
  cleanupRateLimitStore,
  compose,
  corsMiddleware,
  loggingMiddleware,
  rateLimitMiddleware,
  securityMiddleware,
  tracingMiddleware,
} = middleware;

const { StaticResponses } = types;
type RequestContext = typeof types.RequestContext extends new (
  ...args: infer _
) => infer R
  ? R
  : typeof types.RequestContext;
type WebSocketData = typeof types.WebSocketData extends new (
  ...args: infer _
) => infer R
  ? R
  : typeof types.WebSocketData;

const { shouldUpgradeWebSocket, websocketHandlers } = websocket;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  // New standardized health endpoints
  status: withMiddleware(healthHandlers.status),
  ready: withMiddleware(healthHandlers.ready),
  live: withMiddleware(healthHandlers.live),
};

const wrappedGraphqlHandler = withMiddleware(graphqlHandler);

let server: Server | null = null;
let isShuttingDown = false;

/**
 * Create and start the Bun HTTP server
 */
async function createServer(): Promise<Server> {
  log("Server starting...");
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

      // New standardized health endpoints (per monitoring-updated.md pattern)
      "/health/status": async (request) => {
        const context = createRequestContext(request);
        return wrappedHealthHandlers.status(request, context);
      },
      "/health/ready": async (request) => {
        const context = createRequestContext(request);
        return wrappedHealthHandlers.ready(request, context);
      },
      "/health/live": async (request) => {
        const context = createRequestContext(request);
        return wrappedHealthHandlers.live(request, context);
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

  // Log startup information in JSON ECS format
  const baseUrl = config.application.BASE_URL || "http://localhost";
  const graphqlUrl = `${baseUrl}:${config.application.PORT}/graphql`;
  const healthUrl = `${baseUrl}:${config.application.PORT}/health`;
  const telemetryHealthUrl = `${baseUrl}:${config.application.PORT}/health/telemetry`;

  log("CapellaQL Server started", {
    serverPort: config.application.PORT,
    hostname: config.deployment.HOSTNAME || "0.0.0.0",
    environment: config.telemetry.DEPLOYMENT_ENVIRONMENT,
    maxRequestBodySize: "512KB",
    endpoints: {
      graphql: graphqlUrl,
      health: healthUrl,
      telemetryHealth: telemetryHealthUrl,
    },
    telemetry: {
      enabled: config.telemetry.ENABLE_OPENTELEMETRY,
      tracesEndpoint: config.telemetry.TRACES_ENDPOINT,
      metricsEndpoint: config.telemetry.METRICS_ENDPOINT,
      logsEndpoint: config.telemetry.LOGS_ENDPOINT,
    },
    runtime: {
      name: "bun",
      version: Bun.version,
    },
  });

  // Setup graceful shutdown
  setupGracefulShutdown();

  return server;
}

/**
 * Centralized graceful shutdown orchestrator.
 *
 * Consolidates ALL shutdown logic into ONE location to prevent:
 * - Multiple shutdown calls to OpenTelemetry providers
 * - Race conditions between concurrent handlers
 * - "shutdown may only be called once" errors
 *
 * Shutdown sequence follows correct dependency ordering:
 * 1. Stop accepting requests
 * 2. Cleanup rate limit store
 * 3. Flush telemetry buffers
 * 4. Close database connections
 * 5. Shutdown telemetry providers (ONCE)
 * 6. Cleanup remaining resources
 * 7. Exit process
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
    const shutdownStartTime = Date.now();

    log("Graceful shutdown initiated", {
      signal,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });

    try {
      // Dynamic imports to avoid circular dependencies
      const { shutdownPerformanceMonitor } = await import("./lib/performanceMonitor");
      const { shutdownBatchCoordinator } = await import("./telemetry/coordinator/BatchCoordinator");
      // connectionManager already imported at top level

      // Phase 1: Stop accepting new requests
      log("Shutdown Phase 1: Stopping server", { phase: 1 });
      if (server) {
        server.stop();
      }

      // Phase 2: Cleanup rate limit store
      log("Shutdown Phase 2: Cleaning up rate limit store", { phase: 2 });
      cleanupRateLimitStore();

      // Phase 3: Flush telemetry buffers before closing connections
      log("Shutdown Phase 3: Flushing telemetry batch coordinator", { phase: 3 });
      try {
        await Promise.race([
          shutdownBatchCoordinator(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("BatchCoordinator shutdown timeout")), 5000)),
        ]);
      } catch (batchError) {
        warn("BatchCoordinator shutdown issue (continuing)", {
          error: batchError instanceof Error ? batchError.message : String(batchError),
        });
      }

      // Phase 4: Close database connections
      log("Shutdown Phase 4: Closing database connections", { phase: 4 });
      try {
        await Promise.race([
          connectionManager.close(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Database close timeout")), 10000)),
        ]);
      } catch (dbError) {
        warn("Database close issue (continuing)", {
          error: dbError instanceof Error ? dbError.message : String(dbError),
        });
      }

      // Phase 5: Shutdown telemetry providers (ONCE - idempotent)
      log("Shutdown Phase 5: Shutting down telemetry providers", { phase: 5 });
      try {
        await Promise.race([
          shutdownTelemetry(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Telemetry shutdown timeout")), 5000)),
        ]);
      } catch (telemetryError) {
        warn("Telemetry shutdown issue (continuing)", {
          error: telemetryError instanceof Error ? telemetryError.message : String(telemetryError),
        });
      }

      // Phase 6: Cleanup remaining resources
      log("Shutdown Phase 6: Cleaning up remaining resources", { phase: 6 });
      shutdownPerformanceMonitor();

      const shutdownDuration = Date.now() - shutdownStartTime;

      // Use console.log for final message since telemetry may be down
      console.log(
        JSON.stringify({
          message: "Graceful shutdown completed",
          signal,
          shutdownDurationMs: shutdownDuration,
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
        })
      );

      process.exit(0);
    } catch (error) {
      const shutdownDuration = Date.now() - shutdownStartTime;

      console.error(
        JSON.stringify({
          message: "Error during graceful shutdown - forcing exit",
          error: error instanceof Error ? error.message : String(error),
          signal,
          shutdownDurationMs: shutdownDuration,
          uptime: process.uptime(),
        })
      );

      process.exit(1);
    }
  };

  // Remove early shutdown handlers and register full graceful shutdown
  // The early handlers were registered before initialization to allow Ctrl+C during startup
  process.removeAllListeners("SIGINT");
  process.removeAllListeners("SIGTERM");

  // Register full graceful shutdown handlers
  ["SIGINT", "SIGTERM", "SIGQUIT"].forEach((signal) => {
    process.on(signal, () => gracefulShutdown(signal));
  });
}

// Start the server
createServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
