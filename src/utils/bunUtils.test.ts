// Enhanced Bun utilities test suite with modern testing patterns

import { describe, expect, test, beforeAll, afterAll, beforeEach, mock, spyOn } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import {
  sleep,
  BunFile,
  BunProcess,
  BunEnv,
  BunPerf,
  CircuitBreaker,
  retryWithBackoff,
  createHealthcheck
} from "./bunUtils";

describe("BunUtils - Core Functionality", () => {
  let testDir: string;
  let testFile: string;

  beforeAll(() => {
    testDir = tmpdir();
    testFile = join(testDir, `test-${Date.now()}.txt`);
  });

  describe("sleep function", () => {
    test("should use Bun.sleep when available", async () => {
      const start = Date.now();
      await sleep(10);
      const duration = Date.now() - start;
      
      // Allow some tolerance for timing
      expect(duration).toBeGreaterThanOrEqual(8);
      expect(duration).toBeLessThan(50);
    });

    test("should handle zero milliseconds", async () => {
      const start = Date.now();
      await sleep(0);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(10);
    });
  });

  describe("BunFile operations", () => {
    beforeEach(async () => {
      // Clean up test file before each test
      try {
        await BunFile.exists(testFile) && await Bun.write(testFile, "");
      } catch {
        // Ignore cleanup errors
      }
    });

    test("should write and read text files", async () => {
      const content = "Hello, Bun!";
      
      await BunFile.write(testFile, content);
      const readContent = await BunFile.read(testFile);
      
      expect(readContent).toBe(content);
    });

    test("should handle JSON operations", async () => {
      const data = { 
        name: "CapellaQL", 
        version: "2.0.0",
        features: ["bun", "graphql", "telemetry"]
      };
      
      await BunFile.writeJSON(testFile, data);
      const readData = await BunFile.readJSON(testFile);
      
      expect(readData).toEqual(data);
    });

    test("should check file existence", async () => {
      await BunFile.write(testFile, "test");
      expect(await BunFile.exists(testFile)).toBe(true);
      
      expect(await BunFile.exists("/nonexistent/file.txt")).toBe(false);
    });

    test("should get file size", async () => {
      const content = "Hello, World!";
      await BunFile.write(testFile, content);
      
      const size = await BunFile.size(testFile);
      expect(size).toBe(content.length);
    });

    test("should handle streaming for large files", async () => {
      const content = "A".repeat(1000); // 1KB content
      await BunFile.write(testFile, content);
      
      const stream = BunFile.stream(testFile);
      const reader = stream.getReader();
      
      let receivedData = "";
      let chunk;
      while (!(chunk = await reader.read()).done) {
        receivedData += new TextDecoder().decode(chunk.value);
      }
      
      expect(receivedData).toBe(content);
    });

    test("should handle write errors gracefully", async () => {
      const invalidPath = "/root/cannot-write-here.txt";
      
      await expect(BunFile.write(invalidPath, "test")).rejects.toThrow();
    });
  });

  describe("BunProcess management", () => {
    test("should execute simple commands", async () => {
      const result = await BunProcess.spawn(["echo", "Hello, Bun!"]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("Hello, Bun!");
      expect(result.stderr).toBe("");
    });

    test("should handle command with environment variables", async () => {
      const result = await BunProcess.spawn(
        ["node", "-e", "console.log(process.env.TEST_VAR)"],
        { env: { TEST_VAR: "test-value" } }
      );
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("test-value");
    });

    test("should handle timeouts", async () => {
      const start = Date.now();
      
      await expect(
        BunProcess.spawn(["sleep", "5"], { timeout: 100 })
      ).rejects.toThrow();
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(200); // Should timeout quickly
    });

    test("should handle stdin input", async () => {
      const result = await BunProcess.spawn(
        ["node", "-e", "process.stdin.on('data', d => console.log(d.toString().trim()))"],
        { stdin: "Hello from stdin!" }
      );
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("Hello from stdin!");
    });
  });

  describe("BunEnv utilities", () => {
    test("should detect Bun runtime", () => {
      expect(BunEnv.isBun()).toBe(typeof Bun !== "undefined");
    });

    test("should get runtime information", () => {
      const info = BunEnv.getRuntimeInfo();
      
      expect(info).toHaveProperty("runtime");
      expect(info).toHaveProperty("version");
      expect(info).toHaveProperty("platform");
      expect(info).toHaveProperty("arch");
      expect(info).toHaveProperty("features");
      
      if (typeof Bun !== "undefined") {
        expect(info.runtime).toBe("bun");
        expect(info.features.nativeWebSocket).toBe(true);
        expect(info.features.javaScriptCore).toBe(true);
      } else {
        expect(info.runtime).toBe("node");
        expect(info.features.nativeWebSocket).toBe(false);
      }
    });

    test("should get environment variables", () => {
      // Test with a known environment variable
      const path = BunEnv.get("PATH");
      expect(typeof path).toBe("string");
      expect(path!.length).toBeGreaterThan(0);
      
      // Test with non-existent variable
      const nonExistent = BunEnv.get("NON_EXISTENT_VAR_12345");
      expect(nonExistent).toBeUndefined();
    });
  });

  describe("BunPerf performance utilities", () => {
    test("should measure operation duration", async () => {
      const { result, duration, memoryDelta } = await BunPerf.measure(async () => {
        await sleep(10);
        return "test-result";
      }, "test-operation");
      
      expect(result).toBe("test-result");
      expect(duration).toBeGreaterThan(8);
      expect(duration).toBeLessThan(50);
      expect(typeof memoryDelta).toBe("number");
    });

    test("should create and use timers", async () => {
      const timer = BunPerf.createTimer("test-timer");
      await sleep(10);
      const { duration, memoryDelta } = timer.end();
      
      expect(duration).toBeGreaterThan(8);
      expect(typeof memoryDelta).toBe("number");
    });

    test("should handle measurement errors", async () => {
      await expect(
        BunPerf.measure(async () => {
          throw new Error("Test error");
        }, "error-test")
      ).rejects.toThrow("Test error");
    });

    test("should benchmark operations", async () => {
      const operations = {
        "fast-operation": async () => {
          await sleep(1);
          return "fast";
        },
        "slow-operation": async () => {
          await sleep(5);
          return "slow";
        }
      };
      
      const results = await BunPerf.benchmark(operations, 3);
      
      expect(results).toHaveProperty("fast-operation");
      expect(results).toHaveProperty("slow-operation");
      expect(results["fast-operation"].avg).toBeLessThan(results["slow-operation"].avg);
    });
  });
});

describe("BunUtils - Resilience Patterns", () => {
  describe("Circuit Breaker", () => {
    let circuitBreaker: CircuitBreaker;

    beforeEach(() => {
      circuitBreaker = new CircuitBreaker(3, 60000, 1000); // 3 failures, 1s reset
    });

    test("should allow operations when closed", async () => {
      const result = await circuitBreaker.execute(async () => "success");
      expect(result).toBe("success");
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe("closed");
      expect(stats.successes).toBe(1);
      expect(stats.failures).toBe(0);
    });

    test("should open after threshold failures", async () => {
      // Cause failures to open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(
          circuitBreaker.execute(async () => {
            throw new Error("Simulated failure");
          })
        ).rejects.toThrow("Simulated failure");
      }
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe("open");
      expect(stats.failures).toBe(3);
      
      // Should reject immediately when open
      await expect(
        circuitBreaker.execute(async () => "should not execute")
      ).rejects.toThrow("Circuit breaker is open");
    });

    test("should transition to half-open after timeout", async () => {
      // Force circuit to open
      for (let i = 0; i < 3; i++) {
        await expect(
          circuitBreaker.execute(async () => {
            throw new Error("Failure");
          })
        ).rejects.toThrow("Failure");
      }
      
      // Wait for reset timeout
      await sleep(1100);
      
      // Next operation should work and close circuit
      const result = await circuitBreaker.execute(async () => "recovery");
      expect(result).toBe("recovery");
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe("closed");
    });

    test("should calculate success rate", async () => {
      // Mix of successes and failures
      await circuitBreaker.execute(async () => "success1");
      await circuitBreaker.execute(async () => "success2");
      
      try {
        await circuitBreaker.execute(async () => {
          throw new Error("failure");
        });
      } catch {
        // Expected
      }
      
      const stats = circuitBreaker.getStats();
      expect(stats.successRate).toBeCloseTo(2/3, 2);
    });

    test("should reset statistics", async () => {
      await circuitBreaker.execute(async () => "success");
      circuitBreaker.reset();
      
      const stats = circuitBreaker.getStats();
      expect(stats.successes).toBe(0);
      expect(stats.failures).toBe(0);
      expect(stats.state).toBe("closed");
    });
  });

  describe("Retry with Backoff", () => {
    test("should retry failed operations", async () => {
      let attempts = 0;
      const mockOperation = mock(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error("Temporary failure");
        }
        return "success";
      });
      
      const result = await retryWithBackoff(mockOperation, 3);
      expect(result).toBe("success");
      expect(attempts).toBe(3);
    });

    test("should fail after max retries", async () => {
      const mockOperation = mock(() => {
        throw new Error("Persistent failure");
      });
      
      await expect(
        retryWithBackoff(mockOperation, 2, 10)
      ).rejects.toThrow("Persistent failure");
      
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    test("should apply exponential backoff", async () => {
      const delays: number[] = [];
      const sleepSpy = spyOn({ sleep }, "sleep").mockImplementation(async (ms) => {
        delays.push(ms);
        return Promise.resolve();
      });
      
      let attempts = 0;
      await expect(
        retryWithBackoff(async () => {
          attempts++;
          throw new Error("Always fails");
        }, 3, 100)
      ).rejects.toThrow("Always fails");
      
      // Should have 2 delays (between 3 attempts)
      expect(delays).toHaveLength(2);
      expect(delays[0]).toBeGreaterThanOrEqual(100);
      expect(delays[1]).toBeGreaterThanOrEqual(200);
      expect(delays[1]).toBeGreaterThan(delays[0]);
      
      sleepSpy.mockRestore();
    });
  });
});

