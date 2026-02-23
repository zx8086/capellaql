/* src/config/schemas.ts */
// Pillar 4: Configuration Schemas & Validation
// Per 4-pillar pattern: schemas provide VALIDATION ONLY, not defaults
// Defaults live in defaults.ts (Pillar 1)

import { z } from "zod";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface ApplicationConfig {
  LOG_LEVEL: string;
  YOGA_RESPONSE_CACHE_TTL: number;
  PORT: number;
  ALLOWED_ORIGINS: string[];
  BASE_URL: string;
}

export interface CapellaConfig {
  COUCHBASE_URL: string;
  COUCHBASE_USERNAME: string;
  COUCHBASE_PASSWORD: string;
  COUCHBASE_BUCKET: string;
  COUCHBASE_SCOPE: string;
  COUCHBASE_COLLECTION: string;
  // SDK timeout configurations (milliseconds)
  COUCHBASE_KV_TIMEOUT: number;
  COUCHBASE_KV_DURABLE_TIMEOUT: number;
  COUCHBASE_QUERY_TIMEOUT: number;
  COUCHBASE_ANALYTICS_TIMEOUT: number;
  COUCHBASE_SEARCH_TIMEOUT: number;
  COUCHBASE_CONNECT_TIMEOUT: number;
  COUCHBASE_BOOTSTRAP_TIMEOUT: number;
}

export interface RuntimeConfig {
  NODE_ENV: string;
  CN_ROOT: string;
  CN_CXXCBC_CACHE_DIR?: string;
  SOURCE_MAP_SUPPORT: boolean;
  PRESERVE_SOURCE_MAPS: boolean;
  BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS: number;
}

export interface DeploymentConfig {
  BASE_URL: string;
  HOSTNAME: string;
  INSTANCE_ID: string;
  CONTAINER_ID?: string;
  K8S_POD_NAME?: string;
  K8S_NAMESPACE?: string;
}

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
  CIRCUIT_BREAKER_THRESHOLD: number;
  CIRCUIT_BREAKER_TIMEOUT_MS: number;
  // Log retention policy (days)
  LOG_RETENTION_DEBUG_DAYS: number;
  LOG_RETENTION_INFO_DAYS: number;
  LOG_RETENTION_WARN_DAYS: number;
  LOG_RETENTION_ERROR_DAYS: number;
}

export interface Config {
  application: ApplicationConfig;
  capella: CapellaConfig;
  runtime: RuntimeConfig;
  deployment: DeploymentConfig;
  telemetry: TelemetryConfig;
}

// =============================================================================
// REUSABLE PRIMITIVES (per 4-pillar pattern)
// =============================================================================

export const NonEmptyString = z.string().min(1);
export const PortNumber = z.number().int().min(1).max(65535);
export const PositiveInt = z.number().int().min(1);
export const EnvironmentType = z.enum(["development", "staging", "production", "test"]);

// =============================================================================
// ZOD SCHEMAS (Validation Only - No Defaults)
// =============================================================================

// Application schema - validation rules only
export const ApplicationConfigSchema = z.strictObject({
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).describe("Application log level"),
  YOGA_RESPONSE_CACHE_TTL: z
    .number()
    .min(0, "Cache TTL must be non-negative")
    .max(3600000, "Cache TTL should not exceed 1 hour")
    .refine((val) => !Number.isNaN(val), "Cache TTL cannot be NaN")
    .describe("GraphQL Yoga response cache TTL in milliseconds"),
  PORT: PortNumber.describe("Server listening port"),
  ALLOWED_ORIGINS: z.array(z.string().url()).describe("CORS allowed origins"),
  BASE_URL: z.string().url("BASE_URL must be a valid URL").describe("Application base URL"),
});

