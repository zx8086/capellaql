/* src/services/health/telemetryHealth.ts */
// Telemetry health check service - matches reference format exactly

import { loadConfig } from "$config";
import { err } from "../../telemetry";
import {
  getLogExportStats,
  getMetricsExportStats,
  getTraceExportStats,
  isTelemetryInitialized,
} from "../../telemetry/instrumentation";
import {
  formatResponseTime,
  type HealthStatus,
  type TelemetryHealthDetails,
  type TelemetrySignalHealth,
} from "./types";

// ============================================================================
// Telemetry Health Service
// ============================================================================

export class TelemetryHealthService {
  private static instance: TelemetryHealthService;
  private lastHealthCheck?: TelemetryHealthDetails;
  private lastCheckTime = 0;
  private readonly CACHE_TTL_MS = 2000; // 2 seconds cache

  private constructor() {}

  static getInstance(): TelemetryHealthService {
    if (!TelemetryHealthService.instance) {
      TelemetryHealthService.instance = new TelemetryHealthService();
    }
    return TelemetryHealthService.instance;
  }

  /**
   * Get telemetry health details matching reference format exactly:
   * {
   *   traces: { status: "healthy", endpoint: "...", responseTime: "...", exports: {...} },
   *   metrics: { ... },
   *   logs: { ... }
   * }
   */
  async getHealth(): Promise<TelemetryHealthDetails> {
    const now = Date.now();

    // Return cached result if still valid
    if (this.lastHealthCheck && now - this.lastCheckTime < this.CACHE_TTL_MS) {
      return this.lastHealthCheck;
    }

    try {
      const cfg = loadConfig();
      const telemetryCfg = cfg.telemetry;

      // Check if telemetry is initialized
      const isInitialized = isTelemetryInitialized();

      // Get signal health in parallel
      const [tracesHealth, metricsHealth, logsHealth] = await Promise.all([
        this.checkSignalHealth("traces", telemetryCfg.TRACES_ENDPOINT, getTraceExportStats),
        this.checkSignalHealth("metrics", telemetryCfg.METRICS_ENDPOINT, () => getMetricsExportStats().getStats()),
        this.checkSignalHealth("logs", telemetryCfg.LOGS_ENDPOINT, getLogExportStats),
      ]);

      const result: TelemetryHealthDetails = {
        traces: tracesHealth,
        metrics: metricsHealth,
        logs: logsHealth,
      };

      // If telemetry not initialized, mark all as degraded
      if (!isInitialized) {
        result.traces.status = "degraded";
        result.metrics.status = "degraded";
        result.logs.status = "degraded";
      }

      this.lastHealthCheck = result;
      this.lastCheckTime = now;

      return result;
    } catch (error) {
      err("Telemetry health check failed", error);
      return this.createErrorResponse();
    }
  }

  /**
   * Check health of a specific telemetry signal
   */
  private async checkSignalHealth(
    _signal: string,
    endpoint: string,
    getStats: () => {
      successRate: string;
      total: number;
      failures: number;
      lastExportTime: string | null;
      lastFailureTime?: string | null;
      recentErrors: readonly string[] | string[];
    }
  ): Promise<TelemetrySignalHealth> {
    const startTime = performance.now();

    try {
      const stats = getStats();
      const responseTime = performance.now() - startTime;

      // Parse success rate
      const successRateNum = parseFloat(stats.successRate.replace("%", "")) || 0;

      // Determine status based on success rate
      // If no exports yet (total === 0), consider healthy (nothing has failed)
      let status: HealthStatus = "healthy";
      if (stats.total === 0) {
        status = "healthy"; // No exports yet - not unhealthy
      } else if (successRateNum < 80) {
        status = "unhealthy";
      } else if (successRateNum < 95) {
        status = "degraded";
      }

      return {
        status,
        endpoint: this.maskEndpoint(endpoint),
        responseTime: formatResponseTime(responseTime),
        exports: {
          successRate: stats.successRate,
          total: stats.total,
          failures: stats.failures,
          lastExportTime: stats.lastExportTime,
          lastFailureTime: stats.lastFailureTime || null,
          recentErrors: [...stats.recentErrors].slice(-5), // Last 5 errors
        },
      };
    } catch (error) {
      const responseTime = performance.now() - startTime;
      return {
        status: "unhealthy",
        endpoint: this.maskEndpoint(endpoint),
        responseTime: formatResponseTime(responseTime),
        exports: {
          successRate: "0%",
          total: 0,
          failures: 0,
          lastExportTime: null,
          lastFailureTime: null,
          recentErrors: [error instanceof Error ? error.message : String(error)],
        },
      };
    }
  }

  /**
   * Create error response when health check fails completely
   */
  private createErrorResponse(): TelemetryHealthDetails {
    const cfg = loadConfig();
    const telemetryCfg = cfg.telemetry;

    const errorSignal: TelemetrySignalHealth = {
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
    };

    return {
      traces: { ...errorSignal, endpoint: this.maskEndpoint(telemetryCfg.TRACES_ENDPOINT) },
      metrics: { ...errorSignal, endpoint: this.maskEndpoint(telemetryCfg.METRICS_ENDPOINT) },
      logs: { ...errorSignal, endpoint: this.maskEndpoint(telemetryCfg.LOGS_ENDPOINT) },
    };
  }

  /**
   * Mask sensitive parts of endpoint URL
   */
  private maskEndpoint(url: string): string {
    try {
      const parsedUrl = new URL(url);
      // Mask any auth in URL
      if (parsedUrl.password) {
        parsedUrl.password = "****";
      }
      return parsedUrl.toString();
    } catch {
      return url;
    }
  }

  /**
   * Check if telemetry is ready (for readiness probes)
   */
  isReady(): boolean {
    return isTelemetryInitialized();
  }

  /**
   * Clear health check cache (for testing)
   */
  clearCache(): void {
    this.lastHealthCheck = undefined;
    this.lastCheckTime = 0;
  }
}

// Export singleton instance
export const telemetryHealthService = TelemetryHealthService.getInstance();

// Export convenience functions
export async function getTelemetryHealthDetails(): Promise<TelemetryHealthDetails> {
  return telemetryHealthService.getHealth();
}

export function isTelemetryReady(): boolean {
  return telemetryHealthService.isReady();
}
