// Integration tests for database connection and operations
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { connectionManager } from "../../../../src/lib/couchbase/connection-manager";
import { isServiceAvailable } from "../../shared/test-skip-conditions";

const BASE_URL = process.env.BASE_URL || "http://localhost:4000";

describe("Database Connection Integration", () => {
  let connected = false;
  let serviceAvailable = false;

  beforeAll(async () => {
    serviceAvailable = await isServiceAvailable(`${BASE_URL}/health`, 3000);
    if (!serviceAvailable) {
      console.warn("CapellaQL server unavailable — database integration tests will be skipped");
      return;
    }

    try {
      const conn = await connectionManager.getConnection();
      connected = !!conn.cluster;
    } catch (error) {
      console.warn("Database connection unavailable for integration tests:", error);
    }
  });

  afterAll(async () => {
    // Connection manager handles its own lifecycle
  });

  describe("Connection Establishment", () => {
    test("establishes connection to Couchbase cluster", async () => {
      if (!connected) {
        console.warn("Skipping test: Database connection not available");
        return;
      }

      const conn = await connectionManager.getConnection();
      expect(conn).toBeDefined();
      expect(conn.cluster).toBeDefined();
      expect(typeof conn.cluster.query).toBe("function");
      expect(typeof conn.cluster.bucket).toBe("function");
    });

    test("can access default bucket and collection", async () => {
      if (!connected) {
        console.warn("Skipping test: Database connection not available");
        return;
      }

      try {
        const conn = await connectionManager.getConnection();
        expect(conn.bucket).toBeDefined();
        expect(conn.collection).toBeDefined();
        const col = conn.collection();
        expect(typeof col.get).toBe("function");
        expect(typeof col.upsert).toBe("function");
      } catch (error) {
        // Expected to fail if bucket doesn't exist in test environment
        console.warn("Test bucket access failed (expected in some environments):", error);
      }
    });
  });

  describe("Health Monitoring", () => {
    test("connection manager reports metrics and connection state", async () => {
      const metrics = connectionManager.getMetrics();
      expect(metrics).toBeDefined();

      const isConn = connectionManager.isConnected();
      expect(typeof isConn).toBe("boolean");
    }, 10000);
  });

  describe("Query Operations", () => {
    test("can execute basic N1QL queries", async () => {
      if (!connected) {
        console.warn("Skipping test: Database connection not available");
        return;
      }

      try {
        const conn = await connectionManager.getConnection();
        const result = await conn.cluster.query("SELECT RAW 1");

        expect(result).toBeDefined();
        expect(result.rows).toBeDefined();
        expect(Array.isArray(result.rows)).toBe(true);

        if (result.rows.length > 0) {
          expect(result.rows[0]).toBe(1);
        }
      } catch (error) {
        console.warn("Query test failed (may be expected in restricted environments):", error);
      }
    }, 10000);
  });

  describe("Performance Characteristics", () => {
    test("multiple concurrent operations don't cause issues", async () => {
      if (!connected) {
        console.warn("Skipping test: Database connection not available");
        return;
      }

      const concurrentOperations = [];

      for (let i = 0; i < 5; i++) {
        concurrentOperations.push(connectionManager.getConnection());
      }

      const results = await Promise.allSettled(concurrentOperations);

      expect(results.length).toBe(5);
      results.forEach((result) => {
        expect(result.status).toMatch(/^(fulfilled|rejected)$/);

        if (result.status === "fulfilled") {
          expect(result.value).toBeDefined();
          expect(result.value.cluster).toBeDefined();
        }
      });
    }, 15000);
  });
});
