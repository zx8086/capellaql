/* src/server/middleware/tracing.ts */

import { SpanStatusCode, trace } from "@opentelemetry/api";
import { err } from "../../telemetry";
import type { Middleware, RequestContext } from "../types";

const tracer = trace.getTracer("bun-server");

/**
 * Get span name based on request path
 */
function getSpanName(request: Request, context: RequestContext): string {
  const method = request.method;
  const path = context.url.pathname;

  if (path === "/health" || path.startsWith("/health/")) {
    return `${method} ${path}`;
  } else if (path === "/graphql") {
    return "GraphQL Request";
  } else if (path === "/dashboard") {
    return `${method} /dashboard`;
  } else {
    return `${method} ${path}`;
  }
}

/**
 * Extract GraphQL operation name from request body
 */
async function extractGraphQLOperation(request: Request): Promise<{
  operationName?: string;
  query?: string;
  variables?: Record<string, unknown>;
} | null> {
  if (request.method !== "POST") return null;

  try {
    const clonedRequest = request.clone();
    const text = await clonedRequest.text();
    if (!text) return null;

    const body = JSON.parse(text);
    if (body && typeof body === "object") {
      return {
        operationName: body.operationName,
        query: body.query,
        variables: body.variables,
      };
    }
  } catch {
    // Ignore parsing errors
  }
  return null;
}

/**
 * OpenTelemetry tracing middleware.
 * Wraps handlers with trace spans and records attributes.
 */
export const tracingMiddleware: Middleware = async (
  request: Request,
  context: RequestContext,
  next: () => Promise<Response>
) => {
  const spanName = getSpanName(request, context);

  return tracer.startActiveSpan(spanName, async (span) => {
    try {
      // Set basic span attributes
      span.setAttributes({
        "http.request_id": context.requestId,
        "http.method": request.method,
        "http.url": request.url,
        "http.client_ip": context.clientIp,
      });

      // Extract GraphQL operation info for /graphql endpoint
      if (context.url.pathname === "/graphql") {
        const graphqlOp = await extractGraphQLOperation(request);

        if (graphqlOp) {
          if (graphqlOp.operationName) {
            span.updateName(`GraphQL: ${graphqlOp.operationName}`);
            span.setAttribute("graphql.operation_name", graphqlOp.operationName);
          }

          if (graphqlOp.query) {
            span.setAttribute("graphql.query", graphqlOp.query);
          }

          if (graphqlOp.variables) {
            span.setAttribute("graphql.variables", JSON.stringify(graphqlOp.variables));
          }
        }
      }

      const response = await next();

      // Record response status
      span.setAttribute("http.status_code", response.status);

      if (response.status >= 400) {
        span.setStatus({ code: SpanStatusCode.ERROR });
      }

      return response;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      err("Error in request handler", error);
      throw error;
    } finally {
      span.end();
    }
  });
};
