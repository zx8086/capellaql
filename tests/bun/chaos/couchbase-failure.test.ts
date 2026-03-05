/* tests/bun/chaos/couchbase-failure.test.ts */
import { describe, expect, test, beforeEach } from "bun:test";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
} from "../../../src/lib/couchbase/circuit-breaker";

describe("Chaos: Couchbase Failure Scenarios", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 100,
      monitoringPeriod: 1000,
    });
  });

  describe("Circuit Breaker Transitions", () => {
    test("transitions from closed to open after consecutive failures", async () => {
      const failingOp = () => Promise.reject(new Error("Connection refused"));

      // Fail enough times to trip the breaker
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingOp);
        } catch {}
      }

      expect(breaker.getState()).toBe("open");
    });

    test("rejects requests immediately when open", async () => {
      const failingOp = () => Promise.reject(new Error("Connection refused"));

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingOp);
        } catch {}
      }

      expect(breaker.getState()).toBe("open");

      try {
        await breaker.execute(() => Promise.resolve("should not execute"));
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerOpenError);
      }
    });

    test("uses fallback when circuit is open", async () => {
      const failingOp = () => Promise.reject(new Error("Connection refused"));

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingOp);
        } catch {}
      }

      const result = await breaker.execute(failingOp, () =>
        Promise.resolve("fallback-data"),
      );

      expect(result).toBe("fallback-data");
    });

    test("transitions to half-open after timeout", async () => {
      const failingOp = () => Promise.reject(new Error("Connection refused"));

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingOp);
        } catch {}
      }

      expect(breaker.getState()).toBe("open");

      // Wait for timeout
      await new Promise((r) => setTimeout(r, 150));

      expect(breaker.getState()).toBe("half-open");
    });

    test("recovers from half-open to closed after successes", async () => {
      const failingOp = () => Promise.reject(new Error("Connection refused"));

      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingOp);
        } catch {}
      }

      // Wait for timeout
      await new Promise((r) => setTimeout(r, 150));

      // Succeed enough times
      for (let i = 0; i < 2; i++) {
        await breaker.execute(() => Promise.resolve("ok"));
      }

      expect(breaker.getState()).toBe("closed");
    });

    test("returns to open from half-open on failure", async () => {
      const failingOp = () => Promise.reject(new Error("Connection refused"));

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingOp);
        } catch {}
      }

      await new Promise((r) => setTimeout(r, 150));
      expect(breaker.getState()).toBe("half-open");

      // Fail in half-open
      try {
        await breaker.execute(failingOp);
      } catch {}

      expect(breaker.getState()).toBe("open");
    });
  });

  describe("Concurrent Request Handling", () => {
    test("handles parallel requests during state transition", async () => {
      const failingOp = () => Promise.reject(new Error("Connection refused"));

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingOp);
        } catch {}
      }

      // Fire multiple requests simultaneously when open
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          breaker.execute(() => Promise.resolve("data")),
        ),
      );

      const rejected = results.filter((r) => r.status === "rejected");
      expect(rejected.length).toBe(10);
    });

    test("parallel requests in half-open state are serialized correctly", async () => {
      const failingOp = () => Promise.reject(new Error("Connection refused"));

      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingOp);
        } catch {}
      }

      // Wait for half-open
      await new Promise((r) => setTimeout(r, 150));
      expect(breaker.getState()).toBe("half-open");

      // Launch parallel successes in half-open state
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          breaker.execute(() => Promise.resolve("ok")),
        ),
      );

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled.length).toBeGreaterThan(0);
    });
  });

  describe("Stats Tracking", () => {
    test("tracks operation statistics accurately", async () => {
      await breaker.execute(() => Promise.resolve("ok"));
      await breaker.execute(() => Promise.resolve("ok"));
      try {
        await breaker.execute(() => Promise.reject(new Error("fail")));
      } catch {}

      const stats = breaker.getStats();
      expect(stats.totalOperations).toBe(3);
      expect(stats.failures).toBe(1);
    });

    test("reports healthy when closed", () => {
      expect(breaker.isHealthy()).toBe(true);
      expect(breaker.getStats().isHealthy).toBe(true);
    });

    test("reports unhealthy when open", async () => {
      const failingOp = () => Promise.reject(new Error("fail"));

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingOp);
        } catch {}
      }

      expect(breaker.isHealthy()).toBe(false);
      expect(breaker.getStats().isHealthy).toBe(false);
      expect(breaker.getStats().state).toBe("open");
    });

    test("calculates error rate correctly", async () => {
      // 2 successes, 1 failure = ~33% error rate
      await breaker.execute(() => Promise.resolve("ok"));
      await breaker.execute(() => Promise.resolve("ok"));
      try {
        await breaker.execute(() => Promise.reject(new Error("fail")));
      } catch {}

      const stats = breaker.getStats();
      expect(stats.errorRate).toBeGreaterThan(0);
      expect(stats.successRate).toBeLessThan(100);
    });
  });

  describe("Manual Controls", () => {
    test("reset returns to closed state", async () => {
      const failingOp = () => Promise.reject(new Error("fail"));

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingOp);
        } catch {}
      }

      expect(breaker.getState()).toBe("open");

      breaker.reset();
      expect(breaker.getState()).toBe("closed");
      expect(breaker.isHealthy()).toBe(true);
    });

    test("forceOpen immediately opens the circuit", () => {
      expect(breaker.getState()).toBe("closed");

      breaker.forceOpen("maintenance window");
      expect(breaker.getState()).toBe("open");
      expect(breaker.isHealthy()).toBe(false);
    });

    test("forceOpen then timeout transitions to half-open", async () => {
      breaker.forceOpen("testing");
      expect(breaker.getState()).toBe("open");

      await new Promise((r) => setTimeout(r, 150));
      expect(breaker.getState()).toBe("half-open");
    });
  });
});
