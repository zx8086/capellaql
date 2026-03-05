/* src/telemetry/metrics/api-version-metrics.ts */

import { error } from "../../utils/logger";
import {
  apiVersionFallbackCounter,
  apiVersionHeaderSourceCounter,
  apiVersionParsingDurationHistogram,
  apiVersionRequestsCounter,
  apiVersionRoutingDurationHistogram,
  apiVersionUnsupportedCounter,
} from "./instruments";
import { isMetricsInitialized } from "./state";
import type { ApiVersionAttributes } from "./types";

export function recordApiVersionUsage(
  version: "v1" | "v2",
  endpoint: string,
  method: string,
  source: "header" | "default" | "fallback"
): void {
  if (!isMetricsInitialized()) return;

  const attributes: ApiVersionAttributes = { version, endpoint, method, source };

  try {
    apiVersionRequestsCounter.add(1, attributes);
    apiVersionHeaderSourceCounter.add(1, attributes);

    if (source === "fallback") {
      apiVersionFallbackCounter.add(1, attributes);
    }
  } catch (err) {
    error("Failed to record API version usage", {
      error: (err as Error).message,
      attributes,
    });
  }
}

export function recordApiVersionParsing(
  version: "v1" | "v2",
  endpoint: string,
  method: string,
  durationMs: number
): void {
  if (!isMetricsInitialized()) return;

  const attributes: ApiVersionAttributes = {
    version,
    endpoint,
    method,
    source: "header",
  };

  try {
    apiVersionParsingDurationHistogram.record(durationMs / 1000, attributes);
  } catch (err) {
    error("Failed to record API version parsing duration", {
      error: (err as Error).message,
      attributes,
      durationMs,
    });
  }
}

export function recordApiVersionRequest(
  version: string,
  endpoint: string,
  method: string,
  source?: string
): void {
  const validVersion = version === "v1" || version === "v2" ? version : "v1";
  const validSource = ["header", "default", "fallback"].includes(source || "header")
    ? (source as "header" | "default" | "fallback") || "header"
    : "header";
  recordApiVersionUsage(validVersion, endpoint, method, validSource);
}

export function recordApiVersionHeaderSource(
  version: string,
  endpoint: string,
  method: string,
  source: string
): void {
  const validVersion = version === "v1" || version === "v2" ? version : "v1";
  const validSource = ["header", "default", "fallback"].includes(source)
    ? (source as "header" | "default" | "fallback")
    : "header";
  recordApiVersionUsage(validVersion, endpoint, method, validSource);
}

export function recordApiVersionParsingDuration(
  version: string,
  endpoint: string,
  method: string,
  durationMs: number
): void {
  const validVersion = version === "v1" || version === "v2" ? version : "v1";
  recordApiVersionParsing(validVersion, endpoint, method, durationMs);
}

export function recordApiVersionUnsupported(
  version: string,
  endpoint: string,
  method: string
): void {
  if (!isMetricsInitialized()) return;

  const attributes: ApiVersionAttributes = {
    version: version === "v1" || version === "v2" ? version : "v1",
    endpoint,
    method,
    source: "header",
  };

  try {
    apiVersionUnsupportedCounter.add(1, attributes);
  } catch (err) {
    error("Failed to record unsupported API version", {
      error: (err as Error).message,
      version,
      endpoint,
      method,
    });
  }
}

export function recordApiVersionFallback(version: string, endpoint: string, method: string): void {
  if (!isMetricsInitialized()) return;

  const attributes: ApiVersionAttributes = {
    version: version === "v1" || version === "v2" ? version : "v1",
    endpoint,
    method,
    source: "fallback",
  };

  try {
    apiVersionFallbackCounter.add(1, attributes);
  } catch (err) {
    error("Failed to record API version fallback", {
      error: (err as Error).message,
      version,
      endpoint,
      method,
    });
  }
}

export function recordApiVersionRoutingDuration(
  version: string,
  endpoint: string,
  method: string,
  durationMs: number
): void {
  if (!isMetricsInitialized()) return;

  const attributes: ApiVersionAttributes = {
    version: version === "v1" || version === "v2" ? version : "v1",
    endpoint,
    method,
    source: "header",
  };

  try {
    apiVersionRoutingDurationHistogram.record(durationMs / 1000, attributes);
  } catch (err) {
    error("Failed to record API version routing duration", {
      error: (err as Error).message,
      version,
      endpoint,
      method,
      durationMs,
    });
  }
}
