// src/config/loader.ts

import { z } from "zod";
import pkg from "../../package.json" with { type: "json" };
import { defaultConfig } from "./defaults";
import { deriveOtlpEndpoint, toBool } from "./helpers";
import type { AppConfig } from "./schemas";
import {
  AppConfigSchema,
  addProductionSecurityValidation,
  EmailAddress,
  EnvironmentType,
  HttpsUrl,
  KongMode,
  NonEmptyString,
  TelemetryMode,
} from "./schemas";

const envSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).optional(),
    NODE_ENV: EnvironmentType.optional(),
    MAX_REQUEST_BODY_SIZE: z.coerce
      .number()
      .int()
      .min(1024)
      .max(100 * 1024 * 1024)
      .optional(),
    REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).optional(),

    KONG_JWT_AUTHORITY: NonEmptyString,
    KONG_JWT_AUDIENCE: NonEmptyString,
    KONG_JWT_ISSUER: NonEmptyString.optional(),
    KONG_JWT_KEY_CLAIM_NAME: NonEmptyString.optional(),
    JWT_EXPIRATION_MINUTES: z.coerce.number().int().min(1).max(60).optional(),

    KONG_MODE: KongMode.optional(),
    KONG_ADMIN_URL: HttpsUrl,
    KONG_ADMIN_TOKEN: z.string(),

    CIRCUIT_BREAKER_ENABLED: z.string().optional(),
    CIRCUIT_BREAKER_TIMEOUT: z.coerce.number().int().min(100).max(10000).optional(),
    CIRCUIT_BREAKER_ERROR_THRESHOLD: z.coerce.number().min(1).max(100).optional(),
    CIRCUIT_BREAKER_RESET_TIMEOUT: z.coerce.number().int().min(1000).max(300000).optional(),
    CIRCUIT_BREAKER_VOLUME_THRESHOLD: z.coerce.number().int().min(1).max(100).optional(),
    CIRCUIT_BREAKER_ROLLING_COUNT_TIMEOUT: z.coerce.number().int().min(1000).max(60000).optional(),
    CIRCUIT_BREAKER_ROLLING_COUNT_BUCKETS: z.coerce.number().int().min(1).max(20).optional(),
    KONG_SECRET_CREATION_MAX_RETRIES: z.coerce.number().int().min(1).max(10).optional(),
    KONG_MAX_HEADER_LENGTH: z.coerce.number().int().min(64).max(8192).optional(),
    STALE_DATA_TOLERANCE_MINUTES: z.coerce.number().int().min(1).max(120).optional(),

    OTEL_SERVICE_NAME: NonEmptyString.optional(),
    OTEL_SERVICE_VERSION: NonEmptyString.optional(),
    TELEMETRY_MODE: TelemetryMode.optional(),
    LOG_LEVEL: z.enum(["error", "warn", "info", "debug", "silent"]).optional(),
    OTEL_EXPORTER_OTLP_ENDPOINT: HttpsUrl.optional(),
    OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: HttpsUrl.optional(),
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: HttpsUrl.optional(),
    OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: HttpsUrl.optional(),
    OTEL_EXPORTER_OTLP_TIMEOUT: z.coerce.number().int().min(1000).max(60000).optional(),
    OTEL_BSP_MAX_EXPORT_BATCH_SIZE: z.coerce.number().int().min(1).max(5000).optional(),
    OTEL_BSP_MAX_QUEUE_SIZE: z.coerce.number().int().min(1).max(50000).optional(),
    TELEMETRY_CB_FAILURE_THRESHOLD: z.coerce.number().int().min(1).max(100).optional(),
    TELEMETRY_CB_RECOVERY_TIMEOUT: z.coerce.number().int().min(1000).max(600000).optional(),
    TELEMETRY_CB_SUCCESS_THRESHOLD: z.coerce.number().int().min(1).max(20).optional(),
    TELEMETRY_CB_MONITORING_INTERVAL: z.coerce.number().int().min(1000).max(60000).optional(),
    OTEL_RUNTIME_METRICS_ENABLED: z.string().optional(),
    MEMORY_GUARDIAN_HEAP_LIMIT_MB: z.coerce.number().int().min(64).max(32768).optional(),

    HIGH_AVAILABILITY: z
      .string()
      .optional()
      .transform((val) => val === "true"),
    REDIS_URL: z.url().optional(),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_DB: z.coerce.number().int().min(0).max(15).optional(),
    CACHE_HEALTH_TTL_MS: z.coerce.number().int().min(100).max(60000).optional(),
    CACHE_MAX_MEMORY_ENTRIES: z.coerce.number().int().min(100).max(100000).optional(),
    REDIS_MAX_RETRIES: z.coerce.number().int().min(1).max(10).optional(),
    REDIS_CONNECTION_TIMEOUT: z.coerce.number().int().min(1000).max(30000).optional(),

    // Cache Resilience - Circuit Breaker
    CACHE_CB_ENABLED: z.string().optional(),
    CACHE_CB_FAILURE_THRESHOLD: z.coerce.number().int().min(1).max(100).optional(),
    CACHE_CB_RESET_TIMEOUT: z.coerce.number().int().min(1000).max(300000).optional(),
    CACHE_CB_SUCCESS_THRESHOLD: z.coerce.number().int().min(1).max(20).optional(),

    // Cache Resilience - Reconnect
    CACHE_RECONNECT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).optional(),
    CACHE_RECONNECT_BASE_DELAY_MS: z.coerce.number().int().min(50).max(5000).optional(),
    CACHE_RECONNECT_MAX_DELAY_MS: z.coerce.number().int().min(1000).max(60000).optional(),
    CACHE_RECONNECT_COOLDOWN_MS: z.coerce.number().int().min(10000).max(300000).optional(),

    // Cache Resilience - Health Monitor
    CACHE_HEALTH_MONITOR_ENABLED: z.string().optional(),
    CACHE_HEALTH_MONITOR_INTERVAL_MS: z.coerce.number().int().min(1000).max(60000).optional(),
    CACHE_HEALTH_MONITOR_UNHEALTHY_THRESHOLD: z.coerce.number().int().min(1).max(20).optional(),
    CACHE_HEALTH_MONITOR_HEALTHY_THRESHOLD: z.coerce.number().int().min(1).max(20).optional(),
    CACHE_HEALTH_MONITOR_PING_TIMEOUT_MS: z.coerce.number().int().min(100).max(5000).optional(),

    // Cache Resilience - Operation Timeouts
    CACHE_TIMEOUT_GET_MS: z.coerce.number().int().min(100).max(10000).optional(),
    CACHE_TIMEOUT_SET_MS: z.coerce.number().int().min(100).max(10000).optional(),
    CACHE_TIMEOUT_DELETE_MS: z.coerce.number().int().min(100).max(10000).optional(),
    CACHE_TIMEOUT_SCAN_MS: z.coerce.number().int().min(100).max(30000).optional(),
    CACHE_TIMEOUT_PING_MS: z.coerce.number().int().min(50).max(5000).optional(),
    CACHE_TIMEOUT_CONNECT_MS: z.coerce.number().int().min(1000).max(30000).optional(),

    PROFILING_ENABLED: z.string().optional(),

    CONTINUOUS_PROFILING_ENABLED: z.string().optional(),
    CONTINUOUS_PROFILING_AUTO_TRIGGER_ON_SLA: z.string().optional(),
    CONTINUOUS_PROFILING_THROTTLE_MINUTES: z.string().optional(),
    CONTINUOUS_PROFILING_OUTPUT_DIR: z.string().optional(),
    CONTINUOUS_PROFILING_MAX_CONCURRENT: z.string().optional(),
    CONTINUOUS_PROFILING_BUFFER_SIZE: z.string().optional(),

    API_TITLE: NonEmptyString.optional(),
    API_DESCRIPTION: NonEmptyString.optional(),
    API_VERSION: NonEmptyString.optional(),
    API_CONTACT_NAME: NonEmptyString.optional(),
    API_CONTACT_EMAIL: EmailAddress.optional(),
    API_LICENSE_NAME: NonEmptyString.optional(),
    API_LICENSE_IDENTIFIER: NonEmptyString.optional(),
    // CORS configuration
    API_CORS_ORIGIN: NonEmptyString.optional(),
    API_CORS_ALLOW_HEADERS: z.string().optional(),
    API_CORS_ALLOW_METHODS: z.string().optional(),
    API_CORS_MAX_AGE: z.coerce.number().int().min(0).max(86400).optional(),
    // Legacy backward compatibility
    API_CORS: NonEmptyString.optional(),
  })
  .superRefine((data, ctx) => {
    addProductionSecurityValidation({ nodeEnv: data.NODE_ENV }, ctx, {
      serviceName: data.OTEL_SERVICE_NAME || pkg.name || "authentication-service",
      serviceVersion: data.OTEL_SERVICE_VERSION || pkg.version || "1.0.0",
      adminUrl: data.KONG_ADMIN_URL,
      adminToken: data.KONG_ADMIN_TOKEN,
    });
  })
  .transform((data) => {
    const baseEndpoint = data.OTEL_EXPORTER_OTLP_ENDPOINT;

    return {
      ...data,
      OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: deriveOtlpEndpoint(
        baseEndpoint,
        data.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT,
        "/v1/logs"
      ),
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: deriveOtlpEndpoint(
        baseEndpoint,
        data.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
        "/v1/traces"
      ),
      OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: deriveOtlpEndpoint(
        baseEndpoint,
        data.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
        "/v1/metrics"
      ),
    };
  });

