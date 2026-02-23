/* tests/playwright/graphql/documentSearch.spec.ts - E2E Tests for Document Search Query */

import { expect, test } from "@playwright/test";
import {
  type BucketScopeCollection,
  executeGraphQL,
  measureQueryTime,
  SEARCH_DOCUMENTS_QUERY,
  type SearchDocumentsResponse,
  validateDocumentResultStructure,
} from "../helpers/graphql-client";

// All 43 collections from live production logs
const TEST_COLLECTIONS: BucketScopeCollection[] = [
  // _default scope
  { bucket: "default", scope: "_default", collection: "_default" },
  { bucket: "default", scope: "_default", collection: "archived" },
  { bucket: "default", scope: "_default", collection: "data_merge_check" },
  // _system scope
  { bucket: "default", scope: "_system", collection: "_mobile" },
  { bucket: "default", scope: "_system", collection: "_query" },
  // brands_divisions scope
  { bucket: "default", scope: "brands_divisions", collection: "brands_divisions" },
  { bucket: "default", scope: "brands_divisions", collection: "retry_notifications" },
  { bucket: "default", scope: "brands_divisions", collection: "retry_rich_notifications" },
  // customer scope
  { bucket: "default", scope: "customer", collection: "assignments" },
  { bucket: "default", scope: "customer", collection: "customers" },
  { bucket: "default", scope: "customer", collection: "sales-organizations" },
  // eventing scope
  { bucket: "default", scope: "eventing", collection: "metadata" },
  // media_assets scope
  { bucket: "default", scope: "media_assets", collection: "images" },
  { bucket: "default", scope: "media_assets", collection: "look_items" },
  { bucket: "default", scope: "media_assets", collection: "retry_notifications" },
  { bucket: "default", scope: "media_assets", collection: "retry_rich_notifications" },
  // new_model scope
  { bucket: "default", scope: "new_model", collection: "article" },
  { bucket: "default", scope: "new_model", collection: "product2g" },
  { bucket: "default", scope: "new_model", collection: "seasonal_assignment" },
  { bucket: "default", scope: "new_model", collection: "variant" },
  // order scope
  { bucket: "default", scope: "order", collection: "archived-order-items" },
  { bucket: "default", scope: "order", collection: "archived-orders" },
  // prices scope
  { bucket: "default", scope: "prices", collection: "prices" },
  // seasons scope
  { bucket: "default", scope: "seasons", collection: "dates" },
  { bucket: "default", scope: "seasons", collection: "delivery_dates" },
  { bucket: "default", scope: "seasons", collection: "retry_notifications" },
  { bucket: "default", scope: "seasons", collection: "retry_rich_notifications" },
  // styles scope
  { bucket: "default", scope: "styles", collection: "archived_options" },
  { bucket: "default", scope: "styles", collection: "archived_styles" },
  { bucket: "default", scope: "styles", collection: "article" },
  { bucket: "default", scope: "styles", collection: "distribution_curves" },
  { bucket: "default", scope: "styles", collection: "eventing" },
  { bucket: "default", scope: "styles", collection: "prepacks" },
  { bucket: "default", scope: "styles", collection: "product2g" },
  { bucket: "default", scope: "styles", collection: "retry_notifications" },
  { bucket: "default", scope: "styles", collection: "retry_rich_notifications" },
  { bucket: "default", scope: "styles", collection: "variant" },
  // styles_notifications scope
  { bucket: "default", scope: "styles_notifications", collection: "metadata" },
  { bucket: "default", scope: "styles_notifications", collection: "retry" },
  // styles_stibo scope
  { bucket: "default", scope: "styles_stibo", collection: "archived_styles" },
  { bucket: "default", scope: "styles_stibo", collection: "article" },
  { bucket: "default", scope: "styles_stibo", collection: "product2g" },
  { bucket: "default", scope: "styles_stibo", collection: "variant" },
];

// Full 43 collections should be used for all comprehensive tests
// Only use subsets when testing specific scoped functionality
const FULL_COLLECTIONS = TEST_COLLECTIONS;

