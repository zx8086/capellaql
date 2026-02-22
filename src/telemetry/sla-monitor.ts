/* src/telemetry/sla-monitor.ts */
/* SLA monitoring with percentile calculation using Float64Array rolling buffers */

import { metrics, type Counter, type Histogram } from "@opentelemetry/api";
import { warn, log } from "./winston-logger";
import { triggerSLAViolationProfiling } from "./profiling-metrics";

// ============================================================================
// Types
// ============================================================================

/**
 * SLA threshold definition for an endpoint.
 */
export interface SlaThreshold {
  endpoint: string; // Endpoint path to monitor
  p95: number; // P95 latency threshold (ms)
  p99: number; // P99 latency threshold (ms)
}

/**
 * Configuration for SLA monitoring.
 */
export interface SlaMonitorConfig {
  enabled: boolean;
  autoTriggerOnSlaViolation: boolean;
  slaViolationThrottleMinutes: number;
  rollingBufferSize: number;
  slaThresholds: SlaThreshold[];
  outputDir: string;
}

/**
 * Percentile calculation results.
 */
export interface PercentileMetrics {
  p95: number;
  p99: number;
  count: number;
  min: number;
  max: number;
  mean: number;
}

/**
 * SLA violation event.
 */
export interface SlaViolation {
  endpoint: string;
  timestamp: number;
  p95: number;
  p99: number;
  thresholdP95: number;
  thresholdP99: number;
  profilingTriggered: boolean;
  reason?: string;
}

/**
 * SLA monitor statistics.
 */
export interface SlaMonitorStats {
  enabled: boolean;
  activeEndpoints: string[];
  bufferSizes: Record<string, number>;
  lastTriggers: Record<string, string>;
  violations: {
    total: number;
    profilingTriggered: number;
    throttled: number;
  };
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: SlaMonitorConfig = {
  enabled: false,
  autoTriggerOnSlaViolation: true,
  slaViolationThrottleMinutes: 60,
  rollingBufferSize: 100,
  slaThresholds: [],
  outputDir: "/tmp/profiles",
};

// ============================================================================
// Rolling Buffer Implementation
// ============================================================================

/**
 * High-performance rolling buffer using Float64Array.
 * Maintains last N samples for efficient percentile calculation.
 */
class RollingBuffer {
  private buffer: Float64Array;
  private index: number = 0;
  private count: number = 0;
  private readonly size: number;

  constructor(size: number) {
    this.size = size;
    this.buffer = new Float64Array(size);
  }

  /**
   * Add a value to the buffer.
   */
  push(value: number): void {
    this.buffer[this.index] = value;
    this.index = (this.index + 1) % this.size;
    if (this.count < this.size) {
      this.count++;
    }
  }

  /**
   * Get the number of samples in the buffer.
   */
  getCount(): number {
    return this.count;
  }

  /**
   * Get sorted copy of buffer values.
   */
  getSortedValues(): Float64Array {
    const values = new Float64Array(this.count);

    if (this.count === this.size) {
      // Buffer is full, copy all values
      values.set(this.buffer);
    } else {
      // Buffer not full, copy only used portion
      values.set(this.buffer.subarray(0, this.count));
    }

    // Sort in ascending order
    values.sort();
    return values;
  }

  /**
   * Calculate percentile from buffer.
   *
   * @param percentile - Percentile to calculate (0-100)
   */
  calculatePercentile(percentile: number): number {
    if (this.count === 0) {
      return 0;
    }

    const sorted = this.getSortedValues();
    const index = Math.ceil((percentile / 100) * this.count) - 1;
    return sorted[Math.max(0, Math.min(index, this.count - 1))];
  }

  /**
   * Calculate multiple percentiles efficiently.
   */
  calculatePercentiles(): PercentileMetrics {
    if (this.count === 0) {
      return { p95: 0, p99: 0, count: 0, min: 0, max: 0, mean: 0 };
    }

    const sorted = this.getSortedValues();
    const p95Index = Math.ceil(0.95 * this.count) - 1;
    const p99Index = Math.ceil(0.99 * this.count) - 1;

    // Calculate mean
    let sum = 0;
    for (let i = 0; i < this.count; i++) {
      sum += sorted[i];
    }

    return {
      p95: sorted[Math.max(0, p95Index)],
      p99: sorted[Math.max(0, p99Index)],
      count: this.count,
      min: sorted[0],
      max: sorted[this.count - 1],
      mean: sum / this.count,
    };
  }

  /**
   * Clear the buffer.
   */
  clear(): void {
    this.buffer.fill(0);
    this.index = 0;
    this.count = 0;
  }
}

// ============================================================================
// SLA Monitor Class
// ============================================================================

/**
 * SLA monitor for automatic performance violation detection.
 */
class SlaMonitor {
  private config: SlaMonitorConfig;
  private buffers: Map<string, RollingBuffer> = new Map();
  private thresholdMap: Map<string, SlaThreshold> = new Map();
  private lastTriggers: Map<string, number> = new Map();
  private violations: SlaViolation[] = [];
  private violationsTriggered = 0;
  private violationsThrottled = 0;

