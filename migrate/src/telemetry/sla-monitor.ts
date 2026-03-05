// src/telemetry/sla-monitor.ts

import { loadConfig } from "../config/index";
import type { ContinuousProfilingConfig, SlaThreshold } from "../config/schemas";
import { getOverheadMonitor, resetOverheadMonitor } from "../services/profiling/overhead-monitor";
import { ProfileQueueManager } from "../services/profiling/profile-queue-manager";
import { error, log, warn } from "../utils/logger";
import { recordSlaViolation, registerProfilingObservables } from "./profiling-metrics";

interface PercentileMetrics {
  p95: number;
  p99: number;
  count: number;
}

export class SlaMonitor {
  private readonly config: ContinuousProfilingConfig;
  private readonly thresholds: Map<string, SlaThreshold>;
  private readonly latencyBuffers: Map<string, number[]>;
  private readonly lastProfilingTrigger: Map<string, number>;
  private readonly queueManager: ProfileQueueManager;
  private isShuttingDown = false;

  constructor(config: ContinuousProfilingConfig) {
    this.config = config;
    this.thresholds = new Map();
    this.latencyBuffers = new Map();
    this.lastProfilingTrigger = new Map();
    this.queueManager = new ProfileQueueManager(config, 1);

    for (const threshold of config.slaThresholds) {
      this.thresholds.set(threshold.endpoint, threshold);
      this.latencyBuffers.set(threshold.endpoint, []);
    }

    if (config.enabled) {
      const overheadMonitor = getOverheadMonitor();

      registerProfilingObservables(
        () => overheadMonitor.getOverheadMetrics(),
        () => this.queueManager.getStats()
      );

      log("SLA Monitor initialized", {
        component: "sla-monitor",
        enabled: config.enabled,
        autoTrigger: config.autoTriggerOnSlaViolation,
        throttleMinutes: config.slaViolationThrottleMinutes,
        outputDir: config.outputDir,
        endpoints: config.slaThresholds.map((t) => t.endpoint),
      });
    }
  }

  async recordLatency(endpoint: string, latencyMs: number): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const threshold = this.thresholds.get(endpoint);
    if (!threshold) {
      return;
    }

    const buffer = this.latencyBuffers.get(endpoint);
    if (!buffer) {
      return;
    }

    buffer.push(latencyMs);

    if (buffer.length > this.config.rollingBufferSize) {
      buffer.shift();
    }

