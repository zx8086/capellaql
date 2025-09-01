// Unified configuration with validation

import type { z } from "zod";
import { type Config, ConfigSchema, generateConfigHealthReport, validateConfig } from "$models/types";

const envVarMapping = {
  application: {
    LOG_LEVEL: "LOG_LEVEL",
    YOGA_RESPONSE_CACHE_TTL: "YOGA_RESPONSE_CACHE_TTL",
    PORT: "PORT",
    ALLOWED_ORIGINS: "ALLOWED_ORIGINS",
    BASE_URL: "BASE_URL",
  },
  capella: {
    COUCHBASE_URL: "COUCHBASE_URL",
    COUCHBASE_USERNAME: "COUCHBASE_USERNAME",
    COUCHBASE_PASSWORD: "COUCHBASE_PASSWORD",
    COUCHBASE_BUCKET: "COUCHBASE_BUCKET",
    COUCHBASE_SCOPE: "COUCHBASE_SCOPE",
    COUCHBASE_COLLECTION: "COUCHBASE_COLLECTION",
    COUCHBASE_KV_TIMEOUT: "COUCHBASE_KV_TIMEOUT",
    COUCHBASE_KV_DURABLE_TIMEOUT: "COUCHBASE_KV_DURABLE_TIMEOUT",
    COUCHBASE_QUERY_TIMEOUT: "COUCHBASE_QUERY_TIMEOUT",
    COUCHBASE_ANALYTICS_TIMEOUT: "COUCHBASE_ANALYTICS_TIMEOUT",
    COUCHBASE_SEARCH_TIMEOUT: "COUCHBASE_SEARCH_TIMEOUT",
    COUCHBASE_CONNECT_TIMEOUT: "COUCHBASE_CONNECT_TIMEOUT",
    COUCHBASE_BOOTSTRAP_TIMEOUT: "COUCHBASE_BOOTSTRAP_TIMEOUT",
  },
  runtime: {
    NODE_ENV: "NODE_ENV",
    CN_ROOT: "CN_ROOT",
    CN_CXXCBC_CACHE_DIR: "CN_CXXCBC_CACHE_DIR",
    SOURCE_MAP_SUPPORT: "SOURCE_MAP_SUPPORT",
    PRESERVE_SOURCE_MAPS: "PRESERVE_SOURCE_MAPS",
    BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS: "BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS",
  },
  deployment: {
    BASE_URL: "BASE_URL",
    HOSTNAME: "HOSTNAME",
    INSTANCE_ID: "INSTANCE_ID",
    CONTAINER_ID: "CONTAINER_ID",
    K8S_POD_NAME: "K8S_POD_NAME",
    K8S_NAMESPACE: "K8S_NAMESPACE",
  },
  telemetry: {
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
    LOG_SAMPLING_DEBUG: "LOG_SAMPLING_DEBUG",
    LOG_SAMPLING_INFO: "LOG_SAMPLING_INFO",
    LOG_SAMPLING_WARN: "LOG_SAMPLING_WARN",
    LOG_SAMPLING_ERROR: "LOG_SAMPLING_ERROR",
    LOG_RETENTION_DEBUG_DAYS: "LOG_RETENTION_DEBUG_DAYS",
    LOG_RETENTION_INFO_DAYS: "LOG_RETENTION_INFO_DAYS",
    LOG_RETENTION_WARN_DAYS: "LOG_RETENTION_WARN_DAYS",
    LOG_RETENTION_ERROR_DAYS: "LOG_RETENTION_ERROR_DAYS",
  },
} as const;

class ConfigurationError extends Error {
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
      .map((issue) => {
        const path = issue.path.join(".");
        const envVar = this.getEnvVarName(path);
        return `  - ${path}: ${issue.message}${envVar ? ` (env: ${envVar})` : ""}`;
      })
      .join("\n");

