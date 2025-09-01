/* src/telemetry/metrics/databaseMetrics.ts - 2025-compliant database observability */

import { type Counter, context, type Histogram, metrics, trace, type UpDownCounter } from "@opentelemetry/api";
import { telemetryHealthMonitor } from "../health/telemetryHealth";

let dbOperationCounter: Counter | undefined;
let dbResponseTimeHistogram: Histogram | undefined;
let dbConnectionsGauge: UpDownCounter | undefined;
let isInitialized = false;

export interface DatabaseMetricsLabels {
  operation: string;
  bucket: string;
  scope?: string;
  collection?: string;
  status: "success" | "error";
  error_type?: string;
}

export function initializeDatabaseMetrics(): void {
  if (isInitialized) {
    console.warn("Database metrics already initialized");
    return;
  }

  try {
    const meter = metrics.getMeter("capellaql-database-metrics", "1.0.0");

    // Database operation counter with comprehensive labels
    dbOperationCounter = meter.createCounter("db_operations_total", {
      description: "Total number of database operations",
      unit: "1", // UCUM unit for count
    });

    // Database response time histogram with proper UCUM units (2025 standard)
    dbResponseTimeHistogram = meter.createHistogram("db_operation_duration_seconds", {
      description: "Database operation duration in seconds",
      unit: "s", // UCUM unit for seconds (2025 compliance)
    });

    // Active database connections gauge
    dbConnectionsGauge = meter.createUpDownCounter("db_active_connections", {
      description: "Number of active database connections",
      unit: "1",
    });

    isInitialized = true;
    console.log("✅ Database metrics initialized successfully");
  } catch (error) {
    console.error("❌ Error initializing database metrics:", error);
    telemetryHealthMonitor.recordExporterFailure("metrics", error as Error);
  }
}

export function recordDatabaseOperation(
  operation: string,
  bucket: string,
  durationMs: number,
  success: boolean,
  scope?: string,
  collection?: string,
  errorType?: string
): void {
  if (!isInitialized) {
    console.warn("Database metrics not initialized, skipping operation recording");
    return;
  }

  const circuitBreaker = telemetryHealthMonitor.getCircuitBreaker();
  if (!circuitBreaker.canExecute()) {
    return; // Skip metrics recording if circuit breaker is open
  }

  try {
    const labels: DatabaseMetricsLabels = {
      operation: operation.toLowerCase(),
      bucket,
      status: success ? "success" : "error",
    };

    // Add optional labels
    if (scope) labels.scope = scope;
    if (collection) labels.collection = collection;
    if (errorType && !success) labels.error_type = errorType;

    // Add trace context for correlation
    const activeContext = context.active();
    const span = trace.getSpan(activeContext);
    const spanContext = span?.spanContext();

    const metricsAttributes = {
      ...labels,
      ...(spanContext?.traceId && { trace_id: spanContext.traceId.slice(0, 8) }),
    };

    // Record operation count
    if (dbOperationCounter) {
      dbOperationCounter.add(1, metricsAttributes);
    }

    // Record response time (convert to seconds for 2025 compliance)
    if (dbResponseTimeHistogram) {
      const durationSeconds = durationMs / 1000;
      dbResponseTimeHistogram.record(durationSeconds, metricsAttributes);
    }

    // Record success for health monitoring
    telemetryHealthMonitor.recordExporterSuccess("metrics");
    circuitBreaker.recordSuccess();
  } catch (error) {
    console.error("Error recording database operation metrics:", error);
    telemetryHealthMonitor.recordExporterFailure("metrics", error as Error);
    circuitBreaker.recordFailure();
  }
}

export function recordConnectionChange(delta: number, bucket: string): void {
  if (!isInitialized || !dbConnectionsGauge) {
    return;
  }

  const circuitBreaker = telemetryHealthMonitor.getCircuitBreaker();
  if (!circuitBreaker.canExecute()) {
    return;
  }

  try {
    dbConnectionsGauge.add(delta, { bucket });
    telemetryHealthMonitor.recordExporterSuccess("metrics");
    circuitBreaker.recordSuccess();
  } catch (error) {
    console.error("Error recording connection change:", error);
    telemetryHealthMonitor.recordExporterFailure("metrics", error as Error);
    circuitBreaker.recordFailure();
  }
}

export function getDatabaseMetricsStatus(): {
  initialized: boolean;
  counters: string[];
  histograms: string[];
  gauges: string[];
} {
  return {
    initialized: isInitialized,
    counters: dbOperationCounter ? ["db_operations_total"] : [],
    histograms: dbResponseTimeHistogram ? ["db_operation_duration_seconds"] : [],
    gauges: dbConnectionsGauge ? ["db_active_connections"] : [],
  };
}

// Business metrics for SLI/SLO tracking
export function recordSLIMetric(
  sliName: string,
  value: number,
  success: boolean,
  additionalLabels?: Record<string, string>
): void {
  if (!isInitialized) return;

  const circuitBreaker = telemetryHealthMonitor.getCircuitBreaker();
  if (!circuitBreaker.canExecute()) return;

  try {
    const meter = metrics.getMeter("capellaql-sli-metrics", "1.0.0");
    const sliCounter = meter.createCounter(`sli_${sliName}_total`, {
      description: `SLI metric for ${sliName}`,
      unit: "1",
    });

    const labels = {
      sli_name: sliName,
      status: success ? "success" : "failure",
      ...additionalLabels,
    };

    sliCounter.add(value, labels);
    telemetryHealthMonitor.recordExporterSuccess("metrics");
    circuitBreaker.recordSuccess();
  } catch (error) {
    console.error(`Error recording SLI metric ${sliName}:`, error);
    telemetryHealthMonitor.recordExporterFailure("metrics", error as Error);
    circuitBreaker.recordFailure();
  }
}