// Capella/Couchbase schema - validation rules only
export const CapellaConfigSchema = z.strictObject({
  COUCHBASE_URL: z.string().url("Must be a valid Couchbase connection URL").describe("Couchbase cluster URL"),
  COUCHBASE_USERNAME: NonEmptyString.describe("Couchbase username"),
  COUCHBASE_PASSWORD: NonEmptyString.describe("Couchbase password"),
  COUCHBASE_BUCKET: NonEmptyString.describe("Couchbase bucket name"),
  COUCHBASE_SCOPE: NonEmptyString.describe("Couchbase scope name"),
  COUCHBASE_COLLECTION: NonEmptyString.describe("Couchbase collection name"),
  // SDK timeout configurations with validation only
  COUCHBASE_KV_TIMEOUT: z
    .number()
    .min(1000, "KV timeout must be at least 1 second")
    .max(30000, "KV timeout should not exceed 30 seconds")
    .describe("Key-value operation timeout"),
  COUCHBASE_KV_DURABLE_TIMEOUT: z
    .number()
    .min(5000, "KV durable timeout must be at least 5 seconds")
    .max(60000, "KV durable timeout should not exceed 60 seconds")
    .describe("Durable key-value operation timeout"),
  COUCHBASE_QUERY_TIMEOUT: z
    .number()
    .min(5000, "Query timeout must be at least 5 seconds")
    .max(120000, "Query timeout should not exceed 2 minutes")
    .describe("N1QL query timeout"),
  COUCHBASE_ANALYTICS_TIMEOUT: z
    .number()
    .min(10000, "Analytics timeout must be at least 10 seconds")
    .max(300000, "Analytics timeout should not exceed 5 minutes")
    .describe("Analytics query timeout"),
  COUCHBASE_SEARCH_TIMEOUT: z
    .number()
    .min(5000, "Search timeout must be at least 5 seconds")
    .max(120000, "Search timeout should not exceed 2 minutes")
    .describe("Full-text search timeout"),
  COUCHBASE_CONNECT_TIMEOUT: z
    .number()
    .min(5000, "Connect timeout must be at least 5 seconds")
    .max(60000, "Connect timeout should not exceed 60 seconds")
    .describe("Connection timeout"),
  COUCHBASE_BOOTSTRAP_TIMEOUT: z
    .number()
    .min(10000, "Bootstrap timeout must be at least 10 seconds")
    .max(120000, "Bootstrap timeout should not exceed 2 minutes")
    .describe("Cluster bootstrap timeout"),
});

// Runtime schema - validation rules only
export const RuntimeConfigSchema = z.strictObject({
  NODE_ENV: EnvironmentType.describe("Runtime environment"),
  CN_ROOT: NonEmptyString.describe("Application root directory"),
  CN_CXXCBC_CACHE_DIR: z.string().optional().describe("Couchbase C++ SDK cache directory"),
  SOURCE_MAP_SUPPORT: z.boolean().describe("Enable source map support"),
  PRESERVE_SOURCE_MAPS: z.boolean().describe("Preserve source maps in production"),
  BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS: z
    .number()
    .min(0, "DNS TTL must be non-negative")
    .max(3600, "DNS TTL should not exceed 1 hour")
    .refine((val) => !Number.isNaN(val), "DNS TTL cannot be NaN")
    .describe("Bun DNS cache TTL in seconds"),
});

// Deployment schema - validation rules only
export const DeploymentConfigSchema = z.strictObject({
  BASE_URL: z.string().url().describe("Deployment base URL"),
  HOSTNAME: z.string().describe("Hostname"),
  INSTANCE_ID: z.string().describe("Instance identifier"),
  CONTAINER_ID: z.string().optional().describe("Container ID"),
  K8S_POD_NAME: z.string().optional().describe("Kubernetes pod name"),
  K8S_NAMESPACE: z.string().optional().describe("Kubernetes namespace"),
});

// Telemetry schema (2025 compliance) - validation rules only
export const TelemetryConfigSchema = z.strictObject({
  ENABLE_OPENTELEMETRY: z.boolean().describe("Enable OpenTelemetry"),
  SERVICE_NAME: NonEmptyString.describe("Service identifier for telemetry"),
  SERVICE_VERSION: NonEmptyString.describe("Service version"),
  DEPLOYMENT_ENVIRONMENT: EnvironmentType.describe("Deployment environment"),
  TRACES_ENDPOINT: z.string().url("TRACES_ENDPOINT must be a valid URL").describe("OTLP traces endpoint"),
  METRICS_ENDPOINT: z.string().url("METRICS_ENDPOINT must be a valid URL").describe("OTLP metrics endpoint"),
  LOGS_ENDPOINT: z.string().url("LOGS_ENDPOINT must be a valid URL").describe("OTLP logs endpoint"),
  METRIC_READER_INTERVAL: z
    .number()
    .min(1000, "METRIC_READER_INTERVAL must be at least 1000ms")
    .max(300000, "METRIC_READER_INTERVAL should not exceed 5 minutes")
    .refine((val) => !Number.isNaN(val), "METRIC_READER_INTERVAL cannot be NaN")
    .describe("Metric reader interval in milliseconds"),
  SUMMARY_LOG_INTERVAL: z
    .number()
    .min(10000, "SUMMARY_LOG_INTERVAL must be at least 10 seconds")
    .max(3600000, "SUMMARY_LOG_INTERVAL should not exceed 1 hour")
    .refine((val) => !Number.isNaN(val), "SUMMARY_LOG_INTERVAL cannot be NaN")
    .describe("Summary log interval in milliseconds"),
  // 2025 compliance settings with strict validation
  EXPORT_TIMEOUT_MS: z
    .number()
    .min(5000, "EXPORT_TIMEOUT_MS must be at least 5 seconds")
    .max(30000, "EXPORT_TIMEOUT_MS must not exceed 30 seconds (2025 standard)")
    .describe("Telemetry export timeout"),
  BATCH_SIZE: z
    .number()
    .min(1, "BATCH_SIZE must be at least 1")
    .max(4096, "BATCH_SIZE should not exceed 4096")
    .describe("Telemetry batch size"),
  MAX_QUEUE_SIZE: z
    .number()
    .min(100, "MAX_QUEUE_SIZE must be at least 100")
    .max(20000, "MAX_QUEUE_SIZE should not exceed 20000")
    .describe("Maximum telemetry queue size"),
  CIRCUIT_BREAKER_THRESHOLD: z
    .number()
    .min(1, "CIRCUIT_BREAKER_THRESHOLD must be at least 1")
    .max(20, "CIRCUIT_BREAKER_THRESHOLD should not exceed 20")
    .describe("Circuit breaker failure threshold"),
  CIRCUIT_BREAKER_TIMEOUT_MS: z
    .number()
    .min(10000, "CIRCUIT_BREAKER_TIMEOUT_MS must be at least 10 seconds")
    .max(300000, "CIRCUIT_BREAKER_TIMEOUT_MS should not exceed 5 minutes")
    .describe("Circuit breaker timeout"),
  // Log retention policy validation
  LOG_RETENTION_DEBUG_DAYS: z.number().min(1).max(365).describe("Debug log retention in days"),
  LOG_RETENTION_INFO_DAYS: z.number().min(1).max(365).describe("Info log retention in days"),
  LOG_RETENTION_WARN_DAYS: z.number().min(1).max(1095).describe("Warning log retention in days"),
  LOG_RETENTION_ERROR_DAYS: z.number().min(1).max(2555).describe("Error log retention in days"),
});

