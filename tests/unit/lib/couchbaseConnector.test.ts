/* tests/unit/lib/couchbaseConnector.test.ts - Test Couchbase connection logic */

import { beforeEach, describe, expect, mock, test } from "bun:test";

// Mock ping and diagnostics results for health testing
const createMockPingResult = (serviceStates: {
  kv?: string;
  query?: string;
  analytics?: string;
  search?: string;
}) => ({
  services: {
    kv: serviceStates.kv ? [{ state: serviceStates.kv }] : [],
    query: serviceStates.query ? [{ state: serviceStates.query }] : [],
    analytics: serviceStates.analytics ? [{ state: serviceStates.analytics }] : [],
    search: serviceStates.search ? [{ state: serviceStates.search }] : [],
  },
});

const createMockDiagnosticsResult = () => ({
  state: "online",
  services: {},
});

// Mock the couchbase module
const mockPing = mock(() => Promise.resolve(createMockPingResult({ kv: "ok", query: "ok" })));
const mockDiagnostics = mock(() => Promise.resolve(createMockDiagnosticsResult()));

const mockConnect = mock(() =>
  Promise.resolve({
    bucket: mock(() => ({
      scope: mock(() => ({
        collection: mock(() => ({})),
      })),
    })),
    ping: mockPing,
    diagnostics: mockDiagnostics,
  })
);

const mockDocumentNotFoundError = class extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentNotFoundError";
  }
};

const mockCouchbaseError = class extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CouchbaseError";
  }
};

mock.module("couchbase", () => ({
  connect: mockConnect,
  DocumentNotFoundError: mockDocumentNotFoundError,
  CouchbaseError: mockCouchbaseError,
}));

// Shared mock config values
const mockCapellaConfig = {
  COUCHBASE_URL: "couchbase://test",
  COUCHBASE_USERNAME: "testuser",
  COUCHBASE_PASSWORD: "testpass",
  COUCHBASE_BUCKET: "testbucket",
  COUCHBASE_SCOPE: "testscope",
  COUCHBASE_COLLECTION: "testcollection",
  COUCHBASE_KV_TIMEOUT: 5000,
  COUCHBASE_KV_DURABLE_TIMEOUT: 10000,
  COUCHBASE_QUERY_TIMEOUT: 15000,
  COUCHBASE_ANALYTICS_TIMEOUT: 30000,
  COUCHBASE_SEARCH_TIMEOUT: 15000,
  COUCHBASE_CONNECT_TIMEOUT: 10000,
  COUCHBASE_BOOTSTRAP_TIMEOUT: 15000,
};

const mockTelemetryConfig = {
  CIRCUIT_BREAKER_THRESHOLD: 3,
  CIRCUIT_BREAKER_TIMEOUT_MS: 60000,
  OTEL_ENABLED: false,
  LOG_LEVEL: "info",
  BATCH_SIZE: 100,
  BATCH_INTERVAL_MS: 5000,
  MEMORY_PRESSURE_THRESHOLD_MB: 100,
  OTEL_TRACE_SAMPLING: 1,
  OTEL_ENDPOINT: "",
  OTEL_METRICS_ENDPOINT: "",
  OTEL_LOGS_ENDPOINT: "",
};

const mockApplicationConfig = {
  PORT: 4000,
  HOST: "localhost",
  NODE_ENV: "test",
  LOG_LEVEL: "info",
};

const mockRuntimeConfig = {
  MAX_POOL_SIZE: 10,
};

const mockDeploymentConfig = {
  DEPLOYMENT_ENV: "test",
};

const mockFullConfig = {
  capella: mockCapellaConfig,
  telemetry: mockTelemetryConfig,
  application: mockApplicationConfig,
  runtime: mockRuntimeConfig,
  deployment: mockDeploymentConfig,
};

// Mock the config
mock.module("$config", () => ({
  default: mockFullConfig,
  config: mockFullConfig,
  loadConfig: () => mockFullConfig,
  telemetryConfig: mockTelemetryConfig,
  applicationConfig: mockApplicationConfig,
  capellaConfig: mockCapellaConfig,
  runtimeConfig: mockRuntimeConfig,
  deploymentConfig: mockDeploymentConfig,
  getApplicationConfig: () => mockApplicationConfig,
  getCapellaConfig: () => mockCapellaConfig,
  getTelemetryConfig: () => mockTelemetryConfig,
  getRuntimeConfig: () => mockRuntimeConfig,
  getDeploymentConfig: () => mockDeploymentConfig,
  isProduction: () => false,
  getEnvironment: () => "test",
  getDeploymentEnvironment: () => "test",
  resetConfigCache: () => {},
  validateConfigurationHealth: () => ({ status: "healthy", issues: [] }),
  configMetadata: { version: "1.0.0" },
  getConfigSection: (section: string) => mockFullConfig[section as keyof typeof mockFullConfig],
  TelemetryConfig: {},
  ApplicationConfig: {},
  CapellaConfig: {},
}));

