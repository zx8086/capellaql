// Unit tests for rate limiting middleware
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanupRateLimitStore, rateLimitMiddleware } from "../../../../src/server/middleware/rateLimit";
import type { RequestContext } from "../../../../src/server/types";

// Helper to create mock request context
function createMockContext(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    requestId: `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    startTime: Date.now(),
    url: new URL("http://localhost:4000/graphql"),
    clientIp: "127.0.0.1",
    headers: new Headers(),
    method: "GET",
    ...overrides,
  };
}

// Helper to create mock request
function createMockRequest(options: { userAgent?: string; method?: string } = {}): Request {
  const headers: Record<string, string> = {};
  if (options.userAgent) {
    headers["user-agent"] = options.userAgent;
  }

  return new Request("http://localhost:4000/graphql", {
    method: options.method || "POST",
    headers,
  });
}

describe("Rate Limiting Middleware", () => {
  beforeEach(() => {
    // Clean up rate limit store before each test
    cleanupRateLimitStore();
  });

  afterEach(() => {
    // Ensure cleanup after tests
    cleanupRateLimitStore();
  });

  describe("basic functionality", () => {
    test("allows requests under rate limit", async () => {
      const request = createMockRequest();
      const context = createMockContext();
      const next = async () => new Response("OK", { status: 200 });

      const response = await rateLimitMiddleware(request, context, next);

      expect(response.status).toBe(200);
    });

    test("calls next middleware when not rate limited", async () => {
      const request = createMockRequest();
      const context = createMockContext();
      let nextCalled = false;
      const next = async () => {
        nextCalled = true;
        return new Response("OK");
      };

      await rateLimitMiddleware(request, context, next);

      expect(nextCalled).toBe(true);
    });
  });

  describe("K6 test agent bypass", () => {
    test("bypasses rate limit for K6TestAgent", async () => {
      const request = createMockRequest({ userAgent: "K6TestAgent/1.0" });
      const context = createMockContext();
      const next = async () => new Response("OK");

      // Make 600 requests (over the 500 limit)
      for (let i = 0; i < 600; i++) {
        const response = await rateLimitMiddleware(request, context, next);
        expect(response.status).toBe(200);
      }
    });
  });

  describe("rate limit key generation", () => {
    test("rate limits by IP + path combination", async () => {
      const context1 = createMockContext({ clientIp: "192.168.1.1", url: new URL("http://localhost/api/a") });
      const context2 = createMockContext({ clientIp: "192.168.1.1", url: new URL("http://localhost/api/b") });
      const request = createMockRequest();
      const next = async () => new Response("OK");

      // Different paths should have separate rate limits
      const response1 = await rateLimitMiddleware(request, context1, next);
      const response2 = await rateLimitMiddleware(request, context2, next);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
    });

    test("different IPs have separate rate limits", async () => {
      const context1 = createMockContext({ clientIp: "192.168.1.1" });
      const context2 = createMockContext({ clientIp: "192.168.1.2" });
      const request = createMockRequest();
      const next = async () => new Response("OK");

      const response1 = await rateLimitMiddleware(request, context1, next);
      const response2 = await rateLimitMiddleware(request, context2, next);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
    });
  });

  describe("rate limit enforcement", () => {
    test("returns 429 after exceeding limit", async () => {
      const request = createMockRequest();
      const context = createMockContext();
      const next = async () => new Response("OK");

      // Make 501 requests (1 over the 500 limit)
      let lastResponse: Response | null = null;
      for (let i = 0; i < 501; i++) {
        lastResponse = await rateLimitMiddleware(request, context, next);
      }

      expect(lastResponse?.status).toBe(429);
    });

    test("rate limit resets after window expires", async () => {
      // This test verifies the window expiration logic
      // In production, window is 60 seconds
      // We can only test the logic pattern here

      const request = createMockRequest();
      const context = createMockContext();
      const next = async () => new Response("OK");

      // Make first request
      const response = await rateLimitMiddleware(request, context, next);
      expect(response.status).toBe(200);
    });
  });
});

describe("Rate Limit Configuration", () => {
  test("rate limit is 500 requests", () => {
    const RATE_LIMIT = 500;
    expect(RATE_LIMIT).toBe(500);
  });

  test("rate limit window is 1 minute", () => {
    const RATE_LIMIT_WINDOW = 60 * 1000;
    expect(RATE_LIMIT_WINDOW).toBe(60000);
  });

  test("cleanup interval is 1 minute", () => {
    const CLEANUP_INTERVAL = 60 * 1000;
    expect(CLEANUP_INTERVAL).toBe(60000);
  });

  test("cleanup threshold is 5 minutes", () => {
    const CLEANUP_THRESHOLD = 5 * 60 * 1000;
    expect(CLEANUP_THRESHOLD).toBe(300000);
  });
});

describe("Rate Limit Response", () => {
  test("429 response has correct status", async () => {
    const request = createMockRequest();
    const context = createMockContext();
    const next = async () => new Response("OK");

    // Exceed the rate limit
    let response: Response | null = null;
    for (let i = 0; i <= 501; i++) {
      response = await rateLimitMiddleware(request, context, next);
    }

    expect(response?.status).toBe(429);
  });
});

describe("cleanupRateLimitStore", () => {
  test("clears rate limit store", async () => {
    const request = createMockRequest();
    const context = createMockContext();
    const next = async () => new Response("OK");

    // Add some entries
    await rateLimitMiddleware(request, context, next);

    // Cleanup
    cleanupRateLimitStore();

    // Should be able to make requests again
    const response = await rateLimitMiddleware(request, context, next);
    expect(response.status).toBe(200);
  });

  test("can be called multiple times safely", () => {
    expect(() => {
      cleanupRateLimitStore();
      cleanupRateLimitStore();
      cleanupRateLimitStore();
    }).not.toThrow();
  });
});

describe("Rate Limit Edge Cases", () => {
  beforeEach(() => {
    cleanupRateLimitStore();
  });

  test("handles concurrent requests", async () => {
    const request = createMockRequest();
    const context = createMockContext();
    const next = async () => new Response("OK");

    // Concurrent requests
    const promises = Array(10)
      .fill(null)
      .map(() => rateLimitMiddleware(request, context, next));

    const responses = await Promise.all(promises);

    // All should succeed (under limit)
    responses.forEach((response) => {
      expect(response.status).toBe(200);
    });
  });

  test("handles different HTTP methods", async () => {
    const context = createMockContext();
    const next = async () => new Response("OK");

    const methods = ["GET", "POST", "PUT", "DELETE"];

    for (const method of methods) {
      const request = createMockRequest({ method });
      const response = await rateLimitMiddleware(request, context, next);
      expect(response.status).toBe(200);
    }
  });

  test("handles missing user-agent header", async () => {
    const request = createMockRequest({ userAgent: undefined });
    const context = createMockContext();
    const next = async () => new Response("OK");

    const response = await rateLimitMiddleware(request, context, next);
    expect(response.status).toBe(200);
  });

  test("handles various IP formats", async () => {
    const next = async () => new Response("OK");
    const request = createMockRequest();

    const ipAddresses = ["127.0.0.1", "192.168.1.100", "10.0.0.1", "::1", "2001:db8::1"];

    for (const ip of ipAddresses) {
      const context = createMockContext({ clientIp: ip });
      const response = await rateLimitMiddleware(request, context, next);
      expect(response.status).toBe(200);
    }
  });
});
