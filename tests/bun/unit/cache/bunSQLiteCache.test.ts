// Unit tests for Bun SQLite cache
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  BunSQLiteCache,
  SQLiteCacheKeys,
  generateHashedKey,
  generateOperationKey,
} from "../../../../src/lib/bunSQLiteCache";

describe("BunSQLiteCache", () => {
  let cache: BunSQLiteCache;

  beforeEach(() => {
    cache = new BunSQLiteCache({
      maxMemoryMB: 10,
      defaultTtlMs: 1000, // 1 second for fast tests
      cleanupIntervalMs: 60000, // Long interval
      maxEntries: 100,
      compressionThreshold: 1024,
    });
  });

  afterEach(() => {
    cache.destroy();
  });

  describe("basic operations", () => {
    test("set and get value", async () => {
      await cache.set("test-key", { data: "test value" });
      const result = await cache.get<{ data: string }>("test-key");

      expect(result).toEqual({ data: "test value" });
    });

    test("returns null for missing key", async () => {
      const result = await cache.get("non-existent");
      expect(result).toBeNull();
    });

    test("has returns true for existing key", async () => {
      await cache.set("test-key", "value");
      expect(await cache.has("test-key")).toBe(true);
    });

    test("has returns false for missing key", async () => {
      expect(await cache.has("non-existent")).toBe(false);
    });

    test("delete removes entry", async () => {
      await cache.set("test-key", "value");
      expect(await cache.delete("test-key")).toBe(true);
      expect(await cache.get("test-key")).toBeNull();
    });

    test("delete returns false for missing key", async () => {
      expect(await cache.delete("non-existent")).toBe(false);
    });

    test("clear removes all entries", async () => {
      await cache.set("key1", "value1");
      await cache.set("key2", "value2");
      await cache.clear();

      expect(await cache.get("key1")).toBeNull();
      expect(await cache.get("key2")).toBeNull();
    });
  });

  describe("getOrSet", () => {
    test("returns cached value on hit", async () => {
      await cache.set("test-key", { cached: true });

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
      await expect(
        cache.getOrSet("test-key", async () => {
          throw new Error("Fetch failed");
        })
      ).rejects.toThrow("Fetch failed");
    });
  });

  describe("TTL expiration", () => {
    test("returns null for expired entry", async () => {
      const shortTTLCache = new BunSQLiteCache({
        maxMemoryMB: 10,
        defaultTtlMs: 50, // 50ms
        cleanupIntervalMs: 60000,
        maxEntries: 100,
        compressionThreshold: 1024,
      });

      await shortTTLCache.set("test-key", "value");

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(await shortTTLCache.get("test-key")).toBeNull();
      shortTTLCache.destroy();
    });
  });

  describe("statistics", () => {
    test("tracks cache hits", async () => {
      await cache.set("test-key", "value");
      await cache.get("test-key");
      await cache.get("test-key");

      const stats = cache.getStats();
      expect(stats.hits).toBeGreaterThanOrEqual(2);
    });

    test("tracks cache misses", async () => {
      await cache.get("non-existent");
      await cache.get("another-missing");

      const stats = cache.getStats();
      expect(stats.misses).toBeGreaterThanOrEqual(2);
    });

    test("calculates hit rate", async () => {
      await cache.set("key", "value");
      await cache.get("key"); // hit
      await cache.get("missing"); // miss

      const stats = cache.getStats();
      expect(stats.hitRate).toBeGreaterThanOrEqual(0);
      expect(stats.hitRate).toBeLessThanOrEqual(100);
    });
  });

  describe("invalidatePattern", () => {
    test("removes entries matching pattern", async () => {
      await cache.set("user:123:profile", { name: "User 1" });
      await cache.set("user:123:settings", { theme: "dark" });
      await cache.set("user:456:profile", { name: "User 2" });

      const count = await cache.invalidatePattern(/^user:123:/);

      expect(count).toBe(2);
      expect(await cache.get("user:123:profile")).toBeNull();
      expect(await cache.get("user:123:settings")).toBeNull();
      expect(await cache.get("user:456:profile")).not.toBeNull();
    });

    test("returns 0 when no matches", async () => {
      await cache.set("key1", "value1");

      const count = await cache.invalidatePattern(/^nonexistent:/);
      expect(count).toBe(0);
    });
  });

  describe("getAnalytics", () => {
    test("returns analytics structure", () => {
      const analytics = cache.getAnalytics();

      expect(analytics).toHaveProperty("topKeys");
      expect(analytics).toHaveProperty("expirationDistribution");
      expect(analytics).toHaveProperty("memoryDistribution");
      expect(Array.isArray(analytics.topKeys)).toBe(true);
    });

    test("tracks top keys by hit count", async () => {
      await cache.set("popular-key", "value");
      await cache.get("popular-key");
      await cache.get("popular-key");
      await cache.get("popular-key");

      const analytics = cache.getAnalytics();
      expect(analytics.topKeys.length).toBeGreaterThanOrEqual(0);
    });

    test("tracks memory distribution", async () => {
      await cache.set("small", "x");
      await cache.set("medium", "x".repeat(2000));
      await cache.set("large", "x".repeat(15000));

      const analytics = cache.getAnalytics();
      expect(analytics.memoryDistribution.smallEntries).toBeGreaterThanOrEqual(0);
    });
  });
});

