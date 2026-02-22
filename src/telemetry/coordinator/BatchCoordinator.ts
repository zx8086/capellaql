import type { LogRecord } from "@opentelemetry/api-logs";
import type { MetricData } from "@opentelemetry/sdk-metrics";
import type { SpanData } from "@opentelemetry/sdk-trace-base";
import config from "$config";
import { log } from "../winston-logger";

// Batch data types for coordinated exports
interface TelemetryBatch {
  traces: SpanData[];
  metrics: MetricData[];
  logs: LogRecord[];
  timestamp: number;
  batchId: string;
}

interface BatchCoordinatorConfig {
  batchInterval: number;
  maxBatchSize: number;
  exportTimeout: number;
  maxRetries: number;
  retryBackoff: number;
  maxMemoryMB: number;
  memoryPressureThreshold: number; // Percentage (0-1) of heap usage to trigger emergency flush
  emergencyFlushThreshold: number; // Percentage (0-1) of max memory to trigger data dropping
}

interface ExportResult {
  success: boolean;
  exportedCount: number;
  duration: number;
  error?: string;
}

interface ExportStatistics {
  totalBatches: number;
  successfulBatches: number;
  failedBatches: number;
  totalSpansExported: number;
  totalMetricsExported: number;
  totalLogsExported: number;
  averageExportDuration: number;
  lastExportTime: number;
  emergencyFlushCount: number;
  dataDropCount: number;
  currentMemoryUsageMB: number;
  maxMemorySeenMB: number;
}

interface MemoryPressureInfo {
  isUnderPressure: boolean;
  heapUsageRatio: number;
  bufferMemoryUsageMB: number;
  totalMemoryUsageMB: number;
  pressureLevel: "low" | "medium" | "high" | "critical";
}

export class TelemetryBatchCoordinator {
  private traceBuffer: SpanData[] = [];
  private metricBuffer: MetricData[] = [];
  private logBuffer: LogRecord[] = [];

  private batchTimer: Timer | null = null;
  private memoryCheckTimer: Timer | null = null;
  private isExporting = false;
  private isShutdown = false;

  // Memory management tracking
  private currentMemoryUsage = 0;
  private maxMemorySeen = 0;
  private lastMemoryCheck = 0;
  private lastEmergencyFlush = 0;

  private statistics: ExportStatistics = {
    totalBatches: 0,
    successfulBatches: 0,
    failedBatches: 0,
    totalSpansExported: 0,
    totalMetricsExported: 0,
    totalLogsExported: 0,
    averageExportDuration: 0,
    lastExportTime: 0,
    emergencyFlushCount: 0,
    dataDropCount: 0,
    currentMemoryUsageMB: 0,
    maxMemorySeenMB: 0,
  };

  private readonly config: BatchCoordinatorConfig;

  constructor(config?: Partial<BatchCoordinatorConfig>) {
    this.config = {
      batchInterval: config?.batchInterval || 5000, // 5 seconds
      maxBatchSize: config?.maxBatchSize || 1000,
      exportTimeout: config?.exportTimeout || 30000, // 30 seconds
      maxRetries: config?.maxRetries || 3,
      retryBackoff: config?.retryBackoff || 1000, // 1 second base
      maxMemoryMB: config?.maxMemoryMB || 100, // 100MB default limit
      memoryPressureThreshold: config?.memoryPressureThreshold || 0.85, // 85% heap usage
      emergencyFlushThreshold: config?.emergencyFlushThreshold || 0.9, // 90% of max memory
    };

    this.startBatchTimer();
    this.startMemoryMonitoring();
    if (process.env.DEBUG_OTEL_EXPORTERS === "true") {
      console.debug("TelemetryBatchCoordinator initialized with memory management", this.config);
    }
  }

  private startBatchTimer(): void {
    if (this.isShutdown) return;

    this.batchTimer = setInterval(() => {
      this.flushBatch();
    }, this.config.batchInterval);
  }

