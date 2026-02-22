/* src/telemetry/metrics/process-metrics.ts */
/* Memory, CPU, and GC metrics with OpenTelemetry instruments */

import { metrics, type Counter, type Histogram, type ObservableGauge } from "@opentelemetry/api";
import type { GCEvent, GCType } from "../gc-metrics";

// ============================================================================
// Types
// ============================================================================

export type MemoryPressureLevel = "normal" | "medium" | "high" | "critical";

export interface MemoryPressureState {
  level: MemoryPressureLevel;
  heapUsedBytes: number;
  heapTotalBytes: number;
  rssBytes: number;
  externalBytes: number;
  heapUsagePercent: number;
  lastCheck: number;
}

// ============================================================================
// Memory Pressure Thresholds (per monitoring-updated.md)
// ============================================================================

const MEMORY_PRESSURE_THRESHOLDS = {
  medium: 0.7, // 70% heap usage
  high: 0.85, // 85% heap usage
  critical: 0.95, // 95% heap usage
};

// ============================================================================
// State
// ============================================================================

let memoryPressureInterval: ReturnType<typeof setInterval> | null = null;
let currentMemoryPressure: MemoryPressureState = {
  level: "normal",
  heapUsedBytes: 0,
  heapTotalBytes: 0,
  rssBytes: 0,
  externalBytes: 0,
  heapUsagePercent: 0,
  lastCheck: 0,
};

// ============================================================================
// OTel Instruments
// ============================================================================

let isMetricsInitialized = false;

// GC Metrics
let gcCollectionsCounter: Counter | null = null;
let gcDurationHistogram: Histogram | null = null;
let gcOldGenBeforeGauge: ObservableGauge | null = null;
let gcOldGenAfterGauge: ObservableGauge | null = null;

// Process Memory Metrics
let processMemoryGauge: ObservableGauge | null = null;
let heapUsedGauge: ObservableGauge | null = null;
let heapTotalGauge: ObservableGauge | null = null;
let externalMemoryGauge: ObservableGauge | null = null;

// Last recorded values for observable gauges
let lastGCHeapBefore = 0;
let lastGCHeapAfter = 0;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize process metrics instruments.
 */
export function initializeProcessMetrics(): void {
  if (isMetricsInitialized) {
    return;
  }

  const meter = metrics.getMeter("capellaql-process-metrics", "1.0.0");

  // GC Metrics
  gcCollectionsCounter = meter.createCounter("gc_collections_total", {
    description: "Total GC runs by type",
    unit: "1",
  });

  gcDurationHistogram = meter.createHistogram("gc_duration_seconds", {
    description: "GC pause duration distribution",
    unit: "s",
    advice: {
      explicitBucketBoundaries: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
    },
  });

  gcOldGenBeforeGauge = meter.createObservableGauge("gc_old_generation_size_before_bytes", {
    description: "Heap size before GC",
    unit: "By",
  });
  gcOldGenBeforeGauge.addCallback((observer) => {
    observer.observe(lastGCHeapBefore);
  });

  gcOldGenAfterGauge = meter.createObservableGauge("gc_old_generation_size_after_bytes", {
    description: "Heap size after GC",
    unit: "By",
  });
  gcOldGenAfterGauge.addCallback((observer) => {
    observer.observe(lastGCHeapAfter);
  });

  // Process Memory Metrics
  processMemoryGauge = meter.createObservableGauge("process_memory_usage_bytes", {
    description: "RSS (Resident Set Size)",
    unit: "By",
  });
  processMemoryGauge.addCallback((observer) => {
    const mem = process.memoryUsage();
    observer.observe(mem.rss);
  });

  heapUsedGauge = meter.createObservableGauge("process_heap_used_bytes", {
    description: "V8 heap used",
    unit: "By",
  });
  heapUsedGauge.addCallback((observer) => {
    const mem = process.memoryUsage();
    observer.observe(mem.heapUsed);
  });

  heapTotalGauge = meter.createObservableGauge("process_heap_total_bytes", {
    description: "V8 heap total",
    unit: "By",
  });
  heapTotalGauge.addCallback((observer) => {
    const mem = process.memoryUsage();
    observer.observe(mem.heapTotal);
  });

  externalMemoryGauge = meter.createObservableGauge("process_external_memory_bytes", {
    description: "External C++ objects",
    unit: "By",
  });
  externalMemoryGauge.addCallback((observer) => {
    const mem = process.memoryUsage();
    observer.observe(mem.external);
  });

  isMetricsInitialized = true;

  console.info("Process metrics initialized", {
    component: "process-metrics",
    operation: "initialize",
  });
}

// ============================================================================
// GC Metrics Recording
// ============================================================================

/**
 * Record a GC collection event.
 */
export function recordGCCollection(type: GCType): void {
  if (!gcCollectionsCounter) {
    initializeProcessMetrics();
  }
  gcCollectionsCounter?.add(1, { gc_type: type });
}

/**
 * Record GC duration.
 *
 * @param durationSeconds - Duration in seconds
 * @param type - GC type
 */
export function recordGCDuration(durationSeconds: number, type: GCType): void {
  if (!gcDurationHistogram) {
    initializeProcessMetrics();
  }
  gcDurationHistogram?.record(durationSeconds, { gc_type: type });
}

/**
 * Record heap sizes before and after GC.
 */
