// src/logging/ports/logger.port.ts
// SIO-447: Logger port interface for Clean Architecture

/**
 * Log context - arbitrary key-value pairs to enrich log entries
 */
export type LogContext = Record<string, unknown>;

/**
 * Supported log levels
 */
export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

/**
 * Log level priority for filtering (higher = more verbose)
 */
export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

/**
 * Service information for log context
 */
export interface ServiceInfo {
  name: string;
  version: string;
  environment: string;
}

/**
 * Trace context for distributed tracing correlation
 */
export interface TraceContext {
  traceId?: string;
  spanId?: string;
  traceFlags?: number;
}

/**
 * Core logger interface - implementation agnostic.
 * Follows the Interface Segregation Principle with minimal methods.
 *
 * This interface allows swapping between Winston, Pino, or any other
 * logging implementation without changing consumer code.
 */
export interface ILogger {
  /**
   * Log a debug message (verbose development info)
   */
  debug(message: string, context?: LogContext): void;

  /**
   * Log an info message (normal operational events)
   */
  info(message: string, context?: LogContext): void;

  /**
   * Log a warning message (potential issues)
   */
  warn(message: string, context?: LogContext): void;

  /**
   * Log an error message (errors and failures)
   */
  error(message: string, context?: LogContext): void;

  /**
   * Create a child logger with bound context
   * @param bindings - Context to bind to all subsequent log calls
   */
  child(bindings: LogContext): ILogger;

  /**
   * Flush pending log entries (for graceful shutdown)
   */
  flush(): Promise<void>;

  /**
   * Reinitialize the logger (for OTEL SDK integration)
   * Required for OpenTelemetry SDK 0.212.0+ compatibility
   */
  reinitialize(): void;
}

/**
 * Extended logger interface with domain-specific logging methods.
 * Preserves backward compatibility with WinstonTelemetryLogger API.
 */
export interface ITelemetryLogger extends ILogger {
  /**
   * Log HTTP request details
   */
  logHttpRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    context?: LogContext
  ): void;

  /**
   * Log authentication event
   */
  logAuthenticationEvent(event: string, success: boolean, context?: LogContext): void;

  /**
   * Log Kong API Gateway operation
   */
  logKongOperation(
    operation: string,
    responseTime: number,
    success: boolean,
    context?: LogContext
  ): void;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level: LogLevel;
  service: ServiceInfo;
  mode: "console" | "otlp" | "both";
}
