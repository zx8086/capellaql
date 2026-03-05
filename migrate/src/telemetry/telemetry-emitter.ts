/* src/telemetry/telemetry-emitter.ts */

import { trace } from "@opentelemetry/api";
import { getLogger } from "../logging/container";
import type { SpanEventName } from "./span-event-names";

/**
 * Log levels supported by the TelemetryEmitter.
 */
type EmitLevel = "debug" | "info" | "warn" | "error";

/**
 * OpenTelemetry SeverityNumber mapping.
 * See: https://opentelemetry.io/docs/specs/otel/logs/data-model/#severity-fields
 *
 * Ranges: TRACE(1-4), DEBUG(5-8), INFO(9-12), WARN(13-16), ERROR(17-20), FATAL(21-24)
 * We use the first value in each range for consistency.
 */
const SEVERITY_NUMBER: Record<EmitLevel, number> = {
  debug: 5, // DEBUG range: 5-8
  info: 9, // INFO range: 9-12
  warn: 13, // WARN range: 13-16
  error: 17, // ERROR range: 17-20
};

/**
 * Attributes that can be attached to span events and logs.
 * Supports string, number, and boolean values as per OpenTelemetry spec.
 */
type EmitAttributes = Record<string, string | number | boolean | undefined>;

/**
 * Options for emitting telemetry.
 */
interface EmitOptions {
  /** Span event name (use SpanEvents constants for type safety) */
  event: SpanEventName | string;
  /** Human-readable log message */
  message: string;
  /** Log level (default: "info") */
  level?: EmitLevel;
  /** Attributes to attach to both span event and log */
  attributes?: EmitAttributes;
  /** Start time for duration calculation (from performance.now()) */
  startTime?: number;
}

/**
 * TelemetryEmitter provides a unified API for emitting both span events and logs.
 *
 * Span events are ALWAYS captured regardless of LOG_LEVEL, making them ideal for
 * critical correlation data that must never be filtered out in production.
 *
 * Usage:
 * ```typescript
 * import { telemetryEmitter, SpanEvents } from "../telemetry/tracer";
 *
 * // Basic usage
 * telemetryEmitter.info(SpanEvents.CACHE_HIT, "Cache hit", { key: "consumer:123" });
 *
 * // With timing
 * const start = performance.now();
 * await doOperation();
 * telemetryEmitter.timed(SpanEvents.CACHE_SET, "Cache set completed", start, { key: "consumer:123" });
 *
 * // Full options
 * telemetryEmitter.emit({
 *   event: SpanEvents.CB_STATE_OPEN,
 *   message: "Circuit breaker opened",
 *   level: "warn",
 *   attributes: { operation: "getConsumerSecret", failure_count: 5 },
 * });
 * ```
 */
class TelemetryEmitter {
  /**
   * Emit telemetry to BOTH span events AND logs.
   *
   * - Span event: ALWAYS captured regardless of LOG_LEVEL
   * - Log: Filtered by LOG_LEVEL setting
   *
   * @param options - Emit options including event name, message, level, and attributes
   */
  emit(options: EmitOptions): void {
    const { event, message, level = "info", attributes = {}, startTime } = options;

    // Filter out undefined values from attributes
    const cleanAttributes: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== undefined) {
        cleanAttributes[key] = value;
      }
    }

    // 1. Always emit span event (captured regardless of LOG_LEVEL)
    // Follows OpenTelemetry semantic conventions for events:
    // - severity_number: OTEL standard numeric severity (5=DEBUG, 9=INFO, 13=WARN, 17=ERROR)
    // - log.level: ECS/Elastic text severity for Kibana/APM compatibility
    // - event.message: Human-readable message (events SHOULD minimize body usage)
    // See: https://opentelemetry.io/docs/specs/semconv/general/events/
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      const eventAttrs: Record<string, string | number | boolean> = {
        // OTEL SeverityNumber for cross-platform compatibility
        severity_number: SEVERITY_NUMBER[level],
        // ECS log.level field for Elasticsearch/Kibana compatibility
        "log.level": level,
        // Human-readable message (per OTEL events spec: use for display)
        "event.message": message,
        ...cleanAttributes,
      };
      if (startTime !== undefined) {
        eventAttrs["event.duration_ms"] = performance.now() - startTime;
      }
      activeSpan.addEvent(event, eventAttrs);
    }

    // 2. Emit log (filtered by LOG_LEVEL)
    // SIO-447: Use logging container for Pino/Winston backend selection
    const logger = getLogger();
    const logContext = { ...cleanAttributes, "span.event": event };
    switch (level) {
      case "debug":
        logger.debug(message, logContext);
        break;
      case "info":
        logger.info(message, logContext);
        break;
      case "warn":
        logger.warn(message, logContext);
        break;
      case "error":
        logger.error(message, logContext);
        break;
    }
  }

  /**
   * Emit an info-level telemetry event.
   *
   * @param event - Span event name
   * @param message - Human-readable log message
   * @param attributes - Optional attributes to attach
   */
  info(event: SpanEventName | string, message: string, attributes?: EmitAttributes): void {
    this.emit({ event, message, level: "info", attributes });
  }

  /**
   * Emit a debug-level telemetry event.
   *
   * @param event - Span event name
   * @param message - Human-readable log message
   * @param attributes - Optional attributes to attach
   */
  debug(event: SpanEventName | string, message: string, attributes?: EmitAttributes): void {
    this.emit({ event, message, level: "debug", attributes });
  }

  /**
   * Emit a warn-level telemetry event.
   *
   * @param event - Span event name
   * @param message - Human-readable log message
   * @param attributes - Optional attributes to attach
   */
  warn(event: SpanEventName | string, message: string, attributes?: EmitAttributes): void {
    this.emit({ event, message, level: "warn", attributes });
  }

  /**
   * Emit an error-level telemetry event.
   *
   * @param event - Span event name
   * @param message - Human-readable log message
   * @param attributes - Optional attributes to attach
   */
  error(event: SpanEventName | string, message: string, attributes?: EmitAttributes): void {
    this.emit({ event, message, level: "error", attributes });
  }

  /**
   * Emit a timed info-level telemetry event with automatic duration calculation.
   *
   * @param event - Span event name
   * @param message - Human-readable log message
   * @param startTime - Start time from performance.now()
   * @param attributes - Optional additional attributes to attach
   */
  timed(
    event: SpanEventName | string,
    message: string,
    startTime: number,
    attributes?: EmitAttributes
  ): void {
    this.emit({ event, message, level: "info", attributes, startTime });
  }

  /**
   * Emit a timed event at a specific log level.
   *
   * @param event - Span event name
   * @param message - Human-readable log message
   * @param level - Log level
   * @param startTime - Start time from performance.now()
   * @param attributes - Optional additional attributes to attach
   */
  timedWithLevel(
    event: SpanEventName | string,
    message: string,
    level: EmitLevel,
    startTime: number,
    attributes?: EmitAttributes
  ): void {
    this.emit({ event, message, level, attributes, startTime });
  }
}

/**
 * Singleton instance of TelemetryEmitter.
 *
 * Import this from tracer.ts for consistent usage:
 * ```typescript
 * import { telemetryEmitter, SpanEvents } from "../telemetry/tracer";
 * ```
 */
export const telemetryEmitter = new TelemetryEmitter();
