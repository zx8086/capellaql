import { debug, log as info, warn } from "../telemetry/logger";

export interface QueryMetric {
  operationType: string;
  query?: string;
  queryHash?: string;
  duration: number;
  success: boolean;
  errorType?: string;
  documentKey?: string;
  bucket?: string;
  scope?: string;
  collection?: string;
  timestamp: number;
  requestId?: string;
}

export interface PerformanceStats {
  totalQueries: number;
  averageQueryTime: number;
  slowQueries: number;
  errorRate: number;
  documentsPerSecond: number;
  peakQueriesPerSecond: number;
  connectionLatency: number;
  lastResetTime: number;
}

class CouchbaseMetricsCollector {
  private queryMetrics: QueryMetric[] = [];
  private readonly maxMetricsHistory = 10000; // Keep last 10k operations
  private readonly slowQueryThreshold = 1000; // 1 second
  private startTime = Date.now();
  private lastStatsCalculation = 0;
  private cachedStats: PerformanceStats | null = null;

  recordQueryMetric(metric: QueryMetric): void {
    try {
      // Add hash for query identification without storing full query text
      if (metric.query && metric.query.length > 100) {
        metric.queryHash = this.generateQueryHash(metric.query);
        metric.query = `${metric.query.substring(0, 100)}...`; // Truncate for storage
      }

      this.queryMetrics.push(metric);

      // Maintain circular buffer
      if (this.queryMetrics.length > this.maxMetricsHistory) {
        this.queryMetrics.shift();
      }

      // Log slow queries immediately
      if (metric.duration > this.slowQueryThreshold) {
        warn("Slow query detected", {
          operationType: metric.operationType,
          duration: metric.duration,
          queryHash: metric.queryHash,
          bucket: metric.bucket,
          collection: metric.collection,
          requestId: metric.requestId,
        });
      }

      // Clear cached stats to force recalculation
      this.cachedStats = null;
    } catch (error) {
      // Don't let metrics collection interfere with operations
      debug("Error recording query metric", { error, metric: { ...metric, query: "[redacted]" } });
    }
  }

  getPerformanceStats(forceRecalculate = false): PerformanceStats {
    const now = Date.now();

    // Use cached stats if recent (within 30 seconds)
    if (!forceRecalculate && this.cachedStats && now - this.lastStatsCalculation < 30000) {
      return this.cachedStats;
    }

    const recentTimeWindow = 5 * 60 * 1000; // 5 minutes
    const recentMetrics = this.queryMetrics.filter((m) => now - m.timestamp < recentTimeWindow);

    if (recentMetrics.length === 0) {
      this.cachedStats = {
        totalQueries: 0,
        averageQueryTime: 0,
        slowQueries: 0,
        errorRate: 0,
        documentsPerSecond: 0,
        peakQueriesPerSecond: 0,
        connectionLatency: 0,
        lastResetTime: this.startTime,
      };
      this.lastStatsCalculation = now;
      return this.cachedStats;
    }

    const totalDuration = recentMetrics.reduce((sum, m) => sum + m.duration, 0);
    const successfulQueries = recentMetrics.filter((m) => m.success);
    const slowQueries = recentMetrics.filter((m) => m.duration > this.slowQueryThreshold);

    // Calculate queries per second in recent window
    const timeRangeSeconds = Math.max(1, (now - Math.min(...recentMetrics.map((m) => m.timestamp))) / 1000);
    const queriesPerSecond = recentMetrics.length / timeRangeSeconds;

    // Calculate peak QPS by looking at 10-second windows
    const peakQps = this.calculatePeakQPS(recentMetrics);

    this.cachedStats = {
      totalQueries: recentMetrics.length,
      averageQueryTime: Math.round(totalDuration / recentMetrics.length),
      slowQueries: slowQueries.length,
      errorRate: ((recentMetrics.length - successfulQueries.length) / recentMetrics.length) * 100,
      documentsPerSecond: Math.round(queriesPerSecond),
      peakQueriesPerSecond: Math.round(peakQps),
      connectionLatency: this.getAverageConnectionLatency(recentMetrics),
      lastResetTime: this.startTime,
    };

    this.lastStatsCalculation = now;
    return this.cachedStats;
  }