  // Add telemetry data to buffers with memory management
  addSpans(spans: SpanData[]): void {
    if (this.isShutdown || spans.length === 0) return;

    const spanSize = this.estimateSpanArraySize(spans);

    // Check memory pressure BEFORE adding data
    if (this.shouldPerformMemoryCheck()) {
      const memoryPressure = this.checkMemoryPressure();
      if (memoryPressure.pressureLevel === "critical") {
        this.handleCriticalMemoryPressure();
        return; // Drop the spans to prevent OOM
      } else if (memoryPressure.pressureLevel === "high") {
        this.emergencyFlush();
      }
    }

    this.traceBuffer.push(...spans);
    this.currentMemoryUsage += spanSize;
    this.updateMemoryStats();

    // Trigger immediate flush if buffer is getting large or memory pressure
    if (
      this.traceBuffer.length >= this.config.maxBatchSize ||
      this.currentMemoryUsage > this.config.maxMemoryMB * 1024 * 1024 * this.config.emergencyFlushThreshold
    ) {
      this.flushBatch();
    }
  }

  addMetrics(metrics: MetricData[]): void {
    if (this.isShutdown || metrics.length === 0) return;

    const metricsSize = this.estimateMetricArraySize(metrics);

    // Check memory pressure
    if (this.shouldPerformMemoryCheck()) {
      const memoryPressure = this.checkMemoryPressure();
      if (memoryPressure.pressureLevel === "critical") {
        this.handleCriticalMemoryPressure();
        return;
      } else if (memoryPressure.pressureLevel === "high") {
        this.emergencyFlush();
      }
    }

    this.metricBuffer.push(...metrics);
    this.currentMemoryUsage += metricsSize;
    this.updateMemoryStats();

    if (
      this.metricBuffer.length >= this.config.maxBatchSize ||
      this.currentMemoryUsage > this.config.maxMemoryMB * 1024 * 1024 * this.config.emergencyFlushThreshold
    ) {
      this.flushBatch();
    }
  }

  addLogs(logs: LogRecord[]): void {
    if (this.isShutdown || logs.length === 0) return;

    const logsSize = this.estimateLogArraySize(logs);

    // Check memory pressure
    if (this.shouldPerformMemoryCheck()) {
      const memoryPressure = this.checkMemoryPressure();
      if (memoryPressure.pressureLevel === "critical") {
        this.handleCriticalMemoryPressure();
        return;
      } else if (memoryPressure.pressureLevel === "high") {
        this.emergencyFlush();
      }
    }

    this.logBuffer.push(...logs);
    this.currentMemoryUsage += logsSize;
    this.updateMemoryStats();

    if (
      this.logBuffer.length >= this.config.maxBatchSize ||
      this.currentMemoryUsage > this.config.maxMemoryMB * 1024 * 1024 * this.config.emergencyFlushThreshold
    ) {
      this.flushBatch();
    }
  }

  // Coordinated batch flush
  async flushBatch(): Promise<void> {
    if (this.isExporting || this.isShutdown) return;

    // Check if we have data to export
    const hasData = this.traceBuffer.length > 0 || this.metricBuffer.length > 0 || this.logBuffer.length > 0;

    if (!hasData) return;

    this.isExporting = true;
    const batchId = this.generateBatchId();
    const startTime = Date.now();

    try {
      // Create batch with current buffer contents
      const traces = this.traceBuffer.splice(0, this.config.maxBatchSize);
      const metrics = this.metricBuffer.splice(0, this.config.maxBatchSize);
      const logs = this.logBuffer.splice(0, this.config.maxBatchSize);

      // Update memory usage after removing data from buffers
      const removedSize =
        this.estimateSpanArraySize(traces) + this.estimateMetricArraySize(metrics) + this.estimateLogArraySize(logs);

      this.currentMemoryUsage -= removedSize;
      this.updateMemoryStats();

      const batch: TelemetryBatch = {
        traces,
        metrics,
        logs,
        timestamp: startTime,
        batchId,
      };

      if (process.env.DEBUG_OTEL_EXPORTERS === "true") {
        console.debug(`Exporting batch ${batchId}`, {
          traces: batch.traces.length,
          metrics: batch.metrics.length,
          logs: batch.logs.length,
        });
      }

      // Execute coordinated export with timeout
      const exportResult = await this.executeCoordinatedExport(batch);
      const duration = Date.now() - startTime;

      // Update statistics
      this.updateStatistics(exportResult, duration);

      if (exportResult.success) {
        console.debug(`Batch ${batchId} exported successfully in ${duration}ms`);
      } else {
        console.error(`Batch ${batchId} export failed:`, exportResult.error);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Batch ${batchId} export error:`, error);

      this.updateStatistics({ success: false, exportedCount: 0, duration, error: String(error) }, duration);
    } finally {
      this.isExporting = false;
    }
  }

  private async executeCoordinatedExport(batch: TelemetryBatch): Promise<ExportResult> {
    const exports: Promise<ExportResult>[] = [];
    let totalExported = 0;

    try {
      // Export traces if available
      if (batch.traces.length > 0) {
        exports.push(this.exportTraces(batch.traces, batch.batchId));
      }

      // Export metrics if available
      if (batch.metrics.length > 0) {
        exports.push(this.exportMetrics(batch.metrics, batch.batchId));
      }

      // Export logs if available
      if (batch.logs.length > 0) {
        exports.push(this.exportLogs(batch.logs, batch.batchId));
      }

      // Execute all exports in parallel with shared timeout
      const results = await Promise.race([Promise.allSettled(exports), this.timeout(this.config.exportTimeout)]);

      if (results === "timeout") {
        throw new Error(`Batch export timeout after ${this.config.exportTimeout}ms`);
      }

      // Process results
      let allSuccessful = true;
      const errors: string[] = [];

      (results as PromiseSettledResult<ExportResult>[]).forEach((result, _index) => {
        if (result.status === "fulfilled") {
          if (result.value.success) {
            totalExported += result.value.exportedCount;
          } else {
            allSuccessful = false;
            errors.push(result.value.error || "Unknown export error");
          }
        } else {
          allSuccessful = false;
          errors.push(result.reason?.message || "Export rejected");
        }
      });

      return {
        success: allSuccessful,
        exportedCount: totalExported,
        duration: Date.now() - batch.timestamp,
        error: errors.length > 0 ? errors.join("; ") : undefined,
      };
    } catch (error) {
      return {
        success: false,
        exportedCount: totalExported,
        duration: Date.now() - batch.timestamp,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async exportTraces(spans: SpanData[], batchId: string): Promise<ExportResult> {
    const startTime = Date.now();

    try {
      // Simulate trace export - in real implementation, this would use actual OTLP exporters
      console.debug(`Exporting ${spans.length} traces for batch ${batchId}`);

      // For now, we'll simulate successful export
      // In real implementation: await this.traceExporter.export(spans);

      return {
        success: true,
        exportedCount: spans.length,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        exportedCount: 0,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async exportMetrics(metrics: MetricData[], batchId: string): Promise<ExportResult> {
    const startTime = Date.now();

    try {
      console.debug(`Exporting ${metrics.length} metrics for batch ${batchId}`);

      // Simulate metric export
      // In real implementation: await this.metricExporter.export(metrics);

      return {
        success: true,
        exportedCount: metrics.length,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        exportedCount: 0,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async exportLogs(logs: LogRecord[], batchId: string): Promise<ExportResult> {
    const startTime = Date.now();

    try {
      console.debug(`Exporting ${logs.length} logs for batch ${batchId}`);

      // Simulate log export
      // In real implementation: await this.logExporter.export(logs);

      return {
        success: true,
        exportedCount: logs.length,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        exportedCount: 0,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private timeout(ms: number): Promise<"timeout"> {
    return new Promise((resolve) => setTimeout(() => resolve("timeout"), ms));
  }

  private generateBatchId(): string {
    return `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private updateStatistics(result: ExportResult, duration: number): void {
    this.statistics.totalBatches++;
    this.statistics.lastExportTime = Date.now();

    if (result.success) {
      this.statistics.successfulBatches++;
      this.statistics.totalSpansExported += result.exportedCount;
    } else {
      this.statistics.failedBatches++;
    }

    // Update average duration
    const totalDuration = this.statistics.averageExportDuration * (this.statistics.totalBatches - 1) + duration;
    this.statistics.averageExportDuration = totalDuration / this.statistics.totalBatches;
  }

  // Public API methods
  getStatistics(): ExportStatistics {
    return { ...this.statistics };
  }

  getBufferStatus(): {
    traces: number;
    metrics: number;
    logs: number;
    memoryUsageMB: number;
    memoryPressure: MemoryPressureInfo;
  } {
    return {
      traces: this.traceBuffer.length,
      metrics: this.metricBuffer.length,
      logs: this.logBuffer.length,
      memoryUsageMB: this.currentMemoryUsage / (1024 * 1024),
      memoryPressure: this.checkMemoryPressure(),
    };
  }

  async forceFlush(): Promise<void> {
    console.debug("Force flushing telemetry batch coordinator");
    await this.flushBatch();
  }

  async shutdown(): Promise<void> {
    console.debug("Shutting down telemetry batch coordinator");
    this.isShutdown = true;

    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.memoryCheckTimer) {
      clearInterval(this.memoryCheckTimer);
      this.memoryCheckTimer = null;
    }

    // Final flush before shutdown
    if (!this.isExporting) {
      await this.flushBatch();
    }

    log("Telemetry batch coordinator shutdown complete", {
      component: "batch-coordinator",
      ...this.statistics,
    });
  }

  // Memory Management Methods

  /**
   * Start memory monitoring timer
   */
  private startMemoryMonitoring(): void {
    if (this.isShutdown) return;

    this.memoryCheckTimer = setInterval(() => {
      const memoryPressure = this.checkMemoryPressure();

      // Debug logging for troubleshooting
      if (process.env.NODE_ENV === "development") {
        console.debug(`Memory check: ${memoryPressure.pressureLevel}`, {
          heapUsageRatio: memoryPressure.heapUsageRatio.toFixed(3),
          bufferMemoryMB: memoryPressure.bufferMemoryUsageMB.toFixed(2),
          totalMemoryMB: memoryPressure.totalMemoryUsageMB.toFixed(2),
          bufferCounts: {
            traces: this.traceBuffer.length,
            metrics: this.metricBuffer.length,
            logs: this.logBuffer.length,
          },
        });
      }

      if (memoryPressure.pressureLevel === "high" || memoryPressure.pressureLevel === "critical") {
        console.warn(`Telemetry memory pressure detected: ${memoryPressure.pressureLevel}`, {
          heapUsageRatio: memoryPressure.heapUsageRatio,
          bufferMemoryMB: memoryPressure.bufferMemoryUsageMB,
          totalMemoryMB: memoryPressure.totalMemoryUsageMB,
        });

        if (memoryPressure.pressureLevel === "critical") {
          this.handleCriticalMemoryPressure();
        } else {
          this.emergencyFlush();
        }
      }
    }, 10000); // Check every 10 seconds (reduced frequency)
  }

  /**
   * Check if memory check should be performed
   */
  private shouldPerformMemoryCheck(): boolean {
    const now = Date.now();
    const timeSinceLastCheck = now - this.lastMemoryCheck;

    // Check memory at most every 1 second to avoid performance impact
    if (timeSinceLastCheck > 1000) {
      this.lastMemoryCheck = now;
      return true;
    }

    return false;
  }

  /**
   * Check current memory pressure
   */
  private checkMemoryPressure(): MemoryPressureInfo {
    const memoryUsage = process.memoryUsage();
    // Fix: Use RSS for accurate memory pressure detection
    // RSS includes all memory (heap + stack + code + buffers)
    const heapUsageRatio = Math.min(memoryUsage.heapUsed / memoryUsage.rss, 1.0);
    const bufferMemoryMB = this.currentMemoryUsage / (1024 * 1024);
    const totalMemoryMB = memoryUsage.rss / (1024 * 1024);

    let pressureLevel: "low" | "medium" | "high" | "critical" = "low";

    // More realistic thresholds based on RSS
    if (totalMemoryMB > 512 || bufferMemoryMB > this.config.maxMemoryMB) {
      pressureLevel = "critical";
    } else if (totalMemoryMB > 256 || bufferMemoryMB > this.config.maxMemoryMB * this.config.emergencyFlushThreshold) {
      pressureLevel = "high";
    } else if (totalMemoryMB > 128 || bufferMemoryMB > this.config.maxMemoryMB * 0.7) {
      pressureLevel = "medium";
    }

    return {
      isUnderPressure: pressureLevel !== "low",
      heapUsageRatio,
      bufferMemoryUsageMB: bufferMemoryMB,
      totalMemoryUsageMB: totalMemoryMB,
      pressureLevel,
    };
  }

  /**
   * Emergency flush when memory pressure is high
   */
  private emergencyFlush(): void {
    const now = Date.now();

    // Prevent too frequent emergency flushes
    if (now - this.lastEmergencyFlush < 2000) {
      return;
    }

    this.lastEmergencyFlush = now;
    this.statistics.emergencyFlushCount++;

    console.warn("Emergency telemetry flush due to memory pressure", {
      bufferSizes: {
        traces: this.traceBuffer.length,
        metrics: this.metricBuffer.length,
        logs: this.logBuffer.length,
      },
      memoryUsageMB: this.currentMemoryUsage / (1024 * 1024),
    });

    // Force immediate flush
    this.flushBatch().catch((error) => {
      console.error("Emergency flush failed:", error);
    });

    // Force garbage collection if available
    if (global.gc) {
      try {
        global.gc();
      } catch (error) {
        console.debug("Manual garbage collection failed:", error);
      }
    }
  }

  /**
   * Handle critical memory pressure by dropping data
   */
  private handleCriticalMemoryPressure(): void {
    console.error("CRITICAL: Telemetry memory pressure - dropping oldest data to prevent OOM");

    const _initialTraceCount = this.traceBuffer.length;
    const _initialMetricCount = this.metricBuffer.length;
    const _initialLogCount = this.logBuffer.length;

    // Drop 50% of oldest data from each buffer
    const tracesToDrop = Math.floor(this.traceBuffer.length * 0.5);
    const metricsToDrop = Math.floor(this.metricBuffer.length * 0.5);
    const logsToDrop = Math.floor(this.logBuffer.length * 0.5);

    // Remove oldest entries (beginning of arrays)
    const droppedTraces = this.traceBuffer.splice(0, tracesToDrop);
    const droppedMetrics = this.metricBuffer.splice(0, metricsToDrop);
    const droppedLogs = this.logBuffer.splice(0, logsToDrop);

    // Update memory usage
    const droppedSize =
      this.estimateSpanArraySize(droppedTraces) +
      this.estimateMetricArraySize(droppedMetrics) +
      this.estimateLogArraySize(droppedLogs);

    this.currentMemoryUsage -= droppedSize;
    this.statistics.dataDropCount += tracesToDrop + metricsToDrop + logsToDrop;

    console.error("Telemetry data dropped due to memory pressure", {
      dropped: {
        traces: tracesToDrop,
        metrics: metricsToDrop,
        logs: logsToDrop,
        totalItems: tracesToDrop + metricsToDrop + logsToDrop,
        memoryFreedMB: droppedSize / (1024 * 1024),
      },
      remaining: {
        traces: this.traceBuffer.length,
        metrics: this.metricBuffer.length,
        logs: this.logBuffer.length,
        memoryUsageMB: this.currentMemoryUsage / (1024 * 1024),
      },
    });

    // Force garbage collection
    if (global.gc) {
      try {
        global.gc();
      } catch (error) {
        console.debug("Manual garbage collection failed:", error);
      }
    }

    // Try emergency flush with remaining data
    this.emergencyFlush();
  }

  /**
   * Update memory usage statistics
   */
  private updateMemoryStats(): void {
    const currentMB = this.currentMemoryUsage / (1024 * 1024);
    this.statistics.currentMemoryUsageMB = currentMB;

    if (currentMB > this.maxMemorySeen) {
      this.maxMemorySeen = currentMB;
      this.statistics.maxMemorySeenMB = currentMB;
    }
  }

  /**
   * Estimate memory usage of span array
   */
  private estimateSpanArraySize(spans: SpanData[]): number {
    if (spans.length === 0) return 0;

    // Rough estimation: each span ~2KB on average
    return spans.length * 2048;
  }

  /**
   * Estimate memory usage of metric array
   */
  private estimateMetricArraySize(metrics: MetricData[]): number {
    if (metrics.length === 0) return 0;

    // Rough estimation: each metric ~1KB on average
    return metrics.length * 1024;
  }

  /**
   * Estimate memory usage of log array
   */
  private estimateLogArraySize(logs: LogRecord[]): number {
    if (logs.length === 0) return 0;

    // Rough estimation: each log entry ~512B on average
    return logs.length * 512;
  }
}

// Singleton instance for global use
let batchCoordinator: TelemetryBatchCoordinator | null = null;

export function getBatchCoordinator(): TelemetryBatchCoordinator {
  if (!batchCoordinator) {
    batchCoordinator = new TelemetryBatchCoordinator({
      batchInterval: config.telemetry.SUMMARY_LOG_INTERVAL / 60, // More frequent than summary logs
      maxBatchSize: config.telemetry.BATCH_SIZE,
      exportTimeout: config.telemetry.EXPORT_TIMEOUT_MS,
    });
  }
  return batchCoordinator;
}

export async function shutdownBatchCoordinator(): Promise<void> {
  if (batchCoordinator) {
    await batchCoordinator.shutdown();
    batchCoordinator = null;
  }
}