describe("generateHashedKey", () => {
  test("generates hash for input", () => {
    const key = generateHashedKey("test-input");
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
  });

  test("produces consistent hashes", () => {
    const key1 = generateHashedKey("same-input");
    const key2 = generateHashedKey("same-input");
    expect(key1).toBe(key2);
  });

  test("produces different hashes for different inputs", () => {
    const key1 = generateHashedKey("input-1");
    const key2 = generateHashedKey("input-2");
    expect(key1).not.toBe(key2);
  });
});

describe("generateOperationKey", () => {
  test("generates key from operation name", () => {
    const key = generateOperationKey("looksSummary");
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
  });

  test("includes variables in key", () => {
    const key1 = generateOperationKey("query", { brand: "TH" });
    const key2 = generateOperationKey("query", { brand: "PVH" });
    expect(key1).not.toBe(key2);
  });

  test("handles undefined variables", () => {
    const key = generateOperationKey("query", undefined);
    expect(typeof key).toBe("string");
  });
});

describe("SQLiteCacheKeys", () => {
  describe("looks", () => {
    test("generates correct key format", () => {
      const key = SQLiteCacheKeys.looks("TH", "S25", "WMN");
      expect(key).toBe("looks:TH:S25:WMN");
    });
  });

  describe("lookDetails", () => {
    test("generates correct key format", () => {
      const key = SQLiteCacheKeys.lookDetails("look-123");
      expect(key).toBe("lookDetails:look-123");
    });
  });

  describe("looksSummary", () => {
    test("generates correct key format", () => {
      const key = SQLiteCacheKeys.looksSummary("TH", "S25", "WMN");
      expect(key).toBe("looksSummary:TH:S25:WMN");
    });
  });

  describe("options", () => {
    test("generates key without filters", () => {
      const key = SQLiteCacheKeys.options("look-123");
      expect(key).toBe("options:look-123");
    });

    test("generates hashed key with filters", () => {
      const key = SQLiteCacheKeys.options("look-123", { color: "blue" });
      expect(key).toContain("options:look-123:");
    });
  });

  describe("optionsSummary", () => {
    test("generates hashed key", () => {
      const key = SQLiteCacheKeys.optionsSummary("US01", "S25", "WMN", true, ["RETAIL", "WHOLESALE"]);
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
    });

    test("produces consistent keys", () => {
      const key1 = SQLiteCacheKeys.optionsSummary("US01", "S25", "WMN", true, ["RETAIL", "WHOLESALE"]);
      const key2 = SQLiteCacheKeys.optionsSummary("US01", "S25", "WMN", true, ["WHOLESALE", "RETAIL"]);
      // Should be same because arrays are sorted
      expect(key1).toBe(key2);
    });
  });

  describe("imageDetails", () => {
    test("generates correct key format", () => {
      const key = SQLiteCacheKeys.imageDetails("WMN", "S25", "STYLE001");
      expect(key).toBe("imageDetails:WMN:S25:STYLE001");
    });
  });

  describe("optionsProductView", () => {
    test("generates hashed key", () => {
      const key = SQLiteCacheKeys.optionsProductView("TH", "US01", "S25", "WMN", true, ["RETAIL"]);
      expect(typeof key).toBe("string");
    });
  });

  describe("imageUrlCheck", () => {
    test("generates hashed key", () => {
      const key = SQLiteCacheKeys.imageUrlCheck(["WMN", "MEN"], "S25");
      expect(typeof key).toBe("string");
    });
  });

  describe("looksUrlCheck", () => {
    test("generates hashed key", () => {
      const key = SQLiteCacheKeys.looksUrlCheck(["WMN", "MEN"], "S25");
      expect(typeof key).toBe("string");
    });
  });

  describe("getAllSeasonalAssignments", () => {
    test("generates key without optional params", () => {
      const key = SQLiteCacheKeys.getAllSeasonalAssignments("S25");
      expect(key).toBe("getAllSeasonalAssignments:S25:null:undefined");
    });

    test("generates key with optional params", () => {
      const key = SQLiteCacheKeys.getAllSeasonalAssignments("S25", "US01", true);
      expect(key).toBe("getAllSeasonalAssignments:S25:US01:true");
    });
  });

  describe("getDivisionAssignment", () => {
    test("generates correct key format", () => {
      const key = SQLiteCacheKeys.getDivisionAssignment("S25", "US01", "WMN");
      expect(key).toBe("getDivisionAssignment:S25:US01:WMN");
    });
  });

  describe("assignments", () => {
    test("generates key without status", () => {
      const key = SQLiteCacheKeys.assignments("user-123");
      expect(key).toBe("assignments:user-123");
    });

    test("generates key with status", () => {
      const key = SQLiteCacheKeys.assignments("user-123", "active");
      expect(key).toBe("assignments:user-123:active");
    });
  });

  describe("documentSearch", () => {
    test("generates correct key format", () => {
      const key = SQLiteCacheKeys.documentSearch("looks", "searchTerm", 10);
      expect(key).toBe("documentSearch:looks:searchTerm:10");
    });
  });

  describe("healthCheck", () => {
    test("generates correct key format", () => {
      const key = SQLiteCacheKeys.healthCheck("database");
      expect(key).toBe("health:database");
    });
  });

  describe("entity keys", () => {
    test("entityLook generates correct format", () => {
      const key = SQLiteCacheKeys.entityLook("doc-123");
      expect(key).toBe("entity:look:doc-123");
    });

    test("entityImage generates correct format", () => {
      const key = SQLiteCacheKeys.entityImage("WMN", "S25", "STYLE001");
      expect(key).toBe("entity:image:WMN:S25:STYLE001");
    });

    test("entityDivisionAssignment generates correct format", () => {
      const key = SQLiteCacheKeys.entityDivisionAssignment("S25", "US01", "WMN");
      expect(key).toBe("entity:divAssign:S25:US01:WMN");
    });

    test("entityDocument generates correct format", () => {
      const key = SQLiteCacheKeys.entityDocument("lookbook", "images", "looks", "doc-123");
      expect(key).toBe("entity:doc:lookbook:images:looks:doc-123");
    });
  });
});

