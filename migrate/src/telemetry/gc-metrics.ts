// src/telemetry/gc-metrics.ts

import * as v8 from "node:v8";
import { log, warn } from "../utils/logger";

declare global {
  type BunGC = (force?: boolean) => number;
}

const bunGc = Bun.gc as BunGC;

export interface GCMetricsState {
  initialized: boolean;
  intervalId: ReturnType<typeof setInterval> | null;
  lastHeapStats: v8.HeapInfo | null;
  gcCount: number;
  totalGCDuration: number;
  lastGCTime: number;
}

export interface GCEvent {
  type: "minor" | "major" | "incremental" | "unknown";
  durationMs: number;
  heapBefore: number;
  heapAfter: number;
  freedBytes: number;
  timestamp: number;
}

export type GCEventCallback = (event: GCEvent) => void;

const state: GCMetricsState = {
  initialized: false,
  intervalId: null,
  lastHeapStats: null,
  gcCount: 0,
  totalGCDuration: 0,
  lastGCTime: 0,
};

let gcEventCallback: GCEventCallback | null = null;

function getHeapStats(): v8.HeapInfo {
  return v8.getHeapStatistics();
}

function determineGCType(freedBytes: number, heapBefore: number): GCEvent["type"] {
  if (freedBytes <= 0) {
    return "incremental";
  }

  const freedRatio = freedBytes / heapBefore;

  if (freedRatio > 0.3) {
    return "major";
  }

  if (freedRatio > 0.05) {
    return "minor";
  }

  return "incremental";
}

function collectGCMetrics(): void {
  const startTime = Bun.nanoseconds();
  const heapBefore = getHeapStats();

  const freedBytes = bunGc(false);

  const heapAfter = getHeapStats();
  const durationMs = (Bun.nanoseconds() - startTime) / 1_000_000;

  if (freedBytes > 0 || state.lastHeapStats === null) {
    state.gcCount++;
    state.totalGCDuration += durationMs;

    const gcType = determineGCType(freedBytes, heapBefore.used_heap_size);

    const event: GCEvent = {
      type: gcType,
      durationMs,
      heapBefore: heapBefore.used_heap_size,
      heapAfter: heapAfter.used_heap_size,
      freedBytes,
      timestamp: Date.now(),
    };

    if (gcEventCallback) {
      try {
        gcEventCallback(event);
      } catch (err) {
        warn("Error in GC event callback", {
          component: "gc_metrics",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  }

  state.lastHeapStats = heapAfter;
  state.lastGCTime = Date.now();
}

export function initializeGCMetrics(callback: GCEventCallback, intervalMs = 30000): void {
  if (state.initialized) {
    warn("GC metrics already initialized", {
      component: "gc_metrics",
      operation: "initialization",
    });
    return;
  }

  gcEventCallback = callback;

  state.lastHeapStats = getHeapStats();
  state.lastGCTime = Date.now();

  state.intervalId = setInterval(collectGCMetrics, intervalMs);

  state.initialized = true;

  log("GC metrics collection initialized", {
    component: "gc_metrics",
    operation: "initialization",
    intervalMs,
    initialHeapUsed: state.lastHeapStats.used_heap_size,
    initialHeapTotal: state.lastHeapStats.total_heap_size,
  });
}

export function shutdownGCMetrics(): void {
  if (!state.initialized) {
    return;
  }

  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }

  log("GC metrics collection shutdown", {
    component: "gc_metrics",
    operation: "shutdown",
    totalGCCount: state.gcCount,
    totalGCDurationMs: state.totalGCDuration,
    avgGCDurationMs: state.gcCount > 0 ? state.totalGCDuration / state.gcCount : 0,
  });

  state.initialized = false;
  gcEventCallback = null;
}

export function getGCMetricsState(): Readonly<GCMetricsState> {
  return { ...state };
}

export function getCurrentHeapStats(): v8.HeapInfo {
  return getHeapStats();
}

export function forceGC(): GCEvent {
  const startTime = Bun.nanoseconds();
  const heapBefore = getHeapStats();

  const freedBytes = bunGc(true);

  const heapAfter = getHeapStats();
  const durationMs = (Bun.nanoseconds() - startTime) / 1_000_000;

  state.gcCount++;
  state.totalGCDuration += durationMs;

  const gcType = determineGCType(freedBytes, heapBefore.used_heap_size);

  const event: GCEvent = {
    type: gcType,
    durationMs,
    heapBefore: heapBefore.used_heap_size,
    heapAfter: heapAfter.used_heap_size,
    freedBytes,
    timestamp: Date.now(),
  };

  if (gcEventCallback) {
    gcEventCallback(event);
  }

  state.lastHeapStats = heapAfter;
  state.lastGCTime = Date.now();

  return event;
}
