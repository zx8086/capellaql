// Unified configuration system - modular architecture with backward compatibility
import { z } from "zod";
import type { Config } from "./base";
import { ConfigurationError } from "./base";

// Import domain modules
import { 
  ApplicationConfigSchema, 
  loadApplicationConfigFromEnv, 
  applicationDefaults,
  validateApplicationConfig,
  getApplicationEnvVarPath
} from "./modules/application";
import { 
  CouchbaseConfigSchema, 
  loadCouchbaseConfigFromEnv, 
  couchbaseDefaults,
  validateCouchbaseConfig,
  getCouchbaseEnvVarPath
} from "./modules/couchbase";
import { 
  TelemetryConfigSchema, 
  loadTelemetryConfigFromEnv, 
  telemetryDefaults,
  validateTelemetryConfig,
  getTelemetryEnvVarPath
} from "./modules/telemetry";
import { 
  RuntimeConfigSchema, 
  loadRuntimeConfigFromEnv, 
  runtimeDefaults,
  validateRuntimeConfig,
  getRuntimeEnvVarPath
} from "./modules/runtime";
import { 
  DeploymentConfigSchema, 
  loadDeploymentConfigFromEnv, 
  deploymentDefaults,
  validateDeploymentConfig,
  getDeploymentEnvVarPath
} from "./modules/deployment";

// Import validators and utilities
import { validateCrossConfiguration, validateConfigHealth, generateConfigHealthReport } from "./validators";
import { sanitizeConfigForLogging } from "./utils/sanitizer";

// Unified configuration schema - composed from domain modules
const ConfigSchema = z
  .object({
    application: ApplicationConfigSchema,
    capella: CouchbaseConfigSchema,
    runtime: RuntimeConfigSchema,
    deployment: DeploymentConfigSchema,
    telemetry: TelemetryConfigSchema,
  })
  .superRefine((data, ctx) => {
    // Determine environment for validation
    const isProduction =
      data.runtime.NODE_ENV === "production" || data.telemetry.DEPLOYMENT_ENVIRONMENT === "production";

    // CRITICAL SECURITY VALIDATIONS (Production)
    if (isProduction) {
      // Critical security check for default passwords
      if (data.capella.COUCHBASE_PASSWORD === "password") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CRITICAL SECURITY: Default password not allowed in production - this is a security vulnerability",
          path: ["capella", "COUCHBASE_PASSWORD"],
        });
      }

      // Check for default usernames in production
      if (data.capella.COUCHBASE_USERNAME === "Administrator") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "WARNING: Using default Administrator username in production is not recommended",
          path: ["capella", "COUCHBASE_USERNAME"],
        });
      }

      // Validate CORS origins in production
      if (data.application.ALLOWED_ORIGINS.some((origin) => origin === "*" || origin.includes("localhost"))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Production CORS origins should not include localhost or wildcards",
          path: ["application", "ALLOWED_ORIGINS"],
        });
      }
    }
  });

// Comprehensive default configuration for all sections
const defaultConfig: Config = {
  application: applicationDefaults,
  capella: couchbaseDefaults,
  runtime: runtimeDefaults,
  deployment: deploymentDefaults,
  telemetry: telemetryDefaults,
};

// Enhanced error handling with environment variable mapping
class ModularConfigurationError extends ConfigurationError {
  private getEnvVarName(path: string): string | undefined {
    // Use domain-specific mappings
    return (
      getApplicationEnvVarPath(path) ||
      getCouchbaseEnvVarPath(path) ||
      getTelemetryEnvVarPath(path) ||
      getRuntimeEnvVarPath(path) ||
      getDeploymentEnvVarPath(path)
    );
  }

  toDetailedString(): string {
    const issues = this.errors.issues
      ?.map((issue: any) => {
        const path = issue.path.join(".");
        const envVar = this.getEnvVarName(path);
        return `  - ${path}: ${issue.message}${envVar ? ` (env: ${envVar})` : ""}`;
      })
      .join("\n");

    return `${this.message}\n${issues || ""}`;
  }
}

