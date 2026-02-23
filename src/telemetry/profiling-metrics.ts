/* src/telemetry/profiling-metrics.ts */
/* OpenTelemetry profiling metrics integration */

import { type Counter, type Histogram, metrics, type ObservableGauge } from "@opentelemetry/api";

// ============================================================================
// Types
// ============================================================================

export type ProfilingTriggerReason = "sla_violation" | "manual" | "scheduled" | "memory_pressure" | "error_spike";

export interface ProfilingSession {
  id: string;
  startTime: number;
  endTime?: number;
  reason: ProfilingTriggerReason;
  endpoint?: string;
  status: "running" | "completed" | "failed";
  outputPath?: string;
}

export interface ProfilingMetricsState {
  totalTriggersCount: number;
  activeSessionsCount: number;
  completedSessionsCount: number;
  failedSessionsCount: number;
  triggersByReason: Record<ProfilingTriggerReason, number>;
  lastSessionId: string | null;
}

// ============================================================================
// State
// ============================================================================

let isInitialized = false;
const activeSessions: Map<string, ProfilingSession> = new Map();
const metricsState: ProfilingMetricsState = {
  totalTriggersCount: 0,
  activeSessionsCount: 0,
  completedSessionsCount: 0,
  failedSessionsCount: 0,
  triggersByReason: {
    sla_violation: 0,
    manual: 0,
    scheduled: 0,
    memory_pressure: 0,
    error_spike: 0,
  },
  lastSessionId: null,
};

// ============================================================================
// OTel Instruments
// ============================================================================

let profilingTriggersCounter: Counter | null = null;
let profilingDurationHistogram: Histogram | null = null;
let activeSessionsGauge: ObservableGauge | null = null;
let slaViolationTriggersCounter: Counter | null = null;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize profiling metrics instruments.
 */
