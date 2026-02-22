/* src/config/helpers.ts */
// Utility functions for configuration management
// Aligned with migrate reference pattern

import type { Config } from "./schemas";

// =============================================================================
// ENVIRONMENT VARIABLE PARSING
// =============================================================================

/**
 * Get environment variable value
 * Bun-first approach with Node.js fallback
 */
export function getEnvVar(key: string): string | undefined {
  // Bun-first approach - check if we're in Bun runtime
  if (typeof Bun !== "undefined") {
    const value = Bun.env[key];
    if (value !== undefined && value !== null && value !== "") {
      return String(value);
    }
  }

  // Fallback to process.env for compatibility
  try {
    const value = process.env[key];
    if (value !== undefined && value !== null && value !== "") {
      return String(value);
    }
  } catch (_error) {
    // Silent fallback in case process is not available
  }

  return undefined;
}

/**
 * Parse environment variable with type coercion and validation
 */
export function parseEnvVar(
  value: string | undefined,
  type: "string" | "number" | "boolean" | "array" | "json",
  fieldName?: string
): unknown {
  if (value === undefined || value === "") return undefined;

  // Clean up quoted values and whitespace (handles both single and double quotes)
  value = value.replace(/^['"]|['"]$/g, "").trim();

  // Handle empty strings after trimming
  if (value === "") return undefined;

  try {
    switch (type) {
      case "number": {
        // Special handling for floating point numbers
        const parsed = Number(value);
        if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
          console.warn(`Warning: Environment variable ${fieldName} has invalid number value: '${value}'. Using default.`);
          return undefined;
        }
        return parsed;
      }

      case "boolean": {
        const normalized = value.toLowerCase().trim();
        // Comprehensive boolean value handling
        const truthyValues = ["true", "1", "yes", "on", "enabled", "enable"];
        const falsyValues = ["false", "0", "no", "off", "disabled", "disable"];

        if (truthyValues.includes(normalized)) return true;
        if (falsyValues.includes(normalized)) return false;

        console.warn(`Warning: Environment variable ${fieldName} has ambiguous boolean value: '${value}'. Treating as false.`);
        return false;
      }

      case "array": {
        // Handle comma-separated arrays with flexible whitespace
        return value
          .split(/[,;|]/)
          .map((s) => s.trim())
          .filter(Boolean);
      }

      case "json": {
        try {
          return JSON.parse(value);
        } catch (_jsonError) {
          console.warn(`Warning: Environment variable ${fieldName} contains invalid JSON: '${value}'. Using default.`);
          return undefined;
        }
      }
      default:
        return value;
    }
  } catch (error) {
    console.warn(`Warning: Failed to parse environment variable ${fieldName}: ${error}. Using default.`);
    return undefined;
  }
}

/**
 * Convert string to boolean with default value
 * Per migrate reference pattern
 */
export function toBool(value: string | boolean | undefined, defaultValue: boolean = false): boolean {
  if (value === undefined) return defaultValue;
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return defaultValue;
  const normalized = value.toLowerCase().trim();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

// =============================================================================
// OTLP ENDPOINT DERIVATION (per migrate pattern)
// =============================================================================

export const OTLP_STANDARD_PATHS = {
  traces: "/v1/traces",
  metrics: "/v1/metrics",
  logs: "/v1/logs",
} as const;

/**
 * Derive OTLP endpoint from base endpoint
 */
export function deriveOtlpEndpoint(
  baseEndpoint: string | undefined,
  specificEndpoint: string | undefined,
  pathSuffix: string
): string | undefined {
  // Only use specificEndpoint if it's not empty
  if (specificEndpoint && specificEndpoint.trim() !== "") {
    return specificEndpoint;
  }

  // Handle empty string baseEndpoint as a special case
  if (baseEndpoint !== undefined && baseEndpoint.trim() === "") {
    return pathSuffix.startsWith("/") ? pathSuffix : `/${pathSuffix}`;
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
 * Sanitize config for safe logging
 * Redacts sensitive values while preserving structure
 */
export function sanitizeConfigForLogging(config: Config): any {
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
          // For non-empty sensitive values, show partial info for debugging
          if (value.length <= 8) {
            return "***REDACTED***";
          } else {
            // Show first 2 and last 2 characters for debugging while masking middle
            return `${value.substring(0, 2)}***${value.substring(value.length - 2)}`;
          }
        } else {
          return value; // undefined, null, or empty string - keep as is
        }
      }

      // Special handling for URLs that might contain sensitive info in query params or userinfo
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
        } catch (_error) {
          // If URL parsing fails, return original value (not a URL after all)
          return value;
        }
      }

      return value;
    })
  );
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Cross-domain validation rules
 */
