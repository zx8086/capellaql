// src/logging/index.ts
// SIO-447: Public exports for logging module

export type { PinoAdapterConfig } from "./adapters/pino.adapter";
// Adapters
export { PinoAdapter } from "./adapters/pino.adapter";
export { WinstonAdapter } from "./adapters/winston.adapter";
export type { LoggingBackend } from "./container";
// Container
export { getChildLogger, getLogger, loggerContainer } from "./container";
// Formatters
export { EcsFormatter } from "./formatters/ecs.formatter";
export type {
  EcsFormatterConfig,
  FieldMapping,
  ILogFormatter,
  LogEntry,
} from "./ports/formatter.port";
// Ports (interfaces)
export type {
  ILogger,
  ITelemetryLogger,
  LogContext,
  LoggerConfig,
  LogLevel,
  ServiceInfo,
  TraceContext,
} from "./ports/logger.port";
export { LOG_LEVEL_PRIORITY } from "./ports/logger.port";
export type { ILogTransport, TransportConfig } from "./ports/transport.port";
