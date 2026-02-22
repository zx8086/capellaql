/* src/server/handlers/health.ts */

import { getGraphQLPerformanceStats, getRecentGraphQLPerformance } from "../../lib/graphqlPerformanceTracker";
import { getPerformanceHistory, getPerformanceMetrics, getPerformanceTrends } from "../../lib/performanceMonitor";
import { getSystemHealth, getSystemHealthSummary } from "../../lib/systemHealth";
import { err, getTelemetryHealth } from "../../telemetry";
import { createHealthcheck } from "../../utils/bunUtils";
import type { RouteHandler } from "../types";

// JSON response helper
function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * /health - Basic health check
 */
export const basicHealthHandler: RouteHandler = async (_request, _context) => {
  try {
    const healthStatus = await createHealthcheck();
    return jsonResponse(healthStatus);
  } catch (error) {
    err("Health check failed", error);
    return jsonResponse(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        version: "2.0.0",
      },
      500
    );
  }
};

/**
 * /health/telemetry - Telemetry health status
 */
export const telemetryHealthHandler: RouteHandler = async (_request, _context) => {
  try {
    const telemetryHealth = getTelemetryHealth();
    return jsonResponse(telemetryHealth);
  } catch (error) {
    err("Failed to get telemetry health", error);
    return jsonResponse(
      {
        status: "unhealthy",
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      },
      500
    );
  }
};

/**
 * /health/system - System health details
 */
export const systemHealthHandler: RouteHandler = async (_request, _context) => {
  try {
    const systemHealth = await getSystemHealth();
    return jsonResponse(systemHealth);
  } catch (error) {
    err("System health check failed", error);
    return jsonResponse(
      {
        overall: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        components: {
          database: {
            status: "unhealthy",
            error: "Health check failed",
            circuitBreaker: { state: "unknown", failures: 0, successes: 0 },
          },
          runtime: {
            status: "unhealthy",
            error: "Health check failed",
            memory: { used: 0, free: 0, total: 0, heapUsed: 0, heapTotal: 0 },
            environment: "unknown",
            version: "unknown",
          },
          telemetry: {
            status: "unhealthy",
            error: "Health check failed",
            exporters: { traces: false, metrics: false, logs: false },
            circuitBreaker: { state: "unknown", failures: 0 },
          },
        },
        performance: { memoryUsage: 0 },
      },
      500
    );
  }
};

/**
 * /health/summary - System health summary
 */
export const healthSummaryHandler: RouteHandler = async (_request, _context) => {
  try {
    const healthSummary = await getSystemHealthSummary();
    return jsonResponse(healthSummary);
  } catch (error) {
    err("System health summary failed", error);
    return jsonResponse(
      {
        status: "unhealthy",
        message: "Health check failed",
        criticalIssues: [error instanceof Error ? error.message : String(error)],
      },
      500
    );
  }
};

/**
 * /health/performance - Performance metrics
 */
