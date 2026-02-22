/* src/telemetry/sampling/UnifiedSamplingCoordinator.ts */

import {
  type Attributes,
  type Context,
  type Link,
  type Sampler,
  SamplingDecision,
  type SamplingResult,
  type SpanKind,
  trace,
} from "@opentelemetry/api";
import { SmartSampler, type SmartSamplingConfig } from "./SmartSampler";

// Metric sampling categories aligned with 2025 OpenTelemetry standards
export interface MetricSamplingConfig {
  businessMetrics: number; // 1.0 = 100% - revenue, conversions, user actions
  technicalMetrics: number; // 0.75 = 75% - response times, latency, throughput
  infrastructureMetrics: number; // 0.5 = 50% - memory, CPU, disk usage
  debugMetrics: number; // 0.25 = 25% - development and diagnostic metrics
}

// Log sampling configuration (inherited from existing implementation)
export interface LogSamplingConfig {
  debug: number; // 0.1 = 10% - reduce debug noise
  info: number; // 0.5 = 50% - balanced info logging
  warn: number; // 0.9 = 90% - high warn visibility
  error: number; // 1.0 = 100% - never drop errors
}

export interface UnifiedSamplingConfig {
  // Trace sampling (using existing SmartSampler)
  trace: SmartSamplingConfig;

  // Metric sampling by category
  metrics: MetricSamplingConfig;

  // Log sampling by level
  logs: LogSamplingConfig;
}

// Sampling decision reasons for observability
export const SAMPLING_REASONS = {
  // Trace sampling reasons
  TRACE_ERROR_RETENTION: "trace_error_retention",
  TRACE_ENDPOINT_ENABLED: "trace_endpoint_enabled",
  TRACE_HEALTH_CHECK: "trace_health_check",
  TRACE_DEFAULT_SAMPLING: "trace_default_sampling",

  // Metric sampling reasons
  METRIC_BUSINESS_CRITICAL: "metric_business_critical",
  METRIC_TECHNICAL_SAMPLED: "metric_technical_sampled",
  METRIC_INFRASTRUCTURE_SAMPLED: "metric_infrastructure_sampled",
  METRIC_DEBUG_SAMPLED: "metric_debug_sampled",

  // Log sampling reasons
  LOG_LEVEL_SAMPLED: "log_level_sampled",
  LOG_ERROR_RETENTION: "log_error_retention",
} as const;

export type SamplingReason = (typeof SAMPLING_REASONS)[keyof typeof SAMPLING_REASONS];

// Metric categories for classification
export const METRIC_CATEGORIES = {
  BUSINESS: "business",
  TECHNICAL: "technical",
  INFRASTRUCTURE: "infrastructure",
  DEBUG: "debug",
} as const;

export type MetricCategory = (typeof METRIC_CATEGORIES)[keyof typeof METRIC_CATEGORIES];

// Sampling decision result with enhanced metadata
export interface UnifiedSamplingDecision {
  shouldSample: boolean;
  reason: SamplingReason;
  samplingRate: number;
  traceId?: string;
  correlationId?: string;
}

// Metric classification patterns for automatic categorization
const METRIC_CLASSIFICATION_PATTERNS = {
  [METRIC_CATEGORIES.BUSINESS]: [
    /revenue/i,
    /conversion/i,
    /user_action/i,
    /purchase/i,
    /signup/i,
    /order/i,
    /payment/i,
    /subscription/i,
    /engagement/i,
    /retention/i,
  ],
  [METRIC_CATEGORIES.TECHNICAL]: [
    /http_/i,
    /graphql_/i,
    /response_time/i,
    /latency/i,
    /throughput/i,
    /request/i,
    /query/i,
    /operation/i,
    /duration/i,
    /rate/i,
  ],
  [METRIC_CATEGORIES.INFRASTRUCTURE]: [
    /memory/i,
    /cpu/i,
    /disk/i,
    /network/i,
    /connection/i,
    /gc_/i,
    /heap/i,
    /process_/i,
    /system_/i,
    /resource/i,
  ],
  [METRIC_CATEGORIES.DEBUG]: [
    /debug/i,
    /trace/i,
    /internal/i,
    /diagnostic/i,
    /dev_/i,
    /test_/i,
    /sample/i,
    /mock/i,
    /benchmark/i,
  ],
};

