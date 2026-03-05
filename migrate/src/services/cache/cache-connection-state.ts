// src/services/cache/cache-connection-state.ts

import { SpanEvents, telemetryEmitter } from "../../telemetry/tracer";
import type { CircuitBreakerStateEnum } from "../../types/circuit-breaker.types";
import {
  CacheReconnectManager,
  type ReconnectManagerConfig,
  type ReconnectResult,
} from "../../utils/cache-reconnect-manager";
import { CacheCircuitBreaker, type CacheCircuitBreakerConfig } from "./cache-circuit-breaker";
import {
  CacheHealthMonitor,
  type CacheHealthMonitorConfig,
  type CacheHealthStatus,
} from "./cache-health-monitor";
import { type CacheOperationTimeouts, DEFAULT_OPERATION_TIMEOUTS } from "./cache-operation-timeout";

export type CacheConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export interface CacheConnectionStateConfig {
  enabled: boolean;
  circuitBreaker: CacheCircuitBreakerConfig;
  reconnect: ReconnectManagerConfig;
  healthMonitor: CacheHealthMonitorConfig;
  operationTimeouts: CacheOperationTimeouts;
}

export interface CacheConnectionStateSnapshot {
  connectionStatus: CacheConnectionStatus;
  healthStatus: CacheHealthStatus;
  circuitBreakerState: CircuitBreakerStateEnum;
  canExecute: boolean;
  isReconnecting: boolean;
  lastError: string | null;
  lastSuccessTime: number;
  lastErrorTime: number;
  uptimePercent: number;
  timeSinceStateChange: number;
}

export interface CacheConnectionStats {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  rejectedOperations: number;
  reconnectionAttempts: number;
  successfulReconnections: number;
  uptimePercent: number;
  avgLatencyMs: number;
  currentState: CacheConnectionStatus;
}

export class CacheConnectionStateManager {
  private status: CacheConnectionStatus = "disconnected";
  private lastError: string | null = null;
  private lastSuccessTime = 0;
  private lastErrorTime = 0;
  private lastStateChange = Date.now();

  private totalOperations = 0;
  private successfulOperations = 0;
  private failedOperations = 0;
  private rejectedOperations = 0;
  private reconnectionAttempts = 0;
  private successfulReconnections = 0;
  private totalLatencyMs = 0;

  private readonly circuitBreaker: CacheCircuitBreaker;
  private readonly reconnectManager: CacheReconnectManager;
  private healthMonitor: CacheHealthMonitor | null = null;

  private connectFn: (() => Promise<void>) | null = null;

  constructor(private readonly config: CacheConnectionStateConfig) {
    this.circuitBreaker = new CacheCircuitBreaker(config.circuitBreaker);
    this.reconnectManager = new CacheReconnectManager(config.reconnect);

    telemetryEmitter.debug(
      SpanEvents.CACHE_FACTORY_INITIALIZING,
      "Cache connection state manager initialized",
      {
        component: "cache_connection_state",
        operation: "init",
        enabled: config.enabled,
        circuit_breaker_enabled: config.circuitBreaker.enabled,
        health_monitor_enabled: config.healthMonitor.enabled,
      }
    );
  }

  setConnectFunction(fn: () => Promise<void>): void {
    this.connectFn = fn;
  }

  setPingFunction(fn: () => Promise<void>): void {
    if (!this.healthMonitor && this.config.healthMonitor.enabled) {
      this.healthMonitor = new CacheHealthMonitor(
        fn,
        this.circuitBreaker,
        this.config.healthMonitor
      );
    }
  }

  markConnected(): void {
    const previousStatus = this.status;
    this.status = "connected";
    this.lastSuccessTime = Date.now();
    this.lastError = null;

    if (previousStatus !== "connected") {
      this.lastStateChange = Date.now();
      this.logStateTransition(previousStatus, "connected");
    }

    this.circuitBreaker.reset();
    this.reconnectManager.reset();

    if (this.healthMonitor) {
      this.healthMonitor.start();
    }
  }

  markDisconnected(): void {
    const previousStatus = this.status;
    this.status = "disconnected";

    if (previousStatus !== "disconnected") {
      this.lastStateChange = Date.now();
      this.logStateTransition(previousStatus, "disconnected");
    }

    if (this.healthMonitor) {
      this.healthMonitor.stop();
    }
  }

  markError(error: Error | string): void {
    const previousStatus = this.status;
    this.status = "error";
    this.lastError = error instanceof Error ? error.message : error;
    this.lastErrorTime = Date.now();

    if (previousStatus !== "error") {
      this.lastStateChange = Date.now();
      this.logStateTransition(previousStatus, "error");
    }

    telemetryEmitter.error(SpanEvents.CACHE_OPERATION_FAILED, "Cache connection error", {
      component: "cache_connection_state",
      operation: "connection_error",
      error: this.lastError,
      previous_status: previousStatus,
    });
  }

  canExecute(): boolean {
    if (!this.config.enabled) {
      return true;
    }

    if (this.status === "disconnected" || this.status === "error") {
      return false;
    }

    const canExecute = this.circuitBreaker.canExecute();
    if (!canExecute) {
      this.rejectedOperations++;
    }

    return canExecute;
  }

  recordSuccess(latencyMs?: number): void {
    this.totalOperations++;
    this.successfulOperations++;
    this.lastSuccessTime = Date.now();

    if (latencyMs !== undefined) {
      this.totalLatencyMs += latencyMs;
    }

    if (this.status === "error" || this.status === "reconnecting") {
      this.status = "connected";
      this.lastStateChange = Date.now();
    }

    this.circuitBreaker.recordSuccess();

    if (this.healthMonitor) {
      this.healthMonitor.markHealthy();
    }
  }

