/* src/telemetry/metrics/httpMetrics.ts */

import { type Counter, context, type Histogram, metrics, trace } from "@opentelemetry/api";
import { getSimpleSmartSampler } from "../instrumentation";

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

  // Apply unified sampling decision
  const samplingCoordinator = getSimpleSmartSampler();
  if (samplingCoordinator) {
    const metricName = "http_requests_total";
    const attributes = { 
      metric_category: "technical", 
      method: method.toUpperCase(),
      route,
      ...(statusCode && { status_code: statusCode.toString() }),
    };
    
    const decision = samplingCoordinator.shouldSampleMetric(metricName, attributes);
    if (!decision.shouldSample) {
      return; // Skip this metric based on sampling decision
    }

    // Add sampling metadata to attributes
    attributes.sampling_reason = decision.reason;
    attributes.sampling_rate = (decision.samplingRate ?? 0).toString();
    if (decision.correlationId) {
      attributes.correlation_id = decision.correlationId;
    }
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

  // Apply unified sampling decision
  const samplingCoordinator = getSimpleSmartSampler();
  if (samplingCoordinator) {
    const metricName = "http_response_time_seconds";
    const attributes = { 
      metric_category: "technical",
      ...(method && { method: method.toUpperCase() }),
      ...(route && { route }),
      ...(statusCode && { status_code: statusCode.toString() }),
    };
    
    const decision = samplingCoordinator.shouldSampleMetric(metricName, attributes);
    if (!decision.shouldSample) {
      return; // Skip this metric based on sampling decision
    }
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

  // Apply unified sampling decision - GraphQL operations might be business metrics
  const samplingCoordinator = getSimpleSmartSampler();
  if (samplingCoordinator) {
    const isBusinessOperation = operationType === "query" && (
      operationName.toLowerCase().includes("revenue") ||
      operationName.toLowerCase().includes("order") ||
      operationName.toLowerCase().includes("conversion")
    );
    
    const metricName = "graphql_requests_total";
    const attributes = { 
      metric_category: isBusinessOperation ? "business" : "technical",
      method: "POST",
      route: "/graphql",
      operation_name: operationName,
      operation_type: operationType,
    };
    
    const decision = samplingCoordinator.shouldSampleMetric(metricName, attributes);
    if (!decision.shouldSample) {
      return; // Skip this metric based on sampling decision
    }
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

  // Apply unified sampling decision - GraphQL operations might be business metrics
  const samplingCoordinator = getSimpleSmartSampler();
  if (samplingCoordinator) {
    const isBusinessOperation = operationType === "query" && (
      operationName.toLowerCase().includes("revenue") ||
      operationName.toLowerCase().includes("order") ||
      operationName.toLowerCase().includes("conversion")
    );
    
    const metricName = "graphql_response_time_seconds";
    const attributes = { 
      metric_category: isBusinessOperation ? "business" : "technical",
      method: "POST",
      route: "/graphql",
      operation_name: operationName,
      operation_type: operationType,
      has_errors: hasErrors.toString(),
    };
    
    const decision = samplingCoordinator.shouldSampleMetric(metricName, attributes);
    if (!decision.shouldSample) {
      return; // Skip this metric based on sampling decision
    }
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
