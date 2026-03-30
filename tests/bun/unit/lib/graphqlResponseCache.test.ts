/* tests/bun/unit/lib/graphqlResponseCache.test.ts */
import { beforeEach, describe, expect, mock, test } from "bun:test";

// Mock dependencies
const mockGet = mock(() => Promise.resolve(null));
const mockSet = mock(() => Promise.resolve());
const mockDelete = mock(() => Promise.resolve());

mock.module("../../../../src/lib/bunSQLiteCache", () => ({
  BunSQLiteCache: class {
    get = mockGet;
    set = mockSet;
    delete = mockDelete;
  },
}));

mock.module("../../../../src/config", () => ({
  default: {
    application: {
      YOGA_RESPONSE_CACHE_TTL: 300000,
    },
  },
}));

mock.module("../../../../src/telemetry/logger", () => ({
  debug: mock(() => {}),
  err: mock(() => {}),
  log: mock(() => {}),
}));

import {
  SQLiteGraphQLCache,
  buildGraphQLCacheKey,
  getOperationTTL,
  getSessionId,
  shouldCacheOperation,
} from "../../../../src/lib/graphqlResponseCache";

describe("GraphQL Response Cache", () => {
  describe("SQLiteGraphQLCache", () => {
    let cache: SQLiteGraphQLCache;

    beforeEach(() => {
      cache = new SQLiteGraphQLCache();
      mockGet.mockClear();
      mockSet.mockClear();
      mockDelete.mockClear();
    });

    describe("get", () => {
      test("returns cached value on hit", async () => {
        mockGet.mockImplementationOnce(() => Promise.resolve({ data: "cached" }));

        const result = await cache.get("test-key");
        expect(result).toEqual({ data: "cached" });
      });

      test("returns undefined on cache miss", async () => {
        mockGet.mockImplementationOnce(() => Promise.resolve(null));

        const result = await cache.get("missing-key");
        expect(result).toBeUndefined();
      });

      test("returns undefined on error", async () => {
        mockGet.mockImplementationOnce(() => Promise.reject(new Error("db error")));

        const result = await cache.get("error-key");
        expect(result).toBeUndefined();
      });

      test("prefixes cache key", async () => {
        mockGet.mockImplementationOnce(() => Promise.resolve(null));

        await cache.get("my-key");
        expect(mockGet).toHaveBeenCalledWith("gql_response:my-key");
      });
    });

    describe("set", () => {
      test("stores value with prefixed key", async () => {
        await cache.set("my-key", { data: "value" });

        expect(mockSet).toHaveBeenCalledTimes(1);
        const [key] = mockSet.mock.calls[0];
        expect(key).toBe("gql_response:my-key");
      });

      test("converts TTL from seconds to milliseconds", async () => {
        await cache.set("key", { data: "value" }, 60);

        const [, , ttlMs] = mockSet.mock.calls[0];
        expect(ttlMs).toBe(60000);
      });

      test("uses default TTL when not specified", async () => {
        await cache.set("key", { data: "value" });

        const [, , ttlMs] = mockSet.mock.calls[0];
        expect(ttlMs).toBe(300000); // From mocked config
      });

      test("does not throw on error", async () => {
        mockSet.mockImplementationOnce(() => Promise.reject(new Error("write failed")));

        // Should not throw
        await cache.set("key", { data: "value" });
      });
    });

    describe("delete", () => {
      test("returns true on successful delete", async () => {
        mockDelete.mockImplementationOnce(() => Promise.resolve());

        const result = await cache.delete("my-key");
        expect(result).toBe(true);
      });

      test("deletes with prefixed key", async () => {
        await cache.delete("my-key");

        expect(mockDelete).toHaveBeenCalledWith("gql_response:my-key");
      });

      test("returns false on error", async () => {
        mockDelete.mockImplementationOnce(() => Promise.reject(new Error("delete failed")));

        const result = await cache.delete("error-key");
        expect(result).toBe(false);
      });
    });
  });

  describe("buildGraphQLCacheKey", () => {
    test("generates deterministic key", () => {
      const key1 = buildGraphQLCacheKey({
        operationName: "GetUser",
        source: "query GetUser { user { id } }",
        variableValues: { id: "1" },
      });
      const key2 = buildGraphQLCacheKey({
        operationName: "GetUser",
        source: "query GetUser { user { id } }",
        variableValues: { id: "1" },
      });
      expect(key1).toBe(key2);
    });

    test("uses 'anonymous' for null operationName", () => {
      const key = buildGraphQLCacheKey({
        operationName: null,
        source: "{ user { id } }",
      });
      expect(key).toContain("anonymous");
    });

    test("uses 'null' for undefined variables", () => {
      const key = buildGraphQLCacheKey({
        operationName: "Test",
        source: "query { test }",
        variableValues: null,
      });
      expect(key).toContain("null");
    });

    test("sorts variables for consistent keys", () => {
      const key1 = buildGraphQLCacheKey({
        operationName: "Test",
        source: "query { test }",
        variableValues: { a: 1, b: 2 },
      });
      const key2 = buildGraphQLCacheKey({
        operationName: "Test",
        source: "query { test }",
        variableValues: { b: 2, a: 1 },
      });
      expect(key1).toBe(key2);
    });

    test("different operations produce different keys", () => {
      const key1 = buildGraphQLCacheKey({
        operationName: "GetUser",
        source: "query GetUser { user { id } }",
      });
      const key2 = buildGraphQLCacheKey({
        operationName: "GetPost",
        source: "query GetPost { post { id } }",
      });
      expect(key1).not.toBe(key2);
    });

    test("different variables produce different keys", () => {
      const key1 = buildGraphQLCacheKey({
        operationName: "GetUser",
        source: "query { user }",
        variableValues: { id: "1" },
      });
      const key2 = buildGraphQLCacheKey({
        operationName: "GetUser",
        source: "query { user }",
        variableValues: { id: "2" },
      });
      expect(key1).not.toBe(key2);
    });
  });

  describe("getSessionId", () => {
    test("returns null for global caching", () => {
      expect(getSessionId()).toBeNull();
    });
  });

  describe("getOperationTTL", () => {
    test("returns 300 for looks", () => {
      expect(getOperationTTL("looks")).toBe(300);
    });

    test("returns 180 for optionsSummary", () => {
      expect(getOperationTTL("optionsSummary")).toBe(180);
    });

    test("returns 600 for imageDetails", () => {
      expect(getOperationTTL("imageDetails")).toBe(600);
    });

    test("returns 120 for searchDocuments", () => {
      expect(getOperationTTL("searchDocuments")).toBe(120);
    });

    test("returns 300 for assignments", () => {
      expect(getOperationTTL("assignments")).toBe(300);
    });

    test("returns default 300 for unknown operations", () => {
      expect(getOperationTTL("unknownOperation")).toBe(300);
    });
  });

  describe("shouldCacheOperation", () => {
    test("returns false for mutations", () => {
      expect(shouldCacheOperation("CreateUser", "mutation CreateUser { ... }")).toBe(false);
    });

    test("returns false for IntrospectionQuery", () => {
      expect(shouldCacheOperation("IntrospectionQuery", "query IntrospectionQuery { ... }")).toBe(false);
    });

    test("returns false for __schema queries", () => {
      expect(shouldCacheOperation("GetSchema", "query { __schema { types { name } } }")).toBe(false);
    });

    test("returns true for normal queries", () => {
      expect(shouldCacheOperation("GetUser", "query GetUser { user { id } }")).toBe(true);
    });

    test("returns true when operationName is null", () => {
      expect(shouldCacheOperation(null, "query { user { id } }")).toBe(true);
    });

    test("returns true when source is undefined", () => {
      expect(shouldCacheOperation("GetUser", undefined)).toBe(true);
    });

    test("returns true when both are undefined", () => {
      expect(shouldCacheOperation(undefined, undefined)).toBe(true);
    });
  });
});
