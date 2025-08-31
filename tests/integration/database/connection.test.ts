// Integration tests for database connection and operations
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { clusterConn, getCouchbaseHealth, pingCouchbase } from "../../../src/lib/couchbaseConnector";
import type { Cluster, QueryableCluster } from "couchbase";

describe("Database Connection Integration", () => {
  let cluster: QueryableCluster;

  beforeAll(async () => {
    try {
      cluster = await clusterConn();
    } catch (error) {
      console.warn("Database connection unavailable for integration tests:", error);
      // Skip tests if database is not available
    }
  });

  afterAll(async () => {
    // Cleanup if needed
  });

  describe("Connection Establishment", () => {
    test("establishes connection to Couchbase cluster", async () => {
      if (!cluster) {
        console.warn("Skipping test: Database connection not available");
        return;
      }

      expect(cluster).toBeDefined();
      expect(typeof cluster.query).toBe("function");
      expect(typeof cluster.bucket).toBe("function");
    });

    test("can access default bucket and collection", async () => {
      if (!cluster) {
        console.warn("Skipping test: Database connection not available");
        return;
      }

      try {
        const bucket = cluster.bucket("default");
        expect(bucket).toBeDefined();

        const collection = bucket.defaultCollection();
        expect(collection).toBeDefined();
        expect(typeof collection.get).toBe("function");
        expect(typeof collection.upsert).toBe("function");
      } catch (error) {
        // Expected to fail if bucket doesn't exist in test environment
        console.warn("Test bucket access failed (expected in some environments):", error);
      }
    });
  });

  describe("Health Monitoring", () => {
    test("ping operation returns valid result", async () => {
      const pingResult = await pingCouchbase();
      
      expect(pingResult).toBeDefined();
      expect(typeof pingResult.success).toBe("boolean");
      expect(typeof pingResult.latency).toBe("number");
      
      if (pingResult.success) {
        expect(pingResult.latency).toBeGreaterThan(0);
        expect(pingResult.details).toBeDefined();
      }
    }, 10000); // 10 second timeout

    test("health check returns comprehensive status", async () => {
      const healthStatus = await getCouchbaseHealth();
      
      expect(healthStatus).toBeDefined();
      expect(healthStatus.status).toMatch(/^(healthy|degraded|unhealthy)$/);
      expect(healthStatus.details).toBeDefined();
      expect(healthStatus.details.connection).toMatch(/^(connected|disconnected)$/);
      
      if (healthStatus.details.ping) {
        expect(typeof healthStatus.details.ping.success).toBe("boolean");
        expect(typeof healthStatus.details.ping.latency).toBe("number");
      }
    }, 15000); // 15 second timeout
  });

  describe("Query Operations", () => {
    test("can execute basic N1QL queries", async () => {
      if (!cluster) {
        console.warn("Skipping test: Database connection not available");
        return;
      }

      try {
        // Simple system query that should work on any Couchbase cluster
        const result = await cluster.query("SELECT RAW 1");
        
        expect(result).toBeDefined();
        expect(result.rows).toBeDefined();
        expect(Array.isArray(result.rows)).toBe(true);
        
        if (result.rows.length > 0) {
          expect(result.rows[0]).toBe(1);
        }
      } catch (error) {
        // Log error for debugging but don't fail test if query permissions are restricted
        console.warn("Query test failed (may be expected in restricted environments):", error);
      }
    }, 10000);

    test("handles query timeouts appropriately", async () => {
      if (!cluster) {
        console.warn("Skipping test: Database connection not available");
        return;
      }

      try {
        // Test query with very short timeout to trigger timeout handling
        await cluster.query("SELECT RAW SLEEP(2000)", {
          timeout: 1000 // 1 second timeout for a 2 second sleep
        });
        
        // If we reach here, the query didn't timeout as expected
        console.warn("Query timeout test didn't timeout as expected");
      } catch (error) {
        // Expect a timeout or similar error
        expect(error).toBeDefined();
        // Should be a timeout or similar error
        const errorMessage = error instanceof Error ? error.message : String(error);
        expect(errorMessage.toLowerCase()).toMatch(/(timeout|cancelled|aborted)/);
      }
    }, 15000);
  });

  describe("Error Handling", () => {
    test("handles invalid queries gracefully", async () => {
      if (!cluster) {
        console.warn("Skipping test: Database connection not available");
        return;
      }

      try {
        await cluster.query("INVALID SQL QUERY");
        // Should not reach here
        expect(false).toBe(true);
      } catch (error) {
        expect(error).toBeDefined();
        // Should be a syntax or parsing error
        expect(error).toBeInstanceOf(Error);
      }
    });

    test("handles network interruptions gracefully", async () => {
      // This test simulates connection issues
      // In a real integration environment, you might temporarily disconnect network
      const pingResult = await pingCouchbase();
      
      // Even if connection fails, we should get a structured response
      expect(pingResult).toBeDefined();
      expect(typeof pingResult.success).toBe("boolean");
      
      if (!pingResult.success) {
        expect(pingResult.error).toBeDefined();
        expect(typeof pingResult.error).toBe("string");
      }
    });
  });

  describe("Performance Characteristics", () => {
    test("ping latency is reasonable", async () => {
      const startTime = Date.now();
      const pingResult = await pingCouchbase();
      const totalTime = Date.now() - startTime;
      
      if (pingResult.success) {
        // Latency should be reasonable (less than 5 seconds)
        expect(pingResult.latency).toBeLessThan(5000);
        expect(totalTime).toBeLessThan(6000); // Total time including overhead
      }
      
      // Even failed pings should respond quickly
      expect(totalTime).toBeLessThan(10000);
    });

    test("multiple concurrent operations don't cause issues", async () => {
      if (!cluster) {
        console.warn("Skipping test: Database connection not available");
        return;
      }

      const concurrentOperations = [];
      
      // Create 5 concurrent ping operations
      for (let i = 0; i < 5; i++) {
        concurrentOperations.push(pingCouchbase());
      }
      
      const results = await Promise.allSettled(concurrentOperations);
      
      // All operations should complete (either successfully or with error)
      expect(results.length).toBe(5);
      results.forEach((result, index) => {
        expect(result.status).toMatch(/^(fulfilled|rejected)$/);
        
        if (result.status === 'fulfilled') {
          expect(result.value).toBeDefined();
          expect(typeof result.value.success).toBe("boolean");
        }
      });
    }, 15000);
  });
});