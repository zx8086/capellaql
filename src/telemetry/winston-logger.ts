/* src/telemetry/winston-logger.ts */
/* Structured logging with OTLP transport and ECS field mapping */

import { context, trace, type SpanContext } from "@opentelemetry/api";
import * as apiLogs from "@opentelemetry/api-logs";
import { OpenTelemetryTransportV3 } from "@opentelemetry/winston-transport";
import winston from "winston";
import { applicationConfig, telemetryConfig } from "$config";
import { telemetryHealthMonitor } from "./health/telemetryHealth";

// ============================================================================
// Types and Interfaces
// ============================================================================

export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}

export interface LogContext {
  traceId?: string;
  spanId?: string;
  requestId?: string;
  userId?: string;
  sessionId?: string;
  operationType?: string;
}

export interface StructuredLogData {
  message: string;
  level: LogLevel;
  timestamp: number;
  context?: LogContext;
  meta?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

// ============================================================================
// ECS Field Mapping Configuration
// Implementation: lines 108-135 per monitoring-updated.md
// ============================================================================

/**
 * ECS (Elastic Common Schema) field mapping for observability platform integration.
 * Maps custom application fields to ECS-standard field names.
 *
 * Benefits:
 * - Top-level fields in Elasticsearch (not nested under labels.*)
 * - Kibana auto-complete recognition
 * - Direct field access (consumer.id instead of labels.consumerId)
 * - Standard compliance with Elastic Common Schema
 */
const ECS_FIELD_MAPPING: Record<string, string> = {
  consumerId: "consumer.id",
  username: "consumer.name",
  requestId: "event.id",
  totalDuration: "event.duration",
};

/**
 * Consumer field mapping for OTLP transport compatibility.
 * Kong consumer fields are mapped to labels.consumer_* namespace.
 */
const CONSUMER_FIELD_MAPPING: Record<string, string> = {
  consumerId: "labels.consumer_id",
  username: "labels.consumer_name",
};

// ============================================================================
// Trace Context Extraction
// ============================================================================

function getCurrentTraceContext(): LogContext {
  try {
    const ctx = context.active();
    const span = trace.getSpan(ctx);
    const spanContext: SpanContext | undefined = span?.spanContext();

    const baseContext: LogContext = spanContext
      ? {
          traceId: spanContext.traceId,
          spanId: spanContext.spanId,
        }
      : {};

    // Note: Span attributes are not directly accessible via public API
    // Correlation IDs should be set via span context or propagated headers

    return baseContext;
  } catch {
    return {};
  }
}

// ============================================================================
// ECS Field Transformation
// ============================================================================

/**
 * Apply ECS field mapping to metadata.
 * Transforms custom fields to ECS-standard fields.
 *
 * @param meta - Original metadata object
 * @returns Transformed metadata with ECS fields
 */
function applyECSMapping(meta: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(meta)) {
    // Check if field has ECS mapping
    if (key in ECS_FIELD_MAPPING) {
      const ecsField = ECS_FIELD_MAPPING[key];
      mapped[ecsField] = value;
    }
    // Check if field has consumer mapping for OTLP compatibility
    else if (key in CONSUMER_FIELD_MAPPING) {
      const consumerField = CONSUMER_FIELD_MAPPING[key];
      mapped[consumerField] = value;
    }
    // Non-mapped fields go under labels.* namespace
    else if (!key.startsWith("labels.") && !key.includes(".")) {
      mapped[`labels.${key}`] = value;
    } else {
      mapped[key] = value;
    }
  }

  return mapped;
}

// ============================================================================
// Custom Winston Format for ECS Compliance
// ============================================================================

const ecsFormat = winston.format((info) => {
  const { level, message, timestamp, ...meta } = info;

  // Apply ECS field mapping to metadata
  const mappedMeta = applyECSMapping(meta as Record<string, unknown>);

  // Get current trace context
  const traceContext = getCurrentTraceContext();

  // Mutate info object to preserve Winston's internal symbols
  // This is required for proper Winston transport handling
  info["@timestamp"] = timestamp || new Date().toISOString();
  info["log.level"] = level;
  info["ecs.version"] = "8.10.0";
  info["service.name"] = telemetryConfig.SERVICE_NAME || "capellaql";
  info["service.version"] = telemetryConfig.SERVICE_VERSION || "2.0.0";
  info["service.environment"] = process.env.NODE_ENV || process.env.BUN_ENV || "development";
  info["event.dataset"] = telemetryConfig.SERVICE_NAME || "capellaql";
  info["runtime.name"] = typeof Bun !== "undefined" ? "bun" : "node";
  info.timestamp = new Date().toISOString();

  // Add trace context for distributed tracing correlation
  if (traceContext.traceId) {
    info["trace.id"] = traceContext.traceId;
  }
  if (traceContext.spanId) {
    info["span.id"] = traceContext.spanId;
  }

  // Add service object for nested access
  info.service = {
    name: telemetryConfig.SERVICE_NAME || "capellaql",
    environment: process.env.NODE_ENV || process.env.BUN_ENV || "development",
  };

  // Add mapped metadata
  for (const [key, value] of Object.entries(mappedMeta)) {
    info[key] = value;
  }

  return info;
});

