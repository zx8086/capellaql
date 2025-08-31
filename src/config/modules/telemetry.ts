// Telemetry configuration module
import { z } from "zod";
import type { TelemetryConfig } from "../base";
import { parseEnvVar, getEnvVar } from "../utils/env-parser";

// Environment variable mapping for telemetry section
export const telemetryEnvMapping = {
  ENABLE_OPENTELEMETRY: "ENABLE_OPENTELEMETRY",
  SERVICE_NAME: "SERVICE_NAME",
  SERVICE_VERSION: "SERVICE_VERSION",
  DEPLOYMENT_ENVIRONMENT: "DEPLOYMENT_ENVIRONMENT",
  TRACES_ENDPOINT: "TRACES_ENDPOINT",
  METRICS_ENDPOINT: "METRICS_ENDPOINT",
  LOGS_ENDPOINT: "LOGS_ENDPOINT",
  METRIC_READER_INTERVAL: "METRIC_READER_INTERVAL",
  SUMMARY_LOG_INTERVAL: "SUMMARY_LOG_INTERVAL",
  EXPORT_TIMEOUT_MS: "EXPORT_TIMEOUT_MS",
  BATCH_SIZE: "BATCH_SIZE",
  MAX_QUEUE_SIZE: "MAX_QUEUE_SIZE",
  SAMPLING_RATE: "SAMPLING_RATE",
  CIRCUIT_BREAKER_THRESHOLD: "CIRCUIT_BREAKER_THRESHOLD",
  CIRCUIT_BREAKER_TIMEOUT_MS: "CIRCUIT_BREAKER_TIMEOUT_MS",
} as const;

// Telemetry configuration defaults (2025 compliance)
export const telemetryDefaults: TelemetryConfig = {
  ENABLE_OPENTELEMETRY: true,
  SERVICE_NAME: "CapellaQL Service",
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
  SAMPLING_RATE: 0.15,
  CIRCUIT_BREAKER_THRESHOLD: 5,
  CIRCUIT_BREAKER_TIMEOUT_MS: 60000,
};

// Zod schema for telemetry configuration (2025 compliance)
export const TelemetryConfigSchema = z.object({
  ENABLE_OPENTELEMETRY: z.coerce.boolean().default(true),
  SERVICE_NAME: z.string().min(1, "SERVICE_NAME is required and cannot be empty").default("CapellaQL Service"),
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
  SAMPLING_RATE: z.coerce
    .number()
    .min(0.01, "SAMPLING_RATE must be at least 1%")
    .max(1.0, "SAMPLING_RATE cannot exceed 100%")
    .default(0.15), // 15% (2025 standard)
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
});

