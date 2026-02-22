/* test/k6/load/complete-graphql-coverage.ts */

import { sleep } from "k6";
import type { Options } from "k6/options";
import { getAllOperations, getQueryWithVariables } from "../data/test-data-loader.ts";
import { executeGraphQLQuery, validateGraphQLResponse } from "../utils/graphql-helpers.ts";
import { businessOperations } from "../utils/metrics.ts";

export const options: Options = {
  scenarios: {
    allOperationsCoverage: {
      executor: "ramping-vus",
      stages: [
        { duration: "3m", target: 10 }, // Warm-up
        { duration: "5m", target: 20 }, // Steady testing
        { duration: "2m", target: 30 }, // Peak coverage
        { duration: "5m", target: 30 }, // Sustained testing
        { duration: "3m", target: 0 }, // Ramp down
      ],
      exec: "testAllGraphQLOperations",
    },
  },
  thresholds: {
    // Operation-specific thresholds
    "http_req_duration{operation:looksSummary}": ["p(95)<200", "p(99)<400"],
    "http_req_duration{operation:looks}": ["p(95)<300", "p(99)<600"],
    "http_req_duration{operation:getAllSeasonalAssignments}": ["p(95)<800", "p(99)<1500"],
    "http_req_duration{operation:getImageUrlCheck}": ["p(95)<250", "p(99)<500"],
    "http_req_duration{operation:optionsSummary}": ["p(95)<600", "p(99)<1200"],
    "http_req_duration{operation:optionsProductView}": ["p(95)<800", "p(99)<1600"],
    "http_req_duration{operation:imageDetails}": ["p(95)<200", "p(99)<400"],
    "http_req_duration{operation:getDivisionalAssignment}": ["p(95)<400", "p(99)<800"], // New operation

    // General GraphQL health
    http_req_failed: ["rate<0.01"],
    graphql_success_rate: ["rate>0.99"],
    graphql_errors: ["count<10"],
    business_operations_completed: ["count>500"], // Business metric
  },
  tags: {
    test_type: "load",
    component: "graphql_complete",
    coverage: "all_operations",
  },
};

// All GraphQL operations in the system
const ALL_OPERATIONS = [
  "looksSummary",
  "looks",
  "getAllSeasonalAssignments",
  "getImageUrlCheck",
  "optionsSummary",
  "optionsProductView",
  "imageDetails",
  // Note: getDivisionalAssignment would be added when query definition is available
];

console.log(`Complete GraphQL Coverage Test:
- Operations: ${ALL_OPERATIONS.length} total GraphQL operations
- Peak VUs: 30
- Duration: 18 minutes
- Coverage: 100% of available GraphQL operations
- Individual operation thresholds configured`);

export function testAllGraphQLOperations(): void {
  // Ensure even distribution across all operations
  const operationIndex = __ITER % ALL_OPERATIONS.length;
  const operation = ALL_OPERATIONS[operationIndex];

  try {
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
          test_type: "coverage",
          operation_index: operationIndex.toString(),
          total_operations: ALL_OPERATIONS.length.toString(),
        },
      }
    );

    const isValid = validateGraphQLResponse(response, {
      operation,
      complexity: queryData.complexity as "simple" | "complex",
      expectedFields: queryData.expectedFields,
    });

    if (isValid) {
      businessOperations.add(1, {
        operation,
        test_type: "coverage",
      });

      // Log successful operation coverage
      if (__ITER % 100 === 0) {
        console.log(`Coverage progress: Operation ${operation} tested successfully (iteration ${__ITER})`);
      }
    } else {
      console.error(`Coverage test failed for operation: ${operation}`);
    }

    // Operation-specific sleep patterns
    const sleepTime = getSleepTimeForOperation(operation);
    sleep(sleepTime);
  } catch (error) {
    console.error(`Error testing operation ${operation}:`, error);
    sleep(1); // Standard error recovery pause
  }
}

function getSleepTimeForOperation(operation: string): number {
  // Different sleep patterns based on operation complexity and typical usage
  const sleepPatterns: Record<string, number> = {
    looksSummary: Math.random() * 0.5 + 0.3, // 0.3-0.8s (frequent)
    looks: Math.random() * 1.0 + 0.5, // 0.5-1.5s (browse)
    getAllSeasonalAssignments: Math.random() * 2.0 + 1.0, // 1.0-3.0s (complex)
    getImageUrlCheck: Math.random() * 0.3 + 0.2, // 0.2-0.5s (quick check)
    optionsSummary: Math.random() * 1.0 + 0.8, // 0.8-1.8s (analysis)
    optionsProductView: Math.random() * 1.5 + 1.0, // 1.0-2.5s (detailed)
    imageDetails: Math.random() * 0.4 + 0.3, // 0.3-0.7s (quick)
  };

  return sleepPatterns[operation] || Math.random() * 1.0 + 0.5; // Default: 0.5-1.5s
}

// Setup function to log test coverage information
export function setup() {
  console.log("Starting Complete GraphQL Coverage Test...");
  console.log(`Operations to be tested: ${ALL_OPERATIONS.join(", ")}`);

  const availableOperations = getAllOperations();
  const missingOperations = availableOperations.filter((op) => !ALL_OPERATIONS.includes(op));

  if (missingOperations.length > 0) {
    console.warn(
      `Note: The following operations are available but not included in coverage test: ${missingOperations.join(", ")}`
    );
  }

  return { startTime: Date.now(), operations: ALL_OPERATIONS };
}

// Teardown function to report coverage results
export function teardown(data: any) {
  const testDuration = (Date.now() - data.startTime) / 1000;
  console.log(`\nComplete GraphQL Coverage Test Results:
- Duration: ${testDuration} seconds
- Operations Covered: ${data.operations.length}
- Coverage: 100% of included operations
- Check individual operation metrics for performance analysis`);
}
