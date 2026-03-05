/* src/config/schemas.ts */

import { z } from "zod";
import type { OpossumCircuitBreakerStats } from "../types/circuit-breaker.types";

export const ConsumerSecretSchema = z.strictObject({
  id: z.string(),
  key: z.string(),
  secret: z.string(),
  consumer: z.strictObject({
    id: z.string(),
  }),
});

export const ConsumerResponseSchema = z.strictObject({
  data: z.array(ConsumerSecretSchema),
  total: z.number(),
});

export const ConsumerSchema = z.strictObject({
  id: z.string(),
  username: z.string(),
  custom_id: z.string().optional(),
  tags: z.array(z.string()).optional(),
  created_at: z.number(),
});

// Kong Konnect specific schemas for consumer resolution
export const KongKonnectConsumerSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    custom_id: z.string().optional().nullable(),
    created_at: z.number().optional(),
    updated_at: z.number().optional(),
    tags: z.array(z.string()).optional().nullable(),
  })
  .passthrough(); // Allow extra fields from Kong Konnect API

export const KongKonnectConsumerSearchResultSchema = z
  .object({
    data: z.array(KongKonnectConsumerSchema).optional(),
    total: z.number().optional(),
    next: z.string().optional().nullable(),
    offset: z.string().optional().nullable(),
  })
  .passthrough(); // Allow extra pagination fields

// Partial/lenient consumer secret schema for validation with passthrough
export const ConsumerSecretLenientSchema = z
  .object({
    id: z.string(),
    key: z.string(),
    secret: z.string(),
    consumer: z
      .object({
        id: z.string(),
      })
      .passthrough(),
    created_at: z.number().optional(),
    tags: z.array(z.string()).optional().nullable(),
  })
  .passthrough();

// Lenient consumer response for external API validation
export const ConsumerResponseLenientSchema = z
  .object({
    data: z.array(ConsumerSecretLenientSchema).optional(),
    total: z.number().optional(),
    next: z.string().optional().nullable(),
    offset: z.string().optional().nullable(),
  })
  .passthrough();

export const KongHealthCheckResultSchema = z.strictObject({
  healthy: z.boolean(),
  responseTime: z.number(),
  error: z.string().optional(),
});

export const TokenResponseSchema = z.strictObject({
  access_token: z.string(),
  expires_in: z.number(),
});

export const JWTPayloadSchema = z.strictObject({
  sub: z.string(),
  key: z.string(),
  jti: z.string(),
  iat: z.number(),
  nbf: z.number(), // Not Before - backward compatibility with .NET format
  exp: z.number(),
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]), // RFC 7519 compliant: string for single, array for multiple
  name: z.string(),
  unique_name: z.string(),
});

// Lenient JWT payload schema for validation with passthrough (allows extra claims)
export const JWTPayloadLenientSchema = z
  .object({
    sub: z.string(),
    key: z.string().optional(),
    jti: z.string().optional(),
    iat: z.number().optional(),
    nbf: z.number().optional(),
    exp: z.number().optional(),
    iss: z.string().optional(),
    aud: z.union([z.string(), z.array(z.string())]).optional(),
    name: z.string().optional(),
    unique_name: z.string().optional(),
  })
  .passthrough();

export const RouteDefinitionSchema = z.strictObject({
  path: z.string(),
  method: z.string(),
  summary: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  requiresAuth: z.boolean().optional(),
  parameters: z.any().optional(),
  requestBody: z.any().optional(),
  responses: z.any().optional(),
});

export const EnvironmentType = z.enum(["local", "development", "staging", "production", "test"]);
export const TelemetryMode = z.enum(["console", "otlp", "both"]);
export const KongMode = z.enum(["API_GATEWAY", "KONNECT"]);

export const PrimaryCacheStatsSchema = z.strictObject({
  entries: z.number(),
  activeEntries: z.number(),
  keys: z.array(z.string()).optional(),
});

export const StaleCacheStatsSchema = z.strictObject({
  entries: z.number(),
  keys: z.array(z.string()).optional(),
});

export const KongCacheStatsSchema = z.strictObject({
  strategy: z.enum(["local-memory", "shared-redis"]),
  primary: PrimaryCacheStatsSchema,
  stale: StaleCacheStatsSchema,
  // Backward compatibility fields (duplicated from primary for existing code/tests)
  size: z.number(), // primary.entries count for backward compatibility
  activeEntries: z.number(), // primary.activeEntries alias
  hitRate: z.string(),
  memoryUsageMB: z.number().optional(),
  redisConnected: z.boolean().optional(),
  averageLatencyMs: z.number(),
  serverType: z.enum(["redis", "valkey"]).optional(),
});

