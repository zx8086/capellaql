/* src/config.ts */

import { ConfigSchema, type Config } from "$models/types";

const envVarMapping = {
  application: {
    LOG_LEVEL: "LOG_LEVEL",
    LOG_MAX_SIZE: "LOG_MAX_SIZE",
    LOG_MAX_FILES: "LOG_MAX_FILES",
    YOGA_RESPONSE_CACHE_TTL: "YOGA_RESPONSE_CACHE_TTL",
    PORT: "PORT",
    ENABLE_FILE_LOGGING: "ENABLE_FILE_LOGGING",
    ALLOWED_ORIGINS: "ALLOWED_ORIGINS",
  },
  capella: {
    COUCHBASE_URL: "COUCHBASE_URL",
    COUCHBASE_USERNAME: "COUCHBASE_USERNAME",
    COUCHBASE_PASSWORD: "COUCHBASE_PASSWORD",
    COUCHBASE_BUCKET: "COUCHBASE_BUCKET",
    COUCHBASE_SCOPE: "COUCHBASE_SCOPE",
    COUCHBASE_COLLECTION: "COUCHBASE_COLLECTION",
  },
  openTelemetry: {
    ENABLE_OPENTELEMETRY: "ENABLE_OPENTELEMETRY",
    SERVICE_NAME: "SERVICE_NAME",
    SERVICE_VERSION: "SERVICE_VERSION",
    DEPLOYMENT_ENVIRONMENT: "DEPLOYMENT_ENVIRONMENT",
    TRACES_ENDPOINT: "TRACES_ENDPOINT",
    METRICS_ENDPOINT: "METRICS_ENDPOINT",
    LOGS_ENDPOINT: "LOGS_ENDPOINT",
    METRIC_READER_INTERVAL: "METRIC_READER_INTERVAL",
    SUMMARY_LOG_INTERVAL: "SUMMARY_LOG_INTERVAL",
  },
};

const defaultConfig: Config = {
  application: {
    LOG_LEVEL: "info",
    LOG_MAX_SIZE: "20m",
    LOG_MAX_FILES: "14d",
    YOGA_RESPONSE_CACHE_TTL: 900000,
    PORT: 4000,
    ENABLE_FILE_LOGGING: false,
    ALLOWED_ORIGINS: ["http://localhost:3000"],
  },
  capella: {
    COUCHBASE_URL: "couchbase://localhost",
    COUCHBASE_USERNAME: "Administrator",
    COUCHBASE_PASSWORD: "password",
    COUCHBASE_BUCKET: "default",
    COUCHBASE_SCOPE: "_default",
    COUCHBASE_COLLECTION: "_default",
  },
  openTelemetry: {
    ENABLE_OPENTELEMETRY: true,
    SERVICE_NAME: "CapellaQL Service",
    SERVICE_VERSION: "2.0",
    DEPLOYMENT_ENVIRONMENT: "development",
    TRACES_ENDPOINT: "http://localhost:4318/v1/traces",
    METRICS_ENDPOINT: "http://localhost:4318/v1/metrics",
    LOGS_ENDPOINT: "http://localhost:4318/v1/logs",
    METRIC_READER_INTERVAL: 60000,
    SUMMARY_LOG_INTERVAL: 300000,
  },
};

function parseEnvVar(value: string | undefined, type: "string" | "number" | "boolean"): unknown {
  if (value === undefined) return undefined;
  if (type === "number") return Number(value);
  if (type === "boolean") return value.toLowerCase() === "true";
  return value;
}

