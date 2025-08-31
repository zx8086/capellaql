/* src/lib/couchbaseConnector.test.ts - Test Couchbase connection logic */

import { beforeEach, describe, expect, mock, test } from "bun:test";

// Mock the couchbase module
const mockConnect = mock(() =>
  Promise.resolve({
    bucket: mock(() => ({
      scope: mock(() => ({
        collection: mock(() => ({})),
      })),
    })),
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

// Mock the config
mock.module("$config", () => ({
  default: {
    capella: {
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
    },
    telemetry: {
      CIRCUIT_BREAKER_THRESHOLD: 3,
      CIRCUIT_BREAKER_TIMEOUT_MS: 60000,
    },
  },
}));

// Mock telemetry logger
mock.module("../telemetry/logger", () => ({
  log: mock(() => {}),
  error: mock(() => {}),
}));

// Mock bunUtils
mock.module("$utils/bunUtils", () => ({
  retryWithBackoff: mock(async (operation: () => Promise<any>) => {
    return await operation();
  }),
  CircuitBreaker: mock().mockImplementation(() => ({
    execute: mock(async (operation: () => Promise<any>) => {
      return await operation();
    }),
  })),
}));

describe("CouchbaseConnector", () => {
  beforeEach(() => {
    // Reset all mocks before each test
    mockConnect.mockClear();
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
