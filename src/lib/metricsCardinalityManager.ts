/* src/lib/metricsCardinalityManager.ts */

import { error as err, log } from "../telemetry/logger";

export interface CardinalityLimit {
  metricName: string;
  maxCardinality: number;
  enabled: boolean;
  labelKeys?: string[]; // If specified, only these label keys count toward cardinality
}

export interface CardinalityStats {
  metricName: string;
  currentCardinality: number;
  maxCardinality: number;
  droppedLabels: number;
  violationsCount: number;
  lastViolation?: Date;
}

class MetricsCardinalityManager {
  private limits: Map<string, CardinalityLimit> = new Map();
  private metricLabels: Map<string, Set<string>> = new Map(); // metric -> label combinations
  private stats: Map<string, CardinalityStats> = new Map();
  private enabled = true;

  constructor() {
    // Default cardinality limits for common metrics
    this.setDefaultLimits();
  }

  /**
   * Set default cardinality limits for common metrics
   */
  private setDefaultLimits(): void {
    const defaultLimits: CardinalityLimit[] = [
      {
        metricName: "graphql_resolver_duration_ms",
        maxCardinality: 500,
        enabled: true,
        labelKeys: ["operation", "field", "status"],
      },
      {
        metricName: "graphql_resolver_calls_total",
        maxCardinality: 500,
        enabled: true,
        labelKeys: ["operation", "field"],
      },
      {
        metricName: "graphql_resolver_errors_total",
        maxCardinality: 300,
        enabled: true,
        labelKeys: ["operation", "field", "error"],
      },
      {
        metricName: "database_operation_duration_ms",
        maxCardinality: 200,
        enabled: true,
        labelKeys: ["operation", "status"],
      },
      {
        metricName: "http_requests_total",
        maxCardinality: 1000,
        enabled: true,
        labelKeys: ["method", "route", "status_code"],
      },
      {
        metricName: "capellaql_performance_metrics",
        maxCardinality: 100,
        enabled: true,
        labelKeys: ["component", "status"],
      },
    ];

    defaultLimits.forEach((limit) => {
      this.limits.set(limit.metricName, limit);
      this.stats.set(limit.metricName, {
        metricName: limit.metricName,
        currentCardinality: 0,
        maxCardinality: limit.maxCardinality,
        droppedLabels: 0,
        violationsCount: 0,
      });
    });

    log("Metrics cardinality manager initialized with default limits", {
      metricsCount: defaultLimits.length,
    });
  }

  /**
   * Set or update cardinality limit for a metric
   */
  setCardinalityLimit(metricName: string, limit: Partial<CardinalityLimit>): void {
    const existingLimit = this.limits.get(metricName);
    const newLimit: CardinalityLimit = {
      metricName,
      maxCardinality: limit.maxCardinality ?? 1000,
      enabled: limit.enabled ?? true,
      labelKeys: limit.labelKeys ?? undefined,
      ...existingLimit,
    };

    this.limits.set(metricName, newLimit);

    if (!this.stats.has(metricName)) {
      this.stats.set(metricName, {
        metricName,
        currentCardinality: 0,
        maxCardinality: newLimit.maxCardinality,
        droppedLabels: 0,
        violationsCount: 0,
      });
    }

    log(`Cardinality limit set for metric: ${metricName}`, newLimit);
  }

  /**
   * Check if a metric with given labels should be allowed
   */
  checkCardinality(
    metricName: string,
    labels: Record<string, string>
  ): {
    allowed: boolean;
    reason?: string;
    sanitizedLabels?: Record<string, string>;
  } {
    if (!this.enabled) {
      return { allowed: true };
    }

    const limit = this.limits.get(metricName);
    if (!limit || !limit.enabled) {
      return { allowed: true };
    }

    // Create label key for this specific combination
    const relevantLabels = this.getRelevantLabels(labels, limit.labelKeys);
    const sanitizedLabels = this.sanitizeLabels(relevantLabels);
    const labelKey = this.createLabelKey(sanitizedLabels);

    // Get or create metric label set
    if (!this.metricLabels.has(metricName)) {
      this.metricLabels.set(metricName, new Set());
    }

    const metricLabelSet = this.metricLabels.get(metricName)!;
    const stats = this.stats.get(metricName)!;

    // Check if this label combination already exists
    if (metricLabelSet.has(labelKey)) {
      return {
        allowed: true,
        sanitizedLabels,
      };
    }

    // Check if adding this label would exceed cardinality limit
    if (metricLabelSet.size >= limit.maxCardinality) {
      stats.droppedLabels++;
      stats.violationsCount++;
      stats.lastViolation = new Date();

      // Log cardinality violation
      if (stats.violationsCount % 100 === 1) {
        // Log every 100th violation to avoid spam
        err(`Cardinality limit exceeded for metric: ${metricName}`, {
          currentCardinality: metricLabelSet.size,
          maxCardinality: limit.maxCardinality,
          droppedLabels: stats.droppedLabels,
          attemptedLabels: sanitizedLabels,
        });
      }

      return {
        allowed: false,
        reason: `Cardinality limit (${limit.maxCardinality}) exceeded for metric ${metricName}`,
        sanitizedLabels: this.getFallbackLabels(metricName),
      };
    }

    // Add the new label combination
    metricLabelSet.add(labelKey);
    stats.currentCardinality = metricLabelSet.size;

    return {
      allowed: true,
      sanitizedLabels,
    };
  }

  /**
   * Get relevant labels based on configured label keys
   */
  private getRelevantLabels(labels: Record<string, string>, labelKeys?: string[]): Record<string, string> {
    if (!labelKeys) {
      return labels;
    }

    const relevantLabels: Record<string, string> = {};
    labelKeys.forEach((key) => {
      if (labels[key] !== undefined) {
        relevantLabels[key] = labels[key];
      }
    });

    return relevantLabels;
  }

