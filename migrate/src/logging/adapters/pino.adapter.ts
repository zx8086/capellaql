// src/logging/adapters/pino.adapter.ts
// SIO-447: Pino adapter implementing ILogger interface with ECS compliance

import { ecsFormat } from "@elastic/ecs-pino-format";
import { trace } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import pino from "pino";
import type {
  ILogger,
  ITelemetryLogger,
  LogContext,
  LoggerConfig,
  TraceContext,
} from "../ports/logger.port";

/**
 * Pino adapter configuration
 */
export interface PinoAdapterConfig extends LoggerConfig {
  /** Use worker thread transport (with auto-fallback to sync) */
  useWorker?: boolean;
}

/**
 * Map log level to OTEL SeverityNumber.
 * See: https://opentelemetry.io/docs/specs/otel/logs/data-model/#severity-fields
 */
const SEVERITY_MAP: Record<string, SeverityNumber> = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

/**
 * Pino-based logger implementation.
 * Implements ILogger interface for Clean Architecture.
 *
 * Features:
 * - ECS-compliant formatting via @elastic/ecs-pino-format
 * - OpenTelemetry trace context injection
 * - Sync stdout for reliable console output (non-blocking)
 * - OTLP export via global LoggerProvider (set by instrumentation.ts)
 */
export class PinoAdapter implements ITelemetryLogger {
  private pinoInstance: pino.Logger | null = null;
  private readonly config: PinoAdapterConfig;

  constructor(config: PinoAdapterConfig) {
    this.config = config;
  }

  /**
   * Initialize or get the Pino logger instance
   */
  private getLogger(): pino.Logger {
    if (!this.pinoInstance) {
      this.pinoInstance = this.createLogger();
    }
    return this.pinoInstance;
  }

  /**
   * Emit a log record to the OTEL LoggerProvider.
   * Uses the global LoggerProvider set by instrumentation.ts
   * (logs.setGlobalLoggerProvider).
   *
   * This is a fire-and-forget operation - OTLP failures don't affect console logging.
   */
  private emitOtelLog(level: string, message: string, context: Record<string, unknown>): void {
    const { mode } = this.config;

    // Only emit to OTLP when mode is otlp or both
    if (mode !== "otlp" && mode !== "both") {
      return;
    }

    try {
      // Get logger from global LoggerProvider (set by instrumentation.ts)
      const otelLogger = logs.getLogger(this.config.service.name, this.config.service.version);

      // Build attributes from context
      const attributes: Record<string, string | number | boolean> = {};
      for (const [key, value] of Object.entries(context)) {
        if (value !== undefined && value !== null) {
          if (
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean"
          ) {
            attributes[key] = value;
          } else {
            // Serialize complex objects
            attributes[key] = JSON.stringify(value);
          }
        }
      }

      // Emit log record
      otelLogger.emit({
        severityNumber: SEVERITY_MAP[level] ?? SeverityNumber.INFO,
        severityText: level.toUpperCase(),
        body: message,
        attributes,
      });
    } catch (_error) {
      // OTLP failures should not affect console logging
      // Silently ignore - this is fire-and-forget
    }
  }

  /**
   * ECS fields to exclude from console context display.
   * These are metadata fields that clutter the human-readable output.
   */
  private static readonly ECS_METADATA_FIELDS = new Set([
    "@timestamp",
    "ecs.version",
    "log.level",
    "log.logger",
    "process.pid",
    "host.hostname",
    "service.name",
    "service.version",
    "service.environment",
    "event.dataset",
  ]);