// =============================================================================
// PRODUCTION SECURITY VALIDATION (per 4-pillar pattern)
// =============================================================================

/**
 * Production security rules.
 * These run ONLY in the ConfigSchema superRefine — the single validation
 * boundary. They are never duplicated in env-level validation.
 */
function addProductionSecurityValidation(data: Config, ctx: z.RefinementCtx): void {
  const isProduction = data.runtime.NODE_ENV === "production" || data.telemetry.DEPLOYMENT_ENVIRONMENT === "production";

  if (!isProduction) return;

  // Critical security check for default passwords
  if (data.capella.COUCHBASE_PASSWORD === "password") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "CRITICAL SECURITY: Default password not allowed in production - this is a security vulnerability",
      path: ["capella", "COUCHBASE_PASSWORD"],
    });
  }

  // Check for default usernames in production
  if (data.capella.COUCHBASE_USERNAME === "Administrator") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "WARNING: Using default Administrator username in production is not recommended",
      path: ["capella", "COUCHBASE_USERNAME"],
    });
  }

  // Validate CORS origins in production
  if (data.application.ALLOWED_ORIGINS.some((origin) => origin === "*" || origin.includes("localhost"))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Production CORS origins should not include localhost or wildcards",
      path: ["application", "ALLOWED_ORIGINS"],
    });
  }

  // Validate database host is not localhost in production
  try {
    const url = new URL(data.capella.COUCHBASE_URL);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Production database cannot use localhost",
        path: ["capella", "COUCHBASE_URL"],
      });
    }
  } catch {
    // URL parsing failed, will be caught by schema validation
  }
}

// =============================================================================
// UNIFIED CONFIGURATION SCHEMA
// =============================================================================

export const ConfigSchema = z
  .strictObject({
    application: ApplicationConfigSchema,
    capella: CapellaConfigSchema,
    runtime: RuntimeConfigSchema,
    deployment: DeploymentConfigSchema,
    telemetry: TelemetryConfigSchema,
  })
  .superRefine(addProductionSecurityValidation);

// =============================================================================
// SCHEMA REGISTRY (per 4-pillar pattern)
// =============================================================================

export const SchemaRegistry = {
  Application: ApplicationConfigSchema,
  Capella: CapellaConfigSchema,
  Runtime: RuntimeConfigSchema,
  Deployment: DeploymentConfigSchema,
  Telemetry: TelemetryConfigSchema,
  Config: ConfigSchema,
} as const;

// =============================================================================
// CONFIGURATION ERROR TYPE
// =============================================================================

export class ConfigurationError extends Error {
  constructor(
    message: string,
    public readonly errors: z.ZodError,
    public readonly partialConfig?: unknown
  ) {
    super(message);
    this.name = "ConfigurationError";
  }

  toDetailedString(): string {
    const issues = this.errors.issues
      ?.map((issue) => {
        const path = issue.path.join(".");
        return `  - ${path}: ${issue.message}`;
      })
      .join("\n");

    return `${this.message}\n${issues || ""}`;
  }
}