// Load telemetry configuration from environment variables
export function loadTelemetryConfigFromEnv(): TelemetryConfig {
  return {
    ENABLE_OPENTELEMETRY:
      (parseEnvVar(
        getEnvVar(telemetryEnvMapping.ENABLE_OPENTELEMETRY),
        "boolean",
        "ENABLE_OPENTELEMETRY"
      ) as boolean) ?? telemetryDefaults.ENABLE_OPENTELEMETRY,

    SERVICE_NAME:
      (parseEnvVar(getEnvVar(telemetryEnvMapping.SERVICE_NAME), "string", "SERVICE_NAME") as string) ||
      telemetryDefaults.SERVICE_NAME,

    SERVICE_VERSION:
      (parseEnvVar(getEnvVar(telemetryEnvMapping.SERVICE_VERSION), "string", "SERVICE_VERSION") as string) ||
      telemetryDefaults.SERVICE_VERSION,

    DEPLOYMENT_ENVIRONMENT:
      (parseEnvVar(
        getEnvVar(telemetryEnvMapping.DEPLOYMENT_ENVIRONMENT),
        "string",
        "DEPLOYMENT_ENVIRONMENT"
      ) as string) || telemetryDefaults.DEPLOYMENT_ENVIRONMENT,

    TRACES_ENDPOINT:
      (parseEnvVar(getEnvVar(telemetryEnvMapping.TRACES_ENDPOINT), "string", "TRACES_ENDPOINT") as string) ||
      telemetryDefaults.TRACES_ENDPOINT,

    METRICS_ENDPOINT:
      (parseEnvVar(getEnvVar(telemetryEnvMapping.METRICS_ENDPOINT), "string", "METRICS_ENDPOINT") as string) ||
      telemetryDefaults.METRICS_ENDPOINT,

    LOGS_ENDPOINT:
      (parseEnvVar(getEnvVar(telemetryEnvMapping.LOGS_ENDPOINT), "string", "LOGS_ENDPOINT") as string) ||
      telemetryDefaults.LOGS_ENDPOINT,

    METRIC_READER_INTERVAL:
      (parseEnvVar(
        getEnvVar(telemetryEnvMapping.METRIC_READER_INTERVAL),
        "number",
        "METRIC_READER_INTERVAL"
      ) as number) || telemetryDefaults.METRIC_READER_INTERVAL,

    SUMMARY_LOG_INTERVAL:
      (parseEnvVar(
        getEnvVar(telemetryEnvMapping.SUMMARY_LOG_INTERVAL),
        "number",
        "SUMMARY_LOG_INTERVAL"
      ) as number) || telemetryDefaults.SUMMARY_LOG_INTERVAL,

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

    SAMPLING_RATE:
      (parseEnvVar(getEnvVar(telemetryEnvMapping.SAMPLING_RATE), "number", "SAMPLING_RATE") as number) ||
      telemetryDefaults.SAMPLING_RATE,

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
    // Validate telemetry sampling rate for production
    if (config.SAMPLING_RATE > 0.5) {
      warnings.push("SAMPLING_RATE above 50% may impact performance in production");
    }

    // Validate export timeout compliance with 2025 standards
    if (config.EXPORT_TIMEOUT_MS > 30000) {
      warnings.push("EXPORT_TIMEOUT_MS exceeds 30 seconds - this violates 2025 OpenTelemetry standards");
    }

    // Validate batch sizes are optimal for production
    if (config.BATCH_SIZE < 1024) {
      warnings.push("BATCH_SIZE is below recommended 1024 for production environments");
    }
  }

  // Validate telemetry endpoint consistency (same host recommended)
  try {
    const tracesUrl = new URL(config.TRACES_ENDPOINT);
    const metricsUrl = new URL(config.METRICS_ENDPOINT);
    const logsUrl = new URL(config.LOGS_ENDPOINT);

    if (tracesUrl.host !== metricsUrl.host || tracesUrl.host !== logsUrl.host) {
      console.warn("Telemetry endpoints use different hosts - consider using the same OTLP collector");
    }
  } catch (_error) {
    // URL parsing already validated by schema, this is just for warnings
  }

  return warnings;
}

// Environment variable path mapping for error reporting
export function getTelemetryEnvVarPath(configPath: string): string | undefined {
  const mapping: Record<string, string> = {
    "telemetry.ENABLE_OPENTELEMETRY": "ENABLE_OPENTELEMETRY",
    "telemetry.SERVICE_NAME": "SERVICE_NAME",
    "telemetry.SERVICE_VERSION": "SERVICE_VERSION",
    "telemetry.DEPLOYMENT_ENVIRONMENT": "DEPLOYMENT_ENVIRONMENT",
    "telemetry.TRACES_ENDPOINT": "TRACES_ENDPOINT",
    "telemetry.METRICS_ENDPOINT": "METRICS_ENDPOINT",
    "telemetry.LOGS_ENDPOINT": "LOGS_ENDPOINT",
    "telemetry.METRIC_READER_INTERVAL": "METRIC_READER_INTERVAL",
    "telemetry.SUMMARY_LOG_INTERVAL": "SUMMARY_LOG_INTERVAL",
    "telemetry.EXPORT_TIMEOUT_MS": "EXPORT_TIMEOUT_MS",
    "telemetry.BATCH_SIZE": "BATCH_SIZE",
    "telemetry.MAX_QUEUE_SIZE": "MAX_QUEUE_SIZE",
    "telemetry.SAMPLING_RATE": "SAMPLING_RATE",
    "telemetry.CIRCUIT_BREAKER_THRESHOLD": "CIRCUIT_BREAKER_THRESHOLD",
    "telemetry.CIRCUIT_BREAKER_TIMEOUT_MS": "CIRCUIT_BREAKER_TIMEOUT_MS",
  };
  return mapping[configPath];
}