  /**
   * Format log output like Winston: "4:25:58 AM info: Message {context}"
   * Handles ECS-formatted log records from @elastic/ecs-pino-format.
   */
  private formatLogLine(obj: Record<string, unknown>): string {
    // ECS format uses "log.level" string, standard Pino uses numeric "level"
    const ecsLevel = obj["log.level"] as string | undefined;
    const pinoLevel = obj.level as number | undefined;

    const levelName =
      ecsLevel?.toLowerCase() ||
      (pinoLevel === 10
        ? "trace"
        : pinoLevel === 20
          ? "debug"
          : pinoLevel === 30
            ? "info"
            : pinoLevel === 40
              ? "warn"
              : pinoLevel === 50
                ? "error"
                : pinoLevel === 60
                  ? "fatal"
                  : "info");

    // ECS uses "message", standard Pino uses "msg"
    const msg = (obj.message as string) || (obj.msg as string) || "";

    // ECS uses "@timestamp" ISO string, standard Pino uses "time" epoch
    const timestamp = obj["@timestamp"] as string | undefined;
    const pinoTime = obj.time as number | undefined;
    const date = timestamp ? new Date(timestamp) : new Date(pinoTime || Date.now());

    // Color codes
    const colors: Record<string, string> = {
      trace: "\x1b[90m", // gray
      debug: "\x1b[36m", // cyan
      info: "\x1b[32m", // green
      warn: "\x1b[33m", // yellow
      error: "\x1b[31m", // red
      fatal: "\x1b[35m", // magenta
    };
    const reset = "\x1b[0m";

    // Format time as "h:MM:ss TT"
    const hours = date.getHours();
    const ampm = hours >= 12 ? "PM" : "AM";
    const hour12 = hours % 12 || 12;
    const timeStr = `${hour12}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")} ${ampm}`;

    // Extract context - exclude ECS metadata and standard Pino fields
    const context: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip standard Pino fields
      if (["level", "time", "msg", "message", "pid", "hostname"].includes(key)) continue;
      // Skip ECS metadata fields (use dot notation check for nested keys like "log.level")
      if (PinoAdapter.ECS_METADATA_FIELDS.has(key)) continue;
      context[key] = value;
    }

