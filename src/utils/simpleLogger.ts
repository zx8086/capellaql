/* src/utils/simpleLogger.ts */

// DEPRECATED: This file is deprecated. Use ../telemetry/logger.ts instead.
// Re-exporting for backward compatibility.

import { log as telemetryLog, err as telemetryErr, warn as telemetryWarn, debug as telemetryDebug } from '../telemetry/logger';

console.warn("DEPRECATED: src/utils/simpleLogger.ts is deprecated. Use ../telemetry module instead.");

export function log(message: string, meta?: any): void {
  telemetryLog(message, meta);
}

export function err(message: string, meta?: any): void {
  telemetryErr(message, undefined, meta);
}

export function warn(message: string, meta?: any): void {
  telemetryWarn(message, meta);
}

export function debug(message: string, meta?: any): void {
  telemetryDebug(message, meta);
}
  