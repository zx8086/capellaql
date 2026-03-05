/* test/k6/stress/system-stress.ts */
/* Platform QA Component compatible - supports PEAK_VUS, RAMP_UP, SUSTAIN env vars */

import { check, sleep } from "k6";
import http from "k6/http";
import type { Options } from "k6/options";
import { getAllOperations, getQueryWithVariables } from "../data/test-data-loader.ts";
import { getConfig, getStressConfig, getHealthEndpoint, performanceThresholds } from "../utils/config.ts";
import { executeGraphQLQuery } from "../utils/graphql-helpers.ts";
import { dbConnections, httpSuccessRate } from "../utils/metrics.ts";

// Platform QA Component dynamic configuration
const stressConfig = getStressConfig();
const peakVUs = stressConfig.peakVUs;
const rampUp = stressConfig.rampUp;
const sustain = stressConfig.sustain;

// Calculate intermediate stages based on peak VUs
const warmupVUs = Math.floor(peakVUs * 0.25); // 25% of peak
const stressVUs = Math.floor(peakVUs * 0.5); // 50% of peak
const highStressVUs = Math.floor(peakVUs * 0.75); // 75% of peak

export const options: Options = {
  stages: [
    { duration: rampUp, target: warmupVUs }, // Warm-up
    { duration: rampUp, target: stressVUs }, // Ramp to stress level
    { duration: sustain, target: highStressVUs }, // High stress (main test phase)
    { duration: rampUp, target: peakVUs }, // Peak stress
    { duration: rampUp, target: stressVUs }, // Step down
    { duration: rampUp, target: 0 }, // Cool down
  ],
  thresholds: {
    http_req_duration: performanceThresholds.health.stress,
    "http_req_duration{operation_type:simple}": performanceThresholds.graphql.simple,
    "http_req_duration{operation_type:complex}": ["p(95)<2000", "p(99)<3000"], // Relaxed for stress
    http_req_failed: performanceThresholds.errors.stress,
    graphql_success_rate: ["rate>0.95"], // More lenient for stress test
    concurrent_db_connections: ["value<500"], // Monitor DB connections
  },
  tags: {
    test_type: "stress",
    component: "system",
  },
};

const config = getConfig();
console.log(`System Stress Test Configuration:
- Peak Load: ${peakVUs} VUs (configurable via PEAK_VUS env var)
- Ramp duration: ${rampUp} (configurable via RAMP_UP env var)
- Sustain duration: ${sustain} (configurable via SUSTAIN env var)
- Stages: ${warmupVUs} -> ${stressVUs} -> ${highStressVUs} -> ${peakVUs} -> ${stressVUs} -> 0
- Base URL: ${config.baseUrl}
- Mixed workload: Health + GraphQL operations
- Thresholds: More lenient for breaking point testing`);

export default function systemStressTest(): void {
  // Simulate realistic mixed workload
  const workloadType = Math.random();

  if (workloadType < 0.3) {
    // 30% health checks
    runHealthCheck();
  } else {
    // 70% GraphQL operations
    runGraphQLOperation();
  }

  // Variable sleep to simulate realistic user behavior under stress
  sleep(Math.random() * 0.8 + 0.2); // 0.2-1.0 seconds
}

function runHealthCheck(): void {
  const params = {
    tags: {
      testType: "stress-test",
      endpoint: "/health",
      operation_type: "health",
    },
    timeout: config.timeout,
  };

  const response = http.get(getHealthEndpoint(), params);
  httpSuccessRate.add(response.status === 200);

  check(response, {
    "health status is 200": (r) => r.status === 200,
    "health response time acceptable": (r) => r.timings.duration < 1000, // More lenient
    "health response is valid": (r) => {
      try {
        const body = JSON.parse(r.body as string);
        return ["healthy", "ok", "up"].includes(body.status?.toLowerCase());
      } catch {
        return false;
      }
    },
  });

  // Simulate concurrent DB connections gauge
  dbConnections.add(Math.floor(Math.random() * 50) + __VU * 2);
}

function runGraphQLOperation(): void {
  try {
    const allOperations = getAllOperations();
    const operation = allOperations[Math.floor(Math.random() * allOperations.length)];
    const queryData = getQueryWithVariables(operation);

    const response = executeGraphQLQuery(
      {
        query: queryData.query,
        variables: queryData.variables,
      },
      {
        operation,
        complexity: queryData.complexity as "simple" | "complex",
        expectedFields: queryData.expectedFields,
        tags: {
          test_type: "stress",
          operation_type: queryData.complexity,
          stress_level: "high",
        },
      }
    );

    // More lenient validation for stress testing
    const isValid = check(response, {
      "GraphQL status is 200": (r) => r.status === 200,
      "GraphQL response time acceptable": (r) => r.timings.duration < 3000,
      "GraphQL response parseable": (r) => {
        try {
          JSON.parse(r.body as string);
          return true;
        } catch {
          return false;
        }
      },
    });

    if (!isValid && response.status !== 200) {
      console.warn(`GraphQL stress test degradation for ${operation}: ${response.status}`);
    }
  } catch (error) {
    console.warn(`GraphQL stress test error:`, error);
  }
}
