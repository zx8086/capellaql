// src/logging/ports/formatter.port.ts
// SIO-447: Formatter port interface for Clean Architecture

import type { LogContext, LogLevel, ServiceInfo, TraceContext } from "./logger.port";

/**
 * Log entry structure before formatting
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context: LogContext;
  service: ServiceInfo;
  trace?: TraceContext;
}

/**
 * Field mapping for ECS transformation
 */
export interface FieldMapping {
  source: string;
  target: string;
}

/**
 * Log formatter interface.
 * Transforms log entries into specific output formats (ECS, JSON, etc.)
 */
export interface ILogFormatter {
  /**
   * Formatter name for identification
   */
  readonly name: string;

  /**
   * Format a log entry
   * @param entry - The log entry to format
   * @returns Formatted output (string or object for JSON)
   */
  format(entry: LogEntry): string | Record<string, unknown>;
}

/**
 * ECS formatter configuration
 */
export interface EcsFormatterConfig {
  /** Custom field mappings in addition to defaults */
  customMappings?: FieldMapping[];
  /** Convert Error objects to ECS format */
  convertErr?: boolean;
  /** Convert HTTP req/res objects */
  convertReqRes?: boolean;
}