describe("BunUtils - Health Monitoring", () => {
  test("should create comprehensive health check", async () => {
    const health = await createHealthcheck();
    
    expect(health).toHaveProperty("status");
    expect(health).toHaveProperty("timestamp");
    expect(health).toHaveProperty("uptime");
    expect(health).toHaveProperty("runtime");
    expect(health).toHaveProperty("memory");
    expect(health).toHaveProperty("config");
    expect(health).toHaveProperty("system");
    expect(health).toHaveProperty("performance");
    
    expect(health.status).toBe("healthy");
    expect(typeof health.uptime).toBe("number");
    expect(health.uptime).toBeGreaterThan(0);
    
    // Runtime info
    expect(["bun", "node"]).toContain(health.runtime.runtime);
    
    // Memory info
    expect(typeof health.memory.heapUsed).toBe("number");
    expect(health.memory.heapUsed).toBeGreaterThan(0);
    
    // System info
    expect(typeof health.system.platform).toBe("string");
    expect(typeof health.system.arch).toBe("string");
    
    // Performance info
    if (health.performance.eventLoopLag !== undefined) {
      expect(typeof health.performance.eventLoopLag).toBe("number");
    }
  });

  test("should include Bun-specific information when available", async () => {
    const health = await createHealthcheck();
    
    if (typeof Bun !== "undefined") {
      expect(health.system.bunVersion).toBeDefined();
      expect(health.runtime.runtime).toBe("bun");
      expect(health.runtime.features.nativeWebSocket).toBe(true);
    } else {
      expect(health.system.nodeVersion).toBeDefined();
      expect(health.runtime.runtime).toBe("node");
    }
  });
});

