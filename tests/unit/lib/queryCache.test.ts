/* tests/unit/lib/queryCache.test.ts - QueryCache Unit Tests */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// Mock telemetry logger
mock.module("../../../src/telemetry", () => ({
  log: mock(() => {}),
  err: mock(() => {}),
  debug: mock(() => {}),
  warn: mock(() => {}),
}));

// Import after mocking
import { CacheKeys, type CacheStats, QueryCache } from "../../../src/lib/queryCache";

describe("QueryCache", () => {
  let cache: QueryCache;

  beforeEach(() => {
    cache = new QueryCache({
      defaultTtl: 1000, // 1 second for faster tests
      maxSize: 10,
      maxMemory: 1024 * 1024, // 1MB
      cleanupInterval: 60000, // 1 minute
    });
  });

  afterEach(() => {
    cache.destroy(); // Clean up timers
  });

  describe("Basic Operations", () => {
    test("set and get value", () => {
      cache.set("test-key", { data: "test-value" });
      const result = cache.get("test-key");

      expect(result).toEqual({ data: "test-value" });
    });

    test("get returns undefined for missing key", () => {
      const result = cache.get("non-existent-key");
      expect(result).toBeUndefined();
    });

    test("has returns true for existing key", () => {
      cache.set("test-key", "value");
      expect(cache.has("test-key")).toBe(true);
    });

    test("has returns false for missing key", () => {
      expect(cache.has("non-existent-key")).toBe(false);
    });

    test("remove deletes entry", () => {
      cache.set("test-key", "value");
      expect(cache.has("test-key")).toBe(true);

      const removed = cache.remove("test-key");

      expect(removed).toBe(true);
      expect(cache.has("test-key")).toBe(false);
    });

    test("remove returns false for non-existent key", () => {
      const removed = cache.remove("non-existent-key");
      expect(removed).toBe(false);
    });

    test("clear removes all entries", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");
      cache.set("key3", "value3");

      cache.clear();

      expect(cache.has("key1")).toBe(false);
      expect(cache.has("key2")).toBe(false);
      expect(cache.has("key3")).toBe(false);

      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.memoryUsage).toBe(0);
    });
  });

  describe("TTL Expiration", () => {
    test("expired entries return undefined", async () => {
      const shortTtlCache = new QueryCache({
        defaultTtl: 50, // 50ms
        maxSize: 10,
        maxMemory: 1024 * 1024,
        cleanupInterval: 60000,
      });

      shortTtlCache.set("expire-key", "value", 50);

      // Immediately should return value
      expect(shortTtlCache.get("expire-key")).toBe("value");

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should now return undefined
      expect(shortTtlCache.get("expire-key")).toBeUndefined();

      shortTtlCache.destroy();
    });

    test("has returns false for expired entries", async () => {
      const shortTtlCache = new QueryCache({
        defaultTtl: 50,
        maxSize: 10,
        maxMemory: 1024 * 1024,
        cleanupInterval: 60000,
      });

      shortTtlCache.set("expire-key", "value", 50);
      expect(shortTtlCache.has("expire-key")).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(shortTtlCache.has("expire-key")).toBe(false);

      shortTtlCache.destroy();
    });
  });

  describe("getOrSet", () => {
    test("cache miss calls fetcher", async () => {
      const fetcher = mock(() => Promise.resolve({ data: "fetched-value" }));

      const result = await cache.getOrSet("new-key", fetcher);

      expect(result).toEqual({ data: "fetched-value" });
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    test("cache hit returns cached value without calling fetcher", async () => {
      cache.set("existing-key", { data: "cached-value" });
      const fetcher = mock(() => Promise.resolve({ data: "fetched-value" }));

      const result = await cache.getOrSet("existing-key", fetcher);

      expect(result).toEqual({ data: "cached-value" });
      expect(fetcher).not.toHaveBeenCalled();
    });

    test("fetcher error is propagated", async () => {
      const fetcher = mock(() => Promise.reject(new Error("Fetch failed")));

      await expect(cache.getOrSet("error-key", fetcher)).rejects.toThrow("Fetch failed");
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    test("cache miss with expired entry calls fetcher", async () => {
      const shortTtlCache = new QueryCache({
        defaultTtl: 50,
        maxSize: 10,
        maxMemory: 1024 * 1024,
        cleanupInterval: 60000,
      });

      shortTtlCache.set("expire-key", { data: "old-value" }, 50);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const fetcher = mock(() => Promise.resolve({ data: "new-value" }));
      const result = await shortTtlCache.getOrSet("expire-key", fetcher);

      expect(result).toEqual({ data: "new-value" });
      expect(fetcher).toHaveBeenCalledTimes(1);

      shortTtlCache.destroy();
    });

    test("custom TTL is respected", async () => {
      const fetcher = mock(() => Promise.resolve({ data: "value" }));

      await cache.getOrSet("custom-ttl-key", fetcher, 50); // 50ms TTL

      // Should be cached
      const result1 = await cache.getOrSet("custom-ttl-key", fetcher);
      expect(result1).toEqual({ data: "value" });
      expect(fetcher).toHaveBeenCalledTimes(1);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should re-fetch
      const result2 = await cache.getOrSet("custom-ttl-key", fetcher);
      expect(result2).toEqual({ data: "value" });
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });

  describe("Statistics", () => {
    test("getStats returns correct statistics", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");

      cache.get("key1"); // hit
      cache.get("key1"); // hit
      cache.get("non-existent"); // miss

      const stats = cache.getStats();

      expect(stats.size).toBe(2);
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });

    test("clear preserves hit/miss stats", () => {
      cache.set("key1", "value1");
      cache.get("key1"); // hit
      cache.get("missing"); // miss

      cache.clear();

      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(1); // Preserved
      expect(stats.misses).toBe(1); // Preserved
    });
  });

  describe("LRU Eviction", () => {
    test("evicts oldest entry when maxSize reached", () => {
      // Create cache with maxSize of 3
      const smallCache = new QueryCache({
        defaultTtl: 60000,
        maxSize: 3,
        maxMemory: 1024 * 1024,
        cleanupInterval: 60000,
      });

      smallCache.set("key1", "value1");
      smallCache.set("key2", "value2");
      smallCache.set("key3", "value3");

      // Access key1 to make it recently used
      smallCache.get("key1");

      // Add new entry - should evict key2 (least recently used)
      smallCache.set("key4", "value4");

      expect(smallCache.has("key1")).toBe(true); // Recently accessed
      expect(smallCache.has("key2")).toBe(false); // Evicted (LRU)
      expect(smallCache.has("key3")).toBe(true);
      expect(smallCache.has("key4")).toBe(true);

      const stats = smallCache.getStats();
      expect(stats.evictions).toBeGreaterThan(0);

      smallCache.destroy();
    });
  });

  describe("Memory-based Eviction", () => {
    test("evicts entries when memory limit exceeded", () => {
      // Create cache with small memory limit
      const smallMemoryCache = new QueryCache({
        defaultTtl: 60000,
        maxSize: 100,
        maxMemory: 100, // 100 bytes - very small
        cleanupInterval: 60000,
      });

      // Add entries that exceed memory limit
      smallMemoryCache.set("key1", "a".repeat(30));
      smallMemoryCache.set("key2", "b".repeat(30));
      smallMemoryCache.set("key3", "c".repeat(30));
      smallMemoryCache.set("key4", "d".repeat(30));

      // Some entries should have been evicted
      const stats = smallMemoryCache.getStats();
      expect(stats.evictions).toBeGreaterThan(0);

      smallMemoryCache.destroy();
    });
  });

  describe("Pattern Invalidation", () => {
    test("invalidatePattern removes matching entries", () => {
      cache.set("user:1:profile", { name: "User 1" });
      cache.set("user:1:settings", { theme: "dark" });
      cache.set("user:2:profile", { name: "User 2" });
      cache.set("product:1", { name: "Product 1" });

      const count = cache.invalidatePattern(/^user:1:/);

      expect(count).toBe(2);
      expect(cache.has("user:1:profile")).toBe(false);
      expect(cache.has("user:1:settings")).toBe(false);
      expect(cache.has("user:2:profile")).toBe(true);
      expect(cache.has("product:1")).toBe(true);
    });

    test("invalidatePattern returns 0 when no matches", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");

      const count = cache.invalidatePattern(/^nonexistent:/);

      expect(count).toBe(0);
      expect(cache.has("key1")).toBe(true);
      expect(cache.has("key2")).toBe(true);
    });
  });

  describe("Static createKey Method", () => {
    test("creates consistent keys regardless of parameter order", () => {
      const key1 = QueryCache.createKey("operation", { a: 1, b: 2, c: 3 });
      const key2 = QueryCache.createKey("operation", { c: 3, a: 1, b: 2 });

      expect(key1).toBe(key2);
    });

    test("includes collection in key when provided", () => {
      const key = QueryCache.createKey("operation", { id: 1 }, "myCollection");

      expect(key).toContain("myCollection");
      expect(key).toContain("operation");
    });

    test("uses 'default' when collection not provided", () => {
      const key = QueryCache.createKey("operation", { id: 1 });

      expect(key).toContain("default");
    });
  });

  describe("CacheKeys Helpers", () => {
    test("looks key generation", () => {
      const key = CacheKeys.looks("TH", "C52", "01");

      expect(key).toContain("looks");
      expect(key).toContain("TH");
      expect(key).toContain("C52");
      expect(key).toContain("01");
    });

    test("lookDetails key generation", () => {
      const key = CacheKeys.lookDetails("look-123");

      expect(key).toContain("lookDetails");
      expect(key).toContain("look-123");
    });

    test("options key generation", () => {
      const key = CacheKeys.options("look-123", { status: "active" });

      expect(key).toContain("options");
      expect(key).toContain("look-123");
      expect(key).toContain("active");
    });

    test("optionsSummary key generation", () => {
      const key = CacheKeys.optionsSummary("TH", "C52", "01");

      expect(key).toContain("optionsSummary");
      expect(key).toContain("TH");
      expect(key).toContain("C52");
      expect(key).toContain("01");
    });

    test("assignments key generation", () => {
      const key = CacheKeys.assignments("user-123", "pending");

      expect(key).toContain("assignments");
      expect(key).toContain("user-123");
      expect(key).toContain("pending");
    });
  });

  describe("Lifecycle", () => {
    test("destroy stops cleanup timer and clears cache", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");

      cache.destroy();

      const stats = cache.getStats();
      expect(stats.size).toBe(0);
    });
  });

  describe("Edge Cases", () => {
    test("handles null values", () => {
      cache.set("null-key", null);
      const result = cache.get("null-key");
      expect(result).toBeNull();
    });

    test("handles undefined values", () => {
      cache.set("undefined-key", undefined);
      // Note: undefined values may be treated as cache miss
      const result = cache.get("undefined-key");
      expect(result).toBeUndefined();
    });

    test("handles complex objects", () => {
      const complexObj = {
        nested: {
          array: [1, 2, 3],
          map: { a: 1, b: 2 },
        },
        date: new Date().toISOString(),
        number: 42,
        boolean: true,
      };

      cache.set("complex-key", complexObj);
      const result = cache.get("complex-key");

      expect(result).toEqual(complexObj);
    });

    test("handles empty string keys", () => {
      cache.set("", "empty-key-value");
      const result = cache.get("");
      expect(result).toBe("empty-key-value");
    });

    test("handles large values", () => {
      const largeValue = "x".repeat(10000);
      cache.set("large-key", largeValue);
      const result = cache.get("large-key");
      expect(result).toBe(largeValue);
    });
  });
});
