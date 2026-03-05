/* src/telemetry/metrics/redis-metrics.ts */

import { error } from "../../utils/logger";
import {
  kongCacheHitCounter,
  kongCacheMissCounter,
  redisCacheHitCounter,
  redisCacheMissCounter,
  redisConnectionsGauge,
  redisErrorsCounter,
  redisOperationDurationHistogram,
  redisOperationsCounter,
} from "./instruments";
import { isMetricsInitialized } from "./state";
import type { ErrorAttributes, KongAttributes, RedisAttributes } from "./types";

export function recordRedisOperation(
  operation: string,
  durationMs: number,
  success: boolean = true,
  _extraParam1?: unknown,
  _extraParam2?: unknown
): void {
  if (!isMetricsInitialized()) return;

  const validOperation =
    operation === "get" ||
    operation === "set" ||
    operation === "del" ||
    operation === "exists" ||
    operation === "expire"
      ? (operation as "get" | "set" | "del" | "exists" | "expire")
      : "get";

  const attributes: RedisAttributes = { operation: validOperation };

  try {
    redisOperationsCounter.add(1, attributes);
    redisOperationDurationHistogram.record(durationMs / 1000, attributes);

    if (!success) {
      const errorAttributes: ErrorAttributes = {
        error_type: "redis_operation_error",
        operation,
        component: "redis",
      };
      redisErrorsCounter.add(1, errorAttributes);
    }
  } catch (err) {
    error("Failed to record Redis operation", {
      error: (err as Error).message,
      operation,
      durationMs,
      success,
    });
  }
}

export function recordCacheOperation(
  operation: "hit" | "miss",
  tier: "redis" | "kong" = "redis"
): void {
  if (!isMetricsInitialized()) return;

  try {
    if (tier === "redis") {
      const attributes: RedisAttributes = { operation: operation === "hit" ? "get" : "set" };

      if (operation === "hit") {
        redisCacheHitCounter.add(1, attributes);
      } else {
        redisCacheMissCounter.add(1, attributes);
      }
    } else if (tier === "kong") {
      const attributes: KongAttributes = {
        operation: "get_consumer",
        cache_status: operation,
      };

      if (operation === "hit") {
        kongCacheHitCounter.add(1, attributes);
      } else {
        kongCacheMissCounter.add(1, attributes);
      }
    }
  } catch (err) {
    error("Failed to record cache operation", {
      error: (err as Error).message,
      operation,
      tier,
    });
  }
}

export function recordRedisConnection(increment: boolean): void {
  if (!isMetricsInitialized()) return;

  const attributes: RedisAttributes = { operation: "exists" };

  try {
    redisConnectionsGauge.record(increment ? 1 : 0, attributes);
  } catch (err) {
    error("Failed to record Redis connection", {
      error: (err as Error).message,
      increment,
    });
  }
}
