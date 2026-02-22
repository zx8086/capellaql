/* src/services/health/comprehensiveHealth.ts */
// Comprehensive health check orchestrator - matches reference format exactly

import config from "$config";
import { err } from "../../telemetry";
import { couchbaseHealthService } from "./couchbaseHealth";
import { cacheHealthService } from "./cacheHealth";
import { telemetryHealthService } from "./telemetryHealth";
import {
  type CircuitBreakerState,
  formatUptime,
  type HealthCheckResponse,
  type HealthStatus,
  type LivenessCheckResponse,
  type ReadinessCheckResponse,
} from "./types";

// ============================================================================
// Server Start Time (for uptime calculation)
// ============================================================================

const serverStartTime = Date.now();

// ============================================================================
// Comprehensive Health Service
// ============================================================================

export class ComprehensiveHealthService {
  private static instance: ComprehensiveHealthService;

  private constructor() {}

  static getInstance(): ComprehensiveHealthService {
    if (!ComprehensiveHealthService.instance) {
      ComprehensiveHealthService.instance = new ComprehensiveHealthService();
    }
    return ComprehensiveHealthService.instance;
  }

  /**
   * Get comprehensive health check response matching reference format exactly:
   * {
   *   status: "healthy",
   *   timestamp: "2026-02-22T21:32:46.675Z",
   *   version: "2.6.4",
   *   environment: "local",
   *   uptime: "10s",
   *   highAvailability: true,
   *   circuitBreakerState: "closed",
   *   dependencies: {
   *     couchbase: { status, responseTime, details },
   *     cache: { type, connection, entries, performance, healthMonitor },
   *     telemetry: { traces, metrics, logs }
   *   },
   *   requestId: "..."
   * }
   */
  async getHealth(requestId: string): Promise<HealthCheckResponse> {
    try {
      // Fetch all dependency health in parallel
      const [couchbaseHealth, cacheHealth, telemetryHealth] = await Promise.all([
        couchbaseHealthService.getHealth(),
        cacheHealthService.getHealth(),
        telemetryHealthService.getHealth(),
      ]);

      // Determine overall status based on dependencies
      const overallStatus = this.determineOverallStatus(
        couchbaseHealth.status,
        cacheHealth.healthMonitor.status,
        telemetryHealth.traces.status,
        telemetryHealth.metrics.status,
        telemetryHealth.logs.status
      );

      // Determine circuit breaker state based on Couchbase health
      const circuitBreakerState: CircuitBreakerState =
        couchbaseHealth.status === "unhealthy" ? "open" : "closed";

      // Check high availability (all critical services healthy)
      const highAvailability =
        couchbaseHealth.status === "healthy" &&
        couchbaseHealth.details.services.kv &&
        couchbaseHealth.details.services.query;

      const uptimeSeconds = (Date.now() - serverStartTime) / 1000;

      return {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        version: config.telemetry.SERVICE_VERSION,
        environment: config.telemetry.DEPLOYMENT_ENVIRONMENT,
        uptime: formatUptime(uptimeSeconds),
        highAvailability,
        circuitBreakerState,
        dependencies: {
          couchbase: couchbaseHealth,
          cache: cacheHealth,
          telemetry: telemetryHealth,
        },
        requestId,
      };
    } catch (error) {
      err("Comprehensive health check failed", error);
      return this.createErrorResponse(requestId, error);
    }
  }

