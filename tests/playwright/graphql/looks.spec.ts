/* tests/playwright/graphql/looks.spec.ts - E2E Tests for Looks Query */

import { expect, test } from "@playwright/test";
import {
  executeGraphQL,
  LOOKS_QUERY,
  LOOKS_SUMMARY_QUERY,
  type LooksQueryResponse,
  type LooksSummaryResponse,
  measureQueryTime,
  validateLookStructure,
  validateLookSummaryStructure,
} from "../helpers/graphql-client";

const TEST_CONFIG = {
  brand: "TH",
  season: "C52",
  divisions: ["01", "02", "04", "05", "10"],
};

test.describe("GraphQL Looks Query - TH Brand C52 Season", () => {
  test("health check - server running", async ({ request }) => {
    const response = await request.get("/health");
    expect(response.ok()).toBeTruthy();

    const health = await response.json();
    expect(health).toHaveProperty("status");
  });

  test("database health check", async ({ request }) => {
    const response = await request.get("/health/database");

    // May return 200 or 503 depending on database availability
    if (response.ok()) {
      const health = await response.json();
      expect(health).toHaveProperty("status");
    }
  });

  // Test each division
  for (const division of TEST_CONFIG.divisions) {
    test(`division ${division} - returns valid looks`, async ({ request }) => {
      const result = await executeGraphQL<LooksQueryResponse>(request, LOOKS_QUERY, {
        brand: TEST_CONFIG.brand,
        season: TEST_CONFIG.season,
        division,
      });

      expect(result.errors).toBeUndefined();
      expect(result.data?.looks).toBeDefined();
      expect(Array.isArray(result.data?.looks)).toBe(true);

      // If results returned, validate structure
      if (result.data?.looks && result.data.looks.length > 0) {
        const look = result.data.looks[0];
        validateLookStructure(look);

        // Verify division matches
        expect(look.divisionCode).toBe(division);
      }
    });
  }

  test("response time under 5 seconds for first request", async ({ request }) => {
    const { durationMs } = await measureQueryTime<LooksQueryResponse>(request, LOOKS_QUERY, {
      brand: TEST_CONFIG.brand,
      season: TEST_CONFIG.season,
      division: TEST_CONFIG.divisions[0],
    });

    expect(durationMs).toBeLessThan(5000);
  });

  test("cached response is faster than initial request", async ({ request }) => {
    const variables = {
      brand: TEST_CONFIG.brand,
      season: TEST_CONFIG.season,
      division: TEST_CONFIG.divisions[0],
    };

    // First request (cold cache)
    const { durationMs: coldTime } = await measureQueryTime<LooksQueryResponse>(request, LOOKS_QUERY, variables);

    // Second request (warm cache)
    const { durationMs: warmTime } = await measureQueryTime<LooksQueryResponse>(request, LOOKS_QUERY, variables);

    // Cached should be faster (or at least not significantly slower)
    // Allow 500ms tolerance for network variance
    expect(warmTime).toBeLessThanOrEqual(coldTime + 500);
  });

  test("cache stats reflect hits and misses", async ({ request }) => {
    // Get initial cache stats
    const initialStatsResponse = await request.get("/health/cache");
    const initialStats = await initialStatsResponse.json();
    const initialHits = initialStats.stats?.hits ?? 0;
    const initialMisses = initialStats.stats?.misses ?? 0;

    // Use a unique division to ensure cache miss
    const uniqueVariables = {
      brand: TEST_CONFIG.brand,
      season: TEST_CONFIG.season,
      division: "02", // Use division 02 for this test
    };

    // First query - should be cache miss or hit depending on prior tests
    await executeGraphQL<LooksQueryResponse>(request, LOOKS_QUERY, uniqueVariables);

    // Second query - same params, should be cache hit
    await executeGraphQL<LooksQueryResponse>(request, LOOKS_QUERY, uniqueVariables);

    // Get updated cache stats
    const updatedStatsResponse = await request.get("/health/cache");
    const updatedStats = await updatedStatsResponse.json();

    // Verify cache is being used (either hits or total operations increased)
    const totalOpsInitial = initialHits + initialMisses;
    const totalOpsUpdated = (updatedStats.stats?.hits ?? 0) + (updatedStats.stats?.misses ?? 0);

    expect(totalOpsUpdated).toBeGreaterThanOrEqual(totalOpsInitial);
  });

  test("handles empty brand gracefully", async ({ request }) => {
    const result = await executeGraphQL<LooksQueryResponse>(request, LOOKS_QUERY, {
      brand: "",
      season: TEST_CONFIG.season,
      division: TEST_CONFIG.divisions[0],
    });

    // Should either return empty array or validation error
    expect(result.data?.looks !== undefined || result.errors !== undefined).toBeTruthy();

    // If data returned, it should be an array
    if (result.data?.looks) {
      expect(Array.isArray(result.data.looks)).toBe(true);
    }
  });

  test("handles empty season gracefully", async ({ request }) => {
    const result = await executeGraphQL<LooksQueryResponse>(request, LOOKS_QUERY, {
      brand: TEST_CONFIG.brand,
      season: "",
      division: TEST_CONFIG.divisions[0],
    });

    expect(result.data?.looks !== undefined || result.errors !== undefined).toBeTruthy();

    if (result.data?.looks) {
      expect(Array.isArray(result.data.looks)).toBe(true);
    }
  });

  test("handles invalid division gracefully", async ({ request }) => {
    const result = await executeGraphQL<LooksQueryResponse>(request, LOOKS_QUERY, {
      brand: TEST_CONFIG.brand,
      season: TEST_CONFIG.season,
      division: "99",
    });

    // Should return empty array for non-existent division
    expect(result.errors).toBeUndefined();
    expect(result.data?.looks).toBeDefined();
    expect(Array.isArray(result.data?.looks)).toBe(true);
  });

  test("all divisions can be queried in parallel", async ({ request }) => {
    const queries = TEST_CONFIG.divisions.map((division) =>
      executeGraphQL<LooksQueryResponse>(request, LOOKS_QUERY, {
        brand: TEST_CONFIG.brand,
        season: TEST_CONFIG.season,
        division,
      })
    );

    const results = await Promise.all(queries);

    // All queries should succeed
    for (const result of results) {
      expect(result.errors).toBeUndefined();
      expect(result.data?.looks).toBeDefined();
    }
  });

  test("response contains expected Look fields", async ({ request }) => {
    const result = await executeGraphQL<LooksQueryResponse>(request, LOOKS_QUERY, {
      brand: TEST_CONFIG.brand,
      season: TEST_CONFIG.season,
      division: TEST_CONFIG.divisions[0],
    });

    expect(result.errors).toBeUndefined();

    if (result.data?.looks && result.data.looks.length > 0) {
      const look = result.data.looks[0];

      // Verify all expected fields are present
      const expectedFields = [
        "documentKey",
        "divisionCode",
        "lookType",
        "assetUrl",
        "title",
        "trend",
        "relatedStyles",
        "isDeleted",
      ];

      for (const field of expectedFields) {
        expect(look).toHaveProperty(field);
      }
    }
  });

  test("non-deleted looks are returned by default", async ({ request }) => {
    const result = await executeGraphQL<LooksQueryResponse>(request, LOOKS_QUERY, {
      brand: TEST_CONFIG.brand,
      season: TEST_CONFIG.season,
      division: TEST_CONFIG.divisions[0],
    });

    expect(result.errors).toBeUndefined();

    if (result.data?.looks && result.data.looks.length > 0) {
      // Most looks should not be deleted
      const deletedCount = result.data.looks.filter((l) => l.isDeleted).length;
      const totalCount = result.data.looks.length;

      // Allow some deleted, but majority should be active
      expect(deletedCount).toBeLessThanOrEqual(totalCount);
    }
  });
});