// ============================================================================
// Console Format for Development (opt-in via LOG_FORMAT=console)
// ============================================================================

const developmentFormat = winston.format.combine(
  winston.format.timestamp({
    format: () => {
      const date = new Date();
      return `${date.toLocaleDateString()} ${date.toLocaleTimeString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`;
    },
  }),
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const traceContext = getCurrentTraceContext();
    const contextStr = traceContext.traceId
      ? `[${traceContext.traceId.slice(0, 8)}:${traceContext.spanId?.slice(0, 8) || "--------"}]`
      : "";

    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
    return `${timestamp} ${level} ${contextStr} ${message}${metaStr}`;
  }),
);

// ============================================================================
// JSON ECS Format (default format for all environments)
// ============================================================================

const jsonEcsFormat = winston.format.combine(winston.format.timestamp(), ecsFormat(), winston.format.json());

// ============================================================================
// Winston Telemetry Logger Class
// ============================================================================

class WinstonTelemetryLogger {
  private logger: winston.Logger;
  private isInitialized = false;
  private fallbackLogs: StructuredLogData[] = [];
  private otelTransport: OpenTelemetryTransportV3 | undefined;

  constructor() {
    // LOG_FORMAT: "json-ecs" (default) | "console" (opt-in colorized format)
    const logFormat = process.env.LOG_FORMAT?.toLowerCase() || "json-ecs";
    const useConsoleFormat = logFormat === "console";

    // Use LOG_LEVEL from config (defaults to "info")
    const configuredLevel = applicationConfig.LOG_LEVEL || "info";

    // Create base Winston logger with console transport
    // Default: JSON ECS format for all environments (production observability)
    // Optional: Set LOG_FORMAT=console for colorized development output
    this.logger = winston.createLogger({
      level: configuredLevel,
      format: useConsoleFormat ? developmentFormat : jsonEcsFormat,
      transports: [new winston.transports.Console()],
    });
  }

  /**
   * Reinitialize logger with OTLP transport after LoggerProvider is set globally.
   * Called by instrumentation.ts after NodeSDK.start() completes.
   *
   * Per SDK 0.212.0+ requirement: LoggerProvider must be registered globally
   * before OpenTelemetry transport can pick it up.
   */
  public reinitialize(): void {
    if (this.isInitialized) {
      return;
    }

    try {
      // Verify LoggerProvider is available
      const loggerProvider = apiLogs.logs.getLoggerProvider();
      if (!loggerProvider) {
        console.warn("Winston reinitialize: LoggerProvider not available, continuing with console only");
        return;
      }

      // Create OpenTelemetry transport - it will pick up the global LoggerProvider
      this.otelTransport = new OpenTelemetryTransportV3();

      // Add OTLP transport to Winston
      this.logger.add(this.otelTransport);
      this.isInitialized = true;

      // Flush any logs that occurred before initialization
      this.flushFallbackLogs();

      this.logger.info("Winston logger reinitialized with OTLP transport", {
        component: "telemetry",
        operation: "logger_reinitialize",
      });
    } catch (error) {
      console.error("Failed to reinitialize Winston logger with OTLP:", error);
    }
  }

  /**
   * Legacy initialize method for backward compatibility.
   * Calls reinitialize() internally.
   */
  public initialize(): void {
    this.reinitialize();
  }

