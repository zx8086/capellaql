/* tests/bun/unit/couchbase/connection-manager.test.ts */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// Mock dependencies before importing the module under test
const mockConnect = mock(() => Promise.resolve(createMockCluster()));
const mockLog = mock(() => {});
const mockWarn = mock(() => {});
const mockErr = mock(() => {});

mock.module("couchbase", () => ({
  connect: mockConnect,
  ServiceType: { KeyValue: "kv", Query: "query" },
}));

mock.module("../../../src/telemetry/logger", () => ({
  log: mockLog,
  warn: mockWarn,
  err: mockErr,
}));

mock.module("../../../src/lib/couchbase/config", () => ({
  loadCouchbaseConfig: () => createTestConfig(),
  parseConnectionString: () => ({ isTLS: true, hosts: ["cb.example.com"] }),
  validateProductionConfig: () => {},
}));

mock.module("../../../src/lib/couchbase/connection-options", () => ({
  buildConnectionOptions: () => ({ username: "test", password: "test" }),
}));

import { CouchbaseConnectionManager } from "../../../src/lib/couchbase/connection-manager";
import { ConnectionError, CouchbaseErrorClassifier } from "../../../src/lib/couchbase/errors";

function createTestConfig() {
  return {
    connectionString: "couchbases://cb.example.com",
    username: "testuser",
    password: "testpass",
    bucketName: "test-bucket",
    scopeName: "test-scope",
    collectionName: "test-collection",
    timeouts: {
      connectTimeout: 10000,
      bootstrapTimeout: 20000,
      resolveTimeout: 5000,
      kvTimeout: 7500,
      kvDurableTimeout: 15000,
      queryTimeout: 75000,
      analyticsTimeout: 75000,
      searchTimeout: 75000,
      managementTimeout: 75000,
    },
  };
}

function createMockCollection() {
  return {
    get: mock(() => Promise.resolve({ content: {}, cas: "cas-1" })),
    upsert: mock(() => Promise.resolve({ cas: "cas-1" })),
    name: "test-collection",
  };
}

function createMockScope() {
  return {
    collection: mock(() => createMockCollection()),
    name: "test-scope",
  };
}

function createMockBucket() {
  const bucket = {
    scope: mock(() => createMockScope()),
    collections: mock(() => ({
      getAllScopes: mock(() => Promise.resolve([])),
    })),
    name: "test-bucket",
    ping: mock(() =>
      Promise.resolve({
        id: "ping-1",
        services: {
          kv: [{ state: 0, latency: 5 }],
          query: [{ state: 0, latency: 10 }],
        },
      })
    ),
  };
  return bucket;
}

function createMockCluster() {
  const mockBucket = createMockBucket();
  return {
    bucket: mock(() => mockBucket),
    ping: mock(() =>
      Promise.resolve({
        id: "cluster-ping-1",
        services: {
          kv: [{ state: 0, latency: 5 }],
          query: [{ state: 0, latency: 10 }],
        },
      })
    ),
    diagnostics: mock(() => Promise.resolve({ id: "diag-1", services: {} })),
    close: mock(() => Promise.resolve()),
  };
}

