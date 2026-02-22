/* src/server/middleware/index.ts */

import type { Middleware, RequestContext } from "../types";

/**
 * Compose multiple middleware functions into a single handler.
 * Middleware execute in order: first → last → handler → last → first
 */
export function compose(...middlewares: Middleware[]): Middleware {
  return async (request: Request, context: RequestContext, next: () => Promise<Response>) => {
    let index = -1;

    const dispatch = async (i: number): Promise<Response> => {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;

      if (i >= middlewares.length) {
        return next();
      }

      const middleware = middlewares[i];
      return middleware(request, context, () => dispatch(i + 1));
    };

    return dispatch(0);
  };
}

/**
 * Create a middleware pipeline that applies headers to all responses.
 */
export function applyHeaders(headers: Record<string, string>): (response: Response) => Response {
  return (response: Response) => {
    const newHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(headers)) {
      newHeaders.set(key, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };
}

/**
 * Wraps a handler to add common headers like X-Request-ID.
 */
export function withRequestId(
  handler: (request: Request, context: RequestContext) => Promise<Response>
): (request: Request, context: RequestContext) => Promise<Response> {
  return async (request, context) => {
    const response = await handler(request, context);
    const newHeaders = new Headers(response.headers);
    newHeaders.set("X-Request-ID", context.requestId);
    newHeaders.set("Access-Control-Allow-Origin", "*");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };
}

export { corsMiddleware } from "./cors";
export { loggingMiddleware } from "./logging";
export { cleanupRateLimitStore, rateLimitMiddleware } from "./rateLimit";
export { securityMiddleware } from "./security";
export { tracingMiddleware } from "./tracing";
