/* tests/k6/spike/spike-test.ts */
/* Per migrate/docs: Spike testing for sudden traffic surge simulation */
/* Platform QA Component compatible - supports PEAK_VUS, RAMP_UP, SUSTAIN env vars */

import { check, sleep } from "k6";
import http from "k6/http";
import type { Options } from "k6/options";
import { getAllOperations, getQueryWithVariables } from "../data/test-data-loader.ts";
import { getConfig, getStressConfig, getHealthEndpoint, performanceThresholds } from "../utils/config.ts";
import { executeGraphQLQuery } from "../utils/graphql-helpers.ts";
import { httpErrors, httpSuccessRate, performanceBudgetViolations } from "../utils/metrics.ts";

// Platform QA Component dynamic configuration
const stressConfig = getStressConfig();
const peakVUs = stressConfig.peakVUs;
const moderateVUs = Math.floor(peakVUs / 2);
const baselineVUs = Math.floor(peakVUs / 20);

export const options: Options = {
  stages: [
    { duration: "1m", target: baselineVUs }, // Normal load baseline
    { duration: "30s", target: peakVUs }, // Sudden spike!
    { duration: stressConfig.sustain, target: peakVUs }, // Stay at peak (platform configurable)
    { duration: "30s", target: baselineVUs }, // Sudden drop
    { duration: "2m", target: baselineVUs }, // Recovery period
    { duration: "30s", target: moderateVUs }, // Another spike
    { duration: "1m", target: moderateVUs }, // Moderate sustained
    { duration: "30s", target: baselineVUs }, // Back to normal
    { duration: "1m", target: 0 }, // Cool down
  ],
  thresholds: {
    http_req_duration: performanceThresholds.health.spike,
    "http_req_duration{operation_type:simple}": ["p(95)<500", "p(99)<1000"],
    "http_req_duration{operation_type:complex}": ["p(95)<2500", "p(99)<5000"],
    http_req_failed: ["rate<0.10"], // Allow up to 10% failures during spikes
    graphql_success_rate: ["rate>0.90"], // More lenient during spikes
    http_errors: ["count<500"], // Monitor total errors
  },
  tags: {
    test_type: "spike",
    component: "system",
  },
};

const config = getConfig();
console.log(`Spike Test Configuration:
- Pattern: Multiple traffic spikes (${baselineVUs} -> ${peakVUs} -> ${baselineVUs} -> ${moderateVUs} -> ${baselineVUs})
- Peak VUs: ${peakVUs} (configurable via PEAK_VUS env var)
- Sustain duration: ${stressConfig.sustain} (configurable via SUSTAIN env var)
- Base URL: ${config.baseUrl}
- Purpose: Recovery validation, circuit breaker testing, auto-scaling triggers
- Thresholds: Lenient to allow graceful degradation`);

// Track spike patterns for analysis
let currentStage = "baseline";
let stageTransitions = 0;

export function setup(): void {
  console.log("Starting spike test - monitoring system resilience under sudden load changes");
}

export default function spikeTest(): void {
  // Detect stage transitions for logging
  const vuCount = __VU;
  updateStage(vuCount);

  // Mixed workload even during spikes
  const workloadType = Math.random();

  if (workloadType < 0.25) {
    // 25% health checks (critical during spikes)
    runHealthCheck();
  } else {
    // 75% GraphQL operations
    runGraphQLOperation();
  }

  // Minimal sleep during spike to maximize pressure
  sleep(Math.random() * 0.3 + 0.1); // 0.1-0.4 seconds
}

function updateStage(vuCount: number): void {
  let newStage = currentStage;

  if (vuCount >= 150) {
    newStage = "peak-spike";
  } else if (vuCount >= 80) {
    newStage = "moderate-spike";
  } else if (vuCount >= 30) {
    newStage = "ramping";
  } else {
    newStage = "baseline";
  }

  if (newStage !== currentStage) {
    stageTransitions++;
    console.log(`Stage transition #${stageTransitions}: ${currentStage} -> ${newStage} (VUs: ${vuCount})`);
    currentStage = newStage;
  }
}

function runHealthCheck(): void {
  const params = {
    tags: {
      testType: "spike-test",
      endpoint: "/health",
      operation_type: "health",
      spike_stage: currentStage,
    },
    timeout: "10s", // Longer timeout during spikes
  };

  const response = http.get(getHealthEndpoint(), params);
  httpSuccessRate.add(response.status === 200);

  const isSuccessful = check(response, {
    "health returns (any status)": (r) => r.status > 0,
    "health status is 200": (r) => r.status === 200,
    "health response time < 300ms": (r) => r.timings.duration < 300,
    "health response time < 750ms (lenient)": (r) => r.timings.duration < 750,
  });

  if (!isSuccessful) {
    httpErrors.add(1, { endpoint: "health", stage: currentStage });

    // Log degradation during spikes
    if (currentStage.includes("spike")) {
      console.warn(`Health check degradation during ${currentStage}: status=${response.status}, duration=${response.timings.duration}ms`);
    }
  }
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
          test_type: "spike",
          operation_type: queryData.complexity,
          spike_stage: currentStage,
        },
      }
    );

    // More lenient validation during spike stages
    const thresholds = currentStage.includes("spike")
      ? { simple: 1000, complex: 5000 }
      : { simple: 500, complex: 2000 };

    const budget = queryData.complexity === "complex" ? thresholds.complex : thresholds.simple;

    const isValid = check(response, {
      "GraphQL returns response": (r) => r.status > 0,
      "GraphQL status is 200": (r) => r.status === 200,
      "GraphQL response time within budget": (r) => {
        const withinBudget = r.timings.duration < budget;
        if (!withinBudget) {
          performanceBudgetViolations.add(1, {
            operation,
            stage: currentStage,
            actual: r.timings.duration.toString(),
            budget: budget.toString(),
          });
        }
        return withinBudget;
      },
    });

    // Track errors with stage context
    if (!isValid && response.status !== 200) {
      httpErrors.add(1, {
        endpoint: "graphql",
        operation,
        stage: currentStage,
        status: response.status.toString(),
      });
    }
  } catch (error) {
    httpErrors.add(1, { endpoint: "graphql", stage: currentStage, type: "exception" });
    console.error(`GraphQL spike test error during ${currentStage}:`, error);
  }
}

export function teardown(): void {
  console.log(`Spike test completed:
  - Total stage transitions: ${stageTransitions}
  - Final stage: ${currentStage}
  - Test validates: Recovery time, circuit breaker behavior, queue handling`);
}

export function handleSummary(data: object): object {
  return {
    "spike-test-summary.json": JSON.stringify(
      {
        testType: "spike",
        stageTransitions,
        summary: data,
      },
      null,
      2
    ),
  };
}
