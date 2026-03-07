/* test/k6/smoke/graphql-smoke.ts */

import { sleep } from "k6";
import { getQueryWithVariables } from "../data/test-data-loader.ts";
import { executeGraphQLQuery, validateGraphQLResponse } from "../utils/graphql-helpers.ts";

export function graphqlSmokeTest(): void {
  // Test a subset of operations for smoke testing
  const smokeOperations = ["looksSummary", "looks", "getAllSeasonalAssignments"];
  const operation = smokeOperations[Math.floor(Math.random() * smokeOperations.length)];

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
          test_type: "smoke",
          operation_type: queryData.complexity,
        },
      }
    );

    const isValid = validateGraphQLResponse(response, {
      operation,
      complexity: queryData.complexity as "simple" | "complex",
      expectedFields: queryData.expectedFields,
    });

    if (!isValid) {
      console.error(`GraphQL smoke test failed for operation: ${operation}`);
    }
  } catch (error) {
    console.error(`Error in GraphQL smoke test:`, error);
  }

  // Brief pause between requests
  sleep(Math.random() * 2 + 1); // 1-3 seconds
}
