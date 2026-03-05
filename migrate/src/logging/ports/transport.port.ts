// src/logging/ports/transport.port.ts
// SIO-447: Transport port interface for Clean Architecture

import type { LogEntry } from "./formatter.port";

/**
 * Transport configuration
 */
export interface TransportConfig {
  type: "console" | "otlp" | "file" | "stream";
  options?: Record<string, unknown>;
}

/**
 * Log transport interface.
 * Handles delivery of formatted log entries to destinations.
 */
export interface ILogTransport {
  /**
   * Transport name for identification
   */
  readonly name: string;

  /**
   * Write a formatted log entry to the transport destination
   * @param entry - The original log entry
   * @param formattedOutput - The formatted output from the formatter
   */
  write(entry: LogEntry, formattedOutput: string | Record<string, unknown>): void;

  /**
   * Flush pending writes
   */
  flush(): Promise<void>;

  /**
   * Close the transport and release resources
   */
  close(): Promise<void>;
}
