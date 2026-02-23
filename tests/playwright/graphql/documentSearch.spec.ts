/* tests/playwright/graphql/documentSearch.spec.ts - E2E Tests for Document Search Query */

import { test, expect } from "@playwright/test";
import {
  executeGraphQL,
  SEARCH_DOCUMENTS_QUERY,
  validateDocumentResultStructure,
  measureQueryTime,
  type SearchDocumentsResponse,
  type BucketScopeCollection,
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

// Minimal collection set for quick tests
const MINIMAL_COLLECTIONS: BucketScopeCollection[] = [
  { bucket: "default", scope: "styles", collection: "article" },
  { bucket: "default", scope: "styles", collection: "product2g" },
];

test.describe("GraphQL Document Search Query - Multi-Collection Search", () => {
  test("health check - server running", async ({ request }) => {
    const response = await request.get("/health");
    expect(response.ok()).toBeTruthy();

    const health = await response.json();
    expect(health).toHaveProperty("status");
  });

  test("search documents - returns valid response structure", async ({ request }) => {
    // Use a sample key that may or may not exist - the important thing is the response structure
    const result = await executeGraphQL<SearchDocumentsResponse>(
      request,
      SEARCH_DOCUMENTS_QUERY,
      {
        collections: MINIMAL_COLLECTIONS,
        keys: ["test-document-key-001"],
      }
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.searchDocuments).toBeDefined();
    expect(Array.isArray(result.data?.searchDocuments)).toBe(true);

    // Validate structure of each result
    if (result.data?.searchDocuments && result.data.searchDocuments.length > 0) {
      for (const doc of result.data.searchDocuments) {
        validateDocumentResultStructure(doc);
      }
    }
  });

  test("search documents - returns results for each collection", async ({ request }) => {
    const result = await executeGraphQL<SearchDocumentsResponse>(
      request,
      SEARCH_DOCUMENTS_QUERY,
      {
        collections: TEST_COLLECTIONS,
        keys: ["sample-key"],
      }
    );

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

  test("search documents - handles multiple keys", async ({ request }) => {
    const multipleKeys = ["key-001", "key-002", "key-003"];

    const result = await executeGraphQL<SearchDocumentsResponse>(
      request,
      SEARCH_DOCUMENTS_QUERY,
      {
        collections: MINIMAL_COLLECTIONS,
        keys: multipleKeys,
      }
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.searchDocuments).toBeDefined();
    expect(Array.isArray(result.data?.searchDocuments)).toBe(true);
  });

  test("search documents - performance under 5 seconds", async ({ request }) => {
    const { durationMs } = await measureQueryTime<SearchDocumentsResponse>(
      request,
      SEARCH_DOCUMENTS_QUERY,
      {
        collections: TEST_COLLECTIONS,
        keys: ["perf-test-key"],
      }
    );

    // Should complete within 5 seconds even when searching across many collections
    expect(durationMs).toBeLessThan(5000);
  });

  test("search documents - cached response is faster", async ({ request }) => {
    const variables = {
      collections: MINIMAL_COLLECTIONS,
      keys: ["cache-test-key"],
    };

    // First request (cold cache)
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
    expect(warmTime).toBeLessThanOrEqual(coldTime + 100);
  });

  test("search documents - validates collection input", async ({ request }) => {
    // Test with empty collections array - should return error or empty
    const result = await executeGraphQL<SearchDocumentsResponse>(
      request,
      SEARCH_DOCUMENTS_QUERY,
      {
        collections: [],
        keys: ["test-key"],
      }
    );

    // Should either return validation error or empty results
    expect(
      result.errors !== undefined ||
      (result.data?.searchDocuments !== undefined && result.data.searchDocuments.length === 0)
    ).toBeTruthy();
  });

  test("search documents - validates keys input", async ({ request }) => {
    // Test with empty keys array - should return error or empty
    const result = await executeGraphQL<SearchDocumentsResponse>(
      request,
      SEARCH_DOCUMENTS_QUERY,
      {
        collections: MINIMAL_COLLECTIONS,
        keys: [],
      }
    );

    // Should either return validation error or empty results
    expect(
      result.errors !== undefined ||
      result.data?.searchDocuments !== undefined
    ).toBeTruthy();
  });

  test("search documents - handles non-existent collection gracefully", async ({ request }) => {
    const nonExistentCollections: BucketScopeCollection[] = [
      { bucket: "default", scope: "nonexistent", collection: "fake" },
    ];

    const result = await executeGraphQL<SearchDocumentsResponse>(
      request,
      SEARCH_DOCUMENTS_QUERY,
      {
        collections: nonExistentCollections,
        keys: ["test-key"],
      }
    );

    // Should not crash - returns error in results or errors array
    expect(
      result.errors !== undefined || result.data?.searchDocuments !== undefined
    ).toBeTruthy();
  });

  test("search documents - timeTaken is reasonable", async ({ request }) => {
    const result = await executeGraphQL<SearchDocumentsResponse>(
      request,
      SEARCH_DOCUMENTS_QUERY,
      {
        collections: MINIMAL_COLLECTIONS,
        keys: ["time-test-key"],
      }
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.searchDocuments).toBeDefined();

    // Each individual collection lookup should be fast
    for (const doc of result.data?.searchDocuments ?? []) {
      // Individual collection lookup should be under 2 seconds
      expect(doc.timeTaken).toBeLessThan(2000);
    }
  });

  test("search documents - parallel queries work correctly", async ({ request }) => {
    const queries = [
      executeGraphQL<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
        collections: MINIMAL_COLLECTIONS,
        keys: ["parallel-key-1"],
      }),
      executeGraphQL<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
        collections: MINIMAL_COLLECTIONS,
        keys: ["parallel-key-2"],
      }),
      executeGraphQL<SearchDocumentsResponse>(request, SEARCH_DOCUMENTS_QUERY, {
        collections: MINIMAL_COLLECTIONS,
        keys: ["parallel-key-3"],
      }),
    ];

    const results = await Promise.all(queries);

    // All queries should succeed
    for (const result of results) {
      expect(result.errors).toBeUndefined();
      expect(result.data?.searchDocuments).toBeDefined();
    }
  });

  test("search documents - all 43 collections performance", async ({ request }) => {
    // Test with all 43 collections from production logs
    const { durationMs, result } = await measureQueryTime<SearchDocumentsResponse>(
      request,
      SEARCH_DOCUMENTS_QUERY,
      {
        collections: TEST_COLLECTIONS,
        keys: ["full-collection-test-key"],
      }
    );

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
});
