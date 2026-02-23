/* src/lib/couchbase/circuit-breaker.ts */

/**
 * Circuit Breaker Module
 * Implements the circuit breaker pattern for fail-fast behavior and resilience.
 *
 * States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Failing fast, rejecting all requests (after threshold failures)
 * - HALF-OPEN: Testing recovery, allowing limited requests
 *
 * Thresholds:
 * - failureThreshold: 5 failures → OPEN
 * - successThreshold: 3 successes in HALF-OPEN → CLOSED
 * - timeout: 60s before transitioning from OPEN → HALF-OPEN
 */

import type { CircuitBreakerStats } from "./types";
import {
  DocumentNotFoundError,
  DocumentExistsError,
  CasMismatchError,
  DocumentLockedError,
  PathNotFoundError,
  PathExistsError,
  ParsingFailureError,
} from "./errors";

// =============================================================================
// CONFIGURATION INTERFACE
// =============================================================================

export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** Number of successes in half-open state before closing */
  successThreshold: number;
  /** Time in ms before transitioning from OPEN to HALF-OPEN */
  timeout: number;
  /** Monitoring period for calculating error rates */
  monitoringPeriod: number;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 60000, // 60 seconds
  monitoringPeriod: 120000, // 2 minutes
};

// =============================================================================
// CIRCUIT BREAKER CLASS
// =============================================================================

/**
 * Circuit breaker for fail-fast behavior and automatic recovery.
 *
 * Usage:
 * ```typescript
 * const breaker = new CircuitBreaker({ failureThreshold: 5, ... });
 *
 * try {
 *   const result = await breaker.execute(
 *     async () => await riskyOperation(),
 *     async () => fallbackValue // optional fallback
 *   );
 * } catch (error) {
 *   // Circuit is open or operation failed
 * }
 * ```
 */
export class CircuitBreaker {
  private state: "closed" | "open" | "half-open" = "closed";
  private failures = 0;
  private successes = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private nextAttemptTime: number | null = null;
  private totalOperations = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  /**
   * Execute an operation through the circuit breaker.
   *
   * @param operation - The async operation to execute
   * @param fallback - Optional fallback if circuit is open
   * @returns The operation result or fallback value
   * @throws Error if circuit is open and no fallback provided
   */
  async execute<T>(operation: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    this.totalOperations++;

    // Check if circuit is open
    if (this.state === "open") {
      const now = Date.now();

      // Check if we should transition to half-open
      if (this.nextAttemptTime && now >= this.nextAttemptTime) {
        this.transitionToHalfOpen();
      } else {
        // Circuit is still open
        if (fallback) {
          return await fallback();
        }
        throw new CircuitBreakerOpenError(
          `Circuit breaker is OPEN - failing fast. Next attempt at ${new Date(this.nextAttemptTime!).toISOString()}`
        );
      }
    }

    // Execute the operation
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      // Only count connection/service errors as circuit breaker failures
      // Application-level errors (document not found, CAS mismatch, etc.) should NOT trip the breaker
      if (this.isConnectionError(error)) {
        this.onFailure();
      }
      throw error;
    }
  }

  /**
   * Check if an error is a connection/service error that should trip the circuit breaker.
   * Application-level errors (document not found, CAS mismatch, parsing errors) should NOT trip it.
   */
  private isConnectionError(error: unknown): boolean {
    // These are application-level errors - the connection is fine
    if (
      error instanceof DocumentNotFoundError ||
      error instanceof DocumentExistsError ||
      error instanceof CasMismatchError ||
      error instanceof DocumentLockedError ||
      error instanceof PathNotFoundError ||
      error instanceof PathExistsError ||
      error instanceof ParsingFailureError
    ) {
      return false;
    }

    // All other Couchbase errors are considered connection/service failures
    return true;
  }

  /**
   * Record a successful operation.
   */
  private onSuccess(): void {
    this.lastSuccessTime = Date.now();
    this.failures = 0;

    if (this.state === "half-open") {
      this.successes++;

      if (this.successes >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    }
  }

  /**
   * Record a failed operation.
   */
  private onFailure(): void {
    this.lastFailureTime = Date.now();

    // Don't count failures or transition if already open
    // This prevents race conditions with parallel requests
    if (this.state === "open") {
      return;
    }

    this.failures++;

    if (this.state === "half-open") {
      // Any failure in half-open state immediately opens the circuit
      this.transitionToOpen();
    } else if (this.failures >= this.config.failureThreshold) {
      this.transitionToOpen();
    }
  }

  /**
   * Transition to OPEN state.
   */
  private transitionToOpen(): void {
    this.state = "open";
    this.nextAttemptTime = Date.now() + this.config.timeout;

    console.warn(
      `[CircuitBreaker] Circuit OPENED after ${this.failures} failures. ` +
        `Will retry at ${new Date(this.nextAttemptTime).toISOString()}`
    );
  }

  /**
   * Transition to HALF-OPEN state.
   */
  private transitionToHalfOpen(): void {
    this.state = "half-open";
    this.successes = 0;

    console.log("[CircuitBreaker] Transitioning to HALF-OPEN state - testing recovery");
  }

  /**
   * Transition to CLOSED state.
   */
  private transitionToClosed(): void {
    this.state = "closed";
    this.failures = 0;
    this.successes = 0;
    this.nextAttemptTime = null;

    console.log("[CircuitBreaker] Circuit CLOSED after successful recovery");
  }

  /**
   * Get the current circuit state.
   */
  getState(): "closed" | "open" | "half-open" {
    // Check for automatic transition to half-open
    if (this.state === "open" && this.nextAttemptTime && Date.now() >= this.nextAttemptTime) {
      this.transitionToHalfOpen();
    }
    return this.state;
  }

  /**
   * Get detailed statistics about the circuit breaker.
   */
  getStats(): CircuitBreakerStats {
    const errorRate = this.totalOperations > 0 ? (this.failures / this.totalOperations) * 100 : 0;

    return {
      state: this.getState(),
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextAttemptTime: this.nextAttemptTime,
      isHealthy: this.state === "closed",
      successRate: this.totalOperations > 0 ? 100 - errorRate : 100,
      totalOperations: this.totalOperations,
      errorRate,
    };
  }

  /**
   * Check if the circuit breaker is healthy (closed).
   */
  isHealthy(): boolean {
    return this.getState() === "closed";
  }

  /**
   * Manually reset the circuit breaker to closed state.
   * Use with caution - typically for administrative recovery.
   */
  reset(): void {
    this.state = "closed";
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;

    console.log("[CircuitBreaker] Manually reset to CLOSED state");
  }

  /**
   * Force the circuit breaker to open state.
   * Useful for maintenance windows or known issues.
   */
  forceOpen(reason?: string): void {
    this.state = "open";
    this.nextAttemptTime = Date.now() + this.config.timeout;

    console.warn(`[CircuitBreaker] Forced OPEN${reason ? `: ${reason}` : ""}`);
  }
}

// =============================================================================
// CIRCUIT BREAKER ERROR
// =============================================================================

/**
 * Error thrown when the circuit breaker is open and no fallback is provided.
 */
export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitBreakerOpenError";
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a circuit breaker with Couchbase-optimized defaults.
 */
export function createCouchbaseCircuitBreaker(
  overrides?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  return new CircuitBreaker({
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 60000,
    monitoringPeriod: 120000,
    ...overrides,
  });
}
