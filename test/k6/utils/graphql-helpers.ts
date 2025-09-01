/* test/k6/utils/graphql-helpers.ts */

import { check } from "k6";
import http, { type Response } from "k6/http";
import { commonParams, getGraphQLEndpoint } from "./config.ts";
import { type GraphQLOperationMetrics, recordGraphQLOperation } from "./metrics.ts";

export interface GraphQLQuery {
  query: string;
  variables?: Record<string, any>;
  operationName?: string;
}

export interface GraphQLResponse {
  data?: any;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
  }>;
  extensions?: any;
}

export interface GraphQLTestOptions {
  operation: string;
  complexity?: "simple" | "complex";
  timeout?: string;
  tags?: Record<string, string>;
  expectedFields?: string[];
}

export const executeGraphQLQuery = (query: GraphQLQuery, options: GraphQLTestOptions): Response => {
  const startTime = Date.now();

  const payload = JSON.stringify({
    query: query.query,
    variables: query.variables || {},
    operationName: query.operationName,
  });

  const params = {
    ...commonParams,
    tags: {
      testType: "graphql",
      operation: options.operation,
      complexity: options.complexity || "simple",
      ...options.tags,
    },
    timeout: options.timeout || commonParams.timeout,
  };

  const response = http.post(getGraphQLEndpoint(), payload, params);
  const duration = Date.now() - startTime;

  // Record metrics
  const success = response.status === 200 && !hasGraphQLErrors(response);
  const graphqlResponse = parseGraphQLResponse(response);

  const metrics: GraphQLOperationMetrics = {
    operation: options.operation,
    duration,
    success,
    complexity: options.complexity,
    errors: graphqlResponse?.errors,
  };

  recordGraphQLOperation(metrics);

  return response;
};

export const parseGraphQLResponse = (response: Response): GraphQLResponse | null => {
  try {
    return JSON.parse(response.body as string) as GraphQLResponse;
  } catch (e) {
    console.error(`Failed to parse GraphQL response: ${response.body}`);
    return null;
  }
};

export const hasGraphQLErrors = (response: Response): boolean => {
  const graphqlResponse = parseGraphQLResponse(response);
  return !!(graphqlResponse?.errors && graphqlResponse.errors.length > 0);
};

export const validateGraphQLResponse = (response: Response, options: GraphQLTestOptions): boolean => {
  const checks = {
    "is status 200": (r: Response) => r.status === 200,
    "is valid JSON": (r: Response) => {
      try {
        JSON.parse(r.body as string);
        return true;
      } catch {
        console.error(`Invalid JSON response for ${options.operation}: ${r.body}`);
        return false;
      }
    },
    "no GraphQL errors": (r: Response) => {
      const graphqlResponse = parseGraphQLResponse(r);
      if (graphqlResponse?.errors && graphqlResponse.errors.length > 0) {
        console.error(`GraphQL errors in ${options.operation}:`, graphqlResponse.errors);
        return false;
      }
      return true;
    },
    "has data field": (r: Response) => {
      const graphqlResponse = parseGraphQLResponse(r);
      return !!graphqlResponse?.data;
    },
  };

  // Add expected field validation if provided
  if (options.expectedFields && options.expectedFields.length > 0) {
    checks[`has expected fields`] = (r: Response) => {
      const graphqlResponse = parseGraphQLResponse(r);
      if (!graphqlResponse?.data) return false;

      return options.expectedFields!.every((field) => {
        const hasField = hasNestedField(graphqlResponse.data, field);
        if (!hasField) {
          console.error(`Missing expected field '${field}' in ${options.operation} response`);
        }
        return hasField;
      });
    };
  }

  const result = check(response, checks);

  if (response.status !== 200 || hasGraphQLErrors(response)) {
    console.error(`GraphQL ${options.operation} failed:`, {
      status: response.status,
      body: response.body,
      duration: response.timings.duration,
    });
  }

  return result;
};

const hasNestedField = (obj: any, fieldPath: string): boolean => {
  const fields = fieldPath.split(".");
  let current = obj;

  for (const field of fields) {
    if (current === null || current === undefined || !(field in current)) {
      return false;
    }
    current = current[field];
  }

  return true;
};

export const createRandomSelector = <T>(items: T[]): (() => T) => {
  return () => items[Math.floor(Math.random() * items.length)];
};

export const generateQueryVariables = (
  template: Record<string, any>,
  selectors: Record<string, () => any>
): Record<string, any> => {
  const variables: Record<string, any> = {};

  for (const [key, value] of Object.entries(template)) {
    if (typeof value === "string" && value.startsWith("${") && value.endsWith("}")) {
      const selectorKey = value.slice(2, -1);
      if (selectors[selectorKey]) {
        variables[key] = selectors[selectorKey]();
      } else {
        console.warn(`No selector found for variable: ${selectorKey}`);
        variables[key] = value;
      }
    } else {
      variables[key] = value;
    }
  }

  return variables;
};

export const measureQueryComplexity = (query: string): "simple" | "complex" => {
  const depth = (query.match(/{/g) || []).length;
  const fieldCount = (query.match(/\w+:/g) || []).length;

  // Simple heuristic: complex if deeply nested or many fields
  if (depth > 3 || fieldCount > 10) {
    return "complex";
  }

  return "simple";
};
