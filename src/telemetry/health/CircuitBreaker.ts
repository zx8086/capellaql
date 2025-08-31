/* src/telemetry/health/CircuitBreaker.ts */

export enum CircuitBreakerState {
  CLOSED = "CLOSED", // Normal operation
  OPEN = "OPEN", // Failing, blocking requests
  HALF_OPEN = "HALF_OPEN", // Testing if service recovered
}

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening (default: 5)
  recoveryTimeoutMs: number; // Time to wait before trying HALF_OPEN (default: 60000)
  successThreshold: number; // Successes needed in HALF_OPEN to close (default: 3)
  timeWindowMs: number; // Time window for failure counting (default: 60000)
}

export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalAttempts: number;
  totalFailures: number;
  totalSuccesses: number;
}

export class TelemetryCircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private totalAttempts: number = 0;
  private totalFailures: number = 0;
  private totalSuccesses: number = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      recoveryTimeoutMs: config.recoveryTimeoutMs ?? 60000, // 1 minute
      successThreshold: config.successThreshold ?? 3,
      timeWindowMs: config.timeWindowMs ?? 60000, // 1 minute
    };
  }

  public canExecute(): boolean {
    this.totalAttempts++;

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        return true;

      case CircuitBreakerState.OPEN:
        if (this.shouldAttemptReset()) {
          this.state = CircuitBreakerState.HALF_OPEN;
          this.successes = 0;
          return true;
        }
        return false;

      case CircuitBreakerState.HALF_OPEN:
        return true;

      default:
        return false;
    }
  }

  public recordSuccess(): void {
    this.lastSuccessTime = Date.now();
    this.totalSuccesses++;

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        this.resetFailures();
        break;

      case CircuitBreakerState.HALF_OPEN:
        this.successes++;
        if (this.successes >= this.config.successThreshold) {
          this.state = CircuitBreakerState.CLOSED;
          this.resetFailures();
        }
        break;
    }
  }

  public recordFailure(): void {
    this.lastFailureTime = Date.now();
    this.failures++;
    this.totalFailures++;

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        if (this.failures >= this.config.failureThreshold) {
          this.state = CircuitBreakerState.OPEN;
        }
        break;

      case CircuitBreakerState.HALF_OPEN:
        this.state = CircuitBreakerState.OPEN;
        break;
    }
  }

  public getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalAttempts: this.totalAttempts,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
    };
  }

  public getHealthStatus(): {
    isHealthy: boolean;
    successRate: number;
    state: CircuitBreakerState;
    canExecute: boolean;
  } {
    const successRate = this.totalAttempts > 0 ? (this.totalSuccesses / this.totalAttempts) * 100 : 0;

    return {
      isHealthy: this.state === CircuitBreakerState.CLOSED,
      successRate: Math.round(successRate * 100) / 100, // Round to 2 decimals
      state: this.state,
      canExecute: this.canExecute(),
    };
  }

  public reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.resetFailures();
    this.successes = 0;
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;
    return Date.now() - this.lastFailureTime >= this.config.recoveryTimeoutMs;
  }

  private resetFailures(): void {
    this.failures = 0;
  }
}