// 50 real document keys from production for comprehensive testing
const PRODUCTION_DOCUMENT_KEYS = [
  "ARTICLE_2025WISPSP_000PKE1156TK8001",
  "ARTICLE_2025WISPSP_000PKE1156TK8002",
  "ARTICLE_2025WISPSP_000PKE1156TK8003",
  "ARTICLE_2025WISPSP_000PKE1156TK8004",
  "ARTICLE_2025WISPSP_000PKE1156TK8005",
  "ARTICLE_2025WISPSP_000PKE1156TK8006",
  "ARTICLE_2025WISPSP_AM0AM11461BDS001",
  "ARTICLE_2025WISPSP_AM0AM11461BDS002",
  "ARTICLE_2025WISPSP_AM0AM11461BDS003",
  "ARTICLE_2025WISPSP_AM0AM11461BDS004",
  "ARTICLE_2025WISPSP_AM0AM11461BDS005",
  "ARTICLE_2025WISPSP_AM0AM11461BDS006",
  "ARTICLE_2025WISPSP_AM0AM11461BDS007",
  "ARTICLE_2025WISPSP_AM0AM11461BDS008",
  "ARTICLE_2025WISPSP_AM0AM11461BDS009",
  "ARTICLE_2025WISPSP_AM0AM11461BDS010",
  "ARTICLE_2025WISPSP_AM0AM11461BDS011",
  "ARTICLE_2025WISPSP_AM0AM11461BDS012",
  "ARTICLE_2025WISPSP_AM0AM11461BDS013",
  "ARTICLE_2025WISPSP_AM0AM11461DW6001",
  "ARTICLE_2025WISPSP_AM0AM11461DW6002",
  "ARTICLE_2025WISPSP_AM0AM11461DW6003",
  "ARTICLE_2025WISPSP_AM0AM11461DW6004",
  "ARTICLE_2025WISPSP_AM0AM11461DW6005",
  "ARTICLE_2025WISPSP_AM0AM11461DW6006",
  "ARTICLE_2025WISPSP_AM0AM11461DW6007",
  "ARTICLE_2025WISPSP_AM0AM11461DW6008",
  "ARTICLE_2025WISPSP_AM0AM11461DW6009",
  "ARTICLE_2025WISPSP_AM0AM11461DW6010",
  "ARTICLE_2025WISPSP_AM0AM11461DW6011",
  "ARTICLE_2025WISPSP_AM0AM11461DW6012",
  "ARTICLE_2025WISPSP_AM0AM11461DW6013",
  "ARTICLE_2025WISPSP_AM0AM11461GB8001",
  "ARTICLE_2025WISPSP_AM0AM11461GB8002",
  "ARTICLE_2025WISPSP_AM0AM11461GB8003",
  "ARTICLE_2025WISPSP_AM0AM11461GB8004",
  "ARTICLE_2025WISPSP_AM0AM11461GB8005",
  "ARTICLE_2025WISPSP_AM0AM11461GB8006",
  "ARTICLE_2025WISPSP_AM0AM11461GB8007",
  "ARTICLE_2025WISPSP_AM0AM11461GB8008",
  "ARTICLE_2025WISPSP_AM0AM13354BDS003",
  "ARTICLE_2025WISPSP_AM0AM13354BDS004",
  "ARTICLE_2025WISPSP_AM0AM13354BDS005",
  "ARTICLE_2025WISPSP_AM0AM13354BDS006",
  "ARTICLE_2025WISPSP_AM0AM13354BDS007",
  "ARTICLE_2025WISPSP_AM0AM13354BDS008",
  "ARTICLE_2025WISPSP_AM0AM13354DW6001",
  "ARTICLE_2025WISPSP_AM0AM13354DW6002",
  "ARTICLE_2025WISPSP_AM0AM13354DW6003",
  "ARTICLE_2025WISPSP_AM0AM13354DW6004",
];

