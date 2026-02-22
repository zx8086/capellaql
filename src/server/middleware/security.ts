/* src/server/middleware/security.ts */

import type { Middleware, RequestContext } from "../types";
import config from "../../config";

const IS_DEVELOPMENT =
  config.telemetry.DEPLOYMENT_ENVIRONMENT === "development" ||
  config.runtime.NODE_ENV === "development";

/**
 * Build Content-Security-Policy header value
 */
function buildCSP(): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${IS_DEVELOPMENT ? " 'unsafe-eval'" : ""} https: http:`,
    "style-src 'self' 'unsafe-inline' https: http:",
    "img-src 'self' data: https: http:",
    "font-src 'self' https: http:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "connect-src 'self' https: http:",
  ];

  return directives.join("; ");
}

// Pre-build security headers (static, created once)
const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": buildCSP(),
  "X-XSS-Protection": "1; mode=block",
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

/**
 * Security headers middleware.
 * Adds CSP, XSS Protection, and other security headers.
 */
export const securityMiddleware: Middleware = async (
  _request: Request,
  context: RequestContext,
  next: () => Promise<Response>
) => {
  const response = await next();

  // Add security headers and request ID
  const newHeaders = new Headers(response.headers);

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    newHeaders.set(key, value);
  }

  // Add request ID for correlation
  newHeaders.set("X-Request-ID", context.requestId);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
};