  /**
   * Sanitize label values to prevent cardinality explosion
   */
  private sanitizeLabels(labels: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};

    for (const [key, value] of Object.entries(labels)) {
      let sanitizedValue = value;

      // Truncate very long values
      if (sanitizedValue.length > 100) {
        sanitizedValue = sanitizedValue.substring(0, 100) + "...";
      }

      // Replace problematic characters
      sanitizedValue = sanitizedValue.replace(/[^\w\-_.:/]/g, "_");

      // Handle common high-cardinality patterns
      if (key === "user_id" || key === "request_id" || key === "trace_id") {
        // For ID fields, keep only first few characters or hash
        sanitizedValue = this.hashHighCardinalityValue(sanitizedValue);
      }

      // Handle URLs
      if (key === "url" || key === "path") {
        sanitizedValue = this.sanitizeUrlPath(sanitizedValue);
      }

      // Handle IP addresses
      if (key === "client_ip" || key === "remote_addr") {
        sanitizedValue = this.sanitizeIpAddress(sanitizedValue);
      }

      sanitized[key] = sanitizedValue;
    }

    return sanitized;
  }

  /**
   * Hash high-cardinality values to reduce cardinality
   */
  private hashHighCardinalityValue(value: string): string {
    // Simple hash to first 8 characters for cardinality reduction
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      const char = value.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `hashed_${Math.abs(hash).toString(16).substring(0, 8)}`;
  }

  /**
   * Sanitize URL paths to reduce cardinality
   */
  private sanitizeUrlPath(path: string): string {
    // Replace dynamic segments with placeholders
    return path
      .replace(/\/\d+/g, "/:id") // /123 -> /:id
      .replace(/\/[a-f0-9-]{8,}/g, "/:uuid") // UUIDs -> :uuid
      .replace(/\/\w{20,}/g, "/:token") // Long tokens -> :token
      .replace(/\?.*$/, "") // Remove query params
      .substring(0, 100); // Limit length
  }

  /**
   * Sanitize IP addresses for privacy and cardinality
   */
  private sanitizeIpAddress(ip: string): string {
    // Mask last octet of IPv4 addresses
    if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
      return ip.replace(/\.\d+$/, ".0");
    }

    // For IPv6 or other formats, return generic placeholder
    return "masked_ip";
  }

  /**
   * Create a consistent key for label combinations
   */
  private createLabelKey(labels: Record<string, string>): string {
    const sortedKeys = Object.keys(labels).sort();
    return sortedKeys.map((key) => `${key}=${labels[key]}`).join("|");
  }

  /**
   * Get fallback labels for high-cardinality metrics
   */
  private getFallbackLabels(metricName: string): Record<string, string> {
    // Provide generic fallback labels to prevent data loss
    return {
      status: "cardinality_limited",
      metric: metricName,
      reason: "high_cardinality",
    };
  }

  /**
   * Get current cardinality statistics
   */
  getCardinalityStats(): CardinalityStats[] {
    return Array.from(this.stats.values());
  }

  /**
   * Reset cardinality tracking (useful for testing or periodic cleanup)
   */
  resetCardinality(metricName?: string): void {
    if (metricName) {
      this.metricLabels.delete(metricName);
      const stats = this.stats.get(metricName);
      if (stats) {
        stats.currentCardinality = 0;
        stats.droppedLabels = 0;
        stats.violationsCount = 0;
        delete stats.lastViolation;
      }
    } else {
      this.metricLabels.clear();
      this.stats.forEach((stats) => {
        stats.currentCardinality = 0;
        stats.droppedLabels = 0;
        stats.violationsCount = 0;
        delete stats.lastViolation;
      });
    }

    log(`Cardinality tracking reset${metricName ? ` for ${metricName}` : " for all metrics"}`);
  }

  /**
   * Enable or disable cardinality management
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    log(`Metrics cardinality management ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * Get configuration summary
   */
  getConfiguration(): {
    enabled: boolean;
    limitsCount: number;
    totalMetrics: number;
    limits: CardinalityLimit[];
  } {
    return {
      enabled: this.enabled,
      limitsCount: this.limits.size,
      totalMetrics: this.metricLabels.size,
      limits: Array.from(this.limits.values()),
    };
  }

  /**
   * Periodic maintenance - cleanup old label combinations if needed
   */
  performMaintenance(): void {
    let totalCardinality = 0;
    const cleanedMetrics = 0;

    this.metricLabels.forEach((labelSet, metricName) => {
      totalCardinality += labelSet.size;

      // If a metric has grown very large, log a warning
      const limit = this.limits.get(metricName);
      if (limit && labelSet.size > limit.maxCardinality * 0.8) {
        log(`High cardinality warning for metric: ${metricName}`, {
          current: labelSet.size,
          limit: limit.maxCardinality,
          usage: `${Math.round((labelSet.size / limit.maxCardinality) * 100)}%`,
        });
      }
    });

    log("Cardinality maintenance completed", {
      totalMetrics: this.metricLabels.size,
      totalCardinality,
      cleanedMetrics,
    });
  }
}

// Create singleton instance
export const metricsCardinalityManager = new MetricsCardinalityManager();

// Export helper function for easy integration
export function withCardinalityCheck<T extends Record<string, string>>(
  metricName: string,
  labels: T
): { allowed: boolean; labels: T } {
  const result = metricsCardinalityManager.checkCardinality(metricName, labels);
  return {
    allowed: result.allowed,
    labels: (result.sanitizedLabels as T) || labels,
  };
}