    return `${this.message}\n${issues}`;
  }

  private getEnvVarName(path: string): string | undefined {
    // Comprehensive mapping of config paths to environment variable names
    const mapping: Record<string, string> = {
      // Application section
      "application.LOG_LEVEL": "LOG_LEVEL",
      "application.YOGA_RESPONSE_CACHE_TTL": "YOGA_RESPONSE_CACHE_TTL",
      "application.PORT": "PORT",
      "application.ALLOWED_ORIGINS": "ALLOWED_ORIGINS",
      "application.BASE_URL": "BASE_URL",

      // Capella section
      "capella.COUCHBASE_URL": "COUCHBASE_URL",
      "capella.COUCHBASE_USERNAME": "COUCHBASE_USERNAME",
      "capella.COUCHBASE_PASSWORD": "COUCHBASE_PASSWORD",
      "capella.COUCHBASE_BUCKET": "COUCHBASE_BUCKET",
      "capella.COUCHBASE_SCOPE": "COUCHBASE_SCOPE",
      "capella.COUCHBASE_COLLECTION": "COUCHBASE_COLLECTION",

      // Runtime section
      "runtime.NODE_ENV": "NODE_ENV",
      "runtime.CN_ROOT": "CN_ROOT",
      "runtime.CN_CXXCBC_CACHE_DIR": "CN_CXXCBC_CACHE_DIR",
      "runtime.SOURCE_MAP_SUPPORT": "SOURCE_MAP_SUPPORT",
      "runtime.PRESERVE_SOURCE_MAPS": "PRESERVE_SOURCE_MAPS",
      "runtime.BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS": "BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS",

      // Deployment section
      "deployment.BASE_URL": "BASE_URL",
      "deployment.HOSTNAME": "HOSTNAME",
      "deployment.INSTANCE_ID": "INSTANCE_ID",
      "deployment.CONTAINER_ID": "CONTAINER_ID",
      "deployment.K8S_POD_NAME": "K8S_POD_NAME",
      "deployment.K8S_NAMESPACE": "K8S_NAMESPACE",

      // Telemetry section
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
      "telemetry.LOG_SAMPLING_DEBUG": "LOG_SAMPLING_DEBUG",
      "telemetry.LOG_SAMPLING_INFO": "LOG_SAMPLING_INFO",
      "telemetry.LOG_SAMPLING_WARN": "LOG_SAMPLING_WARN",
      "telemetry.LOG_SAMPLING_ERROR": "LOG_SAMPLING_ERROR",
      "telemetry.LOG_RETENTION_DEBUG_DAYS": "LOG_RETENTION_DEBUG_DAYS",
      "telemetry.LOG_RETENTION_INFO_DAYS": "LOG_RETENTION_INFO_DAYS",
      "telemetry.LOG_RETENTION_WARN_DAYS": "LOG_RETENTION_WARN_DAYS",
      "telemetry.LOG_RETENTION_ERROR_DAYS": "LOG_RETENTION_ERROR_DAYS",
    };
    return mapping[path];
  }
}

/**
 * Comprehensive default configuration for all sections
 * WARNING: These defaults are for development only. Production deployments
 * MUST override sensitive values (passwords, URLs, etc.)
 */
const defaultConfig: Config = {
  application: {
    LOG_LEVEL: "info",
    YOGA_RESPONSE_CACHE_TTL: 900000, // 15 minutes
    PORT: 4000,
    ALLOWED_ORIGINS: ["http://localhost:3000"],
    BASE_URL: "http://localhost",
  },
  capella: {
    COUCHBASE_URL: "couchbase://localhost",
    COUCHBASE_USERNAME: "Administrator", // DEV ONLY
    COUCHBASE_PASSWORD: "password", // DEV ONLY - MUST be overridden in production
    COUCHBASE_BUCKET: "default",
    COUCHBASE_SCOPE: "_default",
    COUCHBASE_COLLECTION: "_default",
    // Production-ready timeout defaults (milliseconds)
    COUCHBASE_KV_TIMEOUT: 5000,
    COUCHBASE_KV_DURABLE_TIMEOUT: 10000,
    COUCHBASE_QUERY_TIMEOUT: 15000,
    COUCHBASE_ANALYTICS_TIMEOUT: 30000,
    COUCHBASE_SEARCH_TIMEOUT: 15000,
    COUCHBASE_CONNECT_TIMEOUT: 10000,
    COUCHBASE_BOOTSTRAP_TIMEOUT: 15000,
  },
  runtime: {
    NODE_ENV: "development",
    CN_ROOT: "/usr/src/app",
    CN_CXXCBC_CACHE_DIR: undefined,
    SOURCE_MAP_SUPPORT: true,
    PRESERVE_SOURCE_MAPS: true,
    BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS: 120,
  },
  deployment: {
    BASE_URL: "http://localhost",
    HOSTNAME: "localhost",
    INSTANCE_ID: "unknown",
    CONTAINER_ID: undefined,
    K8S_POD_NAME: undefined,
    K8S_NAMESPACE: undefined,
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
    // 2025 compliance defaults
    EXPORT_TIMEOUT_MS: 30000,
    BATCH_SIZE: 2048,
    MAX_QUEUE_SIZE: 10000,
    SAMPLING_RATE: 0.15,
    CIRCUIT_BREAKER_THRESHOLD: 5,
    CIRCUIT_BREAKER_TIMEOUT_MS: 60000,
    // Log sampling configuration - 100% sampling to ensure important events are captured
    LOG_SAMPLING_DEBUG: 1.0,
    LOG_SAMPLING_INFO: 1.0,
    LOG_SAMPLING_WARN: 1.0,
    LOG_SAMPLING_ERROR: 1.0,
    // Log retention configuration
    LOG_RETENTION_DEBUG_DAYS: 7,   // 7 days for debug logs
    LOG_RETENTION_INFO_DAYS: 30,   // 30 days for info logs  
    LOG_RETENTION_WARN_DAYS: 90,   // 90 days for warning logs
    LOG_RETENTION_ERROR_DAYS: 365, // 365 days (1 year) for error logs
  },
};

