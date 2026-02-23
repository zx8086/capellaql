/* src/lib/couchbase/config.ts */

/**
 * Couchbase Configuration Module
 * Provides Zod validation and configuration loading for the Couchbase connection manager.
 * Integrates with the existing 4-pillar config system.
 */

import { z } from "zod";
import centralConfig from "$config";
import type { ConnectionStringMeta, CouchbaseConfig } from "./types";

// =============================================================================
// ZOD VALIDATION SCHEMA
// =============================================================================

/**
 * Couchbase connection configuration schema with comprehensive validation
 */
export const CouchbaseConfigSchema = z.object({
  // Connection details
  connectionString: z
    .string()
    .regex(/^couchbases?:\/\/.+/, "Must be a valid Couchbase connection string (couchbase:// or couchbases://)")
    .describe("Couchbase cluster connection URL"),

  username: z.string().min(1, "Username is required").describe("Database username"),
  password: z.string().min(1, "Password is required").describe("Database password"),
  bucketName: z.string().min(1, "Bucket name is required").describe("Default bucket name"),
  scopeName: z.string().default("_default").describe("Default scope name"),
  collectionName: z.string().default("_default").describe("Default collection name"),

  // Security
  trustStorePath: z.string().optional().describe("Path to custom TLS certificate store"),

  // Timeouts (milliseconds) - optimized for Capella Cloud
  timeouts: z
    .object({
      connectTimeout: z.number().min(1000).default(10000).describe("Connection timeout"),
      bootstrapTimeout: z.number().min(1000).default(20000).describe("Cluster bootstrap timeout"),
      resolveTimeout: z.number().min(1000).default(5000).describe("DNS resolution timeout"),
      kvTimeout: z.number().min(1000).default(7500).describe("Key-value operation timeout"),
      kvDurableTimeout: z.number().min(1000).default(15000).describe("Durable KV operation timeout"),
      queryTimeout: z.number().min(1000).default(30000).describe("N1QL query timeout"),
      analyticsTimeout: z.number().min(1000).default(60000).describe("Analytics query timeout"),
      searchTimeout: z.number().min(1000).default(30000).describe("Full-text search timeout"),
      viewTimeout: z.number().min(1000).default(30000).describe("View query timeout"),
      managementTimeout: z.number().min(1000).default(15000).describe("Management operation timeout"),
    })
    .optional()
    .describe("SDK timeout configurations"),

  // Compression settings (LOW PRIORITY optimization)
  compression: z
    .object({
      enabled: z.boolean().default(true).describe("Enable document compression"),
      minSize: z.number().min(0).default(32).describe("Minimum bytes to compress"),
      minRatio: z.number().min(0).max(1).default(0.83).describe("Minimum compression ratio"),
    })
    .optional()
    .describe("Compression configuration"),

  // Threshold logging settings (LOW PRIORITY optimization)
  thresholdLogging: z
    .object({
      enabled: z.boolean().default(true).describe("Enable threshold logging"),
      kvThreshold: z.number().min(0).default(500).describe("KV slow operation threshold (ms)"),
      queryThreshold: z.number().min(0).default(1000).describe("Query slow operation threshold (ms)"),
      analyticsThreshold: z.number().min(0).default(1000).describe("Analytics slow threshold (ms)"),
      searchThreshold: z.number().min(0).default(1000).describe("Search slow threshold (ms)"),
      interval: z.number().min(1000).default(10000).describe("Logging interval (ms)"),
    })
    .optional()
    .describe("Slow operation threshold logging"),

  // Feature flags
  features: z
    .object({
      enableObservability: z.boolean().default(false).describe("Enable OpenTelemetry integration"),
      enablePerformance: z.boolean().default(false).describe("Enable performance optimizations"),
      enableResilience: z.boolean().default(true).describe("Enable resilience features"),
    })
    .optional()
    .describe("Feature flags"),
});

// Type inference from schema
export type CouchbaseConfigInput = z.input<typeof CouchbaseConfigSchema>;
export type CouchbaseConfigParsed = z.output<typeof CouchbaseConfigSchema>;

// =============================================================================
// CONFIGURATION LOADING
// =============================================================================

/**
 * Load and validate Couchbase configuration from the central config system.
 * Integrates with the existing 4-pillar config pattern.
 */
