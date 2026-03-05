/* tests/integration/graphql.test.ts - GraphQL Resolver Integration Tests */

import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

// Mock Couchbase connection before importing resolvers
const mockQueryResult = {
  rows: [
    {
      brand: "TestBrand",
      season: "2024S",
      division: "WOMEN",
      looks: [
        {
          id: "look_123",
          name: "Test Look",
          images: ["image1.jpg", "image2.jpg"],
          status: "active",
        },
      ],
    },
  ],
};

const mockCluster = {
  query: mock(() => Promise.resolve(mockQueryResult)),
  bucket: mock(() => ({
    scope: mock(() => ({
      collection: mock(() => ({
        get: mock(() =>
          Promise.resolve({
            content: {
              id: "look_123",
              name: "Test Look",
              description: "Test look description",
              images: ["image1.jpg"],
            },
          })
        ),
      })),
    })),
  })),
};

const mockConnection = {
  cluster: mockCluster,
  defaultBucket: mockCluster.bucket("default"),
  defaultScope: mockCluster.bucket("default").scope("_default"),
  defaultCollection: mockCluster.bucket("default").scope("_default").collection("_default"),
  bucket: mockCluster.bucket,
  scope: (bucket: string, scope: string) => mockCluster.bucket(bucket).scope(scope),
  collection: (bucket: string, scope: string, collection: string) =>
    mockCluster.bucket(bucket).scope(scope).collection(collection),
  errors: {
    DocumentNotFoundError: class extends Error {
      constructor(message: string) {
        super(message);
        this.name = "DocumentNotFoundError";
      }
    },
    CouchbaseError: class extends Error {
      constructor(message: string) {
        super(message);
        this.name = "CouchbaseError";
      }
    },
  },
};

// Mock cluster provider
mock.module("../../src/lib/clusterProvider", () => ({
  getCluster: mock(() => Promise.resolve(mockConnection)),
}));

// Mock telemetry
mock.module("../../src/telemetry", () => ({
  log: mock(() => {}),
  err: mock(() => {}),
  measureDatabaseOperation: mock(async (operation: () => Promise<any>) => {
    return await operation();
  }),
  createCouchbaseGetSpan: mock(async (_bucket: string, _key: string, operation: () => Promise<any>) => {
    return await operation();
  }),
  createCouchbaseQuerySpan: mock(async (_bucket: string, _query: string, operation: () => Promise<any>) => {
    return await operation();
  }),
  createCouchbaseSearchSpan: mock(async (_bucket: string, _query: string, operation: () => Promise<any>) => {
    return await operation();
  }),
  createDatabaseSpan: mock(async (_options: any, operation: () => Promise<any>) => {
    return await operation();
  }),
}));

