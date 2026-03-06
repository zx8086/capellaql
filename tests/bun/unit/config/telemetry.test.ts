// Unit tests for telemetry configuration module
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  loadTelemetryConfigFromEnv,
  TelemetryConfigSchema,
  telemetryDefaults,
  validateTelemetryConfig,
  getTelemetryEnvVarPath,
} from "../../../../src/config/modules/telemetry";

describe("Telemetry Configuration", () => {
  // Track env vars modified by tests so we can restore them properly.
  // Using process.env = {...} breaks Bun.env's internal reference, so we
  // must restore individual keys to keep both process.env and Bun.env in sync.
  const envKeysToRestore = [
    "ENABLE_OPENTELEMETRY",
    "OTEL_SERVICE_NAME",
    "SERVICE_NAME",
    "BATCH_SIZE",
    "OTEL_SERVICE_VERSION",
    "DEPLOYMENT_ENVIRONMENT",
  ];
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {};
    for (const key of envKeysToRestore) {
      savedEnv[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeysToRestore) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  describe("Schema Validation", () => {
    test("validates valid telemetry configuration", () => {
      const validConfig = {
        ENABLE_OPENTELEMETRY: true,
        SERVICE_NAME: "CapellaQL Service",
        SERVICE_VERSION: "2.0",
        SERVICE_NAMESPACE: "capella-graphql-api",
        DEPLOYMENT_ENVIRONMENT: "production",
        TRACES_ENDPOINT: "http://localhost:4318/v1/traces",
        METRICS_ENDPOINT: "http://localhost:4318/v1/metrics",
        LOGS_ENDPOINT: "http://localhost:4318/v1/logs",
        METRIC_READER_INTERVAL: 60000,
        SUMMARY_LOG_INTERVAL: 300000,
        EXPORT_TIMEOUT_MS: 30000,
        BATCH_SIZE: 2048,
        MAX_QUEUE_SIZE: 10000,
        CIRCUIT_BREAKER_THRESHOLD: 5,
        CIRCUIT_BREAKER_TIMEOUT_MS: 60000,
        LOG_RETENTION_DEBUG_DAYS: 1,
        LOG_RETENTION_INFO_DAYS: 7,
        LOG_RETENTION_WARN_DAYS: 30,
        LOG_RETENTION_ERROR_DAYS: 90,
      };

      const result = TelemetryConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    test("validates deployment environment enum", () => {
      const invalidEnvironment = {
        ...telemetryDefaults,
        DEPLOYMENT_ENVIRONMENT: "invalid",
      };

      const result = TelemetryConfigSchema.safeParse(invalidEnvironment);
      expect(result.success).toBe(false);
    });

    test("validates URL format for endpoints", () => {
      const invalidEndpoint = {
        ...telemetryDefaults,
        TRACES_ENDPOINT: "not-a-url",
      };

      const result = TelemetryConfigSchema.safeParse(invalidEndpoint);
      expect(result.success).toBe(false);
    });

    test("validates 2025 compliance - export timeout", () => {
      const invalidTimeout = {
        ...telemetryDefaults,
        EXPORT_TIMEOUT_MS: 35000, // Exceeds 2025 standard
      };

      const result = TelemetryConfigSchema.safeParse(invalidTimeout);
      expect(result.success).toBe(false);
    });

    test("validates batch size limits", () => {
      const invalidBatchSize = {
        ...telemetryDefaults,
        BATCH_SIZE: 5000, // Above recommended maximum
      };

      const result = TelemetryConfigSchema.safeParse(invalidBatchSize);
      expect(result.success).toBe(false);
    });

    test("validates circuit breaker threshold limits", () => {
      const invalidThreshold = {
        ...telemetryDefaults,
        CIRCUIT_BREAKER_THRESHOLD: 25, // Above max of 20
      };

      const result = TelemetryConfigSchema.safeParse(invalidThreshold);
      expect(result.success).toBe(false);
    });
  });

  describe("Environment Variable Loading", () => {
    test("loads defaults when no environment variables are set", () => {
      // Clear relevant environment variables
      delete process.env.ENABLE_OPENTELEMETRY;
      delete process.env.OTEL_SERVICE_NAME;
      delete process.env.SERVICE_NAME;
      delete process.env.BATCH_SIZE;

      const config = loadTelemetryConfigFromEnv();

      expect(config.SERVICE_NAME).toBe(telemetryDefaults.SERVICE_NAME);
      expect(config.BATCH_SIZE).toBe(telemetryDefaults.BATCH_SIZE);
    });

    test("loads values from environment variables", () => {
      process.env.ENABLE_OPENTELEMETRY = "false";
      process.env.OTEL_SERVICE_NAME = "Custom Service";
      process.env.BATCH_SIZE = "1024";

      const config = loadTelemetryConfigFromEnv();

      // ENABLE_OPENTELEMETRY uses ?? so false is preserved (not overridden by default)
      expect(config.ENABLE_OPENTELEMETRY).toBe(false);
      expect(config.SERVICE_NAME).toBe("Custom Service");
      expect(config.BATCH_SIZE).toBe(1024);
    });

    test("handles malformed environment variables gracefully", () => {
      process.env.BATCH_SIZE = "not-a-number";
      process.env.ENABLE_OPENTELEMETRY = "maybe";

      const config = loadTelemetryConfigFromEnv();

      // Should fall back to defaults for invalid numbers
      expect(config.BATCH_SIZE).toBe(telemetryDefaults.BATCH_SIZE);
      // "maybe" is treated as false by parseEnvVar boolean handler
      expect(config.ENABLE_OPENTELEMETRY).toBe(false);
    });
  });

  describe("Domain-Specific Validation", () => {
    test("detects NaN metric reader interval", () => {
      const configWithNaN = {
        ...telemetryDefaults,
        METRIC_READER_INTERVAL: NaN,
      };

      const warnings = validateTelemetryConfig(configWithNaN, false);
      expect(warnings).toContain("METRIC_READER_INTERVAL is NaN - this will cause infinite loops");
    });

    test("detects NaN summary log interval", () => {
      const configWithNaN = {
        ...telemetryDefaults,
        SUMMARY_LOG_INTERVAL: NaN,
      };

      const warnings = validateTelemetryConfig(configWithNaN, false);
      expect(warnings).toContain("SUMMARY_LOG_INTERVAL is NaN - this will cause infinite loops");
    });

    test("validates export timeout compliance in production", () => {
      const productionConfig = {
        ...telemetryDefaults,
        EXPORT_TIMEOUT_MS: 35000, // Above 2025 standard
      };

      const warnings = validateTelemetryConfig(productionConfig, true);
      expect(warnings).toContain("EXPORT_TIMEOUT_MS exceeds 30 seconds - this violates 2025 OpenTelemetry standards");
    });

    test("validates batch size optimization in production", () => {
      const productionConfig = {
        ...telemetryDefaults,
        BATCH_SIZE: 512, // Below recommended
      };

      const warnings = validateTelemetryConfig(productionConfig, true);
      expect(warnings).toContain("BATCH_SIZE is below recommended 1024 for production environments");
    });

    test("allows normal settings in development", () => {
      const devConfig = telemetryDefaults;

      const warnings = validateTelemetryConfig(devConfig, false);
      expect(warnings.length).toBe(0);
    });
  });

  describe("Error Path Mapping", () => {
    test("maps configuration paths to environment variables", () => {
      expect(getTelemetryEnvVarPath("telemetry.ENABLE_OPENTELEMETRY")).toBe("ENABLE_OPENTELEMETRY");
      expect(getTelemetryEnvVarPath("telemetry.SERVICE_NAME")).toBe("OTEL_SERVICE_NAME");
      expect(getTelemetryEnvVarPath("telemetry.BATCH_SIZE")).toBe("BATCH_SIZE");
      expect(getTelemetryEnvVarPath("unknown.path")).toBeUndefined();
    });
  });
});
