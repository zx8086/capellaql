/* src/telemetry/metrics/process-metrics.ts */

import { error } from "../../utils/logger";
import {
  gcCollectionCounter,
  gcDurationHistogram,
  gcOldGenerationSizeAfterGauge,
  gcOldGenerationSizeBeforeGauge,
  gcYoungGenerationSizeAfterGauge,
  gcYoungGenerationSizeBeforeGauge,
  processExternalGauge,
  processHeapTotalGauge,
  processHeapUsedGauge,
  processMemoryUsageGauge,
  processStartTimeGauge,
  processUptimeGauge,
} from "./instruments";
import { isMetricsInitialized } from "./state";
import type { ProcessAttributes } from "./types";

// Memory pressure monitoring
let memoryPressureInterval: NodeJS.Timeout | null = null;
// Uptime monitoring
let uptimeMonitoringInterval: NodeJS.Timeout | null = null;

export function startMemoryPressureMonitoring(): void {
  if (memoryPressureInterval) {
    return;
  }

  memoryPressureInterval = setInterval(() => {
    if (!isMetricsInitialized()) return;

    try {
      const memUsage = process.memoryUsage();
      const attributes: ProcessAttributes = { component: "memory_monitor" };

      processMemoryUsageGauge.record(memUsage.rss, attributes);
      processHeapUsedGauge.record(memUsage.heapUsed, attributes);
      processHeapTotalGauge.record(memUsage.heapTotal, attributes);
      processExternalGauge.record(memUsage.external, attributes);
    } catch (err) {
      error("Failed to record memory metrics", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, 5000); // Every 5 seconds
}

export function stopMemoryPressureMonitoring(): void {
  if (memoryPressureInterval) {
    clearInterval(memoryPressureInterval);
    memoryPressureInterval = null;
  }
}

export function setupSystemMetricsCollection(): void {
  if (!isMetricsInitialized()) return;

  try {
    const processStartTime = Date.now() / 1000;
    const attributes: ProcessAttributes = { component: "process_monitor" };

    processStartTimeGauge.record(processStartTime, attributes);

    uptimeMonitoringInterval = setInterval(() => {
      if (!isMetricsInitialized()) return;

      try {
        const uptime = process.uptime();
        processUptimeGauge.record(uptime, attributes);
      } catch (err) {
        error("Failed to record process uptime", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, 10000); // Every 10 seconds
  } catch (err) {
    error("Failed to setup system metrics collection", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function startSystemMetricsCollection(): void {
  setupSystemMetricsCollection();
}

export function stopSystemMetricsCollection(): void {
  stopMemoryPressureMonitoring();
  if (uptimeMonitoringInterval) {
    clearInterval(uptimeMonitoringInterval);
    uptimeMonitoringInterval = null;
  }
}

export function recordGCCollection(gcType: string): void {
  if (!isMetricsInitialized()) return;

  const attributes: ProcessAttributes = {
    component: "gc",
    gc_type: gcType,
  };

  try {
    gcCollectionCounter.add(1, attributes);
  } catch (err) {
    error("Failed to record GC collection metric", {
      error: err instanceof Error ? err.message : String(err),
      gcType,
    });
  }
}

export function recordGCDuration(durationSeconds: number, gcType: string): void {
  if (!isMetricsInitialized()) return;

  const attributes: ProcessAttributes = {
    component: "gc",
    gc_type: gcType,
  };

  try {
    gcDurationHistogram.record(durationSeconds, attributes);
  } catch (err) {
    error("Failed to record GC duration metric", {
      error: err instanceof Error ? err.message : String(err),
      durationSeconds,
      gcType,
    });
  }
}

export function recordGCHeapSizes(
  oldGenBefore: number,
  oldGenAfter: number,
  youngGenBefore: number,
  youngGenAfter: number
): void {
  if (!isMetricsInitialized()) return;

  const attributes: ProcessAttributes = {
    component: "gc",
  };

  try {
    gcOldGenerationSizeBeforeGauge.record(oldGenBefore, attributes);
    gcOldGenerationSizeAfterGauge.record(oldGenAfter, attributes);
    gcYoungGenerationSizeBeforeGauge.record(youngGenBefore, attributes);
    gcYoungGenerationSizeAfterGauge.record(youngGenAfter, attributes);
  } catch (err) {
    error("Failed to record GC heap size metrics", {
      error: err instanceof Error ? err.message : String(err),
      oldGenBefore,
      oldGenAfter,
      youngGenBefore,
      youngGenAfter,
    });
  }
}