export const CacheEntrySchema = z.strictObject({
  data: ConsumerSecretSchema,
  expires: z.number(),
  createdAt: z.number(),
});

export const GenericCacheEntrySchema = <T>(dataSchema: z.ZodSchema<T>) =>
  z.strictObject({
    data: dataSchema,
    expires: z.number(),
    createdAt: z.number(),
  });

// Cache circuit breaker configuration (separate from Kong circuit breaker)
export const CacheCircuitBreakerConfigSchema = z.strictObject({
  enabled: z.boolean().describe("Enable cache circuit breaker"),
  failureThreshold: z
    .number()
    .int()
    .min(1)
    .max(20)
    .describe("Number of failures before circuit opens"),
  resetTimeout: z
    .number()
    .int()
    .min(5000)
    .max(300000)
    .describe("Time in ms before attempting recovery"),
  successThreshold: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe("Successes in half-open to close circuit"),
});

// Cache reconnection configuration
export const CacheReconnectConfigSchema = z.strictObject({
  maxAttempts: z
    .number()
    .int()
    .min(1)
    .max(20)
    .describe("Maximum reconnection attempts before giving up"),
  baseDelayMs: z.number().int().min(50).max(5000).describe("Base delay for exponential backoff"),
  maxDelayMs: z.number().int().min(1000).max(60000).describe("Maximum delay cap for backoff"),
  cooldownMs: z
    .number()
    .int()
    .min(10000)
    .max(600000)
    .describe("Time after which attempt counter resets"),
});

// Cache health monitor configuration
export const CacheHealthMonitorConfigSchema = z.strictObject({
  enabled: z.boolean().describe("Enable background health monitoring"),
  intervalMs: z.number().int().min(1000).max(60000).describe("Interval between health checks"),
  unhealthyThreshold: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe("Consecutive failures before marking unhealthy"),
  healthyThreshold: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe("Consecutive successes before marking healthy"),
  pingTimeoutMs: z.number().int().min(100).max(5000).describe("Timeout for PING command"),
});

// Cache operation timeout configuration
export const CacheOperationTimeoutsSchema = z.strictObject({
  get: z.number().int().min(100).max(10000).describe("Timeout for GET operations"),
  set: z.number().int().min(100).max(10000).describe("Timeout for SET operations"),
  delete: z.number().int().min(100).max(10000).describe("Timeout for DELETE operations"),
  scan: z.number().int().min(1000).max(30000).describe("Timeout for SCAN iterations"),
  ping: z.number().int().min(100).max(5000).describe("Timeout for PING health check"),
  connect: z.number().int().min(1000).max(30000).describe("Timeout for connection attempts"),
});

// Cache resilience configuration (combines all resilience settings)
export const CacheResilienceConfigSchema = z.strictObject({
  circuitBreaker: CacheCircuitBreakerConfigSchema,
  reconnect: CacheReconnectConfigSchema,
  healthMonitor: CacheHealthMonitorConfigSchema,
  operationTimeouts: CacheOperationTimeoutsSchema,
});

export const CachingConfigSchema = z.strictObject({
  highAvailability: z.boolean(),
  redisUrl: z.string().optional(),
  redisPassword: z.string().optional(),
  redisDb: z.number().int().min(0).max(15),
  ttlSeconds: z.number().int().min(60).max(3600),
  staleDataToleranceMinutes: z
    .number()
    .int()
    .min(5)
    .max(240)
    .describe("Tolerance for serving stale cache data in minutes"),
  maxMemoryEntries: z
    .number()
    .int()
    .min(100)
    .max(100000)
    .describe("Maximum entries in in-memory stale cache before LRU eviction"),
  healthCheckTtlMs: z.number().int().min(100).max(60000),
  redisMaxRetries: z.number().int().min(1).max(10),
  redisConnectionTimeout: z.number().int().min(1000).max(30000),
  resilience: CacheResilienceConfigSchema.optional().describe("Cache resilience configuration"),
});

