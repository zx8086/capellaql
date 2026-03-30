/* tests/bun/unit/middleware/methodValidation.test.ts */
import { describe, expect, test } from "bun:test";
import { methodValidationMiddleware } from "../../../../src/server/middleware/methodValidation";
import type { RequestContext } from "../../../../src/server/types";

function createMockContext(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    requestId: "test-req-id",
    startTime: Date.now(),
    url: new URL("http://localhost:4000/graphql"),
    clientIp: "127.0.0.1",
    headers: new Headers(),
    method: "GET",
    ...overrides,
  };
}

function createMockRequest(
  method = "GET",
  url = "http://localhost:4000/graphql"
): Request {
  return new Request(url, { method });
}

describe("Method Validation Middleware", () => {
  describe("unknown endpoints", () => {
    test("passes through for unknown endpoints", async () => {
      const request = createMockRequest("GET", "http://localhost:4000/unknown");
      const context = createMockContext({
        url: new URL("http://localhost:4000/unknown"),
      });
      let nextCalled = false;
      const next = async () => {
        nextCalled = true;
        return new Response("OK", { status: 200 });
      };

      const response = await methodValidationMiddleware(request, context, next);

      expect(nextCalled).toBe(true);
      expect(response.status).toBe(200);
    });
  });

  describe("OPTIONS bypass", () => {
    test("passes through OPTIONS for any known endpoint", async () => {
      const request = createMockRequest("OPTIONS", "http://localhost:4000/health");
      const context = createMockContext({
        url: new URL("http://localhost:4000/health"),
        method: "OPTIONS",
      });
      let nextCalled = false;
      const next = async () => {
        nextCalled = true;
        return new Response(null, { status: 204 });
      };

      const response = await methodValidationMiddleware(request, context, next);

      expect(nextCalled).toBe(true);
      expect(response.status).toBe(204);
    });

    test("passes through OPTIONS for /graphql endpoint", async () => {
      const request = createMockRequest("OPTIONS", "http://localhost:4000/graphql");
      const context = createMockContext({
        url: new URL("http://localhost:4000/graphql"),
        method: "OPTIONS",
      });
      let nextCalled = false;
      const next = async () => {
        nextCalled = true;
        return new Response(null, { status: 204 });
      };

      const response = await methodValidationMiddleware(request, context, next);

      expect(nextCalled).toBe(true);
      expect(response.status).toBe(204);
    });
  });

  describe("health endpoints", () => {
    const healthPaths = [
      "/health",
      "/health/system",
      "/health/telemetry",
      "/health/summary",
      "/health/performance",
      "/health/comprehensive",
    ];

    for (const path of healthPaths) {
      test(`allows GET on ${path}`, async () => {
        const request = createMockRequest("GET", `http://localhost:4000${path}`);
        const context = createMockContext({
          url: new URL(`http://localhost:4000${path}`),
          method: "GET",
        });
        let nextCalled = false;
        const next = async () => {
          nextCalled = true;
          return new Response("OK", { status: 200 });
        };

        const response = await methodValidationMiddleware(request, context, next);

        expect(nextCalled).toBe(true);
        expect(response.status).toBe(200);
      });
    }

    test("returns 405 for POST on health endpoints", async () => {
      const request = createMockRequest("POST", "http://localhost:4000/health");
      const context = createMockContext({
        url: new URL("http://localhost:4000/health"),
        method: "POST",
      });
      const next = async () => new Response("OK", { status: 200 });

      const response = await methodValidationMiddleware(request, context, next);

      expect(response.status).toBe(405);
    });

    test("returns 405 for PUT on health endpoints", async () => {
      const request = createMockRequest("PUT", "http://localhost:4000/health");
      const context = createMockContext({
        url: new URL("http://localhost:4000/health"),
        method: "PUT",
      });
      const next = async () => new Response("OK", { status: 200 });

      const response = await methodValidationMiddleware(request, context, next);

      expect(response.status).toBe(405);
    });

    test("returns 405 for DELETE on health endpoints", async () => {
      const request = createMockRequest("DELETE", "http://localhost:4000/health");
      const context = createMockContext({
        url: new URL("http://localhost:4000/health"),
        method: "DELETE",
      });
      const next = async () => new Response("OK", { status: 200 });

      const response = await methodValidationMiddleware(request, context, next);

      expect(response.status).toBe(405);
    });

    test("405 response for health includes Allow header with correct methods", async () => {
      const request = createMockRequest("POST", "http://localhost:4000/health");
      const context = createMockContext({
        url: new URL("http://localhost:4000/health"),
        method: "POST",
      });
      const next = async () => new Response("OK", { status: 200 });

      const response = await methodValidationMiddleware(request, context, next);

      expect(response.headers.get("Allow")).toBe("GET, OPTIONS");
    });
  });

  describe("/graphql endpoint", () => {
    test("allows GET on /graphql", async () => {
      const request = createMockRequest("GET", "http://localhost:4000/graphql");
      const context = createMockContext({
        url: new URL("http://localhost:4000/graphql"),
        method: "GET",
      });
      let nextCalled = false;
      const next = async () => {
        nextCalled = true;
        return new Response("OK", { status: 200 });
      };

      const response = await methodValidationMiddleware(request, context, next);

      expect(nextCalled).toBe(true);
      expect(response.status).toBe(200);
    });

    test("allows POST on /graphql", async () => {
      const request = createMockRequest("POST", "http://localhost:4000/graphql");
      const context = createMockContext({
        url: new URL("http://localhost:4000/graphql"),
        method: "POST",
      });
      let nextCalled = false;
      const next = async () => {
        nextCalled = true;
        return new Response("OK", { status: 200 });
      };

      const response = await methodValidationMiddleware(request, context, next);

      expect(nextCalled).toBe(true);
      expect(response.status).toBe(200);
    });

    test("returns 405 for PUT on /graphql", async () => {
      const request = createMockRequest("PUT", "http://localhost:4000/graphql");
      const context = createMockContext({
        url: new URL("http://localhost:4000/graphql"),
        method: "PUT",
      });
      const next = async () => new Response("OK", { status: 200 });

      const response = await methodValidationMiddleware(request, context, next);

      expect(response.status).toBe(405);
    });

    test("returns 405 for DELETE on /graphql", async () => {
      const request = createMockRequest("DELETE", "http://localhost:4000/graphql");
      const context = createMockContext({
        url: new URL("http://localhost:4000/graphql"),
        method: "DELETE",
      });
      const next = async () => new Response("OK", { status: 200 });

      const response = await methodValidationMiddleware(request, context, next);

      expect(response.status).toBe(405);
    });

    test("405 for /graphql includes Allow header with GET, POST, OPTIONS", async () => {
      const request = createMockRequest("PUT", "http://localhost:4000/graphql");
      const context = createMockContext({
        url: new URL("http://localhost:4000/graphql"),
        method: "PUT",
      });
      const next = async () => new Response("OK", { status: 200 });

      const response = await methodValidationMiddleware(request, context, next);

      expect(response.headers.get("Allow")).toBe("GET, POST, OPTIONS");
    });
  });

  describe("405 response format", () => {
    test("405 response body contains problem details format", async () => {
      const request = createMockRequest("PATCH", "http://localhost:4000/health");
      const context = createMockContext({
        url: new URL("http://localhost:4000/health"),
        method: "PATCH",
      });
      const next = async () => new Response("OK", { status: 200 });

      const response = await methodValidationMiddleware(request, context, next);
      const body = await response.json();

      expect(body.type).toBeString();
      expect(body.title).toBeString();
      expect(body.status).toBe(405);
      expect(body.detail).toContain("Allowed methods");
    });

    test("does not call next when returning 405", async () => {
      const request = createMockRequest("DELETE", "http://localhost:4000/health");
      const context = createMockContext({
        url: new URL("http://localhost:4000/health"),
        method: "DELETE",
      });
      let nextCalled = false;
      const next = async () => {
        nextCalled = true;
        return new Response("OK", { status: 200 });
      };

      await methodValidationMiddleware(request, context, next);

      expect(nextCalled).toBe(false);
    });
  });
});
