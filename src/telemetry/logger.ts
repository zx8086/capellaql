/* src/telemetry/logger.ts */
/* Re-exports logging from DI container for backward compatibility */
/* Application code importing from this path continues to work unchanged */

export type { LogContext } from "../logging/ports/logger.port";
export type { StructuredLogData } from "./winston-logger";
export { LogLevel } from "./winston-logger";

import { getChildLogger, getLogger } from "../logging/container";
export { getChildLogger };

export function log(message: string, meta?: Record<string, unknown>): void {
  getLogger().info(message, meta);
}

export function debug(message: string, meta?: Record<string, unknown>): void {
  getLogger().debug(message, meta);
}

export function warn(message: string, meta?: Record<string, unknown>): void {
  getLogger().warn(message, meta);
}

export function err(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
  const errorContext: Record<string, unknown> = {};
  if (error != null) {
    const e = error instanceof Error ? error : new Error(String(error));
    errorContext["error.type"] = e.name;
    errorContext["error.message"] = e.message;
    if (e.stack) {
      const frames = e.stack
        .split("\n")
        .slice(1, 4)
        .map((l) => l.trim())
        .join(" → ");
      errorContext["error.stack"] = frames;
    }
  }
  getLogger().error(message, { ...errorContext, ...meta });
}

export function error(message: string, errorObj?: Error | unknown, meta?: Record<string, unknown>): void {
  err(message, errorObj, meta);
}

// Re-export singleton references for backward compatibility
export { telemetryLogger, winstonTelemetryLogger } from "./winston-logger";
