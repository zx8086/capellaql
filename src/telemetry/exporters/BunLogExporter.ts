// Bun-optimized OTLP Log Exporter with circuit breaker integration

import type { ExportResult } from "@opentelemetry/core";
import { hrTimeToMicroseconds } from "@opentelemetry/core";
import type { LogRecordExporter, ReadableLogRecord } from "@opentelemetry/sdk-logs";
import { telemetryHealthMonitor } from "../health/telemetryHealth";
import { BunOTLPExporter, type BunOTLPExporterConfig } from "./BunOTLPExporter";

/**
 * Bun-optimized log exporter with circuit breaker integration
 * Provides intelligent failure handling and recovery
 */
export class BunLogExporter extends BunOTLPExporter<ReadableLogRecord> implements LogRecordExporter {
  private circuitBreakerFailureCount = 0;
  private circuitBreakerLastFailureTime = 0;
  private readonly circuitBreakerThreshold = 5;
  private readonly circuitBreakerTimeoutMs = 30000; // 30 seconds
  
  // Advanced filtering state
  private recentLogHashes = new Map<string, number>(); // hash -> timestamp
  private readonly deduplicationWindow = 60000; // 1 minute
  private readonly maxDuplicates = 5; // Max identical logs per window

  constructor(config: BunOTLPExporterConfig) {
    super("logs", config);
  }

  /**
   * Export logs with circuit breaker protection and advanced filtering
   */
  async export(logs: ReadableLogRecord[], resultCallback: (result: ExportResult) => void): Promise<void> {
    // Check circuit breaker state
    if (this.isCircuitBreakerOpen()) {
      console.warn("Log export circuit breaker is OPEN - rejecting export");
      resultCallback({
        code: 1, // ExportResultCode.FAILED
        error: new Error("Circuit breaker is open due to repeated failures"),
      });
      return;
    }

    // Apply advanced log filtering and deduplication
    const filteredLogs = this.applyAdvancedFiltering(logs);

    // Delegate to base class with circuit breaker monitoring
    const originalCallback = resultCallback;
    const wrappedCallback = (result: ExportResult) => {
      if (result.code === 0) {
        // ExportResultCode.SUCCESS
        // Reset circuit breaker on success
        this.circuitBreakerFailureCount = 0;
        this.circuitBreakerLastFailureTime = 0;
      } else {
        // Increment failure count
        this.circuitBreakerFailureCount++;
        this.circuitBreakerLastFailureTime = Date.now();

        console.warn(`Log export failure ${this.circuitBreakerFailureCount}/${this.circuitBreakerThreshold}`);

        if (this.circuitBreakerFailureCount >= this.circuitBreakerThreshold) {
          console.error("Log export circuit breaker OPENED due to repeated failures");
          // Circuit breaker state is already tracked in the health monitor
        }
      }

      originalCallback(result);
    };

    return super.export(filteredLogs, wrappedCallback);
  }

  /**
   * Check if circuit breaker should block exports
   */
  private isCircuitBreakerOpen(): boolean {
    if (this.circuitBreakerFailureCount < this.circuitBreakerThreshold) {
      return false;
    }

    const timeSinceLastFailure = Date.now() - this.circuitBreakerLastFailureTime;
    if (timeSinceLastFailure > this.circuitBreakerTimeoutMs) {
      // Reset circuit breaker after timeout
      console.log("Log export circuit breaker timeout expired - attempting recovery");
      this.circuitBreakerFailureCount = 0;
      this.circuitBreakerLastFailureTime = 0;
      // Circuit breaker state change is automatically tracked in health monitor
      return false;
    }

    return true;
  }

  /**
   * Apply advanced log filtering including deduplication and aggregation
   */
  private applyAdvancedFiltering(logs: ReadableLogRecord[]): ReadableLogRecord[] {
    const now = Date.now();
    const filtered: ReadableLogRecord[] = [];
    
    // Clean old hashes periodically
    this.cleanOldHashes(now);
    
    for (const log of logs) {
      // Always keep error logs for 100% visibility
      if (log.severityNumber && log.severityNumber >= 17) { // ERROR level and above
        filtered.push(log);
        continue;
      }
      
      // Create hash for deduplication (message + severity + key attributes)
      const logHash = this.createLogHash(log);
      const lastSeen = this.recentLogHashes.get(logHash);
      
      if (!lastSeen || now - lastSeen > this.deduplicationWindow) {
        // First occurrence or outside deduplication window
        this.recentLogHashes.set(logHash, now);
        filtered.push(log);
      } else {
        // Skip duplicate within time window (intelligent aggregation)
        console.debug(`Deduplicated log: ${log.body}`);
      }
    }
    
    return filtered;
  }
  
  private cleanOldHashes(now: number): void {
    for (const [hash, timestamp] of this.recentLogHashes.entries()) {
      if (now - timestamp > this.deduplicationWindow * 2) {
        this.recentLogHashes.delete(hash);
      }
    }
  }
  