export class UnifiedSamplingCoordinator implements Sampler {
  private readonly config: UnifiedSamplingConfig;
  private readonly traceSampler: SmartSampler;
  private readonly traceIdCache = new Map<string, UnifiedSamplingDecision>();

  constructor(config: UnifiedSamplingConfig) {
    this.config = config;
    this.traceSampler = new SmartSampler(config.trace);

    // Validate configuration
    this.validateConfiguration(config);
  }

  // Implement Sampler interface for trace sampling
  shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
    links: Link[]
  ): SamplingResult {
    const result = this.traceSampler.shouldSample(context, traceId, spanName, spanKind, attributes, links);

    // Cache the decision for correlation with logs and metrics
    this.cacheDecision(traceId, {
      shouldSample: result.decision === SamplingDecision.RECORD_AND_SAMPLED,
      reason: (result.attributes?.["sampling.reason"] as SamplingReason) || SAMPLING_REASONS.TRACE_DEFAULT_SAMPLING,
      samplingRate: (result.attributes?.["sampling.rate"] as number) || this.config.trace.defaultSamplingRate,
      traceId,
    });

    return result;
  }

  // Determine if a metric should be sampled
  shouldSampleMetric(metricName: string, attributes?: Attributes): UnifiedSamplingDecision {
    const category = this.classifyMetric(metricName, attributes);
    const samplingRate = this.getSamplingRateForCategory(category);
    const shouldSample = Math.random() < samplingRate;

    // Get correlation context from active trace
    const traceId = this.getActiveTraceId();
    const correlationId = traceId || this.generateCorrelationId();

    const decision: UnifiedSamplingDecision = {
      shouldSample,
      reason: this.getSamplingReasonForCategory(category),
      samplingRate,
      traceId,
      correlationId,
    };

    // For correlated sampling: if trace is sampled, sample related metrics
    if (traceId && this.isTraceSampled(traceId)) {
      decision.shouldSample = true;
      decision.reason = SAMPLING_REASONS.TRACE_DEFAULT_SAMPLING; // Inherit from trace
    }

    return decision;
  }

  // Determine if a log should be sampled
  shouldSampleLog(level: string, message?: string, traceId?: string): UnifiedSamplingDecision {
    const logLevel = level.toLowerCase();
    const samplingRate = this.getLogSamplingRate(logLevel);
    let shouldSample = Math.random() < samplingRate;
    let reason = SAMPLING_REASONS.LOG_LEVEL_SAMPLED;

    // Always sample errors (100% error retention)
    if (logLevel === "error" || this.isErrorLog(message)) {
      shouldSample = true;
      reason = SAMPLING_REASONS.LOG_ERROR_RETENTION;
    }

    const correlationId = traceId || this.getActiveTraceId() || this.generateCorrelationId();

    const decision: UnifiedSamplingDecision = {
      shouldSample,
      reason,
      samplingRate,
      traceId: traceId || this.getActiveTraceId(),
      correlationId,
    };

    // For correlated sampling: if trace is sampled, sample related logs
    if (traceId && this.isTraceSampled(traceId)) {
      decision.shouldSample = true;
    }

    return decision;
  }

  // Get sampling configuration for external inspection
  getConfig(): UnifiedSamplingConfig {
    return { ...this.config };
  }

  // Get sampling statistics
  getSamplingStats(): {
    trace: { defaultRate: number; errorRate: number };
    metrics: MetricSamplingConfig;
    logs: LogSamplingConfig;
    cacheSize: number;
  } {
    return {
      trace: {
        defaultRate: this.config.trace.defaultSamplingRate,
        errorRate: this.config.trace.errorSamplingRate,
      },
      metrics: { ...this.config.metrics },
      logs: { ...this.config.logs },
      cacheSize: this.traceIdCache.size,
    };
  }

  toString(): string {
    return `UnifiedSamplingCoordinator{trace=${this.traceSampler.toString()}, metricRates=${JSON.stringify(this.config.metrics)}, logRates=${JSON.stringify(this.config.logs)}}`;
  }

  // Private helper methods

  private validateConfiguration(config: UnifiedSamplingConfig): void {
    // Validate trace config (done by SmartSampler)

    // Validate metric sampling rates
    Object.values(config.metrics).forEach((rate, index) => {
      if (rate < 0 || rate > 1) {
        throw new Error(`Metric sampling rate at index ${index} must be between 0 and 1`);
      }
    });

    // Validate log sampling rates
    Object.values(config.logs).forEach((rate, index) => {
      if (rate < 0 || rate > 1) {
        throw new Error(`Log sampling rate at index ${index} must be between 0 and 1`);
      }
    });
  }

  private classifyMetric(metricName: string, attributes?: Attributes): MetricCategory {
    // Check attributes first for explicit category
    if (attributes?.metric_category) {
      const category = attributes.metric_category as string;
      if (Object.values(METRIC_CATEGORIES).includes(category as MetricCategory)) {
        return category as MetricCategory;
      }
    }

    // Pattern-based classification
    for (const [category, patterns] of Object.entries(METRIC_CLASSIFICATION_PATTERNS)) {
      if (patterns.some((pattern) => pattern.test(metricName))) {
        return category as MetricCategory;
      }
    }

    // Default to technical metrics
    return METRIC_CATEGORIES.TECHNICAL;
  }

  private getSamplingRateForCategory(category: MetricCategory): number {
    switch (category) {
      case METRIC_CATEGORIES.BUSINESS:
        return this.config.metrics.businessMetrics;
      case METRIC_CATEGORIES.TECHNICAL:
        return this.config.metrics.technicalMetrics;
      case METRIC_CATEGORIES.INFRASTRUCTURE:
        return this.config.metrics.infrastructureMetrics;
      case METRIC_CATEGORIES.DEBUG:
        return this.config.metrics.debugMetrics;
      default:
        return this.config.metrics.technicalMetrics;
    }
  }

  private getSamplingReasonForCategory(category: MetricCategory): SamplingReason {
    switch (category) {
      case METRIC_CATEGORIES.BUSINESS:
        return SAMPLING_REASONS.METRIC_BUSINESS_CRITICAL;
      case METRIC_CATEGORIES.TECHNICAL:
        return SAMPLING_REASONS.METRIC_TECHNICAL_SAMPLED;
      case METRIC_CATEGORIES.INFRASTRUCTURE:
        return SAMPLING_REASONS.METRIC_INFRASTRUCTURE_SAMPLED;
      case METRIC_CATEGORIES.DEBUG:
        return SAMPLING_REASONS.METRIC_DEBUG_SAMPLED;
      default:
        return SAMPLING_REASONS.METRIC_TECHNICAL_SAMPLED;
    }
  }

  private getLogSamplingRate(level: string): number {
    switch (level) {
      case "debug":
        return this.config.logs.debug;
      case "info":
        return this.config.logs.info;
      case "warn":
      case "warning":
        return this.config.logs.warn;
      case "error":
        return this.config.logs.error;
      default:
        return this.config.logs.info;
    }
  }

  private isErrorLog(message?: string): boolean {
    if (!message) return false;
    const errorPatterns = [/error/i, /exception/i, /failed/i, /failure/i, /fatal/i];
    return errorPatterns.some((pattern) => pattern.test(message));
  }

  private getActiveTraceId(): string | undefined {
    try {
      const span = trace.getActiveSpan();
      return span?.spanContext().traceId;
    } catch {
      return undefined;
    }
  }

  private generateCorrelationId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private cacheDecision(traceId: string, decision: UnifiedSamplingDecision): void {
    // Keep cache size manageable
    if (this.traceIdCache.size > 10000) {
      const firstKey = this.traceIdCache.keys().next().value;
      if (firstKey) {
        this.traceIdCache.delete(firstKey);
      }
    }

    this.traceIdCache.set(traceId, decision);
  }

  private isTraceSampled(traceId: string): boolean {
    const decision = this.traceIdCache.get(traceId);
    return decision?.shouldSample ?? false;
  }
}

// Default configuration aligned with 2025 OpenTelemetry standards
export const DEFAULT_UNIFIED_SAMPLING_CONFIG: UnifiedSamplingConfig = {
  trace: {
    defaultSamplingRate: 0.15, // 15% default sampling (2025 standard)
    errorSamplingRate: 1.0, // 100% error retention (2025 standard)
  },
  metrics: {
    businessMetrics: 1.0, // 100% - never drop business metrics
    technicalMetrics: 0.75, // 75% - most technical metrics
    infrastructureMetrics: 0.5, // 50% - infrastructure monitoring
    debugMetrics: 0.25, // 25% - development metrics
  },
  logs: {
    debug: 0.1, // 10% - reduce debug noise
    info: 0.5, // 50% - balanced info logging
    warn: 0.9, // 90% - high warn visibility
    error: 1.0, // 100% - never drop errors
  },
};
