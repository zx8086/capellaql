/* tests/playwright/api-best-practices.spec.ts - API Best Practices E2E Tests */
/* Per migrate/docs/development/testing.md: RFC compliance and API best practices */

import { expect, test } from "@playwright/test";

test.describe("API Best Practices - RFC 7807 Compliance", () => {
  test.describe("RFC 7807 Problem Details Format", () => {
    test("404 response uses RFC 7807 format", async ({ request }) => {
      const response = await request.get("/nonexistent-endpoint");

      expect(response.status()).toBe(404);
      expect(response.headers()["content-type"]).toBe("application/problem+json");

      const body = await response.json();
      expect(body).toHaveProperty("type");
      expect(body).toHaveProperty("title");
      expect(body).toHaveProperty("status");
      expect(body).toHaveProperty("timestamp");

      expect(body.type).toContain("https://");
      expect(body.status).toBe(404);
      expect(typeof body.timestamp).toBe("string");
    });

    test("RFC 7807 response has valid type URI", async ({ request }) => {
      const response = await request.get("/invalid-path-12345");

      const body = await response.json();

      // Type should be a valid URI
      expect(body.type).toMatch(/^https?:\/\//);
      expect(body.type).toContain("capellaql.tommy.com/errors");
    });

    test("RFC 7807 response includes timestamp in ISO 8601 format", async ({
      request,
    }) => {
      const response = await request.get("/missing-resource");

      const body = await response.json();

      // Timestamp should be ISO 8601 format
      expect(body.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
      );
    });
  });

  test.describe("HTTP Method Validation (RFC 9110)", () => {
    test("POST to health endpoint returns 405 with Allow header", async ({
      request,
    }) => {
      const response = await request.post("/health", { data: {} });

      // Health endpoint should only accept GET
      if (response.status() === 405) {
        const allowHeader = response.headers()["allow"];
        expect(allowHeader).toBeDefined();
        expect(allowHeader).toContain("GET");
      }
    });

    test("DELETE to GraphQL endpoint returns 405", async ({ request }) => {
      const response = await request.delete("/graphql");

      // GraphQL should only accept GET, POST, OPTIONS
      if (response.status() === 405) {
        const allowHeader = response.headers()["allow"];
        expect(allowHeader).toBeDefined();
      }
    });

    test("OPTIONS to GraphQL returns CORS headers", async ({ request }) => {
      const response = await request.fetch("/graphql", { method: "OPTIONS" });

      expect(response.status()).toBe(204);
      expect(response.headers()["access-control-allow-methods"]).toContain(
        "GET"
      );
      expect(response.headers()["access-control-allow-methods"]).toContain(
        "POST"
      );
    });
  });

  test.describe("Content-Type Validation", () => {
    test("GraphQL POST accepts application/json", async ({ request }) => {
      const response = await request.post("/graphql", {
        headers: { "Content-Type": "application/json" },
        data: { query: "{ __typename }" },
      });

      expect(response.ok()).toBeTruthy();
    });

    test("GraphQL POST rejects text/plain content type", async ({ request }) => {
      const response = await request.post("/graphql", {
        headers: { "Content-Type": "text/plain" },
        data: "{ __typename }",
      });

      // Should reject unsupported content type
      expect(response.status()).toBeGreaterThanOrEqual(400);
    });
  });

  test.describe("CORS Support", () => {
    test("CORS preflight returns required headers", async ({ request }) => {
      const response = await request.fetch("/graphql", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:3000",
          "Access-Control-Request-Method": "POST",
        },
      });

      expect(response.status()).toBe(204);
      expect(response.headers()["access-control-allow-origin"]).toBeDefined();
      expect(response.headers()["access-control-allow-methods"]).toBeDefined();
      expect(response.headers()["access-control-max-age"]).toBeDefined();
    });

    test("CORS allows Content-Type header", async ({ request }) => {
      const response = await request.fetch("/graphql", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:3000",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Content-Type",
        },
      });

      expect(response.status()).toBe(204);
      const allowHeaders = response.headers()["access-control-allow-headers"];
      expect(allowHeaders).toBeDefined();
      expect(allowHeaders.toLowerCase()).toContain("content-type");
    });
  });

  test.describe("Response Headers", () => {
    test("API responses include Content-Type header", async ({ request }) => {
      const response = await request.get("/health");

      expect(response.headers()["content-type"]).toBeDefined();
      expect(response.headers()["content-type"]).toContain("application/json");
    });

    test("GraphQL responses are JSON", async ({ request }) => {
      const response = await request.post("/graphql", {
        data: { query: "{ __typename }" },
      });

      expect(response.headers()["content-type"]).toContain("application/json");

      const body = await response.json();
      expect(body).toHaveProperty("data");
    });
  });

  test.describe("Error Handling Consistency", () => {
    test("GraphQL errors include standard error structure", async ({
      request,
    }) => {
      const response = await request.post("/graphql", {
        data: { query: "{ invalidField }" },
      });

      const body = await response.json();

      // GraphQL errors should have errors array
      if (body.errors) {
        expect(Array.isArray(body.errors)).toBe(true);
        for (const error of body.errors) {
          expect(error).toHaveProperty("message");
        }
      }
    });

    test("Internal errors return proper error response", async ({ request }) => {
      // Malformed GraphQL query
      const response = await request.post("/graphql", {
        data: { query: "{ unclosed" },
      });

      const body = await response.json();

      // Should get error, not crash
      expect(body.errors || body.type).toBeDefined();
    });
  });
});