// Mock telemetry logger
mock.module("../telemetry/logger", () => ({
  log: mock(() => {}),
  err: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
}));

// Mock couchbaseMetrics
mock.module("$lib/couchbaseMetrics", () => ({
  getPerformanceStats: mock(() => ({
    averageQueryTime: 50,
    errorRate: 0,
    documentsPerSecond: 100,
  })),
}));

// Circuit breaker state for testing
let mockCircuitBreakerState = {
  state: "closed",
  failures: 0,
  successes: 10,
};

// Mock bunUtils with controllable circuit breaker
mock.module("$utils/bunUtils", () => ({
  retryWithBackoff: mock(async (operation: () => Promise<any>) => {
    return await operation();
  }),
  CircuitBreaker: class MockCircuitBreaker {
    constructor() {}
    async execute(operation: () => Promise<any>) {
      return await operation();
    }
    getStats() {
      return mockCircuitBreakerState;
    }
  },
  BunPerf: {
    measure: mock(async (label: string, fn: () => Promise<any>) => {
      return await fn();
    }),
    createTimer: mock(() => ({
      stop: mock(() => 0),
    })),
    benchmark: mock(async () => ({
      averageMs: 0,
      totalMs: 0,
      iterations: 1,
    })),
  },
  BunFile: {
    read: mock(() => Promise.resolve("")),
    write: mock(() => Promise.resolve()),
    exists: mock(() => Promise.resolve(false)),
    size: mock(() => Promise.resolve(0)),
    stream: mock(() => new ReadableStream()),
    readJSON: mock(() => Promise.resolve({})),
    writeJSON: mock(() => Promise.resolve()),
  },
  sleep: mock(() => Promise.resolve()),
  BunProcess: {
    spawn: mock(() => Promise.resolve({ exitCode: 0, stdout: "", stderr: "" })),
  },
  BunEnv: {
    get: mock(() => undefined),
    isBun: mock(() => true),
    getRuntimeInfo: mock(() => ({})),
  },
  BunGlob: {
    scan: mock(() => Promise.resolve([])),
    match: mock(() => false),
    isAvailable: mock(() => true),
  },
  BunCompare: {
    deepEquals: mock(() => false),
    strictDeepEquals: mock(() => false),
    isAvailable: mock(() => true),
  },
  createHealthcheck: mock(() => Promise.resolve({ status: "healthy" })),
}));

describe("CouchbaseConnector", () => {
  beforeEach(() => {
    // Reset all mocks before each test
    mockConnect.mockClear();
    mockPing.mockClear();
    mockDiagnostics.mockClear();

    // Reset circuit breaker state
    mockCircuitBreakerState = {
      state: "closed",
      failures: 0,
      successes: 10,
    };

    // Reset ping to default healthy state
    mockPing.mockImplementation(() =>
      Promise.resolve(createMockPingResult({ kv: "ok", query: "ok" }))
    );
  });

  test("should establish connection successfully", async () => {
    // Import after mocking
    const { clusterConn } = await import("../../../src/lib/couchbaseConnector");

    const connection = await clusterConn();

    expect(connection).toBeDefined();
    expect(connection.cluster).toBeDefined();
    expect(connection.defaultBucket).toBeDefined();
    expect(connection.defaultScope).toBeDefined();
    expect(connection.defaultCollection).toBeDefined();
    expect(typeof connection.bucket).toBe("function");
    expect(typeof connection.scope).toBe("function");
    expect(typeof connection.collection).toBe("function");
    expect(connection.errors).toBeDefined();
    expect(connection.errors.DocumentNotFoundError).toBe(mockDocumentNotFoundError);
    expect(connection.errors.CouchbaseError).toBe(mockCouchbaseError);
  });

  test("should handle connection failure", async () => {
    // Make connect fail
    mockConnect.mockImplementationOnce(() => Promise.reject(new Error("Connection failed")));

    const { clusterConn } = await import("../../../src/lib/couchbaseConnector");

    await expect(clusterConn()).rejects.toThrow("Connection failed");
  });

  test("should use correct connection parameters", async () => {
    const { clusterConn } = await import("../../../src/lib/couchbaseConnector");

    await clusterConn();

    expect(mockConnect).toHaveBeenCalledWith("couchbase://test", {
      username: "testuser",
      password: "testpass",
      timeouts: {
        kvTimeout: 5000,
        kvDurableTimeout: 10000,
        queryTimeout: 15000,
        analyticsTimeout: 30000,
        searchTimeout: 15000,
        connectTimeout: 10000,
        bootstrapTimeout: 15000,
      },
    });
  });

  test("should provide factory methods for bucket/scope/collection access", async () => {
    const { clusterConn } = await import("../../../src/lib/couchbaseConnector");

    const connection = await clusterConn();

    // Test factory methods exist and are functions
    expect(typeof connection.bucket).toBe("function");
    expect(typeof connection.scope).toBe("function");
    expect(typeof connection.collection).toBe("function");

    // Test that calling factory methods doesn't throw
    expect(() => connection.bucket("test")).not.toThrow();
    expect(() => connection.scope("bucket", "scope")).not.toThrow();
    expect(() => connection.collection("bucket", "scope", "collection")).not.toThrow();
  });
});

