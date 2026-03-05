// src/utils/cache-reconnect-manager.ts

import { SpanEvents, telemetryEmitter } from "../telemetry/tracer";

export interface ReconnectManagerConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  cooldownMs: number;
}

export interface ReconnectResult {
  success: boolean;
  error?: Error;
  attempts: number;
  durationMs: number;
}

export interface ReconnectStats {
  attempts: number;
  lastAttemptTime: number;
  isReconnecting: boolean;
  totalSuccesses: number;
  totalFailures: number;
}

export const DEFAULT_RECONNECT_CONFIG: ReconnectManagerConfig = {
  maxAttempts: 5,
  baseDelayMs: 100,
  maxDelayMs: 5000,
  cooldownMs: 60000,
};

export class CacheReconnectManager {
  private reconnectAttempts = 0;
  private lastAttemptTime = 0;
  private reconnectPromise: Promise<ReconnectResult> | null = null;
  private totalSuccesses = 0;
  private totalFailures = 0;

  constructor(private readonly config: ReconnectManagerConfig = DEFAULT_RECONNECT_CONFIG) {}

  async executeReconnect(reconnectFn: () => Promise<void>): Promise<ReconnectResult> {
    if (this.reconnectPromise) {
      telemetryEmitter.debug(
        SpanEvents.CACHE_RECONNECT_STARTED,
        "Reconnection already in progress, waiting",
        {
          component: "cache_reconnect",
          operation: "mutex_wait",
          current_attempts: this.reconnectAttempts,
        }
      );
      return this.reconnectPromise;
    }

    const now = Date.now();
    if (this.lastAttemptTime > 0 && now - this.lastAttemptTime > this.config.cooldownMs) {
      telemetryEmitter.debug(
        SpanEvents.CACHE_RECONNECT_STARTED,
        "Cooldown period elapsed, resetting attempt counter",
        {
          component: "cache_reconnect",
          operation: "cooldown_reset",
          previous_attempts: this.reconnectAttempts,
          elapsed_ms: now - this.lastAttemptTime,
          cooldown_ms: this.config.cooldownMs,
        }
      );
      this.reconnectAttempts = 0;
    }

    if (this.reconnectAttempts >= this.config.maxAttempts) {
      const error = new Error(
        `Max reconnection attempts (${this.config.maxAttempts}) exceeded. ` +
          `Cooldown resets in ${Math.max(0, this.config.cooldownMs - (now - this.lastAttemptTime))}ms`
      );

      telemetryEmitter.warn(
        SpanEvents.CACHE_RECONNECT_EXHAUSTED,
        "Max reconnection attempts exceeded",
        {
          component: "cache_reconnect",
          operation: "max_attempts_exceeded",
          max_attempts: this.config.maxAttempts,
          last_attempt_time: this.lastAttemptTime,
          cooldown_ms: this.config.cooldownMs,
        }
      );

      return {
        success: false,
        error,
        attempts: this.reconnectAttempts,
        durationMs: 0,
      };
    }

    this.reconnectPromise = this.doReconnect(reconnectFn);

    try {
      return await this.reconnectPromise;
    } finally {
      this.reconnectPromise = null;
    }
  }

  private async doReconnect(reconnectFn: () => Promise<void>): Promise<ReconnectResult> {
    const startTime = Date.now();
    this.reconnectAttempts++;
    this.lastAttemptTime = startTime;

    const delayMs = Math.min(
      this.config.baseDelayMs * 2 ** (this.reconnectAttempts - 1),
      this.config.maxDelayMs
    );

    telemetryEmitter.info(
      SpanEvents.CACHE_RECONNECT_STARTED,
      "Starting cache reconnection attempt",
      {
        component: "cache_reconnect",
        operation: "reconnect_start",
        attempt: this.reconnectAttempts,
        max_attempts: this.config.maxAttempts,
        delay_ms: delayMs,
        backoff_formula: `min(${this.config.baseDelayMs} * 2^${this.reconnectAttempts - 1}, ${this.config.maxDelayMs})`,
      }
    );

    if (this.reconnectAttempts > 1) {
      await this.delay(delayMs);
    }

    try {
      await reconnectFn();

      const durationMs = Date.now() - startTime;
      this.totalSuccesses++;

      this.reconnectAttempts = 0;

      telemetryEmitter.info(SpanEvents.CACHE_RECONNECT_SUCCESS, "Cache reconnection successful", {
        component: "cache_reconnect",
        operation: "reconnect_success",
        duration_ms: durationMs,
        total_successes: this.totalSuccesses,
      });

      return {
        success: true,
        attempts: 1,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.totalFailures++;

      const errorObj = error instanceof Error ? error : new Error(String(error));

      telemetryEmitter.warn(
        SpanEvents.CACHE_RECONNECT_FAILED,
        "Cache reconnection attempt failed",
        {
          component: "cache_reconnect",
          operation: "reconnect_failed",
          attempt: this.reconnectAttempts,
          max_attempts: this.config.maxAttempts,
          duration_ms: durationMs,
          error: errorObj.message,
          total_failures: this.totalFailures,
          will_retry: this.reconnectAttempts < this.config.maxAttempts,
        }
      );

      return {
        success: false,
        error: errorObj,
        attempts: this.reconnectAttempts,
        durationMs,
      };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  isReconnecting(): boolean {
    return this.reconnectPromise !== null;
  }

  getStats(): ReconnectStats {
    return {
      attempts: this.reconnectAttempts,
      lastAttemptTime: this.lastAttemptTime,
      isReconnecting: this.isReconnecting(),
      totalSuccesses: this.totalSuccesses,
      totalFailures: this.totalFailures,
    };
  }

  reset(): void {
    this.reconnectAttempts = 0;
    this.lastAttemptTime = 0;
    this.reconnectPromise = null;

    telemetryEmitter.debug(SpanEvents.CACHE_STATE_RESET, "Reconnect manager reset", {
      component: "cache_reconnect",
      operation: "reset",
    });
  }

  forceResetAttempts(): void {
    const previousAttempts = this.reconnectAttempts;
    this.reconnectAttempts = 0;

    telemetryEmitter.info(SpanEvents.CACHE_STATE_RESET, "Reconnect attempts force reset", {
      component: "cache_reconnect",
      operation: "force_reset",
      previous_attempts: previousAttempts,
    });
  }

  getNextDelayMs(): number {
    const nextAttempt = this.reconnectAttempts + 1;
    return Math.min(this.config.baseDelayMs * 2 ** (nextAttempt - 1), this.config.maxDelayMs);
  }

  isExhausted(): boolean {
    return this.reconnectAttempts >= this.config.maxAttempts;
  }

  getCooldownRemainingMs(): number {
    if (this.lastAttemptTime === 0) return 0;
    const elapsed = Date.now() - this.lastAttemptTime;
    return Math.max(0, this.config.cooldownMs - elapsed);
  }
}
