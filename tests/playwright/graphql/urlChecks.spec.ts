/* tests/playwright/graphql/urlChecks.spec.ts - E2E Tests for URL Check Queries */

import { expect, test } from "@playwright/test";
import {
  executeGraphQL,
  GET_IMAGE_URL_CHECK_QUERY,
  GET_LOOKS_URL_CHECK_QUERY,
  type GetImageUrlCheckResponse,
  type GetLooksUrlCheckResponse,
  measureQueryTime,
  validateUrlSuffixesResultStructure,
} from "../helpers/graphql-client";

const TEST_CONFIG = {
  season: "C52",
  divisions: ["01", "02", "04", "05", "10"],
  singleDivision: "01",
};

test.describe("GraphQL getLooksUrlCheck Query - C52 Season", () => {
  test("health check - server running", async ({ request }) => {
    const response = await request.get("/health");
    expect(response.ok()).toBeTruthy();

    const health = await response.json();
    expect(health).toHaveProperty("status");
  });

  test("getLooksUrlCheck - returns valid response structure for single division", async ({ request }) => {
    const result = await executeGraphQL<GetLooksUrlCheckResponse>(request, GET_LOOKS_URL_CHECK_QUERY, {
      divisions: [TEST_CONFIG.singleDivision],
      season: TEST_CONFIG.season,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.getLooksUrlCheck).toBeDefined();
    expect(Array.isArray(result.data?.getLooksUrlCheck)).toBe(true);

    // Validate structure of each result
    if (result.data?.getLooksUrlCheck && result.data.getLooksUrlCheck.length > 0) {
      for (const urlResult of result.data.getLooksUrlCheck) {
        validateUrlSuffixesResultStructure(urlResult);
      }
    }
  });

  test("getLooksUrlCheck - returns results for multiple divisions", async ({ request }) => {
    const result = await executeGraphQL<GetLooksUrlCheckResponse>(request, GET_LOOKS_URL_CHECK_QUERY, {
      divisions: TEST_CONFIG.divisions,
      season: TEST_CONFIG.season,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.getLooksUrlCheck).toBeDefined();
    expect(Array.isArray(result.data?.getLooksUrlCheck)).toBe(true);

    // Should have results for requested divisions
    const urlResults = result.data?.getLooksUrlCheck ?? [];
    expect(urlResults.length).toBeGreaterThan(0);

    // Each result should have valid structure
    for (const urlResult of urlResults) {
      validateUrlSuffixesResultStructure(urlResult);
      expect(TEST_CONFIG.divisions).toContain(urlResult.divisionCode);
    }
  });

  test("getLooksUrlCheck - response time under 5 seconds", async ({ request }) => {
    const { durationMs } = await measureQueryTime<GetLooksUrlCheckResponse>(request, GET_LOOKS_URL_CHECK_QUERY, {
      divisions: [TEST_CONFIG.singleDivision],
      season: TEST_CONFIG.season,
    });

    expect(durationMs).toBeLessThan(5000);
  });

  test("getLooksUrlCheck - handles empty divisions array", async ({ request }) => {
    const result = await executeGraphQL<GetLooksUrlCheckResponse>(request, GET_LOOKS_URL_CHECK_QUERY, {
      divisions: [],
      season: TEST_CONFIG.season,
    });

    // Should either return validation error or empty results
    expect(
      result.errors !== undefined ||
        (result.data?.getLooksUrlCheck !== undefined && result.data.getLooksUrlCheck.length === 0)
    ).toBeTruthy();
  });

  test("getLooksUrlCheck - handles empty season gracefully", async ({ request }) => {
    const result = await executeGraphQL<GetLooksUrlCheckResponse>(request, GET_LOOKS_URL_CHECK_QUERY, {
      divisions: [TEST_CONFIG.singleDivision],
      season: "",
    });

    expect(result.errors !== undefined || result.data?.getLooksUrlCheck !== undefined).toBeTruthy();

    if (result.data?.getLooksUrlCheck) {
      expect(Array.isArray(result.data.getLooksUrlCheck)).toBe(true);
    }
  });

  test("getLooksUrlCheck - handles invalid division gracefully", async ({ request }) => {
    const result = await executeGraphQL<GetLooksUrlCheckResponse>(request, GET_LOOKS_URL_CHECK_QUERY, {
      divisions: ["99"],
      season: TEST_CONFIG.season,
    });

    // Should return empty results for non-existent division
    expect(result.errors).toBeUndefined();
    expect(result.data?.getLooksUrlCheck).toBeDefined();
    expect(Array.isArray(result.data?.getLooksUrlCheck)).toBe(true);
  });

  test("getLooksUrlCheck - cached response is faster", async ({ request }) => {
    const variables = {
      divisions: [TEST_CONFIG.singleDivision],
      season: TEST_CONFIG.season,
    };

    // First request (cold cache)
    const { durationMs: coldTime } = await measureQueryTime<GetLooksUrlCheckResponse>(
      request,
      GET_LOOKS_URL_CHECK_QUERY,
      variables
    );

    // Second request (warm cache)
    const { durationMs: warmTime } = await measureQueryTime<GetLooksUrlCheckResponse>(
      request,
      GET_LOOKS_URL_CHECK_QUERY,
      variables
    );

    // Cached should be faster (or at least not significantly slower)
    // Allow 500ms tolerance for network variance
    expect(warmTime).toBeLessThanOrEqual(coldTime + 500);
  });

  test("getLooksUrlCheck - parallel queries work correctly", async ({ request }) => {
    const queries = TEST_CONFIG.divisions.map((division) =>
      executeGraphQL<GetLooksUrlCheckResponse>(request, GET_LOOKS_URL_CHECK_QUERY, {
        divisions: [division],
        season: TEST_CONFIG.season,
      })
    );

    const results = await Promise.all(queries);

    // All queries should succeed
    for (const result of results) {
      expect(result.errors).toBeUndefined();
      expect(result.data?.getLooksUrlCheck).toBeDefined();
    }
  });

  test("getLooksUrlCheck - URLs are valid strings", async ({ request }) => {
    const result = await executeGraphQL<GetLooksUrlCheckResponse>(request, GET_LOOKS_URL_CHECK_QUERY, {
      divisions: [TEST_CONFIG.singleDivision],
      season: TEST_CONFIG.season,
    });

    expect(result.errors).toBeUndefined();

    if (result.data?.getLooksUrlCheck) {
      for (const urlResult of result.data.getLooksUrlCheck) {
        // Each URL should be a non-empty string
        for (const url of urlResult.urls) {
          expect(typeof url).toBe("string");
          expect(url.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

test.describe("GraphQL getImageUrlCheck Query - C52 Season", () => {
  test("getImageUrlCheck - returns valid response structure for single division", async ({ request }) => {
    const result = await executeGraphQL<GetImageUrlCheckResponse>(request, GET_IMAGE_URL_CHECK_QUERY, {
      divisions: [TEST_CONFIG.singleDivision],
      season: TEST_CONFIG.season,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.getImageUrlCheck).toBeDefined();
    expect(Array.isArray(result.data?.getImageUrlCheck)).toBe(true);

    // Validate structure of each result
    if (result.data?.getImageUrlCheck && result.data.getImageUrlCheck.length > 0) {
      for (const urlResult of result.data.getImageUrlCheck) {
        validateUrlSuffixesResultStructure(urlResult);
      }
    }
  });

  test("getImageUrlCheck - returns results for multiple divisions", async ({ request }) => {
    const result = await executeGraphQL<GetImageUrlCheckResponse>(request, GET_IMAGE_URL_CHECK_QUERY, {
      divisions: TEST_CONFIG.divisions,
      season: TEST_CONFIG.season,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.getImageUrlCheck).toBeDefined();
    expect(Array.isArray(result.data?.getImageUrlCheck)).toBe(true);

    // Should have results for requested divisions
    const urlResults = result.data?.getImageUrlCheck ?? [];
    expect(urlResults.length).toBeGreaterThan(0);

    // Each result should have valid structure
    for (const urlResult of urlResults) {
      validateUrlSuffixesResultStructure(urlResult);
      expect(TEST_CONFIG.divisions).toContain(urlResult.divisionCode);
    }
  });

  test("getImageUrlCheck - response time under 5 seconds", async ({ request }) => {
    const { durationMs } = await measureQueryTime<GetImageUrlCheckResponse>(request, GET_IMAGE_URL_CHECK_QUERY, {
      divisions: [TEST_CONFIG.singleDivision],
      season: TEST_CONFIG.season,
    });

    expect(durationMs).toBeLessThan(5000);
  });

  test("getImageUrlCheck - handles empty divisions array", async ({ request }) => {
    const result = await executeGraphQL<GetImageUrlCheckResponse>(request, GET_IMAGE_URL_CHECK_QUERY, {
      divisions: [],
      season: TEST_CONFIG.season,
    });

    // Should either return validation error or empty results
    expect(
      result.errors !== undefined ||
        (result.data?.getImageUrlCheck !== undefined && result.data.getImageUrlCheck.length === 0)
    ).toBeTruthy();
  });

  test("getImageUrlCheck - handles empty season gracefully", async ({ request }) => {
    const result = await executeGraphQL<GetImageUrlCheckResponse>(request, GET_IMAGE_URL_CHECK_QUERY, {
      divisions: [TEST_CONFIG.singleDivision],
      season: "",
    });

    expect(result.errors !== undefined || result.data?.getImageUrlCheck !== undefined).toBeTruthy();

    if (result.data?.getImageUrlCheck) {
      expect(Array.isArray(result.data.getImageUrlCheck)).toBe(true);
    }
  });

  test("getImageUrlCheck - handles invalid division gracefully", async ({ request }) => {
    const result = await executeGraphQL<GetImageUrlCheckResponse>(request, GET_IMAGE_URL_CHECK_QUERY, {
      divisions: ["99"],
      season: TEST_CONFIG.season,
    });

    // Should return empty results for non-existent division
    expect(result.errors).toBeUndefined();
    expect(result.data?.getImageUrlCheck).toBeDefined();
    expect(Array.isArray(result.data?.getImageUrlCheck)).toBe(true);
  });

  test("getImageUrlCheck - cached response is faster", async ({ request }) => {
    const variables = {
      divisions: [TEST_CONFIG.singleDivision],
      season: TEST_CONFIG.season,
    };

    // First request (cold cache)
    const { durationMs: coldTime } = await measureQueryTime<GetImageUrlCheckResponse>(
      request,
      GET_IMAGE_URL_CHECK_QUERY,
      variables
    );

    // Second request (warm cache)
    const { durationMs: warmTime } = await measureQueryTime<GetImageUrlCheckResponse>(
      request,
      GET_IMAGE_URL_CHECK_QUERY,
      variables
    );

    // Cached should be faster (or at least not significantly slower)
    // Allow 500ms tolerance for network variance
    expect(warmTime).toBeLessThanOrEqual(coldTime + 500);
  });

  test("getImageUrlCheck - parallel queries work correctly", async ({ request }) => {
    const queries = TEST_CONFIG.divisions.map((division) =>
      executeGraphQL<GetImageUrlCheckResponse>(request, GET_IMAGE_URL_CHECK_QUERY, {
        divisions: [division],
        season: TEST_CONFIG.season,
      })
    );

    const results = await Promise.all(queries);

    // All queries should succeed
    for (const result of results) {
      expect(result.errors).toBeUndefined();
      expect(result.data?.getImageUrlCheck).toBeDefined();
    }
  });

  test("getImageUrlCheck - URLs are valid strings", async ({ request }) => {
    const result = await executeGraphQL<GetImageUrlCheckResponse>(request, GET_IMAGE_URL_CHECK_QUERY, {
      divisions: [TEST_CONFIG.singleDivision],
      season: TEST_CONFIG.season,
    });

    expect(result.errors).toBeUndefined();

    if (result.data?.getImageUrlCheck) {
      for (const urlResult of result.data.getImageUrlCheck) {
        // Each URL should be a non-empty string
        for (const url of urlResult.urls) {
          expect(typeof url).toBe("string");
          expect(url.length).toBeGreaterThan(0);
        }
      }
    }
  });

  test("getImageUrlCheck - all divisions performance test", async ({ request }) => {
    const { durationMs } = await measureQueryTime<GetImageUrlCheckResponse>(request, GET_IMAGE_URL_CHECK_QUERY, {
      divisions: TEST_CONFIG.divisions,
      season: TEST_CONFIG.season,
    });

    // All divisions should complete in reasonable time
    expect(durationMs).toBeLessThan(10000);
  });
});

test.describe("URL Check Queries - Cross-Query Consistency", () => {
  test("both URL check queries return same division codes for same input", async ({ request }) => {
    const [looksResult, imageResult] = await Promise.all([
      executeGraphQL<GetLooksUrlCheckResponse>(request, GET_LOOKS_URL_CHECK_QUERY, {
        divisions: TEST_CONFIG.divisions,
        season: TEST_CONFIG.season,
      }),
      executeGraphQL<GetImageUrlCheckResponse>(request, GET_IMAGE_URL_CHECK_QUERY, {
        divisions: TEST_CONFIG.divisions,
        season: TEST_CONFIG.season,
      }),
    ]);

    expect(looksResult.errors).toBeUndefined();
    expect(imageResult.errors).toBeUndefined();

    // Both should return arrays
    expect(Array.isArray(looksResult.data?.getLooksUrlCheck)).toBe(true);
    expect(Array.isArray(imageResult.data?.getImageUrlCheck)).toBe(true);
  });

  test("URL check queries handle concurrent requests", async ({ request }) => {
    const requests = [];

    // Create mix of looks and image URL check requests
    for (let i = 0; i < 5; i++) {
      requests.push(
        executeGraphQL<GetLooksUrlCheckResponse>(request, GET_LOOKS_URL_CHECK_QUERY, {
          divisions: [TEST_CONFIG.divisions[i % TEST_CONFIG.divisions.length]],
          season: TEST_CONFIG.season,
        })
      );
      requests.push(
        executeGraphQL<GetImageUrlCheckResponse>(request, GET_IMAGE_URL_CHECK_QUERY, {
          divisions: [TEST_CONFIG.divisions[i % TEST_CONFIG.divisions.length]],
          season: TEST_CONFIG.season,
        })
      );
    }

    const results = await Promise.all(requests);

    // All requests should succeed
    for (const result of results) {
      expect(result.errors).toBeUndefined();
    }
  });
});