export function loadCouchbaseConfig(): CouchbaseConfig {
  const capella = centralConfig.capella;

  const rawConfig: CouchbaseConfigInput = {
    connectionString: capella.COUCHBASE_URL,
    username: capella.COUCHBASE_USERNAME,
    password: capella.COUCHBASE_PASSWORD,
    bucketName: capella.COUCHBASE_BUCKET,
    scopeName: capella.COUCHBASE_SCOPE,
    collectionName: capella.COUCHBASE_COLLECTION,

    timeouts: {
      connectTimeout: capella.COUCHBASE_CONNECT_TIMEOUT,
      bootstrapTimeout: capella.COUCHBASE_BOOTSTRAP_TIMEOUT,
      kvTimeout: capella.COUCHBASE_KV_TIMEOUT,
      kvDurableTimeout: capella.COUCHBASE_KV_DURABLE_TIMEOUT,
      queryTimeout: capella.COUCHBASE_QUERY_TIMEOUT,
      analyticsTimeout: capella.COUCHBASE_ANALYTICS_TIMEOUT,
      searchTimeout: capella.COUCHBASE_SEARCH_TIMEOUT,
    },

    // Compression enabled by default (LOW PRIORITY optimization)
    compression: {
      enabled: true,
      minSize: 32,
      minRatio: 0.83,
    },

    // Threshold logging enabled by default (LOW PRIORITY optimization)
    thresholdLogging: {
      enabled: true,
      kvThreshold: 500,
      queryThreshold: 1000,
      analyticsThreshold: 1000,
      searchThreshold: 1000,
      interval: 10000,
    },

    // Feature flags
    features: {
      enableObservability: centralConfig.telemetry.ENABLE_OPENTELEMETRY,
      enablePerformance: true,
      enableResilience: true,
    },
  };

  try {
    return CouchbaseConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n  ");

      throw new Error(`Couchbase configuration validation failed:\n  ${errorMessages}`);
    }
    throw error;
  }
}

// =============================================================================
// PRODUCTION SECURITY VALIDATION
// =============================================================================

/**
 * Validate configuration with production-specific security checks.
 * Called after initial validation for additional production hardening.
 */
export function validateProductionConfig(config: CouchbaseConfig): void {
  const isProduction =
    centralConfig.runtime.NODE_ENV === "production" || centralConfig.telemetry.DEPLOYMENT_ENVIRONMENT === "production";

  if (!isProduction) {
    return;
  }

  const issues: string[] = [];

  // Require secure connection in production
  if (!config.connectionString.startsWith("couchbases://")) {
    issues.push("Secure connection (couchbases://) required in production");
  }

  // Warn about default credentials
  if (config.password === "password") {
    issues.push("CRITICAL: Default password not allowed in production");
  }

  if (config.username === "Administrator") {
    issues.push("WARNING: Default admin username should be changed in production");
  }

  // Check for localhost in production
  if (config.connectionString.includes("localhost") || config.connectionString.includes("127.0.0.1")) {
    issues.push("Production database cannot use localhost");
  }

  if (issues.length > 0) {
    throw new Error(`Production configuration validation failed:\n  ${issues.join("\n  ")}`);
  }
}

// =============================================================================
// CONNECTION STRING PARSING
// =============================================================================

/**
 * Parse connection string to extract metadata for connection optimization.
 * Used by connection-options.ts to configure protocol-specific settings.
 */
export function parseConnectionString(connectionString: string): ConnectionStringMeta {
  const isTls = connectionString.startsWith("couchbases://");
  const protocol = isTls ? "couchbases" : "couchbase";

  // Remove protocol
  const withoutProtocol = connectionString.replace(/^couchbases?:\/\//, "");

  // Extract hosts (before any query params)
  const hostsString = withoutProtocol.split("?")[0];
  const hosts = hostsString.split(",").map((h) => h.trim());

  // Detect Capella (cloud.couchbase.com domain)
  const isCapella = hosts.some((h) => h.includes("cloud.couchbase.com"));

  // DNS SRV uses single hostname without port
  const isDnsSrv = hosts.length === 1 && !hosts[0].includes(":");

  return {
    isTls,
    isCapella,
    isDnsSrv,
    protocol,
    hosts,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export { CouchbaseConfigSchema as ConfigSchema };
