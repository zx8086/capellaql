// src/telemetry/memory-guardian.ts
// Layer 3: TelemetryMemoryGuardian - Adaptive backpressure for OTLP telemetry
// Monitors heap memory and export queue health to prevent Uint8Array buffer accumulation

import { warn } from "../utils/logger";
import type { ExportStatsTracker } from "./export-stats-tracker";

/**
 * Memory pressure levels with associated actions
 */
export type MemoryPressure = "normal" | "elevated" | "high" | "critical";

/**
 * Queue health status based on export success/failure rates
 */
export interface QueueHealth {
  pressure: MemoryPressure;
  heapUsedMB: number;
  heapTotalMB: number;
  heapUsagePercent: number;
  exportBacklog: {
    traces: number;
    metrics: number;
    logs: number;
  };
  exportFailureRate: {
    traces: number;
    metrics: number;
    logs: number;
  };
  recommendations: string[];
  timestamp: number;
}

/**
 * Configuration for memory guardian thresholds
 */
export interface MemoryGuardianConfig {
  // Heap usage thresholds (percentage)
  elevatedThreshold: number; // Default: 60%
  highThreshold: number; // Default: 75%
  criticalThreshold: number; // Default: 85%

  // Export failure rate thresholds (percentage)
  failureRateWarning: number; // Default: 10%
  failureRateCritical: number; // Default: 25%

  // Monitoring interval in ms
  monitoringIntervalMs: number; // Default: 5000ms

  // Enable automatic remediation actions
  enableAutoRemediation: boolean; // Default: false (log-only mode)

  // Heap limit in MB for percentage calculations (4-pillar config)
  // Bun doesn't expose v8.getHeapStatistics().heap_size_limit
  heapLimitMB: number; // Default: 512
}

// CPU optimization: Increase monitoring interval from 5s to 30s
// Profile analysis showed checkHealth() consuming 4.2% CPU with getHealth() at 1.4%.
// 30s interval provides adequate memory visibility while reducing overhead by 83%.
const DEFAULT_CONFIG: MemoryGuardianConfig = {
  elevatedThreshold: 60,
  highThreshold: 75,
  criticalThreshold: 85,
  failureRateWarning: 10,
  failureRateCritical: 25,
  monitoringIntervalMs: 30000, // Reduced from 5000ms to 30000ms
  enableAutoRemediation: false,
  heapLimitMB: 512, // Override via telemetry.memoryGuardianHeapLimitMB in 4-pillar config
};

// Startup warmup period - suppress warnings during initial heap growth
const STARTUP_WARMUP_MS = 30_000; // 30 seconds

/**
 * TelemetryMemoryGuardian monitors memory usage and export queue health
 * to provide early warning of telemetry backpressure issues.
 *
 * This is a defensive layer that:
 * 1. Tracks heap memory usage trends
 * 2. Monitors export success/failure rates
 * 3. Calculates export backlog (pending - exported)
 * 4. Provides recommendations based on pressure levels
 * 5. Optionally triggers remediation actions
 */
export class TelemetryMemoryGuardian {
  private config: MemoryGuardianConfig;
  private traceStats: ExportStatsTracker | null = null;
  private metricStats: ExportStatsTracker | null = null;
  private logStats: ExportStatsTracker | null = null;
  private monitoringInterval: ReturnType<typeof setInterval> | null = null;
  private lastHealth: QueueHealth | null = null;
  private healthHistory: QueueHealth[] = [];
  private maxHistorySize = 10; // Keep 5 minutes of history at 30s intervals
  private startTime: number = Date.now(); // Track startup time for warmup period

