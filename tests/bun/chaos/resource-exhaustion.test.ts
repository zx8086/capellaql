/* tests/bun/chaos/resource-exhaustion.test.ts */
import { describe, expect, test } from "bun:test";
import {
  memoryGuardian,
  type MemoryStatus,
} from "../../../src/lib/memoryGuardian";
import { QueryCache } from "../../../src/lib/queryCache";

describe("Chaos: Resource Exhaustion Scenarios", () => {
  describe("Memory Pressure Detection", () => {
    test("memory guardian reports current status", () => {
      const status: MemoryStatus = memoryGuardian.getStatus();

      expect(status).toHaveProperty("pressureLevel");
      expect(status).toHaveProperty("heapUsedMB");
      expect(status).toHaveProperty("heapTotalMB");
      expect(status).toHaveProperty("rssMB");
      expect(status).toHaveProperty("heapUsageRatio");
      expect(status).toHaveProperty("timestamp");

      // Pressure level should be one of the valid levels
      expect(["normal", "elevated", "high", "critical"]).toContain(
        status.pressureLevel,
      );
      expect(status.heapUsedMB).toBeGreaterThan(0);
      expect(status.heapUsageRatio).toBeGreaterThan(0);
      // Note: In Bun/JSC, heapUsed can briefly exceed heapTotal during GC,
      // so we use a generous upper bound instead of strict <= 1
      expect(status.heapUsageRatio).toBeLessThan(2);
    });

    test("shouldAcceptRequest reflects current pressure level", () => {
      const status = memoryGuardian.getStatus();
      const shouldAccept = memoryGuardian.shouldAcceptRequest();

      // shouldAcceptRequest returns false only at critical pressure
      if (status.pressureLevel === "critical") {
        expect(shouldAccept).toBe(false);
      } else {
        expect(shouldAccept).toBe(true);
      }
    });

    test("getRetryAfter returns appropriate value", () => {
      const retryAfter = memoryGuardian.getRetryAfter();
      expect(retryAfter).toBeGreaterThanOrEqual(5);
    });

    test("status timestamp is recent", () => {
      const status = memoryGuardian.getStatus();
      const now = Date.now();
      // Timestamp should be within the last 10 seconds
      expect(now - status.timestamp).toBeLessThan(10000);
    });

    test("memory values are physically reasonable", () => {
      const status = memoryGuardian.getStatus();

      // Both heap values should be positive
      expect(status.heapUsedMB).toBeGreaterThan(0);
      expect(status.heapTotalMB).toBeGreaterThan(0);

      // RSS should be greater than zero
      expect(status.rssMB).toBeGreaterThan(0);

      // heapUsageRatio should be positive. In Bun/JSC, heapUsed can briefly
      // exceed heapTotal during GC cycles, so we don't assert strict <= 1.
      expect(status.heapUsageRatio).toBeGreaterThan(0);
      expect(status.heapUsageRatio).toBeLessThan(2);
    });
  });

  describe("Large Payload Handling", () => {
    test("cache handles large payloads without crashing", () => {
      const cache = new QueryCache({
        defaultTtl: 60000,
        maxSize: 10,
        maxMemory: 1024, // 1KB max
        cleanupInterval: 60000,
        staleTolerance: 60000,
      });

      // Try to insert a large payload
      const largeData = { value: "x".repeat(10000) };
      cache.set("large", largeData);

      // Cache should still function (may have evicted to make room)
      const stats = cache.getStats();
      expect(stats.size).toBeLessThanOrEqual(10);

      cache.destroy();
    });

    test("cache handles rapid set/get cycles", () => {
      const cache = new QueryCache({
        defaultTtl: 60000,
        maxSize: 100,
        maxMemory: 10 * 1024 * 1024,
        cleanupInterval: 60000,
        staleTolerance: 60000,
      });

      // Rapid fire operations
      for (let i = 0; i < 1000; i++) {
        cache.set(`key-${i}`, { index: i, data: `value-${i}` });
      }

      const stats = cache.getStats();
      expect(stats.size).toBeLessThanOrEqual(100);
      expect(stats.evictions).toBeGreaterThan(0);

      // Verify we can still read recently-written entries
      const recent = cache.get("key-999");
      expect(recent).toBeDefined();

      cache.destroy();
    });

    test("cache correctly tracks memory under pressure", () => {
      const cache = new QueryCache({
        defaultTtl: 60000,
        maxSize: 1000,
        maxMemory: 500, // Very small memory limit
        cleanupInterval: 60000,
        staleTolerance: 60000,
      });

      // Insert several entries that individually exceed the memory limit
      for (let i = 0; i < 10; i++) {
        cache.set(`key-${i}`, "a".repeat(100));
      }

      const stats = cache.getStats();
      // Memory eviction should have occurred
      expect(stats.evictions).toBeGreaterThan(0);
      // memoryUsage tracking should remain non-negative
      expect(stats.memoryUsage).toBeGreaterThanOrEqual(0);

      cache.destroy();
    });
  });

  describe("Concurrent Access", () => {
    test("cache handles concurrent getOrSet operations", async () => {
      const cache = new QueryCache({
        defaultTtl: 60000,
        maxSize: 100,
        maxMemory: 10 * 1024 * 1024,
        cleanupInterval: 60000,
        staleTolerance: 60000,
      });

      let fetchCount = 0;
      const fetcher = async () => {
        fetchCount++;
        await new Promise((r) => setTimeout(r, 10));
        return { count: fetchCount };
      };

      // Launch many concurrent getOrSet for the same key
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          cache.getOrSet("shared-key", fetcher),
        ),
      );

      // All should get a result
      expect(results.every((r) => r.count >= 1)).toBe(true);

      cache.destroy();
    });

    test("concurrent getOrSet for different keys resolves independently", async () => {
      const cache = new QueryCache({
        defaultTtl: 60000,
        maxSize: 100,
        maxMemory: 10 * 1024 * 1024,
        cleanupInterval: 60000,
        staleTolerance: 60000,
      });

      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          cache.getOrSet(`key-${i}`, async () => {
            await new Promise((r) => setTimeout(r, 5));
            return { id: i };
          }),
        ),
      );

      // Each key should have its own unique value
      for (let i = 0; i < 10; i++) {
        expect(results[i]).toEqual({ id: i });
      }

      cache.destroy();
    });

    test("mixed read/write operations under contention", async () => {
      const cache = new QueryCache({
        defaultTtl: 60000,
        maxSize: 50,
        maxMemory: 10 * 1024 * 1024,
        cleanupInterval: 60000,
        staleTolerance: 60000,
      });

      // Seed some data
      for (let i = 0; i < 30; i++) {
        cache.set(`item-${i}`, { value: i });
      }

      // Mix of concurrent reads and writes
      const operations = Array.from({ length: 100 }, (_, i) => {
        if (i % 3 === 0) {
          // Write
          return Promise.resolve(cache.set(`item-${i % 50}`, { value: i }));
        }
        if (i % 3 === 1) {
          // Read
          return Promise.resolve(cache.get(`item-${i % 50}`));
        }
        // getOrSet
        return cache.getOrSet(`item-${i % 50}`, async () => ({ value: i }));
      });

      // All operations should complete without errors
      const results = await Promise.allSettled(operations);
      const failures = results.filter((r) => r.status === "rejected");
      expect(failures.length).toBe(0);

      // Cache should still be within bounds
      expect(cache.getStats().size).toBeLessThanOrEqual(50);

      cache.destroy();
    });
  });
});