export const OperationCircuitBreakerConfigSchema = z.strictObject({
  timeout: z
    .number()
    .int()
    .min(100)
    .max(10000)
    .describe("Request timeout in milliseconds")
    .optional(),
  errorThresholdPercentage: z
    .number()
    .min(1)
    .max(100)
    .describe("Failure rate threshold percentage")
    .optional(),
  resetTimeout: z
    .number()
    .int()
    .min(1000)
    .max(300000)
    .describe("Circuit reset timeout in milliseconds")
    .optional(),
  rollingCountTimeout: z
    .number()
    .int()
    .min(1000)
    .max(60000)
    .describe("Rolling window duration in milliseconds")
    .optional(),
  rollingCountBuckets: z
    .number()
    .int()
    .min(2)
    .max(50)
    .describe("Number of buckets for rolling window")
    .optional(),
  volumeThreshold: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .describe("Minimum requests before circuit can trip")
    .optional(),
  fallbackStrategy: z.enum(["cache", "graceful_degradation", "deny"]).optional(),
});

export const CircuitBreakerConfigSchema = z.strictObject({
  enabled: z.boolean().describe("Enable circuit breaker protection"),
  timeout: z.number().int().min(100).max(10000).describe("Request timeout in milliseconds"),
  errorThresholdPercentage: z
    .number()
    .min(1)
    .max(100)
    .describe("Failure rate threshold percentage"),
  resetTimeout: z
    .number()
    .int()
    .min(1000)
    .max(300000)
    .describe("Circuit reset timeout in milliseconds"),
  rollingCountTimeout: z
    .number()
    .int()
    .min(1000)
    .max(60000)
    .describe("Rolling window duration in milliseconds"),
  rollingCountBuckets: z
    .number()
    .int()
    .min(2)
    .max(50)
    .describe("Number of buckets for rolling window"),
  volumeThreshold: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .describe("Minimum requests before circuit can trip"),
  operations: z
    .record(z.string(), OperationCircuitBreakerConfigSchema)
    .optional()
    .describe("Per-operation circuit breaker overrides"),
});

export function addProductionSecurityValidation<
  T extends { environment?: string; nodeEnv?: string },
>(
  data: T,
  ctx: z.RefinementCtx,
  options: {
    serviceName?: string;
    serviceVersion?: string;
    adminUrl?: string;
    adminToken?: string;
    endpoints?: Array<{ path: string[]; value?: string }>;
  } = {}
) {
  const isProduction = data.environment === "production" || data.nodeEnv === "production";

  if (!isProduction) return;

  if (options.serviceName) {
    if (options.serviceName.includes("localhost") || options.serviceName.includes("test")) {
      ctx.addIssue({
        code: "custom",
        message: "Production service name cannot contain localhost or test references",
        path: ["serviceName"],
      });
      return;
    }
  }

  if (options.serviceVersion) {
    if (options.serviceVersion === "dev" || options.serviceVersion === "latest") {
      ctx.addIssue({
        code: "custom",
        message: "Production requires specific version, not dev or latest",
        path: ["serviceVersion"],
      });
      return;
    }
  }

  // OTLP endpoints validation removed - collectors often use HTTP in internal/k8s environments

  if (options.adminUrl) {
    if (options.adminUrl.includes("localhost")) {
      ctx.addIssue({
        code: "custom",
        message: "Kong Admin URL cannot use localhost in production",
        path: ["kong", "adminUrl"],
      });
      return;
    }
  }

  if (options.adminToken) {
    if (options.adminToken === "test" || options.adminToken.length < 32) {
      ctx.addIssue({
        code: "custom",
        message: "Production Kong admin token must be secure (32+ characters)",
        path: ["kong", "adminToken"],
      });
      return;
    }
  }
}

export const HttpsUrl = z.url();
export const EmailAddress = z.email();
export const PositiveInt = z.int32().min(1);
export const PortNumber = z.int32().min(1).max(65535);
export const NonEmptyString = z.string().min(1);

export const ServerConfigSchema = z.strictObject({
  port: PortNumber,
  nodeEnv: NonEmptyString,
  maxRequestBodySize: z
    .number()
    .int()
    .min(1024)
    .max(100 * 1024 * 1024),
  requestTimeoutMs: z.number().int().min(1000).max(300000),
});

export const JwtConfigSchema = z.strictObject({
  authority: NonEmptyString,
  audience: NonEmptyString,
  issuer: NonEmptyString.optional(),
  keyClaimName: NonEmptyString,
  expirationMinutes: PositiveInt,
});

