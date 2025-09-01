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
  business_metrics: {
    telemetry_cost_efficiency: number;
    operation_impact_score: number;
    log_sampling_effectiveness: {
      debug_reduction_percent: number;
      info_reduction_percent: number;
      warn_reduction_percent: number;
      error_retention_percent: number;
    };
    retention_optimization: {
      storage_savings_percent: number;
      estimated_monthly_cost_usd: number;
      cost_tier_distribution: Record<string, number>;
    };
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

  // Calculate business metrics for telemetry optimization
  const businessMetrics = generateBusinessMetrics(telemetryHealth, memoryUsagePercent);

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
    business_metrics: businessMetrics,
  };
}

function generateBusinessMetrics(telemetryHealth: TelemetryHealthData, memoryUsagePercent: number) {
  // Calculate sampling effectiveness
  const samplingRates = {
    debug: config.telemetry.LOG_SAMPLING_DEBUG,
    info: config.telemetry.LOG_SAMPLING_INFO,
    warn: config.telemetry.LOG_SAMPLING_WARN,
    error: config.telemetry.LOG_SAMPLING_ERROR,
  };

  const logSamplingEffectiveness = {
    debug_reduction_percent: (1 - samplingRates.debug) * 100,
    info_reduction_percent: (1 - samplingRates.info) * 100,
    warn_reduction_percent: (1 - samplingRates.warn) * 100,
    error_retention_percent: samplingRates.error * 100,
  };

  // Calculate retention optimization savings
  const baseRetentionDays = 30; // Industry baseline
  const smartRetention =
    config.telemetry.LOG_RETENTION_DEBUG_DAYS * 0.2 + // 20% debug logs
    config.telemetry.LOG_RETENTION_INFO_DAYS * 0.5 + // 50% info logs
    config.telemetry.LOG_RETENTION_WARN_DAYS * 0.2 + // 20% warn logs
    config.telemetry.LOG_RETENTION_ERROR_DAYS * 0.1; // 10% error logs

  const storageSavingsPercent = ((baseRetentionDays - smartRetention) / baseRetentionDays) * 100;

  // Estimate monthly cost based on log volume and retention
  const estimatedDailyLogs = 10000; // Baseline estimation
  const costPerLogMB = 0.5; // USD per MB-month
  const avgLogSize = 0.001; // MB per log
  const monthlyLogVolume = estimatedDailyLogs * 30 * avgLogSize;
  const baseCost = monthlyLogVolume * baseRetentionDays * costPerLogMB;
  const optimizedCost = monthlyLogVolume * smartRetention * costPerLogMB;
  const estimatedMonthlyCost = optimizedCost;

  // Cost tier distribution based on log levels and their storage costs
  const costTierDistribution = {
    standard: 70, // Debug + Info logs
    priority: 20, // Warn logs
    critical: 10, // Error logs
  };

  // Calculate telemetry cost efficiency
  const exportSuccessRate = telemetryHealth.exporters?.logs?.successRate || 0.95;
  const circuitBreakerEfficiency = telemetryHealth.circuitBreaker?.state === "CLOSED" ? 1.0 : 0.7;
  const telemetryCostEfficiency = exportSuccessRate * circuitBreakerEfficiency * (1 - memoryUsagePercent / 100);

  // Operation impact score based on system health
  const healthScore = telemetryHealth.status === "healthy" ? 1.0 : telemetryHealth.status === "degraded" ? 0.8 : 0.5;
  const operationImpactScore = healthScore * telemetryCostEfficiency;

  return {
    telemetry_cost_efficiency: Math.round(telemetryCostEfficiency * 100) / 100,
    operation_impact_score: Math.round(operationImpactScore * 100) / 100,
    log_sampling_effectiveness: logSamplingEffectiveness,
    retention_optimization: {
      storage_savings_percent: Math.round(storageSavingsPercent * 100) / 100,
      estimated_monthly_cost_usd: Math.round(estimatedMonthlyCost * 100) / 100,
      cost_tier_distribution: costTierDistribution,
    },
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
  return JSON.stringify(
    {
      status: report.status,
      service: report.service.name,
      version: report.service.version,
      environment: report.service.environment,
      uptime: `${report.service.uptime_seconds}s`,
      memory: `${report.system.memory.usage_percent}%`,
      telemetry_status: report.telemetry.status,
      circuit_breaker: report.telemetry.circuitBreaker.state,
      business_metrics: {
        cost_efficiency: report.business_metrics.telemetry_cost_efficiency,
        storage_savings: `${report.business_metrics.retention_optimization.storage_savings_percent}%`,
        monthly_cost_usd: report.business_metrics.retention_optimization.estimated_monthly_cost_usd,
      },
    },
    null,
    2
  );
}
