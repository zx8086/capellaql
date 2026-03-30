/* tests/bun/unit/middleware/cors.test.ts */
import { describe, expect, test } from "bun:test";
import { corsMiddleware } from "../../../../src/server/middleware/cors";
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

function createMockRequest(method = "GET", url = "http://localhost:4000/graphql"): Request {
  return new Request(url, { method });
}

describe("CORS Middleware", () => {
  describe("OPTIONS preflight", () => {
    test("returns 204 static response for OPTIONS requests", async () => {
      const request = createMockRequest("OPTIONS");
      const context = createMockContext({ method: "OPTIONS" });
      const next = async () => new Response("should not reach", { status: 200 });

      const response = await corsMiddleware(request, context, next);

      expect(response.status).toBe(204);
    });

    test("OPTIONS response has all 4 CORS headers", async () => {
      const request = createMockRequest("OPTIONS");
      const context = createMockContext({ method: "OPTIONS" });
      const next = async () => new Response("should not reach", { status: 200 });

      const response = await corsMiddleware(request, context, next);

      expect(response.headers.get("Access-Control-Allow-Origin")).not.toBeNull();
      expect(response.headers.get("Access-Control-Allow-Methods")).not.toBeNull();
      expect(response.headers.get("Access-Control-Allow-Headers")).not.toBeNull();
      expect(response.headers.get("Access-Control-Max-Age")).not.toBeNull();
    });
  });

  describe("non-OPTIONS responses", () => {
    test("adds CORS headers to non-OPTIONS responses", async () => {
      const request = createMockRequest("GET");
      const context = createMockContext();
      const next = async () => new Response("OK", { status: 200 });

      const response = await corsMiddleware(request, context, next);

      expect(response.headers.get("Access-Control-Allow-Origin")).not.toBeNull();
      expect(response.headers.get("Access-Control-Allow-Methods")).not.toBeNull();
      expect(response.headers.get("Access-Control-Allow-Headers")).not.toBeNull();
      expect(response.headers.get("Access-Control-Max-Age")).not.toBeNull();
    });

    test("preserves original response status", async () => {
      const request = createMockRequest("POST");
      const context = createMockContext({ method: "POST" });
      const next = async () => new Response("Created", { status: 201 });

      const response = await corsMiddleware(request, context, next);

      expect(response.status).toBe(201);
    });

    test("preserves original response body", async () => {
      const request = createMockRequest("GET");
      const context = createMockContext();
      const next = async () => new Response("response-body-content", { status: 200 });

      const response = await corsMiddleware(request, context, next);
      const body = await response.text();

      expect(body).toBe("response-body-content");
    });

    test("preserves original response statusText", async () => {
      const request = createMockRequest("GET");
      const context = createMockContext();
      const next = async () =>
        new Response("OK", { status: 200, statusText: "Custom Status Text" });

      const response = await corsMiddleware(request, context, next);

      expect(response.statusText).toBe("Custom Status Text");
    });
  });

  describe("individual CORS header values", () => {
    test("adds Access-Control-Allow-Origin: *", async () => {
      const request = createMockRequest("GET");
      const context = createMockContext();
      const next = async () => new Response("OK", { status: 200 });

      const response = await corsMiddleware(request, context, next);

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });

    test("adds Access-Control-Allow-Methods: GET, POST, OPTIONS", async () => {
      const request = createMockRequest("GET");
      const context = createMockContext();
      const next = async () => new Response("OK", { status: 200 });

      const response = await corsMiddleware(request, context, next);

      expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
        "GET, POST, OPTIONS"
      );
    });

    test("adds Access-Control-Allow-Headers: Content-Type", async () => {
      const request = createMockRequest("GET");
      const context = createMockContext();
      const next = async () => new Response("OK", { status: 200 });

      const response = await corsMiddleware(request, context, next);

      expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
    });

    test("adds Access-Control-Max-Age: 86400", async () => {
      const request = createMockRequest("GET");
      const context = createMockContext();
      const next = async () => new Response("OK", { status: 200 });

      const response = await corsMiddleware(request, context, next);

      expect(response.headers.get("Access-Control-Max-Age")).toBe("86400");
    });
  });

  describe("header preservation", () => {
    test("preserves existing response headers alongside CORS headers", async () => {
      const request = createMockRequest("GET");
      const context = createMockContext();
      const next = async () =>
        new Response("OK", {
          status: 200,
          headers: { "X-Custom-Header": "custom-value" },
        });

      const response = await corsMiddleware(request, context, next);

      expect(response.headers.get("X-Custom-Header")).toBe("custom-value");
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });
});
