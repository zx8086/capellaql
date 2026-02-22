/* tests/integration/workflows/circuitBreaker.test.ts */

import { beforeEach, describe, expect, test } from "bun:test";
import { CircuitBreaker } from "../../../src/utils/bunUtils";

describe("Circuit Breaker Integration Workflow", () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    // Create circuit breaker with test-friendly settings
    circuitBreaker = new CircuitBreaker(
      3, // threshold: fail after 3 consecutive failures
      5000, // timeout: 5 second timeout between operations
      2000 // reset timeout: 2 second reset window
    );
  });

  test("should transition from closed -> open -> half-open -> closed", async () => {
    // Initially closed
    expect(circuitBreaker.getStats().state).toBe("closed");

    // Simulate successful operations
    await circuitBreaker.execute(async () => "success");
    await circuitBreaker.execute(async () => "success");
    expect(circuitBreaker.getStats().state).toBe("closed");
    expect(circuitBreaker.getStats().successes).toBe(2);

    // Simulate failures to open the circuit
    try {
      await circuitBreaker.execute(async () => {
        throw new Error("Database connection failed");
      });
    } catch (_error) {
      // Expected failure
    }

    try {
      await circuitBreaker.execute(async () => {
        throw new Error("Database connection failed");
      });
    } catch (_error) {
      // Expected failure
    }

    try {
      await circuitBreaker.execute(async () => {
        throw new Error("Database connection failed");
      });
    } catch (_error) {
      // Expected failure - should open circuit
    }

    // Circuit should now be open
    expect(circuitBreaker.getStats().state).toBe("open");
    expect(circuitBreaker.getStats().failures).toBe(3);

    // Operations should fail fast while circuit is open
    try {
      await circuitBreaker.execute(async () => "should not execute");
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect((error as Error).message).toContain("Circuit breaker is open");
    }

    // Wait for reset timeout
    await new Promise((resolve) => setTimeout(resolve, 2100));

    // Circuit should transition to half-open
    // First operation should be allowed through
    const result = await circuitBreaker.execute(async () => "recovery success");
    expect(result).toBe("recovery success");
    expect(circuitBreaker.getStats().state).toBe("closed"); // Should close after success
  }, 10000);

  test("should handle database connection failure scenario", async () => {
    // Simulate a database connection failure workflow
    let dbConnectionAttempts = 0;
    const mockDatabaseOperation = async () => {
      dbConnectionAttempts++;
      if (dbConnectionAttempts <= 3) {
        throw new Error("Connection timeout");
      }
      return { data: "Database operation successful", attempts: dbConnectionAttempts };
    };

    // First 3 attempts should fail and open the circuit
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(mockDatabaseOperation);
        expect(false).toBe(true); // Should not succeed
      } catch (error) {
        expect((error as Error).message).toBe("Connection timeout");
      }
    }

    expect(circuitBreaker.getStats().state).toBe("open");
    expect(circuitBreaker.getStats().failures).toBe(3);

    // Further attempts should fail fast without calling the operation
    const attemptsBefore = dbConnectionAttempts;
    try {
      await circuitBreaker.execute(mockDatabaseOperation);
      expect(false).toBe(true); // Should not succeed
    } catch (error) {
      expect((error as Error).message).toContain("Circuit breaker is open");
      expect(dbConnectionAttempts).toBe(attemptsBefore); // Should not increment
    }

    // Wait for reset timeout
    await new Promise((resolve) => setTimeout(resolve, 2100));

    // Next attempt should succeed (4th database attempt)
    const result = await circuitBreaker.execute(mockDatabaseOperation);
    expect(result.data).toBe("Database operation successful");
    expect(result.attempts).toBe(4);
    expect(circuitBreaker.getStats().state).toBe("closed");
  }, 8000);

  test("should integrate with performance monitoring", async () => {
    const performanceMetrics: Array<{ duration: number; success: boolean; timestamp: number }> = [];

    // Mock performance monitoring
    const trackPerformance = async <T>(operation: () => Promise<T>) => {
      const start = Date.now();
      let success = true;
      let result: T;

      try {
        result = await operation();
      } catch (error) {
        success = false;
        throw error;
      } finally {
        const duration = Date.now() - start;
        performanceMetrics.push({ duration, success, timestamp: Date.now() });
      }

      return result;
    };

    // Simulate operations with performance tracking
    await trackPerformance(async () => {
      return await circuitBreaker.execute(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate 100ms operation
        return "success";
      });
    });

    // Simulate a slow failing operation
    try {
      await trackPerformance(async () => {
        return await circuitBreaker.execute(async () => {
          await new Promise((resolve) => setTimeout(resolve, 200)); // Simulate 200ms operation
          throw new Error("Slow operation failed");
        });
      });
    } catch (_error) {
      // Expected
    }

    // Verify performance metrics
    expect(performanceMetrics).toHaveLength(2);
    expect(performanceMetrics[0].success).toBe(true);
    expect(performanceMetrics[0].duration).toBeGreaterThan(90);
    expect(performanceMetrics[1].success).toBe(false);
    expect(performanceMetrics[1].duration).toBeGreaterThan(190);

    // Verify circuit breaker stats
    const stats = circuitBreaker.getStats();
    expect(stats.successes).toBe(1);
    expect(stats.failures).toBe(1);
    expect(stats.state).toBe("closed"); // Should still be closed (threshold is 3)
  }, 5000);

  test("should handle concurrent operations correctly", async () => {
    // Test concurrent operations to ensure thread safety
    const concurrentOperations = Array.from({ length: 10 }, (_, index) => {
      return circuitBreaker.execute(async () => {
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 100));
        if (index >= 5) {
          throw new Error(`Operation ${index} failed`);
        }
        return `Operation ${index} succeeded`;
      });
    });

    const results = await Promise.allSettled(concurrentOperations);

    // Count successes and failures
    const successes = results.filter((r) => r.status === "fulfilled").length;
    const failures = results.filter((r) => r.status === "rejected").length;

    expect(successes).toBe(5); // Operations 0-4 should succeed
    expect(failures).toBe(5); // Operations 5-9 should fail

    const stats = circuitBreaker.getStats();
    expect(stats.successes).toBe(5);
    expect(stats.failures).toBeGreaterThanOrEqual(3); // At least 3 failures should be recorded
  }, 5000);
});
