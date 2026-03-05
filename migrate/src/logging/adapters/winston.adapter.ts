// src/logging/adapters/winston.adapter.ts
// SIO-447: Winston adapter wrapping existing WinstonTelemetryLogger

import { winstonTelemetryLogger } from "../../telemetry/winston-logger";
import type { ILogger, ITelemetryLogger, LogContext } from "../ports/logger.port";

/**
 * Winston adapter - wraps existing WinstonTelemetryLogger as ITelemetryLogger.
 * Provides backward compatibility during migration.
 *
 * This adapter delegates all calls to the existing WinstonTelemetryLogger,
 * allowing the container to use it interchangeably with PinoAdapter.
 */
export class WinstonAdapter implements ITelemetryLogger {
  debug(message: string, context?: LogContext): void {
    winstonTelemetryLogger.debug(message, context);
  }

  info(message: string, context?: LogContext): void {
    winstonTelemetryLogger.info(message, context);
  }

  warn(message: string, context?: LogContext): void {
    winstonTelemetryLogger.warn(message, context);
  }

  error(message: string, context?: LogContext): void {
    winstonTelemetryLogger.error(message, context);
  }

  child(bindings: LogContext): ILogger {
    // Winston doesn't support child loggers natively in our implementation
    // Return a wrapper that merges bindings into context
    return new WinstonChildAdapter(bindings);
  }

  async flush(): Promise<void> {
    return winstonTelemetryLogger.flush();
  }

  reinitialize(): void {
    winstonTelemetryLogger.reinitialize();
  }

  // ITelemetryLogger methods - delegate to WinstonTelemetryLogger

  logHttpRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    context?: LogContext
  ): void {
    winstonTelemetryLogger.logHttpRequest(method, path, statusCode, duration, context);
  }

  logAuthenticationEvent(event: string, success: boolean, context?: LogContext): void {
    winstonTelemetryLogger.logAuthenticationEvent(event, success, context);
  }

  logKongOperation(
    operation: string,
    responseTime: number,
    success: boolean,
    context?: LogContext
  ): void {
    winstonTelemetryLogger.logKongOperation(operation, responseTime, success, context);
  }
}

/**
 * Winston child logger adapter - merges bound context into each log call
 */
class WinstonChildAdapter implements ILogger {
  constructor(private readonly bindings: LogContext) {}

  private mergeContext(context?: LogContext): LogContext {
    return { ...this.bindings, ...context };
  }

  debug(message: string, context?: LogContext): void {
    winstonTelemetryLogger.debug(message, this.mergeContext(context));
  }

  info(message: string, context?: LogContext): void {
    winstonTelemetryLogger.info(message, this.mergeContext(context));
  }

  warn(message: string, context?: LogContext): void {
    winstonTelemetryLogger.warn(message, this.mergeContext(context));
  }

  error(message: string, context?: LogContext): void {
    winstonTelemetryLogger.error(message, this.mergeContext(context));
  }

  child(bindings: LogContext): ILogger {
    // Create nested child with merged bindings
    return new WinstonChildAdapter({ ...this.bindings, ...bindings });
  }

  async flush(): Promise<void> {
    return winstonTelemetryLogger.flush();
  }

  reinitialize(): void {
    winstonTelemetryLogger.reinitialize();
  }
}
