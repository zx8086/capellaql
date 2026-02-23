/* src/config/index.ts */
// 4-Pillar Configuration Pattern - Public API
// Keep exports explicit. Internal implementation details stay internal.

// =============================================================================
// CORE EXPORTS (per 4-pillar pattern)
// =============================================================================

// Config access
export {
  applicationConfig,
  capellaConfig,
  config,
  configMetadata,
  getApplicationConfig,
  getCapellaConfig,
  getConfig,
  getDeploymentConfig,
  getDeploymentEnvironment,
  getEnvironment,
  getRuntimeConfig,
  getTelemetryConfig,
  isProduction,
  loadConfig,
  loadTelemetryConfigFromEnv,
  resetConfigCache,
  telemetryConfig,
} from "./config";
// Defaults (for reference/testing)
export { defaultConfig } from "./defaults";
export type { EnvVarEntry, EnvVarMapping, EnvVarType } from "./envMapping";
// Env mapping (for documentation/tooling)
export { envVarMapping, getEnvVarForPath, getEnvVarPath } from "./envMapping";
// Helpers
export {
  describeConfig,
  generateConfigHealthReport,
  sanitizeConfigForLogging,
  toBool,
  validateConfigHealth,
  validateCrossConfiguration,
} from "./helpers";
// Loader (for advanced usage)
export { initializeConfig } from "./loader";
export type {
  ApplicationConfig,
  CapellaConfig,
  Config,
  DeploymentConfig,
  RuntimeConfig,
  TelemetryConfig,
} from "./schemas";
// Schemas and types
export {
  ApplicationConfigSchema,
  CapellaConfigSchema,
  ConfigSchema,
  ConfigurationError,
  DeploymentConfigSchema,
  RuntimeConfigSchema,
  SchemaRegistry,
  TelemetryConfigSchema,
} from "./schemas";

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

import { config } from "./config";
export default config;
