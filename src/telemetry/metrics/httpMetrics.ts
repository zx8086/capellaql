/* src/telemetry/metrics/httpMetrics.ts */

import { type Counter, context, type Histogram, metrics, trace } from "@opentelemetry/api";

let httpRequestCounter: Counter | undefined;
let httpResponseTimeHistogram: Histogram | undefined;
let isInitialized = false;

export function initializeHttpMetrics(): void {
  if (isInitialized) {
    console.warn("HTTP metrics already initialized");
    return;
  }

  try {
    const meter = metrics.getMeter("capellaql-http-metrics", "1.0.0");

    // HTTP request counter with proper attributes
    httpRequestCounter = meter.createCounter("http_requests_total", {
      description: "Total number of HTTP requests",
      unit: "1", // UCUM unit for count
    });

    // HTTP response time histogram with proper UCUM units
    httpResponseTimeHistogram = meter.createHistogram("http_response_time_seconds", {
      description: "HTTP request response time in seconds",
      unit: "s", // UCUM unit for seconds (2025 compliance)
    });

    isInitialized = true;
    // HTTP metrics initialized successfully (silent init)
  } catch (error) {
    console.error("Error initializing HTTP metrics:", error);
  }
}

export function recordHttpRequest(method: string, route: string, statusCode?: number): void {
  if (!isInitialized || !httpRequestCounter) {
    console.warn("HTTP metrics not initialized, skipping request recording");
    return;
  }

  try {
    const labels = {
      method: method.toUpperCase(),
      route,
      ...(statusCode && { status_code: statusCode.toString() }),
    };

    httpRequestCounter.add(1, labels);
  } catch (error) {
    console.error("Error recording HTTP request:", error);
  }
}

export function recordHttpResponseTime(durationMs: number, method?: string, route?: string, statusCode?: number): void {
  if (!isInitialized || !httpResponseTimeHistogram) {
    console.warn("HTTP metrics not initialized, skipping response time recording");
    return;
  }

  try {
    // Convert milliseconds to seconds for UCUM compliance
    const durationSeconds = durationMs / 1000;

    const labels: Record<string, string> = {};

    if (method) labels.method = method.toUpperCase();
    if (route) labels.route = route;
    if (statusCode) labels.status_code = statusCode.toString();

    // Add trace context if available
    const activeContext = context.active();
    const span = trace.getSpan(activeContext);
    if (span) {
      const spanContext = span.spanContext();
      if (spanContext.traceId) {
        labels.trace_id = spanContext.traceId;
      }
    }

    httpResponseTimeHistogram.record(durationSeconds, labels);
  } catch (error) {
    console.error("Error recording HTTP response time:", error);
  }
}

export function recordGraphQLRequest(operationName: string, operationType: string): void {
  if (!isInitialized || !httpRequestCounter) {
    return;
  }

  try {
    httpRequestCounter.add(1, {
      method: "POST",
      route: "/graphql",
      operation_name: operationName,
      operation_type: operationType,
    });
  } catch (error) {
    console.error("Error recording GraphQL request:", error);
  }
}

export function recordGraphQLResponseTime(
  durationMs: number,
  operationName: string,
  operationType: string,
  hasErrors: boolean
): void {
  if (!isInitialized || !httpResponseTimeHistogram) {
    return;
  }

  try {
    const durationSeconds = durationMs / 1000;

    httpResponseTimeHistogram.record(durationSeconds, {
      method: "POST",
      route: "/graphql",
      operation_name: operationName,
      operation_type: operationType,
      has_errors: hasErrors.toString(),
    });
  } catch (error) {
    console.error("Error recording GraphQL response time:", error);
  }
}

export function getMetricsStatus(): {
  initialized: boolean;
  counters: string[];
  histograms: string[];
} {
  return {
    initialized: isInitialized,
    counters: httpRequestCounter ? ["http_requests_total"] : [],
    histograms: httpResponseTimeHistogram ? ["http_response_time_seconds"] : [],
  };
}