  constructor(config: Partial<MemoryGuardianConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register export stats trackers for monitoring
   */
  registerTrackers(
    traceStats: ExportStatsTracker,
    metricStats: ExportStatsTracker,
    logStats: ExportStatsTracker
  ): void {
    this.traceStats = traceStats;
    this.metricStats = metricStats;
    this.logStats = logStats;
  }

  /**
   * Start periodic monitoring
   */
  start(): void {
    if (this.monitoringInterval) {
      return; // Already running
    }

    this.monitoringInterval = setInterval(() => {
      this.checkHealth();
    }, this.config.monitoringIntervalMs);

    // Prevent interval from keeping process alive
    if (this.monitoringInterval.unref) {
      this.monitoringInterval.unref();
    }
  }

  /**
   * Stop monitoring and cleanup
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Check if we're still in the startup warmup period
   */
  private isInWarmupPeriod(): boolean {
    return Date.now() - this.startTime < STARTUP_WARMUP_MS;
  }

  /**
   * Get current memory and queue health status
   */
  getHealth(): QueueHealth {
    const heapStats = process.memoryUsage();
    const heapUsedMB = Math.round(heapStats.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(heapStats.heapTotal / 1024 / 1024);
    // Use configured heap limit instead of dynamic heapTotal to avoid false positives
    // during startup when heapTotal is small and growing
    const heapUsagePercent = Math.round((heapUsedMB / this.config.heapLimitMB) * 100);

    const traceStatsData = this.traceStats?.getStats();
    const metricStatsData = this.metricStats?.getStats();
    const logStatsData = this.logStats?.getStats();

    // Calculate export backlog (total - successful = failures)
    const exportBacklog = {
      traces: traceStatsData?.failures ?? 0,
      metrics: metricStatsData?.failures ?? 0,
      logs: logStatsData?.failures ?? 0,
    };

    // Calculate failure rates using tracker interface properties
    const exportFailureRate = {
      traces: this.traceStats
        ? Math.round(
            (this.traceStats.failureCount / Math.max(this.traceStats.totalExports, 1)) * 100
          )
        : 0,
      metrics: this.metricStats
        ? Math.round(
            (this.metricStats.failureCount / Math.max(this.metricStats.totalExports, 1)) * 100
          )
        : 0,
      logs: this.logStats
        ? Math.round((this.logStats.failureCount / Math.max(this.logStats.totalExports, 1)) * 100)
        : 0,
    };

    // Determine pressure level
    const pressure = this.calculatePressure(heapUsagePercent, exportFailureRate, exportBacklog);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      pressure,
      heapUsagePercent,
      exportFailureRate,
      exportBacklog
    );

    const health: QueueHealth = {
      pressure,
      heapUsedMB,
      heapTotalMB,
      heapUsagePercent,
      exportBacklog,
      exportFailureRate,
      recommendations,
      timestamp: Date.now(),
    };

    this.lastHealth = health;
    return health;
  }

  /**
   * Get health history for trend analysis
   */
  getHealthHistory(): QueueHealth[] {
    return [...this.healthHistory];
  }

  /**
   * Get the last recorded health status
   */
  getLastHealth(): QueueHealth | null {
    return this.lastHealth;
  }

  /**
   * Check if system is under memory pressure
   */
  isUnderPressure(): boolean {
    const health = this.getHealth();
    return health.pressure !== "normal";
  }

  /**
   * Get current pressure level
   */
  getPressureLevel(): MemoryPressure {
    return this.getHealth().pressure;
  }

  private checkHealth(): void {
    const health = this.getHealth();

    // Add to history
    this.healthHistory.push(health);
    if (this.healthHistory.length > this.maxHistorySize) {
      this.healthHistory.shift();
    }

    // Suppress warnings during startup warmup period to avoid false positives
    if (this.isInWarmupPeriod()) {
      return;
    }

    // Log warnings based on pressure level
    if (health.pressure === "critical") {
      warn("Memory pressure detected", {
        component: "memory-guardian",
        operation: "health_check",
        pressure_level: "critical",
        heap_usage_percent: health.heapUsagePercent,
        heap_used_mb: health.heapUsedMB,
        heap_limit_mb: this.config.heapLimitMB,
        export_backlog_traces: health.exportBacklog.traces,
        export_backlog_metrics: health.exportBacklog.metrics,
        export_backlog_logs: health.exportBacklog.logs,
        recommendations: health.recommendations,
      });
    } else if (health.pressure === "high") {
      warn("Memory pressure detected", {
        component: "memory-guardian",
        operation: "health_check",
        pressure_level: "high",
        heap_usage_percent: health.heapUsagePercent,
        heap_used_mb: health.heapUsedMB,
        heap_limit_mb: this.config.heapLimitMB,
        export_failure_rate_traces: health.exportFailureRate.traces,
        export_failure_rate_metrics: health.exportFailureRate.metrics,
        export_failure_rate_logs: health.exportFailureRate.logs,
      });
    }
  }

  private calculatePressure(
    heapUsagePercent: number,
    failureRates: { traces: number; metrics: number; logs: number },
    backlog: { traces: number; metrics: number; logs: number }
  ): MemoryPressure {
    // Memory-based pressure levels (these are the primary concern)
    // Critical: heap > 85% - actual memory emergency
    if (heapUsagePercent >= this.config.criticalThreshold) {
      return "critical";
    }

    // High: heap > 75% - memory is concerning
    if (heapUsagePercent >= this.config.highThreshold) {
      return "high";
    }

    // Export failures are secondary - they indicate connectivity issues, not memory issues
    // Only escalate to "high" if there's BOTH memory pressure AND export failures
    const hasHighFailureRate =
      failureRates.traces >= this.config.failureRateCritical ||
      failureRates.metrics >= this.config.failureRateCritical ||
      failureRates.logs >= this.config.failureRateCritical;

    const totalBacklog = backlog.traces + backlog.metrics + backlog.logs;
    const hasSignificantBacklog = totalBacklog > 50;

    // Elevated heap + high failure rate = high pressure (memory starting to accumulate due to export issues)
    if (heapUsagePercent >= this.config.elevatedThreshold && hasHighFailureRate) {
      return "high";
    }

    // Elevated: heap > 60% OR (significant backlog AND high failure rate)
    // The backlog + failure combo suggests buffers may be accumulating
    if (
      heapUsagePercent >= this.config.elevatedThreshold ||
      (hasSignificantBacklog && hasHighFailureRate)
    ) {
      return "elevated";
    }

    // Export failures alone (without memory pressure) are informational, not pressure
    // They will still generate recommendations but won't trigger pressure warnings
    return "normal";
  }

  private generateRecommendations(
    pressure: MemoryPressure,
    heapUsagePercent: number,
    failureRates: { traces: number; metrics: number; logs: number },
    backlog: { traces: number; metrics: number; logs: number }
  ): string[] {
    const recommendations: string[] = [];

    if (pressure === "normal") {
      return recommendations;
    }

    // Heap-based recommendations
    if (heapUsagePercent >= this.config.criticalThreshold) {
      recommendations.push(
        "CRITICAL: Heap usage above 85%. Consider reducing OTEL_BSP_MAX_QUEUE_SIZE or forcing GC."
      );
    } else if (heapUsagePercent >= this.config.highThreshold) {
      recommendations.push(
        "HIGH: Heap usage above 75%. Monitor for continued growth and consider reducing batch sizes."
      );
    } else if (heapUsagePercent >= this.config.elevatedThreshold) {
      recommendations.push(
        "ELEVATED: Heap usage above 60%. Normal operation but approaching limits."
      );
    }

    // Failure rate recommendations
    if (failureRates.traces >= this.config.failureRateCritical) {
      recommendations.push(
        `Trace export failure rate at ${failureRates.traces}%. Check OTLP endpoint connectivity.`
      );
    }
    if (failureRates.metrics >= this.config.failureRateCritical) {
      recommendations.push(
        `Metric export failure rate at ${failureRates.metrics}%. Check OTLP endpoint connectivity.`
      );
    }
    if (failureRates.logs >= this.config.failureRateCritical) {
      recommendations.push(
        `Log export failure rate at ${failureRates.logs}%. Check OTLP endpoint connectivity.`
      );
    }

    // Backlog recommendations
    const totalBacklog = backlog.traces + backlog.metrics + backlog.logs;
    if (totalBacklog > 100) {
      recommendations.push(
        `Export backlog of ${totalBacklog} items. Exports may be slower than ingestion rate.`
      );
    }

    return recommendations;
  }
}

// Singleton instance
let memoryGuardian: TelemetryMemoryGuardian | null = null;

/**
 * Get or create the singleton memory guardian instance
 */
export function getMemoryGuardian(config?: Partial<MemoryGuardianConfig>): TelemetryMemoryGuardian {
  if (!memoryGuardian) {
    memoryGuardian = new TelemetryMemoryGuardian(config);
  }
  return memoryGuardian;
}

/**
 * Shutdown the memory guardian
 */
export function shutdownMemoryGuardian(): void {
  if (memoryGuardian) {
    memoryGuardian.stop();
    memoryGuardian = null;
  }
}
