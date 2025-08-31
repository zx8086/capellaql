import { metrics } from "@opentelemetry/api";
import { pingCouchbase } from "$lib/couchbaseConnector";
import { BunPerf } from "$utils/bunUtils";
import { getTelemetryHealth } from "$telemetry";
import { getRecentGraphQLPerformance, getGraphQLPerformanceStats } from "./graphqlPerformanceTracker";

export interface PerformanceMetrics {
  timestamp: string;
  database: {
    latency: number;
    connectionStatus: 'connected' | 'disconnected' | 'degraded';
    operationsPerSecond?: number;
    errorRate?: number;
  };
  runtime: {
    memoryUsage: number;
    heapUsage: number;
    cpuUsage?: number;
    eventLoopLag?: number;
    gcStats?: {
      collections: number;
      pauseTime: number;
    };
  };
  telemetry: {
    exportLatency: number;
    droppedSpans: number;
    batchSize: number;
    samplingRate: number;
    circuitBreakerState: string;
  };
  graphql: {
    averageDuration: number;
    totalOperations: number;
    errorRate: number;
    slowOperations: number;
    topSlowResolvers: Array<{
      operation: string;
      field: string;
      averageDuration: number;
    }>;
  };
  correlations: {
    databaseToMemory: number;
    telemetryToPerformance: number;
    graphqlToDatabase: number;
    overallHealth: 'healthy' | 'degraded' | 'unhealthy';
  };
}

class PerformanceMonitor {
  private readonly meter = metrics.getMeter('capellaql-performance');
  private readonly databaseLatencyHistogram = this.meter.createHistogram('database_operation_duration_ms', {
    description: 'Database operation latency in milliseconds',
    unit: 'ms',
  });
  
  private readonly memoryGauge = this.meter.createUpDownCounter('memory_usage_bytes', {
    description: 'Memory usage in bytes',
    unit: 'bytes',
  });
  
  private readonly telemetryLatencyHistogram = this.meter.createHistogram('telemetry_export_duration_ms', {
    description: 'Telemetry export latency in milliseconds',
    unit: 'ms',
  });

  private recentMetrics: PerformanceMetrics[] = [];
  private readonly maxMetricsHistory = 100;
  private readonly maxMetricAge = 15 * 60 * 1000; // 15 minutes
  private cleanupInterval: Timer | null = null;
  
  constructor() {
    this.startCleanupScheduler();
  }
  
