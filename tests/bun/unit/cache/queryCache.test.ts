// Unit tests for query cache
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { QueryCache, CacheKeys, defaultQueryCache } from "../../../../src/lib/queryCache";
import { CircuitBreaker } from "../../../../src/lib/couchbase/circuit-breaker";

describe("QueryCache", () => {
  let cache: QueryCache;

  beforeEach(() => {
    cache = new QueryCache({
      defaultTtl: 1000, // 1 second for fast tests
      maxSize: 100,
      maxMemory: 1024 * 1024, // 1MB
      cleanupInterval: 60000, // Long interval to avoid interference
      staleTolerance: 30 * 60 * 1000, // 30 minutes
    });
  });

  afterEach(() => {
    cache.destroy();
  });

  describe("basic operations", () => {
    test("set and get value", () => {
      cache.set("test-key", { data: "test value" });
      const result = cache.get<{ data: string }>("test-key");

      expect(result).toEqual({ data: "test value" });
    });

    test("returns undefined for missing key", () => {
      const result = cache.get("non-existent");
      expect(result).toBeUndefined();
    });

    test("has returns true for existing key", () => {
      cache.set("test-key", "value");
      expect(cache.has("test-key")).toBe(true);
    });

    test("has returns false for missing key", () => {
      expect(cache.has("non-existent")).toBe(false);
    });

    test("remove deletes entry", () => {
      cache.set("test-key", "value");
      expect(cache.remove("test-key")).toBe(true);
      expect(cache.get("test-key")).toBeUndefined();
    });

    test("remove returns false for missing key", () => {
      expect(cache.remove("non-existent")).toBe(false);
    });

    test("clear removes all entries", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");
      cache.clear();

      expect(cache.get("key1")).toBeUndefined();
      expect(cache.get("key2")).toBeUndefined();
    });
  });

  describe("getOrSet", () => {
    test("returns cached value on hit", async () => {
      cache.set("test-key", { cached: true });

      let fetcherCalled = false;
      const result = await cache.getOrSet("test-key", async () => {
        fetcherCalled = true;
        return { cached: false };
      });

      expect(result).toEqual({ cached: true });
      expect(fetcherCalled).toBe(false);
    });

    test("calls fetcher on miss and caches result", async () => {
      let fetcherCalls = 0;
      const result = await cache.getOrSet("test-key", async () => {
        fetcherCalls++;
        return { data: "fetched" };
      });

      expect(result).toEqual({ data: "fetched" });
      expect(fetcherCalls).toBe(1);

      // Second call should hit cache
      await cache.getOrSet("test-key", async () => {
        fetcherCalls++;
        return { data: "should not be called" };
      });

      expect(fetcherCalls).toBe(1);
    });

    test("propagates fetcher errors", async () => {
      const fetchError = new Error("Fetch failed");

      await expect(
        cache.getOrSet("test-key", async () => {
          throw fetchError;
        })
      ).rejects.toThrow("Fetch failed");
    });

    test("custom TTL is respected", async () => {
      let fetcherCalls = 0;
      const fetcher = async () => {
        fetcherCalls++;
        return { data: "value" };
      };

      await cache.getOrSet("custom-ttl-key", fetcher, 50); // 50ms TTL

      // Should be cached
      await cache.getOrSet("custom-ttl-key", fetcher);
      expect(fetcherCalls).toBe(1);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should re-fetch
      await cache.getOrSet("custom-ttl-key", fetcher);
      expect(fetcherCalls).toBe(2);
    });
  });

  describe("TTL expiration", () => {
    test("returns undefined for expired entry", async () => {
      const shortTTLCache = new QueryCache({
        defaultTtl: 50, // 50ms
        maxSize: 100,
        maxMemory: 1024 * 1024,
        cleanupInterval: 60000,
        staleTolerance: 30 * 60 * 1000,
      });

      shortTTLCache.set("test-key", "value");

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(shortTTLCache.get("test-key")).toBeUndefined();
      shortTTLCache.destroy();
    });

    test("has returns false for expired entry", async () => {
      const shortTTLCache = new QueryCache({
        defaultTtl: 50,
        maxSize: 100,
        maxMemory: 1024 * 1024,
        cleanupInterval: 60000,
        staleTolerance: 30 * 60 * 1000,
      });

      shortTTLCache.set("test-key", "value");
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(shortTTLCache.has("test-key")).toBe(false);
      shortTTLCache.destroy();
    });
  });

  describe("statistics", () => {
    test("tracks cache hits", () => {
      cache.set("test-key", "value");
      cache.get("test-key");
      cache.get("test-key");

      const stats = cache.getStats();
      expect(stats.hits).toBeGreaterThanOrEqual(2);
    });

    test("tracks cache misses", () => {
      cache.get("non-existent");
      cache.get("another-missing");

      const stats = cache.getStats();
      expect(stats.misses).toBeGreaterThanOrEqual(2);
    });

    test("tracks cache size", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
    });

    test("tracks memory usage", () => {
      cache.set("key1", { large: "data".repeat(100) });

      const stats = cache.getStats();
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });

    test("returns copy of stats", () => {
      const stats1 = cache.getStats();
      const stats2 = cache.getStats();

      expect(stats1).not.toBe(stats2);
      expect(stats1).toEqual(stats2);
    });

    test("clear preserves hit/miss stats", () => {
      cache.set("key1", "value1");
      cache.get("key1"); // hit
      cache.get("missing"); // miss

      cache.clear();

      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });

  describe("stale fallback", () => {
    test("serves stale data when fetcher fails", async () => {
      const staleCache = new QueryCache({
        defaultTtl: 50,
        maxSize: 100,
        maxMemory: 1024 * 1024,
        cleanupInterval: 60000,
        staleTolerance: 5000,
      });

      // Prime the cache
      await staleCache.getOrSet("key1", () => Promise.resolve({ data: "original" }), 50);

      // Wait for primary TTL to expire
      await new Promise((r) => setTimeout(r, 100));

      // Fetcher fails — should get stale data
      const result = await staleCache.getOrSet<{ data: string }>(
        "key1",
        () => Promise.reject(new Error("DB down")),
        50,
      );

      expect(result).toEqual({ data: "original" });
      expect(staleCache.getStats().staleHits).toBe(1);
      staleCache.destroy();
    });

    test("throws when fetcher fails and no stale data exists", async () => {
      const staleCache = new QueryCache({
        defaultTtl: 50,
        maxSize: 100,
        maxMemory: 1024 * 1024,
        cleanupInterval: 60000,
        staleTolerance: 5000,
      });

      try {
        await staleCache.getOrSet("new-key", () => Promise.reject(new Error("DB down")), 50);
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect((error as Error).message).toBe("DB down");
      }
      staleCache.destroy();
    });

    test("stale data expires after staleTolerance", async () => {
      const staleCache = new QueryCache({
        defaultTtl: 50,
        maxSize: 100,
        maxMemory: 1024 * 1024,
        cleanupInterval: 60000,
        staleTolerance: 80,
      });

      // Prime cache
      await staleCache.getOrSet("key1", () => Promise.resolve("data"), 50);

      // Wait for primary TTL to expire
      await new Promise((r) => setTimeout(r, 80));

      // Stale data still within tolerance
      const staleResult = await staleCache.getOrSet<string>(
        "key1",
        () => Promise.reject(new Error("DB down")),
        50,
      );
      expect(staleResult).toBe("data");

      // Wait for stale tolerance to expire
      await new Promise((r) => setTimeout(r, 120));

      // Should throw since stale data has also expired
      try {
        await staleCache.getOrSet("key1", () => Promise.reject(new Error("DB down")), 50);
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect((error as Error).message).toBe("DB down");
      }
      staleCache.destroy();
    });

    test("fresh data replaces stale data", async () => {
      const staleCache = new QueryCache({
        defaultTtl: 50,
        maxSize: 100,
        maxMemory: 1024 * 1024,
        cleanupInterval: 60000,
        staleTolerance: 5000,
      });

      await staleCache.getOrSet("key1", () => Promise.resolve("v1"), 50);
      await new Promise((r) => setTimeout(r, 100));

      const result = await staleCache.getOrSet("key1", () => Promise.resolve("v2"), 50);
      expect(result).toBe("v2");
      expect(staleCache.getStats().staleHits).toBe(0);
      staleCache.destroy();
    });
  });

  describe("invalidatePattern", () => {
    test("removes entries matching pattern", () => {
      cache.set("user:123:profile", { name: "User 1" });
      cache.set("user:123:settings", { theme: "dark" });
      cache.set("user:456:profile", { name: "User 2" });

      const count = cache.invalidatePattern(/^user:123:/);

      expect(count).toBe(2);
      expect(cache.get("user:123:profile")).toBeUndefined();
      expect(cache.get("user:123:settings")).toBeUndefined();
      expect(cache.get("user:456:profile")).toBeDefined();
    });

    test("returns 0 when no matches", () => {
      cache.set("key1", "value1");

      const count = cache.invalidatePattern(/^nonexistent:/);
      expect(count).toBe(0);
    });
  });

  describe("createKey", () => {
    test("creates deterministic key", () => {
      const key1 = QueryCache.createKey("query", { brand: "TH", season: "S25" });
      const key2 = QueryCache.createKey("query", { season: "S25", brand: "TH" });

      // Keys should be same regardless of parameter order
      expect(key1).toBe(key2);
    });

    test("includes operation and collection", () => {
      const key = QueryCache.createKey("looksSummary", { brand: "TH" }, "looks");

      expect(key).toContain("looksSummary");
      expect(key).toContain("looks");
    });

    test("handles empty params", () => {
      const key = QueryCache.createKey("query", {});
      expect(key).toBeDefined();
    });
  });

  describe("LRU eviction", () => {
    test("evicts least recently used entries when full", () => {
      const smallCache = new QueryCache({
        defaultTtl: 60000,
        maxSize: 3,
        maxMemory: 1024 * 1024,
        cleanupInterval: 60000,
        staleTolerance: 30 * 60 * 1000,
      });

      smallCache.set("key1", "value1");
      smallCache.set("key2", "value2");
      smallCache.set("key3", "value3");

      // Access key1 to make it recently used
      smallCache.get("key1");

      // Add new entry, should evict key2 (least recently used)
      smallCache.set("key4", "value4");

      expect(smallCache.get("key1")).toBeDefined();
      expect(smallCache.get("key4")).toBeDefined();

      smallCache.destroy();
    });
  });

  describe("memory management", () => {
    test("estimates size correctly", () => {
      cache.set("key", { data: "x".repeat(100) });

      const stats = cache.getStats();
      expect(stats.memoryUsage).toBeGreaterThan(200); // UTF-16 * 2
    });

    test("tracks evictions", () => {
      const smallCache = new QueryCache({
        defaultTtl: 60000,
        maxSize: 2,
        maxMemory: 1024 * 1024,
        cleanupInterval: 60000,
        staleTolerance: 30 * 60 * 1000,
      });

      smallCache.set("key1", "value1");
      smallCache.set("key2", "value2");
      smallCache.set("key3", "value3");

      const stats = smallCache.getStats();
      expect(stats.evictions).toBeGreaterThanOrEqual(1);

      smallCache.destroy();
    });
  });

  describe("lifecycle", () => {
    test("destroy stops cleanup timer and clears cache", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");

      cache.destroy();

      const stats = cache.getStats();
      expect(stats.size).toBe(0);
    });
  });

  describe("stale cache with circuit breaker", () => {
    test("stale cache serves data when circuit breaker is open", async () => {
      const staleCache = new QueryCache({
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
      const result1 = await staleCache.getOrSet("data", () =>
        breaker.execute(() => Promise.resolve({ value: 42 })),
      );
      expect(result1).toEqual({ value: 42 });

      // Wait for cache to expire
      await new Promise((r) => setTimeout(r, 150));

      // Trip the circuit breaker
      const failOp = () => Promise.reject(new Error("Network partition"));
      try { await breaker.execute(failOp); } catch {}
      try { await breaker.execute(failOp); } catch {}

      // Cache should return stale data even with breaker open
      const result2 = await staleCache.getOrSet("data", () =>
        breaker.execute(() => Promise.resolve({ value: 99 })),
      );
      expect(result2).toEqual({ value: 42 });

      staleCache.destroy();
    });

    test("fresh data flows after breaker recovery", async () => {
      const staleCache = new QueryCache({
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
      await staleCache.getOrSet("config", () =>
        breaker.execute(() => Promise.resolve({ version: 1 })),
      );

      // Expire cache + trip breaker
      await new Promise((r) => setTimeout(r, 100));
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(() => Promise.reject(new Error("Partition")));
        } catch {}
      }

      // Stale data during partition
      const staleResult = await staleCache.getOrSet("config", () =>
        breaker.execute(() => Promise.resolve({ version: 2 })),
      );
      expect(staleResult).toEqual({ version: 1 });

      // Wait for breaker to half-open, then fresh data
      await new Promise((r) => setTimeout(r, 150));
      const freshResult = await staleCache.getOrSet(
        "config",
        () => breaker.execute(() => Promise.resolve({ version: 3 })),
        50,
      );
      expect(freshResult).toEqual({ version: 3 });

      staleCache.destroy();
    });
  });

  describe("edge cases", () => {
    test("handles null values", () => {
      cache.set("null-key", null);
      const result = cache.get("null-key");
      expect(result).toBeNull();
    });

    test("handles complex objects", () => {
      const complexObj = {
        nested: { array: [1, 2, 3], map: { a: 1, b: 2 } },
        date: new Date().toISOString(),
        number: 42,
        boolean: true,
      };

      cache.set("complex-key", complexObj);
      expect(cache.get("complex-key") as unknown).toEqual(complexObj);
    });

    test("handles empty string keys", () => {
      cache.set("", "empty-key-value");
      expect(cache.get("") as unknown).toBe("empty-key-value");
    });

    test("handles large values", () => {
      const largeValue = "x".repeat(10000);
      cache.set("large-key", largeValue);
      expect(cache.get("large-key") as unknown).toBe(largeValue);
    });
  });
});

describe("CacheKeys", () => {
  describe("looks", () => {
    test("generates correct key format", () => {
      const key = CacheKeys.looks("TH", "S25", "WMN");
      expect(key).toContain("looks");
      expect(key).toContain("TH");
      expect(key).toContain("S25");
      expect(key).toContain("WMN");
    });
  });

  describe("lookDetails", () => {
    test("generates correct key format", () => {
      const key = CacheKeys.lookDetails("look-123");
      expect(key).toContain("lookDetails");
      expect(key).toContain("look-123");
    });
  });

  describe("options", () => {
    test("generates key without filters", () => {
      const key = CacheKeys.options("look-123");
      expect(key).toContain("options");
      expect(key).toContain("look-123");
    });

    test("generates key with filters", () => {
      const key = CacheKeys.options("look-123", { color: "blue" });
      expect(key).toContain("options");
      expect(key).toContain("look-123");
      expect(key).toContain("color");
    });
  });

  describe("optionsSummary", () => {
    test("generates correct key format", () => {
      const key = CacheKeys.optionsSummary("TH", "S25", "WMN");
      expect(key).toContain("optionsSummary");
    });
  });

  describe("assignments", () => {
    test("generates key without status", () => {
      const key = CacheKeys.assignments("user-123");
      expect(key).toContain("assignments");
      expect(key).toContain("user-123");
    });

    test("generates key with status", () => {
      const key = CacheKeys.assignments("user-123", "active");
      expect(key).toContain("assignments");
      expect(key).toContain("user-123");
      expect(key).toContain("active");
    });
  });
});

describe("defaultQueryCache", () => {
  test("is a QueryCache instance", () => {
    expect(defaultQueryCache).toBeInstanceOf(QueryCache);
  });

  test("can be used for caching", async () => {
    const testKey = `default-cache-test-${Date.now()}`;
    let fetchCount = 0;

    const result = await defaultQueryCache.getOrSet(testKey, async () => {
      fetchCount++;
      return { value: "test" };
    });

    expect(result).toEqual({ value: "test" });
    expect(fetchCount).toBe(1);

    // Cleanup
    defaultQueryCache.remove(testKey);
  });
});

describe("Cache Configuration", () => {
  test("default TTL is 5 minutes", () => {
    const defaultTtl = 5 * 60 * 1000;
    expect(defaultTtl).toBe(300000);
  });

  test("default max size is 1000", () => {
    const maxSize = 1000;
    expect(maxSize).toBe(1000);
  });

  test("default max memory is 10MB", () => {
    const maxMemory = 10 * 1024 * 1024;
    expect(maxMemory).toBe(10485760);
  });

  test("default cleanup interval is 1 minute", () => {
    const cleanupInterval = 60 * 1000;
    expect(cleanupInterval).toBe(60000);
  });
});

describe("Cache Entry Metadata", () => {
  test("tracks hit count", () => {
    const metadataCache = new QueryCache({
      defaultTtl: 1000,
      maxSize: 100,
      maxMemory: 1024 * 1024,
      cleanupInterval: 60000,
      staleTolerance: 30 * 60 * 1000,
    });

    metadataCache.set("key", "value");
    metadataCache.get("key");
    metadataCache.get("key");
    metadataCache.get("key");

    // Stats should reflect hits
    const stats = metadataCache.getStats();
    expect(stats.hits).toBeGreaterThanOrEqual(3);
    metadataCache.destroy();
  });
});
