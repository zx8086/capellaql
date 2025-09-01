/* test/k6/load/graphql-load.ts */

import { sleep } from "k6";
import type { Options } from "k6/options";
import { getAllOperations, getQueryWithVariables } from "../data/test-data-loader.ts";
import { performanceThresholds } from "../utils/config.ts";
import { executeGraphQLQuery, validateGraphQLResponse } from "../utils/graphql-helpers.ts";

export const options: Options = {
  scenarios: {
    simpleQueries: {
      executor: "ramping-vus",
      stages: [
        { duration: "2m", target: 10 }, // Warm-up
        { duration: "5m", target: 20 }, // Steady state
        { duration: "2m", target: 30 }, // Peak
        { duration: "3m", target: 30 }, // Hold peak
        { duration: "3m", target: 0 }, // Ramp down
      ],
      exec: "runSimpleQueries",
      tags: { operation_type: "simple" },
    },
    complexQueries: {
      executor: "ramping-vus",
      stages: [
        { duration: "3m", target: 5 }, // Warm-up
        { duration: "5m", target: 10 }, // Steady state
        { duration: "2m", target: 15 }, // Peak
        { duration: "3m", target: 15 }, // Hold peak
        { duration: "2m", target: 0 }, // Ramp down
      ],
      exec: "runComplexQueries",
      tags: { operation_type: "complex" },
    },
  },
  thresholds: {
    "http_req_duration{operation_type:simple}": performanceThresholds.graphql.simple,
    "http_req_duration{operation_type:complex}": performanceThresholds.graphql.complex,
    http_req_failed: performanceThresholds.errors.load,
    graphql_success_rate: ["rate>0.98"],
    graphql_errors: ["count<20"],
  },
  tags: {
    test_type: "load",
    component: "graphql",
  },
};

const simpleOperations = ["looksSummary", "looks", "getImageUrlCheck", "imageDetails"];
const complexOperations = ["getAllSeasonalAssignments", "optionsSummary", "optionsProductView"];

console.log(`GraphQL Load Test Configuration:
- Simple Queries: Peak 30 VUs (${simpleOperations.join(", ")})
- Complex Queries: Peak 15 VUs (${complexOperations.join(", ")})
- Duration: 15 minutes total
- Thresholds: Simple P95<200ms, Complex P95<1000ms`);

export function runSimpleQueries(): void {
  const operation = simpleOperations[Math.floor(Math.random() * simpleOperations.length)];
  executeOperation(operation, "simple");
  sleep(Math.random() * 1 + 0.5); // 0.5-1.5 seconds
}

export function runComplexQueries(): void {
  const operation = complexOperations[Math.floor(Math.random() * complexOperations.length)];
  executeOperation(operation, "complex");
  sleep(Math.random() * 2 + 1); // 1-3 seconds
}

function executeOperation(operation: string, expectedComplexity: "simple" | "complex"): void {
  try {
    const queryData = getQueryWithVariables(operation);

    const response = executeGraphQLQuery(
      {
        query: queryData.query,
        variables: queryData.variables,
      },
      {
        operation,
        complexity: expectedComplexity,
        expectedFields: queryData.expectedFields,
        tags: {
          test_type: "load",
          operation_type: expectedComplexity,
        },
      }
    );

    const isValid = validateGraphQLResponse(response, {
      operation,
      complexity: expectedComplexity,
      expectedFields: queryData.expectedFields,
    });

    if (!isValid) {
      console.error(`GraphQL load test failed for operation: ${operation}`);
    }
  } catch (error) {
    console.error(`Error in GraphQL load test for ${operation}:`, error);
  }
}
