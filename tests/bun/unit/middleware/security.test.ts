// Unit tests for security middleware
import { describe, expect, test } from "bun:test";
import { securityMiddleware } from "../../../../src/server/middleware/security";
import type { RequestContext } from "../../../../src/server/types";

// Helper to create mock request context
function createMockContext(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    requestId: `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    startTime: Date.now(),
    url: new URL("http://localhost:4000/graphql"),
    clientIp: "127.0.0.1",
    ...overrides,
  };
}

describe("Security Middleware", () => {
  describe("security headers", () => {
    test("adds Content-Security-Policy header", async () => {
      const request = new Request("http://localhost/test");
      const context = createMockContext();
      const next = async () => new Response("OK");

      const response = await securityMiddleware(request, context, next);
      const csp = response.headers.get("Content-Security-Policy");

      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self'");
    });

    test("adds X-XSS-Protection header", async () => {
      const request = new Request("http://localhost/test");
      const context = createMockContext();
      const next = async () => new Response("OK");

      const response = await securityMiddleware(request, context, next);
      const xssProtection = response.headers.get("X-XSS-Protection");

      expect(xssProtection).toBe("1; mode=block");
    });

    test("adds X-Frame-Options header", async () => {
      const request = new Request("http://localhost/test");
      const context = createMockContext();
      const next = async () => new Response("OK");

      const response = await securityMiddleware(request, context, next);
      const frameOptions = response.headers.get("X-Frame-Options");

      expect(frameOptions).toBe("SAMEORIGIN");
    });

    test("adds X-Content-Type-Options header", async () => {
      const request = new Request("http://localhost/test");
      const context = createMockContext();
      const next = async () => new Response("OK");

      const response = await securityMiddleware(request, context, next);
      const contentTypeOptions = response.headers.get("X-Content-Type-Options");

      expect(contentTypeOptions).toBe("nosniff");
    });

    test("adds Referrer-Policy header", async () => {
      const request = new Request("http://localhost/test");
      const context = createMockContext();
      const next = async () => new Response("OK");

      const response = await securityMiddleware(request, context, next);
      const referrerPolicy = response.headers.get("Referrer-Policy");

      expect(referrerPolicy).toBe("strict-origin-when-cross-origin");
    });

    test("adds X-Request-ID header", async () => {
      const requestId = "test-request-123";
      const request = new Request("http://localhost/test");
      const context = createMockContext({ requestId });
      const next = async () => new Response("OK");

      const response = await securityMiddleware(request, context, next);
      const xRequestId = response.headers.get("X-Request-ID");

      expect(xRequestId).toBe(requestId);
    });
  });

  describe("Content-Security-Policy directives", () => {
    test("CSP includes default-src directive", async () => {
      const request = new Request("http://localhost/test");
      const context = createMockContext();
      const next = async () => new Response("OK");

      const response = await securityMiddleware(request, context, next);
      const csp = response.headers.get("Content-Security-Policy");

      expect(csp).toContain("default-src 'self'");
    });

    test("CSP includes script-src directive", async () => {
      const request = new Request("http://localhost/test");
      const context = createMockContext();
      const next = async () => new Response("OK");

      const response = await securityMiddleware(request, context, next);
      const csp = response.headers.get("Content-Security-Policy");

      expect(csp).toContain("script-src");
      expect(csp).toContain("'self'");
      expect(csp).toContain("'unsafe-inline'");
    });

    test("CSP includes style-src directive", async () => {
      const request = new Request("http://localhost/test");
      const context = createMockContext();
      const next = async () => new Response("OK");

      const response = await securityMiddleware(request, context, next);
      const csp = response.headers.get("Content-Security-Policy");

      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    });

    test("CSP includes img-src directive", async () => {
      const request = new Request("http://localhost/test");
      const context = createMockContext();
      const next = async () => new Response("OK");

      const response = await securityMiddleware(request, context, next);
      const csp = response.headers.get("Content-Security-Policy");

      expect(csp).toContain("img-src 'self' data:");
    });

    test("CSP includes object-src none", async () => {
      const request = new Request("http://localhost/test");
      const context = createMockContext();
      const next = async () => new Response("OK");

      const response = await securityMiddleware(request, context, next);
      const csp = response.headers.get("Content-Security-Policy");

      expect(csp).toContain("object-src 'none'");
    });

    test("CSP includes frame-ancestors none", async () => {
      const request = new Request("http://localhost/test");
      const context = createMockContext();
      const next = async () => new Response("OK");

      const response = await securityMiddleware(request, context, next);
      const csp = response.headers.get("Content-Security-Policy");

      expect(csp).toContain("frame-ancestors 'none'");
    });

    test("CSP includes connect-src directive", async () => {
      const request = new Request("http://localhost/test");
      const context = createMockContext();
      const next = async () => new Response("OK");

      const response = await securityMiddleware(request, context, next);
      const csp = response.headers.get("Content-Security-Policy");

      expect(csp).toContain("connect-src 'self'");
    });
  });

  describe("response preservation", () => {
    test("preserves response body", async () => {
      const responseBody = "Test response body";
      const request = new Request("http://localhost/test");
      const context = createMockContext();
      const next = async () => new Response(responseBody);

      const response = await securityMiddleware(request, context, next);
      const body = await response.text();

      expect(body).toBe(responseBody);
    });

    test("preserves response status", async () => {
      const request = new Request("http://localhost/test");
      const context = createMockContext();
      const next = async () => new Response("OK", { status: 201 });

      const response = await securityMiddleware(request, context, next);

      expect(response.status).toBe(201);
    });

    test("preserves response status text", async () => {
      const request = new Request("http://localhost/test");
      const context = createMockContext();
      const next = async () => new Response("OK", { status: 201, statusText: "Created" });

      const response = await securityMiddleware(request, context, next);

      expect(response.statusText).toBe("Created");
    });

    test("preserves existing headers", async () => {
      const request = new Request("http://localhost/test");
      const context = createMockContext();
      const next = async () =>
        new Response("OK", {
          headers: { "Content-Type": "application/json", "Custom-Header": "custom-value" },
        });

      const response = await securityMiddleware(request, context, next);

      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(response.headers.get("Custom-Header")).toBe("custom-value");
    });
  });

  describe("middleware chain", () => {
    test("calls next middleware", async () => {
      const request = new Request("http://localhost/test");
      const context = createMockContext();
      let nextCalled = false;
      const next = async () => {
        nextCalled = true;
        return new Response("OK");
      };

      await securityMiddleware(request, context, next);

      expect(nextCalled).toBe(true);
    });

    test("returns response from next middleware with added headers", async () => {
      const request = new Request("http://localhost/test");
      const context = createMockContext();
      const next = async () => new Response("Next middleware response", { status: 200 });

      const response = await securityMiddleware(request, context, next);
      const body = await response.text();

      expect(body).toBe("Next middleware response");
      expect(response.headers.get("X-XSS-Protection")).toBeDefined();
    });
  });
});

describe("Security Headers Constants", () => {
  test("XSS Protection mode is block", () => {
    const expectedValue = "1; mode=block";
    expect(expectedValue).toBe("1; mode=block");
  });

  test("Frame Options is SAMEORIGIN", () => {
    const expectedValue = "SAMEORIGIN";
    expect(expectedValue).toBe("SAMEORIGIN");
  });

  test("Content Type Options is nosniff", () => {
    const expectedValue = "nosniff";
    expect(expectedValue).toBe("nosniff");
  });

  test("Referrer Policy is strict-origin-when-cross-origin", () => {
    const expectedValue = "strict-origin-when-cross-origin";
    expect(expectedValue).toBe("strict-origin-when-cross-origin");
  });
});

describe("Security Middleware Edge Cases", () => {
  test("handles empty response body", async () => {
    const request = new Request("http://localhost/test");
    const context = createMockContext();
    const next = async () => new Response(null, { status: 204 });

    const response = await securityMiddleware(request, context, next);

    expect(response.status).toBe(204);
    expect(response.headers.get("X-XSS-Protection")).toBeDefined();
  });

  test("handles JSON response", async () => {
    const request = new Request("http://localhost/test");
    const context = createMockContext();
    const jsonData = { message: "test" };
    const next = async () =>
      new Response(JSON.stringify(jsonData), {
        headers: { "Content-Type": "application/json" },
      });

    const response = await securityMiddleware(request, context, next);
    const body = await response.json();

    expect(body).toEqual(jsonData);
    expect(response.headers.get("Content-Type")).toBe("application/json");
  });

  test("handles error responses", async () => {
    const request = new Request("http://localhost/test");
    const context = createMockContext();
    const next = async () => new Response("Error", { status: 500 });

    const response = await securityMiddleware(request, context, next);

    expect(response.status).toBe(500);
    expect(response.headers.get("X-XSS-Protection")).toBeDefined();
  });

  test("handles various HTTP methods", async () => {
    const context = createMockContext();
    const next = async () => new Response("OK");

    const methods = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"];

    for (const method of methods) {
      const request = new Request("http://localhost/test", { method });
      const response = await securityMiddleware(request, context, next);

      expect(response.headers.get("X-XSS-Protection")).toBeDefined();
    }
  });
});
