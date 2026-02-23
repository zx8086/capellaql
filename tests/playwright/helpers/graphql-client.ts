/* tests/playwright/helpers/graphql-client.ts - GraphQL Test Utilities */

import { type APIRequestContext, expect } from "@playwright/test";

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

export interface LookSummary {
  hasDeliveryName: number;
  hasDescription: number;
  hasGender: number;
  hasRelatedStyles: number;
  hasTag: number;
  hasTitle: number;
  hasTrend: number;
  totalLooks: number;
}

export interface LooksSummaryResponse {
  looksSummary: LookSummary;
}

export interface UrlSuffixesResult {
  divisionCode: string;
  urls: string[];
}

export interface GetLooksUrlCheckResponse {
  getLooksUrlCheck: UrlSuffixesResult[];
}

export interface GetImageUrlCheckResponse {
  getImageUrlCheck: UrlSuffixesResult[];
}

/**
 * Execute a GraphQL query against the API with retry logic
 */
export async function executeGraphQL<T>(
  request: APIRequestContext,
  query: string,
  variables?: Record<string, unknown>,
  options?: { skipCache?: boolean; maxRetries?: number; retryDelayMs?: number }
): Promise<GraphQLResponse<T>> {
  const headers: Record<string, string> = {};
  const maxRetries = options?.maxRetries ?? 3;
  const retryDelayMs = options?.retryDelayMs ?? 100;

  // Add cache bypass header for testing - ensures requests always hit the backend
  if (options?.skipCache !== false) {
    headers["x-no-cache"] = "true";
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await request.post("/graphql", {
        data: { query, variables },
        headers,
      });
      expect(response.status()).toBe(200);
      const result: GraphQLResponse<T> = await response.json();

      // Retry on internal server failure (transient errors)
      if (result.errors?.some((e) => e.message === "internal server failure") && attempt < maxRetries) {
        await sleep(retryDelayMs * attempt);
        continue;
      }

      return result;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        await sleep(retryDelayMs * attempt);
      }
    }
  }

  throw lastError || new Error("GraphQL request failed after retries");
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
 * GraphQL query for fetching looks summary statistics
 */
export const LOOKS_SUMMARY_QUERY = `
  query LooksSummary($brand: String, $division: String, $season: String) {
    looksSummary(brand: $brand, division: $division, season: $season) {
      hasDeliveryName
      hasDescription
      hasGender
      hasRelatedStyles
      hasTag
      hasTitle
      hasTrend
      totalLooks
    }
  }
`;

/**
 * GraphQL query for fetching looks URL suffixes by division
 */
export const GET_LOOKS_URL_CHECK_QUERY = `
  query GetLooksUrlCheck($divisions: [String!]!, $season: String!) {
    getLooksUrlCheck(divisions: $divisions, season: $season) {
      divisionCode
      urls
    }
  }
`;

/**
 * GraphQL query for fetching image URL suffixes by division
 */
export const GET_IMAGE_URL_CHECK_QUERY = `
  query GetImageUrlCheck($divisions: [String!]!, $season: String!) {
    getImageUrlCheck(divisions: $divisions, season: $season) {
      divisionCode
      urls
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
 * Validate LookSummary object structure
 */
export function validateLookSummaryStructure(summary: LookSummary): void {
  const expectedFields = [
    "hasDeliveryName",
    "hasDescription",
    "hasGender",
    "hasRelatedStyles",
    "hasTag",
    "hasTitle",
    "hasTrend",
    "totalLooks",
  ];

  for (const field of expectedFields) {
    expect(summary).toHaveProperty(field);
  }

  // Type validation - all fields should be numbers
  expect(typeof summary.hasDeliveryName).toBe("number");
  expect(typeof summary.hasDescription).toBe("number");
  expect(typeof summary.hasGender).toBe("number");
  expect(typeof summary.hasRelatedStyles).toBe("number");
  expect(typeof summary.hasTag).toBe("number");
  expect(typeof summary.hasTitle).toBe("number");
  expect(typeof summary.hasTrend).toBe("number");
  expect(typeof summary.totalLooks).toBe("number");

  // Values should be non-negative
  expect(summary.totalLooks).toBeGreaterThanOrEqual(0);
}

/**
 * Validate UrlSuffixesResult object structure
 */
export function validateUrlSuffixesResultStructure(result: UrlSuffixesResult): void {
  expect(result).toHaveProperty("divisionCode");
  expect(result).toHaveProperty("urls");

  // Type validation
  expect(typeof result.divisionCode).toBe("string");
  expect(Array.isArray(result.urls)).toBe(true);

  // Each URL should be a string
  for (const url of result.urls) {
    expect(typeof url).toBe("string");
  }
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