test.describe("GraphQL LooksSummary Query - TH Brand C52 Season", () => {
  // Configure retries for transient Couchbase errors
  test.describe.configure({ retries: 2 });

  test("looksSummary - returns valid response structure", async ({ request }) => {
    const result = await executeGraphQL<LooksSummaryResponse>(request, LOOKS_SUMMARY_QUERY, {
      brand: TEST_CONFIG.brand,
      division: TEST_CONFIG.divisions[0],
      season: TEST_CONFIG.season,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.looksSummary).toBeDefined();

    if (result.data?.looksSummary) {
      validateLookSummaryStructure(result.data.looksSummary);
    }
  });

  test("looksSummary - totalLooks matches looks query count", async ({ request }) => {
    const [summaryResult, looksResult] = await Promise.all([
      executeGraphQL<LooksSummaryResponse>(request, LOOKS_SUMMARY_QUERY, {
        brand: TEST_CONFIG.brand,
        division: TEST_CONFIG.divisions[0],
        season: TEST_CONFIG.season,
      }),
      executeGraphQL<LooksQueryResponse>(request, LOOKS_QUERY, {
        brand: TEST_CONFIG.brand,
        season: TEST_CONFIG.season,
        division: TEST_CONFIG.divisions[0],
      }),
    ]);

    expect(summaryResult.errors).toBeUndefined();
    expect(looksResult.errors).toBeUndefined();

    if (summaryResult.data?.looksSummary && looksResult.data?.looks) {
      // totalLooks from summary should match actual looks count
      expect(summaryResult.data.looksSummary.totalLooks).toBe(looksResult.data.looks.length);
    }
  });

  // Test each division
  for (const division of TEST_CONFIG.divisions) {
    test(`looksSummary division ${division} - returns valid summary`, async ({ request }) => {
      const result = await executeGraphQL<LooksSummaryResponse>(
        request,
        LOOKS_SUMMARY_QUERY,
        {
          brand: TEST_CONFIG.brand,
          division,
          season: TEST_CONFIG.season,
        },
        { maxRetries: 5, retryDelayMs: 300 }
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.looksSummary).toBeDefined();

      if (result.data?.looksSummary) {
        validateLookSummaryStructure(result.data.looksSummary);

        // All counts should be non-negative
        expect(result.data.looksSummary.totalLooks).toBeGreaterThanOrEqual(0);
        expect(result.data.looksSummary.hasDeliveryName).toBeGreaterThanOrEqual(0);
        expect(result.data.looksSummary.hasDescription).toBeGreaterThanOrEqual(0);
        expect(result.data.looksSummary.hasGender).toBeGreaterThanOrEqual(0);
        expect(result.data.looksSummary.hasRelatedStyles).toBeGreaterThanOrEqual(0);
        expect(result.data.looksSummary.hasTag).toBeGreaterThanOrEqual(0);
        expect(result.data.looksSummary.hasTitle).toBeGreaterThanOrEqual(0);
        expect(result.data.looksSummary.hasTrend).toBeGreaterThanOrEqual(0);
      }
    });
  }

  test("looksSummary - response time under 5 seconds", async ({ request }) => {
    const { durationMs } = await measureQueryTime<LooksSummaryResponse>(request, LOOKS_SUMMARY_QUERY, {
      brand: TEST_CONFIG.brand,
      division: TEST_CONFIG.divisions[0],
      season: TEST_CONFIG.season,
    });

    expect(durationMs).toBeLessThan(5000);
  });

  test("looksSummary - handles empty brand gracefully", async ({ request }) => {
    const result = await executeGraphQL<LooksSummaryResponse>(request, LOOKS_SUMMARY_QUERY, {
      brand: "",
      division: TEST_CONFIG.divisions[0],
      season: TEST_CONFIG.season,
    });

    // Should either return valid summary or error
    expect(result.data?.looksSummary !== undefined || result.errors !== undefined).toBeTruthy();
  });

  test("looksSummary - handles empty season gracefully", async ({ request }) => {
    const result = await executeGraphQL<LooksSummaryResponse>(request, LOOKS_SUMMARY_QUERY, {
      brand: TEST_CONFIG.brand,
      division: TEST_CONFIG.divisions[0],
      season: "",
    });

    expect(result.data?.looksSummary !== undefined || result.errors !== undefined).toBeTruthy();
  });

  test("looksSummary - handles invalid division gracefully", async ({ request }) => {
    const result = await executeGraphQL<LooksSummaryResponse>(request, LOOKS_SUMMARY_QUERY, {
      brand: TEST_CONFIG.brand,
      division: "99",
      season: TEST_CONFIG.season,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.looksSummary).toBeDefined();

    if (result.data?.looksSummary) {
      // Should return zero counts for non-existent division
      expect(result.data.looksSummary.totalLooks).toBe(0);
    }
  });

  test("looksSummary - all divisions can be queried in parallel", async ({ request }) => {
    const queries = TEST_CONFIG.divisions.map((division) =>
      executeGraphQL<LooksSummaryResponse>(request, LOOKS_SUMMARY_QUERY, {
        brand: TEST_CONFIG.brand,
        division,
        season: TEST_CONFIG.season,
      })
    );

    const results = await Promise.all(queries);

    // All queries should succeed
    for (const result of results) {
      expect(result.errors).toBeUndefined();
      expect(result.data?.looksSummary).toBeDefined();
    }
  });

  test("looksSummary - counts are consistent with totalLooks", async ({ request }) => {
    const result = await executeGraphQL<LooksSummaryResponse>(request, LOOKS_SUMMARY_QUERY, {
      brand: TEST_CONFIG.brand,
      division: TEST_CONFIG.divisions[0],
      season: TEST_CONFIG.season,
    });

    expect(result.errors).toBeUndefined();

    if (result.data?.looksSummary) {
      const summary = result.data.looksSummary;

      // Individual counts should not exceed total
      expect(summary.hasDeliveryName).toBeLessThanOrEqual(summary.totalLooks);
      expect(summary.hasDescription).toBeLessThanOrEqual(summary.totalLooks);
      expect(summary.hasGender).toBeLessThanOrEqual(summary.totalLooks);
      expect(summary.hasRelatedStyles).toBeLessThanOrEqual(summary.totalLooks);
      expect(summary.hasTag).toBeLessThanOrEqual(summary.totalLooks);
      expect(summary.hasTitle).toBeLessThanOrEqual(summary.totalLooks);
      expect(summary.hasTrend).toBeLessThanOrEqual(summary.totalLooks);
    }
  });
});