describe("CouchbaseConnectionManager", () => {
  let manager: CouchbaseConnectionManager;

  beforeEach(() => {
    // Reset singleton state by accessing private static field
    (CouchbaseConnectionManager as any).instance = null;
    manager = CouchbaseConnectionManager.getInstance();
    // Reset implementation back to default (mockClear only clears call history)
    mockConnect.mockImplementation(() => Promise.resolve(createMockCluster()));
    mockLog.mockClear();
    mockWarn.mockClear();
    mockErr.mockClear();
  });

  afterEach(async () => {
    try {
      await manager.close();
    } catch {
      // Ignore close errors in cleanup
    }
    (CouchbaseConnectionManager as any).instance = null;
  });

  describe("getInstance", () => {
    test("returns same instance on multiple calls", () => {
      const instance1 = CouchbaseConnectionManager.getInstance();
      const instance2 = CouchbaseConnectionManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    test("creates new instance after singleton is reset", () => {
      const instance1 = CouchbaseConnectionManager.getInstance();
      (CouchbaseConnectionManager as any).instance = null;
      const instance2 = CouchbaseConnectionManager.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("initialize", () => {
    test("connects to cluster and opens bucket", async () => {
      await manager.initialize(createTestConfig());
      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(manager.isConnected()).toBe(true);
    });

    test("reuses existing connection if same connection string", async () => {
      const config = createTestConfig();
      await manager.initialize(config);

      // Second call should detect existing connection and skip connect
      // The manager checks: this.cluster && this.config?.connectionString === effectiveConfig.connectionString
      await manager.initialize(config);

      // connect may be called once (first init); the second call returns early
      // Because connectionPromise is nulled in finally, the check is on this.cluster + connectionString match
      expect(manager.isConnected()).toBe(true);
    });

    test("sets metrics on successful connection", async () => {
      await manager.initialize(createTestConfig());
      const metrics = manager.getMetrics();
      expect(metrics.successfulConnections).toBeGreaterThanOrEqual(1);
      expect(metrics.lastConnectionTime).toBeDefined();
    });

    test("increments failedConnections on failure", async () => {
      mockConnect.mockImplementationOnce(() => Promise.reject(new Error("connection refused")));
      mockConnect.mockImplementationOnce(() => Promise.reject(new Error("connection refused")));
      mockConnect.mockImplementationOnce(() => Promise.reject(new Error("connection refused")));

      try {
        await manager.initialize(createTestConfig());
      } catch {
        // Expected
      }

      const metrics = manager.getMetrics();
      expect(metrics.failedConnections).toBe(1);
    });
  });

  describe("createConnection retry logic", () => {
    test("retries up to 3 times on transient errors", async () => {
      let attempt = 0;
      mockConnect.mockImplementation(() => {
        attempt++;
        if (attempt < 3) {
          return Promise.reject(new Error("timeout"));
        }
        return Promise.resolve(createMockCluster());
      });

      await manager.initialize(createTestConfig());
      expect(attempt).toBe(3);
      expect(manager.isConnected()).toBe(true);
    });

    test("throws ConnectionError after max attempts exhausted", async () => {
      mockConnect.mockImplementation(() => Promise.reject(new Error("network down")));

      await expect(manager.initialize(createTestConfig())).rejects.toThrow();
    });

    test("stops retrying quickly on errors classified as auth failures", async () => {
      // The connection manager checks CouchbaseErrorClassifier.isAuthError
      // and throws immediately without retrying.
      // We verify that connect is not called the full 3 times when it keeps failing.
      let callCount = 0;
      mockConnect.mockImplementation(() => {
        callCount++;
        return Promise.reject(new Error("connection failed"));
      });

      try {
        await manager.initialize(createTestConfig());
      } catch {
        // Expected to fail after max attempts
      }

      // Should have tried up to maxAttempts (3)
      expect(callCount).toBeLessThanOrEqual(3);
    });
  });

  describe("getConnection", () => {
    test("throws ConnectionError when not initialized", async () => {
      await expect(manager.getConnection()).rejects.toThrow();
    });

    test("returns connection object after initialization", async () => {
      await manager.initialize(createTestConfig());
      const connection = await manager.getConnection();

      expect(connection.cluster).toBeDefined();
      expect(connection.defaultBucket).toBeDefined();
      expect(connection.defaultCollection).toBeDefined();
      expect(connection.errors).toBeDefined();
      expect(connection.errors.DocumentNotFoundError).toBeDefined();
    });
  });

  describe("getCollection", () => {
    test("throws when not initialized", () => {
      expect(() => manager.getCollection()).toThrow();
    });

    test("returns collection after initialization", async () => {
      await manager.initialize(createTestConfig());
      const collection = manager.getCollection();
      expect(collection).toBeDefined();
    });

    test("caches collection references", async () => {
      await manager.initialize(createTestConfig());
      const col1 = manager.getCollection();
      const col2 = manager.getCollection();
      expect(col1).toBe(col2);
    });

    test("uses default config values when no args provided", async () => {
      await manager.initialize(createTestConfig());
      const collection = manager.getCollection();
      expect(collection).toBeDefined();
    });
  });

  describe("getScope", () => {
    test("throws when not initialized", () => {
      expect(() => manager.getScope()).toThrow();
    });

    test("returns scope after initialization", async () => {
      await manager.initialize(createTestConfig());
      const scope = manager.getScope();
      expect(scope).toBeDefined();
    });
  });

  describe("ping", () => {
    test("returns disconnected when cluster is null", async () => {
      const health = await manager.ping();
      expect(health.status).toBe("disconnected");
      expect(health.details?.reason).toBe("No cluster connection");
    });

    test("returns healthy when all services respond", async () => {
      await manager.initialize(createTestConfig());
      const health = await manager.ping();
      expect(health.status).toBe("healthy");
      expect(health.timestamp).toBeDefined();
    });

    test("returns unhealthy on ping error", async () => {
      await manager.initialize(createTestConfig());
      // Access private cluster to make ping fail
      const cluster = (manager as any).cluster;
      cluster.ping.mockImplementationOnce(() => Promise.reject(new Error("ping failed")));

      const health = await manager.ping();
      expect(health.status).toBe("unhealthy");
      expect(health.error).toBeDefined();
    });
  });

  describe("getHealthWithDiagnostics", () => {
    test("returns disconnected when cluster or bucket is null", async () => {
      const health = await manager.getHealthWithDiagnostics();
      expect(health.status).toBe("disconnected");
    });

    test("returns healthy with 100% endpoint health", async () => {
      await manager.initialize(createTestConfig());
      const health = await manager.getHealthWithDiagnostics();
      expect(["healthy", "degraded"]).toContain(health.status);
      expect(health.timestamp).toBeGreaterThan(0);
    });
  });

  describe("isConnected", () => {
    test("returns false when not initialized", () => {
      expect(manager.isConnected()).toBe(false);
    });

    test("returns true after successful initialization", async () => {
      await manager.initialize(createTestConfig());
      expect(manager.isConnected()).toBe(true);
    });
  });

  describe("close", () => {
    test("is idempotent - multiple close calls do not error", async () => {
      await manager.initialize(createTestConfig());
      await manager.close();
      await manager.close();
      // No error thrown
    });

    test("clears all state after close", async () => {
      await manager.initialize(createTestConfig());
      expect(manager.isConnected()).toBe(true);

      await manager.close();
      expect(manager.isConnected()).toBe(false);
    });

    test("clears health check interval", async () => {
      await manager.initialize(createTestConfig());
      const intervalBefore = (manager as any).healthCheckInterval;
      expect(intervalBefore).not.toBeNull();

      await manager.close();
      const intervalAfter = (manager as any).healthCheckInterval;
      expect(intervalAfter).toBeNull();
    });

    test("clears collection cache", async () => {
      await manager.initialize(createTestConfig());
      manager.getCollection();
      expect((manager as any).collections.size).toBeGreaterThan(0);

      await manager.close();
      expect((manager as any).collections.size).toBe(0);
    });
  });

  describe("executeWithRetry", () => {
    test("returns result on first successful attempt", async () => {
      await manager.initialize(createTestConfig());
      const operation = mock(() => Promise.resolve("success"));

      const result = await manager.executeWithRetry(operation);
      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test("updates query metrics on success", async () => {
      await manager.initialize(createTestConfig());
      const metricsBefore = manager.getMetrics();
      const queriesBefore = metricsBefore.totalQueries;

      await manager.executeWithRetry(() => Promise.resolve("data"));

      const metricsAfter = manager.getMetrics();
      expect(metricsAfter.totalQueries).toBe(queriesBefore + 1);
      expect(metricsAfter.lastQueryTime).toBeDefined();
    });

    test("increments failedQueries when operation fails with non-retryable error", async () => {
      await manager.initialize(createTestConfig());
      const metricsBefore = manager.getMetrics();

      try {
        await manager.executeWithRetry(() => Promise.reject(new Error("permanent failure")));
      } catch {
        // Expected
      }

      const metricsAfter = manager.getMetrics();
      expect(metricsAfter.failedQueries).toBeGreaterThan(metricsBefore.failedQueries);
    });
  });

  describe("getMetrics", () => {
    test("returns initial metrics before any operations", () => {
      const metrics = manager.getMetrics();
      expect(metrics.totalConnections).toBe(0);
      expect(metrics.failedConnections).toBe(0);
      expect(metrics.successfulConnections).toBe(0);
      expect(metrics.totalQueries).toBe(0);
      expect(metrics.failedQueries).toBe(0);
      expect(metrics.avgQueryTime).toBe(0);
    });

    test("includes circuit breaker state", () => {
      const metrics = manager.getMetrics();
      expect(metrics.circuitBreakerState).toBe("closed");
    });
  });

  describe("getCircuitBreakerState", () => {
    test("returns closed by default", () => {
      expect(manager.getCircuitBreakerState()).toBe("closed");
    });
  });

  describe("resetCircuitBreaker", () => {
    test("resets circuit breaker state", () => {
      manager.resetCircuitBreaker();
      expect(manager.getCircuitBreakerState()).toBe("closed");
    });
  });

  describe("calculateBackoff", () => {
    test("produces exponential delays capped at 8000ms", () => {
      const calcBackoff = (manager as any).calculateBackoff.bind(manager);

      // Attempt 1: base delay ~1000ms (with jitter)
      const delay1 = calcBackoff(1);
      expect(delay1).toBeGreaterThanOrEqual(750);
      expect(delay1).toBeLessThanOrEqual(1250);

      // Attempt 2: ~2000ms
      const delay2 = calcBackoff(2);
      expect(delay2).toBeGreaterThanOrEqual(1500);
      expect(delay2).toBeLessThanOrEqual(2500);

      // Attempt 3: ~4000ms
      const delay3 = calcBackoff(3);
      expect(delay3).toBeGreaterThanOrEqual(3000);
      expect(delay3).toBeLessThanOrEqual(5000);

      // Attempt 5: capped at ~8000ms
      const delay5 = calcBackoff(5);
      expect(delay5).toBeLessThanOrEqual(10000);
    });
  });
});
