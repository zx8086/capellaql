/* tests/integration/workflows/gracefulShutdown.test.ts */

import { afterAll, beforeAll, describe, expect, mock, spyOn, test } from "bun:test";
import { type Subprocess, spawn } from "bun";

describe("Graceful Shutdown Workflow Integration", () => {
  let serverProcess: Subprocess;
  let serverReady = false;

  beforeAll(async () => {
    // Start server in test mode
    serverProcess = spawn(["bun", "run", "src/index.ts"], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        APPLICATION_PORT: "4001", // Use different port for tests
        COUCHBASE_URL: process.env.COUCHBASE_URL || "couchbase://localhost",
        COUCHBASE_USERNAME: process.env.COUCHBASE_USERNAME || "Administrator",
        COUCHBASE_PASSWORD: process.env.COUCHBASE_PASSWORD || "password",
        ENABLE_OPENTELEMETRY: "false", // Disable telemetry for tests
      },
    });

    // Wait for server to be ready
    let attempts = 0;
    while (!serverReady && attempts < 30) {
      // 30 second timeout
      try {
        const response = await fetch("http://localhost:4001/health");
        if (response.ok) {
          serverReady = true;
          break;
        }
      } catch (error) {
        // Server not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    if (!serverReady) {
      throw new Error("Server failed to start within timeout");
    }
  }, 35000);

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill();
      await serverProcess.exited;
    }
  });

  test("should handle SIGTERM gracefully with proper shutdown sequence", async () => {
    expect(serverReady).toBe(true);

    // Verify server is responding
    const healthCheck = await fetch("http://localhost:4001/health");
    expect(healthCheck.ok).toBe(true);

    // Send SIGTERM to server
    serverProcess.kill("SIGTERM");

    // Wait for graceful shutdown
    const exitCode = await serverProcess.exited;
    expect(exitCode).toBe(0);

    // Verify server is no longer responding
    try {
      await fetch("http://localhost:4001/health");
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      // Expected - server should be shut down
      expect(error).toBeDefined();
    }
  }, 15000);

  test("should handle SIGINT gracefully", async () => {
    // Start a new server process for this test
    const testServerProcess = spawn(["bun", "run", "src/index.ts"], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        APPLICATION_PORT: "4002",
        ENABLE_OPENTELEMETRY: "false",
      },
    });

    // Wait for server to be ready
    let ready = false;
    let attempts = 0;
    while (!ready && attempts < 20) {
      try {
        const response = await fetch("http://localhost:4002/health");
        if (response.ok) {
          ready = true;
          break;
        }
      } catch (error) {
        // Server not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    expect(ready).toBe(true);

    // Send SIGINT to server
    testServerProcess.kill("SIGINT");

    // Wait for graceful shutdown
    const exitCode = await testServerProcess.exited;
    expect(exitCode).toBe(0);
  }, 25000);

  test("should properly close database connections during shutdown", async () => {
    // This test verifies that database connections are properly closed
    // We can't directly test the internal connection state, but we can verify
    // that the shutdown process completes successfully which indicates
    // all resources were cleaned up properly

    const testServerProcess = spawn(["bun", "run", "src/index.ts"], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        APPLICATION_PORT: "4003",
        ENABLE_OPENTELEMETRY: "false",
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    // Wait for server to be ready
    let ready = false;
    let attempts = 0;
    while (!ready && attempts < 20) {
      try {
        const response = await fetch("http://localhost:4003/health/system");
        if (response.ok) {
          const health = await response.json();
          if (health.components?.database?.status === "healthy") {
            ready = true;
            break;
          }
        }
      } catch (error) {
        // Server not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    expect(ready).toBe(true);

    // Verify database connection is healthy
    const systemHealth = await fetch("http://localhost:4003/health/system");
    const healthData = await systemHealth.json();
    expect(healthData.components.database.status).toBe("healthy");

    // Send shutdown signal
    testServerProcess.kill("SIGTERM");

    // Collect stdout/stderr to verify proper shutdown logging
    const stdout = await new Response(testServerProcess.stdout).text();
    const stderr = await new Response(testServerProcess.stderr).text();

    const exitCode = await testServerProcess.exited;
    expect(exitCode).toBe(0);

    // Verify shutdown sequence in logs
    expect(stdout).toContain("Starting graceful shutdown");
    expect(stdout).toContain("Database connection shutdown completed");
    expect(stdout).toContain("Graceful shutdown completed");
  }, 30000);
});
