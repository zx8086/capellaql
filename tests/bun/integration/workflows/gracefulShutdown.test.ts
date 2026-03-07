/* tests/integration/workflows/gracefulShutdown.test.ts */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type Subprocess, spawn } from "bun";
import { isServiceAvailable } from "../../shared/test-skip-conditions";

// Main app BASE_URL for checking Couchbase availability
const BASE_URL = process.env.BASE_URL || "http://localhost:4000";

// Spawned test servers use localhost directly (not routed through BASE_URL)
const testServerUrl = (port: number) => `http://localhost:${port}`;

describe("Graceful Shutdown Workflow Integration", () => {
  let serverProcess: Subprocess;
  let serverReady = false;
  let couchbaseAvailable = false;
  const port = 4001;

  beforeAll(async () => {
    // These tests require a real Couchbase connection for the server to start healthy
    couchbaseAvailable = await isServiceAvailable(`${BASE_URL}/health`, 3000);
    if (!couchbaseAvailable) {
      console.warn("CapellaQL server unavailable — graceful shutdown tests will be skipped");
      return;
    }

    // Start server in test mode
    serverProcess = spawn(["bun", "run", "src/index.ts"], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: String(port),
        COUCHBASE_URL: process.env.COUCHBASE_URL || "couchbase://localhost",
        COUCHBASE_USERNAME: process.env.COUCHBASE_USERNAME || "Administrator",
        COUCHBASE_PASSWORD: process.env.COUCHBASE_PASSWORD || "password",
        ENABLE_OPENTELEMETRY: "false",
      },
    });

    // Wait for server to be ready
    let attempts = 0;
    while (!serverReady && attempts < 30) {
      try {
        const response = await fetch(`${testServerUrl(port)}/health`);
        if (response.ok) {
          serverReady = true;
          break;
        }
      } catch (_error) {
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
    if (!couchbaseAvailable) return;
    expect(serverReady).toBe(true);

    // Verify server is responding
    const healthCheck = await fetch(`${testServerUrl(port)}/health`);
    expect(healthCheck.ok).toBe(true);

    // Send SIGTERM to server
    serverProcess.kill("SIGTERM");

    // Wait for graceful shutdown
    const exitCode = await serverProcess.exited;
    // SIGTERM results in exit code 143 (128 + 15) or 0 depending on signal handler
    expect([0, 143].includes(exitCode)).toBe(true);

    // Allow OS to release the port
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify server is no longer responding
    const stillUp = await isServiceAvailable(`${testServerUrl(port)}/health`, 2000);
    expect(stillUp).toBe(false);
  }, 15000);

  test("should handle SIGINT gracefully", async () => {
    if (!couchbaseAvailable) return;
    const sigintPort = 4002;
    const testServerProcess = spawn(["bun", "run", "src/index.ts"], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: String(sigintPort),
        ENABLE_OPENTELEMETRY: "false",
      },
    });

    // Wait for server to be ready
    let ready = false;
    let attempts = 0;
    while (!ready && attempts < 20) {
      try {
        const response = await fetch(`${testServerUrl(sigintPort)}/health`);
        if (response.ok) {
          ready = true;
          break;
        }
      } catch (_error) {
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
    if (!couchbaseAvailable) return;
    const dbPort = 4003;
    const testServerProcess = spawn(["bun", "run", "src/index.ts"], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: String(dbPort),
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
        const response = await fetch(`${testServerUrl(dbPort)}/health/system`);
        if (response.ok) {
          const health = await response.json();
          if (health.components?.database?.status === "healthy") {
            ready = true;
            break;
          }
        }
      } catch (_error) {
        // Server not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    expect(ready).toBe(true);

    // Verify database connection is healthy
    const systemHealth = await fetch(`${testServerUrl(dbPort)}/health/system`);
    const healthData = await systemHealth.json();
    expect(healthData.components.database.status).toBe("healthy");

    // Send shutdown signal
    testServerProcess.kill("SIGTERM");

    // Collect stdout/stderr to verify proper shutdown logging
    const stdout = await new Response(testServerProcess.stdout).text();
    const _stderr = await new Response(testServerProcess.stderr).text();

    const exitCode = await testServerProcess.exited;
    // SIGTERM results in exit code 143 (128 + 15) or 0 depending on signal handler
    expect([0, 143].includes(exitCode)).toBe(true);

    // Verify shutdown sequence in logs
    expect(stdout).toContain("Graceful shutdown initiated");
    expect(stdout).toContain("Couchbase connection closed successfully");
    expect(stdout).toContain("Graceful shutdown completed");
  }, 30000);
});
