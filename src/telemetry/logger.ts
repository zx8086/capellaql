/* src/telemetry/logger.ts */

import { context, type SpanContext, trace } from "@opentelemetry/api";
import * as api from "@opentelemetry/api-logs";
import config from "$config";
import { telemetryHealthMonitor } from "./health/telemetryHealth";

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
  meta?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class TelemetryLogger {
  private logger: api.Logger | undefined;
  private isInitialized = false;
  private fallbackLogs: StructuredLogData[] = [];

  public initialize(): void {
    if (this.isInitialized) {
      return;
    }

    try {
      const loggerProvider = api.logs.getLoggerProvider();
      this.logger = loggerProvider.getLogger("capellaql-logger", "1.0.0");
      this.isInitialized = true;

      // Flush any fallback logs
      this.flushFallbackLogs();
    } catch (error) {
      console.error("Failed to initialize telemetry logger:", error);
      // Continue with console fallback
    }
  }

  public log(level: LogLevel, message: string, meta?: Record<string, any>): void {
    const logData = this.createLogData(level, message, meta);
    this.emit(logData);
  }

  public debug(message: string, meta?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, meta);
  }

  public info(message: string, meta?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, meta);
  }

  public warn(message: string, meta?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, meta);
  }

  public error(message: string, error?: Error | unknown, meta?: Record<string, any>): void {
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
        : { error: String(error), ...meta };

    this.log(LogLevel.ERROR, message, errorMeta);
  }

  private createLogData(level: LogLevel, message: string, meta?: Record<string, any>): StructuredLogData {
    return {
      message,
      level,
      timestamp: Date.now(),
      context: this.getCurrentTraceContext(),
      meta,
    };
  }

  private getCurrentTraceContext(): LogContext {
    try {
      const ctx = context.active();
      const span = trace.getSpan(ctx);
      const spanContext: SpanContext | undefined = span?.spanContext();

      const baseContext = spanContext
        ? {
            traceId: spanContext.traceId,
            spanId: spanContext.spanId,
          }
        : {};

      // Add correlation ID from span attributes if available
      if (span) {
        const attributes = span.attributes;
        if (attributes && attributes["correlation.id"]) {
          baseContext.requestId = String(attributes["correlation.id"]);
        }
        if (attributes && attributes["user.id"]) {
          baseContext.userId = String(attributes["user.id"]);
        }
      }

      return baseContext;
    } catch {
      return {};
    }
  }

  private emit(logData: StructuredLogData): void {
    // Apply log-level specific sampling before processing
    if (!this.shouldSampleLog(logData)) {
      return; // Skip this log based on sampling rate
    }

    // Check circuit breaker
    const circuitBreaker = telemetryHealthMonitor.getCircuitBreaker();

    if (!circuitBreaker.canExecute()) {
      // Circuit breaker is open, fall back to console
      this.fallbackToConsole(logData);
      return;
    }

    if (this.isInitialized && this.logger) {
      try {
        // Streamlined log record with essential metadata only
        this.logger.emit({
          timestamp: logData.timestamp,
          severityText: logData.level.toUpperCase(),
          severityNumber: this.getSeverityNumber(logData.level),
          body: logData.message,
          attributes: {
            // Core telemetry context
            ...logData.context,
            // User metadata
            ...logData.meta,
            // Service identification
            "service.name": "capellaql",
            "service.version": "2.0.0",
            // Runtime information
            "runtime.name": typeof Bun !== "undefined" ? "bun" : "node",
          },
        });

        // Record successful log emission
        telemetryHealthMonitor.recordExporterSuccess("logs");
        circuitBreaker.recordSuccess();
      } catch (error) {
        // Record failure and fall back to console
        telemetryHealthMonitor.recordExporterFailure("logs", error as Error);
        circuitBreaker.recordFailure();
        this.fallbackToConsole(logData, error);
      }
    } else {
      // Store for later if not initialized
      this.fallbackLogs.push(logData);
      if (this.fallbackLogs.length > 100) {
        // Prevent memory buildup
        this.fallbackLogs.shift();
      }
      this.fallbackToConsole(logData);
    }
  }

  private fallbackToConsole(logData: StructuredLogData, error?: unknown): void {
    // Show local time in development for better developer experience
    const isDevelopment = process.env.NODE_ENV === "development" || process.env.BUN_ENV === "development";
    const date = new Date(logData.timestamp);

    const timestamp = isDevelopment
      ? `${date.toLocaleDateString()} ${date.toLocaleTimeString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`
      : date.toISOString();

    const contextStr = logData.context
      ? `[${logData.context.traceId?.slice(0, 8)}:${logData.context.spanId?.slice(0, 8)}]`
      : "";

    const logMessage = `${timestamp} ${logData.level.toUpperCase()} ${contextStr} ${logData.message}`;

    switch (logData.level) {
      case LogLevel.DEBUG:
        console.debug(logMessage, logData.meta || "");
        break;
      case LogLevel.INFO:
        console.info(logMessage, logData.meta || "");
        break;
      case LogLevel.WARN:
        console.warn(logMessage, logData.meta || "");
        break;
      case LogLevel.ERROR:
        console.error(logMessage, logData.meta || "");
        if (error) {
          console.error("Logging error:", error);
        }
        break;
    }
  }

  private flushFallbackLogs(): void {
    if (this.fallbackLogs.length > 0 && this.isInitialized && this.logger) {
      console.info(`Flushing ${this.fallbackLogs.length} fallback logs to OpenTelemetry`);

      for (const logData of this.fallbackLogs) {
        this.emit(logData);
      }

      this.fallbackLogs = [];
    }
  }

  private getSeverityNumber(level: LogLevel): number {
    switch (level) {
      case LogLevel.DEBUG:
        return 5; // DEBUG
      case LogLevel.INFO:
        return 9; // INFO
      case LogLevel.WARN:
        return 13; // WARN
      case LogLevel.ERROR:
        return 17; // ERROR
      default:
        return 9; // INFO
    }
  }

  /**
   * Deterministic sampling based on trace ID for consistency across distributed systems
   */
  private shouldSampleLog(logData: StructuredLogData): boolean {
    const samplingRate = this.getSamplingRate(logData.level);

    // Always sample errors to maintain 100% error visibility
    if (logData.level === LogLevel.ERROR) {
      return true;
    }

    // Use trace ID for deterministic sampling if available
    const traceId = logData.context?.traceId;
    if (traceId) {
      // Use last 8 characters of trace ID for sampling decision
      const hash = parseInt(traceId.slice(-8), 16);
      const normalizedHash = (hash % 1000000) / 1000000; // Normalize to 0-1
      return normalizedHash < samplingRate;
    }

    // Fallback to random sampling
    return Math.random() < samplingRate;
  }

  private getSamplingRate(level: LogLevel): number {
    switch (level) {
      case LogLevel.DEBUG:
        return config.telemetry.LOG_SAMPLING_DEBUG;
      case LogLevel.INFO:
        return config.telemetry.LOG_SAMPLING_INFO;
      case LogLevel.WARN:
        return config.telemetry.LOG_SAMPLING_WARN;
      case LogLevel.ERROR:
        return config.telemetry.LOG_SAMPLING_ERROR;
      default:
        return 0.5;
    }
  }
}

// Singleton logger instance
export const telemetryLogger = new TelemetryLogger();

// Convenience functions matching existing logger interface
export function log(message: string, meta?: Record<string, any>): void {
  telemetryLogger.info(message, meta);
}

export function debug(message: string, meta?: Record<string, any>): void {
  telemetryLogger.debug(message, meta);
}

export function warn(message: string, meta?: Record<string, any>): void {
  telemetryLogger.warn(message, meta);
}

export function err(message: string, error?: Error | unknown, meta?: Record<string, any>): void {
  telemetryLogger.error(message, error, meta);
}

// Additional convenience function for error logging
export function error(message: string, error?: Error | unknown, meta?: Record<string, any>): void {
  telemetryLogger.error(message, error, meta);
}