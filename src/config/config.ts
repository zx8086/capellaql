/* src/config/config.ts */
// Main configuration module with getters and proxies
// Per 4-pillar pattern: Lazy initialization with caching

import { initializeConfig } from "./loader";
import type {
  ApplicationConfig,
  CapellaConfig,
  Config,
  DeploymentConfig,
  RuntimeConfig,
  TelemetryConfig,
} from "./schemas";

// =============================================================================
// LAZY INITIALIZATION CACHE (per 4-pillar pattern)
// =============================================================================

let cachedConfig: Readonly<Config> | null = null;

/**
 * Get the validated, frozen config. Initializes on first call.
 *
 * Per 4-pillar pattern: Config is only loaded when you first access it
 * (lazy initialization), and you can explicitly reset it in tests.
 *
 * Prefer this over the `config` proxy when you need standard object
 * behavior (spreading, Object.keys, etc.).
 */
export function getConfig(): Readonly<Config> {
  if (!cachedConfig) {
    cachedConfig = initializeConfig();
  }
  return cachedConfig;
}

/**
 * Reset configuration cache (for testing purposes).
 * Call in beforeEach to ensure test isolation.
 */
export function resetConfigCache(): void {
  cachedConfig = null;
}

/**
 * Load configuration - primary entry point (4-pillar pattern).
 * Alias for getConfig() for backward compatibility.
 */
export function loadConfig(): Readonly<Config> {
  return getConfig();
}

// =============================================================================
// CONVENIENCE PROXY (per 4-pillar pattern)
// =============================================================================

/**
 * Configuration object with Proxy for lazy initialization.
 * Provides `config.server.port` syntax.
 *
 * LIMITATION: This proxy only intercepts top-level property access.
 * Object.keys(config), { ...config }, and JSON.stringify(config) will NOT
 * work as expected. Use getConfig() for those cases.
 */
export const config = new Proxy({} as Readonly<Config>, {
  get(_target, prop) {
    return getConfig()[prop as keyof Config];
  },
});

// =============================================================================
// COMPONENT GETTERS (per 4-pillar pattern)
// =============================================================================

export const getApplicationConfig = (): Readonly<ApplicationConfig> => getConfig().application;
export const getCapellaConfig = (): Readonly<CapellaConfig> => getConfig().capella;
export const getRuntimeConfig = (): Readonly<RuntimeConfig> => getConfig().runtime;
export const getDeploymentConfig = (): Readonly<DeploymentConfig> => getConfig().deployment;
export const getTelemetryConfig = (): Readonly<TelemetryConfig> => getConfig().telemetry;

// =============================================================================
// BACKWARD COMPATIBLE SECTION PROXIES
// =============================================================================

/**
 * Application config proxy for backward compatibility.
 * Prefer getApplicationConfig() for new code.
 */
export const applicationConfig = new Proxy({} as Readonly<ApplicationConfig>, {
  get(_target, prop) {
    return getConfig().application[prop as keyof ApplicationConfig];
  },
});

/**
 * Telemetry config proxy for backward compatibility.
 * Prefer getTelemetryConfig() for new code.
 */
export const telemetryConfig = new Proxy({} as Readonly<TelemetryConfig>, {
  get(_target, prop) {
    return getConfig().telemetry[prop as keyof TelemetryConfig];
  },
});

/**
 * Capella config proxy for backward compatibility.
 * Prefer getCapellaConfig() for new code.
 */
export const capellaConfig = new Proxy({} as Readonly<CapellaConfig>, {
  get(_target, prop) {
    return getConfig().capella[prop as keyof CapellaConfig];
  },
});

/**
 * Deprecated - use getTelemetryConfig() instead.
 * Kept for backward compatibility with existing code.
 */
export function loadTelemetryConfigFromEnv(): Readonly<TelemetryConfig> {
  return getConfig().telemetry;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Check if running in production.
 */
export function isProduction(): boolean {
  const cfg = getConfig();
  return (
    cfg.runtime.NODE_ENV === "production" ||
    cfg.telemetry.DEPLOYMENT_ENVIRONMENT === "production"
  );
}

/**
 * Get environment name.
 */
export function getEnvironment(): string {
  return getConfig().runtime.NODE_ENV;
}

/**
 * Get deployment environment (for telemetry).
 */
export function getDeploymentEnvironment(): string {
  return getConfig().telemetry.DEPLOYMENT_ENVIRONMENT;
}

// =============================================================================
// CONFIGURATION METADATA (per 4-pillar pattern)
// =============================================================================

export const configMetadata = {
  version: "2.0.0",
  pattern: "4-pillar",
  get loadedAt() {
    return new Date().toISOString();
  },
  get environment() {
    return getConfig().runtime.NODE_ENV;
  },
  get serviceName() {
    return getConfig().telemetry.SERVICE_NAME;
  },
  get serviceVersion() {
    return getConfig().telemetry.SERVICE_VERSION;
  },
  features: [
    "mapping-driven-loader",
    "single-validation-boundary",
    "deep-freeze",
    "strict-boolean-coercion",
    "lazy-initialization",
    "proxy-pattern",
  ],
};
