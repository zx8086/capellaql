/* src/config/defaults.ts */
// Pillar 1: Default Configuration Object
// Aligned with migrate reference pattern

import type { Config } from "./schemas";

// Comprehensive default configuration for all sections
export const defaultConfig: Config = {
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
    SAMPLING_RATE: 0.15,
    CIRCUIT_BREAKER_THRESHOLD: 5,
    CIRCUIT_BREAKER_TIMEOUT_MS: 60000,
    // Log-level specific sampling rates (optimize cost while maintaining visibility)
    LOG_SAMPLING_DEBUG: 0.1, // 10% - reduce debug noise
    LOG_SAMPLING_INFO: 0.5, // 50% - balanced info logging
    LOG_SAMPLING_WARN: 0.9, // 90% - high warn visibility
    LOG_SAMPLING_ERROR: 1.0, // 100% - never drop errors
    // Metric sampling rates by category (2025 standard)
    METRIC_SAMPLING_BUSINESS: 1.0, // 100% - never drop business metrics
    METRIC_SAMPLING_TECHNICAL: 0.75, // 75% - most technical metrics
    METRIC_SAMPLING_INFRASTRUCTURE: 0.5, // 50% - infrastructure monitoring
    METRIC_SAMPLING_DEBUG: 0.25, // 25% - development metrics
    // Log retention policy (days) - balance compliance and cost
    LOG_RETENTION_DEBUG_DAYS: 1, // Debug logs: 1 day
    LOG_RETENTION_INFO_DAYS: 7, // Info logs: 7 days
    LOG_RETENTION_WARN_DAYS: 30, // Warning logs: 30 days
    LOG_RETENTION_ERROR_DAYS: 90, // Error logs: 90 days
  },
};
