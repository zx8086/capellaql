/* src/utils/logger.ts */

import winston from "winston";
import { ecsFormat } from "@elastic/ecs-winston-format";
import { OpenTelemetryTransportV3 } from "@opentelemetry/winston-transport";
import { config } from "$config";
import { trace, context, type SpanContext } from "@opentelemetry/api";

const customFormat = winston.format.combine(
  ecsFormat({ convertReqRes: true, apmIntegration: true }),
  winston.format((info) => {
    const {
      "@timestamp": timestamp,
      "ecs.version": ecsVersion,
      level,
      message,
      ...rest
    } = info;
    return {
      "@timestamp": timestamp,
      "ecs.version": ecsVersion,
      level,
      log: { level },
      message,
      trace: {
        id: (info["trace"] as any)?.id || "",
        span: { id: (info["trace"]?.["span"] as any)?.id || "" },
      },
      ...rest,
    };
  })(),
);

export const logger = winston.createLogger({
  level: config.application.LOG_LEVEL,
  format: customFormat,
  transports: [
    // new winston.transports.Console(),
    new OpenTelemetryTransportV3({
      level: config.application.LOG_LEVEL,
    }),
  ],
});

export function log(message: string, meta?: any): void {
  const ctx = context.active();
  const span = trace.getSpan(ctx);
  const spanContext: SpanContext | undefined = span?.spanContext();

  const logData = {
    message,
    meta,
    trace: spanContext
      ? {
          id: spanContext.traceId,
          span: { id: spanContext.spanId },
        }
      : undefined,
  };

  logger.info(logData);
}

export function err(message: string, meta?: any): void {
  const ctx = context.active();
  const span = trace.getSpan(ctx);
  const spanContext: SpanContext | undefined = span?.spanContext();

  const logData = {
    message,
    meta,
    trace: spanContext
      ? {
          id: spanContext.traceId,
          span: { id: spanContext.spanId },
        }
      : undefined,
  };

  logger.error(logData);
}

export function warn(message: string, meta?: any): void {
  const ctx = context.active();
  const span = trace.getSpan(ctx);
  const spanContext: SpanContext | undefined = span?.spanContext();

  const logData = {
    message,
    meta,
    trace: spanContext
      ? {
          id: spanContext.traceId,
          span: { id: spanContext.spanId },
        }
      : undefined,
  };

  logger.warn(logData);
}

export function debug(message: string, meta?: any): void {
  const ctx = context.active();
  const span = trace.getSpan(ctx);
  const spanContext: SpanContext | undefined = span?.spanContext();

  const logData = {
    message,
    meta,
    trace: spanContext
      ? {
          id: spanContext.traceId,
          span: { id: spanContext.spanId },
        }
      : undefined,
  };

  logger.debug(logData);
}
