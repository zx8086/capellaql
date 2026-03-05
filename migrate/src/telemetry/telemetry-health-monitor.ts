// src/telemetry/telemetry-health-monitor.ts

import { loadConfig } from "../config/index";
import type { AppConfig } from "../config/schemas";
import type { TelemetryCircuitBreakerStats } from "../types/circuit-breaker.types";
import { log } from "../utils/logger";
import { getMetricsExportStats, getTelemetryStatus } from "./instrumentation";
import { getMetricsStatus } from "./metrics";
import {
  getTelemetryCircuitBreakerStats,
  telemetryCircuitBreakers,
} from "./telemetry-circuit-breaker";

// Type aliases for telemetry status objects
type TelemetryStatus = ReturnType<typeof getTelemetryStatus>;
type MetricsExportStats = ReturnType<typeof getMetricsExportStats>;
type MetricsStatus = ReturnType<typeof getMetricsStatus>;

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
      details: Record<string, TelemetryCircuitBreakerStats>;
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

export class TelemetryHealthMonitor {
  private config = loadConfig();

  public getHealthStatus(): TelemetryHealthStatus {
    const timestamp = new Date().toISOString();
    const telemetryStatus = getTelemetryStatus();
    const exportStats = getMetricsExportStats();
    const metricsStatus = getMetricsStatus();
    const circuitBreakerStats = getTelemetryCircuitBreakerStats();

    const components = {
      initialization: this.assessInitialization(telemetryStatus),
      exports: this.assessExports(exportStats),
      circuitBreakers: this.assessCircuitBreakers(circuitBreakerStats),
      metrics: this.assessMetrics(metricsStatus),
      configuration: this.assessConfiguration(telemetryStatus.config),
    };

    const { overall, recommendations, alerts } = this.calculateOverallHealth(components);

    return {
      overall,
      timestamp,
      components,
      recommendations,
      alerts,
    };
  }

  private assessInitialization(telemetryStatus: TelemetryStatus) {
    return {
      status: telemetryStatus.initialized ? ("healthy" as const) : ("failed" as const),
      initialized: telemetryStatus.initialized,
      initializationTime: telemetryStatus.initialized ? new Date().toISOString() : undefined,
    };
  }

  private assessExports(exportStats: MetricsExportStats) {
    const successRate = exportStats.successRate || 0;
    let status: "healthy" | "degraded" | "critical";

    if (successRate >= 95) {
      status = "healthy";
    } else if (successRate >= 80) {
      status = "degraded";
    } else {
      status = "critical";
    }

    return {
      status,
      stats: {
        totalExports: exportStats.totalExports || 0,
        successCount: exportStats.successCount || 0,
        failureCount: exportStats.failureCount || 0,
        successRate,
        lastExportTime: exportStats.lastExportTime || null,
        lastSuccessTime: exportStats.lastSuccessTime || null,
        lastFailureTime: exportStats.lastFailureTime || null,
        recentErrors: exportStats.recentErrors || [],
      },
    };
  }

  private assessCircuitBreakers(circuitBreakerStats: Record<string, TelemetryCircuitBreakerStats>) {
    const summary = {
      total: Object.keys(circuitBreakerStats).length,
      closed: 0,
      open: 0,
      halfOpen: 0,
    };

    for (const stats of Object.values(circuitBreakerStats)) {
      switch (stats.state) {
        case "closed":
          summary.closed++;
          break;
        case "open":
          summary.open++;
          break;
        case "half_open":
          summary.halfOpen++;
          break;
      }
    }

    let status: "healthy" | "degraded" | "critical";
    if (summary.open === 0) {
      status = "healthy";
    } else if (summary.open < summary.total / 2) {
      status = "degraded";
    } else {
      status = "critical";
    }

    return {
      status,
      summary,
      details: circuitBreakerStats,
    };
  }

  private assessMetrics(metricsStatus: MetricsStatus) {
    return {
      status: metricsStatus.initialized ? ("healthy" as const) : ("degraded" as const),
      instrumentCount: metricsStatus.instrumentCount || 0,
      availableMetrics: metricsStatus.availableMetrics || [],
    };
  }

  private assessConfiguration(config: AppConfig["telemetry"]) {
    const hasEndpoints = config.tracesEndpoint && config.metricsEndpoint && config.logsEndpoint;

    return {
      status: hasEndpoints ? ("healthy" as const) : ("misconfigured" as const),
      mode: config.mode || "unknown",
      endpoints: {
        traces: config.tracesEndpoint || "not configured",
        metrics: config.metricsEndpoint || "not configured",
        logs: config.logsEndpoint || "not configured",
      },
      exportTimeout: config.exportTimeout || 0,
      batchSize: config.batchSize || 0,
      queueSize: config.maxQueueSize || 0,
    };
  }

  private calculateOverallHealth(components: TelemetryHealthStatus["components"]): {
    overall: "healthy" | "degraded" | "critical";
    recommendations: string[];
    alerts: Array<{
      severity: "info" | "warning" | "critical";
      message: string;
      component: string;
    }>;
  } {
    const recommendations: string[] = [];
    const alerts: Array<{
      severity: "info" | "warning" | "critical";
      message: string;
      component: string;
    }> = [];

    const criticalIssues = [
      components.initialization.status === "failed",
      components.exports.status === "critical",
      components.circuitBreakers.status === "critical",
      components.configuration.status === "misconfigured",
    ].filter(Boolean).length;

    const degradedIssues = [
      components.exports.status === "degraded",
      components.circuitBreakers.status === "degraded",
      components.metrics.status === "degraded",
    ].filter(Boolean).length;
    if (components.exports.stats.successRate < 95) {
      recommendations.push("Investigate telemetry export failures");
      alerts.push({
        severity: components.exports.stats.successRate < 80 ? "critical" : "warning",
        message: `Telemetry export success rate is ${components.exports.stats.successRate}%`,
        component: "exports",
      });
    }

    if (components.circuitBreakers.summary.open > 0) {
      recommendations.push("Check telemetry endpoint connectivity");
      alerts.push({
        severity: "critical",
        message: `${components.circuitBreakers.summary.open} telemetry circuit breakers are open`,
        component: "circuitBreakers",
      });
    }

    if (!components.initialization.initialized) {
      recommendations.push("Check telemetry initialization logs for errors");
      alerts.push({
        severity: "critical",
        message: "Telemetry system failed to initialize",
        component: "initialization",
      });
    }

    let overall: "healthy" | "degraded" | "critical";
    if (criticalIssues > 0) {
      overall = "critical";
    } else if (degradedIssues > 0) {
      overall = "degraded";
    } else {
      overall = "healthy";
    }

    return { overall, recommendations, alerts };
  }

  public getCircuitBreaker(type: "traces" | "metrics" | "logs") {
    return telemetryCircuitBreakers[type];
  }

  public resetCircuitBreakers(): void {
    Object.values(telemetryCircuitBreakers).forEach((cb) => {
      cb.reset();
    });

    log("Telemetry circuit breakers reset via health monitor", {
      component: "telemetry_health_monitor",
      operation: "circuit_breaker_reset",
    });
  }
}

export const telemetryHealthMonitor = new TelemetryHealthMonitor();
