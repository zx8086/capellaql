/* src/telemetry/metrics/error-metrics.ts */

import { error } from "../../utils/logger";
import { errorRateCounter, exceptionCounter } from "./instruments";
import { isMetricsInitialized } from "./state";
import type { ErrorAttributes } from "./types";

export function recordError(errorType: string, context?: Record<string, unknown>): void {
  if (!isMetricsInitialized()) return;

  const attributes: ErrorAttributes = {
    error_type: errorType,
    operation: (context?.operation as string) || "unknown",
    component: (context?.component as string) || "application",
  };

  try {
    errorRateCounter.add(1, attributes);
  } catch (err) {
    error("Failed to record error metric", {
      error: (err as Error).message,
      errorType,
      context,
    });
  }
}

export function recordException(
  exceptionType: string | Error,
  component: string = "application"
): void {
  if (!isMetricsInitialized()) return;

  const errorType = typeof exceptionType === "string" ? exceptionType : exceptionType.message;

  const attributes: ErrorAttributes = {
    error_type: errorType,
    operation: "exception_handling",
    component,
  };

  try {
    exceptionCounter.add(1, attributes);
  } catch (err) {
    error("Failed to record exception metric", {
      error: (err as Error).message,
      exceptionType,
      component,
    });
  }
}
