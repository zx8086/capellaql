/* src/models/types.ts */

import { z } from "zod";

export interface ApplicationConfig {
  LOG_LEVEL: string;
  LOG_MAX_SIZE: string;
  LOG_MAX_FILES: string;
  YOGA_RESPONSE_CACHE_TTL: number;
  PORT: number;
  ENABLE_FILE_LOGGING: boolean;
  ALLOWED_ORIGINS: string[];
}

export interface CapellaConfig {
  COUCHBASE_URL: string;
  COUCHBASE_USERNAME: string;
  COUCHBASE_PASSWORD: string;
  COUCHBASE_BUCKET: string;
  COUCHBASE_SCOPE: string;
  COUCHBASE_COLLECTION: string;
}

export interface OpenTelemetryConfig {
  ENABLE_OPENTELEMETRY: boolean;
  SERVICE_NAME: string;
  SERVICE_VERSION: string;
  DEPLOYMENT_ENVIRONMENT: string;
  TRACES_ENDPOINT: string;
  METRICS_ENDPOINT: string;
  LOGS_ENDPOINT: string;
  METRIC_READER_INTERVAL: number;
  SUMMARY_LOG_INTERVAL: number;
}

export interface Config {
  application: ApplicationConfig;
  capella: CapellaConfig;
  openTelemetry: OpenTelemetryConfig;
}

const ApplicationConfigSchema = z.object({
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  LOG_MAX_SIZE: z.string().default("20m"),
  LOG_MAX_FILES: z.string().default("14d"),
  YOGA_RESPONSE_CACHE_TTL: z.number().min(0).default(900000),
  PORT: z.number().min(1).max(65535).default(4000),
  ENABLE_FILE_LOGGING: z.boolean().default(false),
  ALLOWED_ORIGINS: z.array(z.string()).default(["http://localhost:4000/graphql"]),
});

const CapellaConfigSchema = z.object({
  COUCHBASE_URL: z.string().url(),
  COUCHBASE_USERNAME: z.string().min(1),
  COUCHBASE_PASSWORD: z.string().min(1),
  COUCHBASE_BUCKET: z.string().min(1).default("default"),
  COUCHBASE_SCOPE: z.string().default("_default"),
  COUCHBASE_COLLECTION: z.string().default("_default"),
});

const OpenTelemetryConfigSchema = z.object({
  ENABLE_OPENTELEMETRY: z.boolean().default(true),
  SERVICE_NAME: z.string().default("CapellaQL Service"),
  SERVICE_VERSION: z.string().default("2.0"),
  DEPLOYMENT_ENVIRONMENT: z.string().default("development"),
  TRACES_ENDPOINT: z.string().url(),
  METRICS_ENDPOINT: z.string().url(),
  LOGS_ENDPOINT: z.string().url(),
  METRIC_READER_INTERVAL: z.number().min(1000).default(60000),
  SUMMARY_LOG_INTERVAL: z.number().min(1000).default(300000),
});

const ConfigSchema = z.object({
  application: ApplicationConfigSchema,
  capella: CapellaConfigSchema,
  openTelemetry: OpenTelemetryConfigSchema,
});

export type ValidatedConfig = z.infer<typeof ConfigSchema>;
export { ConfigSchema };
