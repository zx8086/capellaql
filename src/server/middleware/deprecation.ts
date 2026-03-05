/* src/server/middleware/deprecation.ts */

import type { Middleware, RequestContext } from "../types";

/**
 * Deprecation configuration for a route.
 * Per RFC 8594 (Sunset Header) and RFC 8288 (Link Header).
 */
export interface DeprecatedRoute {
  /** ISO 8601 date when the endpoint will be removed */
  sunset: string;
  /** URL to the replacement endpoint or migration guide */
  link?: string;
  /** Human-readable deprecation message */
  message?: string;
}

/**
 * Registry of deprecated routes.
 * Add entries here when deprecating API endpoints.
 *
 * Example:
 * ```typescript
 * DEPRECATED_ROUTES.set("/api/v1/old-endpoint", {
 *   sunset: "2026-06-01T00:00:00Z",
 *   link: "https://capellaql.tommy.com/docs/migration/v2",
 *   message: "Use /api/v2/new-endpoint instead",
 * });
 * ```
 */
export const DEPRECATED_ROUTES = new Map<string, DeprecatedRoute>();

/**
 * Middleware that adds RFC 8594 Sunset and RFC 8288 Link headers
 * to responses for deprecated routes.
 *
 * This middleware is a no-op when DEPRECATED_ROUTES is empty,
 * adding zero overhead to non-deprecated routes.
 */
export const deprecationMiddleware: Middleware = async (
  _request: Request,
  context: RequestContext,
  next: () => Promise<Response>
) => {
  const response = await next();

  // Fast path: no deprecated routes configured
  if (DEPRECATED_ROUTES.size === 0) {
    return response;
  }

  const deprecation = DEPRECATED_ROUTES.get(context.url.pathname);
  if (!deprecation) {
    return response;
  }

  // Clone headers to add deprecation info
  const headers = new Headers(response.headers);

  // RFC 8594: Sunset header
  headers.set("Sunset", deprecation.sunset);

  // RFC 7234 / general: Deprecation header (draft standard, widely adopted)
  headers.set("Deprecation", "true");

  // RFC 8288: Link header for migration docs
  if (deprecation.link) {
    const existingLink = headers.get("Link");
    const sunsetLink = `<${deprecation.link}>; rel="sunset"`;
    headers.set("Link", existingLink ? `${existingLink}, ${sunsetLink}` : sunsetLink);
  }

  // Custom header for human-readable message
  if (deprecation.message) {
    headers.set("X-Deprecation-Notice", deprecation.message);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