  /**
   * Get readiness check response
   * Used by Kubernetes/container orchestrators
   */
  async getReadiness(requestId: string): Promise<ReadinessCheckResponse> {
    const checks: ReadinessCheckResponse["checks"] = {
      couchbase: { ready: false },
      cache: { ready: false },
      telemetry: { ready: false },
    };

    try {
      // Check Couchbase readiness
      const couchbasePing = await couchbaseHealthService.ping();
      checks.couchbase = {
        ready: couchbasePing.success,
        latency: couchbasePing.latencyMs ? `${couchbasePing.latencyMs.toFixed(2)}ms` : undefined,
        error: couchbasePing.error,
      };
    } catch (error) {
      checks.couchbase = {
        ready: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    try {
      // Check cache readiness
      const cacheReady = await cacheHealthService.isReady();
      checks.cache = { ready: cacheReady };
    } catch (error) {
      checks.cache = {
        ready: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    try {
      // Check telemetry readiness
      const telemetryReady = telemetryHealthService.isReady();
      checks.telemetry = { ready: telemetryReady };
    } catch (error) {
      checks.telemetry = {
        ready: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // Overall ready if Couchbase is ready (primary dependency)
    const ready = checks.couchbase.ready;

    return {
      ready,
      timestamp: new Date().toISOString(),
      checks,
      requestId,
    };
  }

  /**
   * Get liveness check response
   * Simple check that the process is alive
   */
  getLiveness(requestId: string): LivenessCheckResponse {
    const memoryUsage = process.memoryUsage();
    const uptimeSeconds = (Date.now() - serverStartTime) / 1000;

    const usedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    const totalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
    const percentUsed = totalMB > 0 ? ((usedMB / totalMB) * 100).toFixed(1) : "0.0";

    return {
      alive: true,
      timestamp: new Date().toISOString(),
      uptime: formatUptime(uptimeSeconds),
      memory: {
        usedMB,
        totalMB,
        percentUsed: `${percentUsed}%`,
      },
      requestId,
    };
  }

  /**
   * Determine overall health status from component statuses
   */
  private determineOverallStatus(...statuses: HealthStatus[]): HealthStatus {
    // If any unhealthy, overall is unhealthy
    if (statuses.includes("unhealthy")) {
      return "unhealthy";
    }

    // If any degraded, overall is degraded
    if (statuses.includes("degraded")) {
      return "degraded";
    }

    // All healthy
    return "healthy";
  }

  /**
   * Create error response when health check fails completely
   */
  private createErrorResponse(requestId: string, _error: unknown): HealthCheckResponse {
    const uptimeSeconds = (Date.now() - serverStartTime) / 1000;

    return {
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      version: config.telemetry.SERVICE_VERSION,
      environment: config.telemetry.DEPLOYMENT_ENVIRONMENT,
      uptime: formatUptime(uptimeSeconds),
      highAvailability: false,
      circuitBreakerState: "open",
      dependencies: {
        couchbase: {
          status: "unhealthy",
          responseTime: "N/A",
          details: {
            connectionString: "N/A",
            bucket: config.capella.COUCHBASE_BUCKET,
            services: {
              kv: false,
              query: false,
              search: false,
            },
          },
        },
        cache: {
          type: typeof Bun !== "undefined" ? "sqlite" : "map",
          connection: {
            connected: false,
            responseTime: "N/A",
          },
          entries: {
            primary: 0,
            primaryActive: 0,
            stale: 0,
            staleCacheAvailable: false,
          },
          performance: {
            hitRate: "0.00%",
            avgLatencyMs: 0,
          },
          healthMonitor: {
            status: "unhealthy",
            isMonitoring: false,
            consecutiveSuccesses: 0,
            consecutiveFailures: 1,
            lastStatusChange: new Date().toISOString(),
            lastCheck: null,
          },
        },
        telemetry: {
          traces: {
            status: "unhealthy",
            endpoint: "unknown",
            responseTime: "N/A",
            exports: {
              successRate: "0%",
              total: 0,
              failures: 0,
              lastExportTime: null,
              lastFailureTime: null,
              recentErrors: ["Health check failed"],
            },
          },
          metrics: {
            status: "unhealthy",
            endpoint: "unknown",
            responseTime: "N/A",
            exports: {
              successRate: "0%",
              total: 0,
              failures: 0,
              lastExportTime: null,
              lastFailureTime: null,
              recentErrors: [],
            },
          },
          logs: {
            status: "unhealthy",
            endpoint: "unknown",
            responseTime: "N/A",
            exports: {
              successRate: "0%",
              total: 0,
              failures: 0,
              lastExportTime: null,
              lastFailureTime: null,
              recentErrors: [],
            },
          },
        },
      },
      requestId,
    };
  }

  /**
   * Get server uptime in seconds
   */
  getUptimeSeconds(): number {
    return (Date.now() - serverStartTime) / 1000;
  }
}

// Export singleton instance
export const comprehensiveHealthService = ComprehensiveHealthService.getInstance();

// Export convenience functions
export async function getComprehensiveHealth(requestId: string): Promise<HealthCheckResponse> {
  return comprehensiveHealthService.getHealth(requestId);
}

export async function getReadinessCheck(requestId: string): Promise<ReadinessCheckResponse> {
  return comprehensiveHealthService.getReadiness(requestId);
}

export function getLivenessCheck(requestId: string): LivenessCheckResponse {
  return comprehensiveHealthService.getLiveness(requestId);
}
