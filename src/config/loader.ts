/* src/config/loader.ts */
// Pillar 4: Configuration Loader
// Aligned with migrate reference pattern

import { defaultConfig } from "./defaults";
import { envVarMapping, getEnvVarPath } from "./envMapping";
import {
  deriveOtlpEndpoint,
  generateConfigHealthReport,
  getEnvVar,
  parseEnvVar,
  sanitizeConfigForLogging,
  validateConfigHealth,
  validateCrossConfiguration,
} from "./helpers";
import type {
  ApplicationConfig,
  CapellaConfig,
  Config,
  DeploymentConfig,
  RuntimeConfig,
  TelemetryConfig,
} from "./schemas";
import { ConfigSchema, ConfigurationError } from "./schemas";

// =============================================================================
// ENHANCED ERROR HANDLING
// =============================================================================

class ModularConfigurationError extends ConfigurationError {
  toDetailedString(): string {
    const issues = this.errors.issues
      ?.map((issue: any) => {
        const path = issue.path.join(".");
        const envVar = getEnvVarPath(path);
        return `  - ${path}: ${issue.message}${envVar ? ` (env: ${envVar})` : ""}`;
      })
      .join("\n");

    return `${this.message}\n${issues || ""}`;
  }
}

// =============================================================================
// DOMAIN-SPECIFIC LOADERS
// =============================================================================

function loadApplicationConfigFromEnv(): Partial<ApplicationConfig> {
  const mapping = envVarMapping.application;
  return {
    LOG_LEVEL: (parseEnvVar(getEnvVar(mapping.LOG_LEVEL), "string", "LOG_LEVEL") as string) || undefined,
    YOGA_RESPONSE_CACHE_TTL:
      (parseEnvVar(getEnvVar(mapping.YOGA_RESPONSE_CACHE_TTL), "number", "YOGA_RESPONSE_CACHE_TTL") as number) || undefined,
    PORT: (parseEnvVar(getEnvVar(mapping.PORT), "number", "PORT") as number) || undefined,
    ALLOWED_ORIGINS: (parseEnvVar(getEnvVar(mapping.ALLOWED_ORIGINS), "array", "ALLOWED_ORIGINS") as string[]) || undefined,
    BASE_URL: (parseEnvVar(getEnvVar(mapping.BASE_URL), "string", "BASE_URL") as string) || undefined,
  };
}

function loadCapellaConfigFromEnv(): Partial<CapellaConfig> {
  const mapping = envVarMapping.capella;
  return {
    COUCHBASE_URL: (parseEnvVar(getEnvVar(mapping.COUCHBASE_URL), "string", "COUCHBASE_URL") as string) || undefined,
    COUCHBASE_USERNAME: (parseEnvVar(getEnvVar(mapping.COUCHBASE_USERNAME), "string", "COUCHBASE_USERNAME") as string) || undefined,
    COUCHBASE_PASSWORD: (parseEnvVar(getEnvVar(mapping.COUCHBASE_PASSWORD), "string", "COUCHBASE_PASSWORD") as string) || undefined,
    COUCHBASE_BUCKET: (parseEnvVar(getEnvVar(mapping.COUCHBASE_BUCKET), "string", "COUCHBASE_BUCKET") as string) || undefined,
    COUCHBASE_SCOPE: (parseEnvVar(getEnvVar(mapping.COUCHBASE_SCOPE), "string", "COUCHBASE_SCOPE") as string) || undefined,
    COUCHBASE_COLLECTION:
      (parseEnvVar(getEnvVar(mapping.COUCHBASE_COLLECTION), "string", "COUCHBASE_COLLECTION") as string) || undefined,
    COUCHBASE_KV_TIMEOUT: (parseEnvVar(getEnvVar(mapping.COUCHBASE_KV_TIMEOUT), "number", "COUCHBASE_KV_TIMEOUT") as number) || undefined,
    COUCHBASE_KV_DURABLE_TIMEOUT:
      (parseEnvVar(getEnvVar(mapping.COUCHBASE_KV_DURABLE_TIMEOUT), "number", "COUCHBASE_KV_DURABLE_TIMEOUT") as number) || undefined,
    COUCHBASE_QUERY_TIMEOUT:
      (parseEnvVar(getEnvVar(mapping.COUCHBASE_QUERY_TIMEOUT), "number", "COUCHBASE_QUERY_TIMEOUT") as number) || undefined,
    COUCHBASE_ANALYTICS_TIMEOUT:
      (parseEnvVar(getEnvVar(mapping.COUCHBASE_ANALYTICS_TIMEOUT), "number", "COUCHBASE_ANALYTICS_TIMEOUT") as number) || undefined,
    COUCHBASE_SEARCH_TIMEOUT:
      (parseEnvVar(getEnvVar(mapping.COUCHBASE_SEARCH_TIMEOUT), "number", "COUCHBASE_SEARCH_TIMEOUT") as number) || undefined,
    COUCHBASE_CONNECT_TIMEOUT:
      (parseEnvVar(getEnvVar(mapping.COUCHBASE_CONNECT_TIMEOUT), "number", "COUCHBASE_CONNECT_TIMEOUT") as number) || undefined,
    COUCHBASE_BOOTSTRAP_TIMEOUT:
      (parseEnvVar(getEnvVar(mapping.COUCHBASE_BOOTSTRAP_TIMEOUT), "number", "COUCHBASE_BOOTSTRAP_TIMEOUT") as number) || undefined,
  };
}

