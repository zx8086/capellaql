/* src/config/schemas.ts */
// Pillar 3: Configuration Schemas & Types
// Aligned with migrate reference pattern

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
// ZOD SCHEMAS
// =============================================================================

// Application schema
export const ApplicationConfigSchema = z.object({
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  YOGA_RESPONSE_CACHE_TTL: z.coerce
    .number()
    .min(0)
    .max(3600000)
    .default(900000)
    .refine((val) => !Number.isNaN(val), "Cache TTL cannot be NaN"),
  PORT: z.coerce.number().min(1).max(65535).default(4000),
  ALLOWED_ORIGINS: z.array(z.string().url()).default(["http://localhost:3000"]),
  BASE_URL: z.string().url("BASE_URL must be a valid URL").default("http://localhost"),
});

// Capella/Couchbase schema
export const CapellaConfigSchema = z.object({
  COUCHBASE_URL: z.string().url("Must be a valid Couchbase connection URL"),
  COUCHBASE_USERNAME: z.string().min(1, "Username cannot be empty"),
  COUCHBASE_PASSWORD: z.string().min(1, "Password cannot be empty"),
  COUCHBASE_BUCKET: z.string().min(1, "Bucket name cannot be empty").default("default"),
  COUCHBASE_SCOPE: z.string().min(1, "Scope name cannot be empty").default("_default"),
  COUCHBASE_COLLECTION: z.string().min(1, "Collection name cannot be empty").default("_default"),
  // SDK timeout configurations with production-ready defaults
  COUCHBASE_KV_TIMEOUT: z.coerce
    .number()
    .min(1000, "KV timeout must be at least 1 second")
    .max(30000, "KV timeout should not exceed 30 seconds")
    .default(5000),
  COUCHBASE_KV_DURABLE_TIMEOUT: z.coerce
    .number()
    .min(5000, "KV durable timeout must be at least 5 seconds")
    .max(60000, "KV durable timeout should not exceed 60 seconds")
    .default(10000),
  COUCHBASE_QUERY_TIMEOUT: z.coerce
    .number()
    .min(5000, "Query timeout must be at least 5 seconds")
    .max(120000, "Query timeout should not exceed 2 minutes")
    .default(15000),
  COUCHBASE_ANALYTICS_TIMEOUT: z.coerce
    .number()
    .min(10000, "Analytics timeout must be at least 10 seconds")
    .max(300000, "Analytics timeout should not exceed 5 minutes")
    .default(30000),
  COUCHBASE_SEARCH_TIMEOUT: z.coerce
    .number()
    .min(5000, "Search timeout must be at least 5 seconds")
    .max(120000, "Search timeout should not exceed 2 minutes")
    .default(15000),
  COUCHBASE_CONNECT_TIMEOUT: z.coerce
    .number()
    .min(5000, "Connect timeout must be at least 5 seconds")
    .max(60000, "Connect timeout should not exceed 60 seconds")
    .default(10000),
  COUCHBASE_BOOTSTRAP_TIMEOUT: z.coerce
    .number()
    .min(10000, "Bootstrap timeout must be at least 10 seconds")
    .max(120000, "Bootstrap timeout should not exceed 2 minutes")
    .default(15000),
});

// Runtime schema
export const RuntimeConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "staging", "production", "test"]).default("development"),
  CN_ROOT: z.string().min(1).default("/usr/src/app"),
  CN_CXXCBC_CACHE_DIR: z.string().optional(),
  SOURCE_MAP_SUPPORT: z.coerce.boolean().default(true),
  PRESERVE_SOURCE_MAPS: z.coerce.boolean().default(true),
  BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS: z.coerce
    .number()
    .min(0)
    .max(3600)
    .default(120)
    .refine((val) => !Number.isNaN(val), "DNS TTL cannot be NaN"),
});

// Deployment schema
export const DeploymentConfigSchema = z.object({
  BASE_URL: z.string().url().default("http://localhost"),
  HOSTNAME: z.string().default("localhost"),
  INSTANCE_ID: z.string().default("unknown"),
  CONTAINER_ID: z.string().optional(),
  K8S_POD_NAME: z.string().optional(),
  K8S_NAMESPACE: z.string().optional(),
});

// Telemetry schema (2025 compliance)
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
  BATCH_SIZE: z.coerce.number().min(1, "BATCH_SIZE must be at least 1").max(4096, "BATCH_SIZE should not exceed 4096").default(2048),
  MAX_QUEUE_SIZE: z.coerce
    .number()
    .min(100, "MAX_QUEUE_SIZE must be at least 100")
    .max(20000, "MAX_QUEUE_SIZE should not exceed 20000")
    .default(10000),
  CIRCUIT_BREAKER_THRESHOLD: z.coerce
    .number()
    .min(1, "CIRCUIT_BREAKER_THRESHOLD must be at least 1")
    .max(20, "CIRCUIT_BREAKER_THRESHOLD should not exceed 20")
    .default(5),
  CIRCUIT_BREAKER_TIMEOUT_MS: z.coerce
    .number()
    .min(10000, "CIRCUIT_BREAKER_TIMEOUT_MS must be at least 10 seconds")
    .max(300000, "CIRCUIT_BREAKER_TIMEOUT_MS should not exceed 5 minutes")
    .default(60000),
  // Log retention policy validation
  LOG_RETENTION_DEBUG_DAYS: z.coerce.number().min(1).max(365).default(1),
  LOG_RETENTION_INFO_DAYS: z.coerce.number().min(1).max(365).default(7),
  LOG_RETENTION_WARN_DAYS: z.coerce.number().min(1).max(1095).default(30),
  LOG_RETENTION_ERROR_DAYS: z.coerce.number().min(1).max(2555).default(90),
});

// Unified configuration schema
export const ConfigSchema = z
  .object({
    application: ApplicationConfigSchema,
    capella: CapellaConfigSchema,
    runtime: RuntimeConfigSchema,
    deployment: DeploymentConfigSchema,
    telemetry: TelemetryConfigSchema,
  })
  .superRefine((data, ctx) => {
    // Determine environment for validation
    const isProduction = data.runtime.NODE_ENV === "production" || data.telemetry.DEPLOYMENT_ENVIRONMENT === "production";

    // CRITICAL SECURITY VALIDATIONS (Production)
    if (isProduction) {
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
    }
  });

// =============================================================================
// SCHEMA REGISTRY (per migrate pattern)
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
    public readonly errors: any,
    public readonly partialConfig?: unknown
  ) {
    super(message);
    this.name = "ConfigurationError";
  }

  toDetailedString(): string {
    const issues = this.errors.issues
      ?.map((issue: any) => {
        const path = issue.path.join(".");
        return `  - ${path}: ${issue.message}`;
      })
      .join("\n");

    return `${this.message}\n${issues || ""}`;
  }
}
