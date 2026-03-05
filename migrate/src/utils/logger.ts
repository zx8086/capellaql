/* src/utils/logger.ts */

// Stryker disable all: Logger implementation is tested via integration tests and telemetry output verification.
// String literal mutations in log messages and field names are low-value mutations that don't catch real bugs.

// SIO-447: Updated to use logging container for backend selection (Pino/Winston)

type LoggerConfig = { telemetry: { serviceName: string; environment: string } };

let configInstance: LoggerConfig | null = null;

function getConfig(): LoggerConfig {
  if (!configInstance) {
    try {
      const { loadConfig } = require("../config/index");
      configInstance = loadConfig();
    } catch (_error) {
      configInstance = {
        telemetry: {
          serviceName: "authentication-service",
          environment: "development",
        },
      };
    }
  }
  // TypeScript can't infer that configInstance is always non-null after the if block
  // because loadConfig() comes from a dynamic require
  // biome-ignore lint/style/noNonNullAssertion: Safe here - configInstance is guaranteed non-null after the if block
  return configInstance!;
}

function getLoggerInstance() {
  // Use logging container for backend selection (LOGGING_BACKEND env var)
  // Container handles Pino/Winston selection and initialization
  try {
    const { getLogger } = require("../logging/container");
    return getLogger();
  } catch (_error) {
    // Fallback: Try legacy Winston logger directly
    try {
      const { winstonTelemetryLogger } = require("../telemetry/winston-logger");
      return winstonTelemetryLogger;
    } catch (_innerError) {
      // Final fallback: console-based logger
      console.error("ERROR: Could not load logger, falling back to console:", _error);
      const config = getConfig();
      return {
        info: (msg: string, ctx: Record<string, unknown>) =>
          console.log(
            JSON.stringify({
              "@timestamp": new Date().toISOString(),
              "log.level": "INFO",
              message: msg,
              service: {
                name: config.telemetry.serviceName,
                environment: config.telemetry.environment,
              },
              ...ctx,
            })
          ),
        warn: (msg: string, ctx: Record<string, unknown>) =>
          console.warn(
            JSON.stringify({
              "@timestamp": new Date().toISOString(),
              "log.level": "WARN",
              message: msg,
              service: {
                name: config.telemetry.serviceName,
                environment: config.telemetry.environment,
              },
              ...ctx,
            })
          ),
        error: (msg: string, ctx: Record<string, unknown>) =>
          console.error(
            JSON.stringify({
              "@timestamp": new Date().toISOString(),
              "log.level": "ERROR",
              message: msg,
              service: {
                name: config.telemetry.serviceName,
                environment: config.telemetry.environment,
              },
              ...ctx,
            })
          ),
      };
    }
  }
}

export function log(message: string, context: Record<string, unknown> = {}) {
  // Service info is in OTEL resource attributes - no need to duplicate in every log
  getLoggerInstance().info(message, context);
}

export function warn(message: string, context: Record<string, unknown> = {}) {
  // Service info is in OTEL resource attributes - no need to duplicate in every log
  getLoggerInstance().warn(message, context);
}

export function error(message: string, context: Record<string, unknown> = {}) {
  // Service info is in OTEL resource attributes - no need to duplicate in every log
  getLoggerInstance().error(message, context);
}

export function audit(eventType: string, context: Record<string, unknown> = {}) {
  // Service info is in OTEL resource attributes - no need to duplicate in every log
  getLoggerInstance().info(eventType, {
    audit: true,
    event_type: eventType,
    ...context,
  });
}

export function logError(message: string, err: Error, context: Record<string, unknown> = {}) {
  // Service info is in OTEL resource attributes - no need to duplicate in every log
  getLoggerInstance().error(message, {
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
    },
    ...context,
  });
}

export const logger = { log, warn, error, audit, logError };