function loadRuntimeConfigFromEnv(): Partial<RuntimeConfig> {
  const mapping = envVarMapping.runtime;
  return {
    NODE_ENV: (parseEnvVar(getEnvVar(mapping.NODE_ENV), "string", "NODE_ENV") as string) || undefined,
    CN_ROOT: (parseEnvVar(getEnvVar(mapping.CN_ROOT), "string", "CN_ROOT") as string) || undefined,
    CN_CXXCBC_CACHE_DIR: (parseEnvVar(getEnvVar(mapping.CN_CXXCBC_CACHE_DIR), "string", "CN_CXXCBC_CACHE_DIR") as string) || undefined,
    SOURCE_MAP_SUPPORT: parseEnvVar(getEnvVar(mapping.SOURCE_MAP_SUPPORT), "boolean", "SOURCE_MAP_SUPPORT") as boolean | undefined,
    PRESERVE_SOURCE_MAPS: parseEnvVar(getEnvVar(mapping.PRESERVE_SOURCE_MAPS), "boolean", "PRESERVE_SOURCE_MAPS") as boolean | undefined,
    BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS:
      (parseEnvVar(getEnvVar(mapping.BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS), "number", "BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS") as number) ||
      undefined,
  };
}

function loadDeploymentConfigFromEnv(): Partial<DeploymentConfig> {
  const mapping = envVarMapping.deployment;
  return {
    BASE_URL: (parseEnvVar(getEnvVar(mapping.BASE_URL), "string", "BASE_URL") as string) || undefined,
    HOSTNAME: (parseEnvVar(getEnvVar(mapping.HOSTNAME), "string", "HOSTNAME") as string) || undefined,
    INSTANCE_ID: (parseEnvVar(getEnvVar(mapping.INSTANCE_ID), "string", "INSTANCE_ID") as string) || undefined,
    CONTAINER_ID: (parseEnvVar(getEnvVar(mapping.CONTAINER_ID), "string", "CONTAINER_ID") as string) || undefined,
    K8S_POD_NAME: (parseEnvVar(getEnvVar(mapping.K8S_POD_NAME), "string", "K8S_POD_NAME") as string) || undefined,
    K8S_NAMESPACE: (parseEnvVar(getEnvVar(mapping.K8S_NAMESPACE), "string", "K8S_NAMESPACE") as string) || undefined,
  };
}

