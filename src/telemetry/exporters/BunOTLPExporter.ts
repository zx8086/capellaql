// Base OTLP Exporter for Bun runtime with native fetch API
import { ExportResult, ExportResultCode } from "@opentelemetry/core";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import type { LogRecord } from "@opentelemetry/sdk-logs";
import type { ResourceMetrics } from "@opentelemetry/sdk-metrics";
import { telemetryHealthMonitor } from "../health/telemetryHealth";

export interface BunOTLPExporterConfig {
  url: string;
  headers?: Record<string, string>;
  timeoutMillis?: number;
  concurrencyLimit?: number;
  retryConfig?: {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
  };
}

export interface ExportAttempt {
  attempt: number;
  timestamp: number;
  error?: Error;
}

export abstract class BunOTLPExporter<T> {
  private readonly url: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly concurrencyLimit: number;
  private readonly retryConfig: Required<BunOTLPExporterConfig['retryConfig']>;
  
  private activeRequests = 0;
  private totalExports = 0;
  private successfulExports = 0;
  private failedExports = 0;

  constructor(private readonly exporterType: 'traces' | 'metrics' | 'logs', config: BunOTLPExporterConfig) {
    this.url = config.url;
    this.headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'CapellaQL-BunExporter/2.0',
      ...config.headers,
    };
    this.timeoutMs = config.timeoutMillis || 10000; // Reduced to 10 seconds for faster failure detection
    this.concurrencyLimit = config.concurrencyLimit || 10;
    this.retryConfig = {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
      ...config.retryConfig,
    };
  }

  /**
   * Export data with Bun-native fetch and proper error handling
   */
  async export(items: T[], resultCallback: (result: ExportResult) => void): Promise<void> {
    if (!items || items.length === 0) {
      resultCallback({ code: ExportResultCode.SUCCESS });
      return;
    }

    // Check concurrency limit
    if (this.activeRequests >= this.concurrencyLimit) {
      console.warn(`${this.exporterType} export rejected: concurrency limit (${this.concurrencyLimit}) reached`);
      resultCallback({ 
        code: ExportResultCode.FAILED, 
        error: new Error(`Concurrency limit reached: ${this.activeRequests}/${this.concurrencyLimit}`)
      });
      return;
    }

    this.totalExports++;
    this.activeRequests++;

    try {
      const payload = this.serializePayload(items);
      const result = await this.exportWithRetry(payload);
      
      if (result.code === ExportResultCode.SUCCESS) {
        this.successfulExports++;
        telemetryHealthMonitor.recordExporterSuccess(this.exporterType);
      } else {
        this.failedExports++;
        telemetryHealthMonitor.recordExporterFailure(this.exporterType, result.error);
      }

      resultCallback(result);
    } catch (error) {
      this.failedExports++;
      telemetryHealthMonitor.recordExporterFailure(this.exporterType, error as Error);
      resultCallback({ 
        code: ExportResultCode.FAILED, 
        error: error instanceof Error ? error : new Error(String(error))
      });
    } finally {
      this.activeRequests--;
    }
  }

  /**
   * Export with retry logic and exponential backoff
   */
  private async exportWithRetry(payload: string): Promise<ExportResult> {
    const attempts: ExportAttempt[] = [];
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      const attemptStart = Date.now();
      
      try {
        const result = await this.performRequest(payload);
        
        // Log successful attempt
        if (attempt > 0) {
          console.log(`${this.exporterType} export succeeded on attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1}`);
        }
        
        return result;
      } catch (error) {
        const attemptRecord: ExportAttempt = {
          attempt: attempt + 1,
          timestamp: attemptStart,
          error: error instanceof Error ? error : new Error(String(error)),
        };
        attempts.push(attemptRecord);

        // Log attempt failure
        console.warn(`${this.exporterType} export attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1} failed:`, error);

        // Don't retry on last attempt
        if (attempt === this.retryConfig.maxRetries) {
          return {
            code: ExportResultCode.FAILED,
            error: new Error(`Export failed after ${attempts.length} attempts. Last error: ${error}`),
          };
        }

        // Calculate delay with exponential backoff and jitter
        const baseDelay = this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt);
        const jitter = Math.random() * 0.3; // 30% jitter
        const delayMs = Math.min(baseDelay * (1 + jitter), this.retryConfig.maxDelayMs);

        await this.sleep(delayMs);
      }
    }

    // Should never reach here, but TypeScript needs this
    return {
      code: ExportResultCode.FAILED,
      error: new Error('Unexpected error in retry logic'),
    };
  }

  /**
   * Perform the actual HTTP request using Bun's fetch API
   */
  private async performRequest(payload: string): Promise<ExportResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: this.headers,
        body: payload,
        signal: controller.signal,
        // Bun-specific options for better performance
        keepalive: true,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // Read response to ensure request completion
      const responseText = await response.text();
      
      // Check for error messages in response body
      try {
        const responseData = JSON.parse(responseText);
        if (responseData.message && responseData.message.includes('timed out')) {
          console.warn(`${this.exporterType} export: Server reported timeout but request completed`);
          // Don't treat this as an error since we got a response
        }
      } catch {
        // Response is not JSON, which is fine
      }

      return { code: ExportResultCode.SUCCESS };
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Request timed out after ${this.timeoutMs}ms`);
        }
        throw error;
      }
      
      throw new Error(String(error));
    }
  }

  /**
   * Abstract method to serialize payload for specific export type
   */
  protected abstract serializePayload(items: T[]): string;

  /**
   * Get export statistics
   */
  getStats() {
    return {
      totalExports: this.totalExports,
      successfulExports: this.successfulExports,
      failedExports: this.failedExports,
      activeRequests: this.activeRequests,
      successRate: this.totalExports > 0 ? this.successfulExports / this.totalExports : 1,
    };
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Shutdown the exporter
   */
  async shutdown(): Promise<void> {
    // Wait for active requests to complete with timeout
    const shutdownStart = Date.now();
    const maxWaitMs = 5000; // 5 second shutdown timeout

    while (this.activeRequests > 0 && (Date.now() - shutdownStart) < maxWaitMs) {
      await this.sleep(100);
    }

    if (this.activeRequests > 0) {
      console.warn(`${this.exporterType} exporter shutdown with ${this.activeRequests} active requests`);
    }

    console.log(`${this.exporterType} exporter shutdown complete`, this.getStats());
  }
}