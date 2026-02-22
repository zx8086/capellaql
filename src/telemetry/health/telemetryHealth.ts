/* src/telemetry/health/telemetryHealth.ts */
// Telemetry health monitoring per monitoring-updated.md lines 1351-1527
// Now uses loadConfig() for 4-pillar lazy initialization pattern

import { loadConfig } from "$config";
import { getTraceExportStats, getLogExportStats, getMetricsExportStats, isTelemetryInitialized } from "../instrumentation";
import { getAvailableMetricNames, INSTRUMENT_COUNT } from "../metrics/instruments";
import { CircuitBreakerState, TelemetryCircuitBreaker } from "./CircuitBreaker";

// ============================================================================
// Types per monitoring-updated.md lines 1363-1420
// ============================================================================

export interface CircuitBreakerStats {
  state: "closed" | "open" | "half-open";
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  totalRequests: number;
  rejectedRequests: number;
  lastStateChange: number;
}

export interface ExportStats {
  successRate: string;
  total: number;
  failures: number;
  lastExportTime: string | null;
  lastSuccessTime: string | null;
  lastFailureTime: string | null;
  recentErrors: string[];
}

export interface TelemetryHealthStatus {
  overall: "healthy" | "degraded" | "critical";
  timestamp: string;
  components: {
    initialization: {
      status: "healthy" | "failed";
      initialized: boolean;
      initializationTime?: string;
    };
    exports: {
      status: "healthy" | "degraded" | "critical";
      stats: {
        totalExports: number;
        successCount: number;
        failureCount: number;
        successRate: number;
        lastExportTime: string | null;
        lastSuccessTime: string | null;
        lastFailureTime: string | null;
        recentErrors: string[];
      };
    };
    circuitBreakers: {
      status: "healthy" | "degraded" | "critical";
      summary: {
        total: number;
        closed: number;
        open: number;
        halfOpen: number;
      };
      details: Record<string, CircuitBreakerStats>;
    };
    metrics: {
      status: "healthy" | "degraded";
      instrumentCount: number;
      availableMetrics: string[];
    };
    configuration: {
      status: "healthy" | "misconfigured";
      mode: string;
      endpoints: {
        traces: string;
        metrics: string;
        logs: string;
      };
      exportTimeout: number;
      batchSize: number;
      queueSize: number;
    };
  };
  recommendations: string[];
  alerts: Array<{
    severity: "info" | "warning" | "critical";
    message: string;
    component: string;
  }>;
}

// Legacy interface for backward compatibility
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

// ============================================================================
// Telemetry Health Monitor
// ============================================================================

// Track initialization time
let initializationTime: string | null = null;

class TelemetryHealthMonitor {
  private circuitBreakers: Map<string, TelemetryCircuitBreaker> = new Map();
  private mainCircuitBreaker: TelemetryCircuitBreaker;

  constructor() {
    // Use unified configuration for circuit breaker (2025 standard)
    const cfg = loadConfig();
    const failureThreshold = cfg.telemetry.CIRCUIT_BREAKER_THRESHOLD;
    const recoveryTimeoutMs = cfg.telemetry.CIRCUIT_BREAKER_TIMEOUT_MS;

    // Create per-signal circuit breakers per monitoring-updated.md
    const signals = ["traces", "metrics", "logs"];
    for (const signal of signals) {
      this.circuitBreakers.set(
        signal,
        new TelemetryCircuitBreaker({
          failureThreshold,
          recoveryTimeoutMs,
          successThreshold: 3,
        })
      );
    }

    // Main circuit breaker for backward compatibility
    this.mainCircuitBreaker = new TelemetryCircuitBreaker({
      failureThreshold,
      recoveryTimeoutMs,
      successThreshold: 3,
    });
  }

  public markInitialized(): void {
    initializationTime = new Date().toISOString();
  }

  public getCircuitBreaker(): TelemetryCircuitBreaker {
    return this.mainCircuitBreaker;
  }

  public getSignalCircuitBreaker(signal: string): TelemetryCircuitBreaker | undefined {
    return this.circuitBreakers.get(signal);
  }

  public recordExporterSuccess(exporterName: string): void {
    this.mainCircuitBreaker.recordSuccess();
    this.circuitBreakers.get(exporterName)?.recordSuccess();
  }

  public recordExporterFailure(exporterName: string, _error?: Error): void {
    this.mainCircuitBreaker.recordFailure();
    this.circuitBreakers.get(exporterName)?.recordFailure();
  }

