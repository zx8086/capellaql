/* src/telemetry/winston-logger.ts */
/* Structured logging with OTLP transport and ECS field mapping */
/* Per monitoring-updated.md: Uses @elastic/ecs-winston-format with colorize + simple console */

import ecsFormat from "@elastic/ecs-winston-format";
import { context, type SpanContext, trace } from "@opentelemetry/api";
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
 * Per monitoring-updated.md lines 108-135:
 * - Top-level fields in Elasticsearch (not nested under labels.*)
 * - Kibana auto-complete recognition
 * - Direct field access (consumer.id instead of labels.consumerId)
 * - Standard compliance with Elastic Common Schema
 *
 * IMPORTANT: The service uses `consumer.*` namespace, NOT `user.*`.
 * This is intentional per documentation lines 218-224:
 * - `consumer.*` - API consumer entities (API clients)
 * - `user.*` - Reserved for end-user identification (not currently used)
 */
const ECS_FIELD_MAPPING: Record<string, string> = {
  // Consumer fields (API client identification)
  consumerId: "consumer.id",
  username: "consumer.name",
  // Event correlation fields
  requestId: "event.id",
  totalDuration: "event.duration",
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

    return baseContext;
  } catch {
    return {};
  }
}

// ============================================================================
// ECS Field Transformation (Custom Transform for Field Mapping)
// Per monitoring-updated.md: Step 3 in format pipeline
// ============================================================================

/**
 * Custom Winston transform to rename fields per ECS mapping.
 * Applied BEFORE ecsFormat() to ensure correct field names in ECS output.
 */
const fieldMappingTransform = winston.format((info) => {
  // Apply ECS field mapping to info object
  for (const [customField, ecsField] of Object.entries(ECS_FIELD_MAPPING)) {
    if (customField in info) {
      info[ecsField] = info[customField];
      delete info[customField];
    }
  }

  // Inject trace context for distributed tracing correlation
  const traceContext = getCurrentTraceContext();
  if (traceContext.traceId) {
    info["trace.id"] = traceContext.traceId;
  }
  if (traceContext.spanId) {
    info["span.id"] = traceContext.spanId;
  }

  return info;
});

// ============================================================================
// Winston Logger Configuration
// Per monitoring-updated.md format pipeline:
// 1. winston.format.timestamp()      -> Adds timestamp
// 2. winston.format.errors()         -> Stack trace handling
// 3. Custom transform                -> Renames fields (consumerId -> consumer.id)
// 4. ecsFormat()                     -> ECS JSON structure
//
// Console transport format:
// 1. winston.format.colorize()       -> Adds ANSI colors
// 2. winston.format.simple()         -> "level: message {json}"
// ============================================================================

// Service configuration for ECS format
const localConfig = {
  serviceName: telemetryConfig.SERVICE_NAME || "capellaql",
  serviceVersion: telemetryConfig.SERVICE_VERSION || "2.0.0",
  environment: process.env.NODE_ENV || process.env.BUN_ENV || "development",
};

// ============================================================================
// Winston Telemetry Logger Class
// ============================================================================

class WinstonTelemetryLogger {
  private logger: winston.Logger;
  private isInitialized = false;
  private fallbackLogs: StructuredLogData[] = [];
  private otelTransport: OpenTelemetryTransportV3 | undefined;

  constructor() {
    // Use LOG_LEVEL from config (defaults to "info")
    const configuredLevel = applicationConfig.LOG_LEVEL || "info";

    // Create Winston logger per monitoring-updated.md specification:
    // Logger format: timestamp -> errors -> custom field transform -> ecsFormat
    // Console transport: colorize + simple -> produces "info: message {json}"
    this.logger = winston.createLogger({
      level: configuredLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        fieldMappingTransform(),
        ecsFormat({
          convertErr: true,
          convertReqRes: true,
          apmIntegration: true,
          serviceName: localConfig.serviceName,
          serviceVersion: localConfig.serviceVersion,
          serviceEnvironment: localConfig.environment,
        })
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(winston.format.colorize({ all: true }), winston.format.simple()),
        }),
      ],
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
    // Before OTLP is initialized, still use Winston (console output works)
    if (!this.isInitialized) {
      // Store for replay after initialization
      this.fallbackLogs.push(logData);
      if (this.fallbackLogs.length > 100) {
        this.fallbackLogs.shift();
      }
    }

    // Check circuit breaker for OTLP resilience (only when OTLP is enabled)
    if (this.isInitialized) {
      const circuitBreaker = telemetryHealthMonitor.getCircuitBreaker();
      if (!circuitBreaker.canExecute()) {
        // Circuit breaker is open, skip OTLP transport
        // Winston console transport still works
        this.logToWinston(logData);
        return;
      }
    }

    try {
      // Log through Winston (works for both console-only and OTLP modes)
      this.logToWinston(logData);

      // Record successful log emission (only when OTLP is enabled)
      if (this.isInitialized) {
        telemetryHealthMonitor.recordExporterSuccess("logs");
        telemetryHealthMonitor.getCircuitBreaker().recordSuccess();
      }
    } catch (error) {
      // Record failure (only when OTLP is enabled)
      if (this.isInitialized) {
        telemetryHealthMonitor.recordExporterFailure("logs", error as Error);
        telemetryHealthMonitor.getCircuitBreaker().recordFailure();
      }
      // Fallback to direct console for critical errors
      this.directConsoleLog(logData, error);
    }
  }

  private logToWinston(logData: StructuredLogData): void {
    // Log through Winston with all metadata
    this.logger.log({
      level: logData.level,
      message: logData.message,
      ...logData.context,
      ...logData.meta,
    });
  }

  private directConsoleLog(logData: StructuredLogData, error?: unknown): void {
    // Direct console fallback when Winston fails
    const output = {
      "@timestamp": new Date(logData.timestamp).toISOString(),
      message: logData.message,
      level: logData.level,
      ...logData.meta,
      _fallbackError: error instanceof Error ? error.message : String(error),
    };

    switch (logData.level) {
      case LogLevel.DEBUG:
        console.debug(`${logData.level}: ${logData.message}`, JSON.stringify(output));
        break;
      case LogLevel.INFO:
        console.info(`${logData.level}: ${logData.message}`, JSON.stringify(output));
        break;
      case LogLevel.WARN:
        console.warn(`${logData.level}: ${logData.message}`, JSON.stringify(output));
        break;
      case LogLevel.ERROR:
        console.error(`${logData.level}: ${logData.message}`, JSON.stringify(output));
        break;
    }
  }

  private flushFallbackLogs(): void {
    if (this.fallbackLogs.length > 0 && this.isInitialized) {
      // Use direct Winston logger to avoid recursion while still getting structured output
      this.logger.info("Flushing fallback logs to OTLP", {
        component: "telemetry",
        operation: "flush_fallback",
        count: this.fallbackLogs.length,
      });

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