describe("GraphQL Resolvers Integration", () => {
  let resolvers: any;

  beforeAll(async () => {
    // Import resolvers after mocking
    resolvers = (await import("../../src/graphql/resolvers")).default;
  });

  beforeEach(() => {
    // Reset all mocks before each test
    mockCluster.query.mockClear();
  });

  describe("Looks Resolver", () => {
    test("should fetch looks successfully", async () => {
      const args = {
        brand: "TestBrand",
        season: "2024S",
        division: "WOMEN",
      };

      const result = await resolvers.Query.looks(null, args);

      expect(result).toBeDefined();
      expect(mockCluster.query).toHaveBeenCalledTimes(1);

      // Verify the query was called with correct parameters
      const queryCall = mockCluster.query.mock.calls[0];
      expect(queryCall[0]).toContain("TestBrand");
      expect(queryCall[0]).toContain("2024S");
      expect(queryCall[0]).toContain("WOMEN");

      // Verify query options
      expect(queryCall[1]).toEqual({
        parameters: {
          brand: "TestBrand",
          season: "2024S",
          division: "WOMEN",
        },
      });

      expect(result).toEqual(mockQueryResult.rows[0]);
    });

    test("should handle missing required parameters", async () => {
      const args = {
        brand: "TestBrand",
        // Missing season and division
      };

      await expect(resolvers.Query.looks(null, args)).rejects.toThrow();
    });

    test("should handle database errors", async () => {
      mockCluster.query.mockRejectedValueOnce(new Error("Database connection failed"));

      const args = {
        brand: "TestBrand",
        season: "2024S",
        division: "WOMEN",
      };

      await expect(resolvers.Query.looks(null, args)).rejects.toThrow("Database connection failed");
    });
  });

  describe("LookDetails Resolver", () => {
    test("should fetch look details successfully", async () => {
      const args = { lookId: "look_123" };

      const result = await resolvers.Query.lookDetails(null, args);

      expect(result).toBeDefined();

      // Should use collection.get for document retrieval
      const collectionMock = mockConnection.defaultCollection;
      expect(collectionMock.get).toHaveBeenCalledWith("look_123");
    });

    test("should handle document not found", async () => {
      const collectionMock = mockConnection.defaultCollection;
      const DocumentNotFoundError = mockConnection.errors.DocumentNotFoundError;

      collectionMock.get.mockRejectedValueOnce(new DocumentNotFoundError("Document not found"));

      const args = { lookId: "non_existent_look" };

      await expect(resolvers.Query.lookDetails(null, args)).rejects.toThrow("Document not found");
    });
  });

  describe("OptionsSummary Resolver", () => {
    test("should fetch options summary successfully", async () => {
      mockCluster.query.mockResolvedValueOnce({
        rows: [
          {
            brand: "TestBrand",
            season: "2024S",
            division: "WOMEN",
            totalOptions: 150,
            optionsByCategory: {
              tops: 50,
              bottoms: 40,
              accessories: 60,
            },
          },
        ],
      });

      const args = {
        brand: "TestBrand",
        season: "2024S",
        division: "WOMEN",
      };

      const result = await resolvers.Query.optionsSummary(null, args);

      expect(result).toBeDefined();
      expect(result.totalOptions).toBe(150);
      expect(result.optionsByCategory).toBeDefined();

      expect(mockCluster.query).toHaveBeenCalledTimes(1);
    });

    test("should return empty summary when no data found", async () => {
      mockCluster.query.mockResolvedValueOnce({
        rows: [],
      });

      const args = {
        brand: "NonExistentBrand",
        season: "2024S",
        division: "WOMEN",
      };

      const result = await resolvers.Query.optionsSummary(null, args);

      expect(result).toBeUndefined();
    });
  });

  describe("Health Resolver", () => {
    test("should return health status", async () => {
      const result = await resolvers.Query.health();

      expect(result).toBeDefined();
      expect(result.status).toBe("healthy");
      expect(result.timestamp).toBeDefined();
      expect(result.database).toBe("connected");
    });
  });

  describe("Error Handling", () => {
    test("should handle Couchbase connection errors", async () => {
      const CouchbaseError = mockConnection.errors.CouchbaseError;
      mockCluster.query.mockRejectedValueOnce(new CouchbaseError("Connection timeout"));

      const args = {
        brand: "TestBrand",
        season: "2024S",
        division: "WOMEN",
      };

      await expect(resolvers.Query.looks(null, args)).rejects.toThrow("Connection timeout");
    });

    test("should handle invalid query parameters", async () => {
      const args = {
        brand: "", // Empty brand
        season: "2024S",
        division: "WOMEN",
      };

      // This should be validated in the resolver
      await expect(resolvers.Query.looks(null, args)).rejects.toThrow();
    });
  });

  describe("Query Validation", () => {
    test("should validate brand parameter", async () => {
      const invalidArgs = [
        { brand: null, season: "2024S", division: "WOMEN" },
        { brand: undefined, season: "2024S", division: "WOMEN" },
        { brand: "", season: "2024S", division: "WOMEN" },
      ];

      for (const args of invalidArgs) {
        await expect(resolvers.Query.looks(null, args)).rejects.toThrow();
      }
    });

    test("should validate season parameter", async () => {
      const invalidArgs = [
        { brand: "TestBrand", season: "invalid", division: "WOMEN" },
        { brand: "TestBrand", season: null, division: "WOMEN" },
        { brand: "TestBrand", season: "", division: "WOMEN" },
      ];

      for (const args of invalidArgs) {
        await expect(resolvers.Query.looks(null, args)).rejects.toThrow();
      }
    });

    test("should validate division parameter", async () => {
      const _validDivisions = ["WOMEN", "MEN", "KIDS"];
      const invalidDivision = "INVALID_DIVISION";

      const args = {
        brand: "TestBrand",
        season: "2024S",
        division: invalidDivision,
      };

      await expect(resolvers.Query.looks(null, args)).rejects.toThrow();
    });
  });

  describe("Performance", () => {
    test("should complete queries within reasonable time", async () => {
      const start = Date.now();

      const args = {
        brand: "TestBrand",
        season: "2024S",
        division: "WOMEN",
      };

      await resolvers.Query.looks(null, args);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    test("should handle concurrent requests", async () => {
      const args = {
        brand: "TestBrand",
        season: "2024S",
        division: "WOMEN",
      };

      const requests = Array(10)
        .fill(null)
        .map(() => resolvers.Query.looks(null, args));

      const results = await Promise.all(requests);

      expect(results).toHaveLength(10);
      results.forEach((result) => {
        expect(result).toEqual(mockQueryResult.rows[0]);
      });
    });
  });
});
