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
 * Extract operation name from GraphQL query string
 * Handles: query OpName { }, mutation OpName { }, subscription OpName { }
 * Also handles: query OpName($var: Type) { }
 */
function extractOperationNameFromQuery(query: string): string | undefined {
  if (!query) return undefined;

  // Match: query/mutation/subscription followed by optional operation name
  // Patterns: "query OpName {", "query OpName(", "query {"
  const operationMatch = query.match(
    /^\s*(?:query|mutation|subscription)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[({]/
  );

  if (operationMatch?.[1]) {
    return operationMatch[1];
  }

  // Check for anonymous query with field name (e.g., "{ looks(...) }")
  // Extract the first field name as a fallback
  const fieldMatch = query.match(/^\s*(?:query|mutation|subscription)?\s*\{\s*([A-Za-z_][A-Za-z0-9_]*)/);
  if (fieldMatch?.[1]) {
    return fieldMatch[1];
  }

  return undefined;
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
      // Use explicit operationName if provided, otherwise extract from query
      const operationName =
        body.operationName || extractOperationNameFromQuery(body.query);

      return {
        operationName,
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
