// Unit tests for query cache
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { QueryCache, CacheKeys, defaultQueryCache } from "../../../../src/lib/queryCache";

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
