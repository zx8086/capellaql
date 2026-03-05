/* tests/k6/soak/soak-test.ts */
/* Per migrate/docs: Soak testing for long-duration stability validation */
/* Platform QA Component compatible - supports PEAK_VUS, RAMP_UP, SUSTAIN env vars */

import { check, sleep } from "k6";
import http from "k6/http";
import type { Options } from "k6/options";
import { getAllOperations, getQueryWithVariables } from "../data/test-data-loader.ts";
import { getConfig, getStressConfig, getHealthEndpoint, performanceThresholds } from "../utils/config.ts";
import { executeGraphQLQuery } from "../utils/graphql-helpers.ts";
import {
  cacheHitRate,
  httpSuccessRate,
  performanceBudgetViolations,
  recordCacheMetrics,
  telemetryOverhead,
} from "../utils/metrics.ts";

// Platform QA Component dynamic configuration
// For soak tests, PEAK_VUS is used as the sustained load level (default: 50 VUs)
// SUSTAIN is the main test duration (default: 170m for ~3 hour total test)
const stressConfig = getStressConfig();
const soakVUs = Math.min(stressConfig.peakVUs, 50); // Cap at 50 VUs for soak (reasonable sustained load)
const soakDuration = __ENV.SUSTAIN || "170m"; // Main soak duration
const rampDuration = __ENV.RAMP_UP || "5m"; // Ramp up/down duration

export const options: Options = {
  stages: [
    { duration: rampDuration, target: soakVUs }, // Ramp up
    { duration: soakDuration, target: soakVUs }, // Sustained load
    { duration: rampDuration, target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: performanceThresholds.health.soak,
    "http_req_duration{operation_type:simple}": performanceThresholds.graphql.simple,
    "http_req_duration{operation_type:complex}": performanceThresholds.graphql.complex,
    http_req_failed: performanceThresholds.errors.load,
    graphql_success_rate: ["rate>0.99"],
    cache_hit_rate: ["rate>0.3"], // Monitor cache effectiveness over time
    performance_budget_violations: ["count<100"], // Allow some violations over duration
  },
  tags: {
    test_type: "soak",
    component: "system",
  },
};

const config = getConfig();
console.log(`Soak Test Configuration:
- Ramp duration: ${rampDuration} (configurable via RAMP_UP env var)
- Sustained duration: ${soakDuration} (configurable via SUSTAIN env var)
- Target VUs: ${soakVUs} (configurable via PEAK_VUS env var, capped at 50)
- Base URL: ${config.baseUrl}
- Purpose: Memory leak detection, connection stability, cache degradation
- Thresholds: Production-like with long-term stability focus`);

// Track metrics over time for trend analysis
let iterationCount = 0;
let lastLogTime = Date.now();
const LOG_INTERVAL_MS = 300000; // Log every 5 minutes

export default function soakTest(): void {
  iterationCount++;
  const now = Date.now();

  // Periodic logging for long-running test visibility
  if (now - lastLogTime > LOG_INTERVAL_MS) {
    console.log(
      `Soak test progress: ${iterationCount} iterations, VU ${__VU}, Stage: ${__ITER}`
    );
    lastLogTime = now;
  }

  // Mixed workload simulating real-world patterns
  const workloadType = Math.random();

  if (workloadType < 0.2) {
    // 20% health checks
    runHealthCheck();
  } else if (workloadType < 0.4) {
    // 20% cache health monitoring
    runCacheHealthCheck();
  } else {
    // 60% GraphQL operations
    runGraphQLOperation();
  }

  // Realistic sleep between requests
  sleep(Math.random() * 2 + 1); // 1-3 seconds
}

function runHealthCheck(): void {
  const startTime = Date.now();

  const params = {
    tags: {
      testType: "soak-test",
      endpoint: "/health",
      operation_type: "health",
    },
    timeout: config.timeout,
  };

  const response = http.get(getHealthEndpoint(), params);
  const duration = Date.now() - startTime;

  httpSuccessRate.add(response.status === 200);

  const isSuccessful = check(response, {
    "health status is 200": (r) => r.status === 200,
    "health response time < 150ms (soak)": (r) => r.timings.duration < 150,
    "health response is healthy": (r) => {
      try {
        const body = JSON.parse(r.body as string);
        return ["healthy", "ok", "up"].includes(body.status?.toLowerCase());
      } catch {
        return false;
      }
    },
  });

  if (!isSuccessful && response.status !== 200) {
    console.warn(`Health check degradation at iteration ${iterationCount}: ${response.status}`);
  }

  // Record telemetry overhead
  telemetryOverhead.add(duration - response.timings.duration);
}

function runCacheHealthCheck(): void {
  const params = {
    tags: {
      testType: "soak-test",
      endpoint: "/health/cache",
      operation_type: "cache_health",
    },
    timeout: config.timeout,
  };

  const response = http.get(`${config.baseUrl}/health/cache`, params);

  const isSuccessful = check(response, {
    "cache health status is 200": (r) => r.status === 200,
    "cache stats available": (r) => {
      try {
        const body = JSON.parse(r.body as string);
        return body.stats !== undefined;
      } catch {
        return false;
      }
    },
  });

  if (isSuccessful && response.status === 200) {
    try {
      const body = JSON.parse(response.body as string);
      if (body.stats) {
        const totalOps = (body.stats.hits || 0) + (body.stats.misses || 0);
        if (totalOps > 0) {
          const hitRate = body.stats.hits / totalOps;
          recordCacheMetrics(hitRate > 0.5); // Track if cache is performing well
        }
      }
    } catch {
      // Ignore parse errors
    }
  }
}

function runGraphQLOperation(): void {
  try {
    const allOperations = getAllOperations();
    const operation = allOperations[Math.floor(Math.random() * allOperations.length)];
    const queryData = getQueryWithVariables(operation);

    const startTime = Date.now();

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
          test_type: "soak",
          operation_type: queryData.complexity,
        },
      }
    );

    const duration = Date.now() - startTime;

    const isValid = check(response, {
      "GraphQL status is 200": (r) => r.status === 200,
      "GraphQL response time acceptable": (r) => {
        const budget = queryData.complexity === "complex" ? 2000 : 500;
        const withinBudget = r.timings.duration < budget;
        if (!withinBudget) {
          performanceBudgetViolations.add(1, {
            operation,
            actual: r.timings.duration.toString(),
            budget: budget.toString(),
          });
        }
        return withinBudget;
      },
      "GraphQL has data": (r) => {
        try {
          const body = JSON.parse(r.body as string);
          return body.data !== undefined || body.errors !== undefined;
        } catch {
          return false;
        }
      },
    });

    if (!isValid) {
      console.warn(`Soak test degradation at iteration ${iterationCount}, operation: ${operation}`);
    }

    // Track telemetry overhead
    telemetryOverhead.add(duration - response.timings.duration);
  } catch (error) {
    console.error(`Soak test error at iteration ${iterationCount}:`, error);
  }
}

export function handleSummary(data: object): object {
  return {
    "soak-test-summary.json": JSON.stringify(
      {
        testType: "soak",
        duration: "3h",
        iterations: iterationCount,
        summary: data,
      },
      null,
      2
    ),
  };
}
