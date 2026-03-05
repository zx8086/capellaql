// src/telemetry/tracer.ts

import { context, type Span, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_URL_FULL,
} from "@opentelemetry/semantic-conventions";
import { loadConfig } from "../config/index";

const config = loadConfig();
const telemetryConfig = config.telemetry;

export interface SpanContext {
  operationName: string;
  kind?: SpanKind;
  attributes?: Record<string, string | number | boolean>;
  parentSpan?: Span;
}

class BunTelemetryTracer {
  private tracer = trace.getTracer(telemetryConfig.serviceName, telemetryConfig.serviceVersion);

  public initialize(_config?: Record<string, unknown>): void {
    /* no-op */
  }

  public createSpan<T>(spanContext: SpanContext, operation: () => T | Promise<T>): T | Promise<T> {
    const span = this.tracer.startSpan(spanContext.operationName, {
      kind: spanContext.kind || SpanKind.INTERNAL,
      attributes: spanContext.attributes || {},
    });

    const runWithSpan = <TResult>(
      fn: () => TResult | Promise<TResult>
    ): TResult | Promise<TResult> => {
      return context.with(trace.setSpan(context.active(), span), () => {
        let result: TResult | Promise<TResult>;
        try {
          result = fn();

          if (result instanceof Promise) {
            return result
              .then((res) => {
                span.setStatus({ code: SpanStatusCode.OK });
                return res;
              })
              .catch((error) => {
                span.recordException(error);
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: error.message || "Unknown error",
                });
                throw error;
              })
              .finally(() => {
                span.end();
              });
          }

          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return result;
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (error as Error).message || "Unknown error",
          });
          span.end();
          throw error;
        }
      });
    };

    return runWithSpan(operation);
  }

  public createHttpSpan<T>(
    method: string,
    url: string,
    statusCode: number,
    operation: () => T | Promise<T>,
    versionContext?: {
      version: string;
      source: string;
      isLatest: boolean;
      isSupported: boolean;
    }
  ): T | Promise<T> {
    const baseAttributes: Record<string, string | number | boolean> = {
      [ATTR_HTTP_REQUEST_METHOD]: method,
      [ATTR_URL_FULL]: url,
      [ATTR_HTTP_RESPONSE_STATUS_CODE]: statusCode,
      "http.server.type": "bun_serve",
    };

    if (versionContext) {
      baseAttributes["api.version"] = versionContext.version;
      baseAttributes["api.version.source"] = versionContext.source;
      baseAttributes["api.version.is_latest"] = versionContext.isLatest;
      baseAttributes["api.version.is_supported"] = versionContext.isSupported;
    }

    return this.createSpan(
      {
        operationName: `${method} ${url}`,
        kind: SpanKind.SERVER,
        attributes: baseAttributes,
      },
      operation
    );
  }

  public createKongSpan<T>(
    operation: string,
    url: string,
    method: string = "GET",
    spanOperation: () => T | Promise<T>
  ): T | Promise<T> {
    return this.createSpan(
      {
        operationName: `http.client.kong.${operation}`,
        kind: SpanKind.CLIENT,
        attributes: {
          [ATTR_HTTP_REQUEST_METHOD]: method,
          [ATTR_URL_FULL]: url,
          "kong.operation": operation,
          "kong.api.type": "admin_api",
          "http.client.type": "kong_gateway",
          component: "kong_client",
          "span.type": "http_client",
        },
      },
      spanOperation
    );
  }

  public createJWTSpan<T>(
    operation: string,
    spanOperation: () => T | Promise<T>,
    username?: string
  ): T | Promise<T> {
    return this.createSpan(
      {
        operationName: `crypto.jwt.${operation}`,
        kind: SpanKind.INTERNAL,
        attributes: {
          "jwt.operation": operation,
          "jwt.username": username || "unknown",
          "crypto.algorithm": "HS256",
          "crypto.key_type": "hmac",
          component: "jwt_service",
          "span.type": "crypto",
        },
      },
      spanOperation
    );
  }

  public addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setAttributes(attributes);
    }
  }

  public recordException(error: Error): void {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.recordException(error);
      activeSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
    }
  }

  /**
   * Add an event to the active span. Events are timestamped annotations that
   * capture discrete moments within a span's lifetime. Unlike logs, events are
   * ALWAYS captured regardless of LOG_LEVEL, making them ideal for critical
   * correlation points.
   *
   * Use span events instead of logs when:
   * - You need guaranteed capture regardless of log level settings
   * - The information is directly related to the current operation's span
   * - You want the data to appear in trace views alongside the span
   *
   * @param name - Event name (e.g., 'cache.hit', 'validation.complete')
   * @param attributes - Optional event attributes
   */
  public addEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.addEvent(name, {
        // OTEL SeverityNumber: 9 = INFO (range 9-12)
        severity_number: 9,
        // ECS text severity for Elasticsearch compatibility
        "log.level": "info",
        ...attributes,
      });
    }
  }

  /**
   * Add an event with timing information to the active span.
   * Automatically calculates duration from a start time.
   *
   * @param name - Event name
   * @param startTime - Start time in milliseconds (from performance.now() or Date.now())
   * @param attributes - Optional additional attributes
   */
  public addTimedEvent(
    name: string,
    startTime: number,
    attributes?: Record<string, string | number | boolean>
  ): void {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      const durationMs = performance.now() - startTime;
      activeSpan.addEvent(name, {
        // OTEL SeverityNumber: 9 = INFO (range 9-12)
        severity_number: 9,
        // ECS text severity for Elasticsearch compatibility
        "log.level": "info",
        ...attributes,
        "event.duration_ms": durationMs,
      });
    }
  }

  public getCurrentTraceId(): string | undefined {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      return activeSpan.spanContext().traceId;
    }
    return undefined;
  }

  public getCurrentSpanId(): string | undefined {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      return activeSpan.spanContext().spanId;
    }
    return undefined;
  }

  public createApiVersionSpan<T>(
    operation: string,
    spanOperation: () => T | Promise<T>,
    versionInfo?: {
      version?: string;
      source?: string;
      parseTimeMs?: number;
      routingTimeMs?: number;
    }
  ): T | Promise<T> {
    const attributes: Record<string, string | number | boolean> = {
      "api.versioning.operation": operation,
      component: "api_versioning",
      "middleware.type": "api_versioning",
    };

    if (versionInfo) {
      if (versionInfo.version) attributes["api.version"] = versionInfo.version;
      if (versionInfo.source) attributes["api.version.source"] = versionInfo.source;
      if (versionInfo.parseTimeMs !== undefined) {
        attributes["api.version.parse_time_ms"] = versionInfo.parseTimeMs;
      }
      if (versionInfo.routingTimeMs !== undefined) {
        attributes["api.version.routing_time_ms"] = versionInfo.routingTimeMs;
      }
    }

    return this.createSpan(
      {
        operationName: `api_versioning.${operation}`,
        kind: SpanKind.INTERNAL,
        attributes,
      },
      spanOperation
    );
  }
}

export const telemetryTracer = new BunTelemetryTracer();

export function createSpan<T>(
  spanContext: SpanContext,
  operation: () => T | Promise<T>
): T | Promise<T> {
  return telemetryTracer.createSpan(spanContext, operation);
}

export { type SpanEventName, SpanEvents } from "./span-event-names";
// Re-export TelemetryEmitter and SpanEvents for convenient access
export { telemetryEmitter } from "./telemetry-emitter";
