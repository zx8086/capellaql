// Unit tests for telemetry export stats tracker
import { describe, expect, test, beforeEach } from "bun:test";
import {
  createExportStatsTracker,
  wrapSpanExporter,
  wrapLogRecordExporter,
  wrapMetricExporter,
  type ExportStatsTracker,
} from "../../../../src/telemetry/export-stats-tracker";
import type { ExportResult } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import type { LogRecordExporter, ReadableLogRecord } from "@opentelemetry/sdk-logs";
import { InstrumentType, type PushMetricExporter, type ResourceMetrics } from "@opentelemetry/sdk-metrics";

describe("Export Stats Tracker", () => {
  let tracker: ExportStatsTracker;

  beforeEach(() => {
    tracker = createExportStatsTracker();
  });

  describe("createExportStatsTracker", () => {
    test("initializes with zero counts", () => {
      expect(tracker.totalExports).toBe(0);
      expect(tracker.successCount).toBe(0);
      expect(tracker.failureCount).toBe(0);
      expect(tracker.successRate).toBe(0);
    });

    test("initializes with null timestamps", () => {
      expect(tracker.lastExportTime).toBeNull();
      expect(tracker.lastSuccessTime).toBeNull();
      expect(tracker.lastFailureTime).toBeNull();
    });

    test("initializes with empty recent errors", () => {
      expect(tracker.recentErrors).toEqual([]);
    });
  });

  describe("recordExportAttempt", () => {
    test("increments total exports count", () => {
      tracker.recordExportAttempt();
      expect(tracker.totalExports).toBe(1);

      tracker.recordExportAttempt();
      expect(tracker.totalExports).toBe(2);
    });

    test("does not affect success or failure counts", () => {
      tracker.recordExportAttempt();
      expect(tracker.successCount).toBe(0);
      expect(tracker.failureCount).toBe(0);
    });
  });

  describe("recordExportSuccess", () => {
    test("increments success count", () => {
      tracker.recordExportAttempt();
      tracker.recordExportSuccess();
      expect(tracker.successCount).toBe(1);
    });

    test("updates last export and success timestamps", () => {
      tracker.recordExportAttempt();
      tracker.recordExportSuccess();

      expect(tracker.lastExportTime).not.toBeNull();
      expect(tracker.lastSuccessTime).not.toBeNull();
      expect(tracker.lastExportTime).toBe(tracker.lastSuccessTime);
    });

    test("does not affect failure count", () => {
      tracker.recordExportAttempt();
      tracker.recordExportSuccess();
      expect(tracker.failureCount).toBe(0);
    });
  });

  describe("recordExportFailure", () => {
    test("increments failure count", () => {
      tracker.recordExportAttempt();
      tracker.recordExportFailure("Connection timeout");
      expect(tracker.failureCount).toBe(1);
    });

    test("updates last export and failure timestamps", () => {
      tracker.recordExportAttempt();
      tracker.recordExportFailure("Connection timeout");

      expect(tracker.lastExportTime).not.toBeNull();
      expect(tracker.lastFailureTime).not.toBeNull();
      expect(tracker.lastExportTime).toBe(tracker.lastFailureTime);
    });

    test("adds error to recent errors list", () => {
      tracker.recordExportAttempt();
      tracker.recordExportFailure("Connection timeout");

      expect(tracker.recentErrors.length).toBe(1);
      expect(tracker.recentErrors[0]).toContain("Connection timeout");
    });

    test("limits recent errors to 10 entries", () => {
      for (let i = 0; i < 15; i++) {
        tracker.recordExportAttempt();
        tracker.recordExportFailure(`Error ${i}`);
      }

      expect(tracker.recentErrors.length).toBe(10);
      // Should contain the last 10 errors (5-14)
      expect(tracker.recentErrors[0]).toContain("Error 5");
      expect(tracker.recentErrors[9]).toContain("Error 14");
    });

    test("does not affect success count", () => {
      tracker.recordExportAttempt();
      tracker.recordExportFailure("Error");
      expect(tracker.successCount).toBe(0);
    });
  });

  describe("successRate", () => {
    test("returns 0 when no exports", () => {
      expect(tracker.successRate).toBe(0);
    });

    test("returns 100 when all exports succeed", () => {
      for (let i = 0; i < 10; i++) {
        tracker.recordExportAttempt();
        tracker.recordExportSuccess();
      }
      expect(tracker.successRate).toBe(100);
    });

    test("returns 0 when all exports fail", () => {
      for (let i = 0; i < 10; i++) {
        tracker.recordExportAttempt();
        tracker.recordExportFailure("Error");
      }
      expect(tracker.successRate).toBe(0);
    });

    test("calculates correct percentage for mixed results", () => {
      // 7 successes, 3 failures = 70%
      for (let i = 0; i < 7; i++) {
        tracker.recordExportAttempt();
        tracker.recordExportSuccess();
      }
      for (let i = 0; i < 3; i++) {
        tracker.recordExportAttempt();
        tracker.recordExportFailure("Error");
      }
      expect(tracker.successRate).toBe(70);
    });

    test("rounds to nearest integer", () => {
      // 1 success, 2 failures = 33.33...% -> 33%
      tracker.recordExportAttempt();
      tracker.recordExportSuccess();
      tracker.recordExportAttempt();
      tracker.recordExportFailure("Error");
      tracker.recordExportAttempt();
      tracker.recordExportFailure("Error");

      expect(tracker.successRate).toBe(33);
    });
  });

  describe("getStats", () => {
    test("returns formatted stats object", () => {
      tracker.recordExportAttempt();
      tracker.recordExportSuccess();
      tracker.recordExportAttempt();
      tracker.recordExportFailure("Test error");

      const stats = tracker.getStats();

      expect(stats.total).toBe(2);
      expect(stats.failures).toBe(1);
      expect(stats.successRate).toBe("50%");
      expect(stats.lastExportTime).not.toBeNull();
      expect(stats.lastFailureTime).not.toBeNull();
      expect(stats.recentErrors.length).toBe(1);
    });

    test("returns immutable copy of recent errors", () => {
      tracker.recordExportAttempt();
      tracker.recordExportFailure("Error 1");

      const stats1 = tracker.getStats();
      const errors1 = stats1.recentErrors;

      tracker.recordExportAttempt();
      tracker.recordExportFailure("Error 2");

      const stats2 = tracker.getStats();

      // Original array should not be modified
      expect(errors1.length).toBe(1);
      expect(stats2.recentErrors.length).toBe(2);
    });
  });

  describe("recentErrors immutability", () => {
    test("returns a copy of recent errors array", () => {
      tracker.recordExportAttempt();
      tracker.recordExportFailure("Error");

      const errors1 = tracker.recentErrors;
      const errors2 = tracker.recentErrors;

      expect(errors1).not.toBe(errors2); // Different array instances
      expect(errors1).toEqual(errors2); // Same content
    });
  });
});

