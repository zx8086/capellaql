// src/config/config.ts

import { initializeConfig } from "./loader";
import type {
  ApplicationConfig,
  CapellaConfig,
  Config,
  DeploymentConfig,
  RuntimeConfig,
  TelemetryConfig,
} from "./schemas";

let cachedConfig: Readonly<Config> | null = null;

// Config is only loaded on first access (lazy init).
// Use this over the config proxy when you need spreading/Object.keys.
export function getConfig(): Readonly<Config> {
  if (!cachedConfig) {
    cachedConfig = initializeConfig();
  }
  return cachedConfig;
}

// For testing purposes.
export function resetConfigCache(): void {
  cachedConfig = null;
}

export function loadConfig(): Readonly<Config> {
  return getConfig();
}

// LIMITATION: This proxy only intercepts top-level property access.
// Object.keys(config), { ...config }, and JSON.stringify(config) will NOT
// work as expected. Use getConfig() for those cases.
export const config = new Proxy({} as Readonly<Config>, {
  get(_target, prop) {
    return getConfig()[prop as keyof Config];
  },
});

export const getApplicationConfig = (): Readonly<ApplicationConfig> => getConfig().application;
export const getCapellaConfig = (): Readonly<CapellaConfig> => getConfig().capella;
export const getRuntimeConfig = (): Readonly<RuntimeConfig> => getConfig().runtime;
export const getDeploymentConfig = (): Readonly<DeploymentConfig> => getConfig().deployment;
export const getTelemetryConfig = (): Readonly<TelemetryConfig> => getConfig().telemetry;

export const applicationConfig = new Proxy({} as Readonly<ApplicationConfig>, {
  get(_target, prop) {
    return getConfig().application[prop as keyof ApplicationConfig];
  },
});

export const telemetryConfig = new Proxy({} as Readonly<TelemetryConfig>, {
  get(_target, prop) {
    return getConfig().telemetry[prop as keyof TelemetryConfig];
  },
});

export const capellaConfig = new Proxy({} as Readonly<CapellaConfig>, {
  get(_target, prop) {
    return getConfig().capella[prop as keyof CapellaConfig];
  },
});

export function loadTelemetryConfigFromEnv(): Readonly<TelemetryConfig> {
  return getConfig().telemetry;
}

export function isProduction(): boolean {
  const cfg = getConfig();
  return cfg.runtime.NODE_ENV === "production" || cfg.telemetry.DEPLOYMENT_ENVIRONMENT === "production";
}

export function getEnvironment(): string {
  return getConfig().runtime.NODE_ENV;
}

export function getDeploymentEnvironment(): string {
  return getConfig().telemetry.DEPLOYMENT_ENVIRONMENT;
}

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
