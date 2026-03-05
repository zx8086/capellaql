// src/types/circuit-breaker.types.ts

export type CircuitBreakerStateType = "closed" | "open" | "half-open" | "half_open";

export enum CircuitBreakerStateEnum {
  CLOSED = "closed",
  OPEN = "open",
  HALF_OPEN = "half_open",
}

export interface OpossumCircuitBreakerStats {
  state: "closed" | "open" | "half-open";
  stats: {
    fires: number;
    rejections: number;
    timeouts: number;
    failures: number;
    successes: number;
    fallbacks: number;
    semaphoreRejections: number;
    percentiles: Record<string, number>;
  };
}

export interface TelemetryCircuitBreakerStats {
  state: CircuitBreakerStateEnum;
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  totalRequests: number;
  rejectedRequests: number;
  lastStateChange: number;
}

export interface TelemetryCircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  successThreshold: number;
  monitoringInterval: number;
}

export type CircuitBreakerStats = OpossumCircuitBreakerStats | TelemetryCircuitBreakerStats;

export function isOpossumCircuitBreakerStats(
  stats: CircuitBreakerStats
): stats is OpossumCircuitBreakerStats {
  return "stats" in stats && typeof stats.stats === "object";
}

export function isTelemetryCircuitBreakerStats(
  stats: CircuitBreakerStats
): stats is TelemetryCircuitBreakerStats {
  return "failureCount" in stats;
}