describe("Exporter Wrappers", () => {
  describe("wrapSpanExporter", () => {
    test("tracks successful span exports", () => {
      const tracker = createExportStatsTracker();
      const mockExporter: SpanExporter = {
        export: (spans, callback) => {
          callback({ code: 0 }); // Success
        },
        shutdown: async () => {},
      };

      const wrapped = wrapSpanExporter(mockExporter, tracker);

      wrapped.export([] as ReadableSpan[], () => {});

      expect(tracker.totalExports).toBe(1);
      expect(tracker.successCount).toBe(1);
      expect(tracker.failureCount).toBe(0);
    });

    test("tracks failed span exports", () => {
      const tracker = createExportStatsTracker();
      const mockExporter: SpanExporter = {
        export: (spans, callback) => {
          callback({ code: 1, error: new Error("Export failed") });
        },
        shutdown: async () => {},
      };

      const wrapped = wrapSpanExporter(mockExporter, tracker);

      wrapped.export([] as ReadableSpan[], () => {});

      expect(tracker.totalExports).toBe(1);
      expect(tracker.successCount).toBe(0);
      expect(tracker.failureCount).toBe(1);
      expect(tracker.recentErrors[0]).toContain("Export failed");
    });

    test("calls original callback with result", () => {
      const tracker = createExportStatsTracker();
      const expectedResult: ExportResult = { code: 0 };
      const mockExporter: SpanExporter = {
        export: (spans, callback) => {
          callback(expectedResult);
        },
        shutdown: async () => {},
      };

      const wrapped = wrapSpanExporter(mockExporter, tracker);
      let receivedResult: ExportResult | null = null;

      wrapped.export([] as ReadableSpan[], (result) => {
        receivedResult = result;
      });

      expect(receivedResult!).toEqual(expectedResult);
    });

    test("delegates shutdown to original exporter", async () => {
      const tracker = createExportStatsTracker();
      let shutdownCalled = false;
      const mockExporter: SpanExporter = {
        export: (spans, callback) => callback({ code: 0 }),
        shutdown: async () => {
          shutdownCalled = true;
        },
      };

      const wrapped = wrapSpanExporter(mockExporter, tracker);
      await wrapped.shutdown();

      expect(shutdownCalled).toBe(true);
    });

    test("delegates forceFlush when available", async () => {
      const tracker = createExportStatsTracker();
      let forceFlushCalled = false;
      const mockExporter: SpanExporter = {
        export: (spans, callback) => callback({ code: 0 }),
        shutdown: async () => {},
        forceFlush: async () => {
          forceFlushCalled = true;
        },
      };

      const wrapped = wrapSpanExporter(mockExporter, tracker);
      await wrapped.forceFlush?.();

      expect(forceFlushCalled).toBe(true);
    });
  });

  describe("wrapLogRecordExporter", () => {
    test("tracks successful log exports", () => {
      const tracker = createExportStatsTracker();
      const mockExporter: LogRecordExporter = {
        export: (logs, callback) => {
          callback({ code: 0 });
        },
        shutdown: async () => {},
      };

      const wrapped = wrapLogRecordExporter(mockExporter, tracker);

      wrapped.export([] as ReadableLogRecord[], () => {});

      expect(tracker.totalExports).toBe(1);
      expect(tracker.successCount).toBe(1);
    });

    test("tracks failed log exports", () => {
      const tracker = createExportStatsTracker();
      const mockExporter: LogRecordExporter = {
        export: (logs, callback) => {
          callback({ code: 1, error: new Error("Log export failed") });
        },
        shutdown: async () => {},
      };

      const wrapped = wrapLogRecordExporter(mockExporter, tracker);

      wrapped.export([] as ReadableLogRecord[], () => {});

      expect(tracker.failureCount).toBe(1);
      expect(tracker.recentErrors[0]).toContain("Log export failed");
    });

    test("uses default error message when none provided", () => {
      const tracker = createExportStatsTracker();
      const mockExporter: LogRecordExporter = {
        export: (logs, callback) => {
          callback({ code: 1 }); // No error object
        },
        shutdown: async () => {},
      };

      const wrapped = wrapLogRecordExporter(mockExporter, tracker);

      wrapped.export([] as ReadableLogRecord[], () => {});

      expect(tracker.recentErrors[0]).toContain("Export failed");
    });
  });

  describe("wrapMetricExporter", () => {
    test("tracks successful metric exports", () => {
      const tracker = createExportStatsTracker();
      const mockExporter: PushMetricExporter = {
        export: (metrics, callback) => {
          callback({ code: 0 });
        },
        forceFlush: async () => {},
        shutdown: async () => {},
      };

      const wrapped = wrapMetricExporter(mockExporter, tracker);

      wrapped.export({} as ResourceMetrics, () => {});

      expect(tracker.totalExports).toBe(1);
      expect(tracker.successCount).toBe(1);
    });

    test("tracks failed metric exports", () => {
      const tracker = createExportStatsTracker();
      const mockExporter: PushMetricExporter = {
        export: (metrics, callback) => {
          callback({ code: 1, error: new Error("Metric export failed") });
        },
        forceFlush: async () => {},
        shutdown: async () => {},
      };

      const wrapped = wrapMetricExporter(mockExporter, tracker);

      wrapped.export({} as ResourceMetrics, () => {});

      expect(tracker.failureCount).toBe(1);
    });

    test("delegates selectAggregationTemporality when available", () => {
      const tracker = createExportStatsTracker();
      let temporalityCalled = false;
      const mockExporter: PushMetricExporter = {
        export: (metrics, callback) => callback({ code: 0 }),
        forceFlush: async () => {},
        shutdown: async () => {},
        selectAggregationTemporality: () => {
          temporalityCalled = true;
          return 1; // Delta temporality
        },
      };

      const wrapped = wrapMetricExporter(mockExporter, tracker);
      wrapped.selectAggregationTemporality?.(InstrumentType.COUNTER);

      expect(temporalityCalled).toBe(true);
    });

    test("handles missing selectAggregationTemporality", () => {
      const tracker = createExportStatsTracker();
      const mockExporter: PushMetricExporter = {
        export: (metrics, callback) => callback({ code: 0 }),
        forceFlush: async () => {},
        shutdown: async () => {},
        // No selectAggregationTemporality
      };

      const wrapped = wrapMetricExporter(mockExporter, tracker);

      expect(wrapped.selectAggregationTemporality).toBeUndefined();
    });
  });
});

