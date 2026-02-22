/* src/config/config.ts */
// Main configuration module with getters and proxies
// Aligned with migrate reference pattern

import { defaultConfig } from "./defaults";
import { envVarMapping } from "./envMapping";
import { sanitizeConfigForLogging, validateConfigHealth } from "./helpers";
import {
  initializeConfig,
  loadApplicationConfigFromEnv,
  loadCapellaConfigFromEnv,
  loadDeploymentConfigFromEnv,
  loadRuntimeConfigFromEnv,
  loadTelemetryConfigFromEnv,
} from "./loader";
import type { ApplicationConfig, CapellaConfig, Config, DeploymentConfig, RuntimeConfig, TelemetryConfig } from "./schemas";
import { ConfigSchema, SchemaRegistry } from "./schemas";

// =============================================================================
// 4-PILLAR LAZY INITIALIZATION PATTERN (per migrate reference)
// =============================================================================

// Cache for validated configuration
let cachedConfig: Config | null = null;

// Proxy for lazy configuration access
let _configProxy: Config | null = null;

/**
 * Get configuration with lazy initialization and caching
 * Following the 4-pillar pattern from migrate reference
 */
function getConfig(): Config {
  if (!cachedConfig) {
    cachedConfig = initializeConfig();
  }
  return cachedConfig;
}

/**
 * Reset configuration cache (for testing purposes)
 * Allows tests to re-initialize configuration with different env vars
 */
export function resetConfigCache(): void {
  cachedConfig = null;
  _configProxy = null;
}

/**
 * Load configuration - primary entry point (4-pillar pattern)
 * Returns cached configuration or initializes if first call
 */
export function loadConfig(): Config {
  return getConfig();
}

/**
 * Configuration object with Proxy for lazy initialization
 * Allows importing `config` without triggering immediate initialization
 */
export const config = new Proxy({} as Config, {
  get(_target, prop) {
    if (!_configProxy) {
      _configProxy = getConfig();
    }
    return _configProxy[prop as keyof Config];
  },
});

// =============================================================================
// DOMAIN-SPECIFIC GETTERS (per migrate pattern)
// =============================================================================

export const getApplicationConfig = (): ApplicationConfig => loadConfig().application;
export const getCapellaConfig = (): CapellaConfig => loadConfig().capella;
export const getRuntimeConfig = (): RuntimeConfig => loadConfig().runtime;
export const getDeploymentConfig = (): DeploymentConfig => loadConfig().deployment;
export const getTelemetryConfig = (): TelemetryConfig => loadConfig().telemetry;

// =============================================================================
// BACKWARD COMPATIBLE SECTION EXPORTS (Proxy-based)
// =============================================================================

// Export individual sections with Proxy for lazy access
export const applicationConfig = new Proxy({} as ApplicationConfig, {
  get(_target, prop) {
    return loadConfig().application[prop as keyof ApplicationConfig];
  },
});

export const capellaConfig = new Proxy({} as CapellaConfig, {
  get(_target, prop) {
    return loadConfig().capella[prop as keyof CapellaConfig];
  },
});

export const runtimeConfig = new Proxy({} as RuntimeConfig, {
  get(_target, prop) {
    return loadConfig().runtime[prop as keyof RuntimeConfig];
  },
});

export const deploymentConfig = new Proxy({} as DeploymentConfig, {
  get(_target, prop) {
    return loadConfig().deployment[prop as keyof DeploymentConfig];
  },
});

export const telemetryConfig = new Proxy({} as TelemetryConfig, {
  get(_target, prop) {
    return loadConfig().telemetry[prop as keyof TelemetryConfig];
  },
});

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get configuration by section
 */
export function getConfigSection<T extends keyof Config>(section: T): Config[T] {
  return loadConfig()[section];
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  const cfg = loadConfig();
  return cfg.runtime.NODE_ENV === "production" || cfg.telemetry.DEPLOYMENT_ENVIRONMENT === "production";
}

/**
 * Get environment name
 */
export function getEnvironment(): string {
  return loadConfig().runtime.NODE_ENV;
}

/**
 * Get deployment environment (for telemetry)
 */
export function getDeploymentEnvironment(): string {
  return loadConfig().telemetry.DEPLOYMENT_ENVIRONMENT;
}

// =============================================================================
// CONFIGURATION HEALTH VALIDATION (per migrate pattern)
// =============================================================================

