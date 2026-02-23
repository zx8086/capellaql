/* src/config/helpers.ts */
// Utility functions for configuration management
// Per 4-pillar pattern: Strict helpers that catch errors early

import type { Config } from "./schemas";

// =============================================================================
// BOOLEAN CONVERSION (per 4-pillar pattern)
// =============================================================================

const TRUTHY = new Set(["true", "1", "yes", "on", "enabled", "enable"]);
const FALSY = new Set(["false", "0", "no", "off", "disabled", "disable"]);

/**
 * Convert a string environment variable to boolean.
 *
 * Per 4-pillar pattern: Throws on unrecognized values to catch typos immediately.
 * This prevents bugs like "tru" silently becoming false.
 *
 * @throws {Error} if the value is a non-empty string that isn't recognized
 */
export function toBool(value: string | boolean | undefined): boolean | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value === "boolean") return value;

  const normalized = value.toLowerCase().trim();

  if (TRUTHY.has(normalized)) return true;
  if (FALSY.has(normalized)) return false;

  throw new Error(`Cannot convert "${value}" to boolean. Expected one of: ${[...TRUTHY, ...FALSY].join(", ")}`);
}

// =============================================================================
// OTLP ENDPOINT DERIVATION
// =============================================================================

export const OTLP_STANDARD_PATHS = {
  traces: "/v1/traces",
  metrics: "/v1/metrics",
  logs: "/v1/logs",
} as const;

/**
 * Derive OTLP endpoint from base endpoint.
 * Returns specificEndpoint if set, otherwise appends pathSuffix to baseEndpoint.
 */
export function deriveOtlpEndpoint(
  baseEndpoint: string | undefined,
  specificEndpoint: string | undefined,
  pathSuffix: string
): string | undefined {
  // Use specific endpoint if provided and non-empty
  if (specificEndpoint && specificEndpoint.trim() !== "") {
    return specificEndpoint;
  }

  if (!baseEndpoint) {
    return undefined;
  }

  const normalizedBase = baseEndpoint.replace(/\/$/, "");
  const normalizedPath = pathSuffix.startsWith("/") ? pathSuffix : `/${pathSuffix}`;

  return `${normalizedBase}${normalizedPath}`;
}

// =============================================================================
// CONFIGURATION SANITIZATION
// =============================================================================

/**
 * Sanitize config for safe logging.
 * Redacts sensitive values while preserving structure.
 */
export function sanitizeConfigForLogging(config: Config): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(config, (key, value) => {
      // Comprehensive list of sensitive key patterns
      const sensitiveKeys = [
        "password",
        "secret",
        "token",
        "key",
        "apikey",
        "auth",
        "credential",
        "cert",
        "private",
        "pass",
        "pwd",
        "hash",
      ];

      // Check if current key contains any sensitive patterns
      if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
        if (value && typeof value === "string" && value.length > 0) {
          return "[REDACTED]";
        }
        return value; // undefined, null, or empty string - keep as is
      }

      // Special handling for URLs that might contain sensitive info
      if (typeof value === "string" && (value.startsWith("http") || value.startsWith("couchbase"))) {
        try {
          const url = new URL(value);
          // Mask userinfo if present
          if (url.username || url.password) {
            url.username = url.username ? "REDACTED" : "";
            url.password = url.password ? "REDACTED" : "";
          }
          // Clear potentially sensitive query parameters
          for (const [paramKey] of url.searchParams) {
            if (sensitiveKeys.some((k) => paramKey.toLowerCase().includes(k))) {
              url.searchParams.set(paramKey, "REDACTED");
            }
          }
          return url.toString();
        } catch {
          // If URL parsing fails, return original value
          return value;
        }
      }

      return value;
    })
  );
}

// =============================================================================
// CONFIGURATION DESCRIPTION (per 4-pillar pattern)
// =============================================================================

/**
 * Return a redacted copy of the config safe for logging.
 * Secrets are replaced with [REDACTED].
 *
 * Per 4-pillar pattern: describeConfig() utility for debugging deployments
 * without leaking sensitive values.
 */