export const KongConfigSchema = z
  .strictObject({
    mode: KongMode,
    adminUrl: HttpsUrl,
    adminToken: z.string(),
    consumerIdHeader: NonEmptyString,
    consumerUsernameHeader: NonEmptyString,
    anonymousHeader: NonEmptyString,
    circuitBreaker: CircuitBreakerConfigSchema,
    highAvailability: z.boolean().optional(),
    secretCreationMaxRetries: z.number().int().min(1).max(10),
    maxHeaderLength: z.number().int().min(64).max(8192),
  })
  .refine(
    (data) => {
      // KONNECT mode requires non-empty admin token
      if (data.mode === "KONNECT" && (!data.adminToken || data.adminToken.length === 0)) {
        return false;
      }
      // API_GATEWAY mode allows empty admin token
      return true;
    },
    {
      message: "KONG_ADMIN_TOKEN is required for KONNECT mode but optional for API_GATEWAY mode",
      path: ["adminToken"],
    }
  );

export const ProfilingConfigSchema = z.strictObject({
  enabled: z.boolean().describe("Enable profiling service"),
});

export const SlaThresholdSchema = z.strictObject({
  endpoint: z.string().describe("Endpoint path (e.g., '/tokens', '/health')"),
  p95: z.number().min(1).max(5000).describe("P95 latency threshold in milliseconds"),
  p99: z.number().min(1).max(10000).describe("P99 latency threshold in milliseconds"),
});

export const ContinuousProfilingConfigSchema = z.strictObject({
  enabled: z.boolean().default(false).describe("Enable continuous profiling"),
  autoTriggerOnSlaViolation: z
    .boolean()
    .default(true)
    .describe("Automatically trigger profiling on SLA violations"),
  slaViolationThrottleMinutes: z
    .number()
    .int()
    .min(1)
    .max(1440)
    .default(60)
    .describe("Minimum minutes between auto-triggered profiles per endpoint"),
  outputDir: z
    .string()
    .default("profiles/auto")
    .describe("Directory for automatically generated profiles"),
  maxConcurrentProfiles: z
    .number()
    .int()
    .min(1)
    .max(5)
    .default(1)
    .describe("Maximum concurrent profiling sessions"),
  slaThresholds: z
    .array(SlaThresholdSchema)
    .default([
      { endpoint: "/tokens", p95: 100, p99: 200 },
      { endpoint: "/tokens/validate", p95: 50, p99: 100 },
      { endpoint: "/health", p95: 400, p99: 500 },
    ])
    .describe("SLA thresholds per endpoint"),
  rollingBufferSize: z
    .number()
    .int()
    .min(10)
    .max(1000)
    .default(100)
    .describe("Number of requests to track for P95/P99 calculation"),
});

export const VersionDeprecationConfigSchema = z.strictObject({
  sunsetDate: z.string().describe("ISO 8601 date when the API version will be retired"),
  migrationUrl: z.string().optional().describe("URL to migration documentation"),
  message: z.string().optional().describe("Additional deprecation message"),
});

export const ApiVersioningConfigSchema = z.strictObject({
  defaultVersion: z.enum(["v1", "v2"]).default("v1").describe("Default API version"),
  supportedVersions: z
    .array(z.enum(["v1", "v2"]))
    .default(["v1", "v2"])
    .describe("Supported API versions"),
  deprecation: z
    .record(z.enum(["v1", "v2"]), VersionDeprecationConfigSchema)
    .optional()
    .describe("Version-specific deprecation configurations"),
});

export const CorsConfigSchema = z.strictObject({
  origin: NonEmptyString.describe("CORS origin (* or specific URL)"),
  allowHeaders: z.array(NonEmptyString).describe("Allowed request headers"),
  allowMethods: z.array(NonEmptyString).describe("Allowed HTTP methods"),
  maxAge: z.number().int().min(0).max(86400).describe("Preflight cache duration in seconds"),
});

export const ApiInfoConfigSchema = z.strictObject({
  title: NonEmptyString.describe("API title"),
  description: NonEmptyString.describe("API description"),
  version: NonEmptyString.describe("API version"),
  contactName: NonEmptyString.describe("Contact name"),
  contactEmail: EmailAddress.describe("Contact email"),
  licenseName: NonEmptyString.describe("License name"),
  licenseIdentifier: NonEmptyString.describe("License identifier"),
  cors: CorsConfigSchema.describe("CORS configuration"),
  versioning: ApiVersioningConfigSchema.optional().describe("API versioning configuration"),
});

