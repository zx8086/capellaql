/* src/lib/couchbase/connection-options.ts */

import { type ConnectOptions, DurabilityLevel } from "couchbase";
import { parseConnectionString } from "./config";
import type { ConnectionStringMeta, CouchbaseConfig } from "./types";

export { parseConnectionString };

export function buildConnectionOptions(config: CouchbaseConfig, meta: ConnectionStringMeta): ConnectOptions {
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

    // Transaction configuration
    transactions: {
      cleanupConfig: {
        cleanupWindow: 60000,
        disableLostAttemptCleanup: false,
      },
      durabilityLevel: DurabilityLevel.Majority,
      timeout: 15000,
    },
  };

  // WAN development mode optimizes for Capella Cloud latency
  if (meta.isCapella) {
    (options as any).configProfile = "wanDevelopment";
  }

  // TLS/Security configuration (only when using secure connection)
  if (meta.isTls) {
    options.security = {
      trustStorePath: config.trustStorePath,
    };
  }

  return options;
}

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

export function validateConnectionOptions(_options: ConnectOptions, meta: ConnectionStringMeta): string[] {
  const warnings: string[] = [];

  if (meta.isCapella && !meta.isTls) {
    warnings.push("Capella Cloud requires secure connection (couchbases://)");
  }

  return warnings;
}
