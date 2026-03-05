/* src/telemetry/metrics/cache-metrics.ts */

import type { CacheErrorCategory } from "../../utils/cache-error-detector";
import { error } from "../../utils/logger";
import {
  cacheTierErrorCounter,
  cacheTierLatencyHistogram,
  cacheTierUsageCounter,
  circuitBreakerRejectedCounter,
  circuitBreakerRequestsCounter,
  circuitBreakerStateTransitionCounter,
  operationDurationHistogram,
} from "./instruments";
import { isMetricsInitialized } from "./state";
import type { CacheTierAttributes, CircuitBreakerAttributes, ErrorAttributes } from "./types";

const VALID_CACHE_TIERS = [
  "memory",
  "redis",
  "redis-stale",
  "in-memory",
  "in-memory-fallback",
  "kong",
  "fallback",
] as const;
type ValidCacheTier = (typeof VALID_CACHE_TIERS)[number];

export function recordCacheTierUsage(tier: string, operation: string): void {
  if (!isMetricsInitialized()) return;

  const validTier = VALID_CACHE_TIERS.includes(tier as ValidCacheTier)
    ? (tier as ValidCacheTier)
    : "fallback";
  const validOperation = ["get", "set", "delete", "invalidate"].includes(operation)
    ? (operation as "get" | "set" | "delete" | "invalidate")
    : "get";

  const attributes: CacheTierAttributes = {
    tier: validTier,
    operation: validOperation,
  };

  try {
    cacheTierUsageCounter.add(1, attributes);
  } catch (err) {
    error("Failed to record cache tier usage", {
      error: (err as Error).message,
      tier,
      operation,
    });
  }
}

export function recordCacheTierLatency(tier: string, operation: string, latencyMs: number): void {
  if (!isMetricsInitialized()) return;

  const validTier = VALID_CACHE_TIERS.includes(tier as ValidCacheTier)
    ? (tier as ValidCacheTier)
    : "fallback";
  const validOperation = ["get", "set", "delete", "invalidate"].includes(operation)
    ? (operation as "get" | "set" | "delete" | "invalidate")
    : "get";

  const attributes: CacheTierAttributes = {
    tier: validTier,
    operation: validOperation,
  };

  try {
    cacheTierLatencyHistogram.record(latencyMs / 1000, attributes);
  } catch (err) {
    error("Failed to record cache tier latency", {
      error: (err as Error).message,
      tier,
      operation,
      latencyMs,
    });
  }
}

export function recordCacheTierError(tier: string, operation: string, errorType?: string): void {
  if (!isMetricsInitialized()) return;

  const attributes: ErrorAttributes = {
    error_type: errorType || "cache_error",
    operation,
    component: tier,
  };

  try {
    cacheTierErrorCounter.add(1, attributes);
  } catch (err) {
    error("Failed to record cache tier error", {
      error: (err as Error).message,
      tier,
      operation,
      errorType,
    });
  }
}

export function recordOperationDuration(
  operation: string,
  durationMs: number,
  component?: string | boolean
): void {
  if (!isMetricsInitialized()) return;

  try {
    const componentName = typeof component === "string" ? component : "unknown";
    operationDurationHistogram.record(durationMs / 1000, { operation, component: componentName });
  } catch (err) {
    error("Failed to record operation duration", {
      error: (err as Error).message,
      operation,
      component,
      durationMs,
    });
  }
}

/**
 * Record a cache reconnection attempt.
 *
 * @param success - Whether the reconnection was successful
 * @param attemptNumber - Which attempt number this was (1-based)
 * @param durationMs - Duration of the reconnection attempt
 */