export const TelemetryConfigSchema = z
  .strictObject({
    serviceName: NonEmptyString.describe("Service identifier for telemetry"),
    serviceVersion: NonEmptyString.describe("Service version for telemetry"),
    environment: EnvironmentType.describe("Deployment environment"),
    mode: TelemetryMode,
    logLevel: z.enum(["error", "warn", "info", "debug", "silent"]).describe("Winston log level"),
    endpoint: HttpsUrl.optional(),
    logsEndpoint: HttpsUrl.optional(),
    tracesEndpoint: HttpsUrl.optional(),
    metricsEndpoint: HttpsUrl.optional(),
    exportTimeout: z.int32().min(1000).max(60000),
    batchSize: z.int32().min(1).max(5000),
    maxQueueSize: z.int32().min(1).max(50000),
    enabled: z.boolean().optional(),
    enableOpenTelemetry: z.boolean().optional(),
    runtimeMetricsEnabled: z
      .boolean()
      .optional()
      .describe(
        "Enable runtime metrics instrumentation (event loop, memory). Disabled by default to save ~10% CPU."
      ),
    memoryGuardianHeapLimitMB: z
      .number()
      .int()
      .min(64)
      .max(32768)
      .optional()
      .describe(
        "Heap limit in MB for memory pressure calculations. Bun doesn't expose v8 heap_size_limit."
      ),
    infrastructure: z.object({
      isKubernetes: z.boolean(),
      isEcs: z.boolean(),
      podName: z.string().optional(),
      namespace: z.string().optional(),
    }),
    circuitBreaker: z.strictObject({
      failureThreshold: z.number().int().min(1).max(100),
      recoveryTimeout: z.number().int().min(1000).max(600000),
      successThreshold: z.number().int().min(1).max(20),
      monitoringInterval: z.number().int().min(1000).max(60000),
    }),
  })
  .superRefine((data, ctx) => {
    addProductionSecurityValidation(data, ctx, {
      serviceName: data.serviceName,
      serviceVersion: data.serviceVersion,
    });
  });

export const AppConfigSchema = z
  .strictObject({
    server: ServerConfigSchema,
    jwt: JwtConfigSchema,
    kong: KongConfigSchema,
    caching: CachingConfigSchema,
    telemetry: TelemetryConfigSchema,
    profiling: ProfilingConfigSchema,
    continuousProfiling: ContinuousProfilingConfigSchema,
    apiInfo: ApiInfoConfigSchema,
  })
  .superRefine((data, ctx) => {
    addProductionSecurityValidation({ nodeEnv: data.server.nodeEnv }, ctx, {
      adminUrl: data.kong.adminUrl,
      adminToken: data.kong.adminToken,
    });
  });

export const SchemaRegistry = {
  Server: ServerConfigSchema,
  Jwt: JwtConfigSchema,
  Kong: KongConfigSchema,
  Caching: CachingConfigSchema,
  CacheCircuitBreaker: CacheCircuitBreakerConfigSchema,
  CacheReconnect: CacheReconnectConfigSchema,
  CacheHealthMonitor: CacheHealthMonitorConfigSchema,
  CacheOperationTimeouts: CacheOperationTimeoutsSchema,
  CacheResilience: CacheResilienceConfigSchema,
  CircuitBreaker: CircuitBreakerConfigSchema,
  OperationCircuitBreaker: OperationCircuitBreakerConfigSchema,
  Telemetry: TelemetryConfigSchema,
  Profiling: ProfilingConfigSchema,
  ContinuousProfiling: ContinuousProfilingConfigSchema,
  SlaThreshold: SlaThresholdSchema,
  Cors: CorsConfigSchema,
  ApiInfo: ApiInfoConfigSchema,
  ApiVersioning: ApiVersioningConfigSchema,
  VersionDeprecation: VersionDeprecationConfigSchema,
  AppConfig: AppConfigSchema,
  ConsumerSecret: ConsumerSecretSchema,
  ConsumerSecretLenient: ConsumerSecretLenientSchema,
  ConsumerResponse: ConsumerResponseSchema,
  ConsumerResponseLenient: ConsumerResponseLenientSchema,
  Consumer: ConsumerSchema,
  KongKonnectConsumer: KongKonnectConsumerSchema,
  KongKonnectConsumerSearchResult: KongKonnectConsumerSearchResultSchema,
  KongHealthCheckResult: KongHealthCheckResultSchema,
  KongCacheStats: KongCacheStatsSchema,
  CacheEntry: CacheEntrySchema,
  TokenResponse: TokenResponseSchema,
  JWTPayload: JWTPayloadSchema,
  JWTPayloadLenient: JWTPayloadLenientSchema,
  RouteDefinition: RouteDefinitionSchema,
} as const;

