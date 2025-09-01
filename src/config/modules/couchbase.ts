// Couchbase configuration module
import { z } from "zod";
import type { CapellaConfig } from "../base";
import { getEnvVar, parseEnvVar } from "../utils/env-parser";

// Environment variable mapping for couchbase section
export const couchbaseEnvMapping = {
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
} as const;

// Couchbase configuration defaults
export const couchbaseDefaults: CapellaConfig = {
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
};

// Zod schema for Couchbase configuration
export const CouchbaseConfigSchema = z.object({
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

// Load Couchbase configuration from environment variables
export function loadCouchbaseConfigFromEnv(): CapellaConfig {
  return {
    COUCHBASE_URL:
      (parseEnvVar(getEnvVar(couchbaseEnvMapping.COUCHBASE_URL), "string", "COUCHBASE_URL") as string) ||
      couchbaseDefaults.COUCHBASE_URL,

    COUCHBASE_USERNAME:
      (parseEnvVar(getEnvVar(couchbaseEnvMapping.COUCHBASE_USERNAME), "string", "COUCHBASE_USERNAME") as string) ||
      couchbaseDefaults.COUCHBASE_USERNAME,

    COUCHBASE_PASSWORD:
      (parseEnvVar(getEnvVar(couchbaseEnvMapping.COUCHBASE_PASSWORD), "string", "COUCHBASE_PASSWORD") as string) ||
      couchbaseDefaults.COUCHBASE_PASSWORD,

    COUCHBASE_BUCKET:
      (parseEnvVar(getEnvVar(couchbaseEnvMapping.COUCHBASE_BUCKET), "string", "COUCHBASE_BUCKET") as string) ||
      couchbaseDefaults.COUCHBASE_BUCKET,

    COUCHBASE_SCOPE:
      (parseEnvVar(getEnvVar(couchbaseEnvMapping.COUCHBASE_SCOPE), "string", "COUCHBASE_SCOPE") as string) ||
      couchbaseDefaults.COUCHBASE_SCOPE,

    COUCHBASE_COLLECTION:
      (parseEnvVar(getEnvVar(couchbaseEnvMapping.COUCHBASE_COLLECTION), "string", "COUCHBASE_COLLECTION") as string) ||
      couchbaseDefaults.COUCHBASE_COLLECTION,

    // SDK timeout configurations
    COUCHBASE_KV_TIMEOUT:
      (parseEnvVar(getEnvVar(couchbaseEnvMapping.COUCHBASE_KV_TIMEOUT), "number", "COUCHBASE_KV_TIMEOUT") as number) ||
      couchbaseDefaults.COUCHBASE_KV_TIMEOUT,

    COUCHBASE_KV_DURABLE_TIMEOUT:
      (parseEnvVar(
        getEnvVar(couchbaseEnvMapping.COUCHBASE_KV_DURABLE_TIMEOUT),
        "number",
        "COUCHBASE_KV_DURABLE_TIMEOUT"
      ) as number) || couchbaseDefaults.COUCHBASE_KV_DURABLE_TIMEOUT,

    COUCHBASE_QUERY_TIMEOUT:
      (parseEnvVar(
        getEnvVar(couchbaseEnvMapping.COUCHBASE_QUERY_TIMEOUT),
        "number",
        "COUCHBASE_QUERY_TIMEOUT"
      ) as number) || couchbaseDefaults.COUCHBASE_QUERY_TIMEOUT,

    COUCHBASE_ANALYTICS_TIMEOUT:
      (parseEnvVar(
        getEnvVar(couchbaseEnvMapping.COUCHBASE_ANALYTICS_TIMEOUT),
        "number",
        "COUCHBASE_ANALYTICS_TIMEOUT"
      ) as number) || couchbaseDefaults.COUCHBASE_ANALYTICS_TIMEOUT,

    COUCHBASE_SEARCH_TIMEOUT:
      (parseEnvVar(
        getEnvVar(couchbaseEnvMapping.COUCHBASE_SEARCH_TIMEOUT),
        "number",
        "COUCHBASE_SEARCH_TIMEOUT"
      ) as number) || couchbaseDefaults.COUCHBASE_SEARCH_TIMEOUT,

    COUCHBASE_CONNECT_TIMEOUT:
      (parseEnvVar(
        getEnvVar(couchbaseEnvMapping.COUCHBASE_CONNECT_TIMEOUT),
        "number",
        "COUCHBASE_CONNECT_TIMEOUT"
      ) as number) || couchbaseDefaults.COUCHBASE_CONNECT_TIMEOUT,

    COUCHBASE_BOOTSTRAP_TIMEOUT:
      (parseEnvVar(
        getEnvVar(couchbaseEnvMapping.COUCHBASE_BOOTSTRAP_TIMEOUT),
        "number",
        "COUCHBASE_BOOTSTRAP_TIMEOUT"
      ) as number) || couchbaseDefaults.COUCHBASE_BOOTSTRAP_TIMEOUT,
  };
}

// Domain-specific validation for Couchbase configuration
export function validateCouchbaseConfig(config: CapellaConfig, isProduction: boolean): string[] {
  const warnings: string[] = [];

  // Production-specific security checks
  if (isProduction) {
    if (config.COUCHBASE_PASSWORD === "password") {
      warnings.push("CRITICAL: Using default password in production - security risk");
    }

    if (config.COUCHBASE_USERNAME === "Administrator") {
      warnings.push("Using default Administrator username in production is not recommended");
    }
  }

  // Validate timeout relationships
  if (config.COUCHBASE_KV_TIMEOUT > config.COUCHBASE_QUERY_TIMEOUT) {
    warnings.push("KV timeout should not exceed query timeout for optimal performance");
  }

  if (config.COUCHBASE_CONNECT_TIMEOUT > config.COUCHBASE_BOOTSTRAP_TIMEOUT) {
    warnings.push("Connect timeout should not exceed bootstrap timeout");
  }

  return warnings;
}

// Environment variable path mapping for error reporting
export function getCouchbaseEnvVarPath(configPath: string): string | undefined {
  const mapping: Record<string, string> = {
    "capella.COUCHBASE_URL": "COUCHBASE_URL",
    "capella.COUCHBASE_USERNAME": "COUCHBASE_USERNAME",
    "capella.COUCHBASE_PASSWORD": "COUCHBASE_PASSWORD",
    "capella.COUCHBASE_BUCKET": "COUCHBASE_BUCKET",
    "capella.COUCHBASE_SCOPE": "COUCHBASE_SCOPE",
    "capella.COUCHBASE_COLLECTION": "COUCHBASE_COLLECTION",
    "capella.COUCHBASE_KV_TIMEOUT": "COUCHBASE_KV_TIMEOUT",
    "capella.COUCHBASE_KV_DURABLE_TIMEOUT": "COUCHBASE_KV_DURABLE_TIMEOUT",
    "capella.COUCHBASE_QUERY_TIMEOUT": "COUCHBASE_QUERY_TIMEOUT",
    "capella.COUCHBASE_ANALYTICS_TIMEOUT": "COUCHBASE_ANALYTICS_TIMEOUT",
    "capella.COUCHBASE_SEARCH_TIMEOUT": "COUCHBASE_SEARCH_TIMEOUT",
    "capella.COUCHBASE_CONNECT_TIMEOUT": "COUCHBASE_CONNECT_TIMEOUT",
    "capella.COUCHBASE_BOOTSTRAP_TIMEOUT": "COUCHBASE_BOOTSTRAP_TIMEOUT",
  };
  return mapping[configPath];
}