  /**
   * Get health status per monitoring-updated.md lines 1363-1518
   */
  public getTelemetryHealthStatus(): TelemetryHealthStatus {
    const cfg = loadConfig();
    const telemetryCfg = cfg.telemetry;
    const isInitialized = isTelemetryInitialized();

    // Get export stats
    const traceStats = getTraceExportStats();
    const metricStats = getMetricsExportStats().getStats();
    const logStats = getLogExportStats();

    // Aggregate export stats
    const totalExports = traceStats.total + metricStats.total + logStats.total;
    const totalFailures = traceStats.failures + metricStats.failures + logStats.failures;
    const successCount = totalExports - totalFailures;
    const successRate = totalExports > 0 ? Math.round((successCount / totalExports) * 100) : 100;

    // Build circuit breaker summary
    const cbSummary = { total: 3, closed: 0, open: 0, halfOpen: 0 };
    const cbDetails: Record<string, CircuitBreakerStats> = {};

    for (const [signal, cb] of this.circuitBreakers) {
      const status = cb.getHealthStatus();
      const stats = cb.getStats();

      // Map enum to lowercase state string
      let stateStr: "closed" | "open" | "half-open";
      if (status.state === CircuitBreakerState.CLOSED) {
        cbSummary.closed++;
        stateStr = "closed";
      } else if (status.state === CircuitBreakerState.OPEN) {
        cbSummary.open++;
        stateStr = "open";
      } else {
        cbSummary.halfOpen++;
        stateStr = "half-open";
      }

      cbDetails[signal] = {
        state: stateStr,
        failureCount: stats.totalFailures,
        successCount: stats.totalAttempts - stats.totalFailures,
        lastFailureTime: stats.lastFailureTime || 0,
        lastSuccessTime: stats.lastSuccessTime || 0,
        totalRequests: stats.totalAttempts,
        rejectedRequests: 0, // Not tracked in current CircuitBreaker implementation
        lastStateChange: Date.now(), // Not tracked in current CircuitBreaker implementation
      };
    }

    // Determine component statuses per monitoring-updated.md lines 1526-1536
    const exportsStatus = this.determineExportsStatus(successRate);
    const cbStatus = this.determineCircuitBreakerStatus(cbSummary);
    const configStatus = this.determineConfigStatus(telemetryCfg);

    // Determine overall status
    const componentStatuses = [
      isInitialized ? "healthy" : "critical",
      exportsStatus,
      cbStatus,
      configStatus,
    ];

    let overall: "healthy" | "degraded" | "critical";
    if (componentStatuses.includes("critical")) {
      overall = "critical";
    } else if (componentStatuses.includes("degraded")) {
      overall = "degraded";
    } else {
      overall = "healthy";
    }

    // Generate recommendations and alerts
    const recommendations: string[] = [];
    const alerts: Array<{ severity: "info" | "warning" | "critical"; message: string; component: string }> = [];

    if (!isInitialized) {
      alerts.push({
        severity: "critical",
        message: "Telemetry not initialized",
        component: "initialization",
      });
      recommendations.push("Check telemetry configuration and restart the service");
    }

    if (successRate < 80) {
      alerts.push({
        severity: "critical",
        message: `Export success rate is ${successRate}%`,
        component: "exports",
      });
      recommendations.push("Check OTLP endpoint connectivity and authentication");
    } else if (successRate < 95) {
      alerts.push({
        severity: "warning",
        message: `Export success rate is ${successRate}%`,
        component: "exports",
      });
      recommendations.push("Monitor export failures for patterns");
    }

    if (cbSummary.open > 0) {
      alerts.push({
        severity: "critical",
        message: `${cbSummary.open} circuit breaker(s) open`,
        component: "circuitBreakers",
      });
      recommendations.push("Investigate telemetry backend connectivity issues");
    }

    // Collect recent errors
    const recentErrors = [
      ...traceStats.recentErrors,
      ...metricStats.recentErrors,
      ...logStats.recentErrors,
    ].slice(-10);

    // Available metrics from centralized instrument definitions
    const availableMetrics = getAvailableMetricNames();

    return {
      overall,
      timestamp: new Date().toISOString(),
      components: {
        initialization: {
          status: isInitialized ? "healthy" : "failed",
          initialized: isInitialized,
          initializationTime: initializationTime || undefined,
        },
        exports: {
          status: exportsStatus,
          stats: {
            totalExports,
            successCount,
            failureCount: totalFailures,
            successRate,
            lastExportTime: traceStats.lastExportTime || metricStats.lastExportTime || logStats.lastExportTime,
            lastSuccessTime: traceStats.lastExportTime || metricStats.lastExportTime || logStats.lastExportTime,
            lastFailureTime: traceStats.lastFailureTime || metricStats.lastFailureTime || logStats.lastFailureTime,
            recentErrors,
          },
        },
        circuitBreakers: {
          status: cbStatus,
          summary: cbSummary,
          details: cbDetails,
        },
        metrics: {
          status: isInitialized ? "healthy" : "degraded",
          instrumentCount: INSTRUMENT_COUNT,
          availableMetrics,
        },
        configuration: {
          status: configStatus,
          mode: telemetryCfg.ENABLE_OPENTELEMETRY ? "otlp" : "disabled",
          endpoints: {
            traces: telemetryCfg.TRACES_ENDPOINT,
            metrics: telemetryCfg.METRICS_ENDPOINT,
            logs: telemetryCfg.LOGS_ENDPOINT,
          },
          exportTimeout: telemetryCfg.EXPORT_TIMEOUT_MS,
          batchSize: telemetryCfg.BATCH_SIZE,
          queueSize: telemetryCfg.MAX_QUEUE_SIZE,
        },
      },
      recommendations,
      alerts,
    };
  }

