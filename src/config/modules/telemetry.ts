// Telemetry configuration module
import { z } from "zod";
import type { TelemetryConfig } from "../base";
import { getEnvVar, parseEnvVar } from "../utils/env-parser";

// Environment variable mapping for telemetry section
// Uses standard OTEL environment variable names per OpenTelemetry specification
export const telemetryEnvMapping = {
  ENABLE_OPENTELEMETRY: "ENABLE_OPENTELEMETRY",
  SERVICE_NAME: "OTEL_SERVICE_NAME",
  SERVICE_VERSION: "OTEL_SERVICE_VERSION",
  DEPLOYMENT_ENVIRONMENT: "DEPLOYMENT_ENVIRONMENT",
  // Standard OTEL exporter endpoint environment variables
  OTLP_ENDPOINT: "OTEL_EXPORTER_OTLP_ENDPOINT", // Base endpoint (fallback)
  TRACES_ENDPOINT: "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
  METRICS_ENDPOINT: "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
  LOGS_ENDPOINT: "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT",
  METRIC_READER_INTERVAL: "METRIC_READER_INTERVAL",
  SUMMARY_LOG_INTERVAL: "SUMMARY_LOG_INTERVAL",
  EXPORT_TIMEOUT_MS: "EXPORT_TIMEOUT_MS",
  BATCH_SIZE: "BATCH_SIZE",
  MAX_QUEUE_SIZE: "MAX_QUEUE_SIZE",
  CIRCUIT_BREAKER_THRESHOLD: "CIRCUIT_BREAKER_THRESHOLD",
  CIRCUIT_BREAKER_TIMEOUT_MS: "CIRCUIT_BREAKER_TIMEOUT_MS",
  // Log retention policy
  LOG_RETENTION_DEBUG_DAYS: "LOG_RETENTION_DEBUG_DAYS",
  LOG_RETENTION_INFO_DAYS: "LOG_RETENTION_INFO_DAYS",
  LOG_RETENTION_WARN_DAYS: "LOG_RETENTION_WARN_DAYS",
  LOG_RETENTION_ERROR_DAYS: "LOG_RETENTION_ERROR_DAYS",
} as const;

// Telemetry configuration defaults (2025 compliance)
export const telemetryDefaults: TelemetryConfig = {
  ENABLE_OPENTELEMETRY: true,
  SERVICE_NAME: "capellaql-service",
  SERVICE_VERSION: "2.0",
  DEPLOYMENT_ENVIRONMENT: "development",
  TRACES_ENDPOINT: "http://localhost:4318/v1/traces",
  METRICS_ENDPOINT: "http://localhost:4318/v1/metrics",
  LOGS_ENDPOINT: "http://localhost:4318/v1/logs",
  METRIC_READER_INTERVAL: 60000,
  SUMMARY_LOG_INTERVAL: 300000,
  // 2025 compliance defaults
  EXPORT_TIMEOUT_MS: 30000,
  BATCH_SIZE: 2048,
  MAX_QUEUE_SIZE: 10000,
  CIRCUIT_BREAKER_THRESHOLD: 5,
  CIRCUIT_BREAKER_TIMEOUT_MS: 60000,
  // Log retention policy (days) - balance compliance and cost
  LOG_RETENTION_DEBUG_DAYS: 1, // Debug logs: 1 day
  LOG_RETENTION_INFO_DAYS: 7, // Info logs: 7 days
  LOG_RETENTION_WARN_DAYS: 30, // Warning logs: 30 days
  LOG_RETENTION_ERROR_DAYS: 90, // Error logs: 90 days
};

