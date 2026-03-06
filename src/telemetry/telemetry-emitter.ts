/* src/telemetry/telemetry-emitter.ts */

import { context, trace } from "@opentelemetry/api";
import { getLogger } from "../logging/container";
import type { SpanEventName } from "./span-event-names";

type EmitLevel = "debug" | "info" | "warn" | "error";

interface EmitOptions {
  event: SpanEventName;
  message: string;
  level: EmitLevel;
  attributes?: Record<string, unknown>;
  startTime?: number;
}

class TelemetryEmitter {
  emit(options: EmitOptions): void {
    const { event, message, level, attributes = {}, startTime } = options;
    const duration = startTime != null ? performance.now() - startTime : undefined;
    const enriched = {
      ...attributes,
      "event.name": event,
      ...(duration != null ? { "event.duration_ms": Math.round(duration * 100) / 100 } : {}),
    };

    this.addSpanEvent(event, enriched);

    const logger = getLogger();
    switch (level) {
      case "debug":
        logger.debug(message, enriched);
        break;
      case "info":
        logger.info(message, enriched);
        break;
      case "warn":
        logger.warn(message, enriched);
        break;
      case "error":
        logger.error(message, enriched);
        break;
    }
  }

  info(event: SpanEventName, message: string, attributes?: Record<string, unknown>): void {
    this.emit({ event, message, level: "info", attributes });
  }

  debug(event: SpanEventName, message: string, attributes?: Record<string, unknown>): void {
    this.emit({ event, message, level: "debug", attributes });
  }

  warn(event: SpanEventName, message: string, attributes?: Record<string, unknown>): void {
    this.emit({ event, message, level: "warn", attributes });
  }

  error(event: SpanEventName, message: string, attributes?: Record<string, unknown>): void {
    this.emit({ event, message, level: "error", attributes });
  }

  timed(event: SpanEventName, message: string, startTime: number, attributes?: Record<string, unknown>): void {
    this.emit({ event, message, level: "info", attributes, startTime });
  }

  timedWithLevel(
    event: SpanEventName,
    message: string,
    level: EmitLevel,
    startTime: number,
    attributes?: Record<string, unknown>
  ): void {
    this.emit({ event, message, level, attributes, startTime });
  }

  private addSpanEvent(event: string, attributes: Record<string, unknown>): void {
    try {
      const span = trace.getSpan(context.active());
      if (span) {
        const safeAttrs: Record<string, string | number | boolean> = {};
        for (const [k, v] of Object.entries(attributes)) {
          if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
            safeAttrs[k] = v;
          } else if (v != null) {
            safeAttrs[k] = String(v);
          }
        }
        span.addEvent(event, safeAttrs);
      }
    } catch {
      // No active span — span event silently skipped, log still emitted
    }
  }
}

export const telemetryEmitter = new TelemetryEmitter();