describe("getCouchbaseHealth", () => {
  beforeEach(() => {
    mockConnect.mockClear();
    mockPing.mockClear();
    mockDiagnostics.mockClear();

    // Reset circuit breaker state
    mockCircuitBreakerState = {
      state: "closed",
      failures: 0,
      successes: 10,
    };

    // Reset ping to default healthy state
    mockPing.mockImplementation(() =>
      Promise.resolve(createMockPingResult({ kv: "ok", query: "ok" }))
    );
  });

  test("returns healthy status when all services are OK", async () => {
    mockPing.mockImplementation(() =>
      Promise.resolve(
        createMockPingResult({ kv: "ok", query: "ok", analytics: "ok", search: "ok" })
      )
    );

    const { getCouchbaseHealth } = await import("../../../src/lib/couchbaseConnector");
    const health = await getCouchbaseHealth();

    expect(health.status).toBe("healthy");
    expect(health.details.connection).toBe("connected");
    expect(health.details.serviceHealth.kv.healthy).toBe(true);
    expect(health.details.serviceHealth.query.healthy).toBe(true);
  });

  test("returns degraded status when circuit breaker has failures", async () => {
    mockCircuitBreakerState = {
      state: "closed",
      failures: 2,
      successes: 10,
    };

    const { getCouchbaseHealth } = await import("../../../src/lib/couchbaseConnector");
    const health = await getCouchbaseHealth();

    expect(health.status).toBe("degraded");
    expect(health.details.warnings).toBeDefined();
    expect(health.details.warnings?.some((w) => w.includes("failures"))).toBe(true);
  });

  test("returns unhealthy status when KV service is unhealthy", async () => {
    mockPing.mockImplementation(() =>
      Promise.resolve(createMockPingResult({ kv: "error", query: "ok" }))
    );

    const { getCouchbaseHealth } = await import("../../../src/lib/couchbaseConnector");
    const health = await getCouchbaseHealth();

    expect(health.status).toBe("unhealthy");
    expect(health.details.serviceHealth.kv.healthy).toBe(false);
    expect(health.details.serviceHealth.query.healthy).toBe(true);
  });

  test("returns unhealthy status when Query service is unhealthy", async () => {
    mockPing.mockImplementation(() =>
      Promise.resolve(createMockPingResult({ kv: "ok", query: "error" }))
    );

    const { getCouchbaseHealth } = await import("../../../src/lib/couchbaseConnector");
    const health = await getCouchbaseHealth();

    expect(health.status).toBe("unhealthy");
    expect(health.details.serviceHealth.kv.healthy).toBe(true);
    expect(health.details.serviceHealth.query.healthy).toBe(false);
  });

  test("returns critical status when circuit breaker is open", async () => {
    mockCircuitBreakerState = {
      state: "open",
      failures: 5,
      successes: 2,
    };

    const { getCouchbaseHealth } = await import("../../../src/lib/couchbaseConnector");
    const health = await getCouchbaseHealth();

    expect(health.status).toBe("critical");
    expect(health.details.errors).toBeDefined();
    expect(health.details.errors?.some((e) => e.includes("Circuit breaker"))).toBe(true);
    expect(health.details.recommendations).toBeDefined();
  });

  test("returns critical status when both KV and Query are unhealthy", async () => {
    mockPing.mockImplementation(() =>
      Promise.resolve(createMockPingResult({ kv: "error", query: "error" }))
    );

    const { getCouchbaseHealth } = await import("../../../src/lib/couchbaseConnector");
    const health = await getCouchbaseHealth();

    expect(health.status).toBe("critical");
    expect(health.details.serviceHealth.kv.healthy).toBe(false);
    expect(health.details.serviceHealth.query.healthy).toBe(false);
  });

  test("returns critical status when connection fails", async () => {
    mockConnect.mockImplementationOnce(() =>
      Promise.reject(new Error("Connection refused"))
    );

    const { getCouchbaseHealth } = await import("../../../src/lib/couchbaseConnector");
    const health = await getCouchbaseHealth();

    expect(health.status).toBe("critical");
    expect(health.details.connection).toBe("error");
    expect(health.details.errors).toBeDefined();
    expect(health.details.errors?.some((e) => e.includes("Connection refused"))).toBe(true);
  });

  test("includes performance metrics in health response", async () => {
    const { getCouchbaseHealth } = await import("../../../src/lib/couchbaseConnector");
    const health = await getCouchbaseHealth();

    expect(health.details.performance).toBeDefined();
    expect(health.details.performance.avgQueryTime).toBeDefined();
    expect(health.details.performance.errorRate).toBeDefined();
    expect(health.details.performance.documentsPerSecond).toBeDefined();
  });

  test("includes circuit breaker stats in health response", async () => {
    const { getCouchbaseHealth } = await import("../../../src/lib/couchbaseConnector");
    const health = await getCouchbaseHealth();

    expect(health.details.circuitBreaker).toBeDefined();
    expect(health.details.circuitBreaker.state).toBeDefined();
    expect(health.details.circuitBreaker.failures).toBeDefined();
    expect(health.details.circuitBreaker.successes).toBeDefined();
  });

  test("evaluates service health for unavailable services", async () => {
    mockPing.mockImplementation(() =>
      Promise.resolve(createMockPingResult({ kv: "ok", query: "ok" })) // analytics and search not included
    );

    const { getCouchbaseHealth } = await import("../../../src/lib/couchbaseConnector");
    const health = await getCouchbaseHealth();

    expect(health.details.serviceHealth.analytics.status).toBe("unavailable");
    expect(health.details.serviceHealth.search.status).toBe("unavailable");
  });

  test("calculates connection latency", async () => {
    const { getCouchbaseHealth } = await import("../../../src/lib/couchbaseConnector");
    const health = await getCouchbaseHealth();

    expect(health.details.connectionLatency).toBeDefined();
    expect(typeof health.details.connectionLatency).toBe("number");
    expect(health.details.connectionLatency).toBeGreaterThanOrEqual(0);
  });

  test("provides recommendations when error rate is elevated", async () => {
    mockCircuitBreakerState = {
      state: "closed",
      failures: 3,
      successes: 10,
    };

    const { getCouchbaseHealth } = await import("../../../src/lib/couchbaseConnector");
    const health = await getCouchbaseHealth();

    expect(health.details.recommendations).toBeDefined();
    expect(health.details.recommendations?.length).toBeGreaterThan(0);
  });
});

