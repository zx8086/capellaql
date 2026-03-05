/* src/config/config.ts */

import { defaultConfig } from "./defaults";
import { envVarMapping } from "./envMapping";
import { initializeConfig } from "./loader";
import type {
  ApiInfoConfig,
  AppConfig,
  CachingConfig,
  JwtConfig,
  KongConfig,
  ProfilingConfig,
  ServerConfig,
  TelemetryConfig,
} from "./schemas";
import { SchemaRegistry } from "./schemas";

// Performance optimization caches
let _validationCache = new WeakMap<object, AppConfig>();
let cachedConfig: AppConfig | null = null;

function getConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = initializeConfig();
  }
  return cachedConfig;
}

// Reset cache for testing purposes
export function resetConfigCache(): void {
  cachedConfig = null;
  _config = null;
  _validationCache = new WeakMap();
}

// Export config - lazy initialization to support testing
let _config: AppConfig | null = null;
export const config = new Proxy({} as AppConfig, {
  get(_target, prop) {
    if (!_config) {
      _config = getConfig();
    }
    return _config[prop as keyof AppConfig];
  },
});

// Runtime Configuration Health Validation
export function validateConfigurationHealth(): {
  status: "healthy" | "degraded" | "critical";
  issues: {
    path: string;
    message: string;
    severity: "critical" | "warning" | "info";
  }[];
  recommendations: string[];
} {
  const health = {
    status: "healthy" as "healthy" | "degraded" | "critical",
    issues: [] as {
      path: string;
      message: string;
      severity: "critical" | "warning" | "info";
    }[],
    recommendations: [] as string[],
  };

  // Runtime-specific health checks (not covered by schema validation)
  if (config.telemetry.batchSize > 3000) {
    health.recommendations.push("Consider reducing telemetry batch size for better memory usage");
  }

  if (config.telemetry.exportTimeout > 45000) {
    health.recommendations.push(
      "Export timeout is very high, consider reducing for better responsiveness"
    );
  }

  // Performance recommendations
  if (config.telemetry.maxQueueSize > 30000) {
    health.recommendations.push("Large telemetry queue size may impact memory usage");
  }

  // Deployment environment checks
  if (config.telemetry.environment === "production" && config.telemetry.mode === "console") {
    health.issues.push({
      path: "telemetry.mode",
      message: "Console-only telemetry mode in production may impact observability",
      severity: "warning",
    });
    if (health.status === "healthy") health.status = "degraded";
  }

  return health;
}

export function loadConfig(): AppConfig {
  return getConfig();
}

export { SchemaRegistry };
export type {
  AppConfig,
  ServerConfig,
  JwtConfig,
  KongConfig,
  CachingConfig,
  TelemetryConfig,
  ProfilingConfig,
  ApiInfoConfig,
};

// Getter functions for component configurations
export const getServerConfig = () => getConfig().server;
export const getJwtConfig = () => getConfig().jwt;
export const getKongConfig = () => getConfig().kong;
export const getCachingConfig = () => getConfig().caching;
export const getTelemetryConfig = () => getConfig().telemetry;
export const getProfilingConfig = () => getConfig().profiling;
export const getApiInfoConfig = () => getConfig().apiInfo;

// Legacy exports (use getter functions in new code) - Now lazy for testing compatibility
export const serverConfig = new Proxy({} as ServerConfig, {
  get(_target, prop) {
    return getConfig().server[prop as keyof ServerConfig];
  },
});
export const jwtConfig = new Proxy({} as JwtConfig, {
  get(_target, prop) {
    return getConfig().jwt[prop as keyof JwtConfig];
  },
});
export const kongConfig = new Proxy({} as KongConfig, {
  get(_target, prop) {
    return getConfig().kong[prop as keyof KongConfig];
  },
});
export const telemetryConfig = new Proxy({} as TelemetryConfig, {
  get(_target, prop) {
    return getConfig().telemetry[prop as keyof TelemetryConfig];
  },
});
export const cachingConfig = new Proxy({} as CachingConfig, {
  get(_target, prop) {
    return getConfig().caching[prop as keyof CachingConfig];
  },
});
export const profilingConfig = new Proxy({} as ProfilingConfig, {
  get(_target, prop) {
    return getConfig().profiling[prop as keyof ProfilingConfig];
  },
});
export const apiInfoConfig = new Proxy({} as ApiInfoConfig, {
  get(_target, prop) {
    return getConfig().apiInfo[prop as keyof ApiInfoConfig];
  },
});

export const configMetadata = {
  version: "4.0.0",
  get loadedAt() {
    return new Date().toISOString();
  },
  get environment() {
    return getConfig().telemetry.environment;
  },
  get serviceName() {
    return getConfig().telemetry.serviceName;
  },
  get serviceVersion() {
    return getConfig().telemetry.serviceVersion;
  },
  pattern: "4-pillar",
  zodVersion: "v4",
  optimizations: [
    "type-only-imports",
    "schema-memoization",
    "enhanced-errors",
    "modular-architecture",
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

export const getConfigJSONSchema = () => SchemaRegistry.AppConfig;
export const validateConfiguration = (data: unknown) => {
  const result = SchemaRegistry.AppConfig.safeParse(data);
  if (!result.success) {
    throw new Error(JSON.stringify(result.error.issues, null, 2));
  }
  return result.data;
};

// Re-export 4-pillar components for advanced usage
export { defaultConfig } from "./defaults";
export { envVarMapping } from "./envMapping";
export { initializeConfig } from "./loader";
