// Unit tests for configuration validators
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Config } from "../../../src/config/base";
import {
  generateConfigHealthReport,
  validateConfigHealth,
  validateCrossConfiguration,
} from "../../../src/config/validators";

// Mock configuration for testing
const createMockConfig = (overrides: Partial<Config> = {}): Config => ({
  application: {
    LOG_LEVEL: "info",
    YOGA_RESPONSE_CACHE_TTL: 900000,
    PORT: 4000,
    ALLOWED_ORIGINS: ["http://localhost:3000"],
    BASE_URL: "http://localhost",
    ...overrides.application,
  },
  capella: {
    COUCHBASE_URL: "couchbase://localhost",
    COUCHBASE_USERNAME: "user",
    COUCHBASE_PASSWORD: "secure123",
    COUCHBASE_BUCKET: "default",
    COUCHBASE_SCOPE: "_default",
    COUCHBASE_COLLECTION: "_default",
    COUCHBASE_KV_TIMEOUT: 5000,
    COUCHBASE_KV_DURABLE_TIMEOUT: 10000,
    COUCHBASE_QUERY_TIMEOUT: 15000,
    COUCHBASE_ANALYTICS_TIMEOUT: 30000,
    COUCHBASE_SEARCH_TIMEOUT: 15000,
    COUCHBASE_CONNECT_TIMEOUT: 10000,
    COUCHBASE_BOOTSTRAP_TIMEOUT: 15000,
    ...overrides.capella,
  },
  runtime: {
    NODE_ENV: "development",
    CN_ROOT: "/usr/src/app",
    CN_CXXCBC_CACHE_DIR: undefined,
    SOURCE_MAP_SUPPORT: true,
    PRESERVE_SOURCE_MAPS: true,
    BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS: 120,
    ...overrides.runtime,
  },
  deployment: {
    BASE_URL: "http://localhost",
    HOSTNAME: "localhost",
    INSTANCE_ID: "test-instance",
    CONTAINER_ID: undefined,
    K8S_POD_NAME: undefined,
    K8S_NAMESPACE: undefined,
    ...overrides.deployment,
  },
  telemetry: {
    ENABLE_OPENTELEMETRY: true,
    SERVICE_NAME: "CapellaQL Service",
    SERVICE_VERSION: "2.0",
    DEPLOYMENT_ENVIRONMENT: "development",
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
    ...overrides.telemetry,
  },
});