  /**
   * Legacy method for backward compatibility
   */
  public getHealthData(): TelemetryHealthData {
    const circuitBreakerStats = this.mainCircuitBreaker.getHealthStatus();
    const memoryUsage = process.memoryUsage();

    const traceStats = getTraceExportStats();
    const metricStats = getMetricsExportStats().getStats();
    const logStats = getLogExportStats();

    const tracesHealth = this.statsToExporterHealth("traces", traceStats);
    const metricsHealth = this.statsToExporterHealth("metrics", metricStats);
    const logsHealth = this.statsToExporterHealth("logs", logStats);

    const exporterStatuses = [tracesHealth.status, metricsHealth.status, logsHealth.status];
    let overallStatus: "healthy" | "degraded" | "unhealthy";

    if (exporterStatuses.every((s) => s === "healthy") && circuitBreakerStats.isHealthy) {
      overallStatus = "healthy";
    } else if (exporterStatuses.some((s) => s === "unhealthy") || !circuitBreakerStats.isHealthy) {
      overallStatus = "unhealthy";
    } else {
      overallStatus = "degraded";
    }

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
        totalAttempts: this.mainCircuitBreaker.getStats().totalAttempts,
        totalFailures: this.mainCircuitBreaker.getStats().totalFailures,
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

  private determineExportsStatus(successRate: number): "healthy" | "degraded" | "critical" {
    if (successRate >= 95) return "healthy";
    if (successRate >= 80) return "degraded";
    return "critical";
  }

  private determineCircuitBreakerStatus(summary: { open: number; halfOpen: number }): "healthy" | "degraded" | "critical" {
    if (summary.open > 0) return "critical";
    if (summary.halfOpen > 0) return "degraded";
    return "healthy";
  }

  private determineConfigStatus(cfg: any): "healthy" | "misconfigured" {
    if (!cfg.TRACES_ENDPOINT || !cfg.METRICS_ENDPOINT || !cfg.LOGS_ENDPOINT) {
      return "misconfigured";
    }
    return "healthy";
  }

  private statsToExporterHealth(
    name: string,
    stats: { successRate: string; total: number; failures: number; lastExportTime: string | null }
  ): ExporterHealth {
    const successRateNum = parseInt(stats.successRate.replace("%", ""), 10) || 0;

    let status: "healthy" | "degraded" | "unhealthy";
    if (stats.total === 0) {
      status = "healthy";
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

/**
 * Get telemetry health status per monitoring-updated.md structure
 */
export function getTelemetryHealthStatus(): TelemetryHealthStatus {
  return telemetryHealthMonitor.getTelemetryHealthStatus();
}

/**
 * Legacy function for backward compatibility
 */
export function getTelemetryHealth(): TelemetryHealthData {
  return telemetryHealthMonitor.getHealthData();
}

/**
 * Mark telemetry as initialized (called from instrumentation.ts)
 */
export function markTelemetryInitialized(): void {
  telemetryHealthMonitor.markInitialized();
}