function detectInfrastructure() {
  const envSource = typeof Bun !== "undefined" ? Bun.env : process.env;

  const isKubernetes = !!envSource.KUBERNETES_SERVICE_HOST;
  const isEcs = !!envSource.ECS_CONTAINER_METADATA_URI_V4;

  return {
    isKubernetes,
    isEcs,
    podName: isKubernetes ? envSource.HOSTNAME : undefined,
    namespace: isKubernetes ? envSource.NAMESPACE : undefined,
  };
}

function parseCommaSeparated(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function loadConfigFromEnv() {
  const envSource = typeof Bun !== "undefined" ? Bun.env : process.env;

  const result = envSchema.safeParse(envSource);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "root";
        return `  - ${path}: ${issue.message}`;
      })
      .join("\n");

    throw new Error(
      `Invalid environment configuration:\n${issues}\n\nHelp: Check .env.example for correct format and ensure all required variables are set.`
    );
  }

  return result.data;
}

export function initializeConfig(): AppConfig {
  const envConfig = loadConfigFromEnv();

  type KongModeType = "API_GATEWAY" | "KONNECT";
  type EnvironmentTypeValue = "local" | "development" | "staging" | "production" | "test";
  type TelemetryModeValue = "console" | "otlp" | "both";

  interface StructuredEnvConfig {
    server: Partial<{ port: number; nodeEnv: string }>;
    jwt: Partial<{
      authority: string;
      audience: string;
      issuer: string;
      keyClaimName: string;
      expirationMinutes: number;
    }>;
    kong: {
      mode?: KongModeType;
      adminUrl?: string;
      adminToken?: string;
      consumerIdHeader?: string;
      consumerUsernameHeader?: string;
      anonymousHeader?: string;
      highAvailability?: boolean;
      secretCreationMaxRetries?: number;
      maxHeaderLength?: number;
      circuitBreaker: Partial<{
        enabled: boolean;
        timeout: number;
        errorThresholdPercentage: number;
        resetTimeout: number;
        volumeThreshold: number;
        rollingCountTimeout: number;
        rollingCountBuckets: number;
      }>;
    };
    caching: Partial<{
      highAvailability: boolean;
      redisUrl: string;
      redisPassword: string;
      redisDb: number;
      staleDataToleranceMinutes: number;
      healthCheckTtlMs: number;
      redisMaxRetries: number;
      redisConnectionTimeout: number;
      resilience: {
        circuitBreaker: Partial<{
          enabled: boolean;
          failureThreshold: number;
          resetTimeout: number;
          successThreshold: number;
        }>;
        reconnect: Partial<{
          maxAttempts: number;
          baseDelayMs: number;
          maxDelayMs: number;
          cooldownMs: number;
        }>;
        healthMonitor: Partial<{
          enabled: boolean;
          intervalMs: number;
          unhealthyThreshold: number;
          healthyThreshold: number;
          pingTimeoutMs: number;
        }>;
        operationTimeouts: Partial<{
          get: number;
          set: number;
          delete: number;
          scan: number;
          ping: number;
          connect: number;
        }>;
      };
    }>;
    telemetry: {
      serviceName?: string;
      serviceVersion?: string;
      environment?: EnvironmentTypeValue;
      mode?: TelemetryModeValue;
      endpoint?: string;
      exportTimeout?: number;
      batchSize?: number;
      maxQueueSize?: number;
      infrastructure: {
        isKubernetes: boolean;
        isEcs: boolean;
        podName?: string;
        namespace?: string;
      };
      circuitBreaker: Partial<{
        failureThreshold: number;
        recoveryTimeout: number;
        successThreshold: number;
        monitoringInterval: number;
      }>;
    };
    profiling: Partial<{ enabled: boolean }>;
    continuousProfiling: Partial<{
      enabled: boolean;
      autoTriggerOnSlaViolation: boolean;
      slaViolationThrottleMinutes: number;
      outputDir: string;
      maxConcurrentProfiles: number;
      rollingBufferSize: number;
    }>;
    apiInfo: {
      title?: string;
      description?: string;
      version?: string;
      contactName?: string;
      contactEmail?: string;
      licenseName?: string;
      licenseIdentifier?: string;
      cors: Partial<{
        origin: string;
        allowHeaders: string[];
        allowMethods: string[];
        maxAge: number;
      }>;
    };
  }

  const structuredEnvConfig: StructuredEnvConfig = {
    server: Object.fromEntries(
      Object.entries({
        port: envConfig.PORT,
        nodeEnv: envConfig.NODE_ENV,
        maxRequestBodySize: envConfig.MAX_REQUEST_BODY_SIZE,
        requestTimeoutMs: envConfig.REQUEST_TIMEOUT_MS,
      }).filter(([, value]) => value !== undefined)
    ),
    jwt: Object.fromEntries(
      Object.entries({
        authority: envConfig.KONG_JWT_AUTHORITY,
        audience: envConfig.KONG_JWT_AUDIENCE,
        issuer: envConfig.KONG_JWT_ISSUER,
        keyClaimName: envConfig.KONG_JWT_KEY_CLAIM_NAME,
        expirationMinutes: envConfig.JWT_EXPIRATION_MINUTES,
      }).filter(([, value]) => value !== undefined)
    ),
    kong: {
      ...Object.fromEntries(
        Object.entries({
          mode: envConfig.KONG_MODE,
          adminUrl: envConfig.KONG_ADMIN_URL,
          adminToken: envConfig.KONG_ADMIN_TOKEN,
          consumerIdHeader: "x-consumer-id",
          consumerUsernameHeader: "x-consumer-username",
          anonymousHeader: "x-anonymous-consumer",
          highAvailability: toBool(envConfig.HIGH_AVAILABILITY, false),
          secretCreationMaxRetries: envConfig.KONG_SECRET_CREATION_MAX_RETRIES,
          maxHeaderLength: envConfig.KONG_MAX_HEADER_LENGTH,
        }).filter(([, value]) => value !== undefined)
      ),
      circuitBreaker: Object.fromEntries(
        Object.entries({
          enabled: toBool(envConfig.CIRCUIT_BREAKER_ENABLED, true),
          timeout: envConfig.CIRCUIT_BREAKER_TIMEOUT,
          errorThresholdPercentage: envConfig.CIRCUIT_BREAKER_ERROR_THRESHOLD,
          resetTimeout: envConfig.CIRCUIT_BREAKER_RESET_TIMEOUT,
          volumeThreshold: envConfig.CIRCUIT_BREAKER_VOLUME_THRESHOLD,
          rollingCountTimeout: envConfig.CIRCUIT_BREAKER_ROLLING_COUNT_TIMEOUT,
          rollingCountBuckets: envConfig.CIRCUIT_BREAKER_ROLLING_COUNT_BUCKETS,
        }).filter(([, value]) => value !== undefined)
      ),
    },
    caching: {
      ...Object.fromEntries(
        Object.entries({
          highAvailability: envConfig.HIGH_AVAILABILITY,
          redisUrl: envConfig.REDIS_URL,
          redisPassword: envConfig.REDIS_PASSWORD,
          redisDb: envConfig.REDIS_DB,
          staleDataToleranceMinutes: envConfig.STALE_DATA_TOLERANCE_MINUTES,
          maxMemoryEntries: envConfig.CACHE_MAX_MEMORY_ENTRIES,
          healthCheckTtlMs: envConfig.CACHE_HEALTH_TTL_MS,
          redisMaxRetries: envConfig.REDIS_MAX_RETRIES,
          redisConnectionTimeout: envConfig.REDIS_CONNECTION_TIMEOUT,
        }).filter(([, value]) => value !== undefined)
      ),
      resilience: {
        circuitBreaker: Object.fromEntries(
          Object.entries({
            enabled: toBool(envConfig.CACHE_CB_ENABLED, undefined),
            failureThreshold: envConfig.CACHE_CB_FAILURE_THRESHOLD,
            resetTimeout: envConfig.CACHE_CB_RESET_TIMEOUT,
            successThreshold: envConfig.CACHE_CB_SUCCESS_THRESHOLD,
          }).filter(([, value]) => value !== undefined)
        ),
        reconnect: Object.fromEntries(
          Object.entries({
            maxAttempts: envConfig.CACHE_RECONNECT_MAX_ATTEMPTS,
            baseDelayMs: envConfig.CACHE_RECONNECT_BASE_DELAY_MS,
            maxDelayMs: envConfig.CACHE_RECONNECT_MAX_DELAY_MS,
            cooldownMs: envConfig.CACHE_RECONNECT_COOLDOWN_MS,
          }).filter(([, value]) => value !== undefined)
        ),
        healthMonitor: Object.fromEntries(
          Object.entries({
            enabled: toBool(envConfig.CACHE_HEALTH_MONITOR_ENABLED, undefined),
            intervalMs: envConfig.CACHE_HEALTH_MONITOR_INTERVAL_MS,
            unhealthyThreshold: envConfig.CACHE_HEALTH_MONITOR_UNHEALTHY_THRESHOLD,
            healthyThreshold: envConfig.CACHE_HEALTH_MONITOR_HEALTHY_THRESHOLD,
            pingTimeoutMs: envConfig.CACHE_HEALTH_MONITOR_PING_TIMEOUT_MS,
          }).filter(([, value]) => value !== undefined)
        ),
        operationTimeouts: Object.fromEntries(
          Object.entries({
            get: envConfig.CACHE_TIMEOUT_GET_MS,
            set: envConfig.CACHE_TIMEOUT_SET_MS,
            delete: envConfig.CACHE_TIMEOUT_DELETE_MS,
            scan: envConfig.CACHE_TIMEOUT_SCAN_MS,
            ping: envConfig.CACHE_TIMEOUT_PING_MS,
            connect: envConfig.CACHE_TIMEOUT_CONNECT_MS,
          }).filter(([, value]) => value !== undefined)
        ),
      },
    },
    telemetry: {
      ...Object.fromEntries(
        Object.entries({
          serviceName: envConfig.OTEL_SERVICE_NAME,
          serviceVersion: envConfig.OTEL_SERVICE_VERSION,
          environment: envConfig.NODE_ENV,
          mode: envConfig.TELEMETRY_MODE,
          logLevel: envConfig.LOG_LEVEL,
          endpoint: envConfig.OTEL_EXPORTER_OTLP_ENDPOINT,
          exportTimeout: envConfig.OTEL_EXPORTER_OTLP_TIMEOUT,
          batchSize: envConfig.OTEL_BSP_MAX_EXPORT_BATCH_SIZE,
          maxQueueSize: envConfig.OTEL_BSP_MAX_QUEUE_SIZE,
          runtimeMetricsEnabled: toBool(envConfig.OTEL_RUNTIME_METRICS_ENABLED, undefined),
          memoryGuardianHeapLimitMB: envConfig.MEMORY_GUARDIAN_HEAP_LIMIT_MB,
        }).filter(([, value]) => value !== undefined)
      ),
      infrastructure: detectInfrastructure(),
      circuitBreaker: Object.fromEntries(
        Object.entries({
          failureThreshold: envConfig.TELEMETRY_CB_FAILURE_THRESHOLD,
          recoveryTimeout: envConfig.TELEMETRY_CB_RECOVERY_TIMEOUT,
          successThreshold: envConfig.TELEMETRY_CB_SUCCESS_THRESHOLD,
          monitoringInterval: envConfig.TELEMETRY_CB_MONITORING_INTERVAL,
        }).filter(([, value]) => value !== undefined)
      ),
    },
    profiling: Object.fromEntries(
      Object.entries({
        enabled: toBool(envConfig.PROFILING_ENABLED, false),
      }).filter(([, value]) => value !== undefined)
    ),
    continuousProfiling: Object.fromEntries(
      Object.entries({
        enabled: toBool(envConfig.CONTINUOUS_PROFILING_ENABLED, false),
        autoTriggerOnSlaViolation: toBool(envConfig.CONTINUOUS_PROFILING_AUTO_TRIGGER_ON_SLA, true),
        slaViolationThrottleMinutes: envConfig.CONTINUOUS_PROFILING_THROTTLE_MINUTES
          ? Number.parseInt(envConfig.CONTINUOUS_PROFILING_THROTTLE_MINUTES, 10)
          : undefined,
        outputDir: envConfig.CONTINUOUS_PROFILING_OUTPUT_DIR,
        maxConcurrentProfiles: envConfig.CONTINUOUS_PROFILING_MAX_CONCURRENT
          ? Number.parseInt(envConfig.CONTINUOUS_PROFILING_MAX_CONCURRENT, 10)
          : undefined,
        rollingBufferSize: envConfig.CONTINUOUS_PROFILING_BUFFER_SIZE
          ? Number.parseInt(envConfig.CONTINUOUS_PROFILING_BUFFER_SIZE, 10)
          : undefined,
      }).filter(([, value]) => value !== undefined)
    ),
    apiInfo: {
      ...Object.fromEntries(
        Object.entries({
          title: envConfig.API_TITLE,
          description: envConfig.API_DESCRIPTION,
          version: envConfig.API_VERSION,
          contactName: envConfig.API_CONTACT_NAME,
          contactEmail: envConfig.API_CONTACT_EMAIL,
          licenseName: envConfig.API_LICENSE_NAME,
          licenseIdentifier: envConfig.API_LICENSE_IDENTIFIER,
        }).filter(([, value]) => value !== undefined)
      ),
      cors: Object.fromEntries(
        Object.entries({
          // Support legacy API_CORS as fallback for origin
          origin: envConfig.API_CORS_ORIGIN || envConfig.API_CORS,
          allowHeaders: parseCommaSeparated(envConfig.API_CORS_ALLOW_HEADERS),
          allowMethods: parseCommaSeparated(envConfig.API_CORS_ALLOW_METHODS),
          maxAge: envConfig.API_CORS_MAX_AGE,
        }).filter(([, value]) => value !== undefined)
      ),
    },
  };

  const mergedConfig: AppConfig = {
    server: { ...defaultConfig.server, ...structuredEnvConfig.server },
    jwt: {
      ...defaultConfig.jwt,
      ...structuredEnvConfig.jwt,
      issuer:
        (structuredEnvConfig.jwt.issuer as string) ||
        (structuredEnvConfig.jwt.authority as string) ||
        defaultConfig.jwt.issuer,
    },
    kong: {
      ...defaultConfig.kong,
      ...structuredEnvConfig.kong,
      circuitBreaker: {
        ...defaultConfig.kong.circuitBreaker,
        ...structuredEnvConfig.kong.circuitBreaker,
      },
    },
    caching: (() => {
      const defaultResilience = defaultConfig.caching.resilience;
      const envResilience = structuredEnvConfig.caching.resilience;

      return {
        ...defaultConfig.caching,
        ...structuredEnvConfig.caching,
        // Deep merge resilience config - defaults guarantee all required values
        resilience: defaultResilience
          ? {
              circuitBreaker: {
                ...defaultResilience.circuitBreaker,
                ...envResilience?.circuitBreaker,
              },
              reconnect: {
                ...defaultResilience.reconnect,
                ...envResilience?.reconnect,
              },
              healthMonitor: {
                ...defaultResilience.healthMonitor,
                ...envResilience?.healthMonitor,
              },
              operationTimeouts: {
                ...defaultResilience.operationTimeouts,
                ...envResilience?.operationTimeouts,
              },
            }
          : undefined,
      };
    })(),
    telemetry: {
      ...defaultConfig.telemetry,
      ...structuredEnvConfig.telemetry,
      logsEndpoint: deriveOtlpEndpoint(
        structuredEnvConfig.telemetry.endpoint,
        envConfig.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT,
        "/v1/logs"
      ),
      tracesEndpoint: deriveOtlpEndpoint(
        structuredEnvConfig.telemetry.endpoint,
        envConfig.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
        "/v1/traces"
      ),
      metricsEndpoint: deriveOtlpEndpoint(
        structuredEnvConfig.telemetry.endpoint,
        envConfig.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
        "/v1/metrics"
      ),
      enabled:
        ((structuredEnvConfig.telemetry.mode ?? defaultConfig.telemetry.mode) as string) !==
        "console",
      enableOpenTelemetry:
        ((structuredEnvConfig.telemetry.mode ?? defaultConfig.telemetry.mode) as string) !==
        "console",
      circuitBreaker: {
        ...defaultConfig.telemetry.circuitBreaker,
        ...structuredEnvConfig.telemetry.circuitBreaker,
      },
    },
    profiling: { ...defaultConfig.profiling, ...structuredEnvConfig.profiling },
    continuousProfiling: {
      ...defaultConfig.continuousProfiling,
      ...structuredEnvConfig.continuousProfiling,
      // Derive outputDir for container environments (read-only filesystem)
      outputDir:
        structuredEnvConfig.continuousProfiling.outputDir ??
        (structuredEnvConfig.telemetry.infrastructure.isEcs ||
        structuredEnvConfig.telemetry.infrastructure.isKubernetes
          ? "/tmp/profiles"
          : defaultConfig.continuousProfiling.outputDir),
    },
    apiInfo: {
      ...defaultConfig.apiInfo,
      ...structuredEnvConfig.apiInfo,
      cors: {
        ...defaultConfig.apiInfo.cors,
        ...structuredEnvConfig.apiInfo.cors,
      },
    },
  };

  const result = AppConfigSchema.safeParse(mergedConfig);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "root";
        return `  - ${path}: ${issue.message}`;
      })
      .join("\n");

    throw new Error(
      `Invalid configuration after merging:\n${issues}\n\nHelp: Configuration validation failed. Check .env.example for reference and ensure environment-specific values are correct.`
    );
  }

  const requiredVars = [
    { key: "KONG_JWT_AUTHORITY", value: mergedConfig.jwt.authority },
    { key: "KONG_JWT_AUDIENCE", value: mergedConfig.jwt.audience },
    { key: "KONG_ADMIN_URL", value: mergedConfig.kong.adminUrl },
  ];

  if (mergedConfig.kong.mode === "KONNECT") {
    requiredVars.push({ key: "KONG_ADMIN_TOKEN", value: mergedConfig.kong.adminToken });
  }

  const missingVars = requiredVars.filter(({ value }) => !value || value.trim() === "");

  if (missingVars.length > 0) {
    const missing = missingVars.map(({ key }) => key).join(", ");
    throw new Error(
      `Missing required environment variables: ${missing}\n\nHelp: These variables are required for service operation. Check .env.example and ensure all critical configuration is set.`
    );
  }

  const finalConfig: AppConfig = {
    ...result.data,
    telemetry: {
      ...result.data.telemetry,
      enabled: result.data.telemetry.enabled ?? false,
      enableOpenTelemetry: result.data.telemetry.enableOpenTelemetry ?? false,
    },
  };

  return finalConfig;
}
