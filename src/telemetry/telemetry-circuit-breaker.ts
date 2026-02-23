/* src/telemetry/telemetry-circuit-breaker.ts */
/* Per-signal circuit breakers for traces, metrics, and logs */

import { type CircuitBreakerConfig, CircuitBreakerState, TelemetryCircuitBreaker } from "./health/CircuitBreaker";

// ============================================================================
// Types
// ============================================================================

export type TelemetrySignal = "traces" | "metrics" | "logs";

export interface SignalCircuitBreakerStats {
  signal: TelemetrySignal;
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalAttempts: number;
  totalFailures: number;
  totalSuccesses: number;
  canExecute: boolean;
  successRate: number;
}

export interface TelemetryCircuitBreakersStatus {
  status: "healthy" | "degraded" | "critical";
  summary: {
    total: number;
    closed: number;
    open: number;
    halfOpen: number;
  };
  signals: Record<TelemetrySignal, SignalCircuitBreakerStats>;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5, // 5 failures to open
  recoveryTimeoutMs: 60000, // 1 minute recovery
  successThreshold: 3, // 3 successes to close
  timeWindowMs: 60000, // 1 minute window
};

// ============================================================================
// Per-Signal Circuit Breakers
// ============================================================================

/**
 * Individual circuit breakers for each telemetry signal type.
 * This allows fine-grained control over failure handling per signal.
 *
 * Per monitoring-updated.md specification:
 * - traces: Controls trace export circuit breaking
 * - metrics: Controls metric export circuit breaking
 * - logs: Controls log export circuit breaking
 */
const signalCircuitBreakers: Record<TelemetrySignal, TelemetryCircuitBreaker> = {
  traces: new TelemetryCircuitBreaker(DEFAULT_CIRCUIT_BREAKER_CONFIG),
  metrics: new TelemetryCircuitBreaker(DEFAULT_CIRCUIT_BREAKER_CONFIG),
  logs: new TelemetryCircuitBreaker(DEFAULT_CIRCUIT_BREAKER_CONFIG),
};

// ============================================================================
// State Transition Logging Interval
// ============================================================================

let stateCheckInterval: ReturnType<typeof setInterval> | null = null;
let previousStates: Record<TelemetrySignal, CircuitBreakerState> = {
  traces: CircuitBreakerState.CLOSED,
  metrics: CircuitBreakerState.CLOSED,
  logs: CircuitBreakerState.CLOSED,
};

/**
 * Start monitoring for circuit breaker state transitions.
 * Logs state changes for observability.
 */