  recordFailure(error: Error | string): void {
    this.totalOperations++;
    this.failedOperations++;
    this.lastError = error instanceof Error ? error.message : error;
    this.lastErrorTime = Date.now();

    this.circuitBreaker.recordFailure(error instanceof Error ? error : new Error(error));
  }

  async reconnect(): Promise<ReconnectResult> {
    if (!this.connectFn) {
      return {
        success: false,
        error: new Error("No connect function configured"),
        attempts: 0,
        durationMs: 0,
      };
    }

    const previousStatus = this.status;
    this.status = "reconnecting";

    if (previousStatus !== "reconnecting") {
      this.lastStateChange = Date.now();
      this.logStateTransition(previousStatus, "reconnecting");
    }

    this.reconnectionAttempts++;

    const result = await this.reconnectManager.executeReconnect(this.connectFn);

    if (result.success) {
      this.successfulReconnections++;
      this.markConnected();
    } else {
      this.markError(result.error || new Error("Reconnection failed"));
    }

    return result;
  }

  getSnapshot(): CacheConnectionStateSnapshot {
    const now = Date.now();
    const uptimePercent = this.calculateUptime();

    return {
      connectionStatus: this.status,
      healthStatus: this.healthMonitor?.getStatus() ?? "unknown",
      circuitBreakerState: this.circuitBreaker.getState(),
      canExecute: this.canExecute(),
      isReconnecting: this.reconnectManager.isReconnecting(),
      lastError: this.lastError,
      lastSuccessTime: this.lastSuccessTime,
      lastErrorTime: this.lastErrorTime,
      uptimePercent,
      timeSinceStateChange: now - this.lastStateChange,
    };
  }

  getStats(): CacheConnectionStats {
    return {
      totalOperations: this.totalOperations,
      successfulOperations: this.successfulOperations,
      failedOperations: this.failedOperations,
      rejectedOperations: this.rejectedOperations,
      reconnectionAttempts: this.reconnectionAttempts,
      successfulReconnections: this.successfulReconnections,
      uptimePercent: this.calculateUptime(),
      avgLatencyMs: this.totalOperations > 0 ? this.totalLatencyMs / this.totalOperations : 0,
      currentState: this.status,
    };
  }

  private calculateUptime(): number {
    if (this.totalOperations === 0) {
      return this.status === "connected" ? 100 : 0;
    }
    return Math.round((this.successfulOperations / this.totalOperations) * 10000) / 100;
  }

  private logStateTransition(from: CacheConnectionStatus, to: CacheConnectionStatus): void {
    const logMethod = to === "error" ? "error" : to === "reconnecting" ? "warn" : "info";

    telemetryEmitter[logMethod](
      SpanEvents.CACHE_STATE_CHANGED,
      "Cache connection state transition",
      {
        component: "cache_connection_state",
        operation: "state_transition",
        from_state: from,
        to_state: to,
        circuit_breaker_state: this.circuitBreaker.getState(),
        last_error: this.lastError ?? "none",
      }
    );
  }

  getCircuitBreaker(): CacheCircuitBreaker {
    return this.circuitBreaker;
  }

  getReconnectManager(): CacheReconnectManager {
    return this.reconnectManager;
  }

  getHealthMonitor(): CacheHealthMonitor | null {
    return this.healthMonitor;
  }

  getStatus(): CacheConnectionStatus {
    return this.status;
  }

  isConnected(): boolean {
    return this.status === "connected";
  }

  isReconnecting(): boolean {
    return this.status === "reconnecting";
  }

  reset(): void {
    this.status = "disconnected";
    this.lastError = null;
    this.lastSuccessTime = 0;
    this.lastErrorTime = 0;
    this.lastStateChange = Date.now();
    this.totalOperations = 0;
    this.successfulOperations = 0;
    this.failedOperations = 0;
    this.rejectedOperations = 0;
    this.reconnectionAttempts = 0;
    this.successfulReconnections = 0;
    this.totalLatencyMs = 0;

    this.circuitBreaker.reset();
    this.reconnectManager.reset();
    this.healthMonitor?.reset();

    telemetryEmitter.info(SpanEvents.CACHE_STATE_RESET, "Cache connection state manager reset", {
      component: "cache_connection_state",
      operation: "reset",
    });
  }

  shutdown(): void {
    this.healthMonitor?.stop();
    this.markDisconnected();

    const stats = this.getStats();
    telemetryEmitter.info(
      SpanEvents.CACHE_STATE_SHUTDOWN,
      "Cache connection state manager shutdown",
      {
        component: "cache_connection_state",
        operation: "shutdown",
        total_operations: stats.totalOperations,
        successful_operations: stats.successfulOperations,
        failed_operations: stats.failedOperations,
        uptime_percent: stats.uptimePercent,
        current_state: stats.currentState,
      }
    );
  }

  getOperationTimeouts(): CacheOperationTimeouts {
    return this.config.operationTimeouts;
  }
}

export function createDefaultConnectionStateConfig(
  overrides?: Partial<CacheConnectionStateConfig>
): CacheConnectionStateConfig {
  return {
    enabled: true,
    circuitBreaker: {
      enabled: true,
      failureThreshold: 5,
      resetTimeout: 30000,
      successThreshold: 2,
    },
    reconnect: {
      maxAttempts: 5,
      baseDelayMs: 100,
      maxDelayMs: 5000,
      cooldownMs: 60000,
    },
    healthMonitor: {
      enabled: true,
      intervalMs: 10000,
      unhealthyThreshold: 3,
      healthyThreshold: 2,
      pingTimeoutMs: 500,
    },
    operationTimeouts: { ...DEFAULT_OPERATION_TIMEOUTS },
    ...overrides,
  };
}
