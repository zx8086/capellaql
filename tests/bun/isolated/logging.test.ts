/* tests/bun/unit/middleware/logging.test.ts */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { RequestContext } from "../../../src/server/types";

// -- Mock OpenTelemetry metrics API --
const mockAdd = mock(() => {});
const mockRecord = mock(() => {});
const mockMeter = {
  createCounter: mock(() => ({ add: mockAdd })),
  createHistogram: mock(() => ({ record: mockRecord })),
  createUpDownCounter: mock(() => ({ add: mockAdd })),
};

mock.module("@opentelemetry/api", () => ({
  metrics: { getMeter: mock(() => mockMeter) },
}));

// -- Mock telemetry logging and metrics --
const mockErr = mock(() => {});
const mockLog = mock(() => {});
const mockWarn = mock(() => {});
const mockRecordHttpRequest = mock(() => {});
const mockRecordHttpResponseTime = mock(() => {});

mock.module("../../../src/telemetry", () => ({
  err: mockErr,
  log: mockLog,
  warn: mockWarn,
  recordHttpRequest: mockRecordHttpRequest,
  recordHttpResponseTime: mockRecordHttpResponseTime,
}));

// Import after mocks are registered
const { loggingMiddleware } = await import("../../../src/server/middleware/logging");

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

describe("Logging Middleware", () => {
  beforeEach(() => {
    mockAdd.mockClear();
    mockRecord.mockClear();
    mockErr.mockClear();
    mockLog.mockClear();
    mockWarn.mockClear();
    mockRecordHttpRequest.mockClear();
    mockRecordHttpResponseTime.mockClear();
  });

  describe("core behavior", () => {
    test("calls next() and returns the response", async () => {
      const request = createMockRequest();
      const context = createMockContext();
      const nextResponse = new Response("ok", { status: 200 });
      const next = async () => nextResponse;

      const response = await loggingMiddleware(request, context, next);

      expect(response).toBe(nextResponse);
    });
  });

  describe("logging levels", () => {
    test("logs normal request with log()", async () => {
      const request = createMockRequest();
      const context = createMockContext({ startTime: Date.now() });
      const next = async () => new Response("ok", { status: 200 });

      await loggingMiddleware(request, context, next);

      expect(mockLog).toHaveBeenCalledTimes(1);
      expect(mockErr).not.toHaveBeenCalled();
      expect(mockWarn).not.toHaveBeenCalled();
    });

    test("logs slow request (> 1000ms) with warn()", async () => {
      const request = createMockRequest();
      // Set startTime far enough in the past to simulate >1000ms duration
      const context = createMockContext({ startTime: Date.now() - 1500 });
      const next = async () => new Response("ok", { status: 200 });

      await loggingMiddleware(request, context, next);

      expect(mockWarn).toHaveBeenCalledTimes(1);
      expect(mockLog).not.toHaveBeenCalled();
      expect(mockErr).not.toHaveBeenCalled();
    });

    test("logs very slow request (> 5000ms) with warn()", async () => {
      const request = createMockRequest();
      const context = createMockContext({ startTime: Date.now() - 6000 });
      const next = async () => new Response("ok", { status: 200 });

      await loggingMiddleware(request, context, next);

      expect(mockWarn).toHaveBeenCalledTimes(1);
      const callArgs = mockWarn.mock.calls[0];
      expect(callArgs[0]).toContain("Very slow request");
    });

    test("logs error response (status >= 400) with err()", async () => {
      const request = createMockRequest();
      const context = createMockContext({ startTime: Date.now() });
      const next = async () => new Response("Not Found", { status: 404 });

      await loggingMiddleware(request, context, next);

      expect(mockErr).toHaveBeenCalledTimes(1);
      expect(mockLog).not.toHaveBeenCalled();
      expect(mockWarn).not.toHaveBeenCalled();
    });

    test("logs 500 error with err()", async () => {
      const request = createMockRequest();
      const context = createMockContext({ startTime: Date.now() });
      const next = async () => new Response("Server Error", { status: 500 });

      await loggingMiddleware(request, context, next);

      expect(mockErr).toHaveBeenCalledTimes(1);
    });
  });

  describe("metrics recording", () => {
    test("records HTTP request metrics via recordHttpRequest", async () => {
      const request = createMockRequest("POST", "http://localhost:4000/graphql");
      const context = createMockContext({
        method: "POST",
        url: new URL("http://localhost:4000/graphql"),
      });
      const next = async () => new Response("ok", { status: 200 });

      await loggingMiddleware(request, context, next);

      expect(mockRecordHttpRequest).toHaveBeenCalledTimes(1);
      expect(mockRecordHttpRequest).toHaveBeenCalledWith("POST", "/graphql");
    });

    test("records response duration via recordHttpResponseTime", async () => {
      const request = createMockRequest();
      const context = createMockContext({ startTime: Date.now() });
      const next = async () => new Response("ok", { status: 200 });

      await loggingMiddleware(request, context, next);

      expect(mockRecordHttpResponseTime).toHaveBeenCalledTimes(1);
      // Duration should be a non-negative number
      const duration = mockRecordHttpResponseTime.mock.calls[0][0];
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    test("increments request counter", async () => {
      const request = createMockRequest("GET", "http://localhost:4000/health");
      const context = createMockContext({
        url: new URL("http://localhost:4000/health"),
      });
      const next = async () => new Response("ok", { status: 200 });

      await loggingMiddleware(request, context, next);

      // mockAdd is shared between requestCounter and activeConnections
      // requestCounter.add(1, ...) is called first, then activeConnections.add(1), then activeConnections.add(-1)
      expect(mockAdd).toHaveBeenCalled();
      const firstCall = mockAdd.mock.calls[0];
      expect(firstCall[0]).toBe(1);
    });

    test("records response histogram with method and status_code", async () => {
      const request = createMockRequest("POST", "http://localhost:4000/graphql");
      const context = createMockContext({
        method: "POST",
        startTime: Date.now(),
      });
      const next = async () => new Response("ok", { status: 200 });

      await loggingMiddleware(request, context, next);

      expect(mockRecord).toHaveBeenCalledTimes(1);
      const [duration, labels] = mockRecord.mock.calls[0];
      expect(duration).toBeGreaterThanOrEqual(0);
      expect(labels).toEqual({
        method: "POST",
        status_code: "200",
      });
    });
  });

  describe("connection tracking", () => {
    test("decrements activeConnections even when next() succeeds", async () => {
      const request = createMockRequest();
      const context = createMockContext();
      const next = async () => new Response("ok", { status: 200 });

      await loggingMiddleware(request, context, next);

      // Verify add was called with -1 (the finally block)
      const addCalls = mockAdd.mock.calls;
      const decrementCall = addCalls.find(
        (call: Parameters<typeof mockAdd>) => call[0] === -1
      );
      expect(decrementCall).toBeDefined();
    });

    test("decrements activeConnections even when next() throws", async () => {
      const request = createMockRequest();
      const context = createMockContext();
      const next = async () => {
        throw new Error("handler error");
      };

      try {
        await loggingMiddleware(request, context, next);
      } catch {
        // Expected to throw
      }

      // The finally block should still decrement
      const addCalls = mockAdd.mock.calls;
      const decrementCall = addCalls.find(
        (call: Parameters<typeof mockAdd>) => call[0] === -1
      );
      expect(decrementCall).toBeDefined();
    });
  });
});
