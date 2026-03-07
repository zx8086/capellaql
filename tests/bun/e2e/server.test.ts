/* tests/bun/e2e/server.test.ts - End-to-End Server Tests (requires running server) */

import { beforeAll, describe, expect, test } from "bun:test";
import { isServiceAvailable } from "../shared/test-skip-conditions";

const BASE_URL = process.env.BASE_URL || "http://localhost:4000";

describe("CapellaQL Server E2E Tests", () => {
  let serverAvailable = false;

  beforeAll(async () => {
    serverAvailable = await isServiceAvailable(`${BASE_URL}/health`, 3000);
    if (!serverAvailable) {
      console.warn("CapellaQL server unavailable — e2e tests will be skipped");
    }
  });

  describe("Health Endpoints", () => {
    test("GET /health should return healthy status", async () => {
      if (!serverAvailable) return;
      const response = await fetch(`${BASE_URL}/health`);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");

      const data = await response.json();
      expect(data.status).toBe("healthy");
      expect(data.timestamp).toBeDefined();
    });

    test("GET /health/telemetry should return telemetry status", async () => {
      if (!serverAvailable) return;
      const response = await fetch(`${BASE_URL}/health/telemetry`);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBeDefined();
      expect(data.timestamp).toBeDefined();
    });

    test("Health endpoints should respond within 1 second", async () => {
      if (!serverAvailable) return;
      const start = Date.now();
      const response = await fetch(`${BASE_URL}/health`);
      const duration = Date.now() - start;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(1000);
    });
  });

  describe("GraphQL Endpoint", () => {
    test("POST /graphql should accept GraphQL queries", async () => {
      if (!serverAvailable) return;
      // Use introspection query which works on any GraphQL schema
      const query = `
        query {
          __schema {
            queryType {
              name
            }
          }
        }
      `;

      const response = await fetch(`${BASE_URL}/graphql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");

      const data = await response.json();
      expect(data.data).toBeDefined();
      expect(data.data.__schema).toBeDefined();
      expect(data.data.__schema.queryType.name).toBe("Query");
    });

    test("POST /graphql should handle GraphQL introspection", async () => {
      if (!serverAvailable) return;
      const query = `
        query IntrospectionQuery {
          __schema {
            queryType {
              name
              fields {
                name
              }
            }
          }
        }
      `;

      const response = await fetch(`${BASE_URL}/graphql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.data).toBeDefined();
      expect(data.data.__schema).toBeDefined();
      expect(data.data.__schema.queryType.name).toBe("Query");

      // Should have at least some query fields defined
      const fields = data.data.__schema.queryType.fields;
      expect(Array.isArray(fields)).toBe(true);
      expect(fields.length).toBeGreaterThan(0);
    });

    test("POST /graphql should return errors for unknown fields", async () => {
      if (!serverAvailable) return;
      const query = `
        query {
          nonExistentField {
            id
          }
        }
      `;

      const response = await fetch(`${BASE_URL}/graphql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      // GraphQL Yoga may return 200 or 400 for validation errors
      const data = await response.json();
      expect(data.errors).toBeDefined();
      expect(Array.isArray(data.errors)).toBe(true);
      expect(data.errors[0].message).toBeDefined();
    });
  });

  describe("CORS Configuration", () => {
    test("All responses should include CORS headers", async () => {
      if (!serverAvailable) return;
      const response = await fetch(`${BASE_URL}/health`);

      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });

  describe("Security Headers", () => {
    test("All responses should include security headers", async () => {
      if (!serverAvailable) return;
      const response = await fetch(`${BASE_URL}/health`);

      expect(response.status).toBe(200);
      expect(response.headers.get("X-XSS-Protection")).toBe("1; mode=block");
      expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("Content-Security-Policy")).toBeDefined();
      expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    });

    test("All responses should include request ID header", async () => {
      if (!serverAvailable) return;
      const response = await fetch(`${BASE_URL}/health`);

      expect(response.status).toBe(200);
      expect(response.headers.get("X-Request-ID")).toBeDefined();
      expect(response.headers.get("X-Request-ID")).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID format
    });
  });

  describe("Rate Limiting", () => {
    test("Should allow normal request volume", async () => {
      if (!serverAvailable) return;
      const requests = Array(10)
        .fill(null)
        .map(() => fetch(`${BASE_URL}/health`));

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe("Error Handling", () => {
    test("Unknown endpoints should return 404", async () => {
      if (!serverAvailable) return;
      const response = await fetch(`${BASE_URL}/unknown-endpoint`);

      expect(response.status).toBe(404);
    });

    test("Invalid JSON in GraphQL requests should return 400", async () => {
      if (!serverAvailable) return;
      const response = await fetch(`${BASE_URL}/graphql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "invalid json",
      });

      expect(response.status).toBe(400);
    });

    test("Server should handle malformed GraphQL queries gracefully", async () => {
      if (!serverAvailable) return;
      const response = await fetch(`${BASE_URL}/graphql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "invalid query syntax {{{" }),
      });

      // GraphQL Yoga returns 200 with errors for parse failures (per GraphQL spec)
      const data = await response.json();
      expect(data.errors).toBeDefined();
      expect(Array.isArray(data.errors)).toBe(true);
      expect(data.errors[0].message).toBeDefined();
    });
  });

  describe("Performance", () => {
    test("Health endpoint should respond quickly under load", async () => {
      if (!serverAvailable) return;
      const concurrentRequests = 20;
      const requests = Array(concurrentRequests)
        .fill(null)
        .map(async () => {
          const start = Date.now();
          const response = await fetch(`${BASE_URL}/health`);
          const duration = Date.now() - start;

          return { status: response.status, duration };
        });

      const results = await Promise.all(requests);

      results.forEach((result) => {
        expect(result.status).toBe(200);
        expect(result.duration).toBeLessThan(5000); // 5 seconds max under load
      });

      const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
      expect(avgDuration).toBeLessThan(1000); // Average should be under 1 second
    });

    test("GraphQL queries should complete within reasonable time", async () => {
      if (!serverAvailable) return;
      const query = `
        query {
          __schema {
            queryType { name }
          }
        }
      `;

      const start = Date.now();
      const response = await fetch(`${BASE_URL}/graphql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });
      const duration = Date.now() - start;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });
});
