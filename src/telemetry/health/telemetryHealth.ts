/* src/telemetry/health/telemetryHealth.ts */
// Updated to use export-stats-tracker per migrate pattern
// Now uses loadConfig() for 4-pillar lazy initialization pattern

import { loadConfig } from "$config";
import { getTraceExportStats, getLogExportStats, getMetricsExportStats } from "../instrumentation";
import { TelemetryCircuitBreaker } from "./CircuitBreaker";

export interface TelemetryHealthData {
  timestamp: number;
  status: "healthy" | "degraded" | "unhealthy";
  exporters: {
    traces: ExporterHealth;
    metrics: ExporterHealth;
    logs: ExporterHealth;
  };
  circuitBreaker: {
    state: string;
    isHealthy: boolean;
    successRate: number;
    canExecute: boolean;
    totalAttempts: number;
    totalFailures: number;
  };
  configuration: {
    serviceName: string;
    serviceVersion: string;
    exportTimeoutMs: number;
    batchSize: number;
    maxQueueSize: number;
  };
  runtime: {
    memoryUsageMB: number;
    uptimeMs: number;
    environment: string;
    version: string;
  };
}

export interface ExporterHealth {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  lastExportTime: string | null;
  exportCount: number;
  failureCount: number;
  successRate: string;
}

class TelemetryHealthMonitor {
  private circuitBreaker: TelemetryCircuitBreaker;

  constructor() {
    // Use unified configuration for circuit breaker (2025 standard)
    // Using loadConfig() for 4-pillar lazy initialization pattern
    const cfg = loadConfig();
    const failureThreshold = cfg.telemetry.CIRCUIT_BREAKER_THRESHOLD;
    const recoveryTimeoutMs = cfg.telemetry.CIRCUIT_BREAKER_TIMEOUT_MS;

    this.circuitBreaker = new TelemetryCircuitBreaker({
      failureThreshold,
      recoveryTimeoutMs,
      successThreshold: 3,
    });
  }

  // Deprecated: config is now loaded via loadConfig() pattern
  public setConfig(_config: any): void {
    // No-op - config is now loaded dynamically via loadConfig()
  }

  public getCircuitBreaker(): TelemetryCircuitBreaker {
    return this.circuitBreaker;
  }

  // Legacy methods for backward compatibility - now no-op since stats are tracked in export-stats-tracker
  public recordExporterSuccess(_exporterName: string): void {
    this.circuitBreaker.recordSuccess();
  }

  public recordExporterFailure(_exporterName: string, _error?: Error): void {
    this.circuitBreaker.recordFailure();
  }

  public getHealthData(): TelemetryHealthData {
    const circuitBreakerStats = this.circuitBreaker.getHealthStatus();
    const memoryUsage = process.memoryUsage();

    // Get export stats from the new export-stats-tracker
    const traceStats = getTraceExportStats();
    const metricStats = getMetricsExportStats().getStats();
    const logStats = getLogExportStats();

    // Convert stats to exporter health format
    const tracesHealth = this.statsToExporterHealth("traces", traceStats);
    const metricsHealth = this.statsToExporterHealth("metrics", metricStats);
    const logsHealth = this.statsToExporterHealth("logs", logStats);

    // Determine overall status
    const exporterStatuses = [tracesHealth.status, metricsHealth.status, logsHealth.status];
    let overallStatus: "healthy" | "degraded" | "unhealthy";

    if (exporterStatuses.every((s) => s === "healthy") && circuitBreakerStats.isHealthy) {
      overallStatus = "healthy";
    } else if (exporterStatuses.some((s) => s === "unhealthy") || !circuitBreakerStats.isHealthy) {
      overallStatus = "unhealthy";
    } else {
      overallStatus = "degraded";
    }

    // Get telemetry config using 4-pillar loadConfig() pattern
    const cfg = loadConfig();
    const telemetryCfg = cfg.telemetry;

    return {
      timestamp: Date.now(),
      status: overallStatus,
      exporters: {
        traces: tracesHealth,
        metrics: metricsHealth,
        logs: logsHealth,
      },
      circuitBreaker: {
        state: circuitBreakerStats.state,
        isHealthy: circuitBreakerStats.isHealthy,
        successRate: circuitBreakerStats.successRate,
        canExecute: circuitBreakerStats.canExecute,
        totalAttempts: this.circuitBreaker.getStats().totalAttempts,
        totalFailures: this.circuitBreaker.getStats().totalFailures,
      },
      configuration: {
        serviceName: telemetryCfg.SERVICE_NAME,
        serviceVersion: telemetryCfg.SERVICE_VERSION,
        exportTimeoutMs: telemetryCfg.EXPORT_TIMEOUT_MS,
        batchSize: telemetryCfg.BATCH_SIZE,
        maxQueueSize: telemetryCfg.MAX_QUEUE_SIZE,
      },
      runtime: {
        memoryUsageMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        uptimeMs: process.uptime() * 1000,
        environment: telemetryCfg.DEPLOYMENT_ENVIRONMENT,
        version: telemetryCfg.SERVICE_VERSION,
      },
    };
  }

  private statsToExporterHealth(name: string, stats: { successRate: string; total: number; failures: number; lastExportTime: string | null }): ExporterHealth {
    const successRateNum = parseInt(stats.successRate.replace('%', ''), 10) || 0;

    let status: "healthy" | "degraded" | "unhealthy";
    if (stats.total === 0) {
      status = "healthy"; // No exports yet, assume healthy
    } else if (successRateNum >= 95) {
      status = "healthy";
    } else if (successRateNum >= 80) {
      status = "degraded";
    } else {
      status = "unhealthy";
    }

    return {
      name,
      status,
      lastExportTime: stats.lastExportTime,
      exportCount: stats.total,
      failureCount: stats.failures,
      successRate: stats.successRate,
    };
  }
}

// Singleton instance
export const telemetryHealthMonitor = new TelemetryHealthMonitor();

// Convenience function for health endpoint
export function getTelemetryHealth(): TelemetryHealthData {
  return telemetryHealthMonitor.getHealthData();
}
