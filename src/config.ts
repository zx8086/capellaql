// src/config.ts
// Re-export from modular configuration system (4-pillar pattern)
// This file provides backward compatibility for $config path alias

export {
  // Core exports
  config,
  loadConfig,
  resetConfigCache,
  ConfigSchema,

  // Domain config getters
  getApplicationConfig,
  getCapellaConfig,
  getRuntimeConfig,
  getDeploymentConfig,
  getTelemetryConfig,

  // Backward compatible section exports (Proxy-based)
  telemetryConfig,
  applicationConfig,
  capellaConfig,
  runtimeConfig,
  deploymentConfig,

  // Utility functions
  getConfigSection,
  isProduction,
  getEnvironment,
  getDeploymentEnvironment,

  // Health validation
  validateConfig,
  generateConfigHealthReport,
  validateConfigurationHealth,

  // Config metadata
  configMetadata,

  // Deprecated exports (for migration)
  loadTelemetryConfigFromEnv,
  loadApplicationConfigFromEnv,
  loadCouchbaseConfigFromEnv,
  loadRuntimeConfigFromEnv,
  loadDeploymentConfigFromEnv,

  // Utilities
  sanitizeConfigForLogging,
  validateCrossConfiguration,
} from "./config/index";

// Re-export types
export type { Config } from "./config/index";

// Import config for default export
import { config as _config } from "./config/index";
export default _config;
