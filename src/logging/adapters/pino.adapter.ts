import { ecsFormat } from "@elastic/ecs-pino-format";
import { context, trace } from "@opentelemetry/api";
import type { Logger as PinoLogger } from "pino";
import pino from "pino";
import type { ITelemetryLogger, LogContext } from "../ports/logger.port";

const MS_TO_NS = 1_000_000;

/**
 * Resolve service identity from environment / config for ECS fields.
 * These are injected into ecsFormat() so every log line includes
 * service.name, service.version, service.environment per ECS spec.
 */
function resolveServiceMeta() {
  return {
    serviceName: process.env.OTEL_SERVICE_NAME || "capellaql-service",
    serviceVersion: process.env.OTEL_SERVICE_VERSION || "2.0",
    serviceEnvironment: process.env.NODE_ENV || process.env.BUN_ENV || "development",
  };
}

/**
 * ECS boilerplate keys to strip from dev output — keep only domain-relevant fields.
 */
const ECS_STRIP_KEYS = new Set([
  "@timestamp",
  "ecs.version",
  "log.level",
  "process.pid",
  "host.hostname",
  "event.dataset",
  "service.name",
  "service.version",
  "service.environment",
]);

/**
 * ANSI color codes for level-colored dev output.
 * trace=gray, debug=cyan, info=green, warn=yellow, error=red, fatal=magenta
 */
const LEVEL_COLORS: Record<string, string> = {
  trace: "\x1b[90m",
  debug: "\x1b[36m",
  info: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  fatal: "\x1b[35m",
};
const RESET = "\x1b[0m";

function goldenPathWrite(logObj: Record<string, unknown>): string {
  // ECS format uses "message" (not "msg"), "@timestamp", and "log.level"
  const text = (logObj.message ?? logObj.msg ?? "") as string;
  const timestamp = logObj["@timestamp"] ?? logObj.time;
  const rawLevel = logObj["log.level"] ?? logObj.level;

  // Timestamp
  const ts = timestamp ? new Date(timestamp as string | number).toLocaleTimeString() : new Date().toLocaleTimeString();

  // Level name
  const levelMap: Record<number, string> = {
    10: "trace",
    20: "debug",
    30: "info",
    40: "warn",
    50: "error",
    60: "fatal",
  };
  const levelName = typeof rawLevel === "number" ? (levelMap[rawLevel] ?? "info") : String(rawLevel ?? "info");

  // Build context — strip ECS boilerplate, keep only relevant fields
  const relevant: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(logObj)) {
    if (k === "message" || k === "msg" || k === "level" || k === "time") continue;
    if (ECS_STRIP_KEYS.has(k)) continue;
    if (v === undefined || v === null) continue;
    relevant[k] = v;
  }

  const color = LEVEL_COLORS[levelName] ?? "";
  const metaStr = Object.keys(relevant).length > 0 ? ` ${JSON.stringify(relevant)}` : "";
  return `${ts} ${color}${levelName}${RESET}: ${text}${metaStr}\n`;
}

/**
 * Build the dev-mode destination that produces clean single-line output.
 * In production, returns undefined to use raw JSON stdout.
 */
function buildDevDestination(): pino.DestinationStream | undefined {
  const env = process.env.NODE_ENV;
  if (env === "production" || env === "staging") {
    return undefined;
  }

  return {
    write(chunk: string): void {
      try {
        const logObj = JSON.parse(chunk);
        process.stdout.write(goldenPathWrite(logObj));
      } catch {
        // Fallback: write raw chunk if JSON parse fails
        process.stdout.write(chunk);
      }
    },
  } as pino.DestinationStream;
}

/**
 * Create a root pino instance with ECS formatting and OTEL trace injection.
 *
 * ECS compliance (per https://www.elastic.co/docs/reference/ecs/logging/nodejs/pino):
 * - ecsFormat() produces: @timestamp, log.level, message, ecs.version, process.pid, host.hostname
 * - Service identity: service.name, service.version, service.environment, event.dataset
 * - Trace correlation via mixin: trace.id, span.id, transaction.id (from OTEL active span)
 * - Error serialization: convertErr=true maps err → ECS error.type/error.message/error.stack_trace
 * - apmIntegration: false — we inject trace fields ourselves via OTEL API (not Elastic APM agent)
 */
function createPinoLogger(level?: string): PinoLogger {
  const svc = resolveServiceMeta();

  const ecsOptions = ecsFormat({
    apmIntegration: false,
    convertErr: true,
    convertReqRes: true,
    serviceName: svc.serviceName,
    serviceVersion: svc.serviceVersion,
    serviceEnvironment: svc.serviceEnvironment,
  });

  const devDest = buildDevDestination();

  const opts: pino.LoggerOptions = {
    ...ecsOptions,
    level: level ?? process.env.LOG_LEVEL ?? "info",
    // Inject OTEL trace context into every log line for distributed trace correlation.
    // ECS spec requires: trace.id, span.id, transaction.id
    mixin() {
      const activeSpan = trace.getSpan(context.active());
      if (activeSpan) {
        const spanContext = activeSpan.spanContext();
        return {
          "trace.id": spanContext.traceId,
          "span.id": spanContext.spanId,
          "transaction.id": spanContext.traceId,
        };
      }
      return {};
    },
  };

  return devDest ? pino(opts, devDest) : pino(opts);
}

/**
 * Pino-backed telemetry logger implementing ITelemetryLogger.
 *
 * This is the default Layer 1 backend adapter for the CapellaQL
 * logging DI architecture.
 */
export class PinoAdapter implements ITelemetryLogger {
  private readonly logger: PinoLogger;

  constructor(logger?: PinoLogger) {
    this.logger = logger ?? createPinoLogger();
  }

  /* ------------------------------------------------------------------ */
  /*  ILogger core methods                                               */
  /* ------------------------------------------------------------------ */

  debug(message: string, context?: LogContext): void {
    this.logger.debug(context ?? {}, message);
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(context ?? {}, message);
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(context ?? {}, message);
  }

  error(message: string, context?: LogContext): void {
    this.logger.error(context ?? {}, message);
  }

  child(bindings: LogContext): PinoAdapter {
    return new PinoAdapter(this.logger.child(bindings));
  }

  flush(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.logger.flush((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  reinitialize(): void {
    // No-op — Pino uses a global LoggerProvider; no re-init required.
  }

  /* ------------------------------------------------------------------ */
  /*  ITelemetryLogger domain methods                                    */
  /* ------------------------------------------------------------------ */

  logHttpRequest(method: string, path: string, statusCode: number, duration: number, context?: LogContext): void {
    this.logger.info(
      {
        "http.request.method": method,
        "url.path": path,
        "http.response.status_code": statusCode,
        "event.duration": duration * MS_TO_NS,
        ...context,
      },
      `HTTP ${method} ${path} ${statusCode}`
    );
  }

  logGraphQLRequest(operation: string, duration: number, success: boolean, context?: LogContext): void {
    this.logger.info(
      {
        "graphql.operation.name": operation,
        "event.duration": duration * MS_TO_NS,
        "event.outcome": success ? "success" : "failure",
        ...context,
      },
      `GraphQL ${operation} ${success ? "succeeded" : "failed"}`
    );
  }

  logCouchbaseOperation(operation: string, responseTime: number, success: boolean, context?: LogContext): void {
    this.logger.info(
      {
        "db.operation": operation,
        "db.system": "couchbase",
        "event.duration": responseTime * MS_TO_NS,
        "event.outcome": success ? "success" : "failure",
        ...context,
      },
      `Couchbase ${operation} ${success ? "succeeded" : "failed"}`
    );
  }
}
