/* src/utils/bunUtils.test.ts - Test Bun-specific utilities */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  BunEnv,
  BunPerf,
  CircuitBreaker,
  createHealthcheck,
  retryWithBackoff,
  sleep,
} from "../../../src/utils/bunUtils";

describe("BunUtils", () => {
  describe("sleep", () => {
    test("should resolve after specified time", async () => {
      const start = Date.now();
      await sleep(50);
      const end = Date.now();
      const duration = end - start;

      // Allow some tolerance for timing
      expect(duration).toBeGreaterThanOrEqual(45);
      expect(duration).toBeLessThan(100);
    });

    test("should work with Bun.sleep when available", async () => {
      // Test that it doesn't throw when Bun.sleep is available
      const start = Date.now();
      await sleep(10);
      const end = Date.now();

      expect(end - start).toBeGreaterThanOrEqual(5);
    });
  });

  describe("retryWithBackoff", () => {
    test("should succeed on first attempt", async () => {
      const mockOperation = mock(() => Promise.resolve("success"));

      const result = await retryWithBackoff(mockOperation, 3, 10);

      expect(result).toBe("success");
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    test("should retry on failure and eventually succeed", async () => {
      let attemptCount = 0;
      const mockOperation = mock(() => {
        attemptCount++;
        if (attemptCount < 2) {
          return Promise.reject(new Error("Temporary failure"));
        }
        return Promise.resolve("success");
      });

      const result = await retryWithBackoff(mockOperation, 3, 10, 100);

      expect(result).toBe("success");
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    test("should throw after max retries exceeded", async () => {
      const mockOperation = mock(() => Promise.reject(new Error("Persistent failure")));

      await expect(retryWithBackoff(mockOperation, 2, 10, 100)).rejects.toThrow("Persistent failure");
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });
  });

  describe("CircuitBreaker", () => {
    let circuitBreaker: CircuitBreaker;

    beforeEach(() => {
      circuitBreaker = new CircuitBreaker(2, 60000, 100); // threshold: 2, timeout: 60s, reset: 100ms
    });

    test("should execute successfully when closed", async () => {
      const mockOperation = mock(() => Promise.resolve("success"));

      const result = await circuitBreaker.execute(mockOperation);

      expect(result).toBe("success");
      expect(circuitBreaker.getStats().state).toBe("closed");
    });

    test("should open after threshold failures", async () => {
      const mockOperation = mock(() => Promise.reject(new Error("Failure")));

      // First failure
      try {
        await circuitBreaker.execute(mockOperation);
      } catch (_error) {
        // Expected
      }

      // Second failure - should open circuit
      try {
        await circuitBreaker.execute(mockOperation);
      } catch (_error) {
        // Expected
      }

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe("open");
      expect(stats.failures).toBe(2);
    });

    test("should reject immediately when open", async () => {
      const mockOperation = mock(() => Promise.reject(new Error("Failure")));

      // Cause failures to open circuit
      try {
        await circuitBreaker.execute(mockOperation);
      } catch {}
      try {
        await circuitBreaker.execute(mockOperation);
      } catch {}

      // Should now reject immediately
      const mockSuccessOperation = mock(() => Promise.resolve("success"));
      await expect(circuitBreaker.execute(mockSuccessOperation)).rejects.toThrow("Circuit breaker is open");

      // Success operation should not have been called
      expect(mockSuccessOperation).toHaveBeenCalledTimes(0);
    });
  });

  describe("BunEnv", () => {
    test("should detect Bun runtime", () => {
      const isBun = BunEnv.isBun();
      expect(typeof isBun).toBe("boolean");
    });

    test("should get runtime information", () => {
      const runtimeInfo = BunEnv.getRuntimeInfo();

      expect(runtimeInfo).toBeDefined();
      expect(typeof runtimeInfo.runtime).toBe("string");
      expect(typeof runtimeInfo.version).toBe("string");
      expect(typeof runtimeInfo.platform).toBe("string");
      expect(typeof runtimeInfo.arch).toBe("string");
    });

    test("should get environment variables", () => {
      // Set a test environment variable
      process.env.TEST_VAR = "test_value";

      const value = BunEnv.get("TEST_VAR");
      expect(value).toBe("test_value");

      const nonExistent = BunEnv.get("NON_EXISTENT_VAR");
      expect(nonExistent).toBeUndefined();

      // Cleanup
      delete process.env.TEST_VAR;
    });
  });

  describe("BunPerf", () => {
    test("should measure execution time", async () => {
      const testOperation = async () => {
        await sleep(50);
        return "completed";
      };

      const { result, duration } = await BunPerf.measure(testOperation);

      expect(result).toBe("completed");
      expect(duration).toBeGreaterThanOrEqual(45);
      expect(duration).toBeLessThan(100);
    });

    test("should handle operation errors", async () => {
      const errorOperation = async () => {
        await sleep(10);
        throw new Error("Test error");
      };

      await expect(BunPerf.measure(errorOperation)).rejects.toThrow("Test error");
    });

    test("should create timer", () => {
      const timer = BunPerf.createTimer("test");

      expect(timer).toBeDefined();
      expect(typeof timer.end).toBe("function");

      // Test timer functionality
      const result = timer.end();
      expect(typeof result).toBe("object");
      expect(typeof result.duration).toBe("number");
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.memoryDelta).toBe("number");
    });
  });

  describe("createHealthcheck", () => {
    test("should return health status", async () => {
      const health = await createHealthcheck();

      expect(health).toBeDefined();
      expect(health.status).toBe("healthy");
      expect(typeof health.timestamp).toBe("string");
      expect(typeof health.uptime).toBe("number");
      expect(health.runtime).toBeDefined();
      expect(health.memory).toBeDefined();
      expect(health.config).toBeDefined();
      expect(typeof health.config.environment).toBe("string");
      expect(typeof health.config.telemetryEnabled).toBe("boolean");
    });
  });
});