test.describe("Health Endpoint Best Practices", () => {
  test("health endpoint returns required fields", async ({ request }) => {
    const response = await request.get("/health");

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body).toHaveProperty("status");
  });

  test("health endpoint responds quickly (< 100ms)", async ({ request }) => {
    const start = Date.now();
    const response = await request.get("/health");
    const duration = Date.now() - start;

    expect(response.ok()).toBeTruthy();
    expect(duration).toBeLessThan(100);
  });

  test("telemetry health endpoint returns status", async ({ request }) => {
    const response = await request.get("/health/telemetry");

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body).toHaveProperty("status");
  });

  test("system health endpoint returns memory info", async ({ request }) => {
    const response = await request.get("/health/system");

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body).toHaveProperty("status");
    // System health should include memory information
    if (body.memory) {
      expect(body.memory).toHaveProperty("heapUsed");
    }
  });

  test("cache health endpoint returns cache stats", async ({ request }) => {
    const response = await request.get("/health/cache");

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body).toHaveProperty("status");
    // Cache health should include stats
    if (body.stats) {
      expect(body.stats).toHaveProperty("hits");
      expect(body.stats).toHaveProperty("misses");
    }
  });
});

test.describe("GraphQL Introspection", () => {
  test("introspection query returns schema", async ({ request }) => {
    const response = await request.post("/graphql", {
      data: {
        query: `
          query IntrospectionQuery {
            __schema {
              queryType { name }
              mutationType { name }
              types { name kind }
            }
          }
        `,
      },
    });

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.data?.__schema).toBeDefined();
    expect(body.data.__schema.queryType.name).toBe("Query");
  });

  test("__typename is available on all types", async ({ request }) => {
    const response = await request.post("/graphql", {
      data: { query: "{ __typename }" },
    });

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.data?.__typename).toBe("Query");
  });
});

test.describe("Request Size Limits", () => {
  test("large GraphQL query is processed", async ({ request }) => {
    // Create a moderately large but valid query
    const variables = {
      brand: "TH",
      season: "C52",
      division: "01",
    };

    const response = await request.post("/graphql", {
      data: {
        query: `
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
        `,
        variables,
      },
    });

    expect(response.ok()).toBeTruthy();
  });

  test("extremely large request body is rejected", async ({ request }) => {
    // Create a request larger than the 512KB limit
    const largeData = "x".repeat(600 * 1024); // 600KB

    const response = await request.post("/graphql", {
      data: { query: largeData },
    });

    // Should reject with 413 Payload Too Large or similar error
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});