describe("Integration Scenarios", () => {
  test("multiple trackers operate independently", () => {
    const tracker1 = createExportStatsTracker();
    const tracker2 = createExportStatsTracker();

    tracker1.recordExportAttempt();
    tracker1.recordExportSuccess();

    tracker2.recordExportAttempt();
    tracker2.recordExportFailure("Error");

    expect(tracker1.successCount).toBe(1);
    expect(tracker1.failureCount).toBe(0);
    expect(tracker2.successCount).toBe(0);
    expect(tracker2.failureCount).toBe(1);
  });

  test("high volume export tracking", () => {
    const tracker = createExportStatsTracker();
    const totalExports = 10000;
    const failureRate = 0.05; // 5% failure rate

    for (let i = 0; i < totalExports; i++) {
      tracker.recordExportAttempt();
      if (Math.random() < failureRate) {
        tracker.recordExportFailure(`Error ${i}`);
      } else {
        tracker.recordExportSuccess();
      }
    }

    expect(tracker.totalExports).toBe(totalExports);
    expect(tracker.successCount + tracker.failureCount).toBe(totalExports);
    // Success rate should be approximately 95%
    expect(tracker.successRate).toBeGreaterThan(90);
    expect(tracker.successRate).toBeLessThanOrEqual(100);
    // Recent errors should be limited to 10
    expect(tracker.recentErrors.length).toBeLessThanOrEqual(10);
  });
});