export function validateCrossConfiguration(config: Config): string[] {
  const warnings: string[] = [];
  const isProduction = config.runtime.NODE_ENV === "production" || config.telemetry.DEPLOYMENT_ENVIRONMENT === "production";

  // RUNTIME SAFETY VALIDATIONS (All Environments)

  // Validate cache TTL is reasonable (not NaN or infinite)
  if (Number.isNaN(config.application.YOGA_RESPONSE_CACHE_TTL)) {
    warnings.push("Cache TTL cannot be NaN - this would cause runtime errors");
  }

  // Validate telemetry intervals are not NaN (prevents infinite loops)
  if (Number.isNaN(config.telemetry.METRIC_READER_INTERVAL)) {
    warnings.push("METRIC_READER_INTERVAL is NaN - this will cause infinite loops");
  }

  if (Number.isNaN(config.telemetry.SUMMARY_LOG_INTERVAL)) {
    warnings.push("SUMMARY_LOG_INTERVAL is NaN - this will cause infinite loops");
  }

  // BUSINESS RULE VALIDATIONS

  // Ensure application and telemetry environment alignment
  if (config.runtime.NODE_ENV !== config.telemetry.DEPLOYMENT_ENVIRONMENT) {
    // Log warning but don't fail validation - this might be intentional
    console.warn(
      `Environment mismatch: NODE_ENV=${config.runtime.NODE_ENV} but DEPLOYMENT_ENVIRONMENT=${config.telemetry.DEPLOYMENT_ENVIRONMENT}`
    );
  }

  // Production security validations
  if (isProduction) {
    // Critical security check for default passwords
    if (config.capella.COUCHBASE_PASSWORD === "password") {
      warnings.push("CRITICAL SECURITY: Default password not allowed in production - this is a security vulnerability");
    }

    // Check for default usernames in production
    if (config.capella.COUCHBASE_USERNAME === "Administrator") {
      warnings.push("WARNING: Using default Administrator username in production is not recommended");
    }

    // Validate CORS origins in production
    if (config.application.ALLOWED_ORIGINS.some((origin) => origin === "*" || origin.includes("localhost"))) {
      warnings.push("Production CORS origins should not include localhost or wildcards");
    }

    // Validate export timeout compliance with 2025 standards
    if (config.telemetry.EXPORT_TIMEOUT_MS > 30000) {
      warnings.push("EXPORT_TIMEOUT_MS exceeds 30 seconds - this violates 2025 OpenTelemetry standards");
    }
  }

  return warnings;
}

/**
 * Comprehensive health validation
 */
export function validateConfigHealth(config: Config): { healthy: boolean; issues: string[]; warnings: string[] } {
  const issues: string[] = [];
  const warnings: string[] = [];

  const isProduction = config.runtime.NODE_ENV === "production" || config.telemetry.DEPLOYMENT_ENVIRONMENT === "production";

  // APPLICATION SECTION VALIDATION

  // Check for NaN values that cause runtime issues
  if (Number.isNaN(config.application.YOGA_RESPONSE_CACHE_TTL)) {
    issues.push("YOGA_RESPONSE_CACHE_TTL is NaN - will cause runtime errors");
  }

  // Check for reasonable timeout values
  if (config.application.YOGA_RESPONSE_CACHE_TTL <= 0 || config.application.YOGA_RESPONSE_CACHE_TTL > 3600000) {
    issues.push(`YOGA_RESPONSE_CACHE_TTL value is unreasonable: ${config.application.YOGA_RESPONSE_CACHE_TTL}ms`);
  }

  // CAPELLA SECTION VALIDATION

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

  // RUNTIME SECTION VALIDATION

  // Check DNS TTL is reasonable
  if (Number.isNaN(config.runtime.BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS)) {
    issues.push("BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS is NaN - will cause DNS caching issues");
  }

  if (config.runtime.BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS > 3600) {
    warnings.push("DNS TTL exceeds 1 hour - may cause stale DNS resolution");
  }

  // TELEMETRY SECTION VALIDATION

  // Check telemetry intervals for NaN (prevents infinite loops)
  if (Number.isNaN(config.telemetry.METRIC_READER_INTERVAL)) {
    issues.push("METRIC_READER_INTERVAL is NaN - will cause infinite loops");
  }

  if (Number.isNaN(config.telemetry.SUMMARY_LOG_INTERVAL)) {
    issues.push("SUMMARY_LOG_INTERVAL is NaN - will cause infinite loops");
  }

  if (Number.isNaN(config.telemetry.EXPORT_TIMEOUT_MS)) {
    issues.push("EXPORT_TIMEOUT_MS is NaN - will cause telemetry failures");
  }

  // Production telemetry validation
  if (isProduction) {
    if (config.telemetry.BATCH_SIZE < 512) {
      warnings.push("Small batch size may impact telemetry efficiency in production");
    }
  }

  return {
    healthy: issues.length === 0,
    issues,
    warnings,
  };
}

/**
 * Generate comprehensive health report
 */
export function generateConfigHealthReport(config: Config): string {
  const health = validateConfigHealth(config);
  const isProduction = config.runtime.NODE_ENV === "production" || config.telemetry.DEPLOYMENT_ENVIRONMENT === "production";

  let report = "\n=== CONFIGURATION HEALTH REPORT ===\n";

  // Overall status
  if (health.healthy) {
    report += "Overall Status: HEALTHY\n";
  } else {
    report += "Overall Status: UNHEALTHY\n";
  }

  report += `Environment: ${isProduction ? "PRODUCTION" : "DEVELOPMENT"}\n`;
  report += `Total Issues: ${health.issues.length}\n`;
  report += `Total Warnings: ${health.warnings.length}\n\n`;

  // Critical issues
  if (health.issues.length > 0) {
    report += "=== CRITICAL ISSUES ===\n";
    health.issues.forEach((issue, index) => {
      report += `${index + 1}. ${issue}\n`;
    });
    report += "\n";
  }

  // Warnings
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
