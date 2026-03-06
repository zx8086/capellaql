/**
 * Winston backend adapter (Layer 1 — legacy backend).
 *
 * Wraps the existing `winstonTelemetryLogger` singleton behind the
 * `ITelemetryLogger` port so that higher layers never depend on Winston
 * directly.  Context propagation is handled via `boundContext` which is
 * merged into every log call and carried through `child()`.
 */

import { winstonTelemetryLogger } from "../../telemetry/winston-logger";
import type { ITelemetryLogger, LogContext } from "../ports/logger.port";

const MS_TO_NS = 1_000_000;

export class WinstonAdapter implements ITelemetryLogger {
  private readonly boundContext: LogContext;

  constructor(boundContext: LogContext = {}) {
    this.boundContext = boundContext;
  }

  // ---------------------------------------------------------------------------
  // ILogger core methods
  // ---------------------------------------------------------------------------

  debug(message: string, context?: LogContext): void {
    winstonTelemetryLogger.debug(message, this.merge(context));
  }

  info(message: string, context?: LogContext): void {
    winstonTelemetryLogger.info(message, this.merge(context));
  }

  warn(message: string, context?: LogContext): void {
    winstonTelemetryLogger.warn(message, this.merge(context));
  }

  error(message: string, context?: LogContext): void {
    // winstonTelemetryLogger.error has signature (message, error?, meta?)
    // When passing only metadata (no Error), use `undefined` as the second arg.
    winstonTelemetryLogger.error(message, undefined, this.merge(context));
  }

  child(bindings: LogContext): WinstonAdapter {
    return new WinstonAdapter({ ...this.boundContext, ...bindings });
  }

  async flush(): Promise<void> {
    // Winston flushes synchronously via its transports; nothing to await.
  }

  reinitialize(): void {
    winstonTelemetryLogger.reinitialize();
  }

  // ---------------------------------------------------------------------------
  // ITelemetryLogger domain methods
  // ---------------------------------------------------------------------------

  logHttpRequest(method: string, path: string, statusCode: number, duration: number, context?: LogContext): void {
    const message = `${method} ${path} ${statusCode} ${duration}ms`;
    const ecsFields: LogContext = {
      "http.request.method": method,
      "url.path": path,
      "http.response.status_code": statusCode,
      "event.duration": duration * MS_TO_NS,
    };
    this.info(message, { ...ecsFields, ...context });
  }

  logGraphQLRequest(operation: string, duration: number, success: boolean, context?: LogContext): void {
    const status = success ? "success" : "failure";
    const message = `GraphQL ${operation} ${status} ${duration}ms`;
    const ecsFields: LogContext = {
      "graphql.operation": operation,
      "event.duration": duration * MS_TO_NS,
      "event.outcome": success ? "success" : "failure",
    };
    this.info(message, { ...ecsFields, ...context });
  }

  logCouchbaseOperation(operation: string, responseTime: number, success: boolean, context?: LogContext): void {
    const status = success ? "success" : "failure";
    const message = `Couchbase ${operation} ${status} ${responseTime}ms`;
    const ecsFields: LogContext = {
      "db.operation": operation,
      "db.system": "couchbase",
      "event.duration": responseTime * MS_TO_NS,
      "event.outcome": success ? "success" : "failure",
    };
    this.info(message, { ...ecsFields, ...context });
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private merge(context?: LogContext): Record<string, unknown> {
    if (!context) return { ...this.boundContext };
    return { ...this.boundContext, ...context };
  }
}
