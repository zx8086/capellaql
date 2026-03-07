/* tests/integration/config/hotReload.test.ts */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { setTimeout } from "timers/promises";
import { configHotReload } from "../../../../src/lib/configHotReload";

describe("Configuration Hot-Reload System", () => {
  const testConfigDir = path.join(process.cwd(), "test-config");
  const testEnvFile = path.join(testConfigDir, ".env.test");
  const testEnvLocalFile = path.join(testConfigDir, ".env.local.test");

  // Store original environment for restoration
  const originalEnv = { ...process.env };

  /** Restore environment variables to their original state without reassigning process.env */
  function restoreEnv() {
    // Remove keys that weren't in the original environment
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    // Restore original values
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      }
    }
  }

  beforeAll(async () => {
    // Create test config directory
    await mkdir(testConfigDir, { recursive: true });
  });

  afterAll(async () => {
    // Clean up test files and restore environment
    try {
      await unlink(testEnvFile).catch(() => {});
      await unlink(testEnvLocalFile).catch(() => {});
    } catch (_error) {
      // Ignore cleanup errors
    }

    restoreEnv();
  });

  beforeEach(async () => {
    restoreEnv();
  });

  afterEach(async () => {
    // Disable hot-reload and clean up after each test
    configHotReload.disable();
    await setTimeout(100); // Allow cleanup to complete
  });

  describe("Initialization and Basic Operations", () => {
    test("should initialize with valid config files", async () => {
      // Create valid test configuration
      const validConfig = `
        COUCHBASE_URL=couchbase://test-cluster
        COUCHBASE_USERNAME=test-user
        COUCHBASE_BUCKET=test-bucket
        APPLICATION_PORT=4001
      `;

      await writeFile(testEnvFile, validConfig);

      // Initialize hot-reload system
      await configHotReload.initialize([testEnvFile]);

      const status = configHotReload.getStatus();
      expect(status.enabled).toBe(true);
      expect(status.watchedFiles).toContain(path.resolve(testEnvFile));
      expect(status.currentEnvCount).toBeGreaterThan(0);
    });

    test("should handle missing config files gracefully", async () => {
      const nonExistentFile = path.join(testConfigDir, ".env.nonexistent");

      // Should not throw error for missing files
      let threw = false;
      try {
        await configHotReload.initialize([nonExistentFile]);
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);

      const status = configHotReload.getStatus();
      expect(status.enabled).toBe(true);
    });

    test("should get current status correctly", async () => {
      await writeFile(testEnvFile, "TEST_VAR=test_value");
      await configHotReload.initialize([testEnvFile]);

      const status = configHotReload.getStatus();
      expect(status).toHaveProperty("enabled");
      expect(status).toHaveProperty("watchedFiles");
      expect(status).toHaveProperty("currentEnvCount");
      expect(status).toHaveProperty("watcherStatus");
    });
  });

  describe("Configuration Validation", () => {
    test("should reject configuration with missing required variables", async () => {
      const validConfig = `
        COUCHBASE_URL=couchbase://test-cluster
        COUCHBASE_USERNAME=test-user
        COUCHBASE_BUCKET=test-bucket
        APPLICATION_PORT=4001
      `;

      const invalidConfig = `
        # Missing COUCHBASE_URL, COUCHBASE_USERNAME, COUCHBASE_BUCKET
        APPLICATION_PORT=4001
      `;

      // Initialize with valid config first
      await writeFile(testEnvFile, validConfig);
      await configHotReload.initialize([testEnvFile]);

      let validationFailedEventFired = false;
      let validationErrors: string[] = [];

      configHotReload.on("configurationReloadFailed", (event) => {
        validationFailedEventFired = true;
        validationErrors = event.errors || [];
      });

      // Trigger reload by writing invalid config (removes required vars)
      await writeFile(testEnvFile, invalidConfig);
      await setTimeout(2500); // Wait for file watcher debounce (1000ms) + OS detection + processing

      expect(validationFailedEventFired).toBe(true);
      expect(validationErrors.some((err) => err.includes("COUCHBASE_URL"))).toBe(true);
      expect(validationErrors.some((err) => err.includes("COUCHBASE_USERNAME"))).toBe(true);
      expect(validationErrors.some((err) => err.includes("COUCHBASE_BUCKET"))).toBe(true);
    });

    test("should reject invalid URL formats", async () => {
      const validConfig = `
        COUCHBASE_URL=couchbase://test-cluster
        COUCHBASE_USERNAME=test-user
        COUCHBASE_BUCKET=test-bucket
      `;

      const invalidUrlConfig = `
        COUCHBASE_URL=invalid-url-format
        COUCHBASE_USERNAME=test-user
        COUCHBASE_BUCKET=test-bucket
      `;

      // Initialize with valid config first
      await writeFile(testEnvFile, validConfig);
      await configHotReload.initialize([testEnvFile]);

      let validationFailedEventFired = false;
      let validationErrors: string[] = [];

      configHotReload.on("configurationReloadFailed", (event) => {
        validationFailedEventFired = true;
        validationErrors = event.errors || [];
      });

      // Trigger reload by writing config with invalid URL
      await writeFile(testEnvFile, invalidUrlConfig);
      await setTimeout(2500);

      expect(validationFailedEventFired).toBe(true);
      expect(validationErrors.some((err) => err.includes("couchbase://"))).toBe(true);
    });

    test("should reject invalid numeric values", async () => {
      const validConfig = `
        COUCHBASE_URL=couchbase://test-cluster
        COUCHBASE_USERNAME=test-user
        COUCHBASE_BUCKET=test-bucket
        COUCHBASE_KV_TIMEOUT=5000
        APPLICATION_PORT=4001
      `;

      const invalidNumericConfig = `
        COUCHBASE_URL=couchbase://test-cluster
        COUCHBASE_USERNAME=test-user
        COUCHBASE_BUCKET=test-bucket
        COUCHBASE_KV_TIMEOUT=not-a-number
        APPLICATION_PORT=invalid-port
      `;

      // Initialize with valid config first
      await writeFile(testEnvFile, validConfig);
      await configHotReload.initialize([testEnvFile]);

      let validationFailedEventFired = false;
      let validationErrors: string[] = [];

      configHotReload.on("configurationReloadFailed", (event) => {
        validationFailedEventFired = true;
        validationErrors = event.errors || [];
      });

      // Trigger reload by writing config with invalid numeric values
      await writeFile(testEnvFile, invalidNumericConfig);
      await setTimeout(2500);

      expect(validationFailedEventFired).toBe(true);
      expect(validationErrors.some((err) => err.includes("COUCHBASE_KV_TIMEOUT"))).toBe(true);
      expect(validationErrors.some((err) => err.includes("APPLICATION_PORT"))).toBe(true);
    });

    test("should block default passwords in production", async () => {
      // Set production environment
      process.env.NODE_ENV = "production";
      if (typeof Bun !== "undefined") {
        (Bun.env as any).NODE_ENV = "production";
      }

      const validProductionConfig = `
        NODE_ENV=production
        COUCHBASE_URL=couchbases://test-cluster
        COUCHBASE_USERNAME=test-user
        COUCHBASE_PASSWORD=secure-p@ssw0rd-123
        COUCHBASE_BUCKET=test-bucket
      `;

      const productionConfigWithDefaultPassword = `
        NODE_ENV=production
        COUCHBASE_URL=couchbases://test-cluster
        COUCHBASE_USERNAME=test-user
        COUCHBASE_PASSWORD=password
        COUCHBASE_BUCKET=test-bucket
      `;

      // Initialize with valid production config first
      await writeFile(testEnvFile, validProductionConfig);
      await configHotReload.initialize([testEnvFile]);

      let validationFailedEventFired = false;
      let validationErrors: string[] = [];

      configHotReload.on("configurationReloadFailed", (event) => {
        validationFailedEventFired = true;
        validationErrors = event.errors || [];
      });

      // Trigger reload by changing password to a default one
      await writeFile(testEnvFile, productionConfigWithDefaultPassword);
      await setTimeout(2500);

      expect(validationFailedEventFired).toBe(true);
      expect(validationErrors.some((err) => err.includes("Default password not allowed"))).toBe(true);
    });

    test("should warn about wildcard CORS in production", async () => {
      // Set production environment
      process.env.NODE_ENV = "production";
      if (typeof Bun !== "undefined") {
        (Bun.env as any).NODE_ENV = "production";
      }

      const initialProductionConfig = `
        NODE_ENV=production
        COUCHBASE_URL=couchbases://test-cluster
        COUCHBASE_USERNAME=test-user
        COUCHBASE_PASSWORD=secure-password
        COUCHBASE_BUCKET=test-bucket
        ALLOWED_ORIGINS=https://example.com
      `;

      const productionConfigWithWildcardCors = `
        NODE_ENV=production
        COUCHBASE_URL=couchbases://test-cluster
        COUCHBASE_USERNAME=test-user
        COUCHBASE_PASSWORD=secure-password
        COUCHBASE_BUCKET=test-bucket
        ALLOWED_ORIGINS=*
      `;

      // Initialize with valid config first
      await writeFile(testEnvFile, initialProductionConfig);
      await configHotReload.initialize([testEnvFile]);

      let configReloadedEventFired = false;

      configHotReload.on("configurationReloaded", (_event) => {
        configReloadedEventFired = true;
      });

      // Trigger reload by changing ALLOWED_ORIGINS to wildcard
      await writeFile(testEnvFile, productionConfigWithWildcardCors);
      await setTimeout(2500);

      // Should succeed with warning, not fail
      expect(configReloadedEventFired).toBe(true);
    });
  });

  describe("Configuration Hot-Reload", () => {
    test("should successfully reload valid configuration changes", async () => {
      const initialConfig = `
        COUCHBASE_URL=couchbase://initial-cluster
        COUCHBASE_USERNAME=initial-user
        COUCHBASE_BUCKET=initial-bucket
        APPLICATION_PORT=4001
      `;

      const updatedConfig = `
        COUCHBASE_URL=couchbase://updated-cluster
        COUCHBASE_USERNAME=updated-user
        COUCHBASE_BUCKET=updated-bucket
        APPLICATION_PORT=4002
      `;

      await writeFile(testEnvFile, initialConfig);
      await configHotReload.initialize([testEnvFile]);

      let configReloadedEventFired = false;
      let reloadChanges: any = {};

      configHotReload.on("configurationReloaded", (event) => {
        configReloadedEventFired = true;
        reloadChanges = event.changes;
      });

      // Update the config file
      await writeFile(testEnvFile, updatedConfig);
      await setTimeout(2500); // Wait for file watcher

      expect(configReloadedEventFired).toBe(true);
      expect(reloadChanges.changed).toContain("COUCHBASE_URL");
      expect(reloadChanges.changed).toContain("APPLICATION_PORT");

      // Verify environment was actually updated
      if (typeof Bun !== "undefined") {
        expect(Bun.env.COUCHBASE_URL).toBe("couchbase://updated-cluster");
        expect(Bun.env.APPLICATION_PORT).toBe("4002");
      }
      expect(process.env.COUCHBASE_URL).toBe("couchbase://updated-cluster");
      expect(process.env.APPLICATION_PORT).toBe("4002");
    });

    test("should detect added and removed variables", async () => {
      const initialConfig = `
        COUCHBASE_URL=couchbase://test-cluster
        COUCHBASE_USERNAME=test-user
        COUCHBASE_BUCKET=test-bucket
      `;

      const updatedConfig = `
        COUCHBASE_URL=couchbase://test-cluster
        COUCHBASE_USERNAME=test-user
        COUCHBASE_BUCKET=test-bucket
        APPLICATION_PORT=4001
        NEW_VARIABLE=new-value
      `;

      await writeFile(testEnvFile, initialConfig);
      await configHotReload.initialize([testEnvFile]);

      let configReloadedEventFired = false;
      let reloadChanges: any = {};

      configHotReload.on("configurationReloaded", (event) => {
        configReloadedEventFired = true;
        reloadChanges = event.changes;
      });

      await writeFile(testEnvFile, updatedConfig);
      await setTimeout(2500);

      expect(configReloadedEventFired).toBe(true);
      expect(reloadChanges.added).toContain("APPLICATION_PORT");
      expect(reloadChanges.added).toContain("NEW_VARIABLE");
    });

    test("should not reload when no meaningful changes detected", async () => {
      const config = `
        COUCHBASE_URL=couchbase://test-cluster
        COUCHBASE_USERNAME=test-user
        COUCHBASE_BUCKET=test-bucket
      `;

      await writeFile(testEnvFile, config);
      await configHotReload.initialize([testEnvFile]);

      let configReloadedEventFired = false;

      configHotReload.on("configurationReloaded", () => {
        configReloadedEventFired = true;
      });

      // Write the same config (should not trigger reload)
      await writeFile(testEnvFile, config);
      await setTimeout(2500);

      expect(configReloadedEventFired).toBe(false);
    });
  });

  describe("Rollback Functionality", () => {
    test("should rollback on validation failure", async () => {
      const validConfig = `
        COUCHBASE_URL=couchbase://valid-cluster
        COUCHBASE_USERNAME=valid-user
        COUCHBASE_BUCKET=valid-bucket
        APPLICATION_PORT=4001
      `;

      const invalidConfig = `
        COUCHBASE_URL=invalid-url
        COUCHBASE_USERNAME=valid-user
        COUCHBASE_BUCKET=valid-bucket
        APPLICATION_PORT=not-a-number
      `;

      await writeFile(testEnvFile, validConfig);
      await configHotReload.initialize([testEnvFile]);

      // Store initial values
      const initialUrl = process.env.COUCHBASE_URL;
      const initialPort = process.env.APPLICATION_PORT;

      let _rollbackEventFired = false;

      configHotReload.on("configurationRolledBack", () => {
        _rollbackEventFired = true;
      });

      configHotReload.on("configurationReloadFailed", () => {
        // Validation failed as expected
      });

      // Apply invalid configuration
      await writeFile(testEnvFile, invalidConfig);
      await setTimeout(2500);

      // Environment should still have original values
      expect(process.env.COUCHBASE_URL).toBe(initialUrl);
      expect(process.env.APPLICATION_PORT).toBe(initialPort);
    });

    test("should handle rollback errors gracefully", async () => {
      const validConfig = `
        COUCHBASE_URL=couchbase://test-cluster
        COUCHBASE_USERNAME=test-user
        COUCHBASE_BUCKET=test-bucket
      `;

      await writeFile(testEnvFile, validConfig);
      await configHotReload.initialize([testEnvFile]);

      // Manually trigger rollback
      const status = configHotReload.getStatus();
      expect(status.enabled).toBe(true);

      // Should not throw even if rollback has issues
      let threw = false;
      try {
        await configHotReload.reloadConfiguration();
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });
  });

  describe("Memory Leak Prevention", () => {
    test("should properly clean up event listeners on disable", async () => {
      await writeFile(testEnvFile, "TEST_VAR=test");
      await configHotReload.initialize([testEnvFile]);

      // Add multiple listeners
      const listener1 = () => {};
      const listener2 = () => {};
      const listener3 = () => {};

      configHotReload.on("configurationReloaded", listener1);
      configHotReload.on("configurationReloadFailed", listener2);
      configHotReload.on("configurationRolledBack", listener3);

      // Check that listeners were added
      expect(configHotReload.listenerCount("configurationReloaded")).toBeGreaterThan(0);

      // Disable should clean up listeners
      configHotReload.disable();

      // All listeners should be removed
      expect(configHotReload.listenerCount("configurationReloaded")).toBe(0);
      expect(configHotReload.listenerCount("configurationReloadFailed")).toBe(0);
      expect(configHotReload.listenerCount("configurationRolledBack")).toBe(0);
    });

    test("should handle repeated initialization and disable cycles", async () => {
      const config = `
        COUCHBASE_URL=couchbase://test-cluster
        COUCHBASE_USERNAME=test-user
        COUCHBASE_BUCKET=test-bucket
      `;

      await writeFile(testEnvFile, config);

      // Multiple init/disable cycles should not cause issues
      for (let i = 0; i < 3; i++) {
        await configHotReload.initialize([testEnvFile]);
        expect(configHotReload.getStatus().enabled).toBe(true);

        configHotReload.disable();
        expect(configHotReload.getStatus().enabled).toBe(false);
      }
    });
  });

  describe("Error Handling", () => {
    test("should handle file system errors gracefully", async () => {
      const nonWritableFile = "/root/readonly-config.env"; // Likely to be non-writable

      // Should not crash on file system errors
      let threw = false;
      try {
        await configHotReload.initialize([nonWritableFile]);
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });

    test("should handle JSON parsing errors in configuration", async () => {
      // Create config with problematic content that might cause parsing issues
      const problematicConfig = `
        COUCHBASE_URL=couchbase://test-cluster
        COUCHBASE_USERNAME=test-user
        WEIRD_JSON_VAR={"incomplete": json
        COUCHBASE_BUCKET=test-bucket
      `;

      await writeFile(testEnvFile, problematicConfig);

      // Should handle parsing issues gracefully
      let threw = false;
      try {
        await configHotReload.initialize([testEnvFile]);
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });
  });

  describe("OpenTelemetry Configuration Validation", () => {
    test("should warn when OpenTelemetry is enabled but missing required vars", async () => {
      const initialConfig = `
        COUCHBASE_URL=couchbase://test-cluster
        COUCHBASE_USERNAME=test-user
        COUCHBASE_BUCKET=test-bucket
        ENABLE_OPENTELEMETRY=false
      `;

      const otelConfigIncomplete = `
        COUCHBASE_URL=couchbase://test-cluster
        COUCHBASE_USERNAME=test-user
        COUCHBASE_BUCKET=test-bucket
        ENABLE_OPENTELEMETRY=true
      `;

      // Initialize with OTEL disabled
      await writeFile(testEnvFile, initialConfig);
      await configHotReload.initialize([testEnvFile]);

      let configReloadedEventFired = false;

      configHotReload.on("configurationReloaded", (_event) => {
        configReloadedEventFired = true;
        // Should succeed with warnings
      });

      // Trigger reload by enabling OTEL (changes ENABLE_OPENTELEMETRY value)
      await writeFile(testEnvFile, otelConfigIncomplete);
      await setTimeout(2500);

      expect(configReloadedEventFired).toBe(true);
    });
  });

  describe("Manual Reload", () => {
    test("should support manual configuration reload", async () => {
      const config = `
        COUCHBASE_URL=couchbase://test-cluster
        COUCHBASE_USERNAME=test-user
        COUCHBASE_BUCKET=test-bucket
      `;

      await writeFile(testEnvFile, config);
      await configHotReload.initialize([testEnvFile]);

      // Manual reload should work
      let threw = false;
      try {
        await configHotReload.reloadConfiguration();
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });
  });
});