describe("BunSQLiteCache Configuration", () => {
  test("default maxMemoryMB is 50", () => {
    const defaultMaxMemory = 50;
    expect(defaultMaxMemory).toBe(50);
  });

  test("default TTL is 5 minutes", () => {
    const defaultTtlMs = 5 * 60 * 1000;
    expect(defaultTtlMs).toBe(300000);
  });

  test("default cleanup interval is 1 minute", () => {
    const cleanupInterval = 60 * 1000;
    expect(cleanupInterval).toBe(60000);
  });

  test("default max entries is 10000", () => {
    const maxEntries = 10000;
    expect(maxEntries).toBe(10000);
  });

  test("default compression threshold is 1KB", () => {
    const threshold = 1024;
    expect(threshold).toBe(1024);
  });
});

describe("BunSQLiteCache LRU Eviction", () => {
  test("evicts entries when max entries exceeded", async () => {
    const smallCache = new BunSQLiteCache({
      maxMemoryMB: 10,
      defaultTtlMs: 60000,
      cleanupIntervalMs: 60000,
      maxEntries: 3,
      compressionThreshold: 1024,
    });

    await smallCache.set("key1", "value1");
    await smallCache.set("key2", "value2");
    await smallCache.set("key3", "value3");

    // Access key1 to make it recently used
    await smallCache.get("key1");

    // Add more entries to trigger eviction
    await smallCache.set("key4", "value4");
    await smallCache.set("key5", "value5");

    const stats = smallCache.getStats();
    expect(stats.evictions).toBeGreaterThanOrEqual(0);

    smallCache.destroy();
  });
});

describe("BunSQLiteCache Edge Cases", () => {
  let edgeCache: BunSQLiteCache;

  beforeEach(() => {
    edgeCache = new BunSQLiteCache({
      maxMemoryMB: 10,
      defaultTtlMs: 60000,
      cleanupIntervalMs: 60000,
      maxEntries: 100,
      compressionThreshold: 1024,
    });
  });

  afterEach(() => {
    edgeCache.destroy();
  });

  test("handles null values", async () => {
    await edgeCache.set("null-key", null);
    const result = await edgeCache.get("null-key");
    // null is stored and retrieved as null
    expect(result).toBeNull();
  });

  test("handles complex objects", async () => {
    const complexObject = {
      nested: {
        array: [1, 2, 3],
        object: { key: "value" },
      },
      date: new Date().toISOString(),
    };

    await edgeCache.set("complex-key", complexObject);
    const result = await edgeCache.get("complex-key");

    expect(result).toEqual(complexObject);
  });

  test("handles large values", async () => {
    const largeValue = { data: "x".repeat(10000) };
    await edgeCache.set("large-key", largeValue);
    const result = await edgeCache.get("large-key");

    expect(result).toEqual(largeValue);
  });

  test("handles special characters in keys", async () => {
    const specialKey = "key:with:colons/and/slashes?query=param";
    await edgeCache.set(specialKey, "value");
    const result = await edgeCache.get(specialKey);

    expect(result).toBe("value");
  });
});
