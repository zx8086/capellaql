/* src/config/envMapping.ts */
// Pillar 2: Environment Variable Mapping
// Per 4-pillar pattern: Single source of truth for env var names and types
// The loader walks this mapping — env var names are never hardcoded elsewhere

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Type coercion hint for environment variable values.
 * All env vars are strings at runtime; this tells the loader how to convert them.
 */
export type EnvVarType = "string" | "number" | "boolean" | "array";

export interface EnvVarEntry {
  envVar: string;
  type: EnvVarType;
}

// =============================================================================
// ENVIRONMENT VARIABLE MAPPING
// =============================================================================

/**
 * Environment variable mapping.
 *
 * This is the SINGLE SOURCE OF TRUTH for which env vars map to which config keys.
 * The loader walks this structure — env var names are never hardcoded elsewhere.
 *
 * Per 4-pillar pattern principle #2:
 * "Every env var is explicitly mapped"
 */
export const envVarMapping = {
  application: {
    LOG_LEVEL: { envVar: "LOG_LEVEL", type: "string" },
    YOGA_RESPONSE_CACHE_TTL: { envVar: "YOGA_RESPONSE_CACHE_TTL", type: "number" },
    PORT: { envVar: "PORT", type: "number" },
    ALLOWED_ORIGINS: { envVar: "ALLOWED_ORIGINS", type: "array" },
    BASE_URL: { envVar: "BASE_URL", type: "string" },
  },

  capella: {
    COUCHBASE_URL: { envVar: "COUCHBASE_URL", type: "string" },
    COUCHBASE_USERNAME: { envVar: "COUCHBASE_USERNAME", type: "string" },
    COUCHBASE_PASSWORD: { envVar: "COUCHBASE_PASSWORD", type: "string" },
    COUCHBASE_BUCKET: { envVar: "COUCHBASE_BUCKET", type: "string" },
    COUCHBASE_SCOPE: { envVar: "COUCHBASE_SCOPE", type: "string" },
    COUCHBASE_COLLECTION: { envVar: "COUCHBASE_COLLECTION", type: "string" },
    COUCHBASE_KV_TIMEOUT: { envVar: "COUCHBASE_KV_TIMEOUT", type: "number" },
    COUCHBASE_KV_DURABLE_TIMEOUT: { envVar: "COUCHBASE_KV_DURABLE_TIMEOUT", type: "number" },
    COUCHBASE_QUERY_TIMEOUT: { envVar: "COUCHBASE_QUERY_TIMEOUT", type: "number" },
    COUCHBASE_ANALYTICS_TIMEOUT: { envVar: "COUCHBASE_ANALYTICS_TIMEOUT", type: "number" },
    COUCHBASE_SEARCH_TIMEOUT: { envVar: "COUCHBASE_SEARCH_TIMEOUT", type: "number" },
    COUCHBASE_CONNECT_TIMEOUT: { envVar: "COUCHBASE_CONNECT_TIMEOUT", type: "number" },
    COUCHBASE_BOOTSTRAP_TIMEOUT: { envVar: "COUCHBASE_BOOTSTRAP_TIMEOUT", type: "number" },
  },

  runtime: {
    NODE_ENV: { envVar: "NODE_ENV", type: "string" },
    CN_ROOT: { envVar: "CN_ROOT", type: "string" },
    CN_CXXCBC_CACHE_DIR: { envVar: "CN_CXXCBC_CACHE_DIR", type: "string" },
    SOURCE_MAP_SUPPORT: { envVar: "SOURCE_MAP_SUPPORT", type: "boolean" },
    PRESERVE_SOURCE_MAPS: { envVar: "PRESERVE_SOURCE_MAPS", type: "boolean" },
    BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS: { envVar: "BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS", type: "number" },
  },

  deployment: {
    BASE_URL: { envVar: "BASE_URL", type: "string" },
    HOSTNAME: { envVar: "HOSTNAME", type: "string" },
    INSTANCE_ID: { envVar: "INSTANCE_ID", type: "string" },
    CONTAINER_ID: { envVar: "CONTAINER_ID", type: "string" },
    K8S_POD_NAME: { envVar: "K8S_POD_NAME", type: "string" },
    K8S_NAMESPACE: { envVar: "K8S_NAMESPACE", type: "string" },
  },

  telemetry: {
    // Core telemetry settings
    ENABLE_OPENTELEMETRY: { envVar: "ENABLE_OPENTELEMETRY", type: "boolean" },
    SERVICE_NAME: { envVar: "OTEL_SERVICE_NAME", type: "string" }, // Standard OTEL env var
    SERVICE_VERSION: { envVar: "OTEL_SERVICE_VERSION", type: "string" }, // Standard OTEL env var
    DEPLOYMENT_ENVIRONMENT: { envVar: "DEPLOYMENT_ENVIRONMENT", type: "string" },

    // Standard OTEL exporter endpoint environment variables
    OTLP_ENDPOINT: { envVar: "OTEL_EXPORTER_OTLP_ENDPOINT", type: "string" }, // Base endpoint (fallback)
    TRACES_ENDPOINT: { envVar: "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", type: "string" },
    METRICS_ENDPOINT: { envVar: "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", type: "string" },
    LOGS_ENDPOINT: { envVar: "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT", type: "string" },

    // Interval settings
    METRIC_READER_INTERVAL: { envVar: "METRIC_READER_INTERVAL", type: "number" },
    SUMMARY_LOG_INTERVAL: { envVar: "SUMMARY_LOG_INTERVAL", type: "number" },

    // Export settings (2025 compliance)
    EXPORT_TIMEOUT_MS: { envVar: "EXPORT_TIMEOUT_MS", type: "number" },
    BATCH_SIZE: { envVar: "BATCH_SIZE", type: "number" },
    MAX_QUEUE_SIZE: { envVar: "MAX_QUEUE_SIZE", type: "number" },

    // Circuit breaker settings
    CIRCUIT_BREAKER_THRESHOLD: { envVar: "CIRCUIT_BREAKER_THRESHOLD", type: "number" },
    CIRCUIT_BREAKER_TIMEOUT_MS: { envVar: "CIRCUIT_BREAKER_TIMEOUT_MS", type: "number" },

    // Log retention policy
    LOG_RETENTION_DEBUG_DAYS: { envVar: "LOG_RETENTION_DEBUG_DAYS", type: "number" },
    LOG_RETENTION_INFO_DAYS: { envVar: "LOG_RETENTION_INFO_DAYS", type: "number" },
    LOG_RETENTION_WARN_DAYS: { envVar: "LOG_RETENTION_WARN_DAYS", type: "number" },
    LOG_RETENTION_ERROR_DAYS: { envVar: "LOG_RETENTION_ERROR_DAYS", type: "number" },
  },
} as const satisfies Record<string, Record<string, EnvVarEntry>>;

export type EnvVarMapping = typeof envVarMapping;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get the environment variable name for a given config path.
 * Used for error reporting to show which env var caused the issue.
 */
export function getEnvVarForPath(configPath: string): string | undefined {
  const [section, key] = configPath.split(".");
  if (!section || !key) return undefined;

  const sectionMapping = envVarMapping[section as keyof EnvVarMapping];
  if (!sectionMapping) return undefined;

  const entry = sectionMapping[key as keyof typeof sectionMapping];
  if (!entry) return undefined;

  return entry.envVar;
}

// Backward compatibility alias
export const getEnvVarPath = getEnvVarForPath;
