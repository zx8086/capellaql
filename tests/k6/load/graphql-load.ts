/* test/k6/load/graphql-load.ts */

import { sleep } from "k6";
import { getQueryWithVariables } from "../data/test-data-loader.ts";
import { executeGraphQLQuery, validateGraphQLResponse } from "../utils/graphql-helpers.ts";

const simpleOperations = ["looksSummary", "looks", "getImageUrlCheck", "imageDetails"];
const complexOperations = ["getAllSeasonalAssignments", "optionsSummary", "optionsProductView"];

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
