/* tests/bun/chaos/cache-failure.test.ts */
import { describe, expect, test, afterEach } from "bun:test";
import { QueryCache } from "../../../src/lib/queryCache";

describe("Chaos: Cache Failure Scenarios", () => {
  let cache: QueryCache;

  afterEach(() => {
    cache?.destroy();
  });

  describe("Stale Fallback", () => {
    test("serves stale data when fetcher fails", async () => {
      cache = new QueryCache({
        defaultTtl: 50,
        maxSize: 100,
        maxMemory: 1024 * 1024,
        cleanupInterval: 60000,
        staleTolerance: 5000,
      });

      // Prime the cache
      await cache.getOrSet(
        "key1",
        () => Promise.resolve({ data: "original" }),
        50,
      );

      // Wait for primary TTL to expire
      await new Promise((r) => setTimeout(r, 100));

      // Fetcher fails - should get stale data
      const result = await cache.getOrSet<{ data: string }>(
        "key1",
        () => Promise.reject(new Error("DB down")),
        50,
      );

      expect(result).toEqual({ data: "original" });
      expect(cache.getStats().staleHits).toBe(1);
    });

    test("throws when fetcher fails and no stale data exists", async () => {
      cache = new QueryCache({
        defaultTtl: 50,
        maxSize: 100,
        maxMemory: 1024 * 1024,
        cleanupInterval: 60000,
        staleTolerance: 5000,
      });

      try {
        await cache.getOrSet(
          "new-key",
          () => Promise.reject(new Error("DB down")),
          50,
        );
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect((error as Error).message).toBe("DB down");
      }
    });

    test("stale data expires after staleTolerance", async () => {
      cache = new QueryCache({
        defaultTtl: 50,
        maxSize: 100,
        maxMemory: 1024 * 1024,
        cleanupInterval: 60000,
        staleTolerance: 80,
      });

      // Prime cache
      await cache.getOrSet("key1", () => Promise.resolve("data"), 50);

      // Wait for primary TTL to expire
      await new Promise((r) => setTimeout(r, 80));

      // Trigger move to stale cache by accessing the expired entry.
      // This call fails the fetcher, but stale data is still within tolerance
      // so we get the stale value back.
      const staleResult = await cache.getOrSet<string>(
        "key1",
        () => Promise.reject(new Error("DB down")),
        50,
      );
      expect(staleResult).toBe("data");

      // Now wait for the stale tolerance to expire.
      // The stale entry was created during the above getOrSet call with
      // a fresh timestamp and staleTolerance (80ms) as its TTL.
      await new Promise((r) => setTimeout(r, 120));

      // Should throw since stale data has now also expired
      try {
        await cache.getOrSet(
          "key1",
          () => Promise.reject(new Error("DB down")),
          50,
        );
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect((error as Error).message).toBe("DB down");
      }
    });

    test("fresh data replaces stale data", async () => {
      cache = new QueryCache({
        defaultTtl: 50,
        maxSize: 100,
        maxMemory: 1024 * 1024,
        cleanupInterval: 60000,
        staleTolerance: 5000,
      });

      // Prime
      await cache.getOrSet("key1", () => Promise.resolve("v1"), 50);

      // Expire
      await new Promise((r) => setTimeout(r, 100));

      // Get fresh data
      const result = await cache.getOrSet(
        "key1",
        () => Promise.resolve("v2"),
        50,
      );
      expect(result).toBe("v2");

      // Verify stale cache was cleaned (staleHits should be 0 since fresh data was returned)
      expect(cache.getStats().staleHits).toBe(0);
    });

    test("multiple stale fallbacks track stats correctly", async () => {
      cache = new QueryCache({
        defaultTtl: 50,
        maxSize: 100,
        maxMemory: 1024 * 1024,
        cleanupInterval: 60000,
        staleTolerance: 5000,
      });

      // Prime multiple keys
      await cache.getOrSet("a", () => Promise.resolve("data-a"), 50);
      await cache.getOrSet("b", () => Promise.resolve("data-b"), 50);

      // Wait for TTL expiry
      await new Promise((r) => setTimeout(r, 100));

      // Both should serve stale on failure
      const resultA = await cache.getOrSet<string>(
        "a",
        () => Promise.reject(new Error("fail")),
        50,
      );
      const resultB = await cache.getOrSet<string>(
        "b",
        () => Promise.reject(new Error("fail")),
        50,
      );

      expect(resultA).toBe("data-a");
      expect(resultB).toBe("data-b");
      expect(cache.getStats().staleHits).toBe(2);
    });
  });

  describe("Memory Limits", () => {
    test("evicts entries when maxSize is reached", () => {
      cache = new QueryCache({
        defaultTtl: 60000,
        maxSize: 3,
        maxMemory: 10 * 1024 * 1024,
        cleanupInterval: 60000,
        staleTolerance: 60000,
      });

      cache.set("a", "1");
      cache.set("b", "2");
      cache.set("c", "3");
      cache.set("d", "4"); // Should evict oldest entry

      const stats = cache.getStats();
      expect(stats.size).toBeLessThanOrEqual(3);
      expect(stats.evictions).toBeGreaterThan(0);
    });

    test("evicts by memory when maxMemory exceeded", () => {
      cache = new QueryCache({
        defaultTtl: 60000,
        maxSize: 1000,
        maxMemory: 100, // Very small
        cleanupInterval: 60000,
        staleTolerance: 60000,
      });

      cache.set("big", "x".repeat(200));
      cache.set("bigger", "y".repeat(200));

      expect(cache.getStats().evictions).toBeGreaterThan(0);
    });

    test("LRU eviction removes least recently used first", () => {
      cache = new QueryCache({
        defaultTtl: 60000,
        maxSize: 3,
        maxMemory: 10 * 1024 * 1024,
        cleanupInterval: 60000,
        staleTolerance: 60000,
      });

      cache.set("a", "1");
      cache.set("b", "2");
      cache.set("c", "3");

      // Access "a" to make it recently used
      cache.get("a");

      // Adding "d" should evict "b" (least recently used), not "a"
      cache.set("d", "4");

      // "a" should still be accessible since it was recently used
      const aValue = cache.get("a");
      expect(aValue).toBe("1");
    });
  });

  describe("Cache Invalidation", () => {
    test("pattern invalidation removes matching entries", () => {
      cache = new QueryCache({
        defaultTtl: 60000,
        maxSize: 100,
        maxMemory: 10 * 1024 * 1024,
        cleanupInterval: 60000,
        staleTolerance: 60000,
      });

      cache.set("user:1", "alice");
      cache.set("user:2", "bob");
      cache.set("product:1", "widget");

      const invalidated = cache.invalidatePattern(/^user:/);
      expect(invalidated).toBe(2);

      expect(cache.get("user:1")).toBeUndefined();
      expect(cache.get("user:2")).toBeUndefined();
      expect(cache.get<string>("product:1")).toBe("widget");
    });

    test("clear removes all entries but preserves cumulative stats", () => {
      cache = new QueryCache({
        defaultTtl: 60000,
        maxSize: 100,
        maxMemory: 10 * 1024 * 1024,
        cleanupInterval: 60000,
        staleTolerance: 60000,
      });

      cache.set("a", "1");
      cache.set("b", "2");

      // Access to generate hits
      cache.get("a");

      const statsBefore = cache.getStats();
      expect(statsBefore.hits).toBeGreaterThan(0);

      cache.clear();

      const statsAfter = cache.getStats();
      expect(statsAfter.size).toBe(0);
      expect(statsAfter.memoryUsage).toBe(0);
      // Cumulative stats (hits, misses) are preserved
      expect(statsAfter.hits).toBe(statsBefore.hits);
    });
  });
});
