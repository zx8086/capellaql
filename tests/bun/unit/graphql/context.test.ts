/* tests/bun/unit/graphql/context.test.ts */
import { describe, expect, mock, test } from "bun:test";

mock.module("../../../../src/telemetry/logger", () => ({
  debug: mock(() => {}),
}));

mock.module("../../../../src/lib/couchbase", () => ({
  createDocumentDataLoader: mock(() => ({
    load: mock(),
    loadMany: mock(),
    clear: mock(),
    clearAll: mock(),
  })),
}));

mock.module("ulid", () => ({
  ulid: mock(() => "01ARZ3NDEKTSV4RRFFQ69G5FAV"),
}));

import {
  contextFactory,
  trackCacheHit,
  trackCacheMiss,
  trackDatabaseCall,
  type GraphQLContext,
} from "../../../../src/graphql/context";

describe("GraphQL Context", () => {
  describe("contextFactory", () => {
    test("returns context with requestId", () => {
      const request = new Request("http://localhost:4000/graphql");
      const ctx = contextFactory({ request });

      expect(ctx.requestId).toBeDefined();
      expect(typeof ctx.requestId).toBe("string");
    });

    test("returns context with dataLoader", () => {
      const request = new Request("http://localhost:4000/graphql");
      const ctx = contextFactory({ request });

      expect(ctx.dataLoader).toBeDefined();
      expect(typeof ctx.dataLoader.load).toBe("function");
    });

    test("returns context with startTime", () => {
      const before = Date.now();
      const request = new Request("http://localhost:4000/graphql");
      const ctx = contextFactory({ request });
      const after = Date.now();

      expect(ctx.startTime).toBeDefined();
      expect(ctx.startTime).toBeGreaterThanOrEqual(before);
      expect(ctx.startTime).toBeLessThanOrEqual(after);
    });

    test("extracts user-agent", () => {
      const request = new Request("http://localhost:4000/graphql", {
        headers: { "User-Agent": "TestClient/1.0" },
      });
      const ctx = contextFactory({ request });

      expect(ctx.userAgent).toBe("TestClient/1.0");
    });

    test("userAgent is undefined when header missing", () => {
      const request = new Request("http://localhost:4000/graphql");
      const ctx = contextFactory({ request });

      expect(ctx.userAgent).toBeUndefined();
    });

    test("user is undefined by default", () => {
      const request = new Request("http://localhost:4000/graphql");
      const ctx = contextFactory({ request });

      expect(ctx.user).toBeUndefined();
    });
  });

  describe("getClientIp", () => {
    test("extracts from x-forwarded-for header (first IP)", () => {
      const request = new Request("http://localhost:4000/graphql", {
        headers: { "X-Forwarded-For": "203.0.113.50, 70.41.3.18, 150.172.238.178" },
      });
      const ctx = contextFactory({ request });

      expect(ctx.clientIp).toBe("203.0.113.50");
    });

    test("extracts from cf-connecting-ip header", () => {
      const request = new Request("http://localhost:4000/graphql", {
        headers: { "CF-Connecting-IP": "203.0.113.100" },
      });
      const ctx = contextFactory({ request });

      expect(ctx.clientIp).toBe("203.0.113.100");
    });

    test("extracts from x-real-ip header", () => {
      const request = new Request("http://localhost:4000/graphql", {
        headers: { "X-Real-IP": "10.0.0.1" },
      });
      const ctx = contextFactory({ request });

      expect(ctx.clientIp).toBe("10.0.0.1");
    });

    test("extracts from x-client-ip header", () => {
      const request = new Request("http://localhost:4000/graphql", {
        headers: { "X-Client-IP": "192.168.1.1" },
      });
      const ctx = contextFactory({ request });

      expect(ctx.clientIp).toBe("192.168.1.1");
    });

    test("returns unknown when no IP headers present", () => {
      const request = new Request("http://localhost:4000/graphql");
      const ctx = contextFactory({ request });

      expect(ctx.clientIp).toBe("unknown");
    });

    test("x-forwarded-for takes priority over other headers", () => {
      const request = new Request("http://localhost:4000/graphql", {
        headers: {
          "X-Forwarded-For": "203.0.113.50",
          "CF-Connecting-IP": "different-ip",
          "X-Real-IP": "another-ip",
        },
      });
      const ctx = contextFactory({ request });

      expect(ctx.clientIp).toBe("203.0.113.50");
    });
  });

  describe("trackDatabaseCall", () => {
    test("does not throw", () => {
      const ctx: GraphQLContext = {
        requestId: "test-123",
        dataLoader: {} as any,
        clientIp: "127.0.0.1",
      };
      expect(() => trackDatabaseCall(ctx, "get")).not.toThrow();
    });

    test("works without operation parameter", () => {
      const ctx: GraphQLContext = {
        requestId: "test-123",
        dataLoader: {} as any,
      };
      expect(() => trackDatabaseCall(ctx)).not.toThrow();
    });
  });

  describe("trackCacheHit", () => {
    test("does not throw", () => {
      const ctx: GraphQLContext = {
        requestId: "test-123",
        dataLoader: {} as any,
      };
      expect(() => trackCacheHit(ctx, "cache-key-1")).not.toThrow();
    });

    test("handles long cache keys (truncated)", () => {
      const ctx: GraphQLContext = {
        requestId: "test-123",
        dataLoader: {} as any,
      };
      const longKey = "a".repeat(100);
      expect(() => trackCacheHit(ctx, longKey)).not.toThrow();
    });
  });

  describe("trackCacheMiss", () => {
    test("does not throw", () => {
      const ctx: GraphQLContext = {
        requestId: "test-123",
        dataLoader: {} as any,
      };
      expect(() => trackCacheMiss(ctx, "cache-key-1")).not.toThrow();
    });
  });
});
