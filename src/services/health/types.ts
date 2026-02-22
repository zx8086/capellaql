/* src/services/health/types.ts */
// Health check types matching reference pattern EXACTLY

// ============================================================================
// Core Health Status Types
// ============================================================================

export type HealthStatus = "healthy" | "degraded" | "unhealthy";
export type CircuitBreakerState = "closed" | "open" | "half-open";

// ============================================================================
// Couchbase Dependency (replaces Kong in reference)
// ============================================================================

export interface CouchbaseDependency {
  status: HealthStatus;
  responseTime: string;
  details: {
    connectionString: string;
    bucket: string;
    services: {
      kv: boolean;
      query: boolean;
      search: boolean;
    };
  };
}

// ============================================================================
// Cache Dependency (aligned with actual cache implementation)
// ============================================================================

export interface CacheDependency {
  type: "sqlite" | "map";
  connection: {
    connected: boolean;
    responseTime: string;
  };
  entries: {
    total: number; // Total cache entries (size)
    active: number; // Non-expired entries
    expired: number; // Expired entries awaiting cleanup
    evictions: number; // Total evictions due to memory/size limits
  };
  performance: {
    hits: number;
    misses: number;
    hitRate: string;
    memoryUsageBytes: number;
  };
  healthMonitor: {
    status: HealthStatus;
    isMonitoring: boolean;
    consecutiveSuccesses: number;
    consecutiveFailures: number;
    lastStatusChange: string;
    lastCheck: {
      success: boolean;
      timestamp: string;
      responseTimeMs: number;
    } | null;
  };
}

// ============================================================================
// Telemetry Dependency (matches reference exactly)
// ============================================================================

export interface TelemetrySignalHealth {
  status: HealthStatus;
  endpoint: string;
  responseTime: string;
  exports: {
    successRate: string;
    total: number;
    failures: number;
    lastExportTime: string | null;
    lastFailureTime: string | null;
    recentErrors: string[];
  };
}

export interface TelemetryHealthDetails {
  traces: TelemetrySignalHealth;
  metrics: TelemetrySignalHealth;
  logs: TelemetrySignalHealth;
}

// ============================================================================
// Health Check Response (matches reference exactly)
// ============================================================================

export interface HealthCheckResponse {
  status: HealthStatus;
  timestamp: string;
  version: string;
  environment: string;
  uptime: string;
  highAvailability: boolean;
  circuitBreakerState: CircuitBreakerState;
  dependencies: {
    couchbase: CouchbaseDependency;
    cache: CacheDependency;
    telemetry: TelemetryHealthDetails;
  };
  requestId: string;
}

// ============================================================================
// Readiness Check Response (for Kubernetes probes)
// ============================================================================

export interface ReadinessCheckResponse {
  ready: boolean;
  timestamp: string;
  checks: {
    couchbase: { ready: boolean; latency?: string; error?: string };
    cache: { ready: boolean; error?: string };
    telemetry: { ready: boolean; error?: string };
  };
  requestId: string;
}

// ============================================================================
// Liveness Check Response (for Kubernetes probes)
// ============================================================================

export interface LivenessCheckResponse {
  alive: boolean;
  timestamp: string;
  uptime: string;
  memory: {
    usedMB: number;
    totalMB: number;
    percentUsed: string;
  };
  requestId: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

export function formatResponseTime(ms: number): string {
  return `${ms.toFixed(2)}ms`;
}

export function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.floor(seconds)}s`;
  }
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(2)}%`;
}
