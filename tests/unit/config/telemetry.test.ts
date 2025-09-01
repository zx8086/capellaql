// Unit tests for telemetry configuration module
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  loadTelemetryConfigFromEnv,
  TelemetryConfigSchema,
  telemetryDefaults,
  validateTelemetryConfig,
} from "../../../src/config/modules/telemetry";

describe("Telemetry Configuration", () => {
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
    test("validates valid telemetry configuration", () => {
      const validConfig = {
        ENABLE_OPENTELEMETRY: true,
        SERVICE_NAME: "CapellaQL Service",
        SERVICE_VERSION: "2.0",
        DEPLOYMENT_ENVIRONMENT: "production",
        TRACES_ENDPOINT: "http://localhost:4318/v1/traces",
        METRICS_ENDPOINT: "http://localhost:4318/v1/metrics",
        LOGS_ENDPOINT: "http://localhost:4318/v1/logs",
        METRIC_READER_INTERVAL: 60000,
        SUMMARY_LOG_INTERVAL: 300000,
        EXPORT_TIMEOUT_MS: 30000,
        BATCH_SIZE: 2048,
        MAX_QUEUE_SIZE: 10000,
        SAMPLING_RATE: 0.15,
        CIRCUIT_BREAKER_THRESHOLD: 5,
        CIRCUIT_BREAKER_TIMEOUT_MS: 60000,
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

    test("validates sampling rate range", () => {
      const invalidSamplingRate = {
        ...telemetryDefaults,
        SAMPLING_RATE: 1.5, // Above 100%
      };

      const result = TelemetryConfigSchema.safeParse(invalidSamplingRate);
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
  });

  describe("Environment Variable Loading", () => {
    test("loads defaults when no environment variables are set", () => {
      // Clear relevant environment variables
      delete process.env.ENABLE_OPENTELEMETRY;
      delete process.env.SERVICE_NAME;
      delete process.env.BATCH_SIZE;

      const config = loadTelemetryConfigFromEnv();

      expect(config.ENABLE_OPENTELEMETRY).toBe(telemetryDefaults.ENABLE_OPENTELEMETRY);
      expect(config.SERVICE_NAME).toBe(telemetryDefaults.SERVICE_NAME);
      expect(config.BATCH_SIZE).toBe(telemetryDefaults.BATCH_SIZE);
    });

    test("loads values from environment variables", () => {
      process.env.ENABLE_OPENTELEMETRY = "false";
      process.env.SERVICE_NAME = "Custom Service";
      process.env.BATCH_SIZE = "1024";
      process.env.SAMPLING_RATE = "0.25";

      const config = loadTelemetryConfigFromEnv();

      expect(config.ENABLE_OPENTELEMETRY).toBe(false);
      expect(config.SERVICE_NAME).toBe("Custom Service");
      expect(config.BATCH_SIZE).toBe(1024);
      expect(config.SAMPLING_RATE).toBe(0.25);
    });

    test("handles malformed environment variables gracefully", () => {
      process.env.BATCH_SIZE = "not-a-number";
      process.env.ENABLE_OPENTELEMETRY = "maybe";
      process.env.SAMPLING_RATE = "invalid";

      const config = loadTelemetryConfigFromEnv();

      // Should fall back to defaults
      expect(config.BATCH_SIZE).toBe(telemetryDefaults.BATCH_SIZE);
      expect(config.ENABLE_OPENTELEMETRY).toBe(telemetryDefaults.ENABLE_OPENTELEMETRY);
      expect(config.SAMPLING_RATE).toBe(telemetryDefaults.SAMPLING_RATE);
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

    test("validates high sampling rate in production", () => {
      const productionConfig = {
        ...telemetryDefaults,
        SAMPLING_RATE: 0.8, // 80% sampling
      };

      const warnings = validateTelemetryConfig(productionConfig, true);
      expect(warnings).toContain("SAMPLING_RATE above 50% may impact performance in production");
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

  describe("Endpoint Consistency Validation", () => {
    test("warns about different telemetry endpoint hosts", () => {
      const configWithDifferentHosts = {
        ...telemetryDefaults,
        TRACES_ENDPOINT: "http://traces.example.com:4318/v1/traces",
        METRICS_ENDPOINT: "http://metrics.example.com:4318/v1/metrics",
        LOGS_ENDPOINT: "http://logs.example.com:4318/v1/logs",
      };

      // Mock console.warn to capture warnings
      const warnSpy = mock(console, "warn");

      validateTelemetryConfig(configWithDifferentHosts, false);

      expect(warnSpy).toHaveBeenCalledWith(
        "Telemetry endpoints use different hosts - consider using the same OTLP collector"
      );

      warnSpy.mockRestore();
    });

    test("accepts consistent telemetry endpoint hosts", () => {
      const configWithSameHost = {
        ...telemetryDefaults,
        TRACES_ENDPOINT: "http://otel.example.com:4318/v1/traces",
        METRICS_ENDPOINT: "http://otel.example.com:4318/v1/metrics",
        LOGS_ENDPOINT: "http://otel.example.com:4318/v1/logs",
      };

      // Mock console.warn to ensure it's not called
      const warnSpy = mock(console, "warn");

      validateTelemetryConfig(configWithSameHost, false);

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe("Error Path Mapping", () => {
    test("maps configuration paths to environment variables", () => {
      const { getTelemetryEnvVarPath } = require("../../../src/config/modules/telemetry");

      expect(getTelemetryEnvVarPath("telemetry.ENABLE_OPENTELEMETRY")).toBe("ENABLE_OPENTELEMETRY");
      expect(getTelemetryEnvVarPath("telemetry.SERVICE_NAME")).toBe("SERVICE_NAME");
      expect(getTelemetryEnvVarPath("telemetry.BATCH_SIZE")).toBe("BATCH_SIZE");
      expect(getTelemetryEnvVarPath("unknown.path")).toBeUndefined();
    });
  });
});
