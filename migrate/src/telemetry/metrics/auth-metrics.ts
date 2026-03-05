/* src/telemetry/metrics/auth-metrics.ts */

import { error } from "../../utils/logger";
import { getBoundedConsumerId } from "../cardinality-guard";
import {
  authenticationAttemptsCounter,
  authenticationFailureCounter,
  authenticationSuccessCounter,
  jwtTokenCreationTimeHistogram,
} from "./instruments";
import { isMetricsInitialized } from "./state";
import type { AuthAttributes } from "./types";

export function recordJwtTokenCreation(durationMs: number, consumerId: string): void {
  if (!isMetricsInitialized()) return;

  const boundedConsumerId = getBoundedConsumerId(consumerId);

  const attributes: AuthAttributes = {
    consumer_id: boundedConsumerId,
    operation: "token_generation",
    result: "success",
  };

  try {
    jwtTokenCreationTimeHistogram.record(durationMs / 1000, attributes);
  } catch (err) {
    error("Failed to record JWT token creation time", {
      error: (err as Error).message,
      durationMs,
      attributes,
    });
  }
}

export function recordJwtTokenIssued(username: string, creationTimeMs?: number): void {
  if (creationTimeMs !== undefined) {
    recordJwtTokenCreation(creationTimeMs, username);
  }
}

export function recordAuthenticationSuccess(username?: string): void {
  if (!isMetricsInitialized()) return;

  const boundedConsumerId = username ? getBoundedConsumerId(username) : "unknown";

  const attributes: AuthAttributes = {
    consumer_id: boundedConsumerId,
    operation: "validation",
    result: "success",
  };

  try {
    authenticationSuccessCounter.add(1, attributes);
  } catch (err) {
    error("Failed to record authentication success metric", {
      error: (err as Error).message,
      username,
    });
  }
}

export function recordAuthenticationFailure(username?: string, reason?: string): void {
  if (!isMetricsInitialized()) return;

  const boundedConsumerId = username ? getBoundedConsumerId(username) : "unknown";

  const attributes: AuthAttributes = {
    consumer_id: boundedConsumerId,
    operation: "validation",
    result: "failure",
  };

  try {
    authenticationFailureCounter.add(1, attributes);
  } catch (err) {
    error("Failed to record authentication failure metric", {
      error: (err as Error).message,
      username,
      reason,
    });
  }
}

// Overloaded version of recordAuthenticationAttempt to match test signature
function recordAuthenticationAttemptImpl(username: string): void;
function recordAuthenticationAttemptImpl(type: string, success: boolean, username?: string): void;
function recordAuthenticationAttemptImpl(
  typeOrUsername: string,
  success?: boolean,
  username?: string
): void {
  if (!isMetricsInitialized()) return;

  // Handle the single-parameter case (test signature)
  if (success === undefined && username === undefined) {
    const boundedConsumerId = typeOrUsername ? getBoundedConsumerId(typeOrUsername) : "unknown";

    const attributes: AuthAttributes = {
      consumer_id: boundedConsumerId,
      operation: "validation",
      result: "success",
    };

    try {
      authenticationAttemptsCounter.add(1, attributes);
    } catch (err) {
      error("Failed to record authentication attempt metric", {
        error: (err as Error).message,
        username: typeOrUsername,
      });
    }
  } else {
    // Handle the three-parameter case (existing signature)
    const boundedConsumerId = username ? getBoundedConsumerId(username) : "unknown";

    const attributes: AuthAttributes = {
      consumer_id: boundedConsumerId,
      operation: "validation",
      result: success ? "success" : "failure",
    };

    try {
      authenticationAttemptsCounter.add(1, attributes);
      if (success) {
        authenticationSuccessCounter.add(1, attributes);
      } else {
        authenticationFailureCounter.add(1, attributes);
      }
    } catch (err) {
      error("Failed to record authentication attempt metric", {
        error: (err as Error).message,
        type: typeOrUsername,
        success,
        username,
      });
    }
  }
}

export { recordAuthenticationAttemptImpl as recordAuthenticationAttempt };
