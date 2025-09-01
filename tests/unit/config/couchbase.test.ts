// Unit tests for Couchbase configuration module
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  CouchbaseConfigSchema,
  couchbaseDefaults,
  loadCouchbaseConfigFromEnv,
  validateCouchbaseConfig,
} from "../../../src/config/modules/couchbase";

describe("Couchbase Configuration", () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("Schema Validation", () => {
    test("validates valid Couchbase configuration", () => {
      const validConfig = {
        COUCHBASE_URL: "couchbases://cb.example.com",
        COUCHBASE_USERNAME: "myuser",
        COUCHBASE_PASSWORD: "mypassword",
        COUCHBASE_BUCKET: "mybucket",
        COUCHBASE_SCOPE: "_default",
        COUCHBASE_COLLECTION: "_default",
        COUCHBASE_KV_TIMEOUT: 5000,
        COUCHBASE_KV_DURABLE_TIMEOUT: 10000,
        COUCHBASE_QUERY_TIMEOUT: 15000,
        COUCHBASE_ANALYTICS_TIMEOUT: 30000,
        COUCHBASE_SEARCH_TIMEOUT: 15000,
        COUCHBASE_CONNECT_TIMEOUT: 10000,
        COUCHBASE_BOOTSTRAP_TIMEOUT: 15000,
      };

      const result = CouchbaseConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    test("validates URL format", () => {
      const invalidUrl = {
        ...couchbaseDefaults,
        COUCHBASE_URL: "not-a-url",
      };

      const result = CouchbaseConfigSchema.safeParse(invalidUrl);
      expect(result.success).toBe(false);
    });

    test("validates timeout ranges", () => {
      const invalidTimeout = {
        ...couchbaseDefaults,
        COUCHBASE_KV_TIMEOUT: 500, // Below minimum
      };

      const result = CouchbaseConfigSchema.safeParse(invalidTimeout);
      expect(result.success).toBe(false);
    });

    test("validates username is not empty", () => {
      const emptyUsername = {
        ...couchbaseDefaults,
        COUCHBASE_USERNAME: "",
      };

      const result = CouchbaseConfigSchema.safeParse(emptyUsername);
      expect(result.success).toBe(false);
    });

    test("validates password is not empty", () => {
      const emptyPassword = {
        ...couchbaseDefaults,
        COUCHBASE_PASSWORD: "",
      };

      const result = CouchbaseConfigSchema.safeParse(emptyPassword);
      expect(result.success).toBe(false);
    });
  });

  describe("Environment Variable Loading", () => {
    test("loads defaults when no environment variables are set", () => {
      // Clear relevant environment variables
      delete process.env.COUCHBASE_URL;
      delete process.env.COUCHBASE_USERNAME;
      delete process.env.COUCHBASE_KV_TIMEOUT;

      const config = loadCouchbaseConfigFromEnv();

      expect(config.COUCHBASE_URL).toBe(couchbaseDefaults.COUCHBASE_URL);
      expect(config.COUCHBASE_USERNAME).toBe(couchbaseDefaults.COUCHBASE_USERNAME);
      expect(config.COUCHBASE_KV_TIMEOUT).toBe(couchbaseDefaults.COUCHBASE_KV_TIMEOUT);
    });

    test("loads values from environment variables", () => {
      process.env.COUCHBASE_URL = "couchbases://prod.example.com";
      process.env.COUCHBASE_USERNAME = "produser";
      process.env.COUCHBASE_PASSWORD = "prodpassword";
      process.env.COUCHBASE_KV_TIMEOUT = "8000";

      const config = loadCouchbaseConfigFromEnv();

      expect(config.COUCHBASE_URL).toBe("couchbases://prod.example.com");
      expect(config.COUCHBASE_USERNAME).toBe("produser");
      expect(config.COUCHBASE_PASSWORD).toBe("prodpassword");
      expect(config.COUCHBASE_KV_TIMEOUT).toBe(8000);
    });

    test("handles malformed timeout values gracefully", () => {
      process.env.COUCHBASE_KV_TIMEOUT = "not-a-number";
      process.env.COUCHBASE_QUERY_TIMEOUT = "invalid";

      const config = loadCouchbaseConfigFromEnv();

      // Should fall back to defaults
      expect(config.COUCHBASE_KV_TIMEOUT).toBe(couchbaseDefaults.COUCHBASE_KV_TIMEOUT);
      expect(config.COUCHBASE_QUERY_TIMEOUT).toBe(couchbaseDefaults.COUCHBASE_QUERY_TIMEOUT);
    });
  });

  describe("Production Security Validation", () => {
    test("detects default password in production", () => {
      const productionConfig = {
        ...couchbaseDefaults,
        COUCHBASE_PASSWORD: "password", // Default password
      };

      const warnings = validateCouchbaseConfig(productionConfig, true);
      expect(warnings).toContain("CRITICAL: Using default password in production - security risk");
    });

    test("warns about default username in production", () => {
      const productionConfig = {
        ...couchbaseDefaults,
        COUCHBASE_USERNAME: "Administrator",
        COUCHBASE_PASSWORD: "strongpassword",
      };

      const warnings = validateCouchbaseConfig(productionConfig, true);
      expect(warnings).toContain("Using default Administrator username in production is not recommended");
    });

    test("allows default credentials in development", () => {
      const devConfig = couchbaseDefaults;

      const warnings = validateCouchbaseConfig(devConfig, false);
      expect(warnings.length).toBe(0);
    });
  });

  describe("Timeout Relationship Validation", () => {
    test("warns when KV timeout exceeds query timeout", () => {
      const configWithBadTimeouts = {
        ...couchbaseDefaults,
        COUCHBASE_KV_TIMEOUT: 20000,
        COUCHBASE_QUERY_TIMEOUT: 15000, // Lower than KV timeout
      };

      const warnings = validateCouchbaseConfig(configWithBadTimeouts, false);
      expect(warnings).toContain("KV timeout should not exceed query timeout for optimal performance");
    });

    test("warns when connect timeout exceeds bootstrap timeout", () => {
      const configWithBadTimeouts = {
        ...couchbaseDefaults,
        COUCHBASE_CONNECT_TIMEOUT: 20000,
        COUCHBASE_BOOTSTRAP_TIMEOUT: 15000, // Lower than connect timeout
      };

      const warnings = validateCouchbaseConfig(configWithBadTimeouts, false);
      expect(warnings).toContain("Connect timeout should not exceed bootstrap timeout");
    });

    test("accepts reasonable timeout relationships", () => {
      const configWithGoodTimeouts = {
        ...couchbaseDefaults,
        COUCHBASE_KV_TIMEOUT: 5000,
        COUCHBASE_QUERY_TIMEOUT: 15000,
        COUCHBASE_CONNECT_TIMEOUT: 10000,
        COUCHBASE_BOOTSTRAP_TIMEOUT: 15000,
      };

      const warnings = validateCouchbaseConfig(configWithGoodTimeouts, false);
      expect(warnings.length).toBe(0);
    });
  });

  describe("Error Path Mapping", () => {
    test("maps configuration paths to environment variables", () => {
      const { getCouchbaseEnvVarPath } = require("../../../src/config/modules/couchbase");

      expect(getCouchbaseEnvVarPath("capella.COUCHBASE_URL")).toBe("COUCHBASE_URL");
      expect(getCouchbaseEnvVarPath("capella.COUCHBASE_USERNAME")).toBe("COUCHBASE_USERNAME");
      expect(getCouchbaseEnvVarPath("capella.COUCHBASE_KV_TIMEOUT")).toBe("COUCHBASE_KV_TIMEOUT");
      expect(getCouchbaseEnvVarPath("unknown.path")).toBeUndefined();
    });
  });
});
