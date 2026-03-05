/* tests/bun/chaos/network-partition.test.ts */
import { describe, expect, test } from "bun:test";
import { CircuitBreaker } from "../../../src/lib/couchbase/circuit-breaker";
import { QueryCache } from "../../../src/lib/queryCache";

describe("Chaos: Network Partition Scenarios", () => {
  describe("Intermittent Failures", () => {
    test("circuit breaker handles flapping connections", async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 100,
        monitoringPeriod: 1000,
      });

      let callCount = 0;

      // Alternate between success and failure
      const flakyOp = () => {
        callCount++;
        if (callCount % 2 === 0) {
          return Promise.reject(new Error("Connection reset"));
        }
        return Promise.resolve("ok");
      };

      const results: string[] = [];
      for (let i = 0; i < 10; i++) {
        try {
          const result = await breaker.execute(flakyOp);
          results.push(result);
        } catch {
          results.push("error");
        }
      }

      // Should have some successes and some failures
      const successCount = results.filter((r) => r === "ok").length;
      expect(successCount).toBeGreaterThan(0);
    });

    test("cache + circuit breaker combo handles failures gracefully", async () => {
      const cache = new QueryCache({
        defaultTtl: 100,
        maxSize: 100,
        maxMemory: 1024 * 1024,
        cleanupInterval: 60000,
        staleTolerance: 5000,
      });

      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        successThreshold: 1,
        timeout: 100,
        monitoringPeriod: 1000,
      });

      // Prime cache through circuit breaker
      const result1 = await cache.getOrSet("data", () =>
        breaker.execute(() => Promise.resolve({ value: 42 })),
      );
      expect(result1).toEqual({ value: 42 });

      // Wait for cache to expire
      await new Promise((r) => setTimeout(r, 150));

      // Trip the circuit breaker
      const failOp = () => Promise.reject(new Error("Network partition"));
      try {
        await breaker.execute(failOp);
      } catch {}
      try {
        await breaker.execute(failOp);
      } catch {}

      // Cache should return stale data even with breaker open
      const result2 = await cache.getOrSet("data", () =>
        breaker.execute(() => Promise.resolve({ value: 99 })),
      );
      expect(result2).toEqual({ value: 42 }); // Stale data

      cache.destroy();
    });

    test("circuit breaker recovers after intermittent partition heals", async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 100,
        monitoringPeriod: 1000,
      });

      let networkDown = true;

      const networkOp = () => {
        if (networkDown) {
          return Promise.reject(new Error("Network unreachable"));
        }
        return Promise.resolve("connected");
      };

      // Phase 1: Network is down - trip the breaker
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(networkOp);
        } catch {}
      }
      expect(breaker.getState()).toBe("open");

      // Phase 2: Network recovers
      networkDown = false;

      // Wait for half-open window
      await new Promise((r) => setTimeout(r, 150));
      expect(breaker.getState()).toBe("half-open");

      // Phase 3: Successful recovery
      for (let i = 0; i < 2; i++) {
        await breaker.execute(networkOp);
      }
      expect(breaker.getState()).toBe("closed");
    });
  });

  describe("Timeout Scenarios", () => {
    test("slow operations complete successfully within timeout", async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        successThreshold: 1,
        timeout: 100,
        monitoringPeriod: 1000,
      });

      const slowOp = () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve("slow-result"), 50);
        });

      const result = await breaker.execute(slowOp);
      expect(result).toBe("slow-result");
      expect(breaker.getState()).toBe("closed");
    });

    test("multiple slow operations do not falsely trip the breaker", async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        successThreshold: 1,
        timeout: 100,
        monitoringPeriod: 1000,
      });

      const slowOp = () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve("ok"), 30);
        });

      // Run several slow operations
      const results = await Promise.all(
        Array.from({ length: 5 }, () => breaker.execute(slowOp)),
      );

      expect(results).toEqual(["ok", "ok", "ok", "ok", "ok"]);
      expect(breaker.getState()).toBe("closed");
    });
  });

  describe("Split Brain Scenarios", () => {
    test("stale cache bridges gap during breaker recovery cycle", async () => {
      const cache = new QueryCache({
        defaultTtl: 50,
        maxSize: 100,
        maxMemory: 1024 * 1024,
        cleanupInterval: 60000,
        staleTolerance: 5000,
      });

      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        successThreshold: 1,
        timeout: 100,
        monitoringPeriod: 1000,
      });

      // Prime cache
      await cache.getOrSet("config", () =>
        breaker.execute(() => Promise.resolve({ version: 1 })),
      );

      // Wait for cache to expire
      await new Promise((r) => setTimeout(r, 100));

      // Trip breaker
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(() =>
            Promise.reject(new Error("Partition detected")),
          );
        } catch {}
      }

      // Request during partition should get stale data
      const staleResult = await cache.getOrSet("config", () =>
        breaker.execute(() => Promise.resolve({ version: 2 })),
      );
      expect(staleResult).toEqual({ version: 1 });

      // Wait for breaker to half-open
      await new Promise((r) => setTimeout(r, 150));

      // After recovery, fresh data should flow through
      const freshResult = await cache.getOrSet(
        "config",
        () => breaker.execute(() => Promise.resolve({ version: 3 })),
        50,
      );
      expect(freshResult).toEqual({ version: 3 });

      cache.destroy();
    });
  });
});
