/* src/config/index.ts */
// 4-Pillar Configuration Pattern - Public API
// Keep exports explicit. Internal implementation details stay internal.

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
export { defaultConfig } from "./defaults";
export type { EnvVarEntry, EnvVarMapping, EnvVarType } from "./envMapping";
export { envVarMapping, getEnvVarForPath, getEnvVarPath } from "./envMapping";
export {
  describeConfig,
  generateConfigHealthReport,
  sanitizeConfigForLogging,
  toBool,
  validateConfigHealth,
  validateCrossConfiguration,
} from "./helpers";
export { initializeConfig } from "./loader";
export type {
  ApplicationConfig,
  CapellaConfig,
  Config,
  DeploymentConfig,
  RuntimeConfig,
  TelemetryConfig,
} from "./schemas";
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

import { config } from "./config";
export default config;