function loadTelemetryConfigFromEnv(): Partial<TelemetryConfig> {
  const mapping = envVarMapping.telemetry;

  // Get base OTLP endpoint for fallback derivation
  const baseOtlpEndpoint = parseEnvVar(getEnvVar(mapping.OTLP_ENDPOINT), "string", "OTEL_EXPORTER_OTLP_ENDPOINT") as string | undefined;

  // Get specific endpoints or derive from base
  const tracesEndpoint =
    (parseEnvVar(getEnvVar(mapping.TRACES_ENDPOINT), "string", "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT") as string) ||
    deriveOtlpEndpoint(baseOtlpEndpoint, undefined, "/v1/traces");

  const metricsEndpoint =
    (parseEnvVar(getEnvVar(mapping.METRICS_ENDPOINT), "string", "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT") as string) ||
    deriveOtlpEndpoint(baseOtlpEndpoint, undefined, "/v1/metrics");

  const logsEndpoint =
    (parseEnvVar(getEnvVar(mapping.LOGS_ENDPOINT), "string", "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT") as string) ||
    deriveOtlpEndpoint(baseOtlpEndpoint, undefined, "/v1/logs");

  return {
    ENABLE_OPENTELEMETRY: parseEnvVar(getEnvVar(mapping.ENABLE_OPENTELEMETRY), "boolean", "ENABLE_OPENTELEMETRY") as boolean | undefined,
    SERVICE_NAME: (parseEnvVar(getEnvVar(mapping.SERVICE_NAME), "string", "OTEL_SERVICE_NAME") as string) || undefined,
    SERVICE_VERSION: (parseEnvVar(getEnvVar(mapping.SERVICE_VERSION), "string", "OTEL_SERVICE_VERSION") as string) || undefined,
    DEPLOYMENT_ENVIRONMENT:
      (parseEnvVar(getEnvVar(mapping.DEPLOYMENT_ENVIRONMENT), "string", "DEPLOYMENT_ENVIRONMENT") as string) || undefined,
    TRACES_ENDPOINT: tracesEndpoint,
    METRICS_ENDPOINT: metricsEndpoint,
    LOGS_ENDPOINT: logsEndpoint,
    METRIC_READER_INTERVAL:
      (parseEnvVar(getEnvVar(mapping.METRIC_READER_INTERVAL), "number", "METRIC_READER_INTERVAL") as number) || undefined,
    SUMMARY_LOG_INTERVAL:
      (parseEnvVar(getEnvVar(mapping.SUMMARY_LOG_INTERVAL), "number", "SUMMARY_LOG_INTERVAL") as number) || undefined,
    EXPORT_TIMEOUT_MS: (parseEnvVar(getEnvVar(mapping.EXPORT_TIMEOUT_MS), "number", "EXPORT_TIMEOUT_MS") as number) || undefined,
    BATCH_SIZE: (parseEnvVar(getEnvVar(mapping.BATCH_SIZE), "number", "BATCH_SIZE") as number) || undefined,
    MAX_QUEUE_SIZE: (parseEnvVar(getEnvVar(mapping.MAX_QUEUE_SIZE), "number", "MAX_QUEUE_SIZE") as number) || undefined,
    CIRCUIT_BREAKER_THRESHOLD:
      (parseEnvVar(getEnvVar(mapping.CIRCUIT_BREAKER_THRESHOLD), "number", "CIRCUIT_BREAKER_THRESHOLD") as number) || undefined,
    CIRCUIT_BREAKER_TIMEOUT_MS:
      (parseEnvVar(getEnvVar(mapping.CIRCUIT_BREAKER_TIMEOUT_MS), "number", "CIRCUIT_BREAKER_TIMEOUT_MS") as number) || undefined,
    LOG_RETENTION_DEBUG_DAYS:
      (parseEnvVar(getEnvVar(mapping.LOG_RETENTION_DEBUG_DAYS), "number", "LOG_RETENTION_DEBUG_DAYS") as number) || undefined,
    LOG_RETENTION_INFO_DAYS:
      (parseEnvVar(getEnvVar(mapping.LOG_RETENTION_INFO_DAYS), "number", "LOG_RETENTION_INFO_DAYS") as number) || undefined,
    LOG_RETENTION_WARN_DAYS:
      (parseEnvVar(getEnvVar(mapping.LOG_RETENTION_WARN_DAYS), "number", "LOG_RETENTION_WARN_DAYS") as number) || undefined,
    LOG_RETENTION_ERROR_DAYS:
      (parseEnvVar(getEnvVar(mapping.LOG_RETENTION_ERROR_DAYS), "number", "LOG_RETENTION_ERROR_DAYS") as number) || undefined,
  };
}

// =============================================================================
// MERGE HELPER
// =============================================================================

function mergeWithDefaults<T extends object>(defaults: T, env: Partial<T>): T {
  const result = { ...defaults };
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      (result as any)[key] = value;
    }
  }
  return result;
}

// =============================================================================
// MAIN CONFIGURATION INITIALIZER
// =============================================================================

/**
 * Initialize and validate configuration (Pillar 4 - Loader)
 * This is the core config initialization function that:
 * 1. Loads environment variables
 * 2. Merges with defaults
 * 3. Validates with Zod schema
 * 4. Performs domain-specific validations
 */
