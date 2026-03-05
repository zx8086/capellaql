/* src/config/defaults.ts */

import pkg from "../../package.json" with { type: "json" };
import type { AppConfig } from "./schemas";

// Type for the telemetry config with required enabled fields
type TelemetryConfigWithEnabled = AppConfig["telemetry"];

// Pillar 1: Default Configuration Object
export const defaultConfig: AppConfig = {
  server: {
    port: 3000,
    nodeEnv: "development",
    maxRequestBodySize: 10 * 1024 * 1024,
    requestTimeoutMs: 30000,
  },
  jwt: {
    authority: "https://api.example.com",
    audience: "example-api",
    issuer: "https://api.example.com",
    keyClaimName: "key",
    expirationMinutes: 15,
  },
  kong: {
    mode: "API_GATEWAY",
    adminUrl: "http://localhost:8001",
    adminToken: "",
    consumerIdHeader: "x-consumer-id",
    consumerUsernameHeader: "x-consumer-username",
    anonymousHeader: "x-anonymous-consumer",
    circuitBreaker: {
      enabled: true,
      timeout: 5000,
      errorThresholdPercentage: 50,
      resetTimeout: 60000,
      rollingCountTimeout: 10000,
      rollingCountBuckets: 10,
      volumeThreshold: 3,
    },
    secretCreationMaxRetries: 3,
    maxHeaderLength: 256,
  },
  caching: {
    highAvailability: false,
    redisUrl: "",
    redisPassword: "",
    redisDb: 0,
    ttlSeconds: 300,
    staleDataToleranceMinutes: 30,
    maxMemoryEntries: 1000,
    healthCheckTtlMs: 2000,
    redisMaxRetries: 3,
    redisConnectionTimeout: 5000,
    resilience: {
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        resetTimeout: 30000,
        successThreshold: 2,
      },
      reconnect: {
        maxAttempts: 5,
        baseDelayMs: 100,
        maxDelayMs: 5000,
        cooldownMs: 60000,
      },
      healthMonitor: {
        enabled: true,
        intervalMs: 10000,
        unhealthyThreshold: 3,
        healthyThreshold: 2,
        pingTimeoutMs: 500,
      },
      operationTimeouts: {
        get: 1000,
        set: 2000,
        delete: 1000,
        scan: 5000,
        ping: 500,
        connect: 5000,
      },
    },
  },
  telemetry: {
    serviceName: "authentication-service",
    serviceVersion: pkg.version,
    environment: "development",
    mode: "both",
    logLevel: "info",
    logsEndpoint: "",
    tracesEndpoint: "",
    metricsEndpoint: "",
    // Memory optimization: 10s timeout prevents buffer accumulation during backpressure
    exportTimeout: 10000,
    // Memory optimization: Smaller batch size reduces protobuf buffer retention
    // At 128 items per batch with 500ms delay, we export 256 items/sec max
    batchSize: 128,
    // Memory optimization: Bounded queue prevents unbounded Uint8Array accumulation
    // At 512 items max and ~64KB per serialized batch, worst case is ~32MB per processor
    // Trade-off: May drop old telemetry during traffic spikes (acceptable for memory safety)
    maxQueueSize: 512,
    enableOpenTelemetry: true,
    enabled: true,
    // Memory optimization: Runtime metrics disabled by default to save ~10% CPU
    // Enable via OTEL_RUNTIME_METRICS_ENABLED=true if event loop delay metrics are needed
    runtimeMetricsEnabled: false,
    // Memory Guardian heap limit for percentage calculations (Bun doesn't expose v8 heap_size_limit)
    // Override if your container has a different memory limit
    memoryGuardianHeapLimitMB: 512,
    infrastructure: {
      isKubernetes: false,
      isEcs: false,
      podName: undefined,
      namespace: undefined,
    },
    circuitBreaker: {
      failureThreshold: 5,
      recoveryTimeout: 60000,
      successThreshold: 3,
      monitoringInterval: 10000,
    },
  } satisfies TelemetryConfigWithEnabled,
  profiling: {
    enabled: false,
  },
  continuousProfiling: {
    enabled: false,
    autoTriggerOnSlaViolation: true,
    slaViolationThrottleMinutes: 60,
    outputDir: "profiles/auto",
    maxConcurrentProfiles: 1,
    slaThresholds: [
      { endpoint: "/tokens", p95: 100, p99: 200 },
      { endpoint: "/tokens/validate", p95: 50, p99: 100 },
      { endpoint: "/health", p95: 400, p99: 500 },
    ],
    rollingBufferSize: 100,
  },
  apiInfo: {
    title: "Authentication Service API",
    description:
      "High-performance authentication service with Kong integration, OpenTelemetry observability, and comprehensive health monitoring",
    version: pkg.version,
    contactName: "Simon Owusu",
    contactEmail: "simonowusu@pvh.com",
    licenseName: "Proprietary",
    licenseIdentifier: "UNLICENSED",
    cors: {
      origin: "*",
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "Accept-Version",
        "X-Consumer-Id",
        "X-Consumer-Username",
        "X-Anonymous-Consumer",
      ],
      allowMethods: ["GET", "POST", "OPTIONS"],
      maxAge: 86400,
    },
    versioning: {
      defaultVersion: "v1",
      supportedVersions: ["v1", "v2"],
      // Example deprecation config (commented out - no versions deprecated by default):
      // deprecation: {
      //   v1: {
      //     sunsetDate: "2025-12-31T23:59:59Z",
      //     migrationUrl: "https://docs.example.com/api/v2-migration",
      //     message: "v1 API is deprecated. Please migrate to v2.",
      //   },
      // },
    },
  },
};
