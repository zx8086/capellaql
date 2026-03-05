/* src/telemetry/metrics/circuit-breaker-metrics.ts */

import { error } from "../../utils/logger";
import {
  circuitBreakerFallbackCounter,
  circuitBreakerRejectedCounter,
  circuitBreakerRequestsCounter,
  circuitBreakerStateGauge,
  circuitBreakerStateTransitionCounter,
} from "./instruments";
import { isMetricsInitialized } from "./state";
import type { CircuitBreakerAttributes } from "./types";

export function recordCircuitBreakerState(
  operation: string,
  state: "closed" | "open" | "half_open"
): void {
  if (!isMetricsInitialized()) return;

  const attributes: CircuitBreakerAttributes = { operation, state };
  const stateValue = state === "closed" ? 0 : state === "open" ? 1 : 2;

  try {
    circuitBreakerStateGauge.record(stateValue, attributes);
  } catch (err) {
    error("Failed to record circuit breaker state", {
      error: (err as Error).message,
      operation,
      state,
    });
  }
}

export function recordCircuitBreakerOperation(
  operation: string,
  state: "closed" | "open" | "half_open",
  action: "request" | "rejected" | "fallback" | "state_transition"
): void {
  if (!isMetricsInitialized()) return;

  const attributes: CircuitBreakerAttributes = { operation, state };

  try {
    switch (action) {
      case "request":
        circuitBreakerRequestsCounter.add(1, attributes);
        break;
      case "rejected":
        circuitBreakerRejectedCounter.add(1, attributes);
        break;
      case "fallback":
        circuitBreakerFallbackCounter.add(1, attributes);
        break;
      case "state_transition":
        circuitBreakerStateTransitionCounter.add(1, attributes);
        break;
    }
  } catch (err) {
    error("Failed to record circuit breaker operation", {
      error: (err as Error).message,
      operation,
      state,
      action,
    });
  }
}

export function recordCircuitBreakerRequest(operation: string, state?: string): void {
  if (!isMetricsInitialized()) return;

  const validState = state === "open" || state === "half_open" ? state : "closed";
  recordCircuitBreakerOperation(operation, validState, "request");
}

export function recordCircuitBreakerRejection(operation: string, reason?: string): void {
  if (!isMetricsInitialized()) return;

  recordCircuitBreakerOperation(operation, "open", "rejected");
}

export function recordCircuitBreakerStateTransition(
  operation: string,
  fromState: string,
  toState: string
): void {
  if (!isMetricsInitialized()) return;

  const validToState =
    toState === "open" || toState === "half_open" || toState === "closed" ? toState : "closed";
  recordCircuitBreakerOperation(operation, validToState, "state_transition");
}

export function recordCircuitBreakerFallback(operation: string, reason?: string): void {
  if (!isMetricsInitialized()) return;

  recordCircuitBreakerOperation(operation, "open", "fallback");
}
