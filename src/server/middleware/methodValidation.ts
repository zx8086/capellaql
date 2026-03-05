/* src/server/middleware/methodValidation.ts */

import type { Middleware, RequestContext } from "../types";
import { createMethodNotAllowed } from "../types";

/**
 * Registry of allowed HTTP methods per endpoint.
 * Used by methodValidationMiddleware to enforce RFC 9110 compliance
 * by returning 405 with a proper Allow header for disallowed methods.
 */
const ENDPOINT_METHODS: Record<string, string[]> = {
  "/health": ["GET", "OPTIONS"],
  "/health/telemetry": ["GET", "OPTIONS"],
  "/health/system": ["GET", "OPTIONS"],
  "/health/summary": ["GET", "OPTIONS"],
  "/health/performance": ["GET", "OPTIONS"],
  "/health/performance/history": ["GET", "OPTIONS"],
  "/health/cache": ["GET", "OPTIONS"],
  "/health/telemetry/detailed": ["GET", "OPTIONS"],
  "/health/comprehensive": ["GET", "OPTIONS"],
  "/health/graphql": ["GET", "OPTIONS"],
  "/health/status": ["GET", "OPTIONS"],
  "/health/ready": ["GET", "OPTIONS"],
  "/health/live": ["GET", "OPTIONS"],
  "/graphql": ["GET", "POST", "OPTIONS"],
};

/**
 * Method validation middleware - enforces allowed HTTP methods per route.
 *
 * Returns 405 Method Not Allowed with RFC 9110 compliant Allow header
 * when a request uses an HTTP method not permitted for the target resource.
 *
 * Must be placed FIRST in the middleware chain so invalid methods are
 * rejected before rate limiting, CORS, or other processing occurs.
 */
export const methodValidationMiddleware: Middleware = async (
  _request: Request,
  context: RequestContext,
  next: () => Promise<Response>
) => {
  const allowedMethods = ENDPOINT_METHODS[context.url.pathname];

  // No entry = not managed by this middleware, pass through
  if (!allowedMethods) {
    return next();
  }

  // OPTIONS handled by CORS middleware
  if (context.method === "OPTIONS") {
    return next();
  }

  if (!allowedMethods.includes(context.method)) {
    return createMethodNotAllowed(allowedMethods);
  }

  return next();
};
