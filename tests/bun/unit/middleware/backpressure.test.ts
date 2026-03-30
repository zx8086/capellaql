/* tests/bun/unit/middleware/backpressure.test.ts */
import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { RequestContext } from "../../../../src/server/types";

// Mock memoryGuardian before importing the middleware
const mockGetPressureLevel = mock(() => "normal" as string);
const mockGetRetryAfter = mock(() => 30);
const mockGetStatus = mock(() => ({
  pressureLevel: "critical" as const,
  heapUsedMB: 512,
  heapTotalMB: 768,
  rssMB: 890,
  heapUsageRatio: 0.961,
  timestamp: Date.now(),
}));

mock.module("../../../../src/lib/memoryGuardian", () => ({
  memoryGuardian: {
    getPressureLevel: mockGetPressureLevel,
    getRetryAfter: mockGetRetryAfter,
    getStatus: mockGetStatus,
  },
}));

const { backpressureMiddleware } = await import(
  "../../../../src/server/middleware/backpressure"
);

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

function createMockRequest(url = "http://localhost:4000/graphql"): Request {
  return new Request(url);
}

describe("Backpressure Middleware", () => {
  beforeEach(() => {
    mockGetPressureLevel.mockReset();
    mockGetRetryAfter.mockReset();
    mockGetStatus.mockReset();

    mockGetPressureLevel.mockReturnValue("normal");
    mockGetRetryAfter.mockReturnValue(30);
    mockGetStatus.mockReturnValue({
      pressureLevel: "critical",
      heapUsedMB: 512,
      heapTotalMB: 768,
      rssMB: 890,
      heapUsageRatio: 0.961,
      timestamp: Date.now(),
    });
  });

  describe("health endpoint bypass", () => {
    const healthPaths = ["/health", "/health/system", "/health/telemetry"];

    for (const path of healthPaths) {
      test(`allows ${path} through regardless of pressure level`, async () => {
        mockGetPressureLevel.mockReturnValue("critical");

        const request = createMockRequest(`http://localhost:4000${path}`);
        const context = createMockContext({
          url: new URL(`http://localhost:4000${path}`),
        });
        let nextCalled = false;
        const next = async () => {
          nextCalled = true;
          return new Response("OK", { status: 200 });
        };

        const response = await backpressureMiddleware(request, context, next);

        expect(nextCalled).toBe(true);
        expect(response.status).toBe(200);
      });
    }
  });

  describe("non-critical pressure levels", () => {
    const nonCriticalLevels = ["normal", "elevated", "high"] as const;

    for (const level of nonCriticalLevels) {
      test(`passes through when pressure level is "${level}"`, async () => {
        mockGetPressureLevel.mockReturnValue(level);

        const request = createMockRequest();
        const context = createMockContext();
        let nextCalled = false;
        const next = async () => {
          nextCalled = true;
          return new Response("OK", { status: 200 });
        };

        const response = await backpressureMiddleware(request, context, next);

        expect(nextCalled).toBe(true);
        expect(response.status).toBe(200);
      });
    }
  });

  describe("critical pressure", () => {
    test("returns 503 when pressure is critical", async () => {
      mockGetPressureLevel.mockReturnValue("critical");

      const request = createMockRequest();
      const context = createMockContext();
      const next = async () => new Response("OK", { status: 200 });

      const response = await backpressureMiddleware(request, context, next);

      expect(response.status).toBe(503);
    });

    test("includes Retry-After header in 503 response", async () => {
      mockGetPressureLevel.mockReturnValue("critical");
      mockGetRetryAfter.mockReturnValue(30);

      const request = createMockRequest();
      const context = createMockContext();
      const next = async () => new Response("OK", { status: 200 });

      const response = await backpressureMiddleware(request, context, next);

      expect(response.headers.get("Retry-After")).toBe("30");
    });

    test("response body contains problem details format", async () => {
      mockGetPressureLevel.mockReturnValue("critical");

      const request = createMockRequest();
      const context = createMockContext();
      const next = async () => new Response("OK", { status: 200 });

      const response = await backpressureMiddleware(request, context, next);
      const body = await response.json();

      expect(body.type).toBeString();
      expect(body.title).toBeString();
      expect(body.status).toBe(503);
      expect(body.detail).toBeString();
      expect(body.timestamp).toBeString();
    });

    test("includes memory pressure info in response extensions", async () => {
      mockGetPressureLevel.mockReturnValue("critical");
      mockGetRetryAfter.mockReturnValue(30);
      mockGetStatus.mockReturnValue({
        pressureLevel: "critical",
        heapUsedMB: 512,
        heapTotalMB: 768,
        rssMB: 890,
        heapUsageRatio: 0.961,
        timestamp: Date.now(),
      });

      const request = createMockRequest();
      const context = createMockContext();
      const next = async () => new Response("OK", { status: 200 });

      const response = await backpressureMiddleware(request, context, next);
      const body = await response.json();

      expect(body.extensions).toBeDefined();
      expect(body.extensions.pressureLevel).toBe("critical");
      expect(body.extensions.heapUsageMB).toBe(512);
      expect(body.extensions.retryAfter).toBe(30);
    });

    test("detail message includes heap usage percentage and RSS", async () => {
      mockGetPressureLevel.mockReturnValue("critical");
      mockGetStatus.mockReturnValue({
        pressureLevel: "critical",
        heapUsedMB: 512,
        heapTotalMB: 768,
        rssMB: 890,
        heapUsageRatio: 0.961,
        timestamp: Date.now(),
      });
      mockGetRetryAfter.mockReturnValue(30);

      const request = createMockRequest();
      const context = createMockContext();
      const next = async () => new Response("OK", { status: 200 });

      const response = await backpressureMiddleware(request, context, next);
      const body = await response.json();

      expect(body.detail).toContain("96.1%");
      expect(body.detail).toContain("RSS 890MB");
      expect(body.detail).toContain("retry after 30 seconds");
    });

    test("does not call next when returning 503", async () => {
      mockGetPressureLevel.mockReturnValue("critical");

      const request = createMockRequest();
      const context = createMockContext();
      let nextCalled = false;
      const next = async () => {
        nextCalled = true;
        return new Response("OK", { status: 200 });
      };

      await backpressureMiddleware(request, context, next);

      expect(nextCalled).toBe(false);
    });
  });
});
