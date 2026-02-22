/* src/telemetry/sampling/SimpleSmartSampler.ts */

import {
  type Attributes,
  type Context,
  type Link,
  type Sampler,
  SamplingDecision,
  type SamplingResult,
  type SpanKind,
} from "@opentelemetry/api";

// Simple 3-tier sampling configuration
export interface SimpleSmartSamplingConfig {
  // Core signal sampling rates (0.0 to 1.0)
  traces: number; // Distributed tracing sampling rate
  metrics: number; // Metrics collection sampling rate
  logs: number; // Log entries sampling rate

  // Error preservation (always 1.0 for critical observability)
  preserveErrors: boolean;

  // Optional configuration
  costOptimizationMode: boolean; // Enable aggressive cost optimization
  healthCheckSampling: number; // Special rate for health endpoints (typically lower)
}

// Sampling decision metadata
export interface SimpleSamplingDecision {
  shouldSample: boolean;
  signalType: "trace" | "metric" | "log";
  samplingRate: number;
  reason: string;
  costSavings?: number; // Estimated percentage savings
}

// Default configuration optimized for cost-effectiveness
export const DEFAULT_SIMPLE_SAMPLING_CONFIG: SimpleSmartSamplingConfig = {
  traces: 0.15, // 15% trace sampling - captures patterns while reducing costs
  metrics: 0.2, // 20% metrics sampling - higher for performance monitoring
  logs: 0.25, // 25% log sampling - balance between visibility and storage

  preserveErrors: true, // Always preserve errors for debugging
  costOptimizationMode: true, // Enable cost optimization by default
  healthCheckSampling: 0.05, // 5% health check sampling - reduce noise
};

export class SimpleSmartSampler implements Sampler {
  private readonly config: SimpleSmartSamplingConfig;
  private samplingStats = {
    totalDecisions: 0,
    sampledCount: 0,
    errorPreservedCount: 0,
    costSavingsEstimate: 0,
  };

  constructor(config: SimpleSmartSamplingConfig = DEFAULT_SIMPLE_SAMPLING_CONFIG) {
    this.config = this.validateAndNormalizeConfig(config);
  }

  // OpenTelemetry Sampler interface - handles trace sampling
  shouldSample(
    _context: Context,
    _traceId: string,
    spanName: string,
    _spanKind: SpanKind,
    attributes: Attributes,
    _links: Link[]
  ): SamplingResult {
    const decision = this.shouldSampleTrace(spanName, attributes);
    this.updateStats(decision);

    return {
      decision: decision.shouldSample ? SamplingDecision.RECORD_AND_SAMPLED : SamplingDecision.NOT_RECORD,
      attributes: decision.shouldSample
        ? {
            "sampling.signal_type": decision.signalType,
            "sampling.rate": decision.samplingRate,
            "sampling.reason": decision.reason,
            "sampling.cost_optimized": this.config.costOptimizationMode,
          }
        : undefined,
    };
  }

  // Main sampling decision logic for traces
  shouldSampleTrace(spanName: string, attributes?: Attributes): SimpleSamplingDecision {
    // Check for errors first - always preserve
    if (this.config.preserveErrors && this.isErrorTrace(attributes)) {
      return {
        shouldSample: true,
        signalType: "trace",
        samplingRate: 1.0,
        reason: "error_preservation",
        costSavings: 0, // No savings for errors - they must be preserved
      };
    }

    // Special handling for health checks - reduce sampling
    if (this.isHealthCheckTrace(spanName, attributes)) {
      const shouldSample = Math.random() < this.config.healthCheckSampling;
      return {
        shouldSample,
        signalType: "trace",
        samplingRate: this.config.healthCheckSampling,
        reason: "health_check_sampling",
        costSavings: shouldSample ? 0 : this.calculateCostSavings(this.config.traces),
      };
    }

    // Standard trace sampling
    const shouldSample = Math.random() < this.config.traces;
    return {
      shouldSample,
      signalType: "trace",
      samplingRate: this.config.traces,
      reason: "standard_trace_sampling",
      costSavings: shouldSample ? 0 : this.calculateCostSavings(this.config.traces),
    };
  }