// Zod schema for telemetry configuration (2025 compliance)
export const TelemetryConfigSchema = z.object({
  ENABLE_OPENTELEMETRY: z.coerce.boolean().default(true),
  SERVICE_NAME: z.string().min(1, "SERVICE_NAME is required and cannot be empty").default("capellaql-service"),
  SERVICE_VERSION: z.string().min(1, "SERVICE_VERSION is required and cannot be empty").default("2.0"),
  DEPLOYMENT_ENVIRONMENT: z.enum(["development", "staging", "production", "test"]).default("development"),
  TRACES_ENDPOINT: z.string().url("TRACES_ENDPOINT must be a valid URL").default("http://localhost:4318/v1/traces"),
  METRICS_ENDPOINT: z.string().url("METRICS_ENDPOINT must be a valid URL").default("http://localhost:4318/v1/metrics"),
  LOGS_ENDPOINT: z.string().url("LOGS_ENDPOINT must be a valid URL").default("http://localhost:4318/v1/logs"),
  METRIC_READER_INTERVAL: z.coerce
    .number()
    .min(1000, "METRIC_READER_INTERVAL must be at least 1000ms")
    .max(300000, "METRIC_READER_INTERVAL should not exceed 5 minutes")
    .default(60000)
    .refine((val) => !Number.isNaN(val), "METRIC_READER_INTERVAL cannot be NaN"),
  SUMMARY_LOG_INTERVAL: z.coerce
    .number()
    .min(10000, "SUMMARY_LOG_INTERVAL must be at least 10 seconds")
    .max(3600000, "SUMMARY_LOG_INTERVAL should not exceed 1 hour")
    .default(300000)
    .refine((val) => !Number.isNaN(val), "SUMMARY_LOG_INTERVAL cannot be NaN"),
  // 2025 compliance settings with strict validation
  EXPORT_TIMEOUT_MS: z.coerce
    .number()
    .min(5000, "EXPORT_TIMEOUT_MS must be at least 5 seconds")
    .max(30000, "EXPORT_TIMEOUT_MS must not exceed 30 seconds (2025 standard)")
    .default(30000),
  BATCH_SIZE: z.coerce
    .number()
    .min(1, "BATCH_SIZE must be at least 1")
    .max(4096, "BATCH_SIZE should not exceed 4096")
    .default(2048), // 2025 standard
  MAX_QUEUE_SIZE: z.coerce
    .number()
    .min(100, "MAX_QUEUE_SIZE must be at least 100")
    .max(20000, "MAX_QUEUE_SIZE should not exceed 20000")
    .default(10000), // 2025 standard
  CIRCUIT_BREAKER_THRESHOLD: z.coerce
    .number()
    .min(1, "CIRCUIT_BREAKER_THRESHOLD must be at least 1")
    .max(20, "CIRCUIT_BREAKER_THRESHOLD should not exceed 20")
    .default(5),
  CIRCUIT_BREAKER_TIMEOUT_MS: z.coerce
    .number()
    .min(10000, "CIRCUIT_BREAKER_TIMEOUT_MS must be at least 10 seconds")
    .max(300000, "CIRCUIT_BREAKER_TIMEOUT_MS should not exceed 5 minutes")
    .default(60000), // 1 minute
  // Log retention policy validation
  LOG_RETENTION_DEBUG_DAYS: z.coerce
    .number()
    .min(1, "LOG_RETENTION_DEBUG_DAYS must be at least 1 day")
    .max(365, "LOG_RETENTION_DEBUG_DAYS should not exceed 1 year")
    .default(1),
  LOG_RETENTION_INFO_DAYS: z.coerce
    .number()
    .min(1, "LOG_RETENTION_INFO_DAYS must be at least 1 day")
    .max(365, "LOG_RETENTION_INFO_DAYS should not exceed 1 year")
    .default(7),
  LOG_RETENTION_WARN_DAYS: z.coerce
    .number()
    .min(1, "LOG_RETENTION_WARN_DAYS must be at least 1 day")
    .max(1095, "LOG_RETENTION_WARN_DAYS should not exceed 3 years")
    .default(30),
  LOG_RETENTION_ERROR_DAYS: z.coerce
    .number()
    .min(1, "LOG_RETENTION_ERROR_DAYS must be at least 1 day")
    .max(2555, "LOG_RETENTION_ERROR_DAYS should not exceed 7 years")
    .default(90),
});

// Helper to derive endpoint from base OTLP endpoint
function deriveEndpoint(baseEndpoint: string | undefined, path: string, defaultValue: string): string {
  if (!baseEndpoint) return defaultValue;
  // Remove trailing slash if present, then append path
  const base = baseEndpoint.replace(/\/$/, "");
  return `${base}${path}`;
}

