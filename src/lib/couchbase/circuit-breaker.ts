/* src/lib/couchbase/circuit-breaker.ts */

import { log, warn } from "../../telemetry/logger";
import {
  CasMismatchError,
  DocumentExistsError,
  DocumentLockedError,
  DocumentNotFoundError,
  ParsingFailureError,
  PathExistsError,
  PathNotFoundError,
} from "./errors";
import type { CircuitBreakerStats } from "./types";

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

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 60000, // 60 seconds
  monitoringPeriod: 120000, // 2 minutes
};

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

  // Application-level errors (document not found, CAS mismatch, parsing errors) should NOT trip the breaker
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

  private transitionToOpen(): void {
    this.state = "open";
    this.nextAttemptTime = Date.now() + this.config.timeout;

    warn("Circuit breaker OPENED", {
      component: "couchbase",
      operation: "circuit_breaker",
      state: "open",
      failures: this.failures,
      nextAttemptTime: new Date(this.nextAttemptTime).toISOString(),
    });
  }

  private transitionToHalfOpen(): void {
    this.state = "half-open";
    this.successes = 0;

    log("Circuit breaker transitioning to HALF-OPEN state - testing recovery", {
      component: "couchbase",
      operation: "circuit_breaker",
      state: "half-open",
    });
  }

  private transitionToClosed(): void {
    this.state = "closed";
    this.failures = 0;
    this.successes = 0;
    this.nextAttemptTime = null;

    log("Circuit breaker CLOSED after successful recovery", {
      component: "couchbase",
      operation: "circuit_breaker",
      state: "closed",
    });
  }

  getState(): "closed" | "open" | "half-open" {
    // Check for automatic transition to half-open
    if (this.state === "open" && this.nextAttemptTime && Date.now() >= this.nextAttemptTime) {
      this.transitionToHalfOpen();
    }
    return this.state;
  }

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

  isHealthy(): boolean {
    return this.getState() === "closed";
  }

  reset(): void {
    this.state = "closed";
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;

    log("Circuit breaker manually reset to CLOSED state", {
      component: "couchbase",
      operation: "circuit_breaker",
      state: "closed",
      action: "manual_reset",
    });
  }

  forceOpen(reason?: string): void {
    this.state = "open";
    this.nextAttemptTime = Date.now() + this.config.timeout;

    warn("Circuit breaker forced OPEN", {
      component: "couchbase",
      operation: "circuit_breaker",
      state: "open",
      action: "force_open",
      reason: reason || "no reason provided",
    });
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitBreakerOpenError";
  }
}

export function createCouchbaseCircuitBreaker(overrides?: Partial<CircuitBreakerConfig>): CircuitBreaker {
  return new CircuitBreaker({
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 60000,
    monitoringPeriod: 120000,
    ...overrides,
  });
}
