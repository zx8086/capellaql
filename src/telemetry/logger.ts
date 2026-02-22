/* src/telemetry/logger.ts */
/* @deprecated - Use winston-logger.ts directly for new code */
/* Backward compatibility re-export from Winston-based logger */

// Re-export everything from winston-logger for backward compatibility
export {
  debug,
  err,
  error,
  log,
  LogLevel,
  telemetryLogger,
  warn,
  winstonTelemetryLogger,
} from "./winston-logger";

export type { LogContext, StructuredLogData } from "./winston-logger";