// Load telemetry configuration from environment variables
export function loadTelemetryConfigFromEnv(): TelemetryConfig {
  // Get base OTLP endpoint for fallback derivation
  const baseOtlpEndpoint = parseEnvVar(
    getEnvVar(telemetryEnvMapping.OTLP_ENDPOINT),
    "string",
    "OTEL_EXPORTER_OTLP_ENDPOINT"
  ) as string | undefined;

  return {
    ENABLE_OPENTELEMETRY:
      (parseEnvVar(
        getEnvVar(telemetryEnvMapping.ENABLE_OPENTELEMETRY),
        "boolean",
        "ENABLE_OPENTELEMETRY"
      ) as boolean) ?? telemetryDefaults.ENABLE_OPENTELEMETRY,

    SERVICE_NAME:
      (parseEnvVar(getEnvVar(telemetryEnvMapping.SERVICE_NAME), "string", "OTEL_SERVICE_NAME") as string) ||
      telemetryDefaults.SERVICE_NAME,

    SERVICE_VERSION:
      (parseEnvVar(getEnvVar(telemetryEnvMapping.SERVICE_VERSION), "string", "OTEL_SERVICE_VERSION") as string) ||
      telemetryDefaults.SERVICE_VERSION,

    DEPLOYMENT_ENVIRONMENT:
      (parseEnvVar(
        getEnvVar(telemetryEnvMapping.DEPLOYMENT_ENVIRONMENT),
        "string",
        "DEPLOYMENT_ENVIRONMENT"
      ) as string) || telemetryDefaults.DEPLOYMENT_ENVIRONMENT,

    // Use specific endpoint if set, otherwise derive from base endpoint, otherwise use default
    TRACES_ENDPOINT:
      (parseEnvVar(getEnvVar(telemetryEnvMapping.TRACES_ENDPOINT), "string", "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT") as string) ||
      deriveEndpoint(baseOtlpEndpoint, "/v1/traces", telemetryDefaults.TRACES_ENDPOINT),

    METRICS_ENDPOINT:
      (parseEnvVar(getEnvVar(telemetryEnvMapping.METRICS_ENDPOINT), "string", "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT") as string) ||
      deriveEndpoint(baseOtlpEndpoint, "/v1/metrics", telemetryDefaults.METRICS_ENDPOINT),

    LOGS_ENDPOINT:
      (parseEnvVar(getEnvVar(telemetryEnvMapping.LOGS_ENDPOINT), "string", "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT") as string) ||
      deriveEndpoint(baseOtlpEndpoint, "/v1/logs", telemetryDefaults.LOGS_ENDPOINT),

    METRIC_READER_INTERVAL:
      (parseEnvVar(
        getEnvVar(telemetryEnvMapping.METRIC_READER_INTERVAL),
        "number",
        "METRIC_READER_INTERVAL"
      ) as number) || telemetryDefaults.METRIC_READER_INTERVAL,

    SUMMARY_LOG_INTERVAL:
      (parseEnvVar(getEnvVar(telemetryEnvMapping.SUMMARY_LOG_INTERVAL), "number", "SUMMARY_LOG_INTERVAL") as number) ||
      telemetryDefaults.SUMMARY_LOG_INTERVAL,

    // 2025 compliance settings
    EXPORT_TIMEOUT_MS:
      (parseEnvVar(getEnvVar(telemetryEnvMapping.EXPORT_TIMEOUT_MS), "number", "EXPORT_TIMEOUT_MS") as number) ||
      telemetryDefaults.EXPORT_TIMEOUT_MS,

    BATCH_SIZE:
      (parseEnvVar(getEnvVar(telemetryEnvMapping.BATCH_SIZE), "number", "BATCH_SIZE") as number) ||
      telemetryDefaults.BATCH_SIZE,

    MAX_QUEUE_SIZE:
      (parseEnvVar(getEnvVar(telemetryEnvMapping.MAX_QUEUE_SIZE), "number", "MAX_QUEUE_SIZE") as number) ||
      telemetryDefaults.MAX_QUEUE_SIZE,

    CIRCUIT_BREAKER_THRESHOLD:
      (parseEnvVar(
        getEnvVar(telemetryEnvMapping.CIRCUIT_BREAKER_THRESHOLD),
        "number",
        "CIRCUIT_BREAKER_THRESHOLD"
      ) as number) || telemetryDefaults.CIRCUIT_BREAKER_THRESHOLD,

    CIRCUIT_BREAKER_TIMEOUT_MS:
      (parseEnvVar(
        getEnvVar(telemetryEnvMapping.CIRCUIT_BREAKER_TIMEOUT_MS),
        "number",
        "CIRCUIT_BREAKER_TIMEOUT_MS"
      ) as number) || telemetryDefaults.CIRCUIT_BREAKER_TIMEOUT_MS,

    // Log retention policy
    LOG_RETENTION_DEBUG_DAYS:
      (parseEnvVar(
        getEnvVar(telemetryEnvMapping.LOG_RETENTION_DEBUG_DAYS),
        "number",
        "LOG_RETENTION_DEBUG_DAYS"
      ) as number) || telemetryDefaults.LOG_RETENTION_DEBUG_DAYS,

    LOG_RETENTION_INFO_DAYS:
      (parseEnvVar(
        getEnvVar(telemetryEnvMapping.LOG_RETENTION_INFO_DAYS),
        "number",
        "LOG_RETENTION_INFO_DAYS"
      ) as number) || telemetryDefaults.LOG_RETENTION_INFO_DAYS,

    LOG_RETENTION_WARN_DAYS:
      (parseEnvVar(
        getEnvVar(telemetryEnvMapping.LOG_RETENTION_WARN_DAYS),
        "number",
        "LOG_RETENTION_WARN_DAYS"
      ) as number) || telemetryDefaults.LOG_RETENTION_WARN_DAYS,

    LOG_RETENTION_ERROR_DAYS:
      (parseEnvVar(
        getEnvVar(telemetryEnvMapping.LOG_RETENTION_ERROR_DAYS),
        "number",
        "LOG_RETENTION_ERROR_DAYS"
      ) as number) || telemetryDefaults.LOG_RETENTION_ERROR_DAYS,
  };
}