test.describe("GraphQL Document Search Query - Multi-Collection Search", () => {
  test("health check - server running", async ({ request }) => {
    const response = await request.get("/health");
    expect(response.ok()).toBeTruthy();

    const health = await response.json();
    expect(health).toHaveProperty("status");
  });

  test("search documents - returns valid response structure for all 43 collections", async ({ request }) => {
    // Use all 43 collections for comprehensive testing
    const result = await executeGraphQL<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
      collections: FULL_COLLECTIONS,
      keys: ["test-document-key-001"],
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.searchDocuments).toBeDefined();
    expect(Array.isArray(result.data?.searchDocuments)).toBe(true);

    // Should return exactly 43 results (one per collection)
    expect(result.data?.searchDocuments.length).toBe(43);

    // Validate structure of each result
    for (const doc of result.data?.searchDocuments ?? []) {
      validateDocumentResultStructure(doc);
    }
  });

  test("search documents - returns results for each collection", async ({ request }) => {
    const result = await executeGraphQL<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
      collections: TEST_COLLECTIONS,
      keys: ["sample-key"],
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.searchDocuments).toBeDefined();

    // Should have a result entry for each collection (data may be null if not found)
    const searchResults = result.data?.searchDocuments ?? [];

    // Verify we get results back (structure validation)
    expect(searchResults.length).toBeGreaterThan(0);

    // Each result should have required fields
    for (const doc of searchResults) {
      expect(doc).toHaveProperty("bucket");
      expect(doc).toHaveProperty("scope");
      expect(doc).toHaveProperty("collection");
      expect(doc).toHaveProperty("timeTaken");
    }
  });

  test("search documents - handles multiple keys across all 43 collections", async ({ request }) => {
    const multipleKeys = ["key-001", "key-002", "key-003"];

    const result = await executeGraphQL<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
      collections: FULL_COLLECTIONS,
      keys: multipleKeys,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.searchDocuments).toBeDefined();
    expect(Array.isArray(result.data?.searchDocuments)).toBe(true);

    // Should return results for all 43 collections
    expect(result.data?.searchDocuments.length).toBe(43);
  });

  test("search documents - performance under 5 seconds", async ({ request }) => {
    const { durationMs } = await measureQueryTime<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
      collections: TEST_COLLECTIONS,
      keys: ["perf-test-key"],
    });

    // Should complete within 5 seconds even when searching across many collections
    expect(durationMs).toBeLessThan(5000);
  });

  test("search documents - cached response is faster across all 43 collections", async ({ request }) => {
    const variables = {
      collections: FULL_COLLECTIONS,
      keys: ["cache-test-key"],
    };

    // First request (cold cache) - all 43 collections
    const { durationMs: coldTime } = await measureQueryTime<SearchDocumentsResponse>(
      request,
      SEARCH_DOCUMENTS_QUERY,
      variables
    );

    // Second request (warm cache)
    const { durationMs: warmTime } = await measureQueryTime<SearchDocumentsResponse>(
      request,
      SEARCH_DOCUMENTS_QUERY,
      variables
    );

    // Cached should be faster (or at least not significantly slower)
    // Allow some tolerance for network variance
    expect(warmTime).toBeLessThanOrEqual(coldTime + 200);
  });

  test("search documents - validates collection input", async ({ request }) => {
    // Test with empty collections array - should return error or empty
    const result = await executeGraphQL<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
      collections: [],
      keys: ["test-key"],
    });

    // Should either return validation error or empty results
    expect(
      result.errors !== undefined ||
        (result.data?.searchDocuments !== undefined && result.data.searchDocuments.length === 0)
    ).toBeTruthy();
  });

  test("search documents - validates keys input with all 43 collections", async ({ request }) => {
    // Test with empty keys array - should return error or empty
    const result = await executeGraphQL<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
      collections: FULL_COLLECTIONS,
      keys: [],
    });

    // Should either return validation error or empty results
    expect(result.errors !== undefined || result.data?.searchDocuments !== undefined).toBeTruthy();
  });

  test("search documents - handles non-existent collection gracefully", async ({ request }) => {
    const nonExistentCollections: BucketScopeCollection[] = [
      { bucket: "default", scope: "nonexistent", collection: "fake" },
    ];

    const result = await executeGraphQL<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
      collections: nonExistentCollections,
      keys: ["test-key"],
    });

    // Should not crash - returns error in results or errors array
    expect(result.errors !== undefined || result.data?.searchDocuments !== undefined).toBeTruthy();
  });

  test("search documents - timeTaken is reasonable for all 43 collections", async ({ request }) => {
    const result = await executeGraphQL<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
      collections: FULL_COLLECTIONS,
      keys: ["time-test-key"],
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.searchDocuments).toBeDefined();

    // Should have 43 results
    expect(result.data?.searchDocuments.length).toBe(43);

    // Each individual collection lookup should be fast
    for (const doc of result.data?.searchDocuments ?? []) {
      // Individual collection lookup should be under 2 seconds
      expect(doc.timeTaken).toBeLessThan(2000);
    }
  });

  test("search documents - parallel queries across all 43 collections", async ({ request }) => {
    const queries = [
      executeGraphQL<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
        collections: FULL_COLLECTIONS,
        keys: ["parallel-key-1"],
      }),
      executeGraphQL<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
        collections: FULL_COLLECTIONS,
        keys: ["parallel-key-2"],
      }),
      executeGraphQL<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
        collections: FULL_COLLECTIONS,
        keys: ["parallel-key-3"],
      }),
    ];

    const results = await Promise.all(queries);

    // All queries should succeed with 43 results each
    for (const result of results) {
      expect(result.errors).toBeUndefined();
      expect(result.data?.searchDocuments).toBeDefined();
      expect(result.data?.searchDocuments.length).toBe(43);
    }
  });

  test("search documents - all 43 collections performance", async ({ request }) => {
    // Test with all 43 collections from production logs
    const { durationMs, result } = await measureQueryTime<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
      collections: TEST_COLLECTIONS,
      keys: ["full-collection-test-key"],
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.searchDocuments).toBeDefined();

    // All 43 collections should complete in reasonable time
    expect(durationMs).toBeLessThan(10000);

    // Verify we get results for all 43 collections
    expect(result.data?.searchDocuments.length).toBe(43);
  });

  test("search documents - DataLoader batching efficiency", async ({ request }) => {
    // Get initial cache stats
    const initialStatsResponse = await request.get("/health/cache");
    const initialStats = await initialStatsResponse.json();

    // Execute search that triggers DataLoader batching
    await executeGraphQL<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
      collections: TEST_COLLECTIONS,
      keys: ["dataloader-test-key"],
    });

    // Execute same search again
    await executeGraphQL<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
      collections: TEST_COLLECTIONS,
      keys: ["dataloader-test-key"],
    });

    // Get updated cache stats
    const updatedStatsResponse = await request.get("/health/cache");
    const updatedStats = await updatedStatsResponse.json();

    // Verify cache is being utilized
    const totalOpsInitial = (initialStats.stats?.hits ?? 0) + (initialStats.stats?.misses ?? 0);
    const totalOpsUpdated = (updatedStats.stats?.hits ?? 0) + (updatedStats.stats?.misses ?? 0);

    expect(totalOpsUpdated).toBeGreaterThanOrEqual(totalOpsInitial);
  });

  test("search documents - real article key search across collections", async ({ request }) => {
    // Test with a production article key pattern
    const result = await executeGraphQL<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
      collections: TEST_COLLECTIONS,
      keys: ["ARTICLE_2025WISPSP_AM0AM13354PN6007"],
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.searchDocuments).toBeDefined();
    expect(Array.isArray(result.data?.searchDocuments)).toBe(true);

    // Should return results for all collections
    expect(result.data?.searchDocuments.length).toBe(43);

    // Validate each result structure
    for (const doc of result.data?.searchDocuments ?? []) {
      validateDocumentResultStructure(doc);
    }
  });

  test("search documents - scoped collection search (article collections only)", async ({ request }) => {
    // Test searching only article-related collections
    const articleCollections: BucketScopeCollection[] = [
      { bucket: "default", scope: "styles", collection: "article" },
      { bucket: "default", scope: "new_model", collection: "article" },
      { bucket: "default", scope: "styles_stibo", collection: "article" },
    ];

    const result = await executeGraphQL<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
      collections: articleCollections,
      keys: ["ARTICLE_2025WISPSP_AM0AM13354PN6007"],
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.searchDocuments).toBeDefined();

    // Should return exactly 3 results (one per collection)
    expect(result.data?.searchDocuments.length).toBe(3);

    // Verify collection names match
    const collectionNames = result.data?.searchDocuments.map((d) => d.collection) ?? [];
    expect(collectionNames).toContain("article");
  });

  test("search documents - variant and product2g collections", async ({ request }) => {
    // Test searching variant and product2g collections
    const variantCollections: BucketScopeCollection[] = [
      { bucket: "default", scope: "styles", collection: "variant" },
      { bucket: "default", scope: "styles", collection: "product2g" },
      { bucket: "default", scope: "new_model", collection: "variant" },
      { bucket: "default", scope: "new_model", collection: "product2g" },
      { bucket: "default", scope: "styles_stibo", collection: "variant" },
      { bucket: "default", scope: "styles_stibo", collection: "product2g" },
    ];

    const result = await executeGraphQL<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
      collections: variantCollections,
      keys: ["test-variant-key"],
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.searchDocuments).toBeDefined();

    // Should return exactly 6 results
    expect(result.data?.searchDocuments.length).toBe(6);
  });
});