  // Metric sampling decision
  shouldSampleMetric(metricName: string, attributes?: Attributes): SimpleSamplingDecision {
    // Always preserve error-related metrics
    if (this.config.preserveErrors && this.isErrorMetric(metricName, attributes)) {
      return {
        shouldSample: true,
        signalType: "metric",
        samplingRate: 1.0,
        reason: "error_metric_preservation",
        costSavings: 0,
      };
    }

    // Standard metric sampling
    const shouldSample = Math.random() < this.config.metrics;
    return {
      shouldSample,
      signalType: "metric",
      samplingRate: this.config.metrics,
      reason: "standard_metric_sampling",
      costSavings: shouldSample ? 0 : this.calculateCostSavings(this.config.metrics),
    };
  }

  // Log sampling decision
  shouldSampleLog(level: string, message?: string, attributes?: Attributes): SimpleSamplingDecision {
    // Always preserve error logs
    if (this.config.preserveErrors && this.isErrorLog(level, message, attributes)) {
      return {
        shouldSample: true,
        signalType: "log",
        samplingRate: 1.0,
        reason: "error_log_preservation",
        costSavings: 0,
      };
    }

    // Standard log sampling
    const shouldSample = Math.random() < this.config.logs;
    return {
      shouldSample,
      signalType: "log",
      samplingRate: this.config.logs,
      reason: "standard_log_sampling",
      costSavings: shouldSample ? 0 : this.calculateCostSavings(this.config.logs),
    };
  }

  // Get current configuration
  getConfig(): SimpleSmartSamplingConfig {
    return { ...this.config };
  }

  // Get sampling statistics
  getStats(): {
    totalDecisions: number;
    samplingRate: number;
    errorPreservationRate: number;
    estimatedCostSavings: number;
    configRates: {
      traces: number;
      metrics: number;
      logs: number;
    };
  } {
    const samplingRate =
      this.samplingStats.totalDecisions > 0 ? this.samplingStats.sampledCount / this.samplingStats.totalDecisions : 0;

    const errorPreservationRate =
      this.samplingStats.totalDecisions > 0
        ? this.samplingStats.errorPreservedCount / this.samplingStats.totalDecisions
        : 0;

    return {
      totalDecisions: this.samplingStats.totalDecisions,
      samplingRate: Math.round(samplingRate * 100) / 100,
      errorPreservationRate: Math.round(errorPreservationRate * 100) / 100,
      estimatedCostSavings: Math.round(this.samplingStats.costSavingsEstimate * 100) / 100,
      configRates: {
        traces: this.config.traces,
        metrics: this.config.metrics,
        logs: this.config.logs,
      },
    };
  }

  // Update sampling configuration at runtime
  updateConfig(newConfig: Partial<SimpleSmartSamplingConfig>): void {
    Object.assign(this.config, this.validateAndNormalizeConfig({ ...this.config, ...newConfig }));
  }

  toString(): string {
    return `SimpleSmartSampler{traces=${this.config.traces}, metrics=${this.config.metrics}, logs=${this.config.logs}, preserveErrors=${this.config.preserveErrors}}`;
  }

  // Private helper methods

  private validateAndNormalizeConfig(config: SimpleSmartSamplingConfig): SimpleSmartSamplingConfig {
    // Validate sampling rates
    const rates = ["traces", "metrics", "logs"] as const;
    rates.forEach((rate) => {
      if (config[rate] < 0 || config[rate] > 1) {
        throw new Error(`${rate} sampling rate must be between 0 and 1, got: ${config[rate]}`);
      }
    });

    if (config.healthCheckSampling < 0 || config.healthCheckSampling > 1) {
      throw new Error(`healthCheckSampling rate must be between 0 and 1, got: ${config.healthCheckSampling}`);
    }

    return {
      ...config,
      // Ensure error preservation is always true in cost optimization mode
      preserveErrors: config.costOptimizationMode ? true : config.preserveErrors,
    };
  }

  private isErrorTrace(attributes?: Attributes): boolean {
    if (!attributes) return false;

    // Check common error indicators in trace attributes
    const httpStatusCode = attributes["http.status_code"];
    const hasError = attributes.error === true;
    const errorMessage = attributes["error.message"];

    return hasError || (httpStatusCode && Number(httpStatusCode) >= 400) || errorMessage !== undefined;
  }