export function initializeConfig(): Config {
  // Load from environment using domain-specific loaders
  const envApplication = loadApplicationConfigFromEnv();
  const envCapella = loadCapellaConfigFromEnv();
  const envRuntime = loadRuntimeConfigFromEnv();
  const envDeployment = loadDeploymentConfigFromEnv();
  const envTelemetry = loadTelemetryConfigFromEnv();

  // Deep merge all configuration sections (environment takes precedence)
  const mergedConfig = {
    application: mergeWithDefaults(defaultConfig.application, envApplication),
    capella: mergeWithDefaults(defaultConfig.capella, envCapella),
    runtime: mergeWithDefaults(defaultConfig.runtime, envRuntime),
    deployment: mergeWithDefaults(defaultConfig.deployment, envDeployment),
    telemetry: mergeWithDefaults(defaultConfig.telemetry, envTelemetry),
  };

  // Validate with unified schema
  const result = ConfigSchema.safeParse(mergedConfig);

  if (!result.success) {
    const configError = new ModularConfigurationError("Modular configuration validation failed", result.error, mergedConfig);

    // Enhanced error reporting
    process.stderr.write(`\n=== MODULAR CONFIGURATION VALIDATION FAILED ===\n`);
    process.stderr.write(`${configError.toDetailedString()}\n`);

    // Check for critical issues
    const criticalIssues = result.error.issues.filter(
      (issue) => issue.message.includes("CRITICAL") || issue.path.includes("COUCHBASE_PASSWORD")
    );

    if (criticalIssues.length > 0) {
      process.stderr.write("\n=== CRITICAL SECURITY ISSUES DETECTED ===\n");
      criticalIssues.forEach((issue) => {
        process.stderr.write(`${issue.message}\n`);
      });
      process.stderr.write("=== DEPLOYMENT BLOCKED - FIX THESE ISSUES ===\n\n");
    }

    throw configError;
  }

  const validatedConfig = result.data;

  // Perform cross-domain validations
  const isProduction =
    validatedConfig.runtime.NODE_ENV === "production" || validatedConfig.telemetry.DEPLOYMENT_ENVIRONMENT === "production";

  const _allWarnings: string[] = validateCrossConfiguration(validatedConfig);

  // Perform comprehensive health check
  const healthCheck = validateConfigHealth(validatedConfig);
  if (!healthCheck.healthy || healthCheck.warnings.length > 0) {
    // Generate and log full health report
    const healthReport = generateConfigHealthReport(validatedConfig);
    process.stderr.write(healthReport);

    // Fail fast if there are critical health issues
    if (!healthCheck.healthy) {
      process.stderr.write("\n=== CRITICAL CONFIGURATION ISSUES DETECTED ===\n");
      process.stderr.write("Cannot proceed with invalid configuration.\n");
      process.stderr.write("=== STARTUP BLOCKED ===\n\n");
      throw new Error("Configuration health check failed - see issues above");
    }
  }

  // Log successful configuration load (with sensitive data redacted)
  const sanitizedConfig = sanitizeConfigForLogging(validatedConfig);
  process.stderr.write("\n=== MODULAR CONFIGURATION LOADED SUCCESSFULLY ===\n");
  process.stderr.write(`${JSON.stringify(sanitizedConfig, null, 2)}\n`);

  // Environment-specific logging
  if (isProduction) {
    process.stderr.write("Production mode: All security validations passed\n");
  } else {
    process.stderr.write("Development mode: Using development defaults where applicable\n");
  }

  // Log modular configuration success
  process.stderr.write("Modular configuration system active - Domain-separated validation\n");
  process.stderr.write(`Configuration domains loaded: application, capella, runtime, deployment, telemetry\n`);
  process.stderr.write(`Telemetry configuration: ${validatedConfig.telemetry.ENABLE_OPENTELEMETRY ? "ENABLED" : "DISABLED"}\n`);

  // Log runtime detection
  process.stderr.write(`Runtime: ${typeof Bun !== "undefined" ? `Bun ${Bun.version}` : "Node.js"}\n`);
  process.stderr.write("=== MODULAR CONFIGURATION INITIALIZATION COMPLETE ===\n\n");

  return validatedConfig;
}

// Re-export domain loaders for advanced usage
export {
  loadApplicationConfigFromEnv,
  loadCapellaConfigFromEnv,
  loadDeploymentConfigFromEnv,
  loadRuntimeConfigFromEnv,
  loadTelemetryConfigFromEnv,
};
