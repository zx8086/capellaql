// Unit tests for application configuration module
import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { 
  ApplicationConfigSchema, 
  loadApplicationConfigFromEnv, 
  applicationDefaults,
  validateApplicationConfig 
} from "../../../src/config/modules/application";

describe("Application Configuration", () => {
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
    test("validates valid configuration", () => {
      const validConfig = {
        LOG_LEVEL: "info",
        LOG_MAX_SIZE: "20m",
        LOG_MAX_FILES: "14d",
        YOGA_RESPONSE_CACHE_TTL: 900000,
        PORT: 4000,
        ENABLE_FILE_LOGGING: false,
        ALLOWED_ORIGINS: ["http://localhost:3000"],
        BASE_URL: "http://localhost"
      };

      const result = ApplicationConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    test("validates log level enum", () => {
      const invalidLogLevel = {
        ...applicationDefaults,
        LOG_LEVEL: "invalid"
      };

      const result = ApplicationConfigSchema.safeParse(invalidLogLevel);
      expect(result.success).toBe(false);
    });

    test("validates port range", () => {
      const invalidPort = {
        ...applicationDefaults,
        PORT: 70000 // Above valid range
      };

      const result = ApplicationConfigSchema.safeParse(invalidPort);
      expect(result.success).toBe(false);
    });

    test("validates URL format for BASE_URL", () => {
      const invalidUrl = {
        ...applicationDefaults,
        BASE_URL: "not-a-url"
      };

      const result = ApplicationConfigSchema.safeParse(invalidUrl);
      expect(result.success).toBe(false);
    });

    test("validates ALLOWED_ORIGINS as URL array", () => {
      const invalidOrigins = {
        ...applicationDefaults,
        ALLOWED_ORIGINS: ["not-a-url", "http://valid.com"]
      };

      const result = ApplicationConfigSchema.safeParse(invalidOrigins);
      expect(result.success).toBe(false);
    });
  });

  describe("Environment Variable Loading", () => {
    test("loads defaults when no environment variables are set", () => {
      // Clear relevant environment variables
      delete process.env.LOG_LEVEL;
      delete process.env.PORT;
      delete process.env.ENABLE_FILE_LOGGING;

      const config = loadApplicationConfigFromEnv();

      expect(config.LOG_LEVEL).toBe(applicationDefaults.LOG_LEVEL);
      expect(config.PORT).toBe(applicationDefaults.PORT);
      expect(config.ENABLE_FILE_LOGGING).toBe(applicationDefaults.ENABLE_FILE_LOGGING);
    });

    test("loads values from environment variables", () => {
      process.env.LOG_LEVEL = "debug";
      process.env.PORT = "8080";
      process.env.ENABLE_FILE_LOGGING = "true";
      process.env.ALLOWED_ORIGINS = "http://example.com,https://api.example.com";

      const config = loadApplicationConfigFromEnv();

      expect(config.LOG_LEVEL).toBe("debug");
      expect(config.PORT).toBe(8080);
      expect(config.ENABLE_FILE_LOGGING).toBe(true);
      expect(config.ALLOWED_ORIGINS).toEqual(["http://example.com", "https://api.example.com"]);
    });

    test("handles malformed environment variables gracefully", () => {
      process.env.PORT = "not-a-number";
      process.env.ENABLE_FILE_LOGGING = "maybe";

      const config = loadApplicationConfigFromEnv();

      // Should fall back to defaults
      expect(config.PORT).toBe(applicationDefaults.PORT);
      expect(config.ENABLE_FILE_LOGGING).toBe(applicationDefaults.ENABLE_FILE_LOGGING);
    });
  });

  describe("Domain-Specific Validation", () => {
    test("detects NaN cache TTL", () => {
      const configWithNaN = {
        ...applicationDefaults,
        YOGA_RESPONSE_CACHE_TTL: NaN
      };

      const warnings = validateApplicationConfig(configWithNaN, false);
      expect(warnings).toContain("YOGA_RESPONSE_CACHE_TTL is NaN - will cause runtime errors");
    });

    test("detects unreasonable cache TTL values", () => {
      const configWithBadTTL = {
        ...applicationDefaults,
        YOGA_RESPONSE_CACHE_TTL: 0 // Too low
      };

      const warnings = validateApplicationConfig(configWithBadTTL, false);
      expect(warnings.some(w => w.includes("unreasonable"))).toBe(true);
    });

    test("validates production CORS origins", () => {
      const productionConfig = {
        ...applicationDefaults,
        ALLOWED_ORIGINS: ["http://localhost:3000", "*"]
      };

      const warnings = validateApplicationConfig(productionConfig, true);
      expect(warnings).toContain("Production CORS origins should not include localhost or wildcards");
    });

    test("allows localhost origins in development", () => {
      const devConfig = {
        ...applicationDefaults,
        ALLOWED_ORIGINS: ["http://localhost:3000"]
      };

      const warnings = validateApplicationConfig(devConfig, false);
      expect(warnings.length).toBe(0);
    });

    test("warns about privileged ports in development", () => {
      // Mock console.warn to capture warnings
      const warnSpy = mock(console, "warn");
      
      const configWithPrivilegedPort = {
        ...applicationDefaults,
        PORT: 80
      };

      validateApplicationConfig(configWithPrivilegedPort, false);
      expect(warnSpy).toHaveBeenCalledWith("Port 80 is a privileged port - ensure proper permissions");
      
      warnSpy.mockRestore();
    });
  });

  describe("Error Path Mapping", () => {
    test("maps configuration paths to environment variables", () => {
      const { getApplicationEnvVarPath } = require("../../../src/config/modules/application");
      
      expect(getApplicationEnvVarPath("application.LOG_LEVEL")).toBe("LOG_LEVEL");
      expect(getApplicationEnvVarPath("application.PORT")).toBe("PORT");
      expect(getApplicationEnvVarPath("application.BASE_URL")).toBe("BASE_URL");
      expect(getApplicationEnvVarPath("unknown.path")).toBeUndefined();
    });
  });
});