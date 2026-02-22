/* src/services/health/couchbaseHealth.ts */
// Couchbase health check service - matches reference format exactly

import config from "$config";
import { clusterConn, getCouchbaseHealth, pingCouchbase } from "$lib/couchbaseConnector";
import { err } from "../../telemetry";
import { type CouchbaseDependency, formatResponseTime, type HealthStatus } from "./types";

// ============================================================================
// Health Check Cache (prevent overwhelming the cluster with health checks)
// ============================================================================

interface CachedHealthResult {
  result: CouchbaseDependency;
  timestamp: number;
}

let cachedHealth: CachedHealthResult | null = null;
const CACHE_TTL_MS = 2000; // 2 seconds cache

// ============================================================================
// Couchbase Health Service
// ============================================================================

export class CouchbaseHealthService {
  private static instance: CouchbaseHealthService;

  private constructor() {}

  static getInstance(): CouchbaseHealthService {
    if (!CouchbaseHealthService.instance) {
      CouchbaseHealthService.instance = new CouchbaseHealthService();
    }
    return CouchbaseHealthService.instance;
  }

  /**
   * Get Couchbase health details matching reference format exactly:
   * {
   *   status: "healthy",
   *   responseTime: "13.14ms",
   *   details: {
   *     connectionString: "couchbases://...",
   *     bucket: "bucket-name",
   *     services: { kv: true, query: true, search: true }
   *   }
   * }
   */
  async getHealth(): Promise<CouchbaseDependency> {
    const now = Date.now();

    // Return cached result if still valid
    if (cachedHealth && now - cachedHealth.timestamp < CACHE_TTL_MS) {
      return cachedHealth.result;
    }

    const startTime = performance.now();

    try {
      // Use existing getCouchbaseHealth function from couchbaseConnector
      const health = await getCouchbaseHealth();
      const responseTime = performance.now() - startTime;

      // Map status to valid HealthStatus (critical -> unhealthy)
      let status: HealthStatus = "healthy";
      if (health.status === "critical" || health.status === "unhealthy") {
        status = "unhealthy";
      } else if (health.status === "degraded") {
        status = "degraded";
      }

      const result: CouchbaseDependency = {
        status,
        responseTime: formatResponseTime(responseTime),
        details: {
          connectionString: this.maskConnectionString(config.capella.COUCHBASE_URL),
          bucket: config.capella.COUCHBASE_BUCKET,
          services: {
            kv: health.details.serviceHealth.kv?.healthy || false,
            query: health.details.serviceHealth.query?.healthy || false,
            search: health.details.serviceHealth.search?.healthy || false,
          },
        },
      };

      // Cache the result
      cachedHealth = {
        result,
        timestamp: now,
      };

      return result;
    } catch (error) {
      err("Couchbase health check failed", error);
      return this.createErrorResponse(performance.now() - startTime);
    }
  }

  /**
   * Quick ping check for readiness probes
   */
  async ping(): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    try {
      const result = await pingCouchbase();
      return {
        success: result.success,
        latencyMs: result.latency || 0,
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        latencyMs: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Test connection without full health check
   */
  async testConnection(): Promise<boolean> {
    try {
      await clusterConn();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create error response when health check fails
   */
  private createErrorResponse(responseTimeMs: number): CouchbaseDependency {
    return {
      status: "unhealthy",
      responseTime: formatResponseTime(responseTimeMs),
      details: {
        connectionString: this.maskConnectionString(config.capella.COUCHBASE_URL),
        bucket: config.capella.COUCHBASE_BUCKET,
        services: {
          kv: false,
          query: false,
          search: false,
        },
      },
    };
  }

  /**
   * Mask sensitive parts of connection string for display
   */
  private maskConnectionString(url: string): string {
    try {
      // Mask password if present in URL
      const masked = url.replace(/(:\/\/[^:]+:)[^@]+(@)/, "$1****$2");
      // Truncate if too long
      if (masked.length > 50) {
        return masked.substring(0, 47) + "...";
      }
      return masked;
    } catch {
      return "couchbase://****";
    }
  }

  /**
   * Clear health cache (useful for testing)
   */
  clearCache(): void {
    cachedHealth = null;
  }
}

// Export singleton instance
export const couchbaseHealthService = CouchbaseHealthService.getInstance();

// Export convenience functions
export async function getCouchbaseHealthDetails(): Promise<CouchbaseDependency> {
  return couchbaseHealthService.getHealth();
}

export async function pingCouchbaseForReadiness(): Promise<{
  success: boolean;
  latencyMs: number;
  error?: string;
}> {
  return couchbaseHealthService.ping();
}
