/* src/telemetry/gc-metrics.ts */
/* GC event monitoring with bun:jsc integration */

// ============================================================================
// Types
// ============================================================================

/**
 * GC event types based on freed memory ratio.
 * Per monitoring-updated.md specification:
 * - major: >30% of heap freed (full GC)
 * - minor: 5-30% of heap freed (young generation)
 * - incremental: <5% or 0 bytes freed (background GC)
 * - unknown: Negative freed bytes (measurement artifact)
 */
export type GCType = "minor" | "major" | "incremental" | "unknown";

/**
 * Represents a garbage collection event.
 */
export interface GCEvent {
  type: GCType;
  durationMs: number;
  heapBefore: number;
  heapAfter: number;
  freedBytes: number;
  timestamp: number;
}

/**
 * Current heap statistics from bun:jsc or process.memoryUsage().
 */
export interface HeapStats {
  used_heap_size: number;
  total_heap_size: number;
  external_memory: number;
  array_buffers: number;
}

/**
 * Aggregated GC metrics state.
 */
export interface GCMetricsState {
  gcCount: number;
  totalGCDuration: number;
  lastGCEvent: GCEvent | null;
  gcEventsByType: Record<GCType, number>;
  totalFreedBytes: number;
}

export type GCEventCallback = (event: GCEvent) => void;

// ============================================================================
// State
// ============================================================================

let gcMetricsState: GCMetricsState = {
  gcCount: 0,
  totalGCDuration: 0,
  lastGCEvent: null,
  gcEventsByType: {
    minor: 0,
    major: 0,
    incremental: 0,
    unknown: 0,
  },
  totalFreedBytes: 0,
};

let collectionInterval: ReturnType<typeof setInterval> | null = null;
let lastHeapUsed = 0;
let eventCallback: GCEventCallback | null = null;

// ============================================================================
// bun:jsc API Types (when available)
// ============================================================================

