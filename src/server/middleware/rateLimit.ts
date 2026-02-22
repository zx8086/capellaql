/* src/server/middleware/rateLimit.ts */

import type { Middleware, RequestContext } from "../types";
import { StaticResponses } from "../types";
import { warn, err } from "../../telemetry";

const RATE_LIMIT = 500;
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute
const CLEANUP_THRESHOLD = 5 * 60 * 1000; // 5 minutes

// Rate limit store: key -> { count, timestamp }
const rateLimitStore = new Map<string, { count: number; timestamp: number }>();

// Start cleanup interval
let cleanupIntervalId: Timer | null = null;

function startCleanup(): void {
  if (cleanupIntervalId) return;

  cleanupIntervalId = setInterval(() => {
    const now = Date.now();
    for (const [key, data] of rateLimitStore.entries()) {
      if (now - data.timestamp > CLEANUP_THRESHOLD) {
        rateLimitStore.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);
}

// Start cleanup on module load
startCleanup();

/**
 * Get rate limit key from request (IP + path combination)
 */
function getRateLimitKey(request: Request, context: RequestContext): string {
  return `${context.clientIp}:${context.url.pathname}`;
}

/**
 * Check if request should be rate limited.
 * Returns true if rate limit exceeded.
 */
function checkRateLimit(request: Request, context: RequestContext): boolean {
  // Bypass for K6 test agent
  const userAgent = request.headers.get("user-agent");
  if (userAgent === "K6TestAgent/1.0") {
    return false;
  }

  const rateLimitKey = getRateLimitKey(request, context);
  const now = Date.now();
  const clientData = rateLimitStore.get(rateLimitKey) || {
    count: 0,
    timestamp: now,
  };

  // Reset window if expired
  if (now - clientData.timestamp > RATE_LIMIT_WINDOW) {
    clientData.count = 1;
    clientData.timestamp = now;
  } else {
    clientData.count++;
  }

  rateLimitStore.set(rateLimitKey, clientData);

  const isRateLimited = clientData.count > RATE_LIMIT;

  // Log rate limiting events for security monitoring
  if (isRateLimited) {
    warn("Rate limit exceeded - request blocked", {
      clientIp: context.clientIp,
      userAgent: userAgent?.substring(0, 100),
      requestCount: clientData.count,
      rateLimitKey,
      url: context.url.pathname,
      method: request.method,
    });
  }

  return isRateLimited;
}

/**
 * Rate limiting middleware.
 * Returns 429 Too Many Requests if limit exceeded.
 */
export const rateLimitMiddleware: Middleware = async (
  request: Request,
  context: RequestContext,
  next: () => Promise<Response>
) => {
  if (checkRateLimit(request, context)) {
    // Log blocking event
    err("Rate limit exceeded - blocking request", {
      clientIp: context.clientIp,
      method: request.method,
      route: context.url.pathname,
      userAgent: request.headers.get("user-agent")?.substring(0, 100),
      requestId: context.requestId,
    });

    return StaticResponses.TOO_MANY_REQUESTS;
  }

  return next();
};

/**
 * Cleanup rate limit store (for testing/graceful shutdown)
 */
export function cleanupRateLimitStore(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
  rateLimitStore.clear();
}
