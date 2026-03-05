// src/logging/formatters/ecs.formatter.ts
// SIO-447: ECS (Elastic Common Schema) formatter implementation

import type {
  EcsFormatterConfig,
  FieldMapping,
  ILogFormatter,
  LogEntry,
} from "../ports/formatter.port";
import type { LogContext } from "../ports/logger.port";

/**
 * Default field mappings for ECS compliance.
 * Extracted from winston-logger.ts lines 39-57
 */
const DEFAULT_FIELD_MAPPINGS: FieldMapping[] = [
  { source: "consumerId", target: "consumer.id" },
  { source: "username", target: "consumer.name" },
  { source: "requestId", target: "event.id" },
  { source: "totalDuration", target: "event.duration" },
];

/**
 * ECS-compliant log formatter.
 * Transforms log entries to Elastic Common Schema format.
 *
 * @see https://www.elastic.co/guide/en/ecs/current/index.html
 */
export class EcsFormatter implements ILogFormatter {
  readonly name = "ecs";

  private readonly fieldMappings: FieldMapping[];

  constructor(config: EcsFormatterConfig = {}) {
    this.fieldMappings = [...DEFAULT_FIELD_MAPPINGS, ...(config.customMappings || [])];
  }

  /**
   * Format a log entry to ECS-compliant structure
   */
  format(entry: LogEntry): Record<string, unknown> {
    const base: Record<string, unknown> = {
      "@timestamp": entry.timestamp.toISOString(),
      "log.level": entry.level.toUpperCase(),
      message: entry.message,
      service: {
        name: entry.service.name,
        version: entry.service.version,
        environment: entry.service.environment,
      },
    };

    // Apply field mappings to context
    const mappedContext = this.applyMappings(entry.context);

    // Add trace fields if present
    const traceFields: Record<string, unknown> = {};
    if (entry.trace) {
      if (entry.trace.traceId) {
        traceFields["trace.id"] = entry.trace.traceId;
      }
      if (entry.trace.spanId) {
        traceFields["span.id"] = entry.trace.spanId;
      }
    }

    return { ...base, ...mappedContext, ...traceFields };
  }

  /**
   * Apply field mappings to transform context keys to ECS equivalents
   */
  private applyMappings(context: LogContext): LogContext {
    const result: LogContext = { ...context };

    for (const mapping of this.fieldMappings) {
      if (mapping.source in result) {
        result[mapping.target] = result[mapping.source];
        delete result[mapping.source];
      }
    }

    return result;
  }

  /**
   * Get the default field mappings (for testing)
   */
  static getDefaultMappings(): FieldMapping[] {
    return [...DEFAULT_FIELD_MAPPINGS];
  }
}