function startStateMonitoring(intervalMs = 5000): void {
  if (stateCheckInterval) {
    return; // Already running
  }

  stateCheckInterval = setInterval(() => {
    for (const signal of Object.keys(signalCircuitBreakers) as TelemetrySignal[]) {
      const breaker = signalCircuitBreakers[signal];
      const currentState = breaker.getStats().state;
      const previousState = previousStates[signal];

      if (currentState !== previousState) {
        console.info(`Circuit breaker state transition: ${signal}`, {
          component: "telemetry-circuit-breaker",
          signal,
          previousState,
          currentState,
          timestamp: new Date().toISOString(),
        });
        previousStates[signal] = currentState;
      }
    }
  }, intervalMs);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get the circuit breaker for a specific signal type.
 */
export function getSignalCircuitBreaker(signal: TelemetrySignal): TelemetryCircuitBreaker {
  return signalCircuitBreakers[signal];
}

/**
 * Check if a specific signal can execute (circuit breaker allows).
 */
export function canExecuteSignal(signal: TelemetrySignal): boolean {
  return signalCircuitBreakers[signal].canExecute();
}

/**
 * Record a successful operation for a signal.
 */
export function recordSignalSuccess(signal: TelemetrySignal): void {
  signalCircuitBreakers[signal].recordSuccess();
}

/**
 * Record a failed operation for a signal.
 */
export function recordSignalFailure(signal: TelemetrySignal): void {
  signalCircuitBreakers[signal].recordFailure();
}

/**
 * Get stats for a specific signal circuit breaker.
 */
export function getSignalStats(signal: TelemetrySignal): SignalCircuitBreakerStats {
  const breaker = signalCircuitBreakers[signal];
  const stats = breaker.getStats();
  const health = breaker.getHealthStatus();

  return {
    signal,
    state: stats.state,
    failures: stats.failures,
    successes: stats.successes,
    lastFailureTime: stats.lastFailureTime,
    lastSuccessTime: stats.lastSuccessTime,
    totalAttempts: stats.totalAttempts,
    totalFailures: stats.totalFailures,
    totalSuccesses: stats.totalSuccesses,
    canExecute: health.canExecute,
    successRate: health.successRate,
  };
}

/**
 * Get comprehensive status of all telemetry circuit breakers.
 */
export function getTelemetryCircuitBreakersStatus(): TelemetryCircuitBreakersStatus {
  const signals: TelemetrySignal[] = ["traces", "metrics", "logs"];
  const signalStats: Record<TelemetrySignal, SignalCircuitBreakerStats> = {} as Record<
    TelemetrySignal,
    SignalCircuitBreakerStats
  >;

  let closedCount = 0;
  let openCount = 0;
  let halfOpenCount = 0;

  for (const signal of signals) {
    const stats = getSignalStats(signal);
    signalStats[signal] = stats;

    switch (stats.state) {
      case CircuitBreakerState.CLOSED:
        closedCount++;
        break;
      case CircuitBreakerState.OPEN:
        openCount++;
        break;
      case CircuitBreakerState.HALF_OPEN:
        halfOpenCount++;
        break;
    }
  }

  // Determine overall status
  // Per monitoring-updated.md:
  // - healthy: All closed
  // - degraded: Some half-open
  // - critical: Any open
  let status: "healthy" | "degraded" | "critical";
  if (openCount > 0) {
    status = "critical";
  } else if (halfOpenCount > 0) {
    status = "degraded";
  } else {
    status = "healthy";
  }

  return {
    status,
    summary: {
      total: signals.length,
      closed: closedCount,
      open: openCount,
      halfOpen: halfOpenCount,
    },
    signals: signalStats,
  };
}

/**
 * Reset all circuit breakers to closed state.
 */
export function resetAllCircuitBreakers(): void {
  for (const signal of Object.keys(signalCircuitBreakers) as TelemetrySignal[]) {
    signalCircuitBreakers[signal].reset();
    previousStates[signal] = CircuitBreakerState.CLOSED;
  }
}

/**
 * Initialize telemetry circuit breakers with optional custom config.
 */
export function initializeTelemetryCircuitBreakers(config?: Partial<CircuitBreakerConfig>): void {
  const finalConfig = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };

  // Re-create circuit breakers with new config
  signalCircuitBreakers.traces = new TelemetryCircuitBreaker(finalConfig);
  signalCircuitBreakers.metrics = new TelemetryCircuitBreaker(finalConfig);
  signalCircuitBreakers.logs = new TelemetryCircuitBreaker(finalConfig);

  // Reset previous states
  previousStates = {
    traces: CircuitBreakerState.CLOSED,
    metrics: CircuitBreakerState.CLOSED,
    logs: CircuitBreakerState.CLOSED,
  };

  // Start state monitoring
  startStateMonitoring();
}

/**
 * Shutdown telemetry circuit breakers.
 * Cleans up intervals and resets state.
 */
export function shutdownTelemetryCircuitBreakers(): void {
  if (stateCheckInterval) {
    clearInterval(stateCheckInterval);
    stateCheckInterval = null;
  }

  // Log final state for observability
  const status = getTelemetryCircuitBreakersStatus();
  console.info("Telemetry circuit breakers shutdown", {
    component: "telemetry-circuit-breaker",
    operation: "shutdown",
    finalStatus: status.status,
    summary: status.summary,
  });
}

// ============================================================================
// Convenience Exports
// ============================================================================

export type { CircuitBreakerConfig, CircuitBreakerStats } from "./health/CircuitBreaker";
// Re-export types and enums from CircuitBreaker
export { CircuitBreakerState, TelemetryCircuitBreaker } from "./health/CircuitBreaker";

// Export individual breakers for direct access if needed
export const traceCircuitBreaker = signalCircuitBreakers.traces;
export const metricCircuitBreaker = signalCircuitBreakers.metrics;
export const logCircuitBreaker = signalCircuitBreakers.logs;
