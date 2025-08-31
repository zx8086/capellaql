/* src/models/types.ts - Unified Configuration Schema for CapellaQL */

import { z } from "zod";

export interface ApplicationConfig {
  LOG_LEVEL: string;
  LOG_MAX_SIZE: string;
  LOG_MAX_FILES: string;
  YOGA_RESPONSE_CACHE_TTL: number;
  PORT: number;
  ENABLE_FILE_LOGGING: boolean;
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
}

/**
 * Runtime configuration - Environment and runtime settings
 */
export interface RuntimeConfig {
  NODE_ENV: string;
  CN_ROOT: string;
  CN_CXXCBC_CACHE_DIR: string;
  SOURCE_MAP_SUPPORT: boolean;
  PRESERVE_SOURCE_MAPS: boolean;
  BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS: number;
}

/**
 * Deployment configuration - Service identification and deployment metadata
 */
export interface DeploymentConfig {
  BASE_URL: string;
  HOSTNAME: string;
  INSTANCE_ID: string;
  CONTAINER_ID?: string;
  K8S_POD_NAME?: string;
  K8S_NAMESPACE?: string;
}

/**
 * Telemetry configuration - OpenTelemetry observability settings
 * Consolidated from src/telemetry/config.ts for unified configuration management
 */
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

/**
 * Unified configuration interface - All configuration sections consolidated
 */
export interface Config {
  application: ApplicationConfig;
  capella: CapellaConfig;
  runtime: RuntimeConfig;
  deployment: DeploymentConfig;
  telemetry: TelemetryConfig;
}

// Environment variable coercion helpers
const EnvString = z.string().trim();
const EnvNumber = z.coerce.number();
const EnvBoolean = z
  .enum(["true", "false", "1", "0", "yes", "no"])
  .transform((val) => ["true", "1", "yes"].includes(val.toLowerCase()));
