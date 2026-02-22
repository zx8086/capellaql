// Bun-optimized OTLP Metric Exporter

import { hrTimeToMicroseconds } from "@opentelemetry/core";
import type { PushMetricExporter, ResourceMetrics } from "@opentelemetry/sdk-metrics";
import { BunOTLPExporter, type BunOTLPExporterConfig } from "./BunOTLPExporter";

/**
 * Bun-optimized metric exporter using native fetch API
 * Eliminates timeout issues and implements intelligent retry logic
 */
export class BunMetricExporter extends BunOTLPExporter<ResourceMetrics> implements PushMetricExporter {
  constructor(config: BunOTLPExporterConfig) {
    super("metrics", config);
  }

  /**
   * Serialize metrics to OTLP JSON format
   */
  protected serializePayload(resourceMetrics: ResourceMetrics[]): string {
    const otlpPayload = {
      resourceMetrics: resourceMetrics.map((resourceMetric) => ({
        resource: {
          attributes: this.serializeAttributes(resourceMetric.resource.attributes),
        },
        scopeMetrics: resourceMetric.scopeMetrics.map((scopeMetric) => ({
          scope: {
            name: scopeMetric.scope.name,
            version: scopeMetric.scope.version || "1.0.0",
          },
          metrics: scopeMetric.metrics.map((metric) => this.serializeMetric(metric)),
        })),
      })),
    };

    return JSON.stringify(otlpPayload);
  }

  /**
   * Serialize individual metric to OTLP format
   */
  private serializeMetric(metric: any): any {
    const baseMetric = {
      name: metric.descriptor.name,
      description: metric.descriptor.description || "",
      unit: metric.descriptor.unit || "",
    };

    // Handle different metric types
    switch (metric.descriptor.type) {
      case "COUNTER":
      case "UP_DOWN_COUNTER":
        return {
          ...baseMetric,
          sum: {
            dataPoints: metric.dataPoints.map((dp: any) => this.serializeDataPoint(dp)),
            aggregationTemporality: metric.aggregationTemporality,
            isMonotonic: metric.descriptor.type === "COUNTER",
          },
        };

      case "HISTOGRAM":
        return {
          ...baseMetric,
          histogram: {
            dataPoints: metric.dataPoints.map((dp: any) => this.serializeHistogramDataPoint(dp)),
            aggregationTemporality: metric.aggregationTemporality,
          },
        };

      case "GAUGE":
        return {
          ...baseMetric,
          gauge: {
            dataPoints: metric.dataPoints.map((dp: any) => this.serializeDataPoint(dp)),
          },
        };

      default:
        // Fallback to gauge for unknown types
        return {
          ...baseMetric,
          gauge: {
            dataPoints: metric.dataPoints.map((dp: any) => this.serializeDataPoint(dp)),
          },
        };
    }
  }

  /**
   * Serialize metric data point
   */
  private serializeDataPoint(dataPoint: any): any {
    const startTimeUnixNano = dataPoint.startTime ? hrTimeToMicroseconds(dataPoint.startTime) * 1000 : undefined;
    const timeUnixNano = hrTimeToMicroseconds(dataPoint.endTime) * 1000;

    return {
      attributes: this.serializeAttributes(dataPoint.attributes),
      startTimeUnixNano: startTimeUnixNano?.toString(),
      timeUnixNano: timeUnixNano.toString(),
      asDouble: this.getNumericValue(dataPoint.value),
    };
  }

  /**
   * Serialize histogram data point
   */
  private serializeHistogramDataPoint(dataPoint: any): any {
    const startTimeUnixNano = dataPoint.startTime ? hrTimeToMicroseconds(dataPoint.startTime) * 1000 : undefined;
    const timeUnixNano = hrTimeToMicroseconds(dataPoint.endTime) * 1000;

    return {
      attributes: this.serializeAttributes(dataPoint.attributes),
      startTimeUnixNano: startTimeUnixNano?.toString(),
      timeUnixNano: timeUnixNano.toString(),
      count: dataPoint.value.count?.toString() || "0",
      sum: dataPoint.value.sum || 0,
      bucketCounts: (dataPoint.value.buckets?.counts || []).map((c: number) => c.toString()),
      explicitBounds: dataPoint.value.buckets?.boundaries || [],
      min: dataPoint.value.min,
      max: dataPoint.value.max,
    };
  }

  /**
   * Extract numeric value from data point value
   */
  private getNumericValue(value: any): number {
    if (typeof value === "number") {
      return value;
    } else if (value && typeof value.value === "number") {
      return value.value;
    } else if (value && typeof value.sum === "number") {
      return value.sum;
    }
    return 0;
  }

  /**
   * Serialize OpenTelemetry attributes to OTLP format
   */
  private serializeAttributes(attributes: any): any[] {
    if (!attributes) return [];

    return Object.entries(attributes).map(([key, value]) => ({
      key,
      value: this.serializeAttributeValue(value),
    }));
  }

  /**
   * Serialize attribute value based on its type
   */
  private serializeAttributeValue(value: any): any {
    if (typeof value === "string") {
      return { stringValue: value };
    } else if (typeof value === "number") {
      if (Number.isInteger(value)) {
        return { intValue: value.toString() };
      } else {
        return { doubleValue: value };
      }
    } else if (typeof value === "boolean") {
      return { boolValue: value };
    } else if (Array.isArray(value)) {
      return {
        arrayValue: {
          values: value.map((v) => this.serializeAttributeValue(v)),
        },
      };
    } else {
      // Convert to string for unsupported types
      return { stringValue: String(value) };
    }
  }

  /**
   * Force flush any pending metrics
   */
  async forceFlush(): Promise<void> {
    // For this implementation, we don't batch metrics locally,
    // so there's nothing to flush
    return Promise.resolve();
  }

  /**
   * Select aggregation temporality for metric type
   */
  selectAggregationTemporality(_metricType: any): any {
    // Default to cumulative for most metric types
    // This can be customized based on specific requirements
    return 2; // AGGREGATION_TEMPORALITY_CUMULATIVE
  }
}
