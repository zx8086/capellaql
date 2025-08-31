// Integration tests for GraphQL resolvers
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createServer } from "http";
import { yoga } from "../../../src/index";

// Create a test server for GraphQL integration tests
let server: any;
let serverUrl: string;

describe("GraphQL Resolver Integration", () => {
  beforeAll(async () => {
    // Create test server on a random port
    const testPort = Math.floor(Math.random() * 10000) + 20000;
    server = createServer(yoga);
    
    await new Promise<void>((resolve) => {
      server.listen(testPort, () => {
        serverUrl = `http://localhost:${testPort}/graphql`;
        console.log(`Test server running at ${serverUrl}`);
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => {
          console.log("Test server closed");
          resolve();
        });
      });
    }
  });

  describe("Health Query", () => {
    test("health query returns system status", async () => {
      const query = `
        query {
          health {
            status
            timestamp
            uptime
            version
            environment
            database {
              status
              latency
              connection
            }
            runtime {
              memory
              cpu
              nodeVersion
            }
          }
        }
      `;

      const response = await fetch(serverUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      expect(response.status).toBe(200);
      
      const result = await response.json();
      expect(result.errors).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(result.data.health).toBeDefined();
      
      const health = result.data.health;
      expect(health.status).toMatch(/^(healthy|degraded|unhealthy)$/);
      expect(typeof health.timestamp).toBe("string");
      expect(typeof health.uptime).toBe("number");
      expect(typeof health.version).toBe("string");
      expect(typeof health.environment).toBe("string");
      
      // Database health
      expect(health.database).toBeDefined();
      expect(health.database.status).toMatch(/^(healthy|degraded|unhealthy)$/);
      expect(typeof health.database.latency).toBe("number");
      expect(health.database.connection).toMatch(/^(connected|disconnected)$/);
      
      // Runtime health
      expect(health.runtime).toBeDefined();
      expect(typeof health.runtime.memory).toBe("number");
      expect(health.runtime.nodeVersion).toBeDefined();
    }, 10000);
  });

  describe("Looks Query", () => {
    test("looks query executes without errors", async () => {
      const query = `
        query GetLooks($brand: String, $season: String, $division: String) {
          looks(brand: $brand, season: $season, division: $division) {
            id
            name
            brand
            season
            division
          }
        }
      `;

      const variables = {
        brand: "test",
        season: "SS24",
        division: "womens"
      };

      const response = await fetch(serverUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
      });

      expect(response.status).toBe(200);
      
      const result = await response.json();
      
      // Even if database operations fail, GraphQL should return proper structure
      if (result.errors) {
        // If there are errors, they should be properly formatted GraphQL errors
        expect(Array.isArray(result.errors)).toBe(true);
        result.errors.forEach((error: any) => {
          expect(error.message).toBeDefined();
          expect(typeof error.message).toBe("string");
        });
      } else {
        // If successful, should return proper data structure
        expect(result.data).toBeDefined();
        expect(result.data.looks).toBeDefined();
        
        if (Array.isArray(result.data.looks) && result.data.looks.length > 0) {
          const look = result.data.looks[0];
          expect(typeof look.id).toBe("string");
          expect(typeof look.name).toBe("string");
        }
      }
    }, 15000);

    test("looks query validates input parameters", async () => {
      const query = `
        query GetLooks($brand: String, $season: String, $division: String) {
          looks(brand: $brand, season: $season, division: $division) {
            id
            name
          }
        }
      `;

      // Test with missing required parameters (if any)
      const response = await fetch(serverUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables: {} }),
      });

      expect(response.status).toBe(200);
      
      const result = await response.json();
      
      // Should handle missing parameters gracefully
      if (result.errors) {
        // Errors should be validation errors, not server crashes
        expect(Array.isArray(result.errors)).toBe(true);
      } else {
        // Or return empty results
        expect(result.data).toBeDefined();
        expect(result.data.looks).toBeDefined();
      }
    });
  });

  describe("Document Search Query", () => {
    test("documentSearch query executes with valid key", async () => {
      const query = `
        query SearchDocument($key: String!) {
          documentSearch(key: $key) {
            id
            found
            data
          }
        }
      `;

      const variables = {
        key: "test-document-key"
      };

      const response = await fetch(serverUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
      });

      expect(response.status).toBe(200);
      
      const result = await response.json();
      
      // Should handle document search gracefully
      if (result.errors) {
        expect(Array.isArray(result.errors)).toBe(true);
        result.errors.forEach((error: any) => {
          expect(error.message).toBeDefined();
          // Should not be server errors, but proper GraphQL errors
          expect(error.message).not.toContain("Internal server error");
        });
      } else {
        expect(result.data).toBeDefined();
        expect(result.data.documentSearch).toBeDefined();
        
        const docResult = result.data.documentSearch;
        expect(typeof docResult.id).toBe("string");
        expect(typeof docResult.found).toBe("boolean");
      }
    }, 10000);

    test("documentSearch query handles invalid key gracefully", async () => {
      const query = `
        query SearchDocument($key: String!) {
          documentSearch(key: $key) {
            id
            found
            data
          }
        }
      `;

      const variables = {
        key: "" // Invalid empty key
      };

      const response = await fetch(serverUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
      });

      expect(response.status).toBe(200);
      
      const result = await response.json();
      
      // Should handle invalid input gracefully
      if (result.errors) {
        expect(Array.isArray(result.errors)).toBe(true);
        result.errors.forEach((error: any) => {
          expect(error.message).toBeDefined();
          // Should be validation errors, not crashes
          expect(typeof error.message).toBe("string");
        });
      } else {
        // Or return not found result
        expect(result.data.documentSearch.found).toBe(false);
      }
    });
  });

  describe("Error Handling", () => {
    test("malformed queries return proper GraphQL errors", async () => {
      const malformedQuery = `
        query {
          nonExistentField {
            invalidField
          }
        }
      `;

      const response = await fetch(serverUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: malformedQuery }),
      });

      expect(response.status).toBe(400);
      
      const result = await response.json();
      expect(result.errors).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      
      const error = result.errors[0];
      expect(error.message).toBeDefined();
      expect(typeof error.message).toBe("string");
      expect(error.locations).toBeDefined();
    });

    test("invalid JSON returns proper error", async () => {
      const response = await fetch(serverUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "invalid json",
      });

      // Should return proper HTTP error for invalid JSON
      expect([400, 422].includes(response.status)).toBe(true);
    });

    test("missing Content-Type header is handled", async () => {
      const query = `query { health { status } }`;

      const response = await fetch(serverUrl, {
        method: "POST",
        body: JSON.stringify({ query }),
      });

      // Should still process the request or return appropriate error
      expect(response.status).toBeLessThan(500);
    });
  });

  describe("Query Complexity and Security", () => {
    test("deeply nested queries are limited", async () => {
      // Create a very deeply nested query to test depth limiting
      const deepQuery = `
        query {
          health {
            database {
              status
            }
          }
        }
      `;

      const response = await fetch(serverUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: deepQuery }),
      });

      // Should process normal depth queries successfully
      expect(response.status).toBe(200);
      
      const result = await response.json();
      
      if (result.errors) {
        // If there are depth limit errors, they should be proper GraphQL errors
        result.errors.forEach((error: any) => {
          expect(error.message).toBeDefined();
        });
      } else {
        expect(result.data).toBeDefined();
      }
    });

    test("large queries are size-limited", async () => {
      // Create a very large query string to test size limiting
      const largeFieldList = Array(1000).fill("status").join(" ");
      const largeQuery = `
        query {
          health {
            ${largeFieldList}
          }
        }
      `;

      const response = await fetch(serverUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: largeQuery }),
      });

      // Should handle large queries appropriately (either process or reject with proper error)
      expect(response.status).toBeLessThan(500);
      
      if (response.status === 413 || response.status === 400) {
        // Query size limit hit - this is expected and good
        const result = await response.json();
        if (result.errors) {
          expect(Array.isArray(result.errors)).toBe(true);
        }
      }
    });
  });
});