export function recordGCHeapSizes(
  oldGenBefore: number,
  oldGenAfter: number,
  _youngGenBefore = 0,
  _youngGenAfter = 0,
): void {
  lastGCHeapBefore = oldGenBefore;
  lastGCHeapAfter = oldGenAfter;
}

/**
 * Handle a GC event from gc-metrics module.
 * This integrates GC events with OTel metrics.
 */
export function handleGCEvent(event: GCEvent): void {
  recordGCCollection(event.type);
  recordGCDuration(event.durationMs / 1000, event.type);
  recordGCHeapSizes(event.heapBefore, event.heapAfter, 0, 0);
}

// ============================================================================
// Memory Pressure Monitoring
// ============================================================================

/**
 * Calculate current memory pressure level.
 */
function calculateMemoryPressure(): MemoryPressureState {
  const mem = process.memoryUsage();
  const heapUsagePercent = mem.heapTotal > 0 ? mem.heapUsed / mem.heapTotal : 0;

  let level: MemoryPressureLevel;
  if (heapUsagePercent >= MEMORY_PRESSURE_THRESHOLDS.critical) {
    level = "critical";
  } else if (heapUsagePercent >= MEMORY_PRESSURE_THRESHOLDS.high) {
    level = "high";
  } else if (heapUsagePercent >= MEMORY_PRESSURE_THRESHOLDS.medium) {
    level = "medium";
  } else {
    level = "normal";
  }

  return {
    level,
    heapUsedBytes: mem.heapUsed,
    heapTotalBytes: mem.heapTotal,
    rssBytes: mem.rss,
    externalBytes: mem.external,
    heapUsagePercent: heapUsagePercent * 100,
    lastCheck: Date.now(),
  };
}

/**
 * Start automatic memory pressure monitoring.
 * Records metrics every 5 seconds.
 */
export function startMemoryPressureMonitoring(intervalMs = 5000): void {
  if (memoryPressureInterval) {
    console.warn("Memory pressure monitoring already running");
    return;
  }

  // Initialize metrics if not already done
  if (!isMetricsInitialized) {
    initializeProcessMetrics();
  }

  // Initial check
  currentMemoryPressure = calculateMemoryPressure();

  memoryPressureInterval = setInterval(() => {
    const previousLevel = currentMemoryPressure.level;
    currentMemoryPressure = calculateMemoryPressure();

    // Log level transitions
    if (currentMemoryPressure.level !== previousLevel) {
      console.warn(`Memory pressure level changed: ${previousLevel} -> ${currentMemoryPressure.level}`, {
        component: "process-metrics",
        operation: "memory_pressure_change",
        previousLevel,
        newLevel: currentMemoryPressure.level,
        heapUsagePercent: currentMemoryPressure.heapUsagePercent.toFixed(2),
        heapUsedBytes: currentMemoryPressure.heapUsedBytes,
        heapTotalBytes: currentMemoryPressure.heapTotalBytes,
      });
    }
  }, intervalMs);

  console.info("Memory pressure monitoring started", {
    component: "process-metrics",
    operation: "start_monitoring",
    intervalMs,
    initialLevel: currentMemoryPressure.level,
  });
}

/**
 * Stop memory pressure monitoring.
 */
export function stopMemoryPressureMonitoring(): void {
  if (memoryPressureInterval) {
    clearInterval(memoryPressureInterval);
    memoryPressureInterval = null;
  }

  console.info("Memory pressure monitoring stopped", {
    component: "process-metrics",
    operation: "stop_monitoring",
    finalLevel: currentMemoryPressure.level,
    finalHeapUsagePercent: currentMemoryPressure.heapUsagePercent.toFixed(2),
  });
}

/**
 * Get current memory pressure state.
 */
export function getMemoryPressureState(): MemoryPressureState {
  return { ...currentMemoryPressure };
}

/**
 * Check if memory pressure is elevated (medium, high, or critical).
 */
export function isMemoryPressureElevated(): boolean {
  return currentMemoryPressure.level !== "normal";
}

/**
 * Check if memory pressure is critical.
 */
export function isMemoryPressureCritical(): boolean {
  return currentMemoryPressure.level === "critical";
}

/**
 * Get memory pressure thresholds.
 */
export function getMemoryPressureThresholds(): typeof MEMORY_PRESSURE_THRESHOLDS {
  return { ...MEMORY_PRESSURE_THRESHOLDS };
}

// ============================================================================
// Process Metrics Status
// ============================================================================

export interface ProcessMetricsStatus {
  initialized: boolean;
  memoryPressureMonitoring: boolean;
  currentPressureLevel: MemoryPressureLevel;
  heapUsagePercent: number;
  availableMetrics: string[];
}

/**
 * Get status of process metrics.
 */
export function getProcessMetricsStatus(): ProcessMetricsStatus {
  return {
    initialized: isMetricsInitialized,
    memoryPressureMonitoring: memoryPressureInterval !== null,
    currentPressureLevel: currentMemoryPressure.level,
    heapUsagePercent: currentMemoryPressure.heapUsagePercent,
    availableMetrics: [
      "gc_collections_total",
      "gc_duration_seconds",
      "gc_old_generation_size_before_bytes",
      "gc_old_generation_size_after_bytes",
      "process_memory_usage_bytes",
      "process_heap_used_bytes",
      "process_heap_total_bytes",
      "process_external_memory_bytes",
    ],
  };
}