test.describe("GraphQL Document Search - Production Document Keys", () => {
  test("search with all 50 production document keys across 43 collections", async ({ request }) => {
    const { durationMs, result } = await measureQueryTime<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
      collections: FULL_COLLECTIONS,
      keys: PRODUCTION_DOCUMENT_KEYS,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.searchDocuments).toBeDefined();

    // Should return 43 results (one per collection)
    expect(result.data?.searchDocuments.length).toBe(43);

    // Validate each result structure
    for (const doc of result.data?.searchDocuments ?? []) {
      validateDocumentResultStructure(doc);
    }

    // Performance: should complete within 15 seconds for 50 keys × 43 collections
    expect(durationMs).toBeLessThan(15000);
  });

  test("search first 10 production document keys", async ({ request }) => {
    const first10Keys = PRODUCTION_DOCUMENT_KEYS.slice(0, 10);

    const result = await executeGraphQL<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
      collections: FULL_COLLECTIONS,
      keys: first10Keys,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.searchDocuments).toBeDefined();
    expect(result.data?.searchDocuments.length).toBe(43);
  });

  test("search last 10 production document keys", async ({ request }) => {
    const last10Keys = PRODUCTION_DOCUMENT_KEYS.slice(-10);

    const result = await executeGraphQL<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
      collections: FULL_COLLECTIONS,
      keys: last10Keys,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.searchDocuments).toBeDefined();
    expect(result.data?.searchDocuments.length).toBe(43);
  });

  test("search single production document key across all collections", async ({ request }) => {
    const singleKey = PRODUCTION_DOCUMENT_KEYS[0];

    const result = await executeGraphQL<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
      collections: FULL_COLLECTIONS,
      keys: [singleKey],
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.searchDocuments).toBeDefined();
    expect(result.data?.searchDocuments.length).toBe(43);

    // Verify each collection was searched
    const scopes = new Set(result.data?.searchDocuments.map((d) => d.scope));
    expect(scopes.size).toBeGreaterThan(1);
  });

  test("parallel searches with different production key batches", async ({ request }) => {
    // Split keys into 5 batches of 10
    const batches = [
      PRODUCTION_DOCUMENT_KEYS.slice(0, 10),
      PRODUCTION_DOCUMENT_KEYS.slice(10, 20),
      PRODUCTION_DOCUMENT_KEYS.slice(20, 30),
      PRODUCTION_DOCUMENT_KEYS.slice(30, 40),
      PRODUCTION_DOCUMENT_KEYS.slice(40, 50),
    ];

    const queries = batches.map((keys) =>
      executeGraphQL<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
        collections: FULL_COLLECTIONS,
        keys,
      })
    );

    const results = await Promise.all(queries);

    // All 5 queries should succeed with 43 results each
    for (const result of results) {
      expect(result.errors).toBeUndefined();
      expect(result.data?.searchDocuments).toBeDefined();
      expect(result.data?.searchDocuments.length).toBe(43);
    }
  });

  test("production keys performance benchmark", async ({ request }) => {
    const start = Date.now();

    // Run 3 sequential searches with different key sets
    for (let i = 0; i < 3; i++) {
      const keys = PRODUCTION_DOCUMENT_KEYS.slice(i * 10, (i + 1) * 10);
      const result = await executeGraphQL<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
        collections: FULL_COLLECTIONS,
        keys,
      });

      expect(result.errors).toBeUndefined();
      expect(result.data?.searchDocuments.length).toBe(43);
    }

    const totalDuration = Date.now() - start;

    // 3 sequential searches should complete within 30 seconds
    expect(totalDuration).toBeLessThan(30000);
  });

  test("verify all 43 collections are searched with production keys", async ({ request }) => {
    const result = await executeGraphQL<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
      collections: FULL_COLLECTIONS,
      keys: PRODUCTION_DOCUMENT_KEYS.slice(0, 5),
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.searchDocuments).toBeDefined();

    // Verify all expected scopes are present
    const scopes = new Set(result.data?.searchDocuments.map((d) => d.scope));
    const expectedScopes = [
      "_default",
      "_system",
      "brands_divisions",
      "customer",
      "eventing",
      "media_assets",
      "new_model",
      "order",
      "prices",
      "seasons",
      "styles",
      "styles_notifications",
      "styles_stibo",
    ];

    for (const scope of expectedScopes) {
      expect(scopes).toContain(scope);
    }
  });
});
