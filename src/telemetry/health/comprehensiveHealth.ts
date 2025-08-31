/* src/telemetry/health/comprehensiveHealth.ts - Production-ready health monitoring */

import config from "$config";
import { getDatabaseMetricsStatus } from "../metrics/databaseMetrics";
import { getMetricsStatus } from "../metrics/httpMetrics";
import { getTelemetryHealth, type TelemetryHealthData } from "./telemetryHealth";

export interface ComprehensiveHealthReport {
  timestamp: number;
  service: {
    name: string;
    version: string;
    environment: string;
    uptime_seconds: number;
  };
  status: "healthy" | "degraded" | "unhealthy";
  telemetry: TelemetryHealthData;
  metrics: {
    http: ReturnType<typeof getMetricsStatus>;
    database: ReturnType<typeof getDatabaseMetricsStatus>;
  };
  system: {
    memory: {
      used_mb: number;
      total_mb: number;
      usage_percent: number;
    };
    runtime: {
      name: string;
      version: string;
    };
  };
  dependencies: {
    couchbase: {
      status: "connected" | "disconnected" | "unknown";
      last_check: number;
    };
  };
  sli_compliance: {
    availability_percent: number;
    error_rate_percent: number;
    response_time_p95_ms: number;
  };
}

export async function generateComprehensiveHealthReport(): Promise<ComprehensiveHealthReport> {
  const telemetryHealth = getTelemetryHealth();
  const httpMetricsStatus = getMetricsStatus();
  const dbMetricsStatus = getDatabaseMetricsStatus();
  const memoryUsage = process.memoryUsage();

  // Calculate system memory info
  const totalMemoryMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
  const usedMemoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
  const memoryUsagePercent = Math.round((usedMemoryMB / totalMemoryMB) * 100);

  // Determine overall health status
  let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";

  // Check telemetry health
  if (telemetryHealth.status === "unhealthy") {
    overallStatus = "unhealthy";
  } else if (telemetryHealth.status === "degraded" && overallStatus === "healthy") {
    overallStatus = "degraded";
  }

  // Check memory usage (warn at 80%, critical at 90%)
  if (memoryUsagePercent >= 90) {
    overallStatus = "unhealthy";
  } else if (memoryUsagePercent >= 80 && overallStatus === "healthy") {
    overallStatus = "degraded";
  }

  // Check metrics initialization
  if (!httpMetricsStatus.initialized || !dbMetricsStatus.initialized) {
    if (overallStatus === "healthy") {
      overallStatus = "degraded";
    }
  }

  // TODO: Add actual dependency health checks
  const couchbaseStatus = {
    status: "unknown" as const,
    last_check: Date.now(),
  };

  // Mock SLI data - replace with actual calculations
  const sliCompliance = {
    availability_percent: 99.9,
    error_rate_percent: 0.1,
    response_time_p95_ms: 250,
  };

  return {
    timestamp: Date.now(),
    service: {
      name: config.telemetry.SERVICE_NAME,
      version: config.telemetry.SERVICE_VERSION,
      environment: config.telemetry.DEPLOYMENT_ENVIRONMENT,
      uptime_seconds: Math.floor(process.uptime()),
    },
    status: overallStatus,
    telemetry: telemetryHealth,
    metrics: {
      http: httpMetricsStatus,
      database: dbMetricsStatus,
    },
    system: {
      memory: {
        used_mb: usedMemoryMB,
        total_mb: totalMemoryMB,
        usage_percent: memoryUsagePercent,
      },
      runtime: {
        name: typeof Bun !== "undefined" ? "bun" : "node",
        version: typeof Bun !== "undefined" ? Bun.version : process.version,
      },
    },
    dependencies: {
      couchbase: couchbaseStatus,
    },
    sli_compliance: sliCompliance,
  };
}

export function getHealthStatusCode(report: ComprehensiveHealthReport): number {
  switch (report.status) {
    case "healthy":
      return 200;
    case "degraded":
      return 200; // Still serving traffic
    case "unhealthy":
      return 503;
    default:
      return 503;
  }
}

export function formatHealthReportForLog(report: ComprehensiveHealthReport): string {
  return JSON.stringify({
    status: report.status,
    service: report.service.name,
    version: report.service.version,
    environment: report.service.environment,
    uptime: `${report.service.uptime_seconds}s`,
    memory: `${report.system.memory.usage_percent}%`,
    telemetry_status: report.telemetry.status,
    circuit_breaker: report.telemetry.circuitBreaker.state,
  }, null, 2);
}