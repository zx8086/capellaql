/* test/k6/smoke/graphql-smoke.ts */

import { sleep } from 'k6';
import { Options } from 'k6/options';
import { performanceThresholds } from '../utils/config.js';
import { executeGraphQLQuery, validateGraphQLResponse } from '../utils/graphql-helpers.ts';
import { getQueryWithVariables, getAllOperations } from '../data/test-data-loader.ts';

export const options: Options = {
  vus: 2,
  duration: '2m',
  thresholds: {
    http_req_duration: performanceThresholds.graphql.simple,
    http_req_failed: performanceThresholds.errors.smoke,
    graphql_success_rate: ['rate>0.99'],
    graphql_errors: ['count<5']
  },
  tags: {
    test_type: 'smoke',
    component: 'graphql'
  }
};

console.log(`GraphQL Smoke Test Configuration:
- VUs: ${options.vus}
- Duration: ${options.duration}
- Testing ${getAllOperations().length} GraphQL operations
- Thresholds: P95<200ms, P99<500ms`);

export default function graphqlSmokeTest(): void {
  // Test a subset of operations for smoke testing
  const smokeOperations = ['looksSummary', 'looks', 'getAllSeasonalAssignments'];
  const operation = smokeOperations[Math.floor(Math.random() * smokeOperations.length)];
  
  try {
    const queryData = getQueryWithVariables(operation);
    
    const response = executeGraphQLQuery(
      {
        query: queryData.query,
        variables: queryData.variables
      },
      {
        operation,
        complexity: queryData.complexity as 'simple' | 'complex',
        expectedFields: queryData.expectedFields,
        tags: {
          test_type: 'smoke',
          operation_type: queryData.complexity
        }
      }
    );

    const isValid = validateGraphQLResponse(response, {
      operation,
      complexity: queryData.complexity as 'simple' | 'complex',
      expectedFields: queryData.expectedFields
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