describe("pingCouchbase", () => {
  beforeEach(() => {
    mockConnect.mockClear();
    mockPing.mockClear();

    // Reset to healthy state
    mockPing.mockImplementation(() =>
      Promise.resolve(createMockPingResult({ kv: "ok", query: "ok" }))
    );
  });

  test("returns success with latency when connection succeeds", async () => {
    const { pingCouchbase } = await import("../../../src/lib/couchbaseConnector");
    const result = await pingCouchbase();

    expect(result.success).toBe(true);
    expect(result.latency).toBeDefined();
    expect(typeof result.latency).toBe("number");
    expect(result.latency).toBeGreaterThanOrEqual(0);
    expect(result.services).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  test("returns failure with error message when connection fails", async () => {
    mockConnect.mockImplementationOnce(() =>
      Promise.reject(new Error("Network unreachable"))
    );

    const { pingCouchbase } = await import("../../../src/lib/couchbaseConnector");
    const result = await pingCouchbase();

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toBe("Network unreachable");
    expect(result.latency).toBeUndefined();
  });

  test("returns failure when ping operation fails", async () => {
    mockPing.mockImplementation(() =>
      Promise.reject(new Error("Ping timeout"))
    );

    const { pingCouchbase } = await import("../../../src/lib/couchbaseConnector");
    const result = await pingCouchbase();

    expect(result.success).toBe(false);
    expect(result.error).toBe("Ping timeout");
  });

  test("returns service information in successful response", async () => {
    mockPing.mockImplementation(() =>
      Promise.resolve({
        services: {
          kv: [{ state: "ok", latency: 5 }],
          query: [{ state: "ok", latency: 10 }],
        },
      })
    );

    const { pingCouchbase } = await import("../../../src/lib/couchbaseConnector");
    const result = await pingCouchbase();

    expect(result.success).toBe(true);
    expect(result.services).toBeDefined();
    expect(result.services?.kv).toBeDefined();
    expect(result.services?.query).toBeDefined();
  });
});
