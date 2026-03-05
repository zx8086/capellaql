/* src/telemetry/metrics/kong-metrics.ts */

import { error } from "../../utils/logger";
import { getBoundedConsumerId } from "../cardinality-guard";
import {
  kongCacheHitCounter,
  kongCacheMissCounter,
  kongOperationsCounter,
  kongResponseTimeHistogram,
} from "./instruments";
import { isMetricsInitialized } from "./state";
import type { KongAttributes } from "./types";

export function recordKongOperation(
  operation: string,
  durationMs: number,
  cacheHit?: boolean,
  _extraParam?: unknown
): void {
  if (!isMetricsInitialized()) return;

  const validOperation =
    operation === "get_consumer" ||
    operation === "create_credential" ||
    operation === "health_check"
      ? (operation as "get_consumer" | "create_credential" | "health_check")
      : "health_check";

  const attributes: KongAttributes = {
    operation: validOperation,
    cache_status: cacheHit === true ? "hit" : cacheHit === false ? "miss" : "stale",
  };

  try {
    kongOperationsCounter.add(1, attributes);
    kongResponseTimeHistogram.record(durationMs / 1000, attributes);

    if (cacheHit === true) {
      kongCacheHitCounter.add(1, attributes);
    } else if (cacheHit === false) {
      kongCacheMissCounter.add(1, attributes);
    }
  } catch (err) {
    error("Failed to record Kong operation", {
      error: (err as Error).message,
      operation,
      durationMs,
      cacheHit,
    });
  }
}

export function recordKongResponseTime(
  durationMs: number,
  operation: string,
  success: boolean = true
): void {
  if (!isMetricsInitialized()) return;

  const validOperation =
    operation === "get_consumer" ||
    operation === "create_credential" ||
    operation === "health_check"
      ? (operation as "get_consumer" | "create_credential" | "health_check")
      : "health_check";

  const attributes: KongAttributes = {
    operation: validOperation,
    status: success ? "success" : "failure",
    cache_status: "miss",
  };

  try {
    kongResponseTimeHistogram.record(durationMs, attributes);
  } catch (err) {
    error("Failed to record Kong response time", {
      error: (err as Error).message,
      operation,
      durationMs,
      success,
    });
  }
}

export function recordKongCacheHit(consumerId: string, operation: string): void {
  if (!isMetricsInitialized()) return;

  const validOperation =
    operation === "get_consumer" ||
    operation === "create_credential" ||
    operation === "health_check"
      ? (operation as "get_consumer" | "create_credential" | "health_check")
      : "health_check";

  const boundedConsumerId = getBoundedConsumerId(consumerId);

  const attributes: KongAttributes = {
    operation: validOperation,
    consumer_id: boundedConsumerId,
    cache_status: "hit",
    status: "success",
  };

  try {
    kongCacheHitCounter.add(1, attributes);
  } catch (err) {
    error("Failed to record Kong cache hit", {
      error: (err as Error).message,
      consumerId,
      operation,
    });
  }
}

export function recordKongCacheMiss(consumerId: string, operation: string): void {
  if (!isMetricsInitialized()) return;

  const validOperation =
    operation === "get_consumer" ||
    operation === "create_credential" ||
    operation === "health_check"
      ? (operation as "get_consumer" | "create_credential" | "health_check")
      : "health_check";

  const boundedConsumerId = getBoundedConsumerId(consumerId);

  const attributes: KongAttributes = {
    operation: validOperation,
    consumer_id: boundedConsumerId,
    cache_status: "miss",
    status: "failure",
  };

  try {
    kongCacheMissCounter.add(1, attributes);
  } catch (err) {
    error("Failed to record Kong cache miss", {
      error: (err as Error).message,
      consumerId,
      operation,
    });
  }
}
