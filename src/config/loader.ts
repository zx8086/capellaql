/* src/config/loader.ts */
// Pillar 3: Configuration Loader
// Per 4-pillar pattern: Walks mapping, merges, validates once, freezes

import { defaultConfig } from "./defaults";
import { type EnvVarType, envVarMapping, getEnvVarForPath } from "./envMapping";
import { deriveOtlpEndpoint, generateConfigHealthReport, toBool, validateConfigHealth } from "./helpers";
import type { Config } from "./schemas";
import { ConfigSchema, ConfigurationError } from "./schemas";

// Per 4-pillar pattern: Simple type conversion, validation happens once on merged config.
function coerceValue(
  raw: string | undefined,
  type: EnvVarType,
  envVarName: string
): string | number | boolean | string[] | undefined {
  if (raw === undefined || raw === "") return undefined;

  // Clean up quoted values and whitespace
  const cleaned = raw.replace(/^['"]|['"]$/g, "").trim();
  if (cleaned === "") return undefined;

  switch (type) {
    case "number": {
      const parsed = Number(cleaned);
      if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
        throw new Error(`Cannot convert "${raw}" to number for ${envVarName}`);
      }
      return parsed;
    }
    case "boolean":
      return toBool(cleaned); // Uses strict toBool that throws on unrecognized
    case "array":
      return cleaned
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter(Boolean);
    case "string":
      return cleaned;
  }
}

// Bun-first approach with Node.js fallback.
function getEnvVar(key: string): string | undefined {
  if (typeof Bun !== "undefined") {
    const value = Bun.env[key];
    if (value !== undefined && value !== null && value !== "") {
      return String(value);
    }
  }

  try {
    const value = process.env[key];
    if (value !== undefined && value !== null && value !== "") {
      return String(value);
    }
  } catch {
    // Silent fallback in case process is not available
  }

  return undefined;
}

// Config is immutable after validation.
function deepFreeze<T extends object>(obj: T): Readonly<T> {
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return Object.freeze(obj);
}

// The env mapping drives the loader.
function readEnvValues(env: (key: string) => string | undefined): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};

  for (const [section, fields] of Object.entries(envVarMapping)) {
    const sectionValues: Record<string, unknown> = {};
    let hasValues = false;

    for (const [key, entry] of Object.entries(fields)) {
      const raw = env(entry.envVar);
      try {
        const coerced = coerceValue(raw, entry.type, entry.envVar);
        if (coerced !== undefined) {
          sectionValues[key] = coerced;
          hasValues = true;
        }
      } catch (error) {
        // Re-throw with context
        throw new Error(`Error parsing ${entry.envVar}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (hasValues) {
      result[section] = sectionValues;
    }
  }

  return result;
}

function deriveOtlpEndpoints(envValues: Record<string, Record<string, unknown>>): void {
  const telemetry = envValues.telemetry || {};

  // Get base OTLP endpoint for fallback derivation
  const baseOtlpEndpoint = telemetry.OTLP_ENDPOINT as string | undefined;

  // Derive specific endpoints if not explicitly set
  if (!telemetry.TRACES_ENDPOINT && baseOtlpEndpoint) {
    telemetry.TRACES_ENDPOINT = deriveOtlpEndpoint(baseOtlpEndpoint, undefined, "/v1/traces");
  }
  if (!telemetry.METRICS_ENDPOINT && baseOtlpEndpoint) {
    telemetry.METRICS_ENDPOINT = deriveOtlpEndpoint(baseOtlpEndpoint, undefined, "/v1/metrics");
  }
  if (!telemetry.LOGS_ENDPOINT && baseOtlpEndpoint) {
    telemetry.LOGS_ENDPOINT = deriveOtlpEndpoint(baseOtlpEndpoint, undefined, "/v1/logs");
  }

  // Remove the base endpoint key (not part of final config)
  delete telemetry.OTLP_ENDPOINT;

  if (Object.keys(telemetry).length > 0) {
    envValues.telemetry = telemetry;
  }
}

// defaults <- environment overrides
function mergeWithDefaults<T extends object>(defaults: T, env: Partial<T>): T {
  const result = { ...defaults };
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

class ModularConfigurationError extends ConfigurationError {
  override toDetailedString(): string {
    const issues = this.errors.issues
      ?.map((issue) => {
        const path = issue.path.join(".");
        const envVar = getEnvVarForPath(path);
        return `  - ${path}: ${issue.message}${envVar ? ` (env: ${envVar})` : ""}`;
      })
      .join("\n");

    return `${this.message}\n${issues || ""}`;
  }
}

export function initializeConfig(): Readonly<Config> {
  const envValues = readEnvValues(getEnvVar);
  deriveOtlpEndpoints(envValues);

  // Merge: defaults <- environment overrides
  const sections = Object.keys(defaultConfig) as (keyof Config)[];
  const merged = {} as Record<string, unknown>;

  for (const section of sections) {
    merged[section] = mergeWithDefaults(
      defaultConfig[section],
      (envValues[section] || {}) as Partial<(typeof defaultConfig)[typeof section]>
    );
  }

  const result = ConfigSchema.safeParse(merged);

  if (!result.success) {
    const configError = new ModularConfigurationError("Configuration validation failed", result.error, merged);

    // Enhanced error reporting
    process.stderr.write(`\n=== CONFIGURATION VALIDATION FAILED ===\n`);
    process.stderr.write(`${configError.toDetailedString()}\n`);

    // Check for critical security issues
    const criticalIssues = result.error.issues.filter(
      (issue) => issue.message.includes("CRITICAL") || issue.path.includes("COUCHBASE_PASSWORD")
    );

    if (criticalIssues.length > 0) {
      process.stderr.write("\n=== CRITICAL SECURITY ISSUES DETECTED ===\n");
      for (const issue of criticalIssues) {
        process.stderr.write(`${issue.message}\n`);
      }
      process.stderr.write("=== DEPLOYMENT BLOCKED - FIX THESE ISSUES ===\n\n");
    }

    process.stderr.write("\nHelp: Check .env.example for required variables and correct formats.\n\n");

    throw configError;
  }

  const validatedConfig = result.data;

  // After schema validation passes, run additional health checks.
  // Critical issues block startup; warnings are logged but allowed.
  const health = validateConfigHealth(validatedConfig);

  if (!health.healthy) {
    const report = generateConfigHealthReport(validatedConfig);
    process.stderr.write(report);

    // Create a synthetic Zod error for the health issues
    const healthError = new ModularConfigurationError(
      "Configuration health check failed - critical issues detected",
      {
        issues: health.issues.map((issue, index) => ({
          code: "custom" as const,
          path: ["health", `issue_${index}`],
          message: issue,
        })),
      } as import("zod").ZodError,
      validatedConfig
    );

    throw healthError;
  }

  // Log warnings but continue
  if (health.warnings.length > 0) {
    process.stderr.write("\n=== CONFIGURATION WARNINGS ===\n");
    for (const warning of health.warnings) {
      process.stderr.write(`  ⚠️  ${warning}\n`);
    }
    process.stderr.write("=== STARTUP WILL CONTINUE ===\n\n");
  }

  // Only log verbose config when LOG_LEVEL is debug
  const isDebugLevel = validatedConfig.application.LOG_LEVEL === "debug";
  const isProduction =
    validatedConfig.runtime.NODE_ENV === "production" ||
    validatedConfig.telemetry.DEPLOYMENT_ENVIRONMENT === "production";

  if (isDebugLevel) {
    process.stderr.write("\n=== CONFIGURATION LOADED SUCCESSFULLY ===\n");
    process.stderr.write(
      isProduction
        ? "Production mode: All security validations passed\n"
        : "Development mode: Using development defaults where applicable\n"
    );
    process.stderr.write("4-pillar configuration pattern active\n");
    process.stderr.write(`Configuration domains: ${sections.join(", ")}\n`);
    process.stderr.write(`Telemetry: ${validatedConfig.telemetry.ENABLE_OPENTELEMETRY ? "ENABLED" : "DISABLED"}\n`);
    process.stderr.write(`Runtime: ${typeof Bun !== "undefined" ? `Bun ${Bun.version}` : "Node.js"}\n`);
    process.stderr.write("=== CONFIGURATION INITIALIZATION COMPLETE ===\n\n");
  }

  // Prevents runtime mutation
  return deepFreeze(validatedConfig);
}