export const performanceHandler: RouteHandler = async (_request, _context) => {
  try {
    const performanceMetrics = await getPerformanceMetrics();
    return jsonResponse(performanceMetrics);
  } catch (error) {
    err("Performance metrics collection failed", error);
    return jsonResponse(
      {
        timestamp: new Date().toISOString(),
        database: { latency: -1, connectionStatus: "disconnected", errorRate: 1 },
        runtime: { memoryUsage: -1, heapUsage: -1 },
        telemetry: {
          exportLatency: -1,
          droppedSpans: -1,
          batchSize: -1,
          samplingRate: -1,
          circuitBreakerState: "unknown",
        },
        correlations: {
          databaseToMemory: 0,
          telemetryToPerformance: 0,
          overallHealth: "unhealthy" as const,
        },
        error: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
};

/**
 * /health/performance/history - Performance history
 */
export const performanceHistoryHandler: RouteHandler = async (request, _context) => {
  try {
    const url = new URL(request.url);
    const countParam = url.searchParams.get("count");
    const count = countParam ? parseInt(countParam, 10) : 10;
    const performanceHistory = getPerformanceHistory(Math.min(count, 50));

    return jsonResponse({
      metrics: performanceHistory,
      count: performanceHistory.length,
      trends: getPerformanceTrends(),
    });
  } catch (error) {
    err("Performance history collection failed", error);
    return jsonResponse(
      {
        metrics: [],
        count: 0,
        trends: {
          databaseLatencyTrend: "stable",
          memoryUsageTrend: "stable",
          overallTrend: "stable",
        },
        error: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
};

/**
 * /health/cache - Cache analytics
 */
export const cacheHealthHandler: RouteHandler = async (_request, _context) => {
  try {
    const { bunSQLiteCache } = await import("../../lib/bunSQLiteCache");
    const { defaultQueryCache } = await import("../../lib/queryCache");

    const sqliteStats = bunSQLiteCache.getStats();
    const sqliteAnalytics = bunSQLiteCache.getAnalytics();
    const mapCacheStats = defaultQueryCache.getStats();

    return jsonResponse({
      timestamp: new Date().toISOString(),
      sqlite: {
        ...sqliteStats,
        analytics: sqliteAnalytics,
        enabled: typeof Bun !== "undefined",
      },
      mapCache: {
        ...mapCacheStats,
        hitRate:
          mapCacheStats.hits + mapCacheStats.misses > 0
            ? ((mapCacheStats.hits / (mapCacheStats.hits + mapCacheStats.misses)) * 100).toFixed(2)
            : 0,
      },
      comparison: {
        totalHits: sqliteStats.hits + mapCacheStats.hits,
        totalMisses: sqliteStats.misses + mapCacheStats.misses,
        totalMemoryMB: (sqliteStats.memoryUsage + mapCacheStats.memoryUsage) / (1024 * 1024),
        preferredCache: typeof Bun !== "undefined" ? "sqlite" : "map",
      },
    });
  } catch (error) {
    err("Cache metrics collection failed", error);
    return jsonResponse(
      {
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        sqlite: { enabled: false, hits: 0, misses: 0, size: 0, memoryUsage: 0, hitRate: 0 },
        mapCache: { hits: 0, misses: 0, size: 0, memoryUsage: 0, hitRate: 0 },
        comparison: { totalHits: 0, totalMisses: 0, totalMemoryMB: 0, preferredCache: "none" },
      },
      500
    );
  }
};

/**
 * /health/telemetry/detailed - Detailed telemetry metrics
 */
export const telemetryDetailedHandler: RouteHandler = async (_request, _context) => {
  try {
    const { getBatchCoordinator } = await import("../../telemetry/coordinator/BatchCoordinator");
    const batchCoordinator = getBatchCoordinator();

    const statistics = batchCoordinator.getStatistics();
    const bufferStatus = batchCoordinator.getBufferStatus();
    const telemetryHealth = getTelemetryHealth();

    return jsonResponse({
      timestamp: new Date().toISOString(),
      batchCoordinator: {
        statistics,
        buffers: {
          traces: bufferStatus.traces,
          metrics: bufferStatus.metrics,
          logs: bufferStatus.logs,
          memoryUsageMB: bufferStatus.memoryUsageMB,
        },
        memoryPressure: bufferStatus.memoryPressure,
        performance: {
          averageExportDuration: statistics.averageExportDuration,
          successRate:
            statistics.totalBatches > 0
              ? ((statistics.successfulBatches / statistics.totalBatches) * 100).toFixed(2)
              : 100,
          emergencyFlushRate:
            statistics.totalBatches > 0
              ? ((statistics.emergencyFlushCount / statistics.totalBatches) * 100).toFixed(2)
              : 0,
          dataLossRate:
            statistics.totalSpansExported > 0
              ? ((statistics.dataDropCount / (statistics.totalSpansExported + statistics.dataDropCount)) * 100).toFixed(
                  2
                )
              : 0,
        },
      },
      exporters: telemetryHealth,
      recommendations: generateTelemetryRecommendations(statistics, bufferStatus.memoryPressure),
    });
  } catch (error) {
    err("Detailed telemetry metrics collection failed", error);
    return jsonResponse(
      {
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        batchCoordinator: { statistics: {}, buffers: {}, memoryPressure: { pressureLevel: "unknown" } },
        exporters: {},
        recommendations: [],
      },
      500
    );
  }
};

/**
 * /health/comprehensive - Combined health report
 */
export const comprehensiveHealthHandler: RouteHandler = async (_request, _context) => {
  try {
    const [systemHealth, telemetryHealth, performanceMetrics, cacheResponse, detailedTelemetry] =
      await Promise.allSettled([
        getSystemHealth(),
        getTelemetryHealth(),
        getPerformanceMetrics(),
        (async () => {
          const { bunSQLiteCache } = await import("../../lib/bunSQLiteCache");
          return bunSQLiteCache.getStats();
        })(),
        (async () => {
          const { getBatchCoordinator } = await import("../../telemetry/coordinator/BatchCoordinator");
          return getBatchCoordinator().getBufferStatus();
        })(),
      ]);

    const timestamp = new Date().toISOString();

    return jsonResponse({
      timestamp,
      version: "2.0.0",
      environment: process.env.NODE_ENV || "development",
      uptime: process.uptime(),

      system:
        systemHealth.status === "fulfilled"
          ? systemHealth.value
          : { overall: "unhealthy", error: systemHealth.reason?.message },

      performance:
        performanceMetrics.status === "fulfilled"
          ? performanceMetrics.value
          : { error: performanceMetrics.reason?.message },

      cache:
        cacheResponse.status === "fulfilled"
          ? {
              ...cacheResponse.value,
              status: cacheResponse.value.hitRate > 50 ? "optimal" : cacheResponse.value.hitRate > 20 ? "good" : "poor",
            }
          : { error: cacheResponse.reason?.message, status: "unknown" },

      telemetry: {
        exporters:
          telemetryHealth.status === "fulfilled" ? telemetryHealth.value : { error: telemetryHealth.reason?.message },
        batchCoordinator:
          detailedTelemetry.status === "fulfilled"
            ? {
                ...detailedTelemetry.value,
                status:
                  detailedTelemetry.value.memoryPressure.pressureLevel === "low"
                    ? "healthy"
                    : detailedTelemetry.value.memoryPressure.pressureLevel === "medium"
                      ? "warning"
                      : "critical",
              }
            : { error: detailedTelemetry.reason?.message, status: "unknown" },
      },

      overall: {
        status: assessOverallHealth([systemHealth, telemetryHealth, performanceMetrics, cacheResponse]),
        criticalIssues: extractCriticalIssues([systemHealth, telemetryHealth, performanceMetrics, cacheResponse]),
        recommendations: generateOverallRecommendations([
          systemHealth,
          telemetryHealth,
          performanceMetrics,
          cacheResponse,
        ]),
      },
    });
  } catch (error) {
    err("Comprehensive health check failed", error);
    return jsonResponse(
      {
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        overall: {
          status: "unhealthy",
          criticalIssues: ["Health check system failure"],
          recommendations: ["Investigate health check system", "Check system resources", "Review error logs"],
        },
      },
      500
    );
  }
};

/**
 * /health/graphql - GraphQL resolver performance metrics
 */
export const graphqlPerformanceHandler: RouteHandler = async (request, _context) => {
  try {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    const stats = getGraphQLPerformanceStats();
    const recentOps = getRecentGraphQLPerformance().slice(-Math.min(limit, 100));

    // Group operations by resolver for comparison
    const byResolver: Record<string, { durations: number[]; cacheHits: number; dbFetches: number }> = {};

    for (const op of recentOps) {
      const key = `${op.operationName}.${op.fieldName}`;
      if (!byResolver[key]) {
        byResolver[key] = { durations: [], cacheHits: 0, dbFetches: 0 };
      }
      byResolver[key].durations.push(op.duration);
      // Cache hits are typically < 10ms, DB fetches > 50ms
      if (op.duration < 10) {
        byResolver[key].cacheHits++;
      } else {
        byResolver[key].dbFetches++;
      }
    }

    // Calculate per-resolver stats
    const resolverStats = Object.entries(byResolver).map(([resolver, data]) => {
      const sorted = [...data.durations].sort((a, b) => a - b);
      return {
        resolver,
        count: data.durations.length,
        cacheHits: data.cacheHits,
        dbFetches: data.dbFetches,
        cacheHitRate: data.durations.length > 0 ? ((data.cacheHits / data.durations.length) * 100).toFixed(1) : "0.0",
        avgDurationMs:
          data.durations.length > 0
            ? (data.durations.reduce((a, b) => a + b, 0) / data.durations.length).toFixed(2)
            : 0,
        minDurationMs: sorted[0] || 0,
        maxDurationMs: sorted[sorted.length - 1] || 0,
        p50DurationMs: sorted[Math.floor(sorted.length * 0.5)] || 0,
        p95DurationMs: sorted[Math.floor(sorted.length * 0.95)] || 0,
      };
    });

    return jsonResponse({
      timestamp: new Date().toISOString(),
      summary: stats,
      resolvers: resolverStats,
      recentOperations: recentOps.slice(-20).map((op) => ({
        ...op,
        source: op.duration < 10 ? "cache" : "database",
      })),
      insights: {
        cacheEffectiveness: resolverStats.filter((r) => parseFloat(r.cacheHitRate) > 50).length,
        slowResolvers: resolverStats.filter((r) => parseFloat(r.avgDurationMs as string) > 100),
        fastestResolver:
          resolverStats.sort((a, b) => parseFloat(a.avgDurationMs as string) - parseFloat(b.avgDurationMs as string))[0]
            ?.resolver || "N/A",
        slowestResolver:
          resolverStats.sort((a, b) => parseFloat(b.avgDurationMs as string) - parseFloat(a.avgDurationMs as string))[0]
            ?.resolver || "N/A",
      },
    });
  } catch (error) {
    err("GraphQL performance metrics collection failed", error);
    return jsonResponse(
      {
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        summary: { totalOperations: 0, averageDuration: 0, errorRate: 0, slowOperations: 0 },
        resolvers: [],
        recentOperations: [],
      },
      500
    );
  }
};

// Helper functions
function generateTelemetryRecommendations(statistics: any, memoryPressure: any): string[] {
  const recommendations: string[] = [];

  if (memoryPressure.pressureLevel === "high" || memoryPressure.pressureLevel === "critical") {
    recommendations.push("Reduce telemetry buffer sizes or increase export frequency");
    recommendations.push("Consider increasing available memory for the service");
  }

  if (statistics.failedBatches > 0 && statistics.totalBatches > 0) {
    const failureRate = (statistics.failedBatches / statistics.totalBatches) * 100;
    if (failureRate > 10) {
      recommendations.push("High telemetry export failure rate detected - check OTLP endpoint connectivity");
    }
  }

  if (statistics.emergencyFlushCount > 0) {
    recommendations.push("Emergency flushes detected - consider tuning memory pressure thresholds");
  }

  if (statistics.dataDropCount > 0) {
    recommendations.push("Telemetry data loss detected - increase memory limits or reduce data volume");
  }

  return recommendations;
}

function assessOverallHealth(results: PromiseSettledResult<any>[]): string {
  let healthyCount = 0;
  const totalCount = results.length;

  for (const result of results) {
    if (result.status === "fulfilled") {
      if (
        result.value &&
        (result.value.status === "healthy" || result.value.overall === "healthy" || result.value.state === "healthy")
      ) {
        healthyCount++;
      }
    }
  }

  const healthyPercentage = (healthyCount / totalCount) * 100;

  if (healthyPercentage >= 80) return "healthy";
  if (healthyPercentage >= 60) return "warning";
  return "unhealthy";
}

function extractCriticalIssues(results: PromiseSettledResult<any>[]): string[] {
  const issues: string[] = [];

  for (const result of results) {
    if (result.status === "rejected") {
      issues.push(`System component failure: ${result.reason?.message || "Unknown error"}`);
    } else if (result.value?.error) {
      issues.push(result.value.error);
    }
  }

  return issues;
}

function generateOverallRecommendations(results: PromiseSettledResult<any>[]): string[] {
  const recommendations: string[] = [];
  const issues = extractCriticalIssues(results);

  if (issues.length > 0) {
    recommendations.push("Address critical system issues immediately");
    recommendations.push("Review error logs for detailed diagnostics");
  }

  const failedResults = results.filter((r) => r.status === "rejected");
  if (failedResults.length > 0) {
    recommendations.push("Multiple system components are failing - investigate resource constraints");
  }

  return recommendations;
}

// Export all handlers as a collection
export const healthHandlers = {
  basic: basicHealthHandler,
  telemetry: telemetryHealthHandler,
  system: systemHealthHandler,
  summary: healthSummaryHandler,
  performance: performanceHandler,
  performanceHistory: performanceHistoryHandler,
  cache: cacheHealthHandler,
  telemetryDetailed: telemetryDetailedHandler,
  comprehensive: comprehensiveHealthHandler,
  graphql: graphqlPerformanceHandler,
};