export function recordCacheReconnectAttempt(
  success: boolean,
  attemptNumber: number,
  durationMs: number
): void {
  if (!isMetricsInitialized()) return;

  try {
    // Record as cache tier operation with redis tier
    cacheTierUsageCounter.add(1, {
      tier: "redis",
      operation: "get", // Using 'get' as fallback since 'reconnect' is not in the type
    });

    // Record latency
    cacheTierLatencyHistogram.record(durationMs / 1000, {
      tier: "redis",
      operation: "get",
    });

    // Record errors for failed reconnection
    if (!success) {
      cacheTierErrorCounter.add(1, {
        error_type: "reconnect_failed",
        operation: "reconnect",
        component: "cache_reconnect",
      });
    }
  } catch (err) {
    error("Failed to record cache reconnect attempt", {
      error: (err as Error).message,
      success,
      attemptNumber,
      durationMs,
    });
  }
}

/**
 * Record a cache circuit breaker operation.
 *
 * @param operation - The operation name (e.g., "cache_operations")
 * @param state - Current circuit breaker state
 * @param result - Operation result (request, rejected, state_transition)
 */
export function recordCacheCircuitBreakerOperation(
  operation: string,
  state: "closed" | "open" | "half_open" | string,
  result: "request" | "rejected" | "state_transition"
): void {
  if (!isMetricsInitialized()) return;

  // Normalize state to valid enum values
  const normalizedState =
    state === "CLOSED"
      ? "closed"
      : state === "OPEN"
        ? "open"
        : state === "HALF_OPEN"
          ? "half_open"
          : (state.toLowerCase() as "closed" | "open" | "half_open");

  const attributes: CircuitBreakerAttributes = {
    operation,
    state: normalizedState,
  };

  try {
    if (result === "rejected") {
      circuitBreakerRejectedCounter.add(1, attributes);
    } else if (result === "state_transition") {
      circuitBreakerStateTransitionCounter.add(1, attributes);
    } else {
      circuitBreakerRequestsCounter.add(1, attributes);
    }
  } catch (err) {
    error("Failed to record cache circuit breaker operation", {
      error: (err as Error).message,
      operation,
      state,
      result,
    });
  }
}

/**
 * Record a cache error by category.
 *
 * @param category - The error category from cache-error-detector
 * @param operation - The operation that failed (e.g., "GET", "SET")
 */
export function recordCacheErrorByCategory(category: CacheErrorCategory, operation: string): void {
  if (!isMetricsInitialized()) return;

  try {
    cacheTierErrorCounter.add(1, {
      error_type: category,
      operation,
      component: "shared_redis_cache",
    });
  } catch (err) {
    error("Failed to record cache error by category", {
      error: (err as Error).message,
      category,
      operation,
    });
  }
}

/**
 * Record a cache operation timeout.
 *
 * @param operation - The operation that timed out (e.g., "GET", "SET")
 * @param timeoutMs - The timeout value in milliseconds
 */
export function recordCacheOperationTimeout(operation: string, timeoutMs: number): void {
  if (!isMetricsInitialized()) return;

  try {
    cacheTierErrorCounter.add(1, {
      error_type: "operation_timeout",
      operation,
      component: "shared_redis_cache",
    });
  } catch (err) {
    error("Failed to record cache operation timeout", {
      error: (err as Error).message,
      operation,
      timeoutMs,
    });
  }
}

/**
 * Record cache health check result.
 *
 * @param success - Whether the health check succeeded
 * @param responseTimeMs - Response time in milliseconds (undefined if failed)
 */
export function recordCacheHealthCheck(success: boolean, responseTimeMs?: number): void {
  if (!isMetricsInitialized()) return;

  try {
    if (success && responseTimeMs !== undefined) {
      cacheTierLatencyHistogram.record(responseTimeMs / 1000, {
        tier: "redis",
        operation: "get", // Using 'get' as closest match for health check
      });
    }

    if (!success) {
      cacheTierErrorCounter.add(1, {
        error_type: "health_check_failed",
        operation: "health_check",
        component: "cache_health_monitor",
      });
    }
  } catch (err) {
    error("Failed to record cache health check", {
      error: (err as Error).message,
      success,
      responseTimeMs,
    });
  }
}
