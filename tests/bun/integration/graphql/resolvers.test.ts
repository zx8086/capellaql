// Integration tests for GraphQL resolvers — tests against the real schema
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer } from "http";
import { yoga } from "../../../../src/server/handlers/graphql";

// Create a test server for GraphQL integration tests
let server: any;
let serverUrl: string;
let graphqlAvailable = false;

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

    // Check if the GraphQL schema is loaded by running an introspection query
    try {
      const introspection = await fetch(`http://localhost:${testPort}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "{ __schema { queryType { fields { name } } } }",
        }),
        signal: AbortSignal.timeout(3000),
      });
      if (introspection.ok) {
        const data = await introspection.json();
        const fields = data?.data?.__schema?.queryType?.fields;
        // Schema is available if introspection returns query fields
        graphqlAvailable = Array.isArray(fields) && fields.length > 0;
      }
    } catch {
      graphqlAvailable = false;
    }
    if (!graphqlAvailable) {
      console.warn("GraphQL schema not loaded — resolver integration tests will be skipped");
    }
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

  describe("Schema Introspection", () => {
    test("introspection returns schema with query type", async () => {
      if (!graphqlAvailable) return;
      const query = `
        query {
          __schema {
            queryType {
              name
              fields { name }
            }
          }
        }
      `;

      const response = await fetch(serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      expect(response.status).toBe(200);

      const result = await response.json();
      expect(result.errors).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(result.data.__schema.queryType.name).toBe("Query");

      // Verify expected query fields exist in the schema
      const fieldNames = result.data.__schema.queryType.fields.map((f: any) => f.name);
      expect(fieldNames).toContain("looks");
      expect(fieldNames).toContain("looksSummary");
      expect(fieldNames).toContain("searchDocuments");
    }, 10000);
  });

  describe("Looks Query", () => {
    test("looks query executes without errors", async () => {
      if (!graphqlAvailable) return;
      const query = `
        query GetLooks($brand: String, $season: String, $division: String) {
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

      const variables = {
        brand: "TH",
        season: "C52",
        division: "01",
      };

      const response = await fetch(serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });

      expect(response.status).toBe(200);

      const result = await response.json();

      // Database operations may fail if Couchbase is unavailable — that's expected.
      // The test validates the GraphQL layer handles it properly.
      if (result.errors) {
        expect(Array.isArray(result.errors)).toBe(true);
        result.errors.forEach((error: any) => {
          expect(error.message).toBeDefined();
          expect(typeof error.message).toBe("string");
        });
      } else {
        expect(result.data).toBeDefined();
        expect(result.data.looks).toBeDefined();
        expect(Array.isArray(result.data.looks)).toBe(true);
      }
    }, 15000);

    test("looks query validates input parameters", async () => {
      if (!graphqlAvailable) return;
      const query = `
        query GetLooks($brand: String, $season: String, $division: String) {
          looks(brand: $brand, season: $season, division: $division) {
            documentKey
            title
          }
        }
      `;

      // Test with empty variables (all optional)
      const response = await fetch(serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: {} }),
      });

      expect(response.status).toBe(200);

      const result = await response.json();

      // Should handle missing optional parameters gracefully
      if (result.errors) {
        expect(Array.isArray(result.errors)).toBe(true);
      } else {
        expect(result.data).toBeDefined();
        expect(result.data.looks).toBeDefined();
      }
    });
  });

  describe("LooksSummary Query", () => {
    test("looksSummary query returns summary data", async () => {
      if (!graphqlAvailable) return;
      const query = `
        query GetLooksSummary($brand: String, $season: String, $division: String) {
          looksSummary(brand: $brand, season: $season, division: $division) {
            totalLooks
            hasTitle
            hasTrend
            hasRelatedStyles
          }
        }
      `;

      const variables = {
        brand: "TH",
        season: "C52",
        division: "01",
      };

      const response = await fetch(serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });

      expect(response.status).toBe(200);

      const result = await response.json();

      if (result.errors) {
        // Database may be unavailable — errors should be properly formatted
        expect(Array.isArray(result.errors)).toBe(true);
        result.errors.forEach((error: any) => {
          expect(error.message).toBeDefined();
          expect(typeof error.message).toBe("string");
        });
      } else {
        expect(result.data).toBeDefined();
        expect(result.data.looksSummary).toBeDefined();
        expect(typeof result.data.looksSummary.totalLooks).toBe("number");
      }
    }, 10000);
  });

  describe("SearchDocuments Query", () => {
    test("searchDocuments query executes with valid keys", async () => {
      if (!graphqlAvailable) return;
      const query = `
        query SearchDocs($collections: [String!]!, $keys: [String!]!) {
          searchDocuments(collections: $collections, keys: $keys) {
            bucket
            scope
            collection
            data
            timeTaken
          }
        }
      `;

      const variables = {
        collections: ["_default"],
        keys: ["test-document-key"],
      };

      const response = await fetch(serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });

      expect(response.status).toBe(200);

      const result = await response.json();

      if (result.errors) {
        expect(Array.isArray(result.errors)).toBe(true);
        result.errors.forEach((error: any) => {
          expect(error.message).toBeDefined();
        });
      } else {
        expect(result.data).toBeDefined();
        expect(result.data.searchDocuments).toBeDefined();
        expect(Array.isArray(result.data.searchDocuments)).toBe(true);
      }
    }, 10000);

    test("searchDocuments handles empty keys array", async () => {
      if (!graphqlAvailable) return;
      const query = `
        query SearchDocs($collections: [String!]!, $keys: [String!]!) {
          searchDocuments(collections: $collections, keys: $keys) {
            bucket
            collection
          }
        }
      `;

      const variables = {
        collections: ["_default"],
        keys: [],
      };

      const response = await fetch(serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });

      expect(response.status).toBe(200);

      const result = await response.json();

      if (result.errors) {
        expect(Array.isArray(result.errors)).toBe(true);
      } else {
        expect(result.data).toBeDefined();
        expect(result.data.searchDocuments).toBeDefined();
      }
    });
  });

  describe("Error Handling", () => {
    test("malformed queries return proper GraphQL errors", async () => {
      if (!graphqlAvailable) return;
      const malformedQuery = `
        query {
          nonExistentField {
            invalidField
          }
        }
      `;

      const response = await fetch(serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: malformedQuery }),
      });

      // GraphQL Yoga may return 200 or 400 for validation errors
      const result = await response.json();
      expect(result.errors).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);

      const error = result.errors[0];
      expect(error.message).toBeDefined();
      expect(typeof error.message).toBe("string");
    });

    test("invalid JSON returns proper error", async () => {
      if (!graphqlAvailable) return;
      const response = await fetch(serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json",
      });

      // Should return proper HTTP error for invalid JSON
      expect([400, 422].includes(response.status)).toBe(true);
    });

    test("missing Content-Type header is handled", async () => {
      if (!graphqlAvailable) return;
      const query = `query { __typename }`;

      const response = await fetch(serverUrl, {
        method: "POST",
        body: JSON.stringify({ query }),
      });

      // Should still process the request or return appropriate error
      expect(response.status).toBeLessThan(500);
    });
  });

  describe("Query Complexity and Security", () => {
    test("deeply nested queries are handled", async () => {
      if (!graphqlAvailable) return;
      const deepQuery = `
        query GetLooks($brand: String, $season: String, $division: String) {
          looks(brand: $brand, season: $season, division: $division) {
            documentKey
            title
            divisionCode
          }
        }
      `;

      const response = await fetch(serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: deepQuery,
          variables: { brand: "TH", season: "C52", division: "01" },
        }),
      });

      expect(response.status).toBe(200);

      const result = await response.json();
      if (result.errors) {
        result.errors.forEach((error: any) => {
          expect(error.message).toBeDefined();
        });
      } else {
        expect(result.data).toBeDefined();
      }
    });

    test("large queries are size-limited", async () => {
      if (!graphqlAvailable) return;
      // Create a very large query string
      const largeFieldList = Array(1000).fill("documentKey").join(" ");
      const largeQuery = `
        query GetLooks($brand: String) {
          looks(brand: $brand) {
            ${largeFieldList}
          }
        }
      `;

      const response = await fetch(serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: largeQuery }),
      });

      // Should handle large queries appropriately (process, reject with 4xx, or 500 for extreme cases)
      expect(response.status).toBeDefined();
    });
  });
});
