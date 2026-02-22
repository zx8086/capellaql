// Bun-optimized OTLP Trace Exporter

import { hrTimeToMicroseconds } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { BunOTLPExporter, type BunOTLPExporterConfig } from "./BunOTLPExporter";

/**
 * Bun-optimized trace exporter using native fetch API
 * Eliminates timeout issues seen with standard Node.js OpenTelemetry exporters
 */
export class BunTraceExporter extends BunOTLPExporter<ReadableSpan> implements SpanExporter {
  constructor(config: BunOTLPExporterConfig) {
    super("traces", config);
  }

  /**
   * Serialize spans to OTLP JSON format
   */
  protected serializePayload(spans: ReadableSpan[]): string {
    const resourceSpans = this.groupSpansByResource(spans);

    const otlpPayload = {
      resourceSpans: resourceSpans.map((group) => ({
        resource: {
          attributes: this.serializeAttributes(group.resource.attributes),
        },
        scopeSpans: [
          {
            scope: {
              name: group.instrumentationLibrary?.name || "unknown",
              version: group.instrumentationLibrary?.version || "1.0.0",
            },
            spans: group.spans.map((span) => this.serializeSpan(span)),
          },
        ],
      })),
    };

    return JSON.stringify(otlpPayload);
  }

  /**
   * Group spans by resource for efficient OTLP payload structure
   */
  private groupSpansByResource(spans: ReadableSpan[]): Array<{
    resource: any;
    instrumentationLibrary: any;
    spans: ReadableSpan[];
  }> {
    const groups = new Map();

    for (const span of spans) {
      const resourceKey = JSON.stringify(span.resource.attributes);
      const libraryKey = span.instrumentationLibrary?.name || "unknown";
      const key = `${resourceKey}:${libraryKey}`;

      if (!groups.has(key)) {
        groups.set(key, {
          resource: span.resource,
          instrumentationLibrary: span.instrumentationLibrary,
          spans: [],
        });
      }

      groups.get(key).spans.push(span);
    }

    return Array.from(groups.values());
  }

  /**
   * Serialize individual span to OTLP format
   */
  private serializeSpan(span: ReadableSpan): any {
    const startTimeUnixNano = hrTimeToMicroseconds(span.startTime) * 1000;
    const endTimeUnixNano = hrTimeToMicroseconds(span.endTime) * 1000;

    return {
      traceId: span.spanContext().traceId,
      spanId: span.spanContext().spanId,
      parentSpanId: span.parentSpanId || undefined,
      name: span.name,
      kind: span.kind,
      startTimeUnixNano: startTimeUnixNano.toString(),
      endTimeUnixNano: endTimeUnixNano.toString(),
      attributes: this.serializeAttributes(span.attributes),
      status: {
        code: span.status.code,
        message: span.status.message,
      },
      events: span.events.map((event) => ({
        timeUnixNano: (hrTimeToMicroseconds(event.time) * 1000).toString(),
        name: event.name,
        attributes: this.serializeAttributes(event.attributes),
      })),
      links: span.links.map((link) => ({
        traceId: link.context.traceId,
        spanId: link.context.spanId,
        attributes: this.serializeAttributes(link.attributes),
      })),
      droppedAttributesCount: span.droppedAttributesCount || 0,
      droppedEventsCount: span.droppedEventsCount || 0,
      droppedLinksCount: span.droppedLinksCount || 0,
    };
  }

  /**
   * Serialize OpenTelemetry attributes to OTLP format
   */
  private serializeAttributes(attributes: any): any[] {
    if (!attributes) return [];

    return Object.entries(attributes).map(([key, value]) => ({
      key,
      value: this.serializeAttributeValue(value),
    }));
  }

  /**
   * Serialize attribute value based on its type
   */
  private serializeAttributeValue(value: any): any {
    if (typeof value === "string") {
      return { stringValue: value };
    } else if (typeof value === "number") {
      if (Number.isInteger(value)) {
        return { intValue: value.toString() };
      } else {
        return { doubleValue: value };
      }
    } else if (typeof value === "boolean") {
      return { boolValue: value };
    } else if (Array.isArray(value)) {
      return {
        arrayValue: {
          values: value.map((v) => this.serializeAttributeValue(v)),
        },
      };
    } else {
      // Convert to string for unsupported types
      return { stringValue: String(value) };
    }
  }

  /**
   * Force flush any pending spans
   */
  async forceFlush(): Promise<void> {
    // For this implementation, we don't batch spans locally,
    // so there's nothing to flush
    return Promise.resolve();
  }
}
