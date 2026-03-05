/* src/telemetry/metrics/http-metrics.ts */

import { error } from "../../utils/logger";
import { recordError } from "./error-metrics";
import {
  httpActiveRequestsGauge,
  httpRequestCounter,
  httpRequestSizeHistogram,
  httpRequestsByStatusCounter,
  httpResponseSizeHistogram,
  httpResponseTimeHistogram,
} from "./instruments";
import { isMetricsInitialized } from "./state";
import type { HttpRequestAttributes } from "./types";

export function recordHttpRequest(
  method: string,
  route: string,
  statusCode?: number,
  requestSize?: number,
  responseSize?: number
): void {
  if (!isMetricsInitialized()) {
    return;
  }

  const attributes: HttpRequestAttributes = {
    method: method.toUpperCase(),
    route,
    ...(statusCode && { status_code: statusCode.toString() }),
  };

  try {
    httpRequestCounter.add(1, attributes);

    if (statusCode) {
      const statusAttributes: HttpRequestAttributes = {
        method: method.toUpperCase(),
        route,
        status_code: statusCode.toString(),
        status_class: `${Math.floor(statusCode / 100)}xx`,
      };
      httpRequestsByStatusCounter.add(1, statusAttributes);
    }

    if (requestSize !== undefined) {
      httpRequestSizeHistogram.record(requestSize, attributes);
    }

    if (responseSize !== undefined) {
      httpResponseSizeHistogram.record(responseSize, attributes);
    }
  } catch (err) {
    error("Failed to record HTTP request metrics", {
      error: (err as Error).message,
      attributes,
    });
    recordError("metrics_recording_error", {
      operation: "recordHttpRequest",
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

export function recordHttpResponseTime(
  durationMs: number,
  method: string,
  route: string,
  statusCode?: number
): void {
  if (!isMetricsInitialized()) return;

  const attributes: HttpRequestAttributes = {
    method: method.toUpperCase(),
    route,
    ...(statusCode && { status_code: statusCode.toString() }),
  };

  try {
    httpResponseTimeHistogram.record(durationMs / 1000, attributes);
  } catch (err) {
    error("Failed to record HTTP response time", {
      error: (err as Error).message,
      durationMs,
      attributes,
    });
  }
}

export function recordActiveRequests(count: number): void {
  if (!isMetricsInitialized()) return;

  try {
    httpActiveRequestsGauge.record(count, { method: "GET", route: "/active" });
  } catch (err) {
    error("Failed to record active requests", {
      error: (err as Error).message,
      count,
    });
  }
}

export function recordHttpResponseSize(
  size: number,
  method: string,
  route: string,
  statusCode?: number
): void {
  if (!isMetricsInitialized()) return;

  const attributes: HttpRequestAttributes = {
    method: method.toUpperCase(),
    route,
    ...(statusCode && {
      status_code: statusCode.toString(),
      status_class: `${Math.floor(statusCode / 100)}xx`,
    }),
  };

  try {
    httpResponseSizeHistogram.record(size, attributes);
  } catch (err) {
    error("Failed to record HTTP response size metric", {
      error: (err as Error).message,
      attributes,
      size,
    });
  }
}

export function recordHttpRequestSize(
  size: number,
  method: string,
  route: string,
  statusCode?: number
): void {
  if (!isMetricsInitialized()) return;

  const attributes: HttpRequestAttributes = {
    method: method.toUpperCase(),
    route,
    ...(statusCode && {
      status_code: statusCode.toString(),
      status_class: `${Math.floor(statusCode / 100)}xx`,
    }),
  };

  try {
    httpRequestSizeHistogram.record(size, attributes);
  } catch (err) {
    error("Failed to record HTTP request size metric", {
      error: (err as Error).message,
      attributes,
      size,
    });
  }
}
