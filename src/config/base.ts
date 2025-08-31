// Base configuration types and interfaces
// Shared across all domain modules

export interface ApplicationConfig {
  LOG_LEVEL: string;
  LOG_MAX_SIZE: string;
  LOG_MAX_FILES: string;
  YOGA_RESPONSE_CACHE_TTL: number;
  PORT: number;
  ENABLE_FILE_LOGGING: boolean;
  ALLOWED_ORIGINS: string[];
  BASE_URL: string;
}

export interface CapellaConfig {
  COUCHBASE_URL: string;
  COUCHBASE_USERNAME: string;
  COUCHBASE_PASSWORD: string;
  COUCHBASE_BUCKET: string;
  COUCHBASE_SCOPE: string;
  COUCHBASE_COLLECTION: string;
  // SDK timeout configurations (milliseconds)
  COUCHBASE_KV_TIMEOUT: number;
  COUCHBASE_KV_DURABLE_TIMEOUT: number;
  COUCHBASE_QUERY_TIMEOUT: number;
  COUCHBASE_ANALYTICS_TIMEOUT: number;
  COUCHBASE_SEARCH_TIMEOUT: number;
  COUCHBASE_CONNECT_TIMEOUT: number;
  COUCHBASE_BOOTSTRAP_TIMEOUT: number;
}

export interface RuntimeConfig {
  NODE_ENV: string;
  CN_ROOT: string;
  CN_CXXCBC_CACHE_DIR?: string;
  SOURCE_MAP_SUPPORT: boolean;
  PRESERVE_SOURCE_MAPS: boolean;
  BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS: number;
}

export interface DeploymentConfig {
  BASE_URL: string;
  HOSTNAME: string;
  INSTANCE_ID: string;
  CONTAINER_ID?: string;
  K8S_POD_NAME?: string;
  K8S_NAMESPACE?: string;
}

export interface TelemetryConfig {
  ENABLE_OPENTELEMETRY: boolean;
  SERVICE_NAME: string;
  SERVICE_VERSION: string;
  DEPLOYMENT_ENVIRONMENT: string;
  TRACES_ENDPOINT: string;
  METRICS_ENDPOINT: string;
  LOGS_ENDPOINT: string;
  METRIC_READER_INTERVAL: number;
  SUMMARY_LOG_INTERVAL: number;
  // 2025 compliance settings
  EXPORT_TIMEOUT_MS: number;
  BATCH_SIZE: number;
  MAX_QUEUE_SIZE: number;
  SAMPLING_RATE: number;
  CIRCUIT_BREAKER_THRESHOLD: number;
  CIRCUIT_BREAKER_TIMEOUT_MS: number;
}

export interface Config {
  application: ApplicationConfig;
  capella: CapellaConfig;
  runtime: RuntimeConfig;
  deployment: DeploymentConfig;
  telemetry: TelemetryConfig;
}

// Environment variable mapping type
export type EnvVarMapping = {
  [K in keyof Config]: {
    [P in keyof Config[K]]: string;
  };
};

// Configuration error type
export class ConfigurationError extends Error {
  constructor(
    message: string,
    public readonly errors: any,
    public readonly partialConfig?: unknown
  ) {
    super(message);
    this.name = "ConfigurationError";
  }

  toDetailedString(): string {
    const issues = this.errors.issues
      ?.map((issue: any) => {
        const path = issue.path.join(".");
        return `  - ${path}: ${issue.message}`;
      })
      .join("\n");

    return `${this.message}\n${issues || ""}`;
  }
}