// Load configuration from environment using domain modules
function loadConfigFromEnv(): Partial<Config> {
  return {
    application: loadApplicationConfigFromEnv(),
    capella: loadCouchbaseConfigFromEnv(),
    runtime: loadRuntimeConfigFromEnv(),
    deployment: loadDeploymentConfigFromEnv(),
    telemetry: loadTelemetryConfigFromEnv(),
  };
}

/**
 * Initialize and validate configuration
 */
let config: Config;

try {
  // Load from environment using modular approach
  const envConfig = loadConfigFromEnv();

  // Deep merge all configuration sections (environment takes precedence)
  const mergedConfig = {
    application: { ...defaultConfig.application, ...envConfig.application },
    capella: { ...defaultConfig.capella, ...envConfig.capella },
    runtime: { ...defaultConfig.runtime, ...envConfig.runtime },
    deployment: { ...defaultConfig.deployment, ...envConfig.deployment },
    telemetry: { ...defaultConfig.telemetry, ...envConfig.telemetry },
  };

  // Validate with unified schema
  const result = ConfigSchema.safeParse(mergedConfig);

  if (!result.success) {
    const configError = new ModularConfigurationError(
      "Modular configuration validation failed", 
      result.error, 
      mergedConfig
    );

    // Enhanced error reporting
    process.stderr.write(`\n=== MODULAR CONFIGURATION VALIDATION FAILED ===\n`);
    process.stderr.write(`${configError.toDetailedString()}\n`);

    // Check for critical issues
    const criticalIssues = result.error.issues.filter(
      (issue) => issue.message.includes("CRITICAL") || issue.path.includes("COUCHBASE_PASSWORD")
    );

    if (criticalIssues.length > 0) {
      process.stderr.write("\n=== CRITICAL SECURITY ISSUES DETECTED ===\n");
      criticalIssues.forEach((issue) => {
        process.stderr.write(`❌ ${issue.message}\n`);
      });
      process.stderr.write("=== DEPLOYMENT BLOCKED - FIX THESE ISSUES ===\n\n");
    }

    throw configError;
  }

  config = result.data;

  // Perform domain-specific validations
  const isProduction = 
    config.runtime.NODE_ENV === "production" || 
    config.telemetry.DEPLOYMENT_ENVIRONMENT === "production";

  const allWarnings: string[] = [
    ...validateApplicationConfig(config.application, isProduction),
    ...validateCouchbaseConfig(config.capella, isProduction),
    ...validateTelemetryConfig(config.telemetry, isProduction),
    ...validateRuntimeConfig(config.runtime, isProduction),
    ...validateDeploymentConfig(config.deployment, isProduction),
    ...validateCrossConfiguration(config),
  ];

  // Perform comprehensive health check
  const healthCheck = validateConfigHealth(config);
  if (!healthCheck.healthy || healthCheck.warnings.length > 0) {
    // Generate and log full health report
    const healthReport = generateConfigHealthReport(config);
    process.stderr.write(healthReport);

    // Fail fast if there are critical health issues
    if (!healthCheck.healthy) {
      process.stderr.write("\n=== CRITICAL CONFIGURATION ISSUES DETECTED ===\n");
      process.stderr.write("Cannot proceed with invalid configuration.\n");
      process.stderr.write("=== STARTUP BLOCKED ===\n\n");
      throw new Error("Configuration health check failed - see issues above");
    }
  }

  // Log successful configuration load (with sensitive data redacted)
  const sanitizedConfig = sanitizeConfigForLogging(config);
  process.stderr.write("\n=== MODULAR CONFIGURATION LOADED SUCCESSFULLY ===\n");
  process.stderr.write(`${JSON.stringify(sanitizedConfig, null, 2)}\n`);

  // Environment-specific logging
  if (isProduction) {
    process.stderr.write("🔒 Production mode: All security validations passed\n");
  } else {
    process.stderr.write("🔧 Development mode: Using development defaults where applicable\n");
  }

  // Log modular configuration success
  process.stderr.write("📋 Modular configuration system active - Domain-separated validation\n");
  process.stderr.write(`📊 Configuration domains loaded: application, capella, runtime, deployment, telemetry\n`);
  process.stderr.write(
    `🚀 Telemetry configuration: ${config.telemetry.ENABLE_OPENTELEMETRY ? "ENABLED" : "DISABLED"}\n`
  );

  // Log runtime detection
  process.stderr.write(`⚡ Runtime: ${typeof Bun !== "undefined" ? `Bun ${Bun.version}` : "Node.js"}\n`);
  process.stderr.write("=== MODULAR CONFIGURATION INITIALIZATION COMPLETE ===\n\n");
} catch (error) {
  if (error instanceof ModularConfigurationError) {
    // Already handled above with detailed error reporting
    process.exit(1);
  } else {
    process.stderr.write(
      `❌ Unexpected modular configuration error: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.stderr.write("\n=== MODULAR CONFIGURATION SYSTEM FAILURE ===\n");
    process.stderr.write("The modular configuration system encountered a critical error.\n");
    process.stderr.write(
      "This may indicate:\n - Invalid environment variable values\n - Missing required configuration\n - Domain module loading issues\n"
    );
    process.stderr.write("=== STARTUP BLOCKED ===\n\n");
    throw new Error(`Modular configuration system failure: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Export the comprehensive validated configuration (BACKWARD COMPATIBLE)
export { config, generateConfigHealthReport, validateConfigHealth as validateConfig };
export type { Config };
export { ConfigSchema };
export default config;

/**
 * BACKWARD COMPATIBILITY EXPORTS
 *
 * These exports maintain API compatibility for existing code that expects
 * telemetry configuration to be separate. This allows gradual migration
 * to the unified configuration system.
 */

// Export telemetry config section for backward compatibility
export const telemetryConfig = config.telemetry;

// Export individual sections for modular access
export const applicationConfig = config.application;
export const capellaConfig = config.capella;
export const runtimeConfig = config.runtime;
export const deploymentConfig = config.deployment;

/**
 * UTILITY FUNCTIONS (BACKWARD COMPATIBLE)
 */

// Get configuration by section
export function getConfigSection<T extends keyof Config>(section: T): Config[T] {
  return config[section];
}

// Check if running in production
export function isProduction(): boolean {
  return config.runtime.NODE_ENV === "production" || config.telemetry.DEPLOYMENT_ENVIRONMENT === "production";
}

// Get environment name
export function getEnvironment(): string {
  return config.runtime.NODE_ENV;
}

// Get deployment environment (for telemetry)
export function getDeploymentEnvironment(): string {
  return config.telemetry.DEPLOYMENT_ENVIRONMENT;
}

// Utility function for external modules to reload config (useful for testing)
export function reloadConfig(): Config {
  // This would require refactoring the config loading into a function
  // For now, we'll export the current config
  console.warn("reloadConfig() is not yet implemented - returning current config");
  return config;
}

/**
 * MIGRATION HELPERS (BACKWARD COMPATIBLE)
 *
 * These functions help migrate from fragmented configuration approach
 * to the unified system while maintaining backward compatibility.
 */

// Helper for legacy telemetry config access
export function loadTelemetryConfigFromEnv() {
  console.warn("loadTelemetryConfigFromEnv() is deprecated - use unified config.telemetry instead");
  return config.telemetry;
}

/**
 * MODULAR CONFIGURATION EXPORTS
 * 
 * Export domain modules for advanced usage and testing
 */
export { 
  loadApplicationConfigFromEnv,
  loadCouchbaseConfigFromEnv, 
  loadTelemetryConfigFromEnv,
  loadRuntimeConfigFromEnv,
  loadDeploymentConfigFromEnv 
};

export { sanitizeConfigForLogging };
export { validateCrossConfiguration };