    // Build output line
    const contextStr = Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : "";
    return `${timeStr} ${colors[levelName]}${levelName}${reset}: ${msg}${contextStr}\n`;
  }

  /**
   * Create a new Pino logger instance with ECS-compliant formatting.
   * Uses @elastic/ecs-pino-format for Elastic Common Schema compliance.
   */
  private createLogger(): pino.Logger {
    const { level, service } = this.config;

    // Custom sync destination that formats output like Winston for console
    // Avoids pino.transport() worker threads which have issues with Bun
    const destination = {
      write: (data: string) => {
        try {
          const obj = JSON.parse(data);
          const formatted = this.formatLogLine(obj);
          process.stdout.write(formatted);
        } catch {
          // Fallback for non-JSON data
          process.stdout.write(data);
        }
      },
    };

    // ECS format options - see https://www.elastic.co/docs/reference/ecs/logging/nodejs/pino
    const ecsOptions = ecsFormat({
      // Disable Elastic APM integration - we use OpenTelemetry directly
      apmIntegration: false,
      // Service metadata for ECS fields
      serviceName: service.name,
      serviceVersion: service.version,
      serviceEnvironment: service.environment,
      // Enable error conversion to ECS error fields
      convertErr: true,
    });

    const logger = pino(
      {
        level: level === "silent" ? "silent" : level,
        // ECS format provides formatters and hooks
        ...ecsOptions,
      },
      destination
    );

    return logger;
  }

  /**
   * Capture current OpenTelemetry trace context
   */
  private captureTraceContext(): TraceContext | undefined {
    const span = trace.getActiveSpan();
    if (!span) return undefined;

    const ctx = span.spanContext();
    return {
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      traceFlags: ctx.traceFlags,
    };
  }

  // ILogger implementation

  debug(message: string, context?: LogContext): void {
    const ctx = context || {};
    const traceCtx = this.captureTraceContext();
    if (traceCtx) {
      ctx["trace.id"] = traceCtx.traceId;
      ctx["span.id"] = traceCtx.spanId;
    }
    this.getLogger().debug(ctx, message);
    // Also send to OTLP via global LoggerProvider (non-blocking, fire-and-forget)
    this.emitOtelLog("debug", message, ctx);
  }

  info(message: string, context?: LogContext): void {
    const ctx = context || {};
    const traceCtx = this.captureTraceContext();
    if (traceCtx) {
      ctx["trace.id"] = traceCtx.traceId;
      ctx["span.id"] = traceCtx.spanId;
    }
    this.getLogger().info(ctx, message);
    // Also send to OTLP via global LoggerProvider (non-blocking, fire-and-forget)
    this.emitOtelLog("info", message, ctx);
  }

  warn(message: string, context?: LogContext): void {
    const ctx = context || {};
    const traceCtx = this.captureTraceContext();
    if (traceCtx) {
      ctx["trace.id"] = traceCtx.traceId;
      ctx["span.id"] = traceCtx.spanId;
    }
    this.getLogger().warn(ctx, message);
    // Also send to OTLP via global LoggerProvider (non-blocking, fire-and-forget)
    this.emitOtelLog("warn", message, ctx);
  }

  error(message: string, context?: LogContext): void {
    const ctx = context || {};
    const traceCtx = this.captureTraceContext();
    if (traceCtx) {
      ctx["trace.id"] = traceCtx.traceId;
      ctx["span.id"] = traceCtx.spanId;
    }
    this.getLogger().error(ctx, message);
    // Also send to OTLP via global LoggerProvider (non-blocking, fire-and-forget)
    this.emitOtelLog("error", message, ctx);
  }

  child(bindings: LogContext): ILogger {
    // Create a child adapter with bound context
    const childAdapter = new PinoChildAdapter(this.getLogger().child(bindings), this.config);
    return childAdapter;
  }

  async flush(): Promise<void> {
    const logger = this.getLogger();
    return new Promise((resolve) => {
      logger.flush();
      // OTLP logs are batched by the global LoggerProvider's BatchLogRecordProcessor
      // which flushes automatically. No explicit flush needed here.
      setTimeout(resolve, 50);
    });
  }

  reinitialize(): void {
    if (this.pinoInstance) {
      this.pinoInstance.flush();
    }
    this.pinoInstance = null;
    this.getLogger(); // Reinitialize console logger
  }

  // ITelemetryLogger implementation (backward compatibility with WinstonTelemetryLogger)

  logHttpRequest(
    method: string,
    path: string,
    statusCode: number,
    _duration: number,
    context?: LogContext
  ): void {
    this.info(`HTTP ${method} ${path} - ${statusCode}`, context);
  }

  logAuthenticationEvent(event: string, success: boolean, context?: LogContext): void {
    this.info(`Authentication: ${event} ${success ? "success" : "failed"}`, context);
  }

  logKongOperation(
    operation: string,
    responseTime: number,
    success: boolean,
    context?: LogContext
  ): void {
    this.info(`Kong: ${operation} (${responseTime}ms) ${success ? "success" : "failed"}`, context);
  }
}

/**
 * Child logger adapter for bound context
 */
class PinoChildAdapter implements ILogger {
  constructor(
    private readonly childLogger: pino.Logger,
    private readonly config: PinoAdapterConfig
  ) {}

  debug(message: string, context?: LogContext): void {
    this.childLogger.debug(context || {}, message);
  }

  info(message: string, context?: LogContext): void {
    this.childLogger.info(context || {}, message);
  }

  warn(message: string, context?: LogContext): void {
    this.childLogger.warn(context || {}, message);
  }

  error(message: string, context?: LogContext): void {
    this.childLogger.error(context || {}, message);
  }

  child(bindings: LogContext): ILogger {
    return new PinoChildAdapter(this.childLogger.child(bindings), this.config);
  }

  async flush(): Promise<void> {
    return new Promise((resolve) => {
      this.childLogger.flush();
      setTimeout(resolve, 100);
    });
  }

  reinitialize(): void {
    // Child loggers don't need reinitialization
  }
}
