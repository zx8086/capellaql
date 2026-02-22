/* src/server/middleware/logging.ts */

import { metrics } from "@opentelemetry/api";
import { err, recordHttpRequest, recordHttpResponseTime, warn } from "../../telemetry";
import type { Middleware, RequestContext } from "../types";

// Create custom metrics
const meter = metrics.getMeter("capellaql-custom-metrics", "1.0.0");
const requestCounter = meter.createCounter("custom_requests_total", {
  description: "Total number of requests processed",
});
const responseHistogram = meter.createHistogram("custom_response_duration", {
  description: "Response duration in milliseconds",
  unit: "ms",
});
const activeConnections = meter.createUpDownCounter("custom_active_connections", {
  description: "Number of active connections",
});

// Export for WebSocket handlers
export { activeConnections };

/**
 * Request/Response logging middleware.
 * Records metrics and logs errors/slow requests.
 */
export const loggingMiddleware: Middleware = async (
  request: Request,
  context: RequestContext,
  next: () => Promise<Response>
) => {
  const method = request.method;
  const route = context.url.pathname;

  // Record incoming request metrics
  requestCounter.add(1, { method, path: route });
  activeConnections.add(1);
  recordHttpRequest(method, route);

  try {
    const response = await next();

    const duration = Date.now() - context.startTime;
    const status = response.status;

    // Record response metrics
    recordHttpResponseTime(duration);
    responseHistogram.record(duration, {
      method,
      status_code: status.toString(),
    });

    // Log based on status/duration
    const isSlowRequest = duration > 1000;
    const isVerySlowRequest = duration > 5000;
    const isError = status >= 400;

    if (isError) {
      err("Request failed", {
        requestId: context.requestId,
        method,
        route,
        status,
        duration: `${duration}ms`,
      });
    } else if (isVerySlowRequest) {
      warn("Very slow request detected", {
        requestId: context.requestId,
        method,
        route,
        status,
        duration: `${duration}ms`,
      });
    } else if (isSlowRequest) {
      warn("Slow request", {
        requestId: context.requestId,
        method,
        route,
        status,
        duration: `${duration}ms`,
      });
    }

    return response;
  } finally {
    activeConnections.add(-1);
  }
};
