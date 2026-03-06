/**
 * Logger port interfaces for the logging DI architecture.
 *
 * Layer 1 (ILogger): Core structured logging contract.
 * Layer 2 (ITelemetryLogger): Domain-aware telemetry logging with
 *   HTTP, GraphQL, and Couchbase operation tracking.
 *
 * Adapters implement these interfaces to wrap concrete backends
 * (Winston, Pino, console, etc.) while keeping consumers decoupled.
 */

export type LogContext = Record<string, unknown>;

export interface ILogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(bindings: LogContext): ILogger;
  flush(): Promise<void>;
  reinitialize(): void;
}

export interface ITelemetryLogger extends ILogger {
  logHttpRequest(method: string, path: string, statusCode: number, duration: number, context?: LogContext): void;
  logGraphQLRequest(operation: string, duration: number, success: boolean, context?: LogContext): void;
  logCouchbaseOperation(operation: string, responseTime: number, success: boolean, context?: LogContext): void;
}