describe("Configuration Validators", () => {
  let originalConsole: typeof console;

  beforeEach(() => {
    originalConsole = { ...console };
  });

  afterEach(() => {
    console = originalConsole;
  });

  describe("Cross-Configuration Validation", () => {
    test("detects environment mismatch", () => {
      const warnSpy = mock(console, "warn");

      const config = createMockConfig({
        runtime: {
          NODE_ENV: "production",
          CN_ROOT: "/usr/src/app",
          SOURCE_MAP_SUPPORT: true,
          PRESERVE_SOURCE_MAPS: true,
          BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS: 120,
        },
        telemetry: {
          ENABLE_OPENTELEMETRY: true,
          SERVICE_NAME: "CapellaQL Service",
          SERVICE_VERSION: "2.0",
          DEPLOYMENT_ENVIRONMENT: "development", // Mismatch!
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
        },
      });

      validateCrossConfiguration(config);

      expect(warnSpy).toHaveBeenCalledWith(
        "Environment mismatch: NODE_ENV=production but DEPLOYMENT_ENVIRONMENT=development"
      );

      warnSpy.mockRestore();
    });

    test("detects NaN cache TTL", () => {
      const config = createMockConfig({
        application: {
          LOG_LEVEL: "info",
          YOGA_RESPONSE_CACHE_TTL: NaN, // Invalid!
          PORT: 4000,
          ALLOWED_ORIGINS: ["http://localhost:3000"],
          BASE_URL: "http://localhost",
        },
      });

      const warnings = validateCrossConfiguration(config);
      expect(warnings).toContain("Cache TTL cannot be NaN - this would cause runtime errors");
    });

    test("detects NaN telemetry intervals", () => {
      const config = createMockConfig({
        telemetry: {
          ENABLE_OPENTELEMETRY: true,
          SERVICE_NAME: "CapellaQL Service",
          SERVICE_VERSION: "2.0",
          DEPLOYMENT_ENVIRONMENT: "development",
          TRACES_ENDPOINT: "http://localhost:4318/v1/traces",
          METRICS_ENDPOINT: "http://localhost:4318/v1/metrics",
          LOGS_ENDPOINT: "http://localhost:4318/v1/logs",
          METRIC_READER_INTERVAL: NaN, // Invalid!
          SUMMARY_LOG_INTERVAL: NaN, // Invalid!
          EXPORT_TIMEOUT_MS: 30000,
          BATCH_SIZE: 2048,
          MAX_QUEUE_SIZE: 10000,
          SAMPLING_RATE: 0.15,
          CIRCUIT_BREAKER_THRESHOLD: 5,
          CIRCUIT_BREAKER_TIMEOUT_MS: 60000,
        },
      });

      const warnings = validateCrossConfiguration(config);
      expect(warnings).toContain("METRIC_READER_INTERVAL is NaN - this will cause infinite loops");
      expect(warnings).toContain("SUMMARY_LOG_INTERVAL is NaN - this will cause infinite loops");
    });

    test("validates production security settings", () => {
      const productionConfig = createMockConfig({
        runtime: {
          NODE_ENV: "production",
          CN_ROOT: "/usr/src/app",
          SOURCE_MAP_SUPPORT: true,
          PRESERVE_SOURCE_MAPS: true,
          BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS: 120,
        },
        telemetry: {
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
        },
        capella: {
          COUCHBASE_URL: "couchbase://localhost",
          COUCHBASE_USERNAME: "Administrator",
          COUCHBASE_PASSWORD: "password", // Insecure!
          COUCHBASE_BUCKET: "default",
          COUCHBASE_SCOPE: "_default",
          COUCHBASE_COLLECTION: "_default",
          COUCHBASE_KV_TIMEOUT: 5000,
          COUCHBASE_KV_DURABLE_TIMEOUT: 10000,
          COUCHBASE_QUERY_TIMEOUT: 15000,
          COUCHBASE_ANALYTICS_TIMEOUT: 30000,
          COUCHBASE_SEARCH_TIMEOUT: 15000,
          COUCHBASE_CONNECT_TIMEOUT: 10000,
          COUCHBASE_BOOTSTRAP_TIMEOUT: 15000,
        },
        application: {
          LOG_LEVEL: "info",
          YOGA_RESPONSE_CACHE_TTL: 900000,
          PORT: 4000,
          ALLOWED_ORIGINS: ["*"], // Insecure!
          BASE_URL: "http://localhost",
        },
      });

      const warnings = validateCrossConfiguration(productionConfig);
      expect(warnings).toContain(
        "CRITICAL SECURITY: Default password not allowed in production - this is a security vulnerability"
      );
      expect(warnings).toContain("WARNING: Using default Administrator username in production is not recommended");
      expect(warnings).toContain("Production CORS origins should not include localhost or wildcards");
    });
  });

  describe("Health Validation", () => {
    test("reports healthy configuration", () => {
      const config = createMockConfig();

      const health = validateConfigHealth(config);

      expect(health.healthy).toBe(true);
      expect(health.issues.length).toBe(0);
    });

    test("detects critical issues", () => {
      const configWithIssues = createMockConfig({
        application: {
          LOG_LEVEL: "info",
          YOGA_RESPONSE_CACHE_TTL: NaN, // Critical issue
          PORT: 4000,
          ALLOWED_ORIGINS: ["http://localhost:3000"],
          BASE_URL: "http://localhost",
        },
        runtime: {
          NODE_ENV: "production",
          CN_ROOT: "/usr/src/app",
          SOURCE_MAP_SUPPORT: true,
          PRESERVE_SOURCE_MAPS: true,
          BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS: NaN, // Critical issue
        },
        capella: {
          COUCHBASE_URL: "couchbase://localhost",
          COUCHBASE_USERNAME: "user",
          COUCHBASE_PASSWORD: "password", // Critical in production
          COUCHBASE_BUCKET: "default",
          COUCHBASE_SCOPE: "_default",
          COUCHBASE_COLLECTION: "_default",
          COUCHBASE_KV_TIMEOUT: 5000,
          COUCHBASE_KV_DURABLE_TIMEOUT: 10000,
          COUCHBASE_QUERY_TIMEOUT: 15000,
          COUCHBASE_ANALYTICS_TIMEOUT: 30000,
          COUCHBASE_SEARCH_TIMEOUT: 15000,
          COUCHBASE_CONNECT_TIMEOUT: 10000,
          COUCHBASE_BOOTSTRAP_TIMEOUT: 15000,
        },
      });

      const health = validateConfigHealth(configWithIssues);

      expect(health.healthy).toBe(false);
      expect(health.issues.length).toBeGreaterThan(0);
      expect(health.issues).toContain("YOGA_RESPONSE_CACHE_TTL is NaN - will cause runtime errors");
      expect(health.issues).toContain("BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS is NaN - will cause DNS caching issues");
      expect(health.issues).toContain("CRITICAL: Using default password in production - security risk");
    });

    test("detects warnings without failing health", () => {
      const configWithWarnings = createMockConfig({
        runtime: {
          NODE_ENV: "development",
          CN_ROOT: "/usr/src/app",
          SOURCE_MAP_SUPPORT: true,
          PRESERVE_SOURCE_MAPS: true,
          BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS: 4000, // Above recommended
        },
      });

      const health = validateConfigHealth(configWithWarnings);

      expect(health.healthy).toBe(true);
      expect(health.warnings.length).toBeGreaterThan(0);
      expect(health.warnings).toContain("DNS TTL exceeds 1 hour - may cause stale DNS resolution");
    });
  });

  describe("Health Report Generation", () => {
    test("generates comprehensive health report for healthy config", () => {
      const config = createMockConfig();

      const report = generateConfigHealthReport(config);

      expect(report).toContain("Overall Status: HEALTHY");
      expect(report).toContain("Environment: DEVELOPMENT");
      expect(report).toContain("Total Issues: 0");
      expect(report).toContain("All configuration checks passed!");
    });

    test("generates detailed health report for unhealthy config", () => {
      const configWithIssues = createMockConfig({
        application: {
          LOG_LEVEL: "info",
          YOGA_RESPONSE_CACHE_TTL: NaN, // Issue
          PORT: 4000,
          ALLOWED_ORIGINS: ["http://localhost:3000"],
          BASE_URL: "http://localhost",
        },
        runtime: {
          NODE_ENV: "production",
          CN_ROOT: "/usr/src/app",
          SOURCE_MAP_SUPPORT: true,
          PRESERVE_SOURCE_MAPS: true,
          BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS: 4000, // Warning
        },
      });

      const report = generateConfigHealthReport(configWithIssues);

      expect(report).toContain("Overall Status: UNHEALTHY");
      expect(report).toContain("Environment: PRODUCTION");
      expect(report).toContain("CRITICAL ISSUES");
      expect(report).toContain("WARNINGS");
      expect(report).toContain("YOGA_RESPONSE_CACHE_TTL is NaN");
      expect(report).toContain("DNS TTL exceeds 1 hour");
    });

    test("generates report with warnings only", () => {
      const configWithWarnings = createMockConfig({
        runtime: {
          NODE_ENV: "development",
          CN_ROOT: "/usr/src/app",
          SOURCE_MAP_SUPPORT: true,
          PRESERVE_SOURCE_MAPS: true,
          BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS: 4000, // Warning only
        },
      });

      const report = generateConfigHealthReport(configWithWarnings);

      expect(report).toContain("Overall Status: HEALTHY");
      expect(report).toContain("Total Issues: 0");
      expect(report).toContain("WARNINGS");
      expect(report).toContain("DNS TTL exceeds 1 hour");
      expect(report).not.toContain("CRITICAL ISSUES");
    });
  });
});