  private isHealthCheckTrace(spanName: string, attributes?: Attributes): boolean {
    const healthIndicators = ["/health", "health-check", "healthz", "liveness", "readiness"];

    // Check span name
    if (healthIndicators.some((indicator) => spanName.toLowerCase().includes(indicator))) {
      return true;
    }

    // Check HTTP attributes
    const httpRoute = attributes?.["http.route"] || attributes?.["http.target"];
    if (httpRoute && healthIndicators.some((indicator) => String(httpRoute).toLowerCase().includes(indicator))) {
      return true;
    }

    return false;
  }

  private isErrorMetric(metricName: string, attributes?: Attributes): boolean {
    // Check metric name for error indicators
    const errorKeywords = ["error", "exception", "failure", "fault", "4xx", "5xx", "timeout"];
    if (errorKeywords.some((keyword) => metricName.toLowerCase().includes(keyword))) {
      return true;
    }

    // Check attributes for error indicators
    if (attributes) {
      const statusCode = attributes["http.status_code"];
      if (statusCode && Number(statusCode) >= 400) {
        return true;
      }
    }

    return false;
  }

  private isErrorLog(level: string, message?: string, attributes?: Attributes): boolean {
    // Error level logs
    if (level.toLowerCase() === "error") {
      return true;
    }

    // Check message for error indicators
    if (message) {
      const errorKeywords = ["error", "exception", "failed", "failure", "fatal", "critical"];
      if (errorKeywords.some((keyword) => message.toLowerCase().includes(keyword))) {
        return true;
      }
    }

    // Check attributes for error indicators
    if (attributes) {
      const hasError = attributes.error === true;
      const errorMessage = attributes["error.message"];
      if (hasError || errorMessage) {
        return true;
      }
    }

    return false;
  }

  private calculateCostSavings(samplingRate: number): number {
    // Calculate percentage savings from not sampling
    return (1 - samplingRate) * 100;
  }

  private updateStats(decision: SimpleSamplingDecision): void {
    this.samplingStats.totalDecisions++;

    if (decision.shouldSample) {
      this.samplingStats.sampledCount++;

      if (decision.reason.includes("error")) {
        this.samplingStats.errorPreservedCount++;
      }
    } else {
      // Accumulate cost savings
      this.samplingStats.costSavingsEstimate += (decision.costSavings || 0) / 100;
    }
  }
}

// Utility function to create a pre-configured cost-optimized sampler
export function createCostOptimizedSampler(customRates?: Partial<SimpleSmartSamplingConfig>): SimpleSmartSampler {
  const costOptimizedConfig: SimpleSmartSamplingConfig = {
    traces: 0.1, // 10% - aggressive cost reduction for traces
    metrics: 0.15, // 15% - moderate reduction for metrics
    logs: 0.2, // 20% - conservative reduction for logs

    preserveErrors: true, // Never compromise on error visibility
    costOptimizationMode: true,
    healthCheckSampling: 0.02, // 2% - minimal health check noise

    ...customRates, // Allow customization
  };

  return new SimpleSmartSampler(costOptimizedConfig);
}

// Utility function to create a high-fidelity sampler for debugging
export function createHighFidelitySampler(): SimpleSmartSampler {
  return new SimpleSmartSampler({
    traces: 0.5, // 50% - high trace coverage
    metrics: 0.75, // 75% - comprehensive metrics
    logs: 0.6, // 60% - detailed logging

    preserveErrors: true,
    costOptimizationMode: false,
    healthCheckSampling: 0.1, // 10% - more health check visibility
  });
}

// Utility function to estimate cost impact
export function estimateCostImpact(config: SimpleSmartSamplingConfig): {
  estimatedReduction: number;
  preservationRate: number;
  recommendedFor: string[];
} {
  // Calculate weighted average reduction (traces are typically most expensive)
  const weights = { traces: 0.6, metrics: 0.25, logs: 0.15 };
  const weightedReduction =
    (1 - config.traces) * weights.traces + (1 - config.metrics) * weights.metrics + (1 - config.logs) * weights.logs;

  const estimatedReduction = Math.round(weightedReduction * 100);
  const preservationRate = config.preserveErrors ? 100 : 0;

  const recommendedFor: string[] = [];
  if (estimatedReduction >= 70) recommendedFor.push("production cost optimization");
  if (estimatedReduction >= 50) recommendedFor.push("staging environments");
  if (estimatedReduction < 30) recommendedFor.push("development debugging");
  if (config.preserveErrors) recommendedFor.push("error-sensitive applications");

  return {
    estimatedReduction,
    preservationRate,
    recommendedFor,
  };
}
