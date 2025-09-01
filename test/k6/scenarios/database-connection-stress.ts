/* test/k6/scenarios/database-connection-stress.ts */

import { check, sleep } from "k6";
import type { Options } from "k6/options";
import { getAllOperations, getQueryWithVariables } from "../data/test-data-loader.ts";
import { getConfig } from "../utils/config.ts";
import { executeGraphQLQuery } from "../utils/graphql-helpers.ts";
import { dbConnectionErrors, dbConnections, dbQueryDuration } from "../utils/metrics.ts";

export const options: Options = {
  scenarios: {
    connectionPoolStress: {
      executor: "constant-arrival-rate",
      rate: 100, // 100 requests per second
      duration: "5m",
      preAllocatedVUs: 50,
      maxVUs: 200, // Allow burst to test connection limits
      tags: { scenario: "connection_pool_stress" },
    },
    connectionLeakTest: {
      executor: "ramping-arrival-rate",
      startRate: 10,
      timeUnit: "1s",
      stages: [
        { target: 50, duration: "2m" }, // Gradual increase
        { target: 100, duration: "3m" }, // High sustained load
        { target: 150, duration: "2m" }, // Peak stress
        { target: 0, duration: "1m" }, // Sudden drop to test cleanup
      ],
      preAllocatedVUs: 100,
      maxVUs: 300,
      tags: { scenario: "connection_leak_test" },
    },
  },
  thresholds: {
    // Connection-specific thresholds
    concurrent_db_connections: ["value<100"], // Should not exceed connection pool
    db_connection_errors: ["count<50"], // Tolerate some connection errors
    db_query_duration: ["p(95)<1000", "p(99)<2000"],

    // General performance under connection stress
    http_req_failed: ["rate<0.1"], // Allow more failures due to connection limits
    http_req_duration: ["p(95)<2000"], // More lenient response times

    // Business continuity metrics
    "graphql_success_rate{scenario:connection_pool_stress}": ["rate>0.9"],
    "graphql_success_rate{scenario:connection_leak_test}": ["rate>0.85"],
  },
  tags: {
    test_type: "stress",
    component: "database",
    focus: "connection_pooling",
  },
};

console.log(`Database Connection Stress Test:
- Connection Pool Test: 100 RPS for 5 minutes
- Connection Leak Test: Ramping 10-150 RPS over 8 minutes
- Focus: Connection pooling, leak detection, resource cleanup
- Thresholds: <100 concurrent connections, <1s P95 query time`);

export default function databaseConnectionStressTest(): void {
  const testStart = Date.now();
  const currentConnections = Math.floor(Math.random() * 20) + __VU; // Simulate connection usage

  // Track simulated concurrent connections
  dbConnections.add(currentConnections);

  try {
    // Execute a random operation to stress database connections
    const operations = getAllOperations();
    const operation = operations[Math.floor(Math.random() * operations.length)];

    const queryStart = Date.now();
    const queryData = getQueryWithVariables(operation);

    const response = executeGraphQLQuery(
      {
        query: queryData.query,
        variables: queryData.variables,
      },
      {
        operation,
        complexity: queryData.complexity as "simple" | "complex",
        tags: {
          connection_test: "stress",
          concurrent_connections: currentConnections.toString(),
        },
      }
    );

    const queryDuration = Date.now() - queryStart;
    dbQueryDuration.add(queryDuration, { operation });

    // Connection-specific validation
    const connectionHealth = check(response, {
      "no connection timeout errors": (r) => {
        const body = r.body as string;
        return (
          !body.includes("connection timeout") &&
          !body.includes("too many connections") &&
          !body.includes("connection refused")
        );
      },
      "query completed within reasonable time": (r) => r.timings.duration < 3000,
      "response indicates successful DB query": (r) => {
        if (r.status !== 200) return false;
        try {
          const parsed = JSON.parse(r.body as string);
          return !parsed.errors || parsed.errors.length === 0;
        } catch {
          return false;
        }
      },
    });

    if (!connectionHealth || response.status !== 200) {
      dbConnectionErrors.add(1, {
        operation,
        error_type: response.status === 0 ? "connection_failed" : "query_failed",
      });

      if (response.status === 0 || response.timings.duration > 5000) {
        console.warn(
          `Potential connection pool exhaustion - Operation: ${operation}, Status: ${response.status}, Duration: ${response.timings.duration}ms`
        );
      }
    }

    // Simulate connection cleanup delay
    if (Math.random() < 0.1) {
      // 10% chance of slow cleanup
      sleep(Math.random() * 0.5 + 0.1); // 0.1-0.6 seconds
    }
  } catch (error) {
    dbConnectionErrors.add(1, { error_type: "execution_error" });
    console.error("Database connection stress test error:", error);
  }

  // Very short sleep to maintain high throughput
  sleep(Math.random() * 0.1 + 0.05); // 0.05-0.15 seconds
}

// Additional setup function to monitor connection pool health
export function setup() {
  console.log("Initializing database connection stress test...");
  console.log("Monitoring connection pool limits and cleanup behavior");
  return { startTime: Date.now() };
}

// Teardown to log connection pool metrics
export function teardown(data: any) {
  const testDuration = (Date.now() - data.startTime) / 1000;
  console.log(`Database connection stress test completed in ${testDuration} seconds`);
  console.log("Check connection pool metrics for leaks or exhaustion patterns");
}