// Domain-specific validation for telemetry configuration
export function validateTelemetryConfig(config: TelemetryConfig, isProduction: boolean): string[] {
  const warnings: string[] = [];

  // Check for NaN values that prevent infinite loops
  if (Number.isNaN(config.METRIC_READER_INTERVAL)) {
    warnings.push("METRIC_READER_INTERVAL is NaN - this will cause infinite loops");
  }

  if (Number.isNaN(config.SUMMARY_LOG_INTERVAL)) {
    warnings.push("SUMMARY_LOG_INTERVAL is NaN - this will cause infinite loops");
  }

  // Production-specific validations
  if (isProduction) {
    // Validate export timeout compliance with 2025 standards
    if (config.EXPORT_TIMEOUT_MS > 30000) {
      warnings.push("EXPORT_TIMEOUT_MS exceeds 30 seconds - this violates 2025 OpenTelemetry standards");
    }

    // Validate batch sizes are optimal for production
    if (config.BATCH_SIZE < 1024) {
      warnings.push("BATCH_SIZE is below recommended 1024 for production environments");
    }
  }

  return warnings;
}

// Environment variable path mapping for error reporting
// Uses standard OTEL environment variable names
export function getTelemetryEnvVarPath(configPath: string): string | undefined {
  const mapping: Record<string, string> = {
    "telemetry.ENABLE_OPENTELEMETRY": "ENABLE_OPENTELEMETRY",
    "telemetry.SERVICE_NAME": "OTEL_SERVICE_NAME",
    "telemetry.SERVICE_VERSION": "OTEL_SERVICE_VERSION",
    "telemetry.DEPLOYMENT_ENVIRONMENT": "DEPLOYMENT_ENVIRONMENT",
    "telemetry.TRACES_ENDPOINT": "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
    "telemetry.METRICS_ENDPOINT": "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
    "telemetry.LOGS_ENDPOINT": "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT",
    "telemetry.METRIC_READER_INTERVAL": "METRIC_READER_INTERVAL",
    "telemetry.SUMMARY_LOG_INTERVAL": "SUMMARY_LOG_INTERVAL",
    "telemetry.EXPORT_TIMEOUT_MS": "EXPORT_TIMEOUT_MS",
    "telemetry.BATCH_SIZE": "BATCH_SIZE",
    "telemetry.MAX_QUEUE_SIZE": "MAX_QUEUE_SIZE",
    "telemetry.CIRCUIT_BREAKER_THRESHOLD": "CIRCUIT_BREAKER_THRESHOLD",
    "telemetry.CIRCUIT_BREAKER_TIMEOUT_MS": "CIRCUIT_BREAKER_TIMEOUT_MS",
  };
  return mapping[configPath];
}
