// Custom span processor for Bun that uses our BunTraceExporter directly
import type { Context } from "@opentelemetry/api";
import type { ReadableSpan, Span, SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { type BunOTLPExporterConfig, BunTraceExporter } from "./BunTraceExporter";

/**
 * Custom span processor that ensures our Bun trace exporter is used
 * Bypasses the standard BatchSpanProcessor which may cause timeout issues
 */
export class BunSpanProcessor implements SpanProcessor {
  private readonly exporter: BunTraceExporter;
  private readonly maxBatchSize: number;
  private readonly scheduledDelayMillis: number;
  private readonly maxQueueSize: number;

  private spans: ReadableSpan[] = [];
  private timer: Timer | null = null;
  private isShutdown = false;

  constructor(
    config: BunOTLPExporterConfig & {
      maxBatchSize?: number;
      scheduledDelayMillis?: number;
      maxQueueSize?: number;
    }
  ) {
    this.exporter = new BunTraceExporter(config);
    this.maxBatchSize = config.maxBatchSize || 2048;
    this.scheduledDelayMillis = config.scheduledDelayMillis || 5000;
    this.maxQueueSize = config.maxQueueSize || 10000;

    this.startTimer();
    if (process.env.DEBUG_OTEL_EXPORTERS === "true") {
      console.debug("BunSpanProcessor initialized with custom Bun trace exporter");
    }
  }

  onStart(_span: Span, _parentContext: Context): void {
    // No special handling needed on span start
  }

  onEnd(span: ReadableSpan): void {
    if (this.isShutdown) return;

    // Add to batch
    this.spans.push(span);

    // Check if we need to flush immediately
    if (this.spans.length >= this.maxBatchSize) {
      this.flush();
    } else if (this.spans.length >= this.maxQueueSize) {
      // Drop oldest spans if queue is full (log in development only)
      if (process.env.DEBUG_OTEL_EXPORTERS === "true") {
        console.debug(`Span queue full (${this.maxQueueSize}), dropping oldest spans`);
      }
      this.spans = this.spans.slice(-this.maxBatchSize);
    }
  }

  async forceFlush(): Promise<void> {
    return this.flush();
  }

  async shutdown(): Promise<void> {
    this.isShutdown = true;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Final flush
    await this.flush();
    await this.exporter.shutdown();

    if (process.env.DEBUG_OTEL_EXPORTERS === "true") {
      console.debug("BunSpanProcessor shutdown complete");
    }
  }

  /**
   * Start the periodic flush timer
   */
  private startTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }

    this.timer = setInterval(() => {
      this.flush().catch((error) => {
        console.error("Error during periodic span flush:", error);
      });
    }, this.scheduledDelayMillis);
  }

  /**
   * Flush current batch of spans
   */
  private async flush(): Promise<void> {
    if (this.spans.length === 0 || this.isShutdown) {
      return;
    }

    const spansToExport = this.spans.splice(0, this.maxBatchSize);

    if (process.env.DEBUG_OTEL_EXPORTERS === "true") {
      console.debug(`Flushing ${spansToExport.length} spans with BunTraceExporter`);
    }

    try {
      await new Promise<void>((resolve, reject) => {
        this.exporter.export(spansToExport, (result) => {
          if (result.code === 0) {
            // ExportResultCode.SUCCESS
            resolve();
          } else {
            reject(new Error(result.error || "Span export failed"));
          }
        });
      });
    } catch (error) {
      console.error("Error exporting spans:", error);
      throw error;
    }
  }

  /**
   * Get export statistics
   */
  getStats() {
    return {
      queueSize: this.spans.length,
      maxQueueSize: this.maxQueueSize,
      maxBatchSize: this.maxBatchSize,
      scheduledDelayMs: this.scheduledDelayMillis,
      exporterStats: this.exporter.getStats(),
    };
  }

  /**
   * Get the underlying exporter (for debugging)
   */
  getExporter(): BunTraceExporter {
    return this.exporter;
  }
}