function loadConfigFromEnv(): Partial<Config> {
  const config: Partial<Config> = {};

  config.application = {
    LOG_LEVEL: parseEnvVar(Bun.env[envVarMapping.application.LOG_LEVEL], "string") as string || defaultConfig.application.LOG_LEVEL,
    LOG_MAX_SIZE: parseEnvVar(Bun.env[envVarMapping.application.LOG_MAX_SIZE], "string") as string || defaultConfig.application.LOG_MAX_SIZE,
    LOG_MAX_FILES: parseEnvVar(Bun.env[envVarMapping.application.LOG_MAX_FILES], "string") as string || defaultConfig.application.LOG_MAX_FILES,
    YOGA_RESPONSE_CACHE_TTL: parseEnvVar(Bun.env[envVarMapping.application.YOGA_RESPONSE_CACHE_TTL], "number") as number || defaultConfig.application.YOGA_RESPONSE_CACHE_TTL,
    PORT: parseEnvVar(Bun.env[envVarMapping.application.PORT], "number") as number || defaultConfig.application.PORT,
    ENABLE_FILE_LOGGING: parseEnvVar(Bun.env[envVarMapping.application.ENABLE_FILE_LOGGING], "boolean") as boolean ?? defaultConfig.application.ENABLE_FILE_LOGGING,
    ALLOWED_ORIGINS: Bun.env[envVarMapping.application.ALLOWED_ORIGINS]?.split(",") || defaultConfig.application.ALLOWED_ORIGINS,
  };

  config.capella = {
    COUCHBASE_URL: parseEnvVar(Bun.env[envVarMapping.capella.COUCHBASE_URL], "string") as string || defaultConfig.capella.COUCHBASE_URL,
    COUCHBASE_USERNAME: parseEnvVar(Bun.env[envVarMapping.capella.COUCHBASE_USERNAME], "string") as string || defaultConfig.capella.COUCHBASE_USERNAME,
    COUCHBASE_PASSWORD: parseEnvVar(Bun.env[envVarMapping.capella.COUCHBASE_PASSWORD], "string") as string || defaultConfig.capella.COUCHBASE_PASSWORD,
    COUCHBASE_BUCKET: parseEnvVar(Bun.env[envVarMapping.capella.COUCHBASE_BUCKET], "string") as string || defaultConfig.capella.COUCHBASE_BUCKET,
    COUCHBASE_SCOPE: parseEnvVar(Bun.env[envVarMapping.capella.COUCHBASE_SCOPE], "string") as string || defaultConfig.capella.COUCHBASE_SCOPE,
    COUCHBASE_COLLECTION: parseEnvVar(Bun.env[envVarMapping.capella.COUCHBASE_COLLECTION], "string") as string || defaultConfig.capella.COUCHBASE_COLLECTION,
  };

  config.openTelemetry = {
    ENABLE_OPENTELEMETRY: parseEnvVar(Bun.env[envVarMapping.openTelemetry.ENABLE_OPENTELEMETRY], "boolean") as boolean ?? defaultConfig.openTelemetry.ENABLE_OPENTELEMETRY,
    SERVICE_NAME: parseEnvVar(Bun.env[envVarMapping.openTelemetry.SERVICE_NAME], "string") as string || defaultConfig.openTelemetry.SERVICE_NAME,
    SERVICE_VERSION: parseEnvVar(Bun.env[envVarMapping.openTelemetry.SERVICE_VERSION], "string") as string || defaultConfig.openTelemetry.SERVICE_VERSION,
    DEPLOYMENT_ENVIRONMENT: parseEnvVar(Bun.env[envVarMapping.openTelemetry.DEPLOYMENT_ENVIRONMENT], "string") as string || defaultConfig.openTelemetry.DEPLOYMENT_ENVIRONMENT,
    TRACES_ENDPOINT: parseEnvVar(Bun.env[envVarMapping.openTelemetry.TRACES_ENDPOINT], "string") as string || defaultConfig.openTelemetry.TRACES_ENDPOINT,
    METRICS_ENDPOINT: parseEnvVar(Bun.env[envVarMapping.openTelemetry.METRICS_ENDPOINT], "string") as string || defaultConfig.openTelemetry.METRICS_ENDPOINT,
    LOGS_ENDPOINT: parseEnvVar(Bun.env[envVarMapping.openTelemetry.LOGS_ENDPOINT], "string") as string || defaultConfig.openTelemetry.LOGS_ENDPOINT,
    METRIC_READER_INTERVAL: parseEnvVar(Bun.env[envVarMapping.openTelemetry.METRIC_READER_INTERVAL], "number") as number || defaultConfig.openTelemetry.METRIC_READER_INTERVAL,
    SUMMARY_LOG_INTERVAL: parseEnvVar(Bun.env[envVarMapping.openTelemetry.SUMMARY_LOG_INTERVAL], "number") as number || defaultConfig.openTelemetry.SUMMARY_LOG_INTERVAL,
  };

  return config;
}

let config: Config;

try {
  const envConfig = loadConfigFromEnv();
  const mergedConfig = {
    application: { ...defaultConfig.application, ...envConfig.application },
    capella: { ...defaultConfig.capella, ...envConfig.capella },
    openTelemetry: { ...defaultConfig.openTelemetry, ...envConfig.openTelemetry },
  };

  config = ConfigSchema.parse(mergedConfig);
  process.stderr.write("Configuration loaded successfully: " + JSON.stringify({
    application: {
      LOG_LEVEL: config.application.LOG_LEVEL,
      PORT: config.application.PORT,
      ENABLE_FILE_LOGGING: config.application.ENABLE_FILE_LOGGING,
    },
    capella: {
      COUCHBASE_URL: config.capella.COUCHBASE_URL,
      COUCHBASE_BUCKET: config.capella.COUCHBASE_BUCKET,
    },
    openTelemetry: {
      ENABLE_OPENTELEMETRY: config.openTelemetry.ENABLE_OPENTELEMETRY,
      SERVICE_NAME: config.openTelemetry.SERVICE_NAME,
      DEPLOYMENT_ENVIRONMENT: config.openTelemetry.DEPLOYMENT_ENVIRONMENT,
    },
  }, null, 2) + "\n");
} catch (error) {
  process.stderr.write("Configuration validation failed: " + (error instanceof Error ? error.message : String(error)) + "\n");
  throw new Error("Invalid configuration: " + (error instanceof Error ? error.message : String(error)));
}

export { config };
export * from "./models/types";
export default config;
