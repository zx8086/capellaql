// src/telemetry/export-stats-tracker.ts

import type { ExportResult } from "@opentelemetry/core";
import type { LogRecordExporter, ReadableLogRecord } from "@opentelemetry/sdk-logs";
import type { PushMetricExporter, ResourceMetrics } from "@opentelemetry/sdk-metrics";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";

export type TelemetryType = "traces" | "metrics" | "logs";

export interface ExportStats {
  readonly successRate: string;
  readonly total: number;
  readonly failures: number;
  readonly lastExportTime: string | null;
  readonly lastFailureTime: string | null;
  readonly recentErrors: readonly string[];
}

export interface ExportStatsTracker {
  recordExportAttempt(): void;
  recordExportSuccess(): void;
  recordExportFailure(error: string): void;
  getStats(): ExportStats;
  readonly totalExports: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly successRate: number;
  readonly lastExportTime: string | null;
  readonly lastSuccessTime: string | null;
  readonly lastFailureTime: string | null;
  readonly recentErrors: string[];
}

const MAX_RECENT_ERRORS = 10;

export function createExportStatsTracker(): ExportStatsTracker {
  let totalExports = 0;
  let successCount = 0;
  let failureCount = 0;
  let lastExportTime: string | null = null;
  let lastSuccessTime: string | null = null;
  let lastFailureTime: string | null = null;
  const recentErrors: string[] = [];

  function calculateSuccessRateNumber(): number {
    if (totalExports === 0) return 0;
    return Math.round((successCount / totalExports) * 100);
  }

  function calculateSuccessRate(): string {
    return `${calculateSuccessRateNumber()}%`;
  }

  const tracker: ExportStatsTracker = {
    get totalExports() {
      return totalExports;
    },
    get successCount() {
      return successCount;
    },
    get failureCount() {
      return failureCount;
    },
    get successRate() {
      return calculateSuccessRateNumber();
    },
    get lastExportTime() {
      return lastExportTime;
    },
    get lastSuccessTime() {
      return lastSuccessTime;
    },
    get lastFailureTime() {
      return lastFailureTime;
    },
    get recentErrors() {
      return [...recentErrors];
    },

    recordExportAttempt() {
      totalExports++;
    },

    recordExportSuccess() {
      successCount++;
      lastExportTime = new Date().toISOString();
      lastSuccessTime = lastExportTime;
    },

    recordExportFailure(error: string) {
      failureCount++;
      lastExportTime = new Date().toISOString();
      lastFailureTime = lastExportTime;
      recentErrors.push(`${lastExportTime}: ${error}`);
      if (recentErrors.length > MAX_RECENT_ERRORS) {
        recentErrors.shift();
      }
    },

    getStats(): ExportStats {
      return {
        successRate: calculateSuccessRate(),
        total: totalExports,
        failures: failureCount,
        lastExportTime,
        lastFailureTime,
        recentErrors: [...recentErrors],
      };
    },
  };

  return tracker;
}

export function wrapSpanExporter(
  exporter: SpanExporter,
  tracker: ExportStatsTracker
): SpanExporter {
  return {
    export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
      tracker.recordExportAttempt();
      exporter.export(spans, (result: ExportResult) => {
        if (result.code === 0) {
          tracker.recordExportSuccess();
        } else {
          const errorMessage = result.error?.message ?? "Export failed";
          tracker.recordExportFailure(errorMessage);
        }
        resultCallback(result);
      });
    },
    shutdown: () => exporter.shutdown(),
    // biome-ignore lint/style/noNonNullAssertion: Already checked exporter.forceFlush exists in ternary condition
    forceFlush: exporter.forceFlush ? () => exporter.forceFlush!() : undefined,
  };
}

export function wrapLogRecordExporter(
  exporter: LogRecordExporter,
  tracker: ExportStatsTracker
): LogRecordExporter {
  return {
    export(logs: ReadableLogRecord[], resultCallback: (result: ExportResult) => void): void {
      tracker.recordExportAttempt();
      exporter.export(logs, (result: ExportResult) => {
        if (result.code === 0) {
          tracker.recordExportSuccess();
        } else {
          const errorMessage = result.error?.message ?? "Export failed";
          tracker.recordExportFailure(errorMessage);
        }
        resultCallback(result);
      });
    },
    shutdown: () => exporter.shutdown(),
  };
}

export function wrapMetricExporter(
  exporter: PushMetricExporter,
  tracker: ExportStatsTracker
): PushMetricExporter {
  return {
    export(metrics: ResourceMetrics, resultCallback: (result: ExportResult) => void): void {
      tracker.recordExportAttempt();
      exporter.export(metrics, (result: ExportResult) => {
        if (result.code === 0) {
          tracker.recordExportSuccess();
        } else {
          const errorMessage = result.error?.message ?? "Export failed";
          tracker.recordExportFailure(errorMessage);
        }
        resultCallback(result);
      });
    },
    forceFlush: () => exporter.forceFlush(),
    shutdown: () => exporter.shutdown(),
    selectAggregationTemporality: exporter.selectAggregationTemporality
      ? // biome-ignore lint/style/noNonNullAssertion: Already checked in ternary condition
        (instrumentType) => exporter.selectAggregationTemporality!(instrumentType)
      : undefined,
  };
}