export function describeConfig(config: Config): Record<string, unknown> {
  return {
    ...sanitizeConfigForLogging(config),
    _meta: {
      pattern: "4-pillar-v2",
      loadedAt: new Date().toISOString(),
      environment: config.runtime.NODE_ENV,
      deploymentEnvironment: config.telemetry.DEPLOYMENT_ENVIRONMENT,
    },
  };
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Cross-domain validation rules.
 * Returns warnings for non-critical issues.
 */
export function validateCrossConfiguration(config: Config): string[] {
  const warnings: string[] = [];
  const isProduction =
    config.runtime.NODE_ENV === "production" || config.telemetry.DEPLOYMENT_ENVIRONMENT === "production";

  // Runtime safety validations (all environments)
  if (Number.isNaN(config.application.YOGA_RESPONSE_CACHE_TTL)) {
    warnings.push("Cache TTL cannot be NaN - this would cause runtime errors");
  }

  if (Number.isNaN(config.telemetry.METRIC_READER_INTERVAL)) {
    warnings.push("METRIC_READER_INTERVAL is NaN - this will cause infinite loops");
  }

  if (Number.isNaN(config.telemetry.SUMMARY_LOG_INTERVAL)) {
    warnings.push("SUMMARY_LOG_INTERVAL is NaN - this will cause infinite loops");
  }

  // Environment alignment check
  if (config.runtime.NODE_ENV !== config.telemetry.DEPLOYMENT_ENVIRONMENT) {
    warnings.push(
      `Environment mismatch: NODE_ENV=${config.runtime.NODE_ENV} but DEPLOYMENT_ENVIRONMENT=${config.telemetry.DEPLOYMENT_ENVIRONMENT}`
    );
  }

  // Production-specific validations
  if (isProduction) {
    if (config.capella.COUCHBASE_PASSWORD === "password") {
      warnings.push("CRITICAL SECURITY: Default password not allowed in production");
    }

    if (config.capella.COUCHBASE_USERNAME === "Administrator") {
      warnings.push("WARNING: Using default Administrator username in production is not recommended");
    }

    if (config.application.ALLOWED_ORIGINS.some((origin) => origin === "*" || origin.includes("localhost"))) {
      warnings.push("Production CORS origins should not include localhost or wildcards");
    }

    if (config.telemetry.EXPORT_TIMEOUT_MS > 30000) {
      warnings.push("EXPORT_TIMEOUT_MS exceeds 30 seconds - this violates 2025 OpenTelemetry standards");
    }
  }

  return warnings;
}

/**
 * Comprehensive health validation.
 */
export function validateConfigHealth(config: Config): {
  healthy: boolean;
  issues: string[];
  warnings: string[];
} {
  const issues: string[] = [];
  const warnings: string[] = [];

  const isProduction =
    config.runtime.NODE_ENV === "production" || config.telemetry.DEPLOYMENT_ENVIRONMENT === "production";

  // Application section validation
  if (Number.isNaN(config.application.YOGA_RESPONSE_CACHE_TTL)) {
    issues.push("YOGA_RESPONSE_CACHE_TTL is NaN - will cause runtime errors");
  }

  if (config.application.YOGA_RESPONSE_CACHE_TTL <= 0 || config.application.YOGA_RESPONSE_CACHE_TTL > 3600000) {
    issues.push(`YOGA_RESPONSE_CACHE_TTL value is unreasonable: ${config.application.YOGA_RESPONSE_CACHE_TTL}ms`);
  }

  // Production-specific security checks
  if (isProduction) {
    if (config.capella.COUCHBASE_PASSWORD === "password") {
      issues.push("CRITICAL: Using default password in production - security risk");
    }

    if (config.application.ALLOWED_ORIGINS.some((origin) => origin.includes("localhost"))) {
      issues.push("Production CORS origins should not include localhost");
    }

    if (config.capella.COUCHBASE_USERNAME === "Administrator") {
      warnings.push("Using default Administrator username in production is not recommended");
    }
  }

  // Runtime section validation
  if (Number.isNaN(config.runtime.BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS)) {
    issues.push("BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS is NaN - will cause DNS caching issues");
  }

  if (config.runtime.BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS > 3600) {
    warnings.push("DNS TTL exceeds 1 hour - may cause stale DNS resolution");
  }

  // Telemetry section validation
  if (Number.isNaN(config.telemetry.METRIC_READER_INTERVAL)) {
    issues.push("METRIC_READER_INTERVAL is NaN - will cause infinite loops");
  }

  if (Number.isNaN(config.telemetry.SUMMARY_LOG_INTERVAL)) {
    issues.push("SUMMARY_LOG_INTERVAL is NaN - will cause infinite loops");
  }

  if (Number.isNaN(config.telemetry.EXPORT_TIMEOUT_MS)) {
    issues.push("EXPORT_TIMEOUT_MS is NaN - will cause telemetry failures");
  }

  if (isProduction && config.telemetry.BATCH_SIZE < 512) {
    warnings.push("Small batch size may impact telemetry efficiency in production");
  }

  return {
    healthy: issues.length === 0,
    issues,
    warnings,
  };
}

/**
 * Generate comprehensive health report.
 */
export function generateConfigHealthReport(config: Config): string {
  const health = validateConfigHealth(config);
  const isProduction =
    config.runtime.NODE_ENV === "production" || config.telemetry.DEPLOYMENT_ENVIRONMENT === "production";

  let report = "\n=== CONFIGURATION HEALTH REPORT ===\n";

  report += health.healthy ? "Overall Status: HEALTHY\n" : "Overall Status: UNHEALTHY\n";
  report += `Environment: ${isProduction ? "PRODUCTION" : "DEVELOPMENT"}\n`;
  report += `Total Issues: ${health.issues.length}\n`;
  report += `Total Warnings: ${health.warnings.length}\n\n`;

  if (health.issues.length > 0) {
    report += "=== CRITICAL ISSUES ===\n";
    health.issues.forEach((issue, index) => {
      report += `${index + 1}. ${issue}\n`;
    });
    report += "\n";
  }

  if (health.warnings.length > 0) {
    report += "=== WARNINGS ===\n";
    health.warnings.forEach((warning, index) => {
      report += `${index + 1}. ${warning}\n`;
    });
    report += "\n";
  }

  if (health.healthy && health.warnings.length === 0) {
    report += "All configuration checks passed!\n";
  }

  report += "=== END HEALTH REPORT ===\n\n";

  return report;
}