    if (buffer.length >= Math.min(10, this.config.rollingBufferSize)) {
      await this.checkSlaViolation(endpoint, buffer, threshold);
    }
  }

  private async checkSlaViolation(
    endpoint: string,
    buffer: number[],
    threshold: SlaThreshold
  ): Promise<void> {
    const metrics = this.calculatePercentiles(buffer);

    const isViolation = metrics.p95 > threshold.p95 || metrics.p99 > threshold.p99;

    if (isViolation && this.config.autoTriggerOnSlaViolation) {
      const canTrigger = this.canTriggerProfiling(endpoint);
      const overheadMonitor = getOverheadMonitor();
      const isOverheadAcceptable = overheadMonitor.isOverheadAcceptable();

      if (canTrigger && isOverheadAcceptable && this.queueManager.canStartProfiling()) {
        await this.triggerAutomaticProfiling(endpoint, metrics, threshold);
      } else {
        const lastTrigger = this.lastProfilingTrigger.get(endpoint);
        const minutesSinceLastTrigger = lastTrigger
          ? (Date.now() - lastTrigger) / 1000 / 60
          : Number.POSITIVE_INFINITY;

        let reason = "throttled";
        if (!isOverheadAcceptable) {
          reason = "overhead_exceeded";
        } else if (!this.queueManager.canStartProfiling()) {
          reason = "queue_full_or_storage_quota";
        }

        recordSlaViolation(endpoint, metrics.p95, metrics.p99, false);

        warn("SLA violation detected but profiling blocked", {
          component: "sla-monitor",
          endpoint,
          reason,
          currentP95: metrics.p95.toFixed(2),
          currentP99: metrics.p99.toFixed(2),
          thresholdP95: threshold.p95,
          thresholdP99: threshold.p99,
          minutesSinceLastTrigger: minutesSinceLastTrigger.toFixed(1),
          throttleMinutes: this.config.slaViolationThrottleMinutes,
          sampleSize: metrics.count,
        });
      }
    }
  }

  private calculatePercentiles(values: number[]): PercentileMetrics {
    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;

    const p95Index = Math.ceil(count * 0.95) - 1;
    const p99Index = Math.ceil(count * 0.99) - 1;

    return {
      p95: sorted[p95Index] || 0,
      p99: sorted[p99Index] || 0,
      count,
    };
  }

  private canTriggerProfiling(endpoint: string): boolean {
    if (this.isShuttingDown) {
      return false;
    }

    const lastTrigger = this.lastProfilingTrigger.get(endpoint);
    if (!lastTrigger) {
      return true;
    }

    const minutesSinceLastTrigger = (Date.now() - lastTrigger) / 1000 / 60;
    return minutesSinceLastTrigger >= this.config.slaViolationThrottleMinutes;
  }

  private async triggerAutomaticProfiling(
    endpoint: string,
    metrics: PercentileMetrics,
    threshold: SlaThreshold
  ): Promise<void> {
    try {
      const overheadMonitor = getOverheadMonitor();
      overheadMonitor.startProfilingMeasurement();

      const triggered = await this.queueManager.requestProfiling({
        endpoint,
        reason: "sla_violation",
        requestedAt: Date.now(),
        violationMetrics: {
          p95: metrics.p95,
          p99: metrics.p99,
          count: metrics.count,
        },
      });

      if (triggered) {
        recordSlaViolation(endpoint, metrics.p95, metrics.p99, true);
        this.lastProfilingTrigger.set(endpoint, Date.now());

        log("Automatic profiling triggered by SLA violation", {
          component: "sla-monitor",
          endpoint,
          currentP95: metrics.p95.toFixed(2),
          currentP99: metrics.p99.toFixed(2),
          thresholdP95: threshold.p95,
          thresholdP99: threshold.p99,
          sampleSize: metrics.count,
          outputDir: this.config.outputDir,
        });
      }
    } catch (err) {
      error("Failed to trigger automatic profiling", {
        component: "sla-monitor",
        endpoint,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  getStats(): {
    enabled: boolean;
    activeEndpoints: string[];
    bufferSizes: Record<string, number>;
    lastTriggers: Record<string, string>;
    queueStats: ReturnType<ProfileQueueManager["getStats"]>;
    overheadMetrics: ReturnType<ReturnType<typeof getOverheadMonitor>["getOverheadMetrics"]>;
  } {
    const bufferSizes: Record<string, number> = {};
    for (const [endpoint, buffer] of this.latencyBuffers.entries()) {
      bufferSizes[endpoint] = buffer.length;
    }

    const lastTriggers: Record<string, string> = {};
    for (const [endpoint, timestamp] of this.lastProfilingTrigger.entries()) {
      lastTriggers[endpoint] = new Date(timestamp).toISOString();
    }

    const overheadMonitor = getOverheadMonitor();

    return {
      enabled: this.config.enabled,
      activeEndpoints: Array.from(this.thresholds.keys()),
      bufferSizes,
      lastTriggers,
      queueStats: this.queueManager.getStats(),
      overheadMetrics: overheadMonitor.getOverheadMetrics(),
    };
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    log("SLA Monitor shutting down", {
      component: "sla-monitor",
    });

    await this.queueManager.shutdown();

    this.latencyBuffers.clear();
    this.lastProfilingTrigger.clear();
  }
}

let slaMonitorInstance: SlaMonitor | null = null;

export function getSlaMonitor(): SlaMonitor {
  if (!slaMonitorInstance) {
    const config = loadConfig();
    slaMonitorInstance = new SlaMonitor(config.continuousProfiling);
  }
  return slaMonitorInstance;
}

export function resetSlaMonitor(): void {
  if (slaMonitorInstance) {
    slaMonitorInstance.shutdown();
    slaMonitorInstance = null;
  }
  resetOverheadMonitor();
}
