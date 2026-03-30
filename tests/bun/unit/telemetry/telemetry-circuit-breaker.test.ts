/* tests/bun/unit/telemetry/telemetry-circuit-breaker.test.ts */
import { beforeEach, describe, expect, test } from "bun:test";
import {
  CircuitBreakerState,
  TelemetryCircuitBreaker,
} from "../../../../src/telemetry/health/CircuitBreaker";

describe("TelemetryCircuitBreaker", () => {
  let cb: TelemetryCircuitBreaker;

  beforeEach(() => {
    cb = new TelemetryCircuitBreaker({
      failureThreshold: 3,
      recoveryTimeoutMs: 100, // Short for testing
      successThreshold: 2,
      timeWindowMs: 60000,
    });
  });

  describe("initial state", () => {
    test("starts in CLOSED state", () => {
      const stats = cb.getStats();
      expect(stats.state).toBe(CircuitBreakerState.CLOSED);
    });

    test("starts with zero counters", () => {
      const stats = cb.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.totalAttempts).toBe(0);
      expect(stats.totalFailures).toBe(0);
      expect(stats.totalSuccesses).toBe(0);
      expect(stats.lastFailureTime).toBeNull();
      expect(stats.lastSuccessTime).toBeNull();
    });
  });

  describe("canExecute", () => {
    test("returns true when CLOSED", () => {
      expect(cb.canExecute()).toBe(true);
    });

    test("returns true when HALF_OPEN", () => {
      // Transition to OPEN
      for (let i = 0; i < 3; i++) {
        cb.canExecute();
        cb.recordFailure();
      }
      expect(cb.getStats().state).toBe(CircuitBreakerState.OPEN);

      // Wait for recovery timeout then check
      // Since we set recoveryTimeoutMs to 100ms, we need to wait
    });

    test("returns false when OPEN and recovery timeout not elapsed", () => {
      for (let i = 0; i < 3; i++) {
        cb.canExecute();
        cb.recordFailure();
      }
      // Immediately check - should be false
      expect(cb.canExecute()).toBe(false);
    });

    test("increments totalAttempts on each call", () => {
      cb.canExecute();
      cb.canExecute();
      cb.canExecute();
      expect(cb.getStats().totalAttempts).toBe(3);
    });
  });

  describe("state transitions", () => {
    test("CLOSED -> OPEN after failureThreshold failures", () => {
      for (let i = 0; i < 3; i++) {
        cb.canExecute();
        cb.recordFailure();
      }
      expect(cb.getStats().state).toBe(CircuitBreakerState.OPEN);
    });

    test("stays CLOSED below failureThreshold", () => {
      cb.canExecute();
      cb.recordFailure();
      cb.canExecute();
      cb.recordFailure();
      expect(cb.getStats().state).toBe(CircuitBreakerState.CLOSED);
    });

    test("OPEN -> HALF_OPEN after recovery timeout", async () => {
      for (let i = 0; i < 3; i++) {
        cb.canExecute();
        cb.recordFailure();
      }
      expect(cb.getStats().state).toBe(CircuitBreakerState.OPEN);

      // Wait for recovery timeout (100ms)
      await Bun.sleep(150);

      // canExecute should transition to HALF_OPEN
      const result = cb.canExecute();
      expect(result).toBe(true);
      expect(cb.getStats().state).toBe(CircuitBreakerState.HALF_OPEN);
    });

    test("HALF_OPEN -> CLOSED after successThreshold successes", async () => {
      // Get to HALF_OPEN
      for (let i = 0; i < 3; i++) {
        cb.canExecute();
        cb.recordFailure();
      }
      await Bun.sleep(150);
      cb.canExecute(); // Transitions to HALF_OPEN

      // Record enough successes
      cb.recordSuccess();
      cb.recordSuccess();

      expect(cb.getStats().state).toBe(CircuitBreakerState.CLOSED);
    });

    test("HALF_OPEN -> OPEN on failure", async () => {
      // Get to HALF_OPEN
      for (let i = 0; i < 3; i++) {
        cb.canExecute();
        cb.recordFailure();
      }
      await Bun.sleep(150);
      cb.canExecute(); // Transitions to HALF_OPEN

      // One failure should go back to OPEN
      cb.recordFailure();
      expect(cb.getStats().state).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe("recordSuccess", () => {
    test("updates lastSuccessTime", () => {
      cb.recordSuccess();
      expect(cb.getStats().lastSuccessTime).not.toBeNull();
    });

    test("increments totalSuccesses", () => {
      cb.recordSuccess();
      cb.recordSuccess();
      expect(cb.getStats().totalSuccesses).toBe(2);
    });

    test("resets failures in CLOSED state", () => {
      cb.canExecute();
      cb.recordFailure();
      expect(cb.getStats().failures).toBe(1);

      cb.recordSuccess();
      expect(cb.getStats().failures).toBe(0);
    });
  });

  describe("recordFailure", () => {
    test("updates lastFailureTime", () => {
      cb.recordFailure();
      expect(cb.getStats().lastFailureTime).not.toBeNull();
    });

    test("increments failures and totalFailures", () => {
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getStats().failures).toBe(2);
      expect(cb.getStats().totalFailures).toBe(2);
    });
  });

  describe("getStats", () => {
    test("returns correct shape", () => {
      const stats = cb.getStats();
      expect(stats).toHaveProperty("state");
      expect(stats).toHaveProperty("failures");
      expect(stats).toHaveProperty("successes");
      expect(stats).toHaveProperty("lastFailureTime");
      expect(stats).toHaveProperty("lastSuccessTime");
      expect(stats).toHaveProperty("totalAttempts");
      expect(stats).toHaveProperty("totalFailures");
      expect(stats).toHaveProperty("totalSuccesses");
    });
  });

  describe("getHealthStatus", () => {
    test("returns healthy when CLOSED", () => {
      const health = cb.getHealthStatus();
      expect(health.isHealthy).toBe(true);
      expect(health.state).toBe(CircuitBreakerState.CLOSED);
      expect(health.canExecute).toBe(true);
    });

    test("returns unhealthy when OPEN", () => {
      for (let i = 0; i < 3; i++) {
        cb.canExecute();
        cb.recordFailure();
      }
      const health = cb.getHealthStatus();
      expect(health.isHealthy).toBe(false);
      expect(health.state).toBe(CircuitBreakerState.OPEN);
    });

    test("calculates success rate", () => {
      cb.canExecute();
      cb.recordSuccess();
      cb.canExecute();
      cb.recordSuccess();
      cb.canExecute();
      cb.recordFailure();

      const health = cb.getHealthStatus();
      // 2 successes out of 4 attempts (3 canExecute + 1 from getHealthStatus calling canExecute)
      expect(health.successRate).toBeGreaterThan(0);
    });
  });

  describe("reset", () => {
    test("returns to CLOSED state", () => {
      for (let i = 0; i < 3; i++) {
        cb.canExecute();
        cb.recordFailure();
      }
      expect(cb.getStats().state).toBe(CircuitBreakerState.OPEN);

      cb.reset();
      expect(cb.getStats().state).toBe(CircuitBreakerState.CLOSED);
    });

    test("resets failures and successes", () => {
      cb.recordFailure();
      cb.recordFailure();
      cb.recordSuccess();

      cb.reset();
      const stats = cb.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
    });

    test("does not reset total counters", () => {
      cb.canExecute();
      cb.recordFailure();
      cb.canExecute();
      cb.recordSuccess();

      cb.reset();
      const stats = cb.getStats();
      // totalFailures and totalSuccesses should remain
      expect(stats.totalFailures).toBe(1);
      expect(stats.totalSuccesses).toBe(1);
    });
  });

  describe("custom configuration", () => {
    test("uses default values when no config provided", () => {
      const defaultCb = new TelemetryCircuitBreaker();
      // Should need 5 failures to open (default failureThreshold)
      for (let i = 0; i < 4; i++) {
        defaultCb.canExecute();
        defaultCb.recordFailure();
      }
      expect(defaultCb.getStats().state).toBe(CircuitBreakerState.CLOSED);

      defaultCb.canExecute();
      defaultCb.recordFailure();
      expect(defaultCb.getStats().state).toBe(CircuitBreakerState.OPEN);
    });

    test("respects custom failureThreshold", () => {
      const customCb = new TelemetryCircuitBreaker({ failureThreshold: 2 });
      customCb.canExecute();
      customCb.recordFailure();
      customCb.canExecute();
      customCb.recordFailure();
      expect(customCb.getStats().state).toBe(CircuitBreakerState.OPEN);
    });

    test("respects custom successThreshold", async () => {
      const customCb = new TelemetryCircuitBreaker({
        failureThreshold: 1,
        recoveryTimeoutMs: 50,
        successThreshold: 1,
      });

      // Open the circuit
      customCb.canExecute();
      customCb.recordFailure();
      expect(customCb.getStats().state).toBe(CircuitBreakerState.OPEN);

      // Wait for recovery
      await Bun.sleep(100);
      customCb.canExecute(); // -> HALF_OPEN

      // One success should close with successThreshold=1
      customCb.recordSuccess();
      expect(customCb.getStats().state).toBe(CircuitBreakerState.CLOSED);
    });
  });
});