  private startCleanupScheduler(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 5 * 60 * 1000);
  }
  
  private performCleanup(): void {
    const now = Date.now();
    let totalCleaned = 0;
    
    // Time-based cleanup - remove entries older than 15 minutes
    const before = this.recentMetrics.length;
    this.recentMetrics = this.recentMetrics.filter(metric => {
      const metricTime = new Date(metric.timestamp).getTime();
      return (now - metricTime) < this.maxMetricAge;
    });
    
    // Also apply count limit
    if (this.recentMetrics.length > this.maxMetricsHistory) {
      this.recentMetrics = this.recentMetrics.slice(-this.maxMetricsHistory);
    }
    
    totalCleaned = before - this.recentMetrics.length;
    
    if (totalCleaned > 0) {
      console.debug(`Performance Monitor: Cleaned ${totalCleaned} old metrics (time-based + count-based cleanup)`);
    }
  }
  
  // Memory pressure detection
  private checkMemoryPressure(): boolean {
    if (typeof Bun !== "undefined") {
      // Use Bun's memory info when available
      try {
        const memoryUsage = process.memoryUsage();
        const heapUsed = memoryUsage.heapUsed;
        const heapTotal = memoryUsage.heapTotal;
        return heapUsed / heapTotal > 0.85; // 85% heap usage
      } catch {
        // Fallback if Bun.memoryUsage() is not available
        const usage = process.memoryUsage();
        return usage.heapUsed / (usage.heapUsed + usage.heapTotal) > 0.85;
      }
    }
    
    // Node.js fallback
    const usage = process.memoryUsage();
    const totalMemory = usage.rss + usage.external;
    return usage.heapUsed / totalMemory > 0.85;
  }
  
  // Enhanced shutdown method
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // Final cleanup before shutdown
    this.performCleanup();
    
    console.info(`Performance Monitor: Shutdown complete. Final metrics count: ${this.recentMetrics.length}`);
  }

  async collectMetrics(): Promise<PerformanceMetrics> {
    const timestamp = new Date().toISOString();
    
    // If under memory pressure, perform aggressive cleanup
    if (this.checkMemoryPressure()) {
      console.warn('Memory pressure detected - performing aggressive cleanup');
      this.performCleanup();
    }
    
    // Collect database metrics
    const dbMetrics = await this.collectDatabaseMetrics();
    
    // Collect runtime metrics
    const runtimeMetrics = this.collectRuntimeMetrics();
    
    // Collect telemetry metrics
    const telemetryMetrics = await this.collectTelemetryMetrics();
    
    // Collect GraphQL performance metrics
    const graphqlMetrics = this.collectGraphQLMetrics();
    
    // Calculate correlations
    const correlations = this.calculateCorrelations(dbMetrics, runtimeMetrics, telemetryMetrics, graphqlMetrics);
    
    const metrics: PerformanceMetrics = {
      timestamp,
      database: dbMetrics,
      runtime: runtimeMetrics,
      telemetry: telemetryMetrics,
      graphql: graphqlMetrics,
      correlations,
    };
    
    // Record metrics to OpenTelemetry
    this.recordOpenTelemetryMetrics(metrics);
    
    // Store in history with adaptive management
    this.recentMetrics.push(metrics);
    
    // Adaptive cleanup based on memory pressure
    if (this.checkMemoryPressure()) {
      // Under memory pressure: keep only recent 50 entries
      this.recentMetrics = this.recentMetrics.slice(-50);
      console.debug('Memory pressure: Reduced metrics history to 50 entries');
    } else if (this.recentMetrics.length > this.maxMetricsHistory) {
      // Normal operation: standard cleanup
      this.recentMetrics.shift();
    }
    
    return metrics;
  }

  private async collectDatabaseMetrics() {
    const { result: pingResult, duration: latency } = await BunPerf.measure(
      () => pingCouchbase()
    );
    
    let connectionStatus: 'connected' | 'disconnected' | 'degraded' = 'disconnected';
    if (pingResult.success) {
      connectionStatus = pingResult.latency && pingResult.latency < 1000 ? 'connected' : 'degraded';
    }
    
    return {
      latency,
      connectionStatus,
      operationsPerSecond: this.calculateDatabaseOps(),
      errorRate: this.calculateDatabaseErrorRate(),
    };
  }

  private collectRuntimeMetrics() {
    const memUsage = process.memoryUsage();
    const memoryUsage = memUsage.rss;
    const heapUsage = memUsage.heapUsed;
    
    return {
      memoryUsage,
      heapUsage,
      eventLoopLag: this.measureEventLoopLag(),
    };
  }

  private async collectTelemetryMetrics() {
    const telemetryHealth = getTelemetryHealth();
    
    // Simulate export latency measurement
    const { duration: exportLatency } = await BunPerf.measure(async () => {
      return Promise.resolve(true); // Placeholder for actual export measurement
    });
    
    return {
      exportLatency,
      droppedSpans: 0, // Would need to be tracked from actual telemetry
      batchSize: 2048, // From config
      samplingRate: 0.15, // From config
      circuitBreakerState: telemetryHealth.circuitBreaker?.state || 'unknown',
    };
  }

  private collectGraphQLMetrics() {
    const stats = getGraphQLPerformanceStats();
    const recentOperations = getRecentGraphQLPerformance();
    
    // Find top 5 slowest resolvers
    const resolverPerformance = new Map<string, { total: number; count: number; durations: number[] }>();
    
    recentOperations.forEach(op => {
      const key = `${op.operationName}.${op.fieldName}`;
      if (!resolverPerformance.has(key)) {
        resolverPerformance.set(key, { total: 0, count: 0, durations: [] });
      }
      const perf = resolverPerformance.get(key)!;
      perf.total += op.duration;
      perf.count += 1;
      perf.durations.push(op.duration);
    });
    
    const topSlowResolvers = Array.from(resolverPerformance.entries())
      .map(([key, perf]) => ({
        operation: key.split('.')[0],
        field: key.split('.')[1],
        averageDuration: perf.total / perf.count
      }))
      .sort((a, b) => b.averageDuration - a.averageDuration)
      .slice(0, 5);
    
    return {
      averageDuration: stats.averageDuration,
      totalOperations: stats.totalOperations,
      errorRate: stats.errorRate,
      slowOperations: stats.slowOperations,
      topSlowResolvers
    };
  }

  private calculateCorrelations(dbMetrics: any, runtimeMetrics: any, telemetryMetrics: any, graphqlMetrics: any) {
    // Calculate correlation between database latency and memory usage
    const databaseToMemory = this.calculateCorrelation(
      this.recentMetrics.map(m => m.database.latency),
      this.recentMetrics.map(m => m.runtime.memoryUsage)
    );
    
    // Calculate correlation between telemetry overhead and overall performance
    const telemetryToPerformance = this.calculateCorrelation(
      this.recentMetrics.map(m => m.telemetry.exportLatency),
      this.recentMetrics.map(m => m.database.latency + (m.runtime.eventLoopLag || 0))
    );
    
    // Calculate correlation between GraphQL performance and database latency
    const graphqlToDatabase = this.calculateCorrelation(
      this.recentMetrics.filter(m => m.graphql).map(m => m.graphql.averageDuration),
      this.recentMetrics.filter(m => m.graphql).map(m => m.database.latency)
    );
    
    // Determine overall health based on thresholds
    let overallHealth: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (
      dbMetrics.latency > 2000 || 
      runtimeMetrics.memoryUsage > 1024 * 1024 * 1024 || // 1GB
      dbMetrics.connectionStatus === 'disconnected'
    ) {
      overallHealth = 'unhealthy';
    } else if (
      dbMetrics.latency > 500 || 
      runtimeMetrics.memoryUsage > 512 * 1024 * 1024 || // 512MB
      dbMetrics.connectionStatus === 'degraded'
    ) {
      overallHealth = 'degraded';
    }
    
    return {
      databaseToMemory,
      telemetryToPerformance,
      graphqlToDatabase,
      overallHealth,
    };
  }

  private calculateCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length < 2) return 0;
    
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
  }

  private recordOpenTelemetryMetrics(metrics: PerformanceMetrics) {
    // Record database latency
    this.databaseLatencyHistogram.record(metrics.database.latency, {
      operation: 'ping',
      status: metrics.database.connectionStatus,
    });
    
    // Record memory usage
    this.memoryGauge.add(metrics.runtime.memoryUsage, {
      type: 'rss',
    });
    
    this.memoryGauge.add(metrics.runtime.heapUsage, {
      type: 'heap',
    });
    
    // Record telemetry export latency
    this.telemetryLatencyHistogram.record(metrics.telemetry.exportLatency, {
      circuit_breaker_state: metrics.telemetry.circuitBreakerState,
    });
  }

  private calculateDatabaseOps(): number {
    // Calculate operations per second based on recent metrics
    if (this.recentMetrics.length < 2) return 0;
    
    const recentCount = Math.min(10, this.recentMetrics.length);
    const recentMetrics = this.recentMetrics.slice(-recentCount);
    
    const timeWindow = new Date(recentMetrics[recentMetrics.length - 1].timestamp).getTime() - 
                     new Date(recentMetrics[0].timestamp).getTime();
    
    if (timeWindow === 0) return 0;
    
    return (recentCount * 1000) / timeWindow; // Operations per second
  }

  private calculateDatabaseErrorRate(): number {
    // Calculate error rate based on recent metrics
    if (this.recentMetrics.length === 0) return 0;
    
    const recentCount = Math.min(20, this.recentMetrics.length);
    const recentMetrics = this.recentMetrics.slice(-recentCount);
    
    const errors = recentMetrics.filter(m => m.database.connectionStatus === 'disconnected').length;
    return errors / recentCount;
  }

  private measureEventLoopLag(): number {
    const start = process.hrtime.bigint();
    
    return new Promise<number>((resolve) => {
      setImmediate(() => {
        const lag = Number(process.hrtime.bigint() - start) / 1_000_000; // Convert to milliseconds
        resolve(lag);
      });
    }) as any; // Type hack for sync return
    
    // Fallback sync calculation
    return 0;
  }

  getRecentMetrics(count: number = 10): PerformanceMetrics[] {
    return this.recentMetrics.slice(-count);
  }

  getPerformanceTrends(): {
    databaseLatencyTrend: 'improving' | 'stable' | 'degrading';
    memoryUsageTrend: 'improving' | 'stable' | 'degrading';
    overallTrend: 'improving' | 'stable' | 'degrading';
  } {
    if (this.recentMetrics.length < 5) {
      return {
        databaseLatencyTrend: 'stable',
        memoryUsageTrend: 'stable',
        overallTrend: 'stable',
      };
    }

    const recent = this.recentMetrics.slice(-5);
    const earlier = this.recentMetrics.slice(-10, -5);
    
    if (earlier.length === 0) {
      return {
        databaseLatencyTrend: 'stable',
        memoryUsageTrend: 'stable',
        overallTrend: 'stable',
      };
    }

    const recentAvgLatency = recent.reduce((sum, m) => sum + m.database.latency, 0) / recent.length;
    const earlierAvgLatency = earlier.reduce((sum, m) => sum + m.database.latency, 0) / earlier.length;
    
    const recentAvgMemory = recent.reduce((sum, m) => sum + m.runtime.memoryUsage, 0) / recent.length;
    const earlierAvgMemory = earlier.reduce((sum, m) => sum + m.runtime.memoryUsage, 0) / earlier.length;

    const databaseLatencyTrend = 
      recentAvgLatency < earlierAvgLatency * 0.9 ? 'improving' :
      recentAvgLatency > earlierAvgLatency * 1.1 ? 'degrading' : 'stable';
    
    const memoryUsageTrend = 
      recentAvgMemory < earlierAvgMemory * 0.95 ? 'improving' :
      recentAvgMemory > earlierAvgMemory * 1.05 ? 'degrading' : 'stable';
    
    const overallTrend = 
      (databaseLatencyTrend === 'improving' && memoryUsageTrend !== 'degrading') ||
      (memoryUsageTrend === 'improving' && databaseLatencyTrend !== 'degrading') ? 'improving' :
      (databaseLatencyTrend === 'degrading' || memoryUsageTrend === 'degrading') ? 'degrading' : 'stable';

    return {
      databaseLatencyTrend,
      memoryUsageTrend,
      overallTrend,
    };
  }
}

export const performanceMonitor = new PerformanceMonitor();

export async function getPerformanceMetrics(): Promise<PerformanceMetrics> {
  return performanceMonitor.collectMetrics();
}

export function getPerformanceHistory(count: number = 10): PerformanceMetrics[] {
  return performanceMonitor.getRecentMetrics(count);
}

export function getPerformanceTrends() {
  return performanceMonitor.getPerformanceTrends();
}

// Graceful shutdown function for external use
export function shutdownPerformanceMonitor(): void {
  performanceMonitor.shutdown();
}