export function validateConfigurationHealth(): {
  status: "healthy" | "degraded" | "critical";
  issues: {
    path: string;
    message: string;
    severity: "critical" | "warning" | "info";
  }[];
  recommendations: string[];
} {
  const cfg = loadConfig();
  const health = {
    status: "healthy" as "healthy" | "degraded" | "critical",
    issues: [] as {
      path: string;
      message: string;
      severity: "critical" | "warning" | "info";
    }[],
    recommendations: [] as string[],
  };

  // Runtime-specific health checks
  if (cfg.telemetry.BATCH_SIZE > 3000) {
    health.recommendations.push("Consider reducing telemetry batch size for better memory usage");
  }

  if (cfg.telemetry.EXPORT_TIMEOUT_MS > 45000) {
    health.recommendations.push("Export timeout is very high, consider reducing for better responsiveness");
  }

  if (cfg.telemetry.MAX_QUEUE_SIZE > 30000) {
    health.recommendations.push("Large telemetry queue size may impact memory usage");
  }

  // Deployment environment checks
  if (cfg.telemetry.DEPLOYMENT_ENVIRONMENT === "production" && !cfg.telemetry.ENABLE_OPENTELEMETRY) {
    health.issues.push({
      path: "telemetry.ENABLE_OPENTELEMETRY",
      message: "OpenTelemetry disabled in production may impact observability",
      severity: "warning",
    });
    if (health.status === "healthy") health.status = "degraded";
  }

  return health;
}

// =============================================================================
// CONFIGURATION METADATA (per migrate pattern)
// =============================================================================

export const configMetadata = {
  version: "4.0.0",
  get loadedAt() {
    return new Date().toISOString();
  },
  get environment() {
    return loadConfig().telemetry.DEPLOYMENT_ENVIRONMENT;
  },
  get serviceName() {
    return loadConfig().telemetry.SERVICE_NAME;
  },
  get serviceVersion() {
    return loadConfig().telemetry.SERVICE_VERSION;
  },
  pattern: "4-pillar",
  zodVersion: "v4",
  optimizations: [
    "type-only-imports",
    "schema-memoization",
    "enhanced-errors",
    "modular-architecture",
    "lazy-initialization",
    "proxy-pattern",
  ],
  performance: {
    cacheEnabled: true,
    lazyInitialization: true,
    proxyPattern: true,
  },
  pillars: {
    defaults: "./defaults.ts",
    envMapping: "./envMapping.ts",
    validation: "./schemas.ts",
    loader: "./loader.ts",
  },
  get envVarMapping() {
    return envVarMapping;
  },
  get defaultConfig() {
    return defaultConfig;
  },
};

// =============================================================================
// SCHEMA UTILITIES
// =============================================================================

export const getConfigJSONSchema = () => SchemaRegistry.Config;
export const validateConfiguration = (data: unknown) => {
  const result = ConfigSchema.safeParse(data);
  if (!result.success) {
    throw new Error(JSON.stringify(result.error.issues, null, 2));
  }
  return result.data;
};

// =============================================================================
// RE-EXPORTS
// =============================================================================

// Re-export 4-pillar components for advanced usage
export { defaultConfig } from "./defaults";
export { envVarMapping } from "./envMapping";
export { sanitizeConfigForLogging, validateCrossConfiguration } from "./helpers";
export {
  initializeConfig,
  loadApplicationConfigFromEnv,
  loadCapellaConfigFromEnv,
  loadDeploymentConfigFromEnv,
  loadRuntimeConfigFromEnv,
  // Note: loadTelemetryConfigFromEnv has deprecated wrapper below
} from "./loader";
export { ConfigSchema, SchemaRegistry } from "./schemas";

// Re-export types
export type { ApplicationConfig, CapellaConfig, Config, DeploymentConfig, RuntimeConfig, TelemetryConfig } from "./schemas";

// Alias for backward compatibility
export { validateConfigHealth as validateConfig } from "./helpers";
export { validateConfigHealth as generateConfigHealthReport } from "./helpers";

// Backward compatible alias: loadCouchbaseConfigFromEnv -> loadCapellaConfigFromEnv
export { loadCapellaConfigFromEnv as loadCouchbaseConfigFromEnv } from "./loader";

// Deprecated - use loadConfig().telemetry instead
export function loadTelemetryConfigFromEnv() {
  console.warn("loadTelemetryConfigFromEnv() is deprecated - use loadConfig().telemetry instead");
  return loadConfig().telemetry;
}