interface BunJSC {
  heapStats(): {
    heapSize: number;
    heapCapacity: number;
    extraMemorySize: number;
    objectCount: number;
    protectedObjectCount: number;
    globalObjectCount: number;
    protectedGlobalObjectCount: number;
    objectTypeCounts: Record<string, number>;
  };
  gcAndSweep(): void;
  startRemoteDebugger(): void;
  stopRemoteDebugger(): void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Try to get bun:jsc module if available.
 */
function getBunJSC(): BunJSC | null {
  try {
    if (typeof Bun !== "undefined") {
      // Dynamic import to avoid compile-time errors in non-Bun environments
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require("bun:jsc") as BunJSC;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get current heap statistics from bun:jsc or Node.js.
 */
export function getCurrentHeapStats(): HeapStats {
  const jsc = getBunJSC();

  if (jsc) {
    // Use bun:jsc for more accurate Bun heap stats
    const stats = jsc.heapStats();
    return {
      used_heap_size: stats.heapSize,
      total_heap_size: stats.heapCapacity,
      external_memory: stats.extraMemorySize,
      array_buffers: 0, // Not directly available in bun:jsc
    };
  }

  // Fallback to Node.js/Bun process.memoryUsage()
  const mem = process.memoryUsage();
  return {
    used_heap_size: mem.heapUsed,
    total_heap_size: mem.heapTotal,
    external_memory: mem.external,
    array_buffers: mem.arrayBuffers ?? 0,
  };
}

/**
 * Classify GC type based on freed memory ratio.
 *
 * Per monitoring-updated.md:
 * | Type | Freed Ratio | Description |
 * |------|-------------|-------------|
 * | major | >30% of heap | Full garbage collection |
 * | minor | 5-30% of heap | Young generation collection |
 * | incremental | <5% or 0 bytes | Incremental/background GC |
 * | unknown | Negative freed | Measurement artifact |
 */
function classifyGCType(heapBefore: number, freedBytes: number): GCType {
  if (freedBytes < 0) {
    return "unknown";
  }

  if (heapBefore === 0) {
    return "incremental";
  }

  const freedRatio = freedBytes / heapBefore;

  if (freedRatio > 0.3) {
    return "major";
  } else if (freedRatio >= 0.05) {
    return "minor";
  } else {
    return "incremental";
  }
}

/**
 * Record a GC event.
 */
function recordGCEvent(heapBefore: number, heapAfter: number, durationMs: number): GCEvent {
  const freedBytes = heapBefore - heapAfter;
  const type = classifyGCType(heapBefore, freedBytes);

  const event: GCEvent = {
    type,
    durationMs,
    heapBefore,
    heapAfter,
    freedBytes,
    timestamp: Date.now(),
  };

  // Update state
  gcMetricsState.gcCount++;
  gcMetricsState.totalGCDuration += durationMs;
  gcMetricsState.lastGCEvent = event;
  gcMetricsState.gcEventsByType[type]++;

  if (freedBytes > 0) {
    gcMetricsState.totalFreedBytes += freedBytes;
  }

  // Invoke callback if registered
  if (eventCallback) {
    eventCallback(event);
  }

  return event;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize GC metrics collection.
 *
 * @param callback - Optional callback invoked for each GC event
 * @param intervalMs - Collection interval in milliseconds (default: 30000)
 */
export function initializeGCMetrics(callback?: GCEventCallback, intervalMs = 30000): void {
  if (collectionInterval) {
    console.warn("GC metrics already initialized");
    return;
  }

  eventCallback = callback ?? null;
  lastHeapUsed = getCurrentHeapStats().used_heap_size;

  // Start periodic collection
  collectionInterval = setInterval(() => {
    const startTime = performance.now();
    const heapBefore = lastHeapUsed;

    // Trigger GC if using bun:jsc, otherwise just measure
    const jsc = getBunJSC();
    if (jsc) {
      try {
        jsc.gcAndSweep();
      } catch {
        // GC might not be available in all contexts
      }
    }

    const heapAfter = getCurrentHeapStats().used_heap_size;
    const duration = performance.now() - startTime;

    // Only record if there was actual memory change
    if (heapBefore !== heapAfter || duration > 0) {
      recordGCEvent(heapBefore, heapAfter, duration);
    }

    lastHeapUsed = heapAfter;
  }, intervalMs);

  console.info("GC metrics initialized", {
    component: "gc-metrics",
    operation: "initialize",
    intervalMs,
    usingBunJSC: getBunJSC() !== null,
  });
}

/**
 * Force immediate garbage collection.
 *
 * @returns The GC event from the forced collection
 */
export function forceGC(): GCEvent {
  const startTime = performance.now();
  const heapBefore = getCurrentHeapStats().used_heap_size;

  // Try bun:jsc first
  const jsc = getBunJSC();
  if (jsc) {
    try {
      jsc.gcAndSweep();
    } catch {
      // GC might fail in some contexts
    }
  } else if (typeof global !== "undefined" && typeof (global as { gc?: () => void }).gc === "function") {
    // Node.js with --expose-gc
    (global as { gc: () => void }).gc();
  }

  const heapAfter = getCurrentHeapStats().used_heap_size;
  const duration = performance.now() - startTime;

  const event = recordGCEvent(heapBefore, heapAfter, duration);
  lastHeapUsed = heapAfter;

  return event;
}

/**
 * Get current GC metrics state.
 */
export function getGCMetricsState(): GCMetricsState {
  return { ...gcMetricsState };
}

/**
 * Reset GC metrics state.
 */
export function resetGCMetrics(): void {
  gcMetricsState = {
    gcCount: 0,
    totalGCDuration: 0,
    lastGCEvent: null,
    gcEventsByType: {
      minor: 0,
      major: 0,
      incremental: 0,
      unknown: 0,
    },
    totalFreedBytes: 0,
  };
}

/**
 * Shutdown GC metrics collection.
 */
export function shutdownGCMetrics(): void {
  if (collectionInterval) {
    clearInterval(collectionInterval);
    collectionInterval = null;
  }

  const state = getGCMetricsState();

  console.info("GC metrics collection shutdown", {
    component: "gc-metrics",
    operation: "shutdown",
    totalGCCount: state.gcCount,
    totalGCDurationMs: state.totalGCDuration.toFixed(2),
    avgGCDurationMs: state.gcCount > 0 ? (state.totalGCDuration / state.gcCount).toFixed(2) : "0",
    totalFreedBytes: state.totalFreedBytes,
    gcEventsByType: state.gcEventsByType,
  });

  eventCallback = null;
}

/**
 * Check if GC metrics are currently running.
 */
export function isGCMetricsRunning(): boolean {
  return collectionInterval !== null;
}

/**
 * Get average GC duration.
 */
export function getAverageGCDuration(): number {
  if (gcMetricsState.gcCount === 0) {
    return 0;
  }
  return gcMetricsState.totalGCDuration / gcMetricsState.gcCount;
}

/**
 * Get GC frequency (events per minute) based on runtime.
 */
export function getGCFrequency(): number {
  const uptimeMs = process.uptime() * 1000;
  if (uptimeMs === 0) {
    return 0;
  }
  return (gcMetricsState.gcCount / uptimeMs) * 60000;
}
