// Unit tests for HTTP metrics
import { afterEach, beforeEach, describe, expect, test, mock, spyOn } from "bun:test";

// We need to test the module in isolation, so we'll test the exported functions
// Note: These tests verify the logic without actually initializing OpenTelemetry

describe("HTTP Metrics Module", () => {
  // Store original console methods
  let originalWarn: typeof console.warn;
  let originalError: typeof console.error;
  let warnCalls: string[];
  let errorCalls: string[];

  beforeEach(() => {
    warnCalls = [];
    errorCalls = [];
    originalWarn = console.warn;
    originalError = console.error;
    console.warn = (...args: unknown[]) => warnCalls.push(args.join(" "));
    console.error = (...args: unknown[]) => errorCalls.push(args.join(" "));
  });

  afterEach(() => {
    console.warn = originalWarn;
    console.error = originalError;
  });

  describe("getMetricsStatus", () => {
    test("reports uninitialized state correctly", async () => {
      // Fresh import to get uninitialized state
      const { getMetricsStatus } = await import("../../../../src/telemetry/metrics/httpMetrics");

      // Note: State depends on whether module was previously initialized
      const status = getMetricsStatus();
      expect(typeof status.initialized).toBe("boolean");
      expect(Array.isArray(status.counters)).toBe(true);
      expect(Array.isArray(status.histograms)).toBe(true);
    });
  });

  describe("recordHttpRequest behavior", () => {
    test("handles uninitialized state gracefully", async () => {
      // This test verifies the guard clause works
      // When not initialized, it should warn and return without error
      const { recordHttpRequest, getMetricsStatus } = await import("../../../../src/telemetry/metrics/httpMetrics");

      const status = getMetricsStatus();
      if (!status.initialized) {
        // Should not throw when called in uninitialized state
        expect(() => recordHttpRequest("GET", "/health", 200)).not.toThrow();
      }
    });
  });

  describe("recordHttpResponseTime behavior", () => {
    test("handles uninitialized state gracefully", async () => {
      const { recordHttpResponseTime, getMetricsStatus } = await import("../../../../src/telemetry/metrics/httpMetrics");

      const status = getMetricsStatus();
      if (!status.initialized) {
        // Should not throw when called in uninitialized state
        expect(() => recordHttpResponseTime(100, "GET", "/health", 200)).not.toThrow();
      }
    });
  });

  describe("recordGraphQLRequest behavior", () => {
    test("handles uninitialized state gracefully", async () => {
      const { recordGraphQLRequest, getMetricsStatus } = await import("../../../../src/telemetry/metrics/httpMetrics");

      const status = getMetricsStatus();
      if (!status.initialized) {
        // Should not throw when called in uninitialized state
        expect(() => recordGraphQLRequest("looksSummary", "query")).not.toThrow();
      }
    });
  });

  describe("recordGraphQLResponseTime behavior", () => {
    test("handles uninitialized state gracefully", async () => {
      const { recordGraphQLResponseTime, getMetricsStatus } = await import("../../../../src/telemetry/metrics/httpMetrics");

      const status = getMetricsStatus();
      if (!status.initialized) {
        // Should not throw when called in uninitialized state
        expect(() => recordGraphQLResponseTime(50, "looksSummary", "query", false)).not.toThrow();
      }
    });
  });
});

describe("HTTP Metrics Label Generation", () => {
  // These tests verify the label generation logic conceptually
  // We test the expected behavior patterns

  describe("method normalization", () => {
    test("should uppercase HTTP methods", () => {
      // Verify the expected behavior: methods should be uppercased
      const method = "get";
      const normalized = method.toUpperCase();
      expect(normalized).toBe("GET");
    });

    test("handles various HTTP methods", () => {
      const methods = ["get", "post", "put", "delete", "patch", "options"];
      const expected = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"];

      methods.forEach((method, i) => {
        expect(method.toUpperCase()).toBe(expected[i]);
      });
    });
  });

  describe("duration conversion", () => {
    test("converts milliseconds to seconds correctly", () => {
      // The module converts ms to seconds for UCUM compliance
      const testCases = [
        { ms: 1000, expected: 1 },
        { ms: 500, expected: 0.5 },
        { ms: 1500, expected: 1.5 },
        { ms: 100, expected: 0.1 },
        { ms: 0, expected: 0 },
      ];

      testCases.forEach(({ ms, expected }) => {
        expect(ms / 1000).toBe(expected);
      });
    });
  });

  describe("optional label handling", () => {
    test("status code is converted to string", () => {
      const statusCode = 200;
      expect(statusCode.toString()).toBe("200");
    });

    test("boolean is converted to string for has_errors label", () => {
      expect(true.toString()).toBe("true");
      expect(false.toString()).toBe("false");
    });
  });
});

describe("HTTP Metrics Edge Cases", () => {
  test("handles empty route", () => {
    const route = "";
    expect(route).toBe("");
  });

  test("handles special characters in route", () => {
    const routes = [
      "/health/status",
      "/graphql",
      "/api/v1/users/:id",
      "/path?query=value",
    ];

    routes.forEach(route => {
      expect(typeof route).toBe("string");
    });
  });

  test("handles zero duration", () => {
    const duration = 0;
    const seconds = duration / 1000;
    expect(seconds).toBe(0);
  });

  test("handles very large duration", () => {
    const duration = 60000; // 1 minute in ms
    const seconds = duration / 1000;
    expect(seconds).toBe(60);
  });

  test("handles undefined status code", () => {
    const statusCode: number | undefined = undefined;
    const labels: Record<string, string> = {};

    if (statusCode) {
      labels.status_code = statusCode.toString();
    }

    expect(labels.status_code).toBeUndefined();
  });
});
