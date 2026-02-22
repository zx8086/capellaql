// Configuration validation orchestration
import { z } from "zod";
import type { Config } from "../base";

// Cross-domain validation rules
export function validateCrossConfiguration(config: Config): string[] {
  const warnings: string[] = [];
  const isProduction =
    config.runtime.NODE_ENV === "production" || config.telemetry.DEPLOYMENT_ENVIRONMENT === "production";

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

  // Validate port availability (basic check)
  if (config.application.PORT < 1024 && !isProduction) {
    console.warn(`Port ${config.application.PORT} is a privileged port - ensure proper permissions`);
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

    // Validate telemetry sampling rate for production
    if (config.telemetry.SAMPLING_RATE > 0.5) {
      warnings.push("SAMPLING_RATE above 50% may impact performance in production");
    }

    // Validate export timeout compliance with 2025 standards
    if (config.telemetry.EXPORT_TIMEOUT_MS > 30000) {
      warnings.push("EXPORT_TIMEOUT_MS exceeds 30 seconds - this violates 2025 OpenTelemetry standards");
    }
  }

  return warnings;
}

// Comprehensive health validation
export function validateConfigHealth(config: Config): { healthy: boolean; issues: string[]; warnings: string[] } {
  const issues: string[] = [];
  const warnings: string[] = [];

  const isProduction =
    config.runtime.NODE_ENV === "production" || config.telemetry.DEPLOYMENT_ENVIRONMENT === "production";

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
    if (config.telemetry.SAMPLING_RATE > 0.8) {
      warnings.push("Very high sampling rate may impact production performance");
    }

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

// Generate comprehensive health report
export function generateConfigHealthReport(config: Config): string {
  const health = validateConfigHealth(config);
  const isProduction =
    config.runtime.NODE_ENV === "production" || config.telemetry.DEPLOYMENT_ENVIRONMENT === "production";

  let report = "\n=== CONFIGURATION HEALTH REPORT ===\n";

  // Overall status
  if (health.healthy) {
    report += "Overall Status: HEALTHY\n";
  } else {
    report += "Overall Status: UNHEALTHY\n";
  }

  report += `🌍 Environment: ${isProduction ? "PRODUCTION" : "DEVELOPMENT"}\n`;
  report += `Total Issues: ${health.issues.length}\n`;
  report += ` Total Warnings: ${health.warnings.length}\n\n`;

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
      report += `${index + 1}.  ${warning}\n`;
    });
    report += "\n";
  }

  if (health.healthy && health.warnings.length === 0) {
    report += "All configuration checks passed!\n";
  }

  report += "=== END HEALTH REPORT ===\n\n";

  return report;
}