  // OTel metrics
  private slaViolationCounter: Counter | null = null;
  private latencyHistogram: Histogram | null = null;

  constructor(config: Partial<SlaMonitorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeThresholds();
    this.initializeMetrics();
  }

  /**
   * Initialize threshold map from config.
   */
  private initializeThresholds(): void {
    for (const threshold of this.config.slaThresholds) {
      this.thresholdMap.set(threshold.endpoint, threshold);
      this.buffers.set(threshold.endpoint, new RollingBuffer(this.config.rollingBufferSize));
    }
  }

  /**
   * Initialize OpenTelemetry metrics.
   */
  private initializeMetrics(): void {
    if (!this.config.enabled) {
      return;
    }

    const meter = metrics.getMeter("capellaql-sla-monitor", "1.0.0");

    this.slaViolationCounter = meter.createCounter("sla_violations_total", {
      description: "Total SLA violations detected",
      unit: "1",
    });

    this.latencyHistogram = meter.createHistogram("endpoint_latency_ms", {
      description: "Endpoint latency distribution",
      unit: "ms",
      advice: {
        explicitBucketBoundaries: [5, 10, 25, 50, 75, 100, 150, 200, 500, 1000],
      },
    });
  }

  /**
   * Record a latency measurement.
   *
   * @param endpoint - Endpoint path
   * @param latencyMs - Request latency in milliseconds
   */
  public async recordLatency(endpoint: string, latencyMs: number): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Record to histogram
    this.latencyHistogram?.record(latencyMs, { endpoint });

    // Get or create buffer
    let buffer = this.buffers.get(endpoint);
    if (!buffer) {
      // Create buffer for unknown endpoint (no SLA threshold)
      buffer = new RollingBuffer(this.config.rollingBufferSize);
      this.buffers.set(endpoint, buffer);
    }

    // Add to buffer
    buffer.push(latencyMs);

    // Check SLA if threshold exists and buffer has enough samples
    const threshold = this.thresholdMap.get(endpoint);
    if (threshold && buffer.getCount() >= 10) {
      await this.checkSlaViolation(endpoint, buffer, threshold);
    }
  }

  /**
   * Check for SLA violations.
   */
  private async checkSlaViolation(
    endpoint: string,
    buffer: RollingBuffer,
    threshold: SlaThreshold,
  ): Promise<void> {
    const percentileMetrics = buffer.calculatePercentiles();

    const isP95Violation = percentileMetrics.p95 > threshold.p95;
    const isP99Violation = percentileMetrics.p99 > threshold.p99;
    const isViolation = isP95Violation || isP99Violation;

    if (!isViolation) {
      return;
    }

    // Record SLA violation metric
    this.slaViolationCounter?.add(1, {
      endpoint,
      violation_type: isP99Violation ? "p99" : "p95",
    });

    // Check if we can trigger profiling
    if (this.config.autoTriggerOnSlaViolation) {
      const canTrigger = this.canTriggerProfiling(endpoint);

      if (canTrigger) {
        // Trigger profiling
        const sessionId = triggerSLAViolationProfiling(
          endpoint,
          percentileMetrics.p95,
          threshold.p95,
        );

        if (sessionId) {
          this.recordViolation(endpoint, percentileMetrics, threshold, true);
          this.lastTriggers.set(endpoint, Date.now());
          this.violationsTriggered++;

          log("Automatic profiling triggered by SLA violation", {
            component: "sla-monitor",
            endpoint,
            currentP95: percentileMetrics.p95.toFixed(2),
            currentP99: percentileMetrics.p99.toFixed(2),
            thresholdP95: threshold.p95,
            thresholdP99: threshold.p99,
            sampleSize: percentileMetrics.count,
            sessionId,
          });
        } else {
          this.recordViolation(endpoint, percentileMetrics, threshold, false, "overhead_exceeded");
          this.violationsThrottled++;
        }
      } else {
        const minutesSinceLastTrigger = this.getMinutesSinceLastTrigger(endpoint);
        this.recordViolation(endpoint, percentileMetrics, threshold, false, "throttled");
        this.violationsThrottled++;

        warn("SLA violation detected but profiling blocked", {
          component: "sla-monitor",
          endpoint,
          reason: "throttled",
          currentP95: percentileMetrics.p95.toFixed(2),
          currentP99: percentileMetrics.p99.toFixed(2),
          thresholdP95: threshold.p95,
          thresholdP99: threshold.p99,
          minutesSinceLastTrigger: minutesSinceLastTrigger.toFixed(1),
          throttleMinutes: this.config.slaViolationThrottleMinutes,
        });
      }
    } else {
      this.recordViolation(endpoint, percentileMetrics, threshold, false, "auto_trigger_disabled");
    }
  }

