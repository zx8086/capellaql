/* src/telemetry/sampling/SmartSampler.ts */

import {
  type Attributes,
  type Context,
  type Link,
  type Sampler,
  SamplingDecision,
  type SamplingResult,
  type SpanKind,
} from "@opentelemetry/api";

export interface SmartSamplingConfig {
  defaultSamplingRate: number; // 0.15 for 15% (2025 standard)
  errorSamplingRate: number; // 1.0 for 100% (2025 standard)
  enabledEndpoints?: string[]; // Optional specific endpoint sampling
}

export class SmartSampler implements Sampler {
  private readonly config: SmartSamplingConfig;

  constructor(
    config: SmartSamplingConfig = {
      defaultSamplingRate: 0.15, // 15% default sampling (2025 standard)
      errorSamplingRate: 1.0, // 100% error retention (2025 standard)
    }
  ) {
    this.config = config;

    // Validate configuration
    if (config.defaultSamplingRate < 0 || config.defaultSamplingRate > 1) {
      throw new Error("Default sampling rate must be between 0 and 1");
    }
    if (config.errorSamplingRate < 0 || config.errorSamplingRate > 1) {
      throw new Error("Error sampling rate must be between 0 and 1");
    }
  }

  shouldSample(
    _context: Context,
    _traceId: string,
    spanName: string,
    _spanKind: SpanKind,
    attributes: Attributes,
    _links: Link[]
  ): SamplingResult {
    // Always sample errors (100% error retention - 2025 standard)
    const httpStatusCode = attributes["http.status_code"];
    const hasError = attributes.error === true;

    if (hasError || (httpStatusCode && Number(httpStatusCode) >= 400)) {
      return {
        decision: SamplingDecision.RECORD_AND_SAMPLED,
        attributes: {
          "sampling.reason": "error_retention",
          "sampling.rate": this.config.errorSamplingRate,
        },
      };
    }

    // Check for specific endpoint sampling rules
    if (this.config.enabledEndpoints) {
      const httpRoute = attributes["http.route"] || attributes["http.target"];
      if (httpRoute && this.config.enabledEndpoints.some((endpoint) => String(httpRoute).includes(endpoint))) {
        return {
          decision: SamplingDecision.RECORD_AND_SAMPLED,
          attributes: {
            "sampling.reason": "endpoint_enabled",
            "sampling.rate": 1.0,
          },
        };
      }
    }

    // Health checks - lower sampling rate
    if (spanName.includes("/health") || spanName.includes("health")) {
      const healthSamplingRate = this.config.defaultSamplingRate * 0.1; // 1.5% for health checks
      const shouldSample = Math.random() < healthSamplingRate;
      return {
        decision: shouldSample ? SamplingDecision.RECORD_AND_SAMPLED : SamplingDecision.NOT_RECORD,
        attributes: shouldSample
          ? {
              "sampling.reason": "health_check",
              "sampling.rate": healthSamplingRate,
            }
          : undefined,
      };
    }

    // Default sampling (15% - 2025 standard)
    const shouldSample = Math.random() < this.config.defaultSamplingRate;

    return {
      decision: shouldSample ? SamplingDecision.RECORD_AND_SAMPLED : SamplingDecision.NOT_RECORD,
      attributes: shouldSample
        ? {
            "sampling.reason": "default_sampling",
            "sampling.rate": this.config.defaultSamplingRate,
          }
        : undefined,
    };
  }

  toString(): string {
    return `SmartSampler{defaultRate=${this.config.defaultSamplingRate}, errorRate=${this.config.errorSamplingRate}}`;
  }
}
