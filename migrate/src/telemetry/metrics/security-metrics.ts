/* src/telemetry/metrics/security-metrics.ts */

import { error } from "../../utils/logger";
import { getBoundedConsumerId } from "../cardinality-guard";
import {
  auditEventsCounter,
  securityAnomaliesCounter,
  securityEventsCounter,
  securityHeadersAppliedCounter,
} from "./instruments";
import { isMetricsInitialized } from "./state";
import type { SecurityAttributes } from "./types";

export function recordSecurityEvent(
  eventType: "jwt_anomaly" | "rate_limit" | "suspicious_activity" | "header_validation",
  severity: "low" | "medium" | "high" | "critical",
  consumerId?: string
): void {
  if (!isMetricsInitialized()) return;

  const boundedConsumerId = consumerId ? getBoundedConsumerId(consumerId) : undefined;

  const attributes: SecurityAttributes = {
    event_type: eventType,
    severity,
    version: "v2",
    ...(boundedConsumerId && { consumer_id: boundedConsumerId }),
  };

  try {
    securityEventsCounter.add(1, attributes);

    if (severity === "high" || severity === "critical") {
      securityAnomaliesCounter.add(1, attributes);
    }
  } catch (err) {
    error("Failed to record security event", {
      error: (err as Error).message,
      attributes,
    });
  }
}

export function recordSecurityHeaders(): void {
  if (!isMetricsInitialized()) return;

  const attributes: SecurityAttributes = {
    event_type: "header_validation",
    severity: "low",
    version: "v2",
  };

  try {
    securityHeadersAppliedCounter.add(1, attributes);
  } catch (err) {
    error("Failed to record security headers application", {
      error: (err as Error).message,
    });
  }
}

export function recordSecurityHeadersApplied(version: string, headerCount: number): void {
  recordSecurityHeaders();
}

export function recordAuditEvent(eventType: string, auditLevel: string, version?: string): void {
  if (!isMetricsInitialized()) return;

  const validSeverity = ["low", "medium", "high", "critical"].includes(auditLevel)
    ? (auditLevel as "low" | "medium" | "high" | "critical")
    : "low";
  const validVersion = version === "v2" ? version : "v2";

  const attributes: SecurityAttributes = {
    event_type: "header_validation",
    severity: validSeverity,
    version: validVersion,
  };

  try {
    auditEventsCounter.add(1, attributes);
  } catch (err) {
    error("Failed to record audit event", {
      error: (err as Error).message,
      eventType,
      auditLevel,
      version,
    });
  }
}
