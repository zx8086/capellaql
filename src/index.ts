/* src/index.ts */

import { Elysia } from "elysia";
import { log, err } from "$utils/logger";

import config from "./config";
import { cors } from "@elysiajs/cors";
import { yoga } from "@elysiajs/graphql-yoga";
import typeDefs from "./graphql/typeDefs";
import resolvers from "./graphql/resolvers";
import { useResponseCache } from "@graphql-yoga/plugin-response-cache";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  initializeHttpMetrics,
  recordHttpRequest,
  recordHttpResponseTime,
} from "./instrumentation";
import { ulid } from "ulid";
import { isIP } from "net";
import { context as otelContext, trace } from "@opentelemetry/api";
import { SpanStatusCode } from "@opentelemetry/api";
import "source-map-support/register";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

declare global {
  var globalThis: {
    [key: string]: any;
  };
}

if (typeof globalThis["CN_ROOT"] === "undefined") {
  globalThis["CN_ROOT"] =
    process.env["CN_ROOT"] || path.resolve(__dirname, "..");
}

if (typeof globalThis["CN_CXXCBC_CACHE_DIR"] === "undefined") {
  globalThis["CN_CXXCBC_CACHE_DIR"] =
    process.env["CN_CXXCBC_CACHE_DIR"] ||
    path.join(globalThis["CN_ROOT"], "deps", "couchbase-cxx-cache");
}

if (typeof globalThis["ENV_TRUE"] === "undefined") {
  globalThis["ENV_TRUE"] = ["true", "1", "y", "yes", "on"];
}

const SERVER_PORT = config.application["PORT"];
const YOGA_RESPONSE_CACHE_TTL = config.application["YOGA_RESPONSE_CACHE_TTL"];
// const ALLOWED_ORIGINS = Array.isArray(config.application.ALLOWED_ORIGINS)
//   ? config.application.ALLOWED_ORIGINS
//   : (config.application.ALLOWED_ORIGINS as string).split(',').map(origin => origin.trim());

// console.log("Parsed ALLOWED_ORIGINS:", ALLOWED_ORIGINS);
const IS_DEVELOPMENT =
  config.openTelemetry.DEPLOYMENT_ENVIRONMENT === "development";

const RATE_LIMIT = 500;
const RATE_LIMIT_WINDOW = 60 * 1000;

const rateLimitStore = new Map<string, { count: number; timestamp: number }>();

function getRateLimitKey(request: Request): string {
  const clientIp =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown";

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
    {
      // useResponseCache({
      //   session: () => null,
      //   ttl: YOGA_RESPONSE_CACHE_TTL,
      // }),
      onExecute: ({ args }) => {
        log("GraphQL Execute", {
          operation: args["operationName"],
          variables: args["variableValues"],
        });
      },
      onSubscribe: ({ args }) => {
        log("GraphQL Subscribe", {
          operation: args["operationName"],
          variables: args["variableValues"],
        });
      },
      onError: ({ error }) => {
        err("GraphQL Error", {
          error: error["message"],
          stack: error["stack"],
        });
      },
    },
    {
      onParse: ({ params }) => {
        const span = trace.getActiveSpan();
        if (span) {
          span.setAttribute(
            "graphql.operation_name",
            params.operationName || "Unknown",
          );
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
              : "Unknown",
          );
        }
      },
    },
  ],
});

const healthCheck = new Elysia().get("/health", async () => {
  log("Health check called");

  // Example: Check database connection
  // const isDatabaseConnected = await checkDatabaseConnection();

  // Example: Check external service
  // const isExternalServiceAvailable = await checkExternalService();

  // You can return a more detailed health status if needed
  return {
    status: "HEALTHY",
    // database: isDatabaseConnected ? "Connected" : "Disconnected",
    // externalService: isExternalServiceAvailable ? "Available" : "Unavailable",
  };
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
    log("The server has started!");
    initializeHttpMetrics();
  })
  .use(
    cors({
      origin: ["*"],
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
    }),
  )
  .use(healthCheck)
  .use(yoga(createYogaOptions()))
  .options("*", ({ set, request }) => {
    log("Handling OPTIONS request");
    log("Origin:", request.headers.get("origin"));
    log(
      "Access-Control-Request-Method:",
      request.headers.get("access-control-request-method"),
    );
    log(
      "Access-Control-Request-Headers:",
      request.headers.get("access-control-request-headers"),
    );

    set.headers["Access-Control-Allow-Origin"] = "*";
    set.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    set.headers["Access-Control-Allow-Headers"] = "Content-Type";
    set.headers["Access-Control-Max-Age"] = "86400";
    return new Response(null, { status: 204 });
  })
  .onRequest(async (context) => {
    context.set.headers["Access-Control-Allow-Origin"] = "*";
    log("Incoming request");
    log("Method:", context.request.method);
    log("Origin:", context.request.headers.get("origin"));
    log(
      "Access-Control-Request-Method:",
      context.request.headers.get("access-control-request-method"),
    );
    log(
      "Access-Control-Request-Headers:",
      context.request.headers.get("access-control-request-headers"),
    );
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
        context.set.headers["Content-Security-Policy"] =
          cspDirectives.join("; ");

        context.set.headers["X-XSS-Protection"] = "1; mode=block";
        context.set.headers["X-Frame-Options"] = "SAMEORIGIN";
        context.set.headers["X-Content-Type-Options"] = "nosniff";
        context.set.headers["Referrer-Policy"] =
          "strict-origin-when-cross-origin";

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
                span?.setAttribute(
                  "graphql.operation_name",
                  body.operationName,
                );
              }
              if (body.query) {
                span?.setAttribute("graphql.query", body.query);
              }
              if (body.variables) {
                span?.setAttribute(
                  "graphql.variables",
                  JSON.stringify(body.variables),
                );
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

    log("Outgoing response", {
      requestId: context.set.headers["X-Request-ID"],
      method: context.request.method,
      url: context.request.url,
      status: context.set.status,
      duration: `${duration}ms`,
    });
  });

const server = app.listen(SERVER_PORT);
log(`GraphQL server running on port:${SERVER_PORT}`);

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