// Environment variable parser with NaN protection
function parseEnvVar(
  value: string | undefined,
  type: "string" | "number" | "boolean" | "array" | "json",
  fieldName?: string
): unknown {
  if (value === undefined || value === "") return undefined;

  // Clean up quoted values and whitespace (handles both single and double quotes)
  value = value.replace(/^['"]|['"]$/g, "").trim();

  // Handle empty strings after trimming
  if (value === "") return undefined;

  try {
    switch (type) {
      case "number": {
        // Special handling for floating point numbers
        const parsed = Number(value);
        if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
          console.warn(
            `Warning: Environment variable ${fieldName} has invalid number value: '${value}'. Using default.`
          );
          return undefined;
        }
        return parsed;
      }

      case "boolean": {
        const normalized = value.toLowerCase().trim();
        // Comprehensive boolean value handling
        const truthyValues = ["true", "1", "yes", "on", "enabled", "enable"];
        const falsyValues = ["false", "0", "no", "off", "disabled", "disable"];

        if (truthyValues.includes(normalized)) return true;
        if (falsyValues.includes(normalized)) return false;

        console.warn(
          `Warning: Environment variable ${fieldName} has ambiguous boolean value: '${value}'. Treating as false.`
        );
        return false;
      }

      case "array": {
        // Handle comma-separated arrays with flexible whitespace
        return value
          .split(/[,;|]/)
          .map((s) => s.trim())
          .filter(Boolean);
      }

      case "json": {
        try {
          return JSON.parse(value);
        } catch (_jsonError) {
          console.warn(`Warning: Environment variable ${fieldName} contains invalid JSON: '${value}'. Using default.`);
          return undefined;
        }
      }
      default:
        return value;
    }
  } catch (error) {
    console.warn(`Warning: Failed to parse environment variable ${fieldName}: ${error}. Using default.`);
    return undefined;
  }
}

function getEnvVar(key: string): string | undefined {
  // Bun-first approach - check if we're in Bun runtime
  if (typeof Bun !== "undefined") {
    // Use Bun.env directly for best performance
    const value = Bun.env[key];
    if (value !== undefined && value !== null && value !== "") {
      return String(value);
    }
  }

  // Fallback to process.env for compatibility
  try {
    const value = process.env[key];
    if (value !== undefined && value !== null && value !== "") {
      return String(value);
    }
  } catch (_error) {
    // Silent fallback in case process is not available
  }

  return undefined;
}

// Load configuration from environment variables
function loadConfigFromEnv(): Partial<Config> {
  const config: Partial<Config> = {};

  // LOAD APPLICATION CONFIGURATION
  config.application = {
    LOG_LEVEL:
      (parseEnvVar(getEnvVar(envVarMapping.application.LOG_LEVEL), "string", "LOG_LEVEL") as string) ||
      defaultConfig.application.LOG_LEVEL,

    YOGA_RESPONSE_CACHE_TTL:
      (parseEnvVar(
        getEnvVar(envVarMapping.application.YOGA_RESPONSE_CACHE_TTL),
        "number",
        "YOGA_RESPONSE_CACHE_TTL"
      ) as number) || defaultConfig.application.YOGA_RESPONSE_CACHE_TTL,

    PORT:
      (parseEnvVar(getEnvVar(envVarMapping.application.PORT), "number", "PORT") as number) ||
      defaultConfig.application.PORT,

    ALLOWED_ORIGINS:
      (parseEnvVar(getEnvVar(envVarMapping.application.ALLOWED_ORIGINS), "array", "ALLOWED_ORIGINS") as string[]) ||
      defaultConfig.application.ALLOWED_ORIGINS,

    BASE_URL:
      (parseEnvVar(getEnvVar(envVarMapping.application.BASE_URL), "string", "BASE_URL") as string) ||
      defaultConfig.application.BASE_URL,
  };

  // LOAD CAPELLA CONFIGURATION
  config.capella = {
    COUCHBASE_URL:
      (parseEnvVar(getEnvVar(envVarMapping.capella.COUCHBASE_URL), "string", "COUCHBASE_URL") as string) ||
      defaultConfig.capella.COUCHBASE_URL,

    COUCHBASE_USERNAME:
      (parseEnvVar(getEnvVar(envVarMapping.capella.COUCHBASE_USERNAME), "string", "COUCHBASE_USERNAME") as string) ||
      defaultConfig.capella.COUCHBASE_USERNAME,

    COUCHBASE_PASSWORD:
      (parseEnvVar(getEnvVar(envVarMapping.capella.COUCHBASE_PASSWORD), "string", "COUCHBASE_PASSWORD") as string) ||
      defaultConfig.capella.COUCHBASE_PASSWORD,

    COUCHBASE_BUCKET:
      (parseEnvVar(getEnvVar(envVarMapping.capella.COUCHBASE_BUCKET), "string", "COUCHBASE_BUCKET") as string) ||
      defaultConfig.capella.COUCHBASE_BUCKET,

    COUCHBASE_SCOPE:
      (parseEnvVar(getEnvVar(envVarMapping.capella.COUCHBASE_SCOPE), "string", "COUCHBASE_SCOPE") as string) ||
      defaultConfig.capella.COUCHBASE_SCOPE,

    COUCHBASE_COLLECTION:
      (parseEnvVar(
        getEnvVar(envVarMapping.capella.COUCHBASE_COLLECTION),
        "string",
        "COUCHBASE_COLLECTION"
      ) as string) || defaultConfig.capella.COUCHBASE_COLLECTION,

    // SDK timeout configurations
    COUCHBASE_KV_TIMEOUT:
      (parseEnvVar(
        getEnvVar(envVarMapping.capella.COUCHBASE_KV_TIMEOUT),
        "number",
        "COUCHBASE_KV_TIMEOUT"
      ) as number) || defaultConfig.capella.COUCHBASE_KV_TIMEOUT,

    COUCHBASE_KV_DURABLE_TIMEOUT:
      (parseEnvVar(
        getEnvVar(envVarMapping.capella.COUCHBASE_KV_DURABLE_TIMEOUT),
        "number",
        "COUCHBASE_KV_DURABLE_TIMEOUT"
      ) as number) || defaultConfig.capella.COUCHBASE_KV_DURABLE_TIMEOUT,

    COUCHBASE_QUERY_TIMEOUT:
      (parseEnvVar(
        getEnvVar(envVarMapping.capella.COUCHBASE_QUERY_TIMEOUT),
        "number",
        "COUCHBASE_QUERY_TIMEOUT"
      ) as number) || defaultConfig.capella.COUCHBASE_QUERY_TIMEOUT,

    COUCHBASE_ANALYTICS_TIMEOUT:
      (parseEnvVar(
        getEnvVar(envVarMapping.capella.COUCHBASE_ANALYTICS_TIMEOUT),
        "number",
        "COUCHBASE_ANALYTICS_TIMEOUT"
      ) as number) || defaultConfig.capella.COUCHBASE_ANALYTICS_TIMEOUT,

    COUCHBASE_SEARCH_TIMEOUT:
      (parseEnvVar(
        getEnvVar(envVarMapping.capella.COUCHBASE_SEARCH_TIMEOUT),
        "number",
        "COUCHBASE_SEARCH_TIMEOUT"
      ) as number) || defaultConfig.capella.COUCHBASE_SEARCH_TIMEOUT,

    COUCHBASE_CONNECT_TIMEOUT:
      (parseEnvVar(
        getEnvVar(envVarMapping.capella.COUCHBASE_CONNECT_TIMEOUT),
        "number",
        "COUCHBASE_CONNECT_TIMEOUT"
      ) as number) || defaultConfig.capella.COUCHBASE_CONNECT_TIMEOUT,

    COUCHBASE_BOOTSTRAP_TIMEOUT:
      (parseEnvVar(
        getEnvVar(envVarMapping.capella.COUCHBASE_BOOTSTRAP_TIMEOUT),
        "number",
        "COUCHBASE_BOOTSTRAP_TIMEOUT"
      ) as number) || defaultConfig.capella.COUCHBASE_BOOTSTRAP_TIMEOUT,
  };

  // LOAD RUNTIME CONFIGURATION
  config.runtime = {
    NODE_ENV:
      (parseEnvVar(getEnvVar(envVarMapping.runtime.NODE_ENV), "string", "NODE_ENV") as string) ||
      defaultConfig.runtime.NODE_ENV,

    CN_ROOT:
      (parseEnvVar(getEnvVar(envVarMapping.runtime.CN_ROOT), "string", "CN_ROOT") as string) ||
      defaultConfig.runtime.CN_ROOT,

    CN_CXXCBC_CACHE_DIR:
      (parseEnvVar(getEnvVar(envVarMapping.runtime.CN_CXXCBC_CACHE_DIR), "string", "CN_CXXCBC_CACHE_DIR") as string) ||
      defaultConfig.runtime.CN_CXXCBC_CACHE_DIR,

    SOURCE_MAP_SUPPORT:
      (parseEnvVar(getEnvVar(envVarMapping.runtime.SOURCE_MAP_SUPPORT), "boolean", "SOURCE_MAP_SUPPORT") as boolean) ??
      defaultConfig.runtime.SOURCE_MAP_SUPPORT,

    PRESERVE_SOURCE_MAPS:
      (parseEnvVar(
        getEnvVar(envVarMapping.runtime.PRESERVE_SOURCE_MAPS),
        "boolean",
        "PRESERVE_SOURCE_MAPS"
      ) as boolean) ?? defaultConfig.runtime.PRESERVE_SOURCE_MAPS,

    BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS:
      (parseEnvVar(
        getEnvVar(envVarMapping.runtime.BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS),
        "number",
        "BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS"
      ) as number) || defaultConfig.runtime.BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS,
  };

  // LOAD DEPLOYMENT CONFIGURATION
  config.deployment = {
    BASE_URL:
      (parseEnvVar(getEnvVar(envVarMapping.deployment.BASE_URL), "string", "BASE_URL") as string) ||
      defaultConfig.deployment.BASE_URL,

    HOSTNAME:
      (parseEnvVar(getEnvVar(envVarMapping.deployment.HOSTNAME), "string", "HOSTNAME") as string) ||
      defaultConfig.deployment.HOSTNAME,

    INSTANCE_ID:
      (parseEnvVar(getEnvVar(envVarMapping.deployment.INSTANCE_ID), "string", "INSTANCE_ID") as string) ||
      defaultConfig.deployment.INSTANCE_ID,

    CONTAINER_ID:
      (parseEnvVar(getEnvVar(envVarMapping.deployment.CONTAINER_ID), "string", "CONTAINER_ID") as string) ||
      defaultConfig.deployment.CONTAINER_ID,

    K8S_POD_NAME:
      (parseEnvVar(getEnvVar(envVarMapping.deployment.K8S_POD_NAME), "string", "K8S_POD_NAME") as string) ||
      defaultConfig.deployment.K8S_POD_NAME,

    K8S_NAMESPACE:
      (parseEnvVar(getEnvVar(envVarMapping.deployment.K8S_NAMESPACE), "string", "K8S_NAMESPACE") as string) ||
      defaultConfig.deployment.K8S_NAMESPACE,
  };

  // LOAD TELEMETRY CONFIGURATION (consolidated from separate telemetry config)
  config.telemetry = {
    ENABLE_OPENTELEMETRY:
      (parseEnvVar(
        getEnvVar(envVarMapping.telemetry.ENABLE_OPENTELEMETRY),
        "boolean",
        "ENABLE_OPENTELEMETRY"
      ) as boolean) ?? defaultConfig.telemetry.ENABLE_OPENTELEMETRY,

    SERVICE_NAME:
      (parseEnvVar(getEnvVar(envVarMapping.telemetry.SERVICE_NAME), "string", "SERVICE_NAME") as string) ||
      defaultConfig.telemetry.SERVICE_NAME,

    SERVICE_VERSION:
      (parseEnvVar(getEnvVar(envVarMapping.telemetry.SERVICE_VERSION), "string", "SERVICE_VERSION") as string) ||
      defaultConfig.telemetry.SERVICE_VERSION,

    DEPLOYMENT_ENVIRONMENT:
      (parseEnvVar(
        getEnvVar(envVarMapping.telemetry.DEPLOYMENT_ENVIRONMENT),
        "string",
        "DEPLOYMENT_ENVIRONMENT"
      ) as string) || defaultConfig.telemetry.DEPLOYMENT_ENVIRONMENT,

    TRACES_ENDPOINT:
      (parseEnvVar(getEnvVar(envVarMapping.telemetry.TRACES_ENDPOINT), "string", "TRACES_ENDPOINT") as string) ||
      defaultConfig.telemetry.TRACES_ENDPOINT,

    METRICS_ENDPOINT:
      (parseEnvVar(getEnvVar(envVarMapping.telemetry.METRICS_ENDPOINT), "string", "METRICS_ENDPOINT") as string) ||
      defaultConfig.telemetry.METRICS_ENDPOINT,

    LOGS_ENDPOINT:
      (parseEnvVar(getEnvVar(envVarMapping.telemetry.LOGS_ENDPOINT), "string", "LOGS_ENDPOINT") as string) ||
      defaultConfig.telemetry.LOGS_ENDPOINT,

    METRIC_READER_INTERVAL:
      (parseEnvVar(
        getEnvVar(envVarMapping.telemetry.METRIC_READER_INTERVAL),
        "number",
        "METRIC_READER_INTERVAL"
      ) as number) || defaultConfig.telemetry.METRIC_READER_INTERVAL,

    SUMMARY_LOG_INTERVAL:
      (parseEnvVar(
        getEnvVar(envVarMapping.telemetry.SUMMARY_LOG_INTERVAL),
        "number",
        "SUMMARY_LOG_INTERVAL"
      ) as number) || defaultConfig.telemetry.SUMMARY_LOG_INTERVAL,

    // 2025 compliance settings
    EXPORT_TIMEOUT_MS:
      (parseEnvVar(getEnvVar(envVarMapping.telemetry.EXPORT_TIMEOUT_MS), "number", "EXPORT_TIMEOUT_MS") as number) ||
      defaultConfig.telemetry.EXPORT_TIMEOUT_MS,

    BATCH_SIZE:
      (parseEnvVar(getEnvVar(envVarMapping.telemetry.BATCH_SIZE), "number", "BATCH_SIZE") as number) ||
      defaultConfig.telemetry.BATCH_SIZE,

    MAX_QUEUE_SIZE:
      (parseEnvVar(getEnvVar(envVarMapping.telemetry.MAX_QUEUE_SIZE), "number", "MAX_QUEUE_SIZE") as number) ||
      defaultConfig.telemetry.MAX_QUEUE_SIZE,

    SAMPLING_RATE:
      (parseEnvVar(getEnvVar(envVarMapping.telemetry.SAMPLING_RATE), "number", "SAMPLING_RATE") as number) ||
      defaultConfig.telemetry.SAMPLING_RATE,

    CIRCUIT_BREAKER_THRESHOLD:
      (parseEnvVar(
        getEnvVar(envVarMapping.telemetry.CIRCUIT_BREAKER_THRESHOLD),
        "number",
        "CIRCUIT_BREAKER_THRESHOLD"
      ) as number) || defaultConfig.telemetry.CIRCUIT_BREAKER_THRESHOLD,

    CIRCUIT_BREAKER_TIMEOUT_MS:
      (parseEnvVar(
        getEnvVar(envVarMapping.telemetry.CIRCUIT_BREAKER_TIMEOUT_MS),
        "number",
        "CIRCUIT_BREAKER_TIMEOUT_MS"
      ) as number) || defaultConfig.telemetry.CIRCUIT_BREAKER_TIMEOUT_MS,

    // Log sampling configuration
    LOG_SAMPLING_DEBUG:
      (parseEnvVar(
        getEnvVar(envVarMapping.telemetry.LOG_SAMPLING_DEBUG),
        "number",
        "LOG_SAMPLING_DEBUG"
      ) as number) ?? defaultConfig.telemetry.LOG_SAMPLING_DEBUG,

    LOG_SAMPLING_INFO:
      (parseEnvVar(
        getEnvVar(envVarMapping.telemetry.LOG_SAMPLING_INFO),
        "number",
        "LOG_SAMPLING_INFO"
      ) as number) ?? defaultConfig.telemetry.LOG_SAMPLING_INFO,

    LOG_SAMPLING_WARN:
      (parseEnvVar(
        getEnvVar(envVarMapping.telemetry.LOG_SAMPLING_WARN),
        "number",
        "LOG_SAMPLING_WARN"
      ) as number) ?? defaultConfig.telemetry.LOG_SAMPLING_WARN,

    LOG_SAMPLING_ERROR:
      (parseEnvVar(
        getEnvVar(envVarMapping.telemetry.LOG_SAMPLING_ERROR),
        "number",
        "LOG_SAMPLING_ERROR"
      ) as number) ?? defaultConfig.telemetry.LOG_SAMPLING_ERROR,

    // Log retention configuration
    LOG_RETENTION_DEBUG_DAYS:
      (parseEnvVar(
        getEnvVar(envVarMapping.telemetry.LOG_RETENTION_DEBUG_DAYS),
        "number",
        "LOG_RETENTION_DEBUG_DAYS"
      ) as number) || defaultConfig.telemetry.LOG_RETENTION_DEBUG_DAYS,

    LOG_RETENTION_INFO_DAYS:
      (parseEnvVar(
        getEnvVar(envVarMapping.telemetry.LOG_RETENTION_INFO_DAYS),
        "number",
        "LOG_RETENTION_INFO_DAYS"
      ) as number) || defaultConfig.telemetry.LOG_RETENTION_INFO_DAYS,

    LOG_RETENTION_WARN_DAYS:
      (parseEnvVar(
        getEnvVar(envVarMapping.telemetry.LOG_RETENTION_WARN_DAYS),
        "number",
        "LOG_RETENTION_WARN_DAYS"
      ) as number) || defaultConfig.telemetry.LOG_RETENTION_WARN_DAYS,

    LOG_RETENTION_ERROR_DAYS:
      (parseEnvVar(
        getEnvVar(envVarMapping.telemetry.LOG_RETENTION_ERROR_DAYS),
        "number",
        "LOG_RETENTION_ERROR_DAYS"
      ) as number) || defaultConfig.telemetry.LOG_RETENTION_ERROR_DAYS,
  };

  return config;
}

// Sanitize config for safe logging
function sanitizeConfigForLogging(config: Config): any {
  return JSON.parse(
    JSON.stringify(config, (key, value) => {
      // Comprehensive list of sensitive key patterns
      const sensitiveKeys = [
        "password",
        "secret",
        "token",
        "key",
        "apikey",
        "auth",
        "credential",
        "cert",
        "private",
        "pass",
        "pwd",
        "hash",
      ];

      // Check if current key contains any sensitive patterns
      if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
        if (value && typeof value === "string" && value.length > 0) {
          // For non-empty sensitive values, show partial info for debugging
          if (value.length <= 8) {
            return "***REDACTED***";
          } else {
            // Show first 2 and last 2 characters for debugging while masking middle
            return `${value.substring(0, 2)}***${value.substring(value.length - 2)}`;
          }
        } else {
          return value; // undefined, null, or empty string - keep as is
        }
      }

      // Special handling for URLs that might contain sensitive info in query params or userinfo
      if (typeof value === "string" && (value.startsWith("http") || value.startsWith("couchbase"))) {
        try {
          const url = new URL(value);
          // Mask userinfo if present
          if (url.username || url.password) {
            url.username = url.username ? "REDACTED" : "";
            url.password = url.password ? "REDACTED" : "";
          }
          // Clear potentially sensitive query parameters
          const _sensitiveParams = ["token", "key", "secret", "auth"];
          for (const [paramKey] of url.searchParams) {
            if (sensitiveKeys.some((k) => paramKey.toLowerCase().includes(k))) {
              url.searchParams.set(paramKey, "REDACTED");
            }
          }
          return url.toString();
        } catch (_error) {
          // If URL parsing fails, return original value (not a URL after all)
          return value;
        }
      }

      return value;
    })
  );
}