export function initializeProfilingMetrics(): void {
  if (isInitialized) {
    return;
  }

  const meter = metrics.getMeter("capellaql-profiling-metrics", "1.0.0");

  // Profiling triggers counter
  profilingTriggersCounter = meter.createCounter("profiling_triggers_total", {
    description: "Total profiling sessions triggered",
    unit: "1",
  });

  // Profiling session duration
  profilingDurationHistogram = meter.createHistogram("profiling_session_duration_seconds", {
    description: "Duration of profiling sessions",
    unit: "s",
    advice: {
      explicitBucketBoundaries: [1, 5, 10, 30, 60, 120, 300, 600],
    },
  });

  // Active profiling sessions gauge
  activeSessionsGauge = meter.createObservableGauge("profiling_active_sessions", {
    description: "Number of currently active profiling sessions",
    unit: "1",
  });
  activeSessionsGauge.addCallback((observer) => {
    observer.observe(activeSessions.size);
  });

  // SLA violation triggered profiling
  slaViolationTriggersCounter = meter.createCounter("profiling_sla_violation_triggers_total", {
    description: "Profiling sessions triggered by SLA violations",
    unit: "1",
  });

  isInitialized = true;

  console.info("Profiling metrics initialized", {
    component: "profiling-metrics",
    operation: "initialize",
  });
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Generate a unique session ID.
 */
function generateSessionId(): string {
  return `prof_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Start a new profiling session.
 *
 * @param reason - Why profiling was triggered
 * @param endpoint - Optional endpoint that triggered profiling
 * @returns Session ID
 */
export function startProfilingSession(reason: ProfilingTriggerReason, endpoint?: string): string {
  if (!isInitialized) {
    initializeProfilingMetrics();
  }

  const sessionId = generateSessionId();
  const session: ProfilingSession = {
    id: sessionId,
    startTime: Date.now(),
    reason,
    endpoint,
    status: "running",
  };

  activeSessions.set(sessionId, session);
  metricsState.totalTriggersCount++;
  metricsState.activeSessionsCount = activeSessions.size;
  metricsState.triggersByReason[reason]++;
  metricsState.lastSessionId = sessionId;

  // Record metrics
  profilingTriggersCounter?.add(1, {
    reason,
    ...(endpoint && { endpoint }),
  });

  if (reason === "sla_violation") {
    slaViolationTriggersCounter?.add(1, {
      ...(endpoint && { endpoint }),
    });
  }

  console.info("Profiling session started", {
    component: "profiling-metrics",
    operation: "session_start",
    sessionId,
    reason,
    endpoint,
  });

  return sessionId;
}

/**
 * Complete a profiling session.
 *
 * @param sessionId - Session to complete
 * @param outputPath - Optional path to profiling output
 */
export function completeProfilingSession(sessionId: string, outputPath?: string): void {
  const session = activeSessions.get(sessionId);
  if (!session) {
    console.warn("Profiling session not found", {
      component: "profiling-metrics",
      operation: "session_complete_not_found",
      sessionId,
    });
    return;
  }

  session.endTime = Date.now();
  session.status = "completed";
  session.outputPath = outputPath;

  const durationSeconds = (session.endTime - session.startTime) / 1000;

  // Record duration
  profilingDurationHistogram?.record(durationSeconds, {
    reason: session.reason,
    status: "completed",
  });

  // Update state
  metricsState.completedSessionsCount++;
  activeSessions.delete(sessionId);
  metricsState.activeSessionsCount = activeSessions.size;

  console.info("Profiling session completed", {
    component: "profiling-metrics",
    operation: "session_complete",
    sessionId,
    durationSeconds,
    reason: session.reason,
    outputPath,
  });
}

/**
 * Mark a profiling session as failed.
 *
 * @param sessionId - Session that failed
 * @param error - Error that caused the failure
 */
export function failProfilingSession(sessionId: string, error?: Error): void {
  const session = activeSessions.get(sessionId);
  if (!session) {
    return;
  }

  session.endTime = Date.now();
  session.status = "failed";

  const durationSeconds = (session.endTime - session.startTime) / 1000;

  // Record duration with failed status
  profilingDurationHistogram?.record(durationSeconds, {
    reason: session.reason,
    status: "failed",
  });

  // Update state
  metricsState.failedSessionsCount++;
  activeSessions.delete(sessionId);
  metricsState.activeSessionsCount = activeSessions.size;

  console.error("Profiling session failed", {
    component: "profiling-metrics",
    operation: "session_failed",
    sessionId,
    durationSeconds,
    reason: session.reason,
    error: error?.message,
  });
}

// ============================================================================
// SLA Violation Integration
// ============================================================================

/**
 * Trigger profiling due to SLA violation.
 * Includes throttling checks and overhead validation.
 *
 * @param endpoint - Endpoint that violated SLA
 * @param p95Latency - Current p95 latency
 * @param threshold - SLA threshold that was violated
 * @returns Session ID if profiling was started, null if throttled
 */
export function triggerSLAViolationProfiling(endpoint: string, p95Latency: number, threshold: number): string | null {
  // Check if we have too many active sessions (overhead limit)
  if (activeSessions.size >= 3) {
    console.warn("Profiling trigger skipped: overhead limit reached", {
      component: "profiling-metrics",
      operation: "trigger_skipped_overhead",
      endpoint,
      activeSessions: activeSessions.size,
    });
    return null;
  }

  // Start the session
  const sessionId = startProfilingSession("sla_violation", endpoint);

  console.info("SLA violation profiling triggered", {
    component: "profiling-metrics",
    operation: "sla_violation_trigger",
    sessionId,
    endpoint,
    p95Latency,
    threshold,
  });

  return sessionId;
}

// ============================================================================
// Status and Diagnostics
// ============================================================================

/**
 * Get current profiling metrics state.
 */
export function getProfilingMetricsState(): ProfilingMetricsState {
  return {
    ...metricsState,
    activeSessionsCount: activeSessions.size,
  };
}

/**
 * Get active profiling sessions.
 */
export function getActiveSessions(): ProfilingSession[] {
  return Array.from(activeSessions.values());
}

/**
 * Check if profiling is currently active.
 */
export function isProfilingActive(): boolean {
  return activeSessions.size > 0;
}

/**
 * Shutdown profiling metrics.
 * Fails all active sessions.
 */
export function shutdownProfilingMetrics(): void {
  // Fail all active sessions
  for (const sessionId of activeSessions.keys()) {
    failProfilingSession(sessionId, new Error("Shutdown"));
  }

  console.info("Profiling metrics shutdown", {
    component: "profiling-metrics",
    operation: "shutdown",
    totalTriggers: metricsState.totalTriggersCount,
    completedSessions: metricsState.completedSessionsCount,
    failedSessions: metricsState.failedSessionsCount,
    triggersByReason: metricsState.triggersByReason,
  });
}
