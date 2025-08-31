/* src/index.ts */

import { cors } from "@elysiajs/cors";
import { yoga } from "@elysiajs/graphql-yoga";
import { useResponseCache } from "@graphql-yoga/plugin-response-cache";
import { metrics, context as otelContext, SpanStatusCode, trace } from "@opentelemetry/api";
import { Elysia } from "elysia";
import { isIP } from "net";
import * as path from "path";
import { ulid } from "ulid";
import { fileURLToPath } from "url";
import config from "./config";
import resolvers from "./graphql/resolvers";
import typeDefs from "./graphql/typeDefs";
import {
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
    // Lifecycle hooks plugin (separate)
    {
      onExecute: ({ args }) => {
        log("GraphQL Execute", {
          operation: args.operationName,
          variables: args.variableValues,
        });
      },
      onSubscribe: ({ args }) => {
        log("GraphQL Subscribe", {
          operation: args.operationName,
          variables: args.variableValues,
        });
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
  .get("/health", async () => {
    log("Health check called");

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
    log("Telemetry health check called");

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
  });

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

  // Log all headers for debugging
  console.log("All headers:", Object.fromEntries(request.headers.entries()));

  // Log the entire request object (be cautious with sensitive data)
  console.log("Request object:", JSON.stringify(request, null, 2));

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
      log("WebSocket connection opened");
      activeConnections.add(1);
    },

    close(_ws, code, reason) {
      log("WebSocket connection closed", { code, reason });
      activeConnections.add(-1);
    },

    error(_ws, error) {
      err("WebSocket error", error);
    },
  })
  .options("*", ({ set, request }) => {
    log("Handling OPTIONS request");
    log("Origin:", request.headers.get("origin"));
    log("Access-Control-Request-Method:", request.headers.get("access-control-request-method"));
    log("Access-Control-Request-Headers:", request.headers.get("access-control-request-headers"));

    set.headers["Access-Control-Allow-Origin"] = "*";
    set.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    set.headers["Access-Control-Allow-Headers"] = "Content-Type";
    set.headers["Access-Control-Max-Age"] = "86400";
    return new Response(null, { status: 204 });
  })
  .onRequest(async (context) => {
    context.set.headers["Access-Control-Allow-Origin"] = "*";

    // Record custom metrics
    requestCounter.add(1, {
      method: context.request.method,
      path: new URL(context.request.url).pathname,
    });
    activeConnections.add(1);

    log("Incoming request");
    log("Method:", context.request.method);
    log("Origin:", context.request.headers.get("origin"));
    log("Access-Control-Request-Method:", context.request.headers.get("access-control-request-method"));
    log("Access-Control-Request-Headers:", context.request.headers.get("access-control-request-headers"));
    if (checkRateLimit(context.request)) {
      context.set.status = 429;
      return { error: "Too Many Requests" };
    }
    const tracer = trace.getTracer("elysia-app");
    return tracer.startActiveSpan(getSpanName(context), async (span) => {
      try {
        const requestId = ulid();
        context.set.headers["X-Request-ID"] = requestId;

        const clientIp = getClientIp(context.request);

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
        const method = context.request.method;
        const url = new URL(context.request.url);
        const route = url.pathname;
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

        log("Incoming request", {
          requestId,
          method,
          url: context.request.url,
          userAgent: context.request.headers.get("user-agent"),
          forwardedFor: context.request.headers.get("x-forwarded-for"),
          clientIp,
        });

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

    log("Outgoing response", {
      requestId: context.set.headers["X-Request-ID"],
      method: context.request.method,
      url: context.request.url,
      status: context.set.status,
      duration: `${duration}ms`,
    });
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