/**
 * Initialize and validate configuration
 */
let config: Config;

try {
  // Load from environment
  const envConfig = loadConfigFromEnv();

  // Deep merge all configuration sections (environment takes precedence)
  const mergedConfig = {
    application: { ...defaultConfig.application, ...envConfig.application },
    capella: { ...defaultConfig.capella, ...envConfig.capella },
    runtime: { ...defaultConfig.runtime, ...envConfig.runtime },
    deployment: { ...defaultConfig.deployment, ...envConfig.deployment },
    telemetry: { ...defaultConfig.telemetry, ...envConfig.telemetry },
  };

  // Validate with Zod schema
  const result = ConfigSchema.safeParse(mergedConfig);

  if (!result.success) {
    const configError = new ConfigurationError("Configuration validation failed", result.error, mergedConfig);

    // Enhanced error reporting
    process.stderr.write(`\n=== CONFIGURATION VALIDATION FAILED ===\n`);
    process.stderr.write(`${configError.toDetailedString()}\n`);

    // Check for critical issues
    const criticalIssues = result.error.issues.filter(
      (issue) => issue.message.includes("CRITICAL") || issue.path.includes("COUCHBASE_PASSWORD")
    );

    if (criticalIssues.length > 0) {
      process.stderr.write("\n=== CRITICAL SECURITY ISSUES DETECTED ===\n");
      criticalIssues.forEach((issue) => {
        process.stderr.write(`❌ ${issue.message}\n`);
      });
      process.stderr.write("=== DEPLOYMENT BLOCKED - FIX THESE ISSUES ===\n\n");
    }

    throw configError;
  }

  config = result.data;

  // Perform comprehensive health check
  const healthCheck = validateConfig(config);
  if (!healthCheck.healthy || healthCheck.warnings.length > 0) {
    // Generate and log full health report
    const healthReport = generateConfigHealthReport(config);
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
  const sanitizedConfig = sanitizeConfigForLogging(config);
  process.stderr.write("\n=== CONFIGURATION LOADED SUCCESSFULLY ===\n");
  process.stderr.write(`${JSON.stringify(sanitizedConfig, null, 2)}\n`);

  // Environment-specific logging
  const isProduction =
    config.runtime.NODE_ENV === "production" || config.telemetry.DEPLOYMENT_ENVIRONMENT === "production";
  if (isProduction) {
    process.stderr.write("🔒 Production mode: All security validations passed\n");
  } else {
    process.stderr.write("🔧 Development mode: Using development defaults where applicable\n");
  }

  // Log configuration consolidation success
  process.stderr.write("📋 Unified configuration system active - ALL environment variables consolidated\n");
  process.stderr.write(`📊 Configuration sections loaded: application, capella, runtime, deployment, telemetry\n`);
  process.stderr.write(
    `🚀 Telemetry configuration: ${config.telemetry.ENABLE_OPENTELEMETRY ? "ENABLED" : "DISABLED"}\n`
  );

  // Log runtime detection
  process.stderr.write(`⚡ Runtime: ${typeof Bun !== "undefined" ? `Bun ${Bun.version}` : "Node.js"}\n`);
  process.stderr.write("=== CONFIGURATION INITIALIZATION COMPLETE ===\n\n");
} catch (error) {
  if (error instanceof ConfigurationError) {
    // Already handled above with detailed error reporting
    process.exit(1);
  } else {
    process.stderr.write(
      `❌ Unexpected configuration error: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.stderr.write("\n=== CONFIGURATION SYSTEM FAILURE ===\n");
    process.stderr.write("The unified configuration system encountered a critical error.\n");
    process.stderr.write(
      "This may indicate:\n - Invalid environment variable values\n - Missing required configuration\n - System-level environment access issues\n"
    );
    process.stderr.write("=== STARTUP BLOCKED ===\n\n");
    throw new Error(`Unified configuration system failure: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Export the comprehensive validated configuration
export { config, generateConfigHealthReport, validateConfig };
export type { Config };
export { ConfigSchema } from "./models/types";
export default config;

/**
 * BACKWARD COMPATIBILITY EXPORTS
 *
 * These exports maintain API compatibility for existing code that expects
 * telemetry configuration to be separate. This allows gradual migration
 * to the unified configuration system.
 */

// Export telemetry config section for backward compatibility
export const telemetryConfig = config.telemetry;

// Export individual sections for modular access
export const applicationConfig = config.application;
export const capellaConfig = config.capella;
export const runtimeConfig = config.runtime;
export const deploymentConfig = config.deployment;

/**
 * UTILITY FUNCTIONS
 */

// Get configuration by section
export function getConfigSection<T extends keyof Config>(section: T): Config[T] {
  return config[section];
}

// Check if running in production
export function isProduction(): boolean {
  return config.runtime.NODE_ENV === "production" || config.telemetry.DEPLOYMENT_ENVIRONMENT === "production";
}

// Get environment name
export function getEnvironment(): string {
  return config.runtime.NODE_ENV;
}

// Get deployment environment (for telemetry)
export function getDeploymentEnvironment(): string {
  return config.telemetry.DEPLOYMENT_ENVIRONMENT;
}

// Utility function for external modules to reload config (useful for testing)
export function reloadConfig(): Config {
  // This would require refactoring the config loading into a function
  // For now, we'll export the current config
  console.warn("reloadConfig() is not yet implemented - returning current config");
  return config;
}

/**
 * MIGRATION HELPERS
 *
 * These functions help migrate from fragmented configuration approach
 * to the unified system while maintaining backward compatibility.
 */

// Helper for legacy telemetry config access
export function loadTelemetryConfigFromEnv() {
  console.warn("loadTelemetryConfigFromEnv() is deprecated - use unified config.telemetry instead");
  return config.telemetry;
}

// Helper for legacy environment variable access
export function getUnifiedEnvVar(key: string): string | undefined {
  // Provide unified access to environment variables through the config system
  console.warn("Direct environment variable access detected - consider using unified config instead");
  return getEnvVar(key);
}
