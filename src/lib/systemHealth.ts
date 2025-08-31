import { getCouchbaseHealth, pingCouchbase } from "$lib/couchbaseConnector";
import { createHealthcheck } from "$utils/bunUtils";
import { getTelemetryHealth } from "$telemetry";

export interface SystemHealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  components: {
    database: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      latency?: number;
      circuitBreaker: {
        state: string;
        failures: number;
        successes: number;
      };
      details?: any;
      error?: string;
    };
    runtime: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      memory: {
        used: number;
        free: number;
        total: number;
        heapUsed: number;
        heapTotal: number;
      };
      environment: string;
      version: string;
      error?: string;
    };
    telemetry: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      exporters: {
        traces: boolean;
        metrics: boolean;
        logs: boolean;
      };
      circuitBreaker: {
        state: string;
        failures: number;
      };
      error?: string;
    };
  };
  performance: {
    databaseLatency?: number;
    memoryUsage: number;
    cpuLoad?: number;
  };
}

export async function getSystemHealth(): Promise<SystemHealthStatus> {
  const startTime = Date.now();
  
  try {
    // Run health checks in parallel for better performance
    const [databaseHealth, runtimeHealth, telemetryHealth, databasePing] = await Promise.allSettled([
      getCouchbaseHealth(),
      createHealthcheck(),
      getTelemetryHealth(),
      pingCouchbase()
    ]);

    // Process database health
    const dbHealth = databaseHealth.status === 'fulfilled' ? databaseHealth.value : null;
    const dbPing = databasePing.status === 'fulfilled' ? databasePing.value : null;
    
    const databaseComponent = {
      status: dbHealth?.status || 'unhealthy' as const,
      latency: dbPing?.latency,
      circuitBreaker: dbHealth?.details.circuitBreaker || { state: 'unknown', failures: 0, successes: 0 },
      details: dbHealth?.details.ping,
      error: dbHealth?.details.error || (databaseHealth.status === 'rejected' ? databaseHealth.reason?.message : undefined)
    };

    // Process runtime health
    const rtHealth = runtimeHealth.status === 'fulfilled' ? runtimeHealth.value : null;
    const runtimeComponent = {
      status: rtHealth?.status === 'healthy' ? 'healthy' as const : 'unhealthy' as const,
      memory: rtHealth?.memory || { used: 0, free: 0, total: 0, heapUsed: 0, heapTotal: 0 },
      environment: rtHealth?.config.environment || 'unknown',
      version: rtHealth?.runtime.version || 'unknown',
      error: runtimeHealth.status === 'rejected' ? runtimeHealth.reason?.message : undefined
    };

    // Process telemetry health
    const telHealth = telemetryHealth.status === 'fulfilled' ? telemetryHealth.value : null;
    const telemetryComponent = {
      status: telHealth?.status || 'unhealthy' as const,
      exporters: telHealth?.exporters || { traces: false, metrics: false, logs: false },
      circuitBreaker: telHealth?.circuitBreaker || { state: 'unknown', failures: 0 },
      error: telHealth?.error || (telemetryHealth.status === 'rejected' ? telemetryHealth.reason?.message : undefined)
    };

    // Calculate overall health status
    const componentStatuses = [
      databaseComponent.status,
      runtimeComponent.status,
      telemetryComponent.status
    ];

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (componentStatuses.includes('unhealthy')) {
      overallStatus = 'unhealthy';
    } else if (componentStatuses.includes('degraded')) {
      overallStatus = 'degraded';
    }

    // Calculate performance metrics
    const memoryUsagePercent = runtimeComponent.memory.total > 0 
      ? (runtimeComponent.memory.used / runtimeComponent.memory.total) * 100 
      : 0;

    const result: SystemHealthStatus = {
      overall: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      components: {
        database: databaseComponent,
        runtime: runtimeComponent,
        telemetry: telemetryComponent,
      },
      performance: {
        databaseLatency: databaseComponent.latency,
        memoryUsage: memoryUsagePercent,
      }
    };

    return result;

  } catch (error) {
    // Fallback health status if system health check fails
    return {
      overall: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      components: {
        database: {
          status: 'unhealthy',
          circuitBreaker: { state: 'unknown', failures: 0, successes: 0 },
          error: 'Health check failed'
        },
        runtime: {
          status: 'unhealthy',
          memory: { used: 0, free: 0, total: 0, heapUsed: 0, heapTotal: 0 },
          environment: 'unknown',
          version: 'unknown',
          error: 'Health check failed'
        },
        telemetry: {
          status: 'unhealthy',
          exporters: { traces: false, metrics: false, logs: false },
          circuitBreaker: { state: 'unknown', failures: 0 },
          error: 'Health check failed'
        }
      },
      performance: {
        memoryUsage: 0,
      }
    };
  }
}

export async function getSystemHealthSummary(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  criticalIssues: string[];
}> {
  const health = await getSystemHealth();
  const criticalIssues: string[] = [];

  // Check for critical issues
  if (health.components.database.status === 'unhealthy') {
    criticalIssues.push(`Database: ${health.components.database.error || 'Connection failed'}`);
  }

  if (health.components.runtime.status === 'unhealthy') {
    criticalIssues.push(`Runtime: ${health.components.runtime.error || 'System failure'}`);
  }

  if (health.components.telemetry.status === 'unhealthy') {
    criticalIssues.push(`Telemetry: ${health.components.telemetry.error || 'Observability failure'}`);
  }

  // Performance warnings
  if (health.performance.memoryUsage > 85) {
    criticalIssues.push(`High memory usage: ${health.performance.memoryUsage.toFixed(1)}%`);
  }

  if (health.performance.databaseLatency && health.performance.databaseLatency > 1000) {
    criticalIssues.push(`High database latency: ${health.performance.databaseLatency}ms`);
  }

  let message = '';
  switch (health.overall) {
    case 'healthy':
      message = 'All systems operational';
      break;
    case 'degraded':
      message = `System degraded: ${criticalIssues.length} issues detected`;
      break;
    case 'unhealthy':
      message = `System unhealthy: ${criticalIssues.length} critical issues`;
      break;
  }

  return {
    status: health.overall,
    message,
    criticalIssues
  };
}