export type ConsumerSecret = z.infer<typeof ConsumerSecretSchema>;
export type ConsumerSecretLenient = z.infer<typeof ConsumerSecretLenientSchema>;
export type ConsumerResponse = z.infer<typeof ConsumerResponseSchema>;
export type ConsumerResponseLenient = z.infer<typeof ConsumerResponseLenientSchema>;
export type Consumer = z.infer<typeof ConsumerSchema>;
export type KongKonnectConsumer = z.infer<typeof KongKonnectConsumerSchema>;
export type KongKonnectConsumerSearchResult = z.infer<typeof KongKonnectConsumerSearchResultSchema>;
export type KongHealthCheckResult = z.infer<typeof KongHealthCheckResultSchema>;
export type TokenResponse = z.infer<typeof TokenResponseSchema>;
export type JWTPayload = z.infer<typeof JWTPayloadSchema>;
export type JWTPayloadLenient = z.infer<typeof JWTPayloadLenientSchema>;
export type RouteDefinition = z.infer<typeof RouteDefinitionSchema>;
export type KongModeType = "API_GATEWAY" | "KONNECT";
export type KongCacheStats = z.infer<typeof KongCacheStatsSchema>;
export type CacheEntry = z.infer<typeof CacheEntrySchema>;

export interface GenericCacheEntry<T> {
  data: T;
  expires: number;
  createdAt: number;
}
export type CachingConfig = z.infer<typeof CachingConfigSchema>;
export type CacheCircuitBreakerConfig = z.infer<typeof CacheCircuitBreakerConfigSchema>;
export type CacheReconnectConfig = z.infer<typeof CacheReconnectConfigSchema>;
export type CacheHealthMonitorConfig = z.infer<typeof CacheHealthMonitorConfigSchema>;
export type CacheOperationTimeoutsConfig = z.infer<typeof CacheOperationTimeoutsSchema>;
export type CacheResilienceConfig = z.infer<typeof CacheResilienceConfigSchema>;
export type CircuitBreakerConfig = z.infer<typeof CircuitBreakerConfigSchema>;
export type OperationCircuitBreakerConfig = z.infer<typeof OperationCircuitBreakerConfigSchema>;
export type ProfilingConfig = z.infer<typeof ProfilingConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema> & {
  telemetry: z.infer<typeof TelemetryConfigSchema> & {
    enabled: boolean;
    enableOpenTelemetry: boolean;
  };
};
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type JwtConfig = z.infer<typeof JwtConfigSchema>;
export type KongConfig = z.infer<typeof KongConfigSchema>;
export type TelemetryConfig = z.infer<typeof TelemetryConfigSchema>;
export type ApiInfoConfig = z.infer<typeof ApiInfoConfigSchema>;
export type SlaThreshold = z.infer<typeof SlaThresholdSchema>;
export type ContinuousProfilingConfig = z.infer<typeof ContinuousProfilingConfigSchema>;
export type VersionDeprecationConfig = z.infer<typeof VersionDeprecationConfigSchema>;
export type ApiVersioningConfig = z.infer<typeof ApiVersioningConfigSchema>;
export type CorsConfig = z.infer<typeof CorsConfigSchema>;

export interface IKongService {
  getConsumerSecret(consumerId: string): Promise<ConsumerSecret | null>;
  createConsumerSecret(consumerId: string): Promise<ConsumerSecret | null>;
  clearCache(consumerId?: string): Promise<void>;
  getCacheStats(): Promise<KongCacheStats>;
  healthCheck(): Promise<KongHealthCheckResult>;
  getCircuitBreakerStats(): Record<string, OpossumCircuitBreakerStats>;
}

export interface IKongCacheService {
  get(key: string): Promise<ConsumerSecret | null>;
  set(key: string, value: ConsumerSecret, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  getStats(): Promise<KongCacheStats>;
  connect?(): Promise<void>;
  disconnect?(): Promise<void>;
  getStale?(key: string): Promise<ConsumerSecret | null>;
  setStale?(key: string, value: ConsumerSecret, ttlSeconds?: number): Promise<void>;
  clearStale?(): Promise<void>;
}

export type { OtlpEndpointConfig, OtlpEndpoints } from "./helpers";
export {
  createOtlpConfig,
  deriveAllOtlpEndpoints,
  deriveOtlpEndpoint,
  OTLP_STANDARD_PATHS,
  validateOtlpEndpoints,
} from "./helpers";
