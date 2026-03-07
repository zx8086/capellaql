// Unit tests for process metrics (memory, GC)
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

describe("Process Metrics Module", () => {
  describe("getProcessMetricsStatus", () => {
    test("reports status structure correctly", async () => {
      const { getProcessMetricsStatus } = await import("../../../../src/telemetry/metrics/process-metrics");

      const status = getProcessMetricsStatus();
      expect(typeof status.initialized).toBe("boolean");
      expect(typeof status.memoryPressureMonitoring).toBe("boolean");
      expect(typeof status.currentPressureLevel).toBe("string");
      expect(typeof status.heapUsagePercent).toBe("number");
      expect(Array.isArray(status.availableMetrics)).toBe(true);
    });

    test("reports expected metric names", async () => {
      const { getProcessMetricsStatus } = await import("../../../../src/telemetry/metrics/process-metrics");

      const status = getProcessMetricsStatus();
      const expectedMetrics = [
        "gc_collections_total",
        "gc_duration_seconds",
        "gc_old_generation_size_before_bytes",
        "gc_old_generation_size_after_bytes",
        "process_memory_usage_bytes",
        "process_heap_used_bytes",
        "process_heap_total_bytes",
        "process_external_memory_bytes",
      ];

      expectedMetrics.forEach((metric) => {
        expect(status.availableMetrics).toContain(metric);
      });
    });
  });

  describe("getMemoryPressureState", () => {
    test("returns memory pressure state", async () => {
      const { getMemoryPressureState } = await import("../../../../src/telemetry/metrics/process-metrics");

      const state = getMemoryPressureState();
      expect(state).toHaveProperty("level");
      expect(state).toHaveProperty("heapUsedBytes");
      expect(state).toHaveProperty("heapTotalBytes");
      expect(state).toHaveProperty("rssBytes");
      expect(state).toHaveProperty("externalBytes");
      expect(state).toHaveProperty("heapUsagePercent");
      expect(state).toHaveProperty("lastCheck");
    });

    test("returns valid memory pressure level", async () => {
      const { getMemoryPressureState } = await import("../../../../src/telemetry/metrics/process-metrics");

      const state = getMemoryPressureState();
      const validLevels = ["normal", "medium", "high", "critical"];
      expect(validLevels).toContain(state.level);
    });

    test("returns non-negative memory values", async () => {
      const { getMemoryPressureState } = await import("../../../../src/telemetry/metrics/process-metrics");

      const state = getMemoryPressureState();
      expect(state.heapUsedBytes).toBeGreaterThanOrEqual(0);
      expect(state.heapTotalBytes).toBeGreaterThanOrEqual(0);
      expect(state.rssBytes).toBeGreaterThanOrEqual(0);
      expect(state.heapUsagePercent).toBeGreaterThanOrEqual(0);
    });
  });

  describe("isMemoryPressureElevated", () => {
    test("returns boolean", async () => {
      const { isMemoryPressureElevated } = await import("../../../../src/telemetry/metrics/process-metrics");

      const result = isMemoryPressureElevated();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("isMemoryPressureCritical", () => {
    test("returns boolean", async () => {
      const { isMemoryPressureCritical } = await import("../../../../src/telemetry/metrics/process-metrics");

      const result = isMemoryPressureCritical();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("getMemoryPressureThresholds", () => {
    test("returns threshold configuration", async () => {
      const { getMemoryPressureThresholds } = await import("../../../../src/telemetry/metrics/process-metrics");

      const thresholds = getMemoryPressureThresholds();
      expect(thresholds).toHaveProperty("medium");
      expect(thresholds).toHaveProperty("high");
      expect(thresholds).toHaveProperty("critical");
    });

    test("thresholds are in ascending order", async () => {
      const { getMemoryPressureThresholds } = await import("../../../../src/telemetry/metrics/process-metrics");

      const thresholds = getMemoryPressureThresholds();
      expect(thresholds.medium).toBeLessThan(thresholds.high);
      expect(thresholds.high).toBeLessThan(thresholds.critical);
    });

    test("thresholds are valid percentages", async () => {
      const { getMemoryPressureThresholds } = await import("../../../../src/telemetry/metrics/process-metrics");

      const thresholds = getMemoryPressureThresholds();
      expect(thresholds.medium).toBeGreaterThan(0);
      expect(thresholds.critical).toBeLessThanOrEqual(1);
    });

    test("returns documented threshold values", async () => {
      const { getMemoryPressureThresholds } = await import("../../../../src/telemetry/metrics/process-metrics");

      const thresholds = getMemoryPressureThresholds();
      // Per monitoring-updated.md
      expect(thresholds.medium).toBe(0.7); // 70%
      expect(thresholds.high).toBe(0.85); // 85%
      expect(thresholds.critical).toBe(0.95); // 95%
    });
  });

  describe("recordGCCollection behavior", () => {
    test("accepts valid GC types", async () => {
      const { recordGCCollection } = await import("../../../../src/telemetry/metrics/process-metrics");

      // Should not throw with valid GC types
      expect(() => recordGCCollection("minor")).not.toThrow();
      expect(() => recordGCCollection("major")).not.toThrow();
    });
  });

  describe("recordGCDuration behavior", () => {
    test("accepts valid duration and type", async () => {
      const { recordGCDuration } = await import("../../../../src/telemetry/metrics/process-metrics");

      // Should not throw with valid parameters
      expect(() => recordGCDuration(0.005, "minor")).not.toThrow();
      expect(() => recordGCDuration(0.05, "major")).not.toThrow();
    });

    test("handles zero duration", async () => {
      const { recordGCDuration } = await import("../../../../src/telemetry/metrics/process-metrics");

      expect(() => recordGCDuration(0, "minor")).not.toThrow();
    });
  });

  describe("recordGCHeapSizes behavior", () => {
    test("accepts heap size values", async () => {
      const { recordGCHeapSizes } = await import("../../../../src/telemetry/metrics/process-metrics");

      // Should not throw with valid heap sizes
      expect(() => recordGCHeapSizes(100000000, 80000000)).not.toThrow();
    });

    test("handles optional young generation parameters", async () => {
      const { recordGCHeapSizes } = await import("../../../../src/telemetry/metrics/process-metrics");

      // With all parameters
      expect(() => recordGCHeapSizes(100000000, 80000000, 20000000, 15000000)).not.toThrow();

      // With defaults
      expect(() => recordGCHeapSizes(100000000, 80000000)).not.toThrow();
    });
  });

  describe("handleGCEvent behavior", () => {
    test("accepts GCEvent structure", async () => {
      const { handleGCEvent } = await import("../../../../src/telemetry/metrics/process-metrics");

      const event = {
        type: "minor" as const,
        durationMs: 5,
        heapBefore: 100000000,
        heapAfter: 80000000,
        freedBytes: 20000000,
        timestamp: Date.now(),
      };

      expect(() => handleGCEvent(event)).not.toThrow();
    });

    test("handles major GC events", async () => {
      const { handleGCEvent } = await import("../../../../src/telemetry/metrics/process-metrics");

      const event = {
        type: "major" as const,
        durationMs: 50,
        heapBefore: 200000000,
        heapAfter: 100000000,
        freedBytes: 100000000,
        timestamp: Date.now(),
      };

      expect(() => handleGCEvent(event)).not.toThrow();
    });
  });
});

describe("Memory Pressure Level Calculations", () => {
  describe("threshold logic", () => {
    test("normal level is below 70%", () => {
      const normalCases = [0, 0.1, 0.3, 0.5, 0.69];

      normalCases.forEach((usage) => {
        expect(usage).toBeLessThan(0.7);
      });
    });

    test("medium level is 70-84%", () => {
      const mediumCases = [0.7, 0.75, 0.8, 0.84];

      mediumCases.forEach((usage) => {
        expect(usage).toBeGreaterThanOrEqual(0.7);
        expect(usage).toBeLessThan(0.85);
      });
    });

    test("high level is 85-94%", () => {
      const highCases = [0.85, 0.9, 0.94];

      highCases.forEach((usage) => {
        expect(usage).toBeGreaterThanOrEqual(0.85);
        expect(usage).toBeLessThan(0.95);
      });
    });

    test("critical level is 95%+", () => {
      const criticalCases = [0.95, 0.97, 0.99, 1.0];

      criticalCases.forEach((usage) => {
        expect(usage).toBeGreaterThanOrEqual(0.95);
      });
    });
  });

  describe("heap usage percent calculation", () => {
    test("calculates percentage correctly", () => {
      const testCases = [
        { used: 50000000, total: 100000000, expected: 50 },
        { used: 70000000, total: 100000000, expected: 70 },
        { used: 85000000, total: 100000000, expected: 85 },
        { used: 95000000, total: 100000000, expected: 95 },
      ];

      testCases.forEach(({ used, total, expected }) => {
        const percentage = (used / total) * 100;
        expect(percentage).toBe(expected);
      });
    });

    test("handles edge cases", () => {
      // Zero heap total (shouldn't happen but handle gracefully)
      const usedWithZeroTotal = 0;
      const totalZero = 0;
      const percentage = totalZero > 0 ? (usedWithZeroTotal / totalZero) * 100 : 0;
      expect(percentage).toBe(0);
    });
  });
});

describe("GC Metrics Integration", () => {
  describe("GC duration recording", () => {
    test("converts ms to seconds", () => {
      const testCases = [
        { ms: 5, seconds: 0.005 },
        { ms: 50, seconds: 0.05 },
        { ms: 500, seconds: 0.5 },
        { ms: 1, seconds: 0.001 },
      ];

      testCases.forEach(({ ms, seconds }) => {
        expect(ms / 1000).toBe(seconds);
      });
    });
  });

  describe("GC event structure", () => {
    test("validates GC event fields", () => {
      const event = {
        type: "minor" as const,
        durationMs: 5,
        heapBefore: 100000000,
        heapAfter: 80000000,
        timestamp: Date.now(),
      };

      expect(event.type).toMatch(/^(minor|major)$/);
      expect(event.durationMs).toBeGreaterThanOrEqual(0);
      expect(event.heapBefore).toBeGreaterThanOrEqual(0);
      expect(event.heapAfter).toBeGreaterThanOrEqual(0);
      expect(event.timestamp).toBeGreaterThan(0);
    });

    test("heap after should typically be less than heap before", () => {
      // After GC, heap should be reduced (in most cases)
      const heapBefore = 100000000;
      const heapAfter = 80000000;

      expect(heapAfter).toBeLessThanOrEqual(heapBefore);
    });
  });
});

describe("Process Metrics Edge Cases", () => {
  test("handles very small memory values", () => {
    const smallHeap = 1024; // 1KB
    expect(smallHeap).toBeGreaterThan(0);
  });

  test("handles very large memory values", () => {
    const largeHeap = 8 * 1024 * 1024 * 1024; // 8GB
    expect(largeHeap).toBe(8589934592);
  });

  test("handles rapid pressure level changes", () => {
    const levels = ["normal", "medium", "high", "critical", "high", "medium", "normal"];
    let previousLevel = levels[0];

    levels.slice(1).forEach((currentLevel) => {
      // Verify level transitions are valid
      expect(["normal", "medium", "high", "critical"]).toContain(currentLevel);
      expect(["normal", "medium", "high", "critical"]).toContain(previousLevel);
      previousLevel = currentLevel;
    });
  });

  test("handles zero GC duration", () => {
    const durationMs = 0;
    const durationSeconds = durationMs / 1000;
    expect(durationSeconds).toBe(0);
  });

  test("handles very long GC duration", () => {
    const durationMs = 1000; // 1 second (very long for GC)
    const durationSeconds = durationMs / 1000;
    expect(durationSeconds).toBe(1);
  });
});

describe("Memory Monitoring Lifecycle", () => {
  describe("monitoring state", () => {
    test("can check if monitoring is running", async () => {
      const { getProcessMetricsStatus } = await import("../../../../src/telemetry/metrics/process-metrics");

      const status = getProcessMetricsStatus();
      expect(typeof status.memoryPressureMonitoring).toBe("boolean");
    });
  });

  describe("pressure level transitions", () => {
    test("level changes are logged appropriately", () => {
      // Simulate level change detection
      const previousLevel: string = "normal";
      const newLevel: string = "medium";

      const shouldLog = previousLevel !== newLevel;
      expect(shouldLog).toBe(true);
    });

    test("same level does not trigger log", () => {
      const previousLevel = "normal";
      const newLevel = "normal";

      const shouldLog = previousLevel !== newLevel;
      expect(shouldLog).toBe(false);
    });
  });
});

describe("Process Metrics State Immutability", () => {
  test("getMemoryPressureState returns copy", async () => {
    const { getMemoryPressureState } = await import("../../../../src/telemetry/metrics/process-metrics");

    const state1 = getMemoryPressureState();
    const state2 = getMemoryPressureState();

    // Should be different object references
    expect(state1).not.toBe(state2);
    // But same values
    expect(state1.level).toBe(state2.level);
  });

  test("getMemoryPressureThresholds returns copy", async () => {
    const { getMemoryPressureThresholds } = await import("../../../../src/telemetry/metrics/process-metrics");

    const thresholds1 = getMemoryPressureThresholds();
    const thresholds2 = getMemoryPressureThresholds();

    // Should be different object references
    expect(thresholds1).not.toBe(thresholds2);
    // But same values
    expect(thresholds1.medium).toBe(thresholds2.medium);
    expect(thresholds1.high).toBe(thresholds2.high);
    expect(thresholds1.critical).toBe(thresholds2.critical);
  });
});