  getSlowQueries(limit = 10): QueryMetric[] {
    return this.queryMetrics
      .filter((m) => m.duration > this.slowQueryThreshold)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit)
      .map((m) => ({
        ...m,
        query: m.query, // Keep truncated query for analysis
      }));
  }

  getErrorBreakdown(): Record<string, number> {
    const errorCounts: Record<string, number> = {};
    const recentErrors = this.queryMetrics
      .filter((m) => !m.success && m.errorType)
      .filter((m) => Date.now() - m.timestamp < 5 * 60 * 1000); // Last 5 minutes

    for (const metric of recentErrors) {
      if (metric.errorType) {
        errorCounts[metric.errorType] = (errorCounts[metric.errorType] || 0) + 1;
      }
    }

    return errorCounts;
  }

  getQueryTypeBreakdown(): Record<string, { count: number; avgDuration: number }> {
    const breakdown: Record<string, { total: number; totalDuration: number; count: number }> = {};
    const recentMetrics = this.queryMetrics.filter((m) => Date.now() - m.timestamp < 5 * 60 * 1000);

    for (const metric of recentMetrics) {
      if (!breakdown[metric.operationType]) {
        breakdown[metric.operationType] = { total: 0, totalDuration: 0, count: 0 };
      }
      breakdown[metric.operationType].total++;
      breakdown[metric.operationType].totalDuration += metric.duration;
      breakdown[metric.operationType].count++;
    }

    const result: Record<string, { count: number; avgDuration: number }> = {};
    for (const [type, data] of Object.entries(breakdown)) {
      result[type] = {
        count: data.count,
        avgDuration: Math.round(data.totalDuration / data.count),
      };
    }

    return result;
  }

  reset(): void {
    this.queryMetrics = [];
    this.startTime = Date.now();
    this.cachedStats = null;
    info("Couchbase metrics reset", { timestamp: this.startTime });
  }

  private generateQueryHash(query: string): string {
    // Simple hash function for query identification
    let hash = 0;
    for (let i = 0; i < Math.min(query.length, 200); i++) {
      const char = query.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  private calculatePeakQPS(metrics: QueryMetric[]): number {
    if (metrics.length === 0) return 0;

    const windowSize = 10000; // 10 seconds
    const buckets: Record<number, number> = {};

    for (const metric of metrics) {
      const bucket = Math.floor(metric.timestamp / windowSize);
      buckets[bucket] = (buckets[bucket] || 0) + 1;
    }

    const maxCount = Math.max(...Object.values(buckets));
    return (maxCount / windowSize) * 1000; // Convert to per second
  }

  private getAverageConnectionLatency(metrics: QueryMetric[]): number {
    // This would typically come from connection-level metrics
    // For now, estimate based on query performance
    const connectionMetrics = metrics.filter((m) => m.operationType === "getCluster");
    if (connectionMetrics.length === 0) return 0;

    const totalLatency = connectionMetrics.reduce((sum, m) => sum + m.duration, 0);
    return Math.round(totalLatency / connectionMetrics.length);
  }

  // Diagnostic method for troubleshooting
  getDiagnosticInfo(): {
    metricsCount: number;
    oldestMetric: number;
    newestMetric: number;
    memoryUsage: string;
  } {
    const _now = Date.now();
    const oldest = this.queryMetrics.length > 0 ? Math.min(...this.queryMetrics.map((m) => m.timestamp)) : 0;
    const newest = this.queryMetrics.length > 0 ? Math.max(...this.queryMetrics.map((m) => m.timestamp)) : 0;

    // Rough memory usage calculation
    const avgMetricSize = 200; // bytes
    const memoryUsageBytes = this.queryMetrics.length * avgMetricSize;
    const memoryUsage =
      memoryUsageBytes > 1024 * 1024
        ? `${(memoryUsageBytes / (1024 * 1024)).toFixed(1)}MB`
        : `${(memoryUsageBytes / 1024).toFixed(1)}KB`;

    return {
      metricsCount: this.queryMetrics.length,
      oldestMetric: oldest,
      newestMetric: newest,
      memoryUsage,
    };
  }
}

// Singleton instance
export const couchbaseMetrics = new CouchbaseMetricsCollector();

// Helper functions for easy integration
export function recordQuery(
  operationType: string,
  duration: number,
  success: boolean,
  options: {
    query?: string;
    errorType?: string;
    documentKey?: string;
    bucket?: string;
    scope?: string;
    collection?: string;
    requestId?: string;
  } = {}
): void {
  couchbaseMetrics.recordQueryMetric({
    operationType,
    duration,
    success,
    timestamp: Date.now(),
    ...options,
  });
}

export function getPerformanceStats(forceRecalculate = false): PerformanceStats {
  return couchbaseMetrics.getPerformanceStats(forceRecalculate);
}

export function getSlowQueries(limit = 10): QueryMetric[] {
  return couchbaseMetrics.getSlowQueries(limit);
}

export function getErrorBreakdown(): Record<string, number> {
  return couchbaseMetrics.getErrorBreakdown();
}

export function getQueryTypeBreakdown(): Record<string, { count: number; avgDuration: number }> {
  return couchbaseMetrics.getQueryTypeBreakdown();
}

export function resetMetrics(): void {
  couchbaseMetrics.reset();
}
