/* tests/bun/unit/lib/metricsCardinalityManager.test.ts */
import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("../../../../src/telemetry/logger", () => ({
  log: mock(() => {}),
  warn: mock(() => {}),
}));

import {
  MetricsCardinalityManager,
  withCardinalityCheck,
} from "../../../../src/lib/metricsCardinalityManager";

// Access the class via the module's private constructor pattern
// The module exports a singleton, but we need fresh instances for testing.
// We'll test through the singleton and reset between tests.
import { metricsCardinalityManager } from "../../../../src/lib/metricsCardinalityManager";

describe("MetricsCardinalityManager", () => {
  beforeEach(() => {
    // Reset all cardinality tracking between tests
    metricsCardinalityManager.resetCardinality();
    metricsCardinalityManager.setEnabled(true);
  });

  describe("initialization", () => {
    test("has default cardinality limits", () => {
      const config = metricsCardinalityManager.getConfiguration();
      expect(config.limitsCount).toBeGreaterThan(0);
      expect(config.enabled).toBe(true);
    });

    test("includes expected default metrics", () => {
      const config = metricsCardinalityManager.getConfiguration();
      const metricNames = config.limits.map((l) => l.metricName);
      expect(metricNames).toContain("graphql_resolver_duration_ms");
      expect(metricNames).toContain("http_requests_total");
      expect(metricNames).toContain("database_operation_duration_ms");
    });
  });

  describe("checkCardinality", () => {
    test("allows new label combination within limits", () => {
      const result = metricsCardinalityManager.checkCardinality(
        "graphql_resolver_duration_ms",
        { operation: "GetUser", field: "name", status: "success" }
      );
      expect(result.allowed).toBe(true);
    });

    test("allows same label combination on subsequent check", () => {
      const labels = { operation: "GetUser", field: "name", status: "success" };
      metricsCardinalityManager.checkCardinality("graphql_resolver_duration_ms", labels);
      const result = metricsCardinalityManager.checkCardinality("graphql_resolver_duration_ms", labels);
      expect(result.allowed).toBe(true);
    });

    test("returns sanitized labels", () => {
      const result = metricsCardinalityManager.checkCardinality(
        "graphql_resolver_duration_ms",
        { operation: "GetUser", field: "name", status: "ok" }
      );
      expect(result.sanitizedLabels).toBeDefined();
    });

    test("allows requests when manager is disabled", () => {
      metricsCardinalityManager.setEnabled(false);
      const result = metricsCardinalityManager.checkCardinality(
        "graphql_resolver_duration_ms",
        { operation: "test" }
      );
      expect(result.allowed).toBe(true);
    });

    test("allows requests for unknown metrics (no limit configured)", () => {
      const result = metricsCardinalityManager.checkCardinality(
        "unknown_metric_that_doesnt_exist",
        { label: "value" }
      );
      expect(result.allowed).toBe(true);
    });

    test("rejects labels when cardinality limit is exceeded", () => {
      // Set a very low limit for testing
      metricsCardinalityManager.setCardinalityLimit("test_metric", {
        maxCardinality: 2,
        enabled: true,
      });

      // First two combinations should be allowed
      metricsCardinalityManager.checkCardinality("test_metric", { key: "a" });
      metricsCardinalityManager.checkCardinality("test_metric", { key: "b" });

      // Third should be rejected
      const result = metricsCardinalityManager.checkCardinality("test_metric", { key: "c" });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Cardinality limit");
    });

    test("returns fallback labels when rejected", () => {
      metricsCardinalityManager.setCardinalityLimit("test_metric2", {
        maxCardinality: 1,
        enabled: true,
      });

      metricsCardinalityManager.checkCardinality("test_metric2", { key: "a" });
      const result = metricsCardinalityManager.checkCardinality("test_metric2", { key: "b" });

      expect(result.allowed).toBe(false);
      expect(result.sanitizedLabels).toBeDefined();
      expect(result.sanitizedLabels?.status).toBe("cardinality_limited");
    });

    test("only counts relevant labels when labelKeys are configured", () => {
      // graphql_resolver_duration_ms has labelKeys: ["operation", "field", "status"]
      // Extra labels should be ignored for cardinality counting
      const result = metricsCardinalityManager.checkCardinality(
        "graphql_resolver_duration_ms",
        { operation: "GetUser", field: "name", status: "ok", extra: "ignored" }
      );
      expect(result.allowed).toBe(true);
      // Sanitized labels should only have relevant keys
      expect(result.sanitizedLabels).toBeDefined();
      expect(result.sanitizedLabels?.extra).toBeUndefined();
    });
  });

  describe("setCardinalityLimit", () => {
    test("adds new limit", () => {
      metricsCardinalityManager.setCardinalityLimit("custom_metric", {
        maxCardinality: 50,
        enabled: true,
      });

      const config = metricsCardinalityManager.getConfiguration();
      const customLimit = config.limits.find((l) => l.metricName === "custom_metric");
      expect(customLimit).toBeDefined();
    });

    test("initializes stats for new metric", () => {
      metricsCardinalityManager.setCardinalityLimit("new_metric", {
        maxCardinality: 100,
      });

      const stats = metricsCardinalityManager.getCardinalityStats();
      const metricStats = stats.find((s) => s.metricName === "new_metric");
      expect(metricStats).toBeDefined();
      expect(metricStats?.currentCardinality).toBe(0);
    });
  });

  describe("getCardinalityStats", () => {
    test("returns stats for all configured metrics", () => {
      const stats = metricsCardinalityManager.getCardinalityStats();
      expect(stats.length).toBeGreaterThan(0);
    });

    test("tracks violations count", () => {
      metricsCardinalityManager.setCardinalityLimit("violation_test", {
        maxCardinality: 1,
        enabled: true,
      });

      metricsCardinalityManager.checkCardinality("violation_test", { key: "a" });
      metricsCardinalityManager.checkCardinality("violation_test", { key: "b" }); // Violation
      metricsCardinalityManager.checkCardinality("violation_test", { key: "c" }); // Violation

      const stats = metricsCardinalityManager.getCardinalityStats();
      const metricStats = stats.find((s) => s.metricName === "violation_test");
      expect(metricStats?.violationsCount).toBe(2);
      expect(metricStats?.droppedLabels).toBe(2);
    });

    test("tracks currentCardinality", () => {
      metricsCardinalityManager.setCardinalityLimit("cardinality_test", {
        maxCardinality: 100,
        enabled: true,
      });

      metricsCardinalityManager.checkCardinality("cardinality_test", { key: "a" });
      metricsCardinalityManager.checkCardinality("cardinality_test", { key: "b" });
      metricsCardinalityManager.checkCardinality("cardinality_test", { key: "c" });

      const stats = metricsCardinalityManager.getCardinalityStats();
      const metricStats = stats.find((s) => s.metricName === "cardinality_test");
      expect(metricStats?.currentCardinality).toBe(3);
    });
  });

  describe("resetCardinality", () => {
    test("resets specific metric", () => {
      metricsCardinalityManager.setCardinalityLimit("reset_test", {
        maxCardinality: 100,
        enabled: true,
      });
      metricsCardinalityManager.checkCardinality("reset_test", { key: "a" });
      metricsCardinalityManager.checkCardinality("reset_test", { key: "b" });

      metricsCardinalityManager.resetCardinality("reset_test");

      const stats = metricsCardinalityManager.getCardinalityStats();
      const metricStats = stats.find((s) => s.metricName === "reset_test");
      expect(metricStats?.currentCardinality).toBe(0);
      expect(metricStats?.violationsCount).toBe(0);
    });

    test("resets all metrics when no name provided", () => {
      metricsCardinalityManager.checkCardinality("graphql_resolver_duration_ms", {
        operation: "A", field: "f", status: "ok",
      });

      metricsCardinalityManager.resetCardinality();

      const stats = metricsCardinalityManager.getCardinalityStats();
      for (const stat of stats) {
        expect(stat.currentCardinality).toBe(0);
      }
    });
  });

  describe("setEnabled", () => {
    test("disabling allows all checks", () => {
      metricsCardinalityManager.setCardinalityLimit("enabled_test", {
        maxCardinality: 1,
        enabled: true,
      });
      metricsCardinalityManager.checkCardinality("enabled_test", { key: "a" });

      metricsCardinalityManager.setEnabled(false);
      const result = metricsCardinalityManager.checkCardinality("enabled_test", { key: "b" });
      expect(result.allowed).toBe(true);
    });

    test("re-enabling restores limit checking", () => {
      metricsCardinalityManager.setCardinalityLimit("reenable_test", {
        maxCardinality: 1,
        enabled: true,
      });
      metricsCardinalityManager.checkCardinality("reenable_test", { key: "a" });

      metricsCardinalityManager.setEnabled(false);
      metricsCardinalityManager.setEnabled(true);

      const result = metricsCardinalityManager.checkCardinality("reenable_test", { key: "b" });
      expect(result.allowed).toBe(false);
    });
  });

  describe("getConfiguration", () => {
    test("returns correct shape", () => {
      const config = metricsCardinalityManager.getConfiguration();
      expect(config).toHaveProperty("enabled");
      expect(config).toHaveProperty("limitsCount");
      expect(config).toHaveProperty("totalMetrics");
      expect(config).toHaveProperty("limits");
      expect(Array.isArray(config.limits)).toBe(true);
    });
  });
});

describe("withCardinalityCheck", () => {
  beforeEach(() => {
    metricsCardinalityManager.resetCardinality();
    metricsCardinalityManager.setEnabled(true);
  });

  test("returns allowed true within limits", () => {
    const result = withCardinalityCheck("graphql_resolver_duration_ms", {
      operation: "GetUser",
      field: "name",
      status: "ok",
    });
    expect(result.allowed).toBe(true);
    expect(result.labels).toBeDefined();
  });

  test("returns allowed false when limit exceeded", () => {
    metricsCardinalityManager.setCardinalityLimit("wcc_test", {
      maxCardinality: 1,
      enabled: true,
    });
    withCardinalityCheck("wcc_test", { key: "a" });
    const result = withCardinalityCheck("wcc_test", { key: "b" });
    expect(result.allowed).toBe(false);
  });

  test("returns sanitized labels", () => {
    const result = withCardinalityCheck("graphql_resolver_duration_ms", {
      operation: "Query",
      field: "id",
      status: "success",
    });
    expect(result.labels).toBeDefined();
  });
});
