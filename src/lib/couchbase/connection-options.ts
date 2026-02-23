/* src/lib/couchbase/connection-options.ts */

/**
 * Connection Options Builder
 * Constructs production-grade Couchbase ConnectOptions with ALL SDK best practices.
 *
 * LOW PRIORITY FIXES INTEGRATED:
 * - Compression (saves bandwidth)
 * - Threshold logging (slow operation detection)
 * - Orphan response logging (diagnostics)
 * - WAN development profile (Capella Cloud)
 * - DNS SRV support detection
 */

import type { ConnectOptions } from "couchbase";
import centralConfig from "$config";
import type { CouchbaseConfig, ConnectionStringMeta } from "./types";
import { parseConnectionString } from "./config";

// Re-export parseConnectionString for convenience
export { parseConnectionString };

/**
 * Build production-grade connection options with ALL SDK optimizations.
 *
 * @param config - Validated Couchbase configuration
 * @param meta - Connection string metadata (from parseConnectionString)
 * @returns ConnectOptions optimized for the connection type
 */
export function buildConnectionOptions(
  config: CouchbaseConfig,
  meta: ConnectionStringMeta
): ConnectOptions {
  const isDevelopment = centralConfig.runtime.NODE_ENV !== "production";

  const options: ConnectOptions = {
    // Authentication
    username: config.username,
    password: config.password,

    // Timeouts (Capella Cloud optimized)
    timeouts: {
      connectTimeout: config.timeouts?.connectTimeout || 10000,
      bootstrapTimeout: config.timeouts?.bootstrapTimeout || 20000,
      resolveTimeout: config.timeouts?.resolveTimeout || 5000,
      kvTimeout: config.timeouts?.kvTimeout || 7500,
      kvDurableTimeout: config.timeouts?.kvDurableTimeout || 15000,
      queryTimeout: config.timeouts?.queryTimeout || 30000,
      analyticsTimeout: config.timeouts?.analyticsTimeout || 60000,
      searchTimeout: config.timeouts?.searchTimeout || 30000,
      viewTimeout: config.timeouts?.viewTimeout || 30000,
      managementTimeout: config.timeouts?.managementTimeout || 15000,
    },

    // LOW PRIORITY FIX: Compression (saves bandwidth, especially for Capella)
    compression: {
      enabled: config.compression?.enabled ?? true,
      minSize: config.compression?.minSize ?? 32, // Compress documents > 32 bytes
      minRatio: config.compression?.minRatio ?? 0.83, // Only compress if achieves 17%+ reduction
    },

    // LOW PRIORITY FIX: Orphan response logging (diagnostics for lost responses)
    orphanResponseLogging: {
      enabled: true,
      sampleSize: 10,
      interval: 10000, // Every 10 seconds
    },

    // LOW PRIORITY FIX: Threshold logging (slow operation detection)
    thresholdLogging: {
      enabled: config.thresholdLogging?.enabled ?? true,
      sampleSize: 10,
      interval: config.thresholdLogging?.interval ?? 10000,
      kvThreshold: config.thresholdLogging?.kvThreshold ?? 500, // Warn if KV ops > 500ms
      queryThreshold: config.thresholdLogging?.queryThreshold ?? 1000, // Warn if queries > 1s
      analyticsThreshold: config.thresholdLogging?.analyticsThreshold ?? 1000,
      searchThreshold: config.thresholdLogging?.searchThreshold ?? 1000,
      viewThreshold: 1000,
    },

    // Transaction configuration
    transactions: {
      cleanupConfig: {
        cleanupWindow: 60000,
        cleanupLostAttempts: true,
      },
      durabilityLevel: "majority",
      timeout: 15000,
    },
  };

  // LOW PRIORITY FIX: For Capella Cloud - WAN development mode optimizes for latency
  if (meta.isCapella) {
    (options as any).configProfile = "wanDevelopment";
  }

  // TLS/Security configuration (only when using secure connection)
  if (meta.isTls) {
    options.security = {
      // For Capella: trust system CA store (no custom certs needed)
      trustOnlyCertificates: meta.isCapella ? undefined : [],

      // For custom certificates (on-premise deployments)
      trustStorePath: config.trustStorePath,

      // Disable certificate verification (DEV ONLY - never in production)
      disableCertificateVerification: isDevelopment && !meta.isCapella,
    };
  }

  return options;
}

/**
 * Get optimized timeouts based on connection type.
 * Capella Cloud connections may need longer timeouts due to WAN latency.
 */
export function getOptimizedTimeouts(meta: ConnectionStringMeta): {
  connectTimeout: number;
  bootstrapTimeout: number;
  kvTimeout: number;
  queryTimeout: number;
} {
  if (meta.isCapella) {
    // Capella Cloud - account for WAN latency
    return {
      connectTimeout: 15000,
      bootstrapTimeout: 25000,
      kvTimeout: 10000,
      queryTimeout: 45000,
    };
  }

  // Local/on-premise - can use tighter timeouts
  return {
    connectTimeout: 10000,
    bootstrapTimeout: 20000,
    kvTimeout: 7500,
    queryTimeout: 30000,
  };
}

/**
 * Validate that connection options are suitable for production.
 */
export function validateConnectionOptions(
  options: ConnectOptions,
  meta: ConnectionStringMeta
): string[] {
  const warnings: string[] = [];

  // Check for disabled security in production
  if (
    centralConfig.runtime.NODE_ENV === "production" &&
    options.security?.disableCertificateVerification
  ) {
    warnings.push("Certificate verification is disabled in production - security risk");
  }

  // Check for missing TLS on Capella
  if (meta.isCapella && !meta.isTls) {
    warnings.push("Capella Cloud requires secure connection (couchbases://)");
  }

  // Check compression settings
  if (!options.compression?.enabled) {
    warnings.push("Compression is disabled - may increase bandwidth costs for Capella");
  }

  return warnings;
}
