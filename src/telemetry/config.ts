/* src/telemetry/config.ts */

import { z } from "zod";

export interface TelemetryConfig {
  ENABLE_OPENTELEMETRY: boolean;
  SERVICE_NAME: string;
  SERVICE_VERSION: string;
  DEPLOYMENT_ENVIRONMENT: string;
  TRACES_ENDPOINT: string;
  METRICS_ENDPOINT: string;
  LOGS_ENDPOINT: string;
  METRIC_READER_INTERVAL: number;
  SUMMARY_LOG_INTERVAL: number;
  // 2025 compliance settings
  EXPORT_TIMEOUT_MS: number;
  BATCH_SIZE: number;
  MAX_QUEUE_SIZE: number;
  SAMPLING_RATE: number;
  CIRCUIT_BREAKER_THRESHOLD: number;
  CIRCUIT_BREAKER_TIMEOUT_MS: number;
}

// 2025-compliant telemetry configuration schema with strict validation
const TelemetryConfigSchema = z.object({
  ENABLE_OPENTELEMETRY: z.boolean(),
  SERVICE_NAME: z.string().min(1, "SERVICE_NAME is required and cannot be empty"),
  SERVICE_VERSION: z.string().min(1, "SERVICE_VERSION is required and cannot be empty"),
  DEPLOYMENT_ENVIRONMENT: z.enum(["development", "staging", "production", "test"]),
  TRACES_ENDPOINT: z.string().url("TRACES_ENDPOINT must be a valid URL"),
  METRICS_ENDPOINT: z.string().url("METRICS_ENDPOINT must be a valid URL"),
  LOGS_ENDPOINT: z.string().url("LOGS_ENDPOINT must be a valid URL"),
  METRIC_READER_INTERVAL: z
    .number()
    .min(1000, "METRIC_READER_INTERVAL must be at least 1000ms")
    .max(300000, "METRIC_READER_INTERVAL should not exceed 5 minutes")
    .refine((val) => !Number.isNaN(val), "METRIC_READER_INTERVAL cannot be NaN"),
  SUMMARY_LOG_INTERVAL: z
    .number()
    .min(10000, "SUMMARY_LOG_INTERVAL must be at least 10 seconds")
    .max(3600000, "SUMMARY_LOG_INTERVAL should not exceed 1 hour")
    .refine((val) => !Number.isNaN(val), "SUMMARY_LOG_INTERVAL cannot be NaN"),
  // 2025 compliance settings
  EXPORT_TIMEOUT_MS: z
    .number()
    .min(5000, "EXPORT_TIMEOUT_MS must be at least 5 seconds")
    .max(30000, "EXPORT_TIMEOUT_MS must not exceed 30 seconds (2025 standard)")
    .default(30000),
  BATCH_SIZE: z
    .number()
    .min(1, "BATCH_SIZE must be at least 1")
    .max(4096, "BATCH_SIZE should not exceed 4096")
    .default(2048), // 2025 standard
  MAX_QUEUE_SIZE: z
    .number()
    .min(100, "MAX_QUEUE_SIZE must be at least 100")
    .max(20000, "MAX_QUEUE_SIZE should not exceed 20000")
    .default(10000), // 2025 standard
  SAMPLING_RATE: z
    .number()
    .min(0.01, "SAMPLING_RATE must be at least 1%")
    .max(1.0, "SAMPLING_RATE cannot exceed 100%")
    .default(0.15), // 15% (2025 standard)
  CIRCUIT_BREAKER_THRESHOLD: z
    .number()
    .min(1, "CIRCUIT_BREAKER_THRESHOLD must be at least 1")
    .max(20, "CIRCUIT_BREAKER_THRESHOLD should not exceed 20")
    .default(5),
  CIRCUIT_BREAKER_TIMEOUT_MS: z
    .number()
    .min(10000, "CIRCUIT_BREAKER_TIMEOUT_MS must be at least 10 seconds")
    .max(300000, "CIRCUIT_BREAKER_TIMEOUT_MS should not exceed 5 minutes")
    .default(60000), // 1 minute
});

export function validateTelemetryConfig(config: Partial<TelemetryConfig>): TelemetryConfig {
  // First, check for critical missing values that would cause runtime issues
  const criticalErrors: string[] = [];

  if (!config.SERVICE_NAME || config.SERVICE_NAME.trim() === "") {
    criticalErrors.push("SERVICE_NAME is required but missing or empty");
  }

  if (!config.SERVICE_VERSION || config.SERVICE_VERSION.trim() === "") {
    criticalErrors.push("SERVICE_VERSION is required but missing or empty");
  }

  if (!config.TRACES_ENDPOINT) {
    criticalErrors.push("TRACES_ENDPOINT is required but missing");
  }

  if (!config.METRICS_ENDPOINT) {
    criticalErrors.push("METRICS_ENDPOINT is required but missing");
  }

  if (!config.LOGS_ENDPOINT) {
    criticalErrors.push("LOGS_ENDPOINT is required but missing");
  }

  // Check for NaN values that would cause infinite loops
  if (config.METRIC_READER_INTERVAL !== undefined && Number.isNaN(config.METRIC_READER_INTERVAL)) {
    criticalErrors.push("METRIC_READER_INTERVAL is NaN - this will cause infinite loops");
  }

  if (config.SUMMARY_LOG_INTERVAL !== undefined && Number.isNaN(config.SUMMARY_LOG_INTERVAL)) {
    criticalErrors.push("SUMMARY_LOG_INTERVAL is NaN - this will cause infinite loops");
  }

  // Fail fast if critical errors found
  if (criticalErrors.length > 0) {
    throw new Error(`Telemetry configuration validation failed: ${criticalErrors.join(", ")}`);
  }

  // Now validate with Zod schema
  try {
    const validatedConfig = TelemetryConfigSchema.parse(config);

    // Additional business logic validation
    validateBusinessRules(validatedConfig);

    return validatedConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
      throw new Error(`Telemetry configuration validation failed: ${issues.join(", ")}`);
    }
    throw error;
  }
}

function validateBusinessRules(config: TelemetryConfig): void {
  // Ensure timeouts are reasonable for production
  if (config.EXPORT_TIMEOUT_MS > 30000) {
    throw new Error("EXPORT_TIMEOUT_MS exceeds 30 seconds - this violates 2025 OpenTelemetry standards");
  }

  // Ensure batch sizes are optimal
  if (config.BATCH_SIZE < 1024 && config.DEPLOYMENT_ENVIRONMENT === "production") {
    console.warn("BATCH_SIZE is below recommended 1024 for production environments");
  }

  // Ensure sampling rate is appropriate for environment
  if (config.SAMPLING_RATE > 0.5 && config.DEPLOYMENT_ENVIRONMENT === "production") {
    console.warn("SAMPLING_RATE above 50% may impact performance in production");
  }

  // Validate endpoint consistency (same host for all endpoints is recommended)
  try {
    const tracesUrl = new URL(config.TRACES_ENDPOINT);
    const metricsUrl = new URL(config.METRICS_ENDPOINT);
    const logsUrl = new URL(config.LOGS_ENDPOINT);

    if (tracesUrl.host !== metricsUrl.host || tracesUrl.host !== logsUrl.host) {
      console.warn("Telemetry endpoints use different hosts - consider using the same OTLP collector");
    }
  } catch (error) {
    // URL parsing already validated by Zod, this is just for warnings
  }
}

// Remove this function - use unified config from $config instead
// export function loadTelemetryConfigFromEnv(): TelemetryConfig { ... }

function parseEnvBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return ["true", "1", "yes", "on"].includes(value.toLowerCase());
}

function parseEnvNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}
