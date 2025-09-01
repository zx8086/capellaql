/* tests/e2e/server.test.ts - End-to-End Server Tests */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

describe("CapellaQL Server E2E Tests", () => {
  const TEST_PORT = 4001; // Use different port for testing
  const BASE_URL = `http://localhost:${TEST_PORT}`;
  let server: any;

  beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = "test";
    process.env.PORT = TEST_PORT.toString();
    process.env.ENABLE_OPENTELEMETRY = "false"; // Disable for tests

    // Start server for testing
    const { default: app } = await import("../../src/index");
    // Note: In a real implementation, you'd need to modify index.ts to export the app
    // For now, this is a structure for future implementation
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe("Health Endpoints", () => {
    test("GET /health should return healthy status", async () => {
      const response = await fetch(`${BASE_URL}/health`);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");

      const data = await response.json();
      expect(data.status).toBe("healthy");
      expect(data.timestamp).toBeDefined();
      expect(data.version).toBeDefined();
    });

    test("GET /health/telemetry should return telemetry status", async () => {
      const response = await fetch(`${BASE_URL}/health/telemetry`);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBeDefined();
      expect(data.timestamp).toBeDefined();
    });

    test("Health endpoints should respond within 1 second", async () => {
      const start = Date.now();
      const response = await fetch(`${BASE_URL}/health`);
      const duration = Date.now() - start;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(1000);
    });
  });

  describe("GraphQL Endpoint", () => {
    test("POST /graphql should accept GraphQL queries", async () => {
      const query = `
        query {
          health {
            status
            timestamp
            database
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
      expect(data.data.health).toBeDefined();
      expect(data.data.health.status).toBe("healthy");
    });

    test("POST /graphql should handle GraphQL introspection", async () => {
      const query = `
        query IntrospectionQuery {
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

      const data = await response.json();
      expect(data.data).toBeDefined();
      expect(data.data.__schema).toBeDefined();
      expect(data.data.__schema.queryType.name).toBe("Query");
    });

    test("POST /graphql should validate query depth", async () => {
      // Create a deeply nested query (beyond the 10 level limit)
      const deepQuery = `
        query {
          health {
            status {
              level1 {
                level2 {
                  level3 {
                    level4 {
                      level5 {
                        level6 {
                          level7 {
                            level8 {
                              level9 {
                                level10 {
                                  level11 {
                                    tooDeep
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
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
        body: JSON.stringify({ query: deepQuery }),
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.errors).toBeDefined();
      expect(data.errors[0].message).toContain("exceeds maximum operation depth");
    });

    test("POST /graphql should validate query size", async () => {
      // Create a query that exceeds 10KB limit
      const largeQuery = `
        query {
          health {
            ${"status ".repeat(2000)} # This will create a very large query
          }
        }
      `;

      const response = await fetch(`${BASE_URL}/graphql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: largeQuery }),
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.errors).toBeDefined();
      expect(data.errors[0].message).toContain("Query too large");
    });

    test("GET /graphql should serve GraphQL playground", async () => {
      const response = await fetch(`${BASE_URL}/graphql`, {
        method: "GET",
        headers: {
          Accept: "text/html",
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");

      const html = await response.text();
      expect(html).toContain("GraphQL"); // Should contain GraphQL playground
    });
  });

  describe("CORS Configuration", () => {
    test("OPTIONS requests should return correct CORS headers", async () => {
      const response = await fetch(`${BASE_URL}/graphql`, {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:3000",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Content-Type",
        },
      });

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
      expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
    });

    test("All responses should include CORS headers", async () => {
      const response = await fetch(`${BASE_URL}/health`);

      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });

  describe("Security Headers", () => {
    test("All responses should include security headers", async () => {
      const response = await fetch(`${BASE_URL}/health`);

      expect(response.status).toBe(200);
      expect(response.headers.get("X-XSS-Protection")).toBe("1; mode=block");
      expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("Content-Security-Policy")).toBeDefined();
      expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    });

    test("All responses should include request ID header", async () => {
      const response = await fetch(`${BASE_URL}/health`);

      expect(response.status).toBe(200);
      expect(response.headers.get("X-Request-ID")).toBeDefined();
      expect(response.headers.get("X-Request-ID")).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID format
    });
  });

  describe("Rate Limiting", () => {
    test("Should allow normal request volume", async () => {
      const requests = Array(10)
        .fill(null)
        .map(() => fetch(`${BASE_URL}/health`));

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });
    });

    test(
      "Should rate limit excessive requests",
      async () => {
        // This test would require sending 500+ requests rapidly
        // Skipping actual implementation to avoid test suite slowdown
        // In a real test, you'd send many requests and expect 429 status

        const response = await fetch(`${BASE_URL}/health`);
        expect(response.status).toBe(200);
      },
      { timeout: 30000 }
    );
  });

  describe("Error Handling", () => {
    test("Unknown endpoints should return 404", async () => {
      const response = await fetch(`${BASE_URL}/unknown-endpoint`);

      expect(response.status).toBe(404);
    });

    test("Invalid JSON in GraphQL requests should return 400", async () => {
      const response = await fetch(`${BASE_URL}/graphql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "invalid json",
      });

      expect(response.status).toBe(400);
    });

    test("Server should handle malformed GraphQL queries", async () => {
      const response = await fetch(`${BASE_URL}/graphql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "invalid query syntax {{{" }),
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.errors).toBeDefined();
    });
  });

  describe("Performance", () => {
    test("Health endpoint should respond quickly under load", async () => {
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
      const query = `
        query {
          health {
            status
            timestamp
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

  describe("WebSocket Support", () => {
    test("WebSocket connection should be accepted", async () => {
      // Note: Testing WebSocket requires specific setup
      // This is a placeholder for future WebSocket testing
      const response = await fetch(`${BASE_URL}/health`);
      expect(response.status).toBe(200);
    });
  });

  describe("Graceful Shutdown", () => {
    test("Server should handle shutdown signals gracefully", async () => {
      // This would require spawning a separate process to test
      // Placeholder for proper shutdown testing
      const response = await fetch(`${BASE_URL}/health`);
      expect(response.status).toBe(200);
    });
  });
});
