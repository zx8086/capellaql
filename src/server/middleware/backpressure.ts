/* src/server/middleware/backpressure.ts */

import { createProblemDetails, createProblemResponse } from "../../errors";
import { memoryGuardian } from "../../lib/memoryGuardian";
import type { Middleware, RequestContext } from "../types";

/**
 * Backpressure middleware - returns 503 Service Unavailable when
 * memory pressure reaches critical levels.
 *
 * Adds Retry-After header per RFC 7231 to help clients implement
 * exponential backoff.
 *
 * At critical level: rejects all non-health requests
 * Health endpoints (/health/*) are always allowed through.
 */
export const backpressureMiddleware: Middleware = async (
  _request: Request,
  context: RequestContext,
  next: () => Promise<Response>
) => {
  // Always allow health checks through
  if (context.url.pathname.startsWith("/health")) {
    return next();
  }

  const pressureLevel = memoryGuardian.getPressureLevel();

  if (pressureLevel === "critical") {
    const retryAfter = memoryGuardian.getRetryAfter();
    const status = memoryGuardian.getStatus();

    const problem = createProblemResponse(
      createProblemDetails({
        code: "HTTP_005",
        detail: `Server is under critical memory pressure (${(status.heapUsageRatio * 100).toFixed(1)}% heap usage). Please retry after ${retryAfter} seconds.`,
        extensions: {
          pressureLevel,
          heapUsageMB: status.heapUsedMB,
          retryAfter,
        },
      })
    );

    return new Response(problem.body, {
      status: 503,
      headers: {
        ...problem.headers,
        "Retry-After": retryAfter.toString(),
      },
    });
  }

  return next();
};