  /**
   * Check if profiling can be triggered for an endpoint.
   */
  private canTriggerProfiling(endpoint: string): boolean {
    const lastTrigger = this.lastTriggers.get(endpoint);
    if (!lastTrigger) {
      return true;
    }

    const minutesSinceLastTrigger = (Date.now() - lastTrigger) / 60000;
    return minutesSinceLastTrigger >= this.config.slaViolationThrottleMinutes;
  }

  /**
   * Get minutes since last trigger.
   */
  private getMinutesSinceLastTrigger(endpoint: string): number {
    const lastTrigger = this.lastTriggers.get(endpoint);
    if (!lastTrigger) {
      return Infinity;
    }
    return (Date.now() - lastTrigger) / 60000;
  }

  /**
   * Record a violation event.
   */
  private recordViolation(
    endpoint: string,
    percentileMetrics: PercentileMetrics,
    threshold: SlaThreshold,
    profilingTriggered: boolean,
    reason?: string,
  ): void {
    const violation: SlaViolation = {
      endpoint,
      timestamp: Date.now(),
      p95: percentileMetrics.p95,
      p99: percentileMetrics.p99,
      thresholdP95: threshold.p95,
      thresholdP99: threshold.p99,
      profilingTriggered,
      reason,
    };

    this.violations.push(violation);

    // Keep only last 100 violations
    if (this.violations.length > 100) {
      this.violations.shift();
    }
  }

  /**
   * Get current SLA monitor statistics.
   */
  public getStats(): SlaMonitorStats {
    const bufferSizes: Record<string, number> = {};
    for (const [endpoint, buffer] of this.buffers) {
      bufferSizes[endpoint] = buffer.getCount();
    }

    const lastTriggersFormatted: Record<string, string> = {};
    for (const [endpoint, timestamp] of this.lastTriggers) {
      lastTriggersFormatted[endpoint] = new Date(timestamp).toISOString();
    }

    return {
      enabled: this.config.enabled,
      activeEndpoints: Array.from(this.buffers.keys()),
      bufferSizes,
      lastTriggers: lastTriggersFormatted,
      violations: {
        total: this.violations.length,
        profilingTriggered: this.violationsTriggered,
        throttled: this.violationsThrottled,
      },
    };
  }

  /**
   * Get percentile metrics for an endpoint.
   */
  public getPercentiles(endpoint: string): PercentileMetrics | null {
    const buffer = this.buffers.get(endpoint);
    if (!buffer || buffer.getCount() === 0) {
      return null;
    }
    return buffer.calculatePercentiles();
  }

  /**
   * Get recent violations.
   */
  public getRecentViolations(limit = 10): SlaViolation[] {
    return this.violations.slice(-limit);
  }

  /**
   * Update configuration.
   */
  public updateConfig(config: Partial<SlaMonitorConfig>): void {
    this.config = { ...this.config, ...config };

    // Reinitialize thresholds if changed
    if (config.slaThresholds) {
      this.thresholdMap.clear();
      this.initializeThresholds();
    }
  }

  /**
   * Clear all data (for testing).
   */
  public reset(): void {
    for (const buffer of this.buffers.values()) {
      buffer.clear();
    }
    this.lastTriggers.clear();
    this.violations = [];
    this.violationsTriggered = 0;
    this.violationsThrottled = 0;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let slaMonitorInstance: SlaMonitor | null = null;

/**
 * Get or create the SLA monitor singleton.
 */
export function getSlaMonitor(config?: Partial<SlaMonitorConfig>): SlaMonitor {
  if (!slaMonitorInstance) {
    slaMonitorInstance = new SlaMonitor(config);
  }
  return slaMonitorInstance;
}

/**
 * Initialize SLA monitor with configuration.
 */
export function initializeSlaMonitor(config: Partial<SlaMonitorConfig>): SlaMonitor {
  if (slaMonitorInstance) {
    slaMonitorInstance.updateConfig(config);
  } else {
    slaMonitorInstance = new SlaMonitor(config);
  }
  return slaMonitorInstance;
}

/**
 * Shutdown SLA monitor.
 */
export function shutdownSlaMonitor(): void {
  if (slaMonitorInstance) {
    const stats = slaMonitorInstance.getStats();
    console.info("SLA monitor shutdown", {
      component: "sla-monitor",
      operation: "shutdown",
      totalViolations: stats.violations.total,
      profilingTriggered: stats.violations.profilingTriggered,
      throttled: stats.violations.throttled,
    });
    slaMonitorInstance = null;
  }
}

// ============================================================================
// Convenience Exports
// ============================================================================

export { SlaMonitor, RollingBuffer };
