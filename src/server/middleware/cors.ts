/* src/server/middleware/cors.ts */

import type { Middleware, RequestContext } from "../types";
import { StaticResponses } from "../types";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

/**
 * CORS middleware - handles preflight and adds CORS headers to responses.
 * For OPTIONS requests, returns pre-created static response (zero-allocation).
 */
export const corsMiddleware: Middleware = async (
  request: Request,
  _context: RequestContext,
  next: () => Promise<Response>
) => {
  // Handle preflight with zero-allocation response
  if (request.method === "OPTIONS") {
    return StaticResponses.OPTIONS;
  }

  // Continue to next middleware/handler
  const response = await next();

  // Add CORS headers to response
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    newHeaders.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
};
