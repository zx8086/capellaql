/* src/telemetry/health/telemetryHealth.ts */

import config from "$config";
import { TelemetryCircuitBreaker } from "./CircuitBreaker";

export interface TelemetryHealthData {
  timestamp: number;
  status: "healthy" | "degraded" | "unhealthy";
  exporters: {
    traces: ExporterHealth;
    metrics: ExporterHealth;
    logs: ExporterHealth;
  };
  circuitBreaker: {
    state: string;
    isHealthy: boolean;
    successRate: number;
    canExecute: boolean;
    totalAttempts: number;
    totalFailures: number;
  };
  configuration: {
    samplingRate: number;
    exportTimeoutMs: number;
    batchSize: number;
    maxQueueSize: number;
  };
  runtime: {
    memoryUsageMB: number;
    uptimeMs: number;
    environment: string;
    version: string;
  };
}

export interface ExporterHealth {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  lastExportTime: number | null;
  exportCount: number;
  failureCount: number;
  successRate: number;
}

class TelemetryHealthMonitor {
  private circuitBreaker: TelemetryCircuitBreaker;
  private exporters: Map<string, ExporterHealth>;
  private config: any;

  constructor() {
    // Use unified configuration for circuit breaker (2025 standard)
    const failureThreshold = config.telemetry.CIRCUIT_BREAKER_THRESHOLD;
    const recoveryTimeoutMs = config.telemetry.CIRCUIT_BREAKER_TIMEOUT_MS;

    this.circuitBreaker = new TelemetryCircuitBreaker({
      failureThreshold, // From environment (default: 5 per 2025 standards)
      recoveryTimeoutMs, // From environment (default: 60000 per 2025 standards)
      successThreshold: 3, // 2025 standard
    });

    this.exporters = new Map([
      ["traces", this.createInitialExporterHealth("traces")],
      ["metrics", this.createInitialExporterHealth("metrics")],
      ["logs", this.createInitialExporterHealth("logs")],
    ]);
  }

  public setConfig(config: any): void {
    this.config = config;
  }

  public getCircuitBreaker(): TelemetryCircuitBreaker {
    return this.circuitBreaker;
  }

  public recordExporterSuccess(exporterName: string): void {
    const exporter = this.exporters.get(exporterName);
    if (exporter) {
      exporter.lastExportTime = Date.now();
      exporter.exportCount++;
      exporter.successRate = ((exporter.exportCount - exporter.failureCount) / exporter.exportCount) * 100;

      // Update exporter status
      if (exporter.successRate >= 95) {
        exporter.status = "healthy";
      } else if (exporter.successRate >= 80) {
        exporter.status = "degraded";
      } else {
        exporter.status = "unhealthy";
      }
    }

    this.circuitBreaker.recordSuccess();
  }

  public recordExporterFailure(exporterName: string, _error?: Error): void {
    const exporter = this.exporters.get(exporterName);
    if (exporter) {
      exporter.failureCount++;
      exporter.exportCount++;
      exporter.successRate = ((exporter.exportCount - exporter.failureCount) / exporter.exportCount) * 100;

      // Update exporter status
      if (exporter.successRate >= 95) {
        exporter.status = "healthy";
      } else if (exporter.successRate >= 80) {
        exporter.status = "degraded";
      } else {
        exporter.status = "unhealthy";
      }
    }

    this.circuitBreaker.recordFailure();
  }

  public getHealthData(): TelemetryHealthData {
    const circuitBreakerStats = this.circuitBreaker.getHealthStatus();
    const memoryUsage = process.memoryUsage();

    // Determine overall status
    const exporterStatuses = Array.from(this.exporters.values()).map((e) => e.status);
    let overallStatus: "healthy" | "degraded" | "unhealthy";

    if (exporterStatuses.every((s) => s === "healthy") && circuitBreakerStats.isHealthy) {
      overallStatus = "healthy";
    } else if (exporterStatuses.some((s) => s === "unhealthy") || !circuitBreakerStats.isHealthy) {
      overallStatus = "unhealthy";
    } else {
      overallStatus = "degraded";
    }

    return {
      timestamp: Date.now(),
      status: overallStatus,
      exporters: {
        traces: this.exporters.get("traces") || { healthy: false, lastError: "Exporter not found" },
        metrics: this.exporters.get("metrics") || { healthy: false, lastError: "Exporter not found" },
        logs: this.exporters.get("logs") || { healthy: false, lastError: "Exporter not found" },
      },
      circuitBreaker: {
        state: circuitBreakerStats.state,
        isHealthy: circuitBreakerStats.isHealthy,
        successRate: circuitBreakerStats.successRate,
        canExecute: circuitBreakerStats.canExecute,
        totalAttempts: this.circuitBreaker.getStats().totalAttempts,
        totalFailures: this.circuitBreaker.getStats().totalFailures,
      },
      configuration: {
        samplingRate: this.config?.samplingRate || 0.15,
        exportTimeoutMs: this.config?.exportTimeoutMs || 30000,
        batchSize: this.config?.batchSize || 2048,
        maxQueueSize: this.config?.maxQueueSize || 10000,
      },
      runtime: {
        memoryUsageMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        uptimeMs: process.uptime() * 1000,
        environment: config.telemetry.DEPLOYMENT_ENVIRONMENT,
        version: this.config?.serviceVersion || "unknown",
      },
    };
  }

  private createInitialExporterHealth(name: string): ExporterHealth {
    return {
      name,
      status: "healthy",
      lastExportTime: null,
      exportCount: 0,
      failureCount: 0,
      successRate: 100,
    };
  }
}

// Singleton instance
export const telemetryHealthMonitor = new TelemetryHealthMonitor();

// Convenience function for health endpoint
export function getTelemetryHealth(): TelemetryHealthData {
  return telemetryHealthMonitor.getHealthData();
}
