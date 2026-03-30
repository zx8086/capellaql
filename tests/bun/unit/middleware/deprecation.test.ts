/* tests/bun/unit/middleware/deprecation.test.ts */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  DEPRECATED_ROUTES,
  deprecationMiddleware,
} from "../../../../src/server/middleware/deprecation";
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

describe("Deprecation Middleware", () => {
  beforeEach(() => {
    DEPRECATED_ROUTES.clear();
  });

  afterEach(() => {
    DEPRECATED_ROUTES.clear();
  });

  describe("no-op fast paths", () => {
    test("returns response unchanged when DEPRECATED_ROUTES is empty", async () => {
      const request = createMockRequest();
      const context = createMockContext();
      const original = new Response("ok", { status: 200 });
      const next = async () => original;

      const response = await deprecationMiddleware(request, context, next);

      expect(response).toBe(original);
    });

    test("returns response unchanged for non-deprecated routes", async () => {
      DEPRECATED_ROUTES.set("/api/v1/old", {
        sunset: "2026-06-01T00:00:00Z",
      });

      const request = createMockRequest();
      const context = createMockContext({
        url: new URL("http://localhost:4000/api/v2/new"),
      });
      const original = new Response("ok", { status: 200 });
      const next = async () => original;

      const response = await deprecationMiddleware(request, context, next);

      expect(response).toBe(original);
    });
  });

  describe("RFC 8594 Sunset header", () => {
    test("adds Sunset header for deprecated route", async () => {
      const sunsetDate = "2026-06-01T00:00:00Z";
      DEPRECATED_ROUTES.set("/graphql", { sunset: sunsetDate });

      const request = createMockRequest();
      const context = createMockContext();
      const next = async () => new Response("ok", { status: 200 });

      const response = await deprecationMiddleware(request, context, next);

      expect(response.headers.get("Sunset")).toBe(sunsetDate);
    });

    test("adds Deprecation: true header", async () => {
      DEPRECATED_ROUTES.set("/graphql", { sunset: "2026-06-01T00:00:00Z" });

      const request = createMockRequest();
      const context = createMockContext();
      const next = async () => new Response("ok", { status: 200 });

      const response = await deprecationMiddleware(request, context, next);

      expect(response.headers.get("Deprecation")).toBe("true");
    });
  });

  describe("RFC 8288 Link header", () => {
    test("adds Link header with sunset rel when link is configured", async () => {
      const link = "https://capellaql.tommy.com/docs/migration/v2";
      DEPRECATED_ROUTES.set("/graphql", {
        sunset: "2026-06-01T00:00:00Z",
        link,
      });

      const request = createMockRequest();
      const context = createMockContext();
      const next = async () => new Response("ok", { status: 200 });

      const response = await deprecationMiddleware(request, context, next);

      expect(response.headers.get("Link")).toBe(`<${link}>; rel="sunset"`);
    });

    test("appends to existing Link header", async () => {
      const link = "https://capellaql.tommy.com/docs/migration/v2";
      DEPRECATED_ROUTES.set("/graphql", {
        sunset: "2026-06-01T00:00:00Z",
        link,
      });

      const request = createMockRequest();
      const context = createMockContext();
      const existingLink = '<https://example.com>; rel="canonical"';
      const next = async () =>
        new Response("ok", {
          status: 200,
          headers: { Link: existingLink },
        });

      const response = await deprecationMiddleware(request, context, next);

      const linkHeader = response.headers.get("Link");
      expect(linkHeader).toBe(`${existingLink}, <${link}>; rel="sunset"`);
    });
  });

  describe("X-Deprecation-Notice header", () => {
    test("adds X-Deprecation-Notice when message is configured", async () => {
      const message = "Use /api/v2/new-endpoint instead";
      DEPRECATED_ROUTES.set("/graphql", {
        sunset: "2026-06-01T00:00:00Z",
        message,
      });

      const request = createMockRequest();
      const context = createMockContext();
      const next = async () => new Response("ok", { status: 200 });

      const response = await deprecationMiddleware(request, context, next);

      expect(response.headers.get("X-Deprecation-Notice")).toBe(message);
    });

    test("does not add X-Deprecation-Notice when no message is configured", async () => {
      DEPRECATED_ROUTES.set("/graphql", {
        sunset: "2026-06-01T00:00:00Z",
      });

      const request = createMockRequest();
      const context = createMockContext();
      const next = async () => new Response("ok", { status: 200 });

      const response = await deprecationMiddleware(request, context, next);

      expect(response.headers.get("X-Deprecation-Notice")).toBeNull();
    });
  });

  describe("response preservation", () => {
    test("preserves original response status", async () => {
      DEPRECATED_ROUTES.set("/graphql", {
        sunset: "2026-06-01T00:00:00Z",
      });

      const request = createMockRequest();
      const context = createMockContext();
      const next = async () =>
        new Response("created", { status: 201, statusText: "Created" });

      const response = await deprecationMiddleware(request, context, next);

      expect(response.status).toBe(201);
      expect(response.statusText).toBe("Created");
    });

    test("preserves original response body", async () => {
      DEPRECATED_ROUTES.set("/graphql", {
        sunset: "2026-06-01T00:00:00Z",
      });

      const request = createMockRequest();
      const context = createMockContext();
      const body = JSON.stringify({ data: { hello: "world" } });
      const next = async () => new Response(body, { status: 200 });

      const response = await deprecationMiddleware(request, context, next);
      const text = await response.text();

      expect(text).toBe(body);
    });
  });
});
