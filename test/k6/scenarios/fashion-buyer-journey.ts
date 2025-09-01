/* test/k6/scenarios/fashion-buyer-journey.ts */

import { check, sleep } from "k6";
import type { Options } from "k6/options";
import { getQueryWithVariables, getScenarioStep, scenarios } from "../data/test-data-loader.ts";
import { performanceThresholds } from "../utils/config.ts";
import { executeGraphQLQuery, validateGraphQLResponse } from "../utils/graphql-helpers.ts";
import { businessOperations } from "../utils/metrics.ts";

export const options: Options = {
  scenarios: {
    fashionBuyerWorkflow: {
      executor: "ramping-vus",
      stages: [
        { duration: "2m", target: 5 }, // Warm-up
        { duration: "5m", target: 15 }, // Normal activity
        { duration: "3m", target: 25 }, // Peak buying season
        { duration: "5m", target: 25 }, // Sustained activity
        { duration: "2m", target: 10 }, // Wind down
        { duration: "3m", target: 0 }, // Cool down
      ],
      exec: "runFashionBuyerJourney",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<800", "p(99)<1500"],
    http_req_failed: ["rate<0.02"],
    business_operations_completed: ["count>1000"], // Business KPI
    "http_req_duration{operation:looksSummary}": ["p(95)<300"],
    "http_req_duration{operation:looks}": ["p(95)<400"],
    "http_req_duration{operation:optionsSummary}": ["p(95)<600"],
    "http_req_duration{operation:imageDetails}": ["p(95)<200"],
  },
  tags: {
    test_type: "scenario",
    user_type: "fashion_buyer",
  },
};

console.log(`Fashion Buyer Journey Test:
- Scenario: ${scenarios.fashionBuyer.name}
- Peak VUs: 25 concurrent buyers
- Duration: 20 minutes
- Workflow: Browse → Analyze → Purchase Decision`);

export function runFashionBuyerJourney(): void {
  // Start a complete fashion buyer session
  const sessionStart = Date.now();
  let operationsCompleted = 0;

  try {
    // Step 1: Get looks overview (high frequency)
    if (Math.random() < 0.8) {
      // 80% chance
      const success = executeBuyerOperation("looksSummary");
      if (success) operationsCompleted++;
      sleep(Math.random() * 2 + 1); // Think time: 1-3 seconds
    }

    // Step 2: Browse detailed looks (medium frequency)
    if (Math.random() < 0.6) {
      // 60% chance
      const success = executeBuyerOperation("looks");
      if (success) operationsCompleted++;
      sleep(Math.random() * 3 + 2); // Browse time: 2-5 seconds
    }

    // Step 3: Check options for purchasing decisions (medium frequency)
    if (Math.random() < 0.5) {
      // 50% chance
      const success = executeBuyerOperation("optionsSummary");
      if (success) operationsCompleted++;
      sleep(Math.random() * 2 + 1); // Analysis time: 1-3 seconds
    }

    // Step 4: View product images for final decision (lower frequency)
    if (Math.random() < 0.3) {
      // 30% chance
      const success = executeBuyerOperation("imageDetails");
      if (success) operationsCompleted++;
      sleep(Math.random() * 2 + 1); // Image review: 1-3 seconds
    }

    // Record business metrics
    businessOperations.add(operationsCompleted, {
      user_type: "fashion_buyer",
      session_duration: (Date.now() - sessionStart).toString(),
    });

    // Log successful buyer sessions
    if (operationsCompleted >= 2) {
      console.log(`Successful buyer session: ${operationsCompleted} operations completed`);
    }
  } catch (error) {
    console.error("Fashion buyer journey error:", error);
  }

  // Session end pause
  sleep(Math.random() * 3 + 1); // 1-4 seconds between sessions
}

function executeBuyerOperation(operation: string): boolean {
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
          test_type: "scenario",
          user_type: "fashion_buyer",
          workflow_step: getWorkflowStep(operation),
        },
      }
    );

    const isValid = validateGraphQLResponse(response, {
      operation,
      complexity: queryData.complexity as "simple" | "complex",
      expectedFields: queryData.expectedFields,
    });

    // Additional buyer-specific validations
    const buyerValidation = check(response, {
      [`${operation} response time acceptable for buyer`]: (r) => {
        const acceptableTime = operation === "imageDetails" ? 300 : operation === "looksSummary" ? 400 : 600;
        return r.timings.duration < acceptableTime;
      },
      [`${operation} has buyer-relevant data`]: (r) => {
        try {
          const data = JSON.parse(r.body as string)?.data;
          return data && Object.keys(data).length > 0;
        } catch {
          return false;
        }
      },
    });

    return isValid && buyerValidation;
  } catch (error) {
    console.error(`Buyer operation ${operation} failed:`, error);
    return false;
  }
}

function getWorkflowStep(operation: string): string {
  const stepMapping: Record<string, string> = {
    looksSummary: "discovery",
    looks: "browse",
    optionsSummary: "analysis",
    imageDetails: "decision",
  };
  return stepMapping[operation] || "unknown";
}