const EnvArray = z.string().transform((val) =>
  val
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

/**
 * Application configuration schema - Core application settings
 */
const ApplicationConfigSchema = z.object({
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  LOG_MAX_SIZE: z.string().default("20m"),
  LOG_MAX_FILES: z.string().default("14d"),
  YOGA_RESPONSE_CACHE_TTL: z.coerce
    .number()
    .min(0)
    .max(3600000)
    .default(900000)
    .refine((val) => !Number.isNaN(val), "Cache TTL cannot be NaN"),
  PORT: z.coerce.number().min(1).max(65535).default(4000),
  ENABLE_FILE_LOGGING: z.coerce.boolean().default(false),
  ALLOWED_ORIGINS: z.array(z.string().url()).default(["http://localhost:3000"]),
  BASE_URL: z.string().url("BASE_URL must be a valid URL").default("http://localhost"),
});

/**
 * Capella (Couchbase) configuration schema - Database connection settings
 */
const CapellaConfigSchema = z.object({
  COUCHBASE_URL: z.string().url("Must be a valid Couchbase connection URL"),
  COUCHBASE_USERNAME: z.string().min(1, "Username cannot be empty"),
  COUCHBASE_PASSWORD: z.string().min(1, "Password cannot be empty"),
  COUCHBASE_BUCKET: z.string().min(1, "Bucket name cannot be empty").default("default"),
  COUCHBASE_SCOPE: z.string().min(1, "Scope name cannot be empty").default("_default"),
  COUCHBASE_COLLECTION: z.string().min(1, "Collection name cannot be empty").default("_default"),
});

/**
 * Runtime configuration schema - Environment and system runtime settings
 */
const RuntimeConfigSchema = z.object({
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

/**
 * Deployment configuration schema - Service identification and deployment metadata
 */
const DeploymentConfigSchema = z.object({
  BASE_URL: z.string().url().default("http://localhost"),
  HOSTNAME: z.string().default("localhost"),
  INSTANCE_ID: z.string().default("unknown"),
  CONTAINER_ID: z.string().optional(),
  K8S_POD_NAME: z.string().optional(),
  K8S_NAMESPACE: z.string().optional(),
});

/**
 * Telemetry configuration schema - OpenTelemetry observability settings
 * 2025-compliant with strict validation for production deployment
 */
const TelemetryConfigSchema = z.object({
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

/**
 * Unified configuration schema - Comprehensive validation for all configuration sections
 * Includes production security checks, runtime safety validations, and business rule enforcement
 */
const ConfigSchema = z
  .object({
    application: ApplicationConfigSchema,
    capella: CapellaConfigSchema,
    runtime: RuntimeConfigSchema,
    deployment: DeploymentConfigSchema,
    telemetry: TelemetryConfigSchema,
  })
  .superRefine((data, ctx) => {
    // Determine environment for validation
    const isProduction =
      data.runtime.NODE_ENV === "production" || data.telemetry.DEPLOYMENT_ENVIRONMENT === "production";

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

      // Validate telemetry sampling rate for production
      if (data.telemetry.SAMPLING_RATE > 0.5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "SAMPLING_RATE above 50% may impact performance in production",
          path: ["telemetry", "SAMPLING_RATE"],
        });
      }

      // Validate export timeout compliance with 2025 standards
      if (data.telemetry.EXPORT_TIMEOUT_MS > 30000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "EXPORT_TIMEOUT_MS exceeds 30 seconds - this violates 2025 OpenTelemetry standards",
          path: ["telemetry", "EXPORT_TIMEOUT_MS"],
        });
      }
    }

    // RUNTIME SAFETY VALIDATIONS (All Environments)

    // Validate cache TTL is reasonable (not NaN or infinite)
    if (isNaN(data.application.YOGA_RESPONSE_CACHE_TTL)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cache TTL cannot be NaN - this would cause runtime errors",
        path: ["application", "YOGA_RESPONSE_CACHE_TTL"],
      });
    }

    // Validate telemetry intervals are not NaN (prevents infinite loops)
    if (isNaN(data.telemetry.METRIC_READER_INTERVAL)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "METRIC_READER_INTERVAL is NaN - this will cause infinite loops",
        path: ["telemetry", "METRIC_READER_INTERVAL"],
      });
    }

    if (isNaN(data.telemetry.SUMMARY_LOG_INTERVAL)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SUMMARY_LOG_INTERVAL is NaN - this will cause infinite loops",
        path: ["telemetry", "SUMMARY_LOG_INTERVAL"],
      });
    }

    // BUSINESS RULE VALIDATIONS

    // Ensure application and telemetry environment alignment
    if (data.runtime.NODE_ENV !== data.telemetry.DEPLOYMENT_ENVIRONMENT) {
      // Log warning but don't fail validation - this might be intentional
      console.warn(
        `Environment mismatch: NODE_ENV=${data.runtime.NODE_ENV} but DEPLOYMENT_ENVIRONMENT=${data.telemetry.DEPLOYMENT_ENVIRONMENT}`
      );
    }

    // Validate port availability (basic check)
    if (data.application.PORT < 1024 && !isProduction) {
      console.warn(`Port ${data.application.PORT} is a privileged port - ensure proper permissions`);
    }

    // Validate telemetry endpoint consistency (same host recommended)
    try {
      const tracesUrl = new URL(data.telemetry.TRACES_ENDPOINT);
      const metricsUrl = new URL(data.telemetry.METRICS_ENDPOINT);
      const logsUrl = new URL(data.telemetry.LOGS_ENDPOINT);

      if (tracesUrl.host !== metricsUrl.host || tracesUrl.host !== logsUrl.host) {
        console.warn("Telemetry endpoints use different hosts - consider using the same OTLP collector");
      }
    } catch (error) {
      // URL parsing already validated by schema, this is just for warnings
    }

    // Validate batch sizes are optimal for production
    if (isProduction && data.telemetry.BATCH_SIZE < 1024) {
      console.warn("BATCH_SIZE is below recommended 1024 for production environments");
    }
  });

/**
 * Configuration health checker for comprehensive runtime validation
 * Performs deep validation of all configuration sections for production readiness
 */