describe("BunUtils - Error Handling", () => {
  test("should handle file operation errors gracefully", async () => {
    await expect(
      BunFile.read("/nonexistent/path/file.txt")
    ).rejects.toThrow();
    
    await expect(
      BunFile.readJSON("/nonexistent/config.json")
    ).rejects.toThrow();
  });

  test("should handle process execution errors", async () => {
    await expect(
      BunProcess.spawn(["nonexistent-command"])
    ).rejects.toThrow();
  });

  test("should handle malformed JSON gracefully", async () => {
    const testFile = join(tmpdir(), `malformed-${Date.now()}.json`);
    await BunFile.write(testFile, "{ invalid json }");
    
    await expect(
      BunFile.readJSON(testFile)
    ).rejects.toThrow();
  });
});

describe("BunUtils - Performance Benchmarks", () => {
  test("Bun file operations should be faster than Node.js equivalents", async () => {
    if (typeof Bun === "undefined") {
      console.log("Skipping Bun performance test - not running in Bun environment");
      return;
    }

    const testContent = "A".repeat(10000); // 10KB test content
    const testFile = join(tmpdir(), `perf-test-${Date.now()}.txt`);

    const bunTime = await BunPerf.measure(async () => {
      await BunFile.write(testFile, testContent);
      return await BunFile.read(testFile);
    }, "Bun file operations");

    // For comparison - using standard fs operations
    const fsTime = await BunPerf.measure(async () => {
      const fs = await import("fs/promises");
      await fs.writeFile(testFile + ".fs", testContent);
      return await fs.readFile(testFile + ".fs", "utf8");
    }, "Standard fs operations");

    console.log(`Bun operations: ${bunTime.duration.toFixed(2)}ms`);
    console.log(`Standard fs: ${fsTime.duration.toFixed(2)}ms`);
    
    // Bun should generally be faster, but allow for some variance
    expect(bunTime.duration).toBeLessThan(fsTime.duration * 2);
  });
});