// Custom metric reader for Bun that uses our BunMetricExporter directly

import type { ResourceMetrics } from "@opentelemetry/sdk-metrics";
import { MeterProvider, MetricReader } from "@opentelemetry/sdk-metrics";
import { BunMetricExporter, type BunOTLPExporterConfig } from "./BunMetricExporter";

/**
 * Custom metric reader that ensures our Bun exporters are used instead of standard ones
 */
export class BunMetricReader extends MetricReader {
  private readonly exporter: BunMetricExporter;
  private readonly exportIntervalMillis: number;
  private intervalId: Timer | null = null;

  constructor(config: BunOTLPExporterConfig & { exportIntervalMillis?: number }) {
    super();
    this.exporter = new BunMetricExporter(config);
    this.exportIntervalMillis = config.exportIntervalMillis || 60000; // 60 seconds default
  }

  protected onInitialized(): void {
    // Start periodic export
    this.startPeriodicExport();
    if (process.env.DEBUG_OTEL_EXPORTERS === "true") {
      console.debug(`BunMetricReader initialized with ${this.exportIntervalMillis}ms interval`);
    }
  }

  protected async onForceFlush(): Promise<void> {
    return this.collectAndExport();
  }

  protected async onShutdown(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Final export before shutdown
    await this.collectAndExport();
    await this.exporter.shutdown();
    if (process.env.DEBUG_OTEL_EXPORTERS === "true") {
      console.debug("BunMetricReader shutdown complete");
    }
  }

  /**
   * Start periodic metric collection and export
   */
  private startPeriodicExport(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(() => {
      this.collectAndExport().catch((error) => {
        console.error("Error during periodic metric export:", error);
      });
    }, this.exportIntervalMillis);
  }

  /**
   * Collect metrics and export using our BunMetricExporter
   */
  private async collectAndExport(): Promise<void> {
    try {
      const collectionResult = await this.collect({
        timeoutMillis: 5000, // 5 second collection timeout
      });

      // Debug: Check the actual structure (only when explicitly enabled)
      if (process.env.DEBUG_OTEL_EXPORTERS === "true") {
        console.debug(`Metric collection result type: ${typeof collectionResult}`, {
          hasResourceMetrics: !!(collectionResult && "resourceMetrics" in collectionResult),
          resourceMetricsType: collectionResult?.resourceMetrics
            ? typeof collectionResult.resourceMetrics
            : "undefined",
        });
      }

      // Handle different possible return types from collect()
      let resourceMetrics: any[];

      if (!collectionResult) {
        return; // No metrics to export
      }

      if (Array.isArray(collectionResult)) {
        resourceMetrics = collectionResult;
      } else if (collectionResult.resourceMetrics && Array.isArray(collectionResult.resourceMetrics)) {
        // If wrapped in an object with resourceMetrics property
        resourceMetrics = collectionResult.resourceMetrics;
      } else if (collectionResult.resourceMetrics && !Array.isArray(collectionResult.resourceMetrics)) {
        // If resourceMetrics is a single object, wrap it in an array
        resourceMetrics = [collectionResult.resourceMetrics];
      } else if (typeof collectionResult === "object" && collectionResult.resource) {
        // If it's a single resource metric object, wrap it in an array
        resourceMetrics = [collectionResult];
      } else {
        if (process.env.DEBUG_OTEL_EXPORTERS === "true") {
          console.debug("Unexpected metric collection result structure:", JSON.stringify(collectionResult, null, 2));
        }
        return;
      }

      if (!resourceMetrics || resourceMetrics.length === 0) {
        return; // No metrics to export
      }

      // Success: Export metrics (only when explicitly enabled)
      if (process.env.DEBUG_OTEL_EXPORTERS === "true") {
        console.debug(`Exporting ${resourceMetrics.length} metric resources`);
      }

      // Use our custom BunMetricExporter
      await new Promise<void>((resolve, reject) => {
        this.exporter.export(resourceMetrics, (result) => {
          if (result.code === 0) {
            // ExportResultCode.SUCCESS
            resolve();
          } else {
            reject(new Error(result.error || "Metric export failed"));
          }
        });
      });
    } catch (error) {
      console.error("Error collecting and exporting metrics:", error);
      // Don't rethrow to prevent crashing the periodic export
    }
  }

  /**
   * Get export statistics
   */
  getStats() {
    return this.exporter.getStats();
  }

  /**
   * Get the underlying exporter (for debugging)
   */
  getExporter(): BunMetricExporter {
    return this.exporter;
  }
}
