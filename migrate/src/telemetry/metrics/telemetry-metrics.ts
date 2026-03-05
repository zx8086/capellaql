/* src/telemetry/metrics/telemetry-metrics.ts */

import { error } from "../../utils/logger";
import { telemetryExportCounter, telemetryExportErrorCounter } from "./instruments";
import { isMetricsInitialized } from "./state";
import type { TelemetryAttributes } from "./types";

export function recordTelemetryExport(
  exporter: "console" | "otlp" | "jaeger",
  success: boolean
): void {
  if (!isMetricsInitialized()) return;

  const attributes: TelemetryAttributes = {
    exporter,
    status: success ? "success" : "failure",
  };

  try {
    telemetryExportCounter.add(1, attributes);

    if (!success) {
      telemetryExportErrorCounter.add(1, attributes);
    }
  } catch (err) {
    error("Failed to record telemetry export", {
      error: (err as Error).message,
      exporter,
      success,
    });
  }
}

export function recordTelemetryExportError(
  exporter: "console" | "otlp" | "jaeger",
  errorType: string
): void {
  if (!isMetricsInitialized()) return;

  const attributes: TelemetryAttributes = {
    exporter,
    status: "failure",
  };

  try {
    telemetryExportErrorCounter.add(1, attributes);
  } catch (err) {
    error("Failed to record telemetry export error", {
      error: (err as Error).message,
      exporter,
      errorType,
    });
  }
}
