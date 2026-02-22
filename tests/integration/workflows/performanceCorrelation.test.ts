/* tests/integration/workflows/performanceCorrelation.test.ts */

import { beforeEach, describe, expect, test } from "bun:test";
import {
  clearPerformanceData,
  getGraphQLPerformanceStats,
  getRecentGraphQLPerformance,
  withPerformanceTracking,
} from "../../../src/lib/graphqlPerformanceTracker";

describe("Performance Correlation Integration Workflow", () => {
  beforeEach(() => {
    // Clear performance data before each test
    clearPerformanceData();
  });

  test("should track GraphQL resolver performance", async () => {
    // Simulate different GraphQL resolvers with varying performance
    const fastResolver = withPerformanceTracking("Query", "fastOperation", async (args: any) => {
      await new Promise((resolve) => setTimeout(resolve, 50)); // 50ms operation
      return { data: "fast result", args };
    });

    const slowResolver = withPerformanceTracking("Query", "slowOperation", async (args: any) => {
      await new Promise((resolve) => setTimeout(resolve, 500)); // 500ms operation
      return { data: "slow result", args };
    });

    const flakyResolver = withPerformanceTracking("Mutation", "flakyOperation", async (args: any) => {
      await new Promise((resolve) => setTimeout(resolve, 200)); // 200ms operation
      if (Math.random() < 0.5) {
        throw new Error("Random failure");
      }
      return { data: "flaky result", args };
    });

    // Execute operations
    await fastResolver({ id: 1 });
    await fastResolver({ id: 2 });
    await slowResolver({ id: 1 });

    // Execute flaky resolver multiple times
    for (let i = 0; i < 5; i++) {
      try {
        await flakyResolver({ id: i });
      } catch (_error) {
        // Expected failures
      }
    }

    // Get performance data
    const recentOperations = getRecentGraphQLPerformance();
    const stats = getGraphQLPerformanceStats();

    // Verify tracking
    expect(recentOperations.length).toBeGreaterThanOrEqual(7); // 2 fast + 1 slow + 5 flaky
    expect(stats.totalOperations).toBeGreaterThanOrEqual(7);

    // Verify performance differences
    const fastOps = recentOperations.filter((op) => op.fieldName === "fastOperation");
    const slowOps = recentOperations.filter((op) => op.fieldName === "slowOperation");

    expect(fastOps.length).toBe(2);
    expect(slowOps.length).toBe(1);

    // Fast operations should be under 100ms
    fastOps.forEach((op) => {
      expect(op.duration).toBeLessThan(100);
      expect(op.success).toBe(true);
    });

    // Slow operations should be around 500ms
    slowOps.forEach((op) => {
      expect(op.duration).toBeGreaterThan(450);
      expect(op.success).toBe(true);
    });

    // Verify error rate calculation
    const flakyOps = recentOperations.filter((op) => op.fieldName === "flakyOperation");
    expect(flakyOps.length).toBe(5);
    expect(stats.errorRate).toBeGreaterThan(0); // Should have some errors
  }, 10000);

  test("should correlate GraphQL performance with simulated database latency", async () => {
    let simulatedDatabaseLatency = 100; // Start with 100ms

    const databaseDependentResolver = withPerformanceTracking("Query", "databaseQuery", async (_args: any) => {
      // Simulate database operation
      await new Promise((resolve) => setTimeout(resolve, simulatedDatabaseLatency));

      // Additional GraphQL processing time
      await new Promise((resolve) => setTimeout(resolve, 50));

      return { data: "database result", latency: simulatedDatabaseLatency };
    });

    // Execute operations with increasing database latency
    const latencies = [100, 200, 300, 500, 800];
    const operationResults = [];

    for (const latency of latencies) {
      simulatedDatabaseLatency = latency;
      const start = Date.now();
      const result = await databaseDependentResolver({ query: `test-${latency}` });
      const totalDuration = Date.now() - start;

      operationResults.push({
        databaseLatency: latency,
        totalDuration,
        result,
      });
    }

    // Analyze correlation
    const recentOps = getRecentGraphQLPerformance();
    const databaseOps = recentOps.filter((op) => op.fieldName === "databaseQuery");

    expect(databaseOps.length).toBe(5);

    // Verify that GraphQL duration correlates with database latency
    databaseOps.forEach((op, index) => {
      const expectedMinDuration = latencies[index] + 40; // DB + processing - some tolerance
      const expectedMaxDuration = latencies[index] + 80; // DB + processing + some tolerance

      expect(op.duration).toBeGreaterThanOrEqual(expectedMinDuration);
      expect(op.duration).toBeLessThanOrEqual(expectedMaxDuration);
      expect(op.success).toBe(true);
    });

    // Calculate simple correlation coefficient
    const xValues = databaseOps.map((_, index) => latencies[index]);
    const yValues = databaseOps.map((op) => op.duration);

    const correlation = calculateCorrelation(xValues, yValues);
    expect(correlation).toBeGreaterThan(0.8); // Strong positive correlation
  }, 8000);

  test("should identify slow operations and performance bottlenecks", async () => {
    // Create resolvers with different performance characteristics
    const resolvers = {
      veryFast: withPerformanceTracking("Query", "veryFast", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "very fast result";
      }),

      normal: withPerformanceTracking("Query", "normal", async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return "normal result";
      }),

      slow: withPerformanceTracking("Query", "slow", async () => {
        await new Promise((resolve) => setTimeout(resolve, 800));
        return "slow result";
      }),

      verySlow: withPerformanceTracking("Query", "verySlow", async () => {
        await new Promise((resolve) => setTimeout(resolve, 1500)); // Over 1 second
        return "very slow result";
      }),
    };

    // Execute operations multiple times
    for (let i = 0; i < 3; i++) {
      await resolvers.veryFast();
      await resolvers.normal();
    }

    // Execute slow operations
    await resolvers.slow();
    await resolvers.verySlow();

    const stats = getGraphQLPerformanceStats();

    // Should identify slow operations (over 1000ms)
    expect(stats.slowOperations).toBeGreaterThanOrEqual(1); // verySlow operation
    expect(stats.totalOperations).toBe(8); // 3+3+1+1

    // Verify operation breakdown shows performance differences
    expect(stats.operationBreakdown).toBeDefined();

    const verySlowBreakdown = stats.operationBreakdown["Query.verySlow"];
    expect(verySlowBreakdown).toBeDefined();
    expect(verySlowBreakdown.averageDuration).toBeGreaterThan(1400);

    const veryFastBreakdown = stats.operationBreakdown["Query.veryFast"];
    expect(veryFastBreakdown).toBeDefined();
    expect(veryFastBreakdown.averageDuration).toBeLessThan(50);
  }, 6000);

  test("should handle concurrent operations and measure performance accurately", async () => {
    const concurrentResolver = withPerformanceTracking("Query", "concurrent", async (delay: number) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return `completed in ${delay}ms`;
    });

    // Launch concurrent operations with different delays
    const delays = [50, 100, 150, 200, 250];
    const promises = delays.map((delay) => concurrentResolver(delay));

    const startTime = Date.now();
    const results = await Promise.all(promises);
    const totalConcurrentTime = Date.now() - startTime;

    // Concurrent operations should complete faster than sequential
    expect(totalConcurrentTime).toBeLessThan(800); // Should be around 250ms + overhead
    expect(results).toHaveLength(5);

    // Verify individual operation tracking
    const recentOps = getRecentGraphQLPerformance()
      .filter((op) => op.fieldName === "concurrent")
      .sort((a, b) => a.duration - b.duration);

    expect(recentOps).toHaveLength(5);

    // Each operation should have roughly the expected duration
    recentOps.forEach((op, index) => {
      const expectedDelay = delays[index];
      expect(op.duration).toBeGreaterThanOrEqual(expectedDelay - 10); // Some tolerance
      expect(op.duration).toBeLessThanOrEqual(expectedDelay + 50); // Some overhead tolerance
      expect(op.success).toBe(true);
    });
  }, 5000);
});

// Helper function to calculate correlation coefficient
function calculateCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;

  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  return denominator === 0 ? 0 : numerator / denominator;
}