  public log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const logData = this.createLogData(level, message, meta);
    this.emit(logData);
  }

  public debug(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, meta);
  }

  public info(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, meta);
  }

  public warn(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, meta);
  }

  public error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    const errorMeta =
      error instanceof Error
        ? {
            error: {
              name: error.name,
              message: error.message,
              stack: error.stack,
            },
            ...meta,
          }
        : error
          ? { error: String(error), ...meta }
          : meta;

    this.log(LogLevel.ERROR, message, errorMeta);
  }

  private createLogData(level: LogLevel, message: string, meta?: Record<string, unknown>): StructuredLogData {
    return {
      message,
      level,
      timestamp: Date.now(),
      context: getCurrentTraceContext(),
      meta,
    };
  }

  private emit(logData: StructuredLogData): void {
    // Before OTLP is initialized, output all logs to console
    if (!this.isInitialized) {
      // Store for replay after initialization
      this.fallbackLogs.push(logData);
      if (this.fallbackLogs.length > 100) {
        this.fallbackLogs.shift();
      }
      // Output to console in JSON ECS format
      this.logToConsoleOnly(logData);
      return;
    }

    // Check circuit breaker for OTLP resilience
    const circuitBreaker = telemetryHealthMonitor.getCircuitBreaker();

    if (!circuitBreaker.canExecute()) {
      // Circuit breaker is open, fall back to console only
      this.logToConsoleOnly(logData);
      return;
    }

    try {
      // Log through Winston with OTLP transport
      // Sampling is handled by the collector (KISS principle)
      this.logger.log({
        level: logData.level,
        message: logData.message,
        ...logData.context,
        ...logData.meta,
      });

      // Record successful log emission
      telemetryHealthMonitor.recordExporterSuccess("logs");
      circuitBreaker.recordSuccess();
    } catch (error) {
      // Record failure and fall back to console
      telemetryHealthMonitor.recordExporterFailure("logs", error as Error);
      circuitBreaker.recordFailure();
      this.logToConsoleOnly(logData, error);
    }
  }

  private logToConsoleOnly(logData: StructuredLogData, error?: unknown): void {
    // Direct console logging in JSON ECS format when OTLP is unavailable
    const timestamp = new Date(logData.timestamp).toISOString();

    // Build ECS-compliant fallback log record
    const ecsRecord: Record<string, unknown> = {
      "@timestamp": timestamp,
      message: logData.message,
      "log.level": logData.level,
      "ecs.version": "8.10.0",
      "service.name": telemetryConfig.SERVICE_NAME || "capellaql",
      "service.version": telemetryConfig.SERVICE_VERSION || "2.0.0",
      "service.environment": process.env.NODE_ENV || process.env.BUN_ENV || "development",
      "event.dataset": telemetryConfig.SERVICE_NAME || "capellaql",
      timestamp,
    };

    // Add trace context if available
    if (logData.context?.traceId) {
      ecsRecord["trace.id"] = logData.context.traceId;
    }
    if (logData.context?.spanId) {
      ecsRecord["span.id"] = logData.context.spanId;
    }

    // Add service object
    ecsRecord.service = {
      name: telemetryConfig.SERVICE_NAME || "capellaql",
      environment: process.env.NODE_ENV || process.env.BUN_ENV || "development",
    };

    // Add metadata
    if (logData.meta) {
      for (const [key, value] of Object.entries(logData.meta)) {
        ecsRecord[key] = value;
      }
    }

    // Add error info if present
    if (error) {
      ecsRecord.error =
        error instanceof Error ? { message: error.message, stack: error.stack, type: error.name } : { message: String(error) };
    }

    // Output as single JSON string in ECS format (matches expected: "info: Message {...}")
    const jsonLog = JSON.stringify(ecsRecord);

    switch (logData.level) {
      case LogLevel.DEBUG:
        console.debug(`${logData.level}: ${logData.message} ${jsonLog}`);
        break;
      case LogLevel.INFO:
        console.info(`${logData.level}: ${logData.message} ${jsonLog}`);
        break;
      case LogLevel.WARN:
        console.warn(`${logData.level}: ${logData.message} ${jsonLog}`);
        break;
      case LogLevel.ERROR:
        console.error(`${logData.level}: ${logData.message} ${jsonLog}`);
        break;
    }
  }

  private flushFallbackLogs(): void {
    if (this.fallbackLogs.length > 0 && this.isInitialized) {
      console.info(`Flushing ${this.fallbackLogs.length} fallback logs to OTLP`);

      for (const logData of this.fallbackLogs) {
        this.emit(logData);
      }

      this.fallbackLogs = [];
    }
  }

  /**
   * Get the underlying Winston logger instance.
   * Use for advanced scenarios requiring direct Winston access.
   */
  public getLogger(): winston.Logger {
    return this.logger;
  }

  /**
   * Check if OTLP transport is active.
   */
  public isOTLPEnabled(): boolean {
    return this.isInitialized;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

// Singleton logger instance (matches documentation: winstonTelemetryLogger)
export const winstonTelemetryLogger = new WinstonTelemetryLogger();

// Legacy alias for compatibility
export const telemetryLogger = winstonTelemetryLogger;

// ============================================================================
// Convenience Functions (matching existing logger interface)
// ============================================================================

export function log(message: string, meta?: Record<string, unknown>): void {
  winstonTelemetryLogger.info(message, meta);
}

export function debug(message: string, meta?: Record<string, unknown>): void {
  winstonTelemetryLogger.debug(message, meta);
}

export function warn(message: string, meta?: Record<string, unknown>): void {
  winstonTelemetryLogger.warn(message, meta);
}

export function err(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
  winstonTelemetryLogger.error(message, error, meta);
}

export function error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
  winstonTelemetryLogger.error(message, error, meta);
}