export class ConfigHealthChecker {
  static validate(config: Config): { healthy: boolean; issues: string[]; warnings: string[] } {
    const issues: string[] = [];
    const warnings: string[] = [];

    const isProduction =
      config.runtime.NODE_ENV === "production" || config.telemetry.DEPLOYMENT_ENVIRONMENT === "production";

    // APPLICATION SECTION VALIDATION

    // Check for NaN values that cause runtime issues
    if (isNaN(config.application.YOGA_RESPONSE_CACHE_TTL)) {
      issues.push("YOGA_RESPONSE_CACHE_TTL is NaN - will cause runtime errors");
    }

    // Check for reasonable timeout values
    if (config.application.YOGA_RESPONSE_CACHE_TTL <= 0 || config.application.YOGA_RESPONSE_CACHE_TTL > 3600000) {
      issues.push(`YOGA_RESPONSE_CACHE_TTL value is unreasonable: ${config.application.YOGA_RESPONSE_CACHE_TTL}ms`);
    }

    // CAPELLA SECTION VALIDATION

    // Production-specific security checks
    if (isProduction) {
      if (config.capella.COUCHBASE_PASSWORD === "password") {
        issues.push("CRITICAL: Using default password in production - security risk");
      }

      if (config.application.ALLOWED_ORIGINS.some((origin) => origin.includes("localhost"))) {
        issues.push("Production CORS origins should not include localhost");
      }

      if (config.capella.COUCHBASE_USERNAME === "Administrator") {
        warnings.push("Using default Administrator username in production is not recommended");
      }
    }

    // RUNTIME SECTION VALIDATION

    // Check DNS TTL is reasonable
    if (isNaN(config.runtime.BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS)) {
      issues.push("BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS is NaN - will cause DNS caching issues");
    }

    if (config.runtime.BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS > 3600) {
      warnings.push("DNS TTL exceeds 1 hour - may cause stale DNS resolution");
    }

    // TELEMETRY SECTION VALIDATION

    // Check for NaN values in telemetry intervals (prevents infinite loops)
    if (isNaN(config.telemetry.METRIC_READER_INTERVAL)) {
      issues.push("METRIC_READER_INTERVAL is NaN - will cause infinite loops");
    }

    if (isNaN(config.telemetry.SUMMARY_LOG_INTERVAL)) {
      issues.push("SUMMARY_LOG_INTERVAL is NaN - will cause infinite loops");
    }

    // 2025 compliance validations
    if (config.telemetry.EXPORT_TIMEOUT_MS > 30000) {
      issues.push("EXPORT_TIMEOUT_MS exceeds 30 seconds - violates 2025 OpenTelemetry standards");
    }

    if (config.telemetry.BATCH_SIZE > 4096) {
      warnings.push("BATCH_SIZE exceeds recommended 4096 - may impact memory usage");
    }

    if (config.telemetry.SAMPLING_RATE > 0.5 && isProduction) {
      warnings.push("SAMPLING_RATE above 50% may impact production performance");
    }

    // DEPLOYMENT SECTION VALIDATION

    // Check for missing deployment metadata in production
    if (isProduction) {
      if (config.deployment.HOSTNAME === "localhost") {
        warnings.push("HOSTNAME is set to localhost in production - consider setting actual hostname");
      }

      if (config.deployment.INSTANCE_ID === "unknown") {
        warnings.push("INSTANCE_ID is unknown in production - consider setting for better observability");
      }
    }

    // CROSS-SECTION VALIDATIONS

    // Environment consistency checks
    if (config.runtime.NODE_ENV !== config.telemetry.DEPLOYMENT_ENVIRONMENT) {
      warnings.push(
        `Environment mismatch: NODE_ENV=${config.runtime.NODE_ENV} vs DEPLOYMENT_ENVIRONMENT=${config.telemetry.DEPLOYMENT_ENVIRONMENT}`
      );
    }

    // URL consistency checks
    try {
      const baseUrl = new URL(config.application.BASE_URL);
      const deploymentUrl = new URL(config.deployment.BASE_URL);

      if (baseUrl.origin !== deploymentUrl.origin) {
        warnings.push("BASE_URL mismatch between application and deployment sections");
      }
    } catch (error) {
      // URL validation already handled by schema
    }

    return {
      healthy: issues.length === 0,
      issues,
      warnings,
    };
  }

  /**
   * Generate a configuration health report for debugging
   */
  static generateHealthReport(config: Config): string {
    const result = ConfigHealthChecker.validate(config);
    const isProduction =
      config.runtime.NODE_ENV === "production" || config.telemetry.DEPLOYMENT_ENVIRONMENT === "production";

    let report = `\n=== CONFIGURATION HEALTH REPORT ===\n`;
    report += `Environment: ${config.runtime.NODE_ENV} / ${config.telemetry.DEPLOYMENT_ENVIRONMENT}\n`;
    report += `Production Mode: ${isProduction ? "YES" : "NO"}\n`;
    report += `Overall Health: ${result.healthy ? "✅ HEALTHY" : "❌ UNHEALTHY"}\n\n`;

    if (result.issues.length > 0) {
      report += `CRITICAL ISSUES (${result.issues.length}):\n`;
      result.issues.forEach((issue) => (report += `  ❌ ${issue}\n`));
      report += `\n`;
    }

    if (result.warnings.length > 0) {
      report += `WARNINGS (${result.warnings.length}):\n`;
      result.warnings.forEach((warning) => (report += `  ⚠️  ${warning}\n`));
      report += `\n`;
    }

    if (result.healthy && result.warnings.length === 0) {
      report += `🎉 Configuration is fully optimized and ready for ${isProduction ? "production" : "development"}!\n`;
    }

    report += `=== END HEALTH REPORT ===\n`;

    return report;
  }
}

// Type exports for external usage
export type ValidatedConfig = z.infer<typeof ConfigSchema>;

// Schema and helper exports
export {
  ConfigSchema,
  ApplicationConfigSchema,
  CapellaConfigSchema,
  RuntimeConfigSchema,
  DeploymentConfigSchema,
  TelemetryConfigSchema,
  EnvString,
  EnvNumber,
  EnvBoolean,
  EnvArray,
};

// Re-export individual section types for backward compatibility
export type { ApplicationConfig, CapellaConfig, RuntimeConfig, DeploymentConfig, TelemetryConfig, Config };
