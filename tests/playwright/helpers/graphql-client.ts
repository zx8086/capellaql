/* tests/playwright/helpers/graphql-client.ts - GraphQL Test Utilities */

import { expect, type APIRequestContext } from "@playwright/test";

export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{
    message: string;
    path?: string[];
    extensions?: Record<string, unknown>;
  }>;
}

export interface Look {
  documentKey: string;
  divisionCode: string;
  lookType: string;
  assetUrl: string;
  title: string;
  trend: string;
  relatedStyles: string[];
  isDeleted: boolean;
}

export interface LooksQueryResponse {
  looks: Look[];
}

export interface BucketScopeCollection {
  bucket: string;
  scope: string;
  collection: string;
}

export interface DocumentResult {
  bucket: string;
  scope: string;
  collection: string;
  data: Record<string, unknown> | null;
  timeTaken: number;
  error?: string;
}

export interface SearchDocumentsResponse {
  searchDocuments: DocumentResult[];
}

/**
 * Execute a GraphQL query against the API
 */
export async function executeGraphQL<T>(
  request: APIRequestContext,
  query: string,
  variables?: Record<string, unknown>,
  options?: { skipCache?: boolean }
): Promise<GraphQLResponse<T>> {
  const headers: Record<string, string> = {};

  // Add cache bypass header for testing - ensures requests always hit the backend
  if (options?.skipCache !== false) {
    headers["x-no-cache"] = "true";
  }

  const response = await request.post("/graphql", {
    data: { query, variables },
    headers,
  });
  expect(response.status()).toBe(200);
  return response.json();
}

/**
 * Execute a GraphQL query and validate no errors
 */
export async function executeGraphQLNoErrors<T>(
  request: APIRequestContext,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const result = await executeGraphQL<T>(request, query, variables);
  expect(result.errors).toBeUndefined();
  expect(result.data).toBeDefined();
  return result.data as T;
}

/**
 * GraphQL query for fetching looks
 */
export const LOOKS_QUERY = `
  query Looks($brand: String, $season: String, $division: String) {
    looks(brand: $brand, season: $season, division: $division) {
      documentKey
      divisionCode
      lookType
      assetUrl
      title
      trend
      relatedStyles
      isDeleted
    }
  }
`;

/**
 * GraphQL query for searching documents across collections
 */
export const SEARCH_DOCUMENTS_QUERY = `
  query SearchDocuments($collections: [BucketScopeCollection!]!, $keys: [String!]!) {
    searchDocuments(collections: $collections, keys: $keys) {
      bucket
      scope
      collection
      data
      timeTaken
    }
  }
`;

/**
 * Validate Look object structure
 */
export function validateLookStructure(look: Look): void {
  expect(look).toHaveProperty("documentKey");
  expect(look).toHaveProperty("divisionCode");
  expect(look).toHaveProperty("lookType");
  expect(look).toHaveProperty("assetUrl");
  expect(look).toHaveProperty("title");
  expect(look).toHaveProperty("trend");
  expect(look).toHaveProperty("relatedStyles");
  expect(look).toHaveProperty("isDeleted");

  // Type validation
  expect(typeof look.documentKey).toBe("string");
  expect(typeof look.divisionCode).toBe("string");
  expect(typeof look.isDeleted).toBe("boolean");
  expect(Array.isArray(look.relatedStyles)).toBe(true);
}

/**
 * Validate DocumentResult object structure
 */
export function validateDocumentResultStructure(result: DocumentResult): void {
  expect(result).toHaveProperty("bucket");
  expect(result).toHaveProperty("scope");
  expect(result).toHaveProperty("collection");
  expect(result).toHaveProperty("timeTaken");

  // Type validation
  expect(typeof result.bucket).toBe("string");
  expect(typeof result.scope).toBe("string");
  expect(typeof result.collection).toBe("string");
  expect(typeof result.timeTaken).toBe("number");
}

/**
 * Measure query execution time
 */
export async function measureQueryTime<T>(
  request: APIRequestContext,
  query: string,
  variables?: Record<string, unknown>,
  options?: { skipCache?: boolean }
): Promise<{ result: GraphQLResponse<T>; durationMs: number }> {
  const start = Date.now();
  const result = await executeGraphQL<T>(request, query, variables, options);
  const durationMs = Date.now() - start;
  return { result, durationMs };
}