  private createLogHash(log: ReadableLogRecord): string {
    // Create a hash based on message content and key attributes
    const content = String(log.body || '');
    const severity = log.severityNumber || 0;
    const traceId = log.spanContext?.traceId?.slice(0, 8) || '';
    
    // Simple hash function
    let hash = 0;
    const str = `${content}:${severity}:${traceId}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return hash.toString();
  }

  /**
   * Serialize logs to OTLP JSON format
   */
  protected serializePayload(logs: ReadableLogRecord[]): string {
    const resourceLogs = this.groupLogsByResource(logs);

    const otlpPayload = {
      resourceLogs: resourceLogs.map((group) => ({
        resource: {
          attributes: this.serializeAttributes(group.resource.attributes),
        },
        scopeLogs: [
          {
            scope: {
              name: group.instrumentationScope?.name || "unknown",
              version: group.instrumentationScope?.version || "1.0.0",
            },
            logRecords: group.logs.map((log) => this.serializeLogRecord(log)),
          },
        ],
      })),
    };

    return JSON.stringify(otlpPayload);
  }

  /**
   * Group logs by resource for efficient OTLP payload structure
   */
  private groupLogsByResource(logs: ReadableLogRecord[]): Array<{
    resource: any;
    instrumentationScope: any;
    logs: ReadableLogRecord[];
  }> {
    const groups = new Map();

    for (const log of logs) {
      const resourceKey = JSON.stringify(log.resource.attributes);
      const scopeKey = log.instrumentationScope?.name || "unknown";
      const key = `${resourceKey}:${scopeKey}`;

      if (!groups.has(key)) {
        groups.set(key, {
          resource: log.resource,
          instrumentationScope: log.instrumentationScope,
          logs: [],
        });
      }

      groups.get(key).logs.push(log);
    }

    return Array.from(groups.values());
  }

  /**
   * Serialize individual log record to OTLP format
   */
  private serializeLogRecord(log: ReadableLogRecord): any {
    const timeUnixNano = hrTimeToMicroseconds(log.hrTime) * 1000;
    const observedTimeUnixNano = log.hrTimeObserved ? hrTimeToMicroseconds(log.hrTimeObserved) * 1000 : timeUnixNano;

    return {
      timeUnixNano: timeUnixNano.toString(),
      observedTimeUnixNano: observedTimeUnixNano.toString(),
      severityNumber: this.mapSeverityLevel(log.severityNumber),
      severityText: log.severityText || this.getSeverityText(log.severityNumber),
      body: this.serializeLogBody(log.body),
      attributes: this.serializeAttributes(log.attributes),
      droppedAttributesCount: log.droppedAttributesCount || 0,
      flags: log.spanContext?.traceFlags || 0,
      traceId: log.spanContext?.traceId || "",
      spanId: log.spanContext?.spanId || "",
    };
  }

  /**
   * Serialize log message body
   */
  private serializeLogBody(body: any): any {
    if (typeof body === "string") {
      return { stringValue: body };
    } else if (typeof body === "number") {
      if (Number.isInteger(body)) {
        return { intValue: body.toString() };
      } else {
        return { doubleValue: body };
      }
    } else if (typeof body === "boolean") {
      return { boolValue: body };
    } else if (body && typeof body === "object") {
      return { stringValue: JSON.stringify(body) };
    } else {
      return { stringValue: String(body || "") };
    }
  }

  /**
   * Map OpenTelemetry severity number to OTLP severity
   */
  private mapSeverityLevel(severityNumber?: number): number {
    if (!severityNumber) return 9; // INFO

    // OpenTelemetry severity levels map directly to OTLP
    return Math.min(Math.max(severityNumber, 1), 24);
  }

  /**
   * Get severity text from severity number
   */
  private getSeverityText(severityNumber?: number): string {
    if (!severityNumber) return "INFO";

    const severityMap: Record<number, string> = {
      1: "TRACE",
      2: "TRACE2",
      3: "TRACE3",
      4: "TRACE4",
      5: "DEBUG",
      6: "DEBUG2",
      7: "DEBUG3",
      8: "DEBUG4",
      9: "INFO",
      10: "INFO2",
      11: "INFO3",
      12: "INFO4",
      13: "WARN",
      14: "WARN2",
      15: "WARN3",
      16: "WARN4",
      17: "ERROR",
      18: "ERROR2",
      19: "ERROR3",
      20: "ERROR4",
      21: "FATAL",
      22: "FATAL2",
      23: "FATAL3",
      24: "FATAL4",
    };

    return severityMap[severityNumber] || "INFO";
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
   * Get circuit breaker status
   */
  getCircuitBreakerStatus() {
    return {
      isOpen: this.isCircuitBreakerOpen(),
      failureCount: this.circuitBreakerFailureCount,
      lastFailureTime: this.circuitBreakerLastFailureTime,
      threshold: this.circuitBreakerThreshold,
    };
  }

  /**
   * Force flush any pending logs
   */
  async forceFlush(): Promise<void> {
    // For this implementation, we don't batch logs locally,
    // so there's nothing to flush
    return Promise.resolve();
  }
}
