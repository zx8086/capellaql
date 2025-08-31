/* test/k6/load/graphql-endpoints-modern.ts */

import { sleep } from 'k6';
import { Options } from 'k6/options';
import { SharedArray } from 'k6/data';
import { performanceThresholds } from '../utils/config.ts';
import { executeGraphQLQuery, validateGraphQLResponse } from '../utils/graphql-helpers.ts';
import { getQueryWithVariables } from '../data/test-data-loader.ts';

// Load test data using SharedArray for memory efficiency
const brands = new SharedArray('brands-graphql', function() {
  return JSON.parse(open('../data/brands.json'));
});

const seasons = ['C51', 'C52'];

export const options: Options = {
  scenarios: {
    looksSummary: {
      executor: 'ramping-vus',
      stages: [
        { duration: '30s', target: 5 },   // Warm-up
        { duration: '1m', target: 10 },   // Ramp-up
        { duration: '2m', target: 10 },   // Steady state
        { duration: '30s', target: 0 }    // Ramp-down
      ],
      exec: 'runLooksSummaryScenario',
      tags: { operation: 'looksSummary' }
    },
    seasonalAssignments: {
      executor: 'ramping-vus',
      stages: [
        { duration: '30s', target: 5 },   // Warm-up
        { duration: '1m', target: 10 },   // Ramp-up
        { duration: '2m', target: 10 },   // Steady state
        { duration: '30s', target: 0 }    // Ramp-down
      ],
      exec: 'runSeasonalAssignmentsScenario',
      tags: { operation: 'seasonalAssignments' }
    },
    imageUrlCheck: {
      executor: 'ramping-vus',
      stages: [
        { duration: '30s', target: 3 },   // Warm-up
        { duration: '1m', target: 7 },    // Ramp-up
        { duration: '2m', target: 7 },    // Steady state
        { duration: '30s', target: 0 }    // Ramp-down
      ],
      exec: 'runImageUrlCheckScenario',
      tags: { operation: 'imageUrlCheck' }
    }
  },
  thresholds: {
    'http_req_duration{operation:looksSummary}': performanceThresholds.graphql.simple,
    'http_req_duration{operation:seasonalAssignments}': performanceThresholds.graphql.complex,
    'http_req_duration{operation:imageUrlCheck}': performanceThresholds.graphql.simple,
    http_req_failed: performanceThresholds.errors.load,
    graphql_success_rate: ['rate>0.99']
  },
  tags: {
    test_type: 'load',
    component: 'graphql_endpoints',
    version: 'modern'
  }
};

console.log(`Modern GraphQL Endpoints Test:
- Scenarios: looksSummary, seasonalAssignments, imageUrlCheck
- Uses TypeScript, SharedArray, and modern K6 patterns
- Individual thresholds per operation type
- Total VUs: Up to 27 concurrent (10+10+7)`);

export function runLooksSummaryScenario(): void {
  try {
    const queryData = getQueryWithVariables('looksSummary');
    
    const response = executeGraphQLQuery(
      {
        query: queryData.query,
        variables: queryData.variables
      },
      {
        operation: 'looksSummary',
        complexity: 'simple',
        expectedFields: queryData.expectedFields,
        tags: {
          scenario: 'looksSummary',
          brand: queryData.variables.brand
        }
      }
    );

    const isValid = validateGraphQLResponse(response, {
      operation: 'looksSummary',
      complexity: 'simple',
      expectedFields: queryData.expectedFields
    });

    if (!isValid) {
      console.error(`looksSummary scenario failed for brand: ${queryData.variables.brand}`);
    }

  } catch (error) {
    console.error('Error in looksSummary scenario:', error);
  }

  sleep(Math.random() * 1 + 0.5); // 0.5-1.5 seconds
}

export function runSeasonalAssignmentsScenario(): void {
  try {
    const queryData = getQueryWithVariables('getAllSeasonalAssignments');
    
    const response = executeGraphQLQuery(
      {
        query: queryData.query,
        variables: queryData.variables
      },
      {
        operation: 'getAllSeasonalAssignments',
        complexity: 'complex',
        expectedFields: queryData.expectedFields,
        tags: {
          scenario: 'seasonalAssignments',
          styleSeasonCode: queryData.variables.styleSeasonCode
        }
      }
    );

    const isValid = validateGraphQLResponse(response, {
      operation: 'getAllSeasonalAssignments',
      complexity: 'complex',
      expectedFields: queryData.expectedFields
    });

    if (!isValid) {
      console.error(`seasonalAssignments scenario failed for season: ${queryData.variables.styleSeasonCode}`);
    }

  } catch (error) {
    console.error('Error in seasonalAssignments scenario:', error);
  }

  sleep(Math.random() * 2 + 1); // 1-3 seconds (complex operation)
}

export function runImageUrlCheckScenario(): void {
  try {
    const queryData = getQueryWithVariables('getImageUrlCheck');
    
    const response = executeGraphQLQuery(
      {
        query: queryData.query,
        variables: queryData.variables
      },
      {
        operation: 'getImageUrlCheck',
        complexity: 'simple',
        expectedFields: queryData.expectedFields,
        tags: {
          scenario: 'imageUrlCheck',
          divisionCount: queryData.variables.divisions.length.toString()
        }
      }
    );

    const isValid = validateGraphQLResponse(response, {
      operation: 'getImageUrlCheck',
      complexity: 'simple',
      expectedFields: queryData.expectedFields
    });

    if (!isValid) {
      console.error(`imageUrlCheck scenario failed for divisions: ${queryData.variables.divisions.join(',')}`);
    }

  } catch (error) {
    console.error('Error in imageUrlCheck scenario:', error);
  }

  sleep(Math.random() * 0.8 + 0.4); // 0.4-1.2 seconds (quick check)
}