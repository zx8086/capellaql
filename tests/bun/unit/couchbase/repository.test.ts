/* tests/bun/unit/couchbase/repository.test.ts */
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { CouchbaseRepository, createRepository } from "../../../../src/lib/couchbase/repository";
import { CasMismatchError, DocumentNotFoundError } from "../../../../src/lib/couchbase/errors";

// Mock KVOperations
const mockGet = mock(() => Promise.resolve(null));
const mockUpsert = mock(() => Promise.resolve({ cas: "cas-1" }));
const mockInsert = mock(() => Promise.resolve({ cas: "cas-1" }));
const mockReplace = mock(() => Promise.resolve({ cas: "cas-1" }));
const mockRemove = mock(() => Promise.resolve({ cas: "cas-1" }));
const mockExists = mock(() => Promise.resolve(true));
const mockGetMulti = mock(() => Promise.resolve(new Map()));
const mockMutateIn = mock(() => Promise.resolve({ cas: "cas-1" }));

mock.module("../../../../src/lib/couchbase/kv-operations", () => ({
  KVOperations: {
    get: mockGet,
    upsert: mockUpsert,
    insert: mockInsert,
    replace: mockReplace,
    remove: mockRemove,
    exists: mockExists,
    getMulti: mockGetMulti,
    mutateIn: mockMutateIn,
  },
}));

// Mock QueryExecutor
const mockExecuteQuery = mock(() => Promise.resolve({ rows: [] }));

mock.module("../../../../src/lib/couchbase/query-executor", () => ({
  QueryExecutor: {
    execute: mockExecuteQuery,
  },
}));

function createMockCollection() {
  return {
    name: "test-collection",
    get: mock(),
    upsert: mock(),
  } as any;
}

function createMockCluster() {
  return {} as any;
}

interface TestDocument {
  id: string;
  name: string;
  value: number;
}

describe("CouchbaseRepository", () => {
  let repo: CouchbaseRepository<TestDocument>;
  let mockCollection: ReturnType<typeof createMockCollection>;

  beforeEach(() => {
    mockCollection = createMockCollection();
    repo = new CouchbaseRepository<TestDocument>(mockCollection, "TestDocument");

    mockGet.mockClear();
    mockUpsert.mockClear();
    mockInsert.mockClear();
    mockReplace.mockClear();
    mockRemove.mockClear();
    mockExists.mockClear();
    mockGetMulti.mockClear();
    mockMutateIn.mockClear();
    mockExecuteQuery.mockClear();
  });

  describe("findById", () => {
    test("returns document value when found", async () => {
      const doc: TestDocument = { id: "doc-1", name: "Test", value: 42 };
      mockGet.mockImplementationOnce(() =>
        Promise.resolve({ value: doc, content: doc, cas: "cas-1" })
      );

      const result = await repo.findById("doc-1");
      expect(result).toEqual(doc);
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    test("returns null when document not found", async () => {
      mockGet.mockImplementationOnce(() => Promise.resolve(null));

      const result = await repo.findById("nonexistent");
      expect(result).toBeNull();
    });

    test("returns null on DocumentNotFoundError", async () => {
      mockGet.mockImplementationOnce(() =>
        Promise.reject(new DocumentNotFoundError("not found"))
      );

      const result = await repo.findById("missing");
      expect(result).toBeNull();
    });

    test("rethrows non-DocumentNotFoundError errors", async () => {
      mockGet.mockImplementationOnce(() =>
        Promise.reject(new Error("timeout"))
      );

      await expect(repo.findById("doc-1")).rejects.toThrow("timeout");
    });

    test("passes fields for projection", async () => {
      mockGet.mockImplementationOnce(() => Promise.resolve(null));

      await repo.findById("doc-1", ["name", "value"]);
      expect(mockGet).toHaveBeenCalledWith(
        mockCollection,
        "doc-1",
        { project: ["name", "value"] }
      );
    });
  });

  describe("findByIdOrThrow", () => {
    test("returns document when found", async () => {
      const doc: TestDocument = { id: "doc-1", name: "Test", value: 42 };
      mockGet.mockImplementationOnce(() =>
        Promise.resolve({ value: doc, content: doc, cas: "cas-1" })
      );

      const result = await repo.findByIdOrThrow("doc-1");
      expect(result).toEqual(doc);
    });

    test("throws descriptive error when not found", async () => {
      mockGet.mockImplementationOnce(() => Promise.resolve(null));

      await expect(repo.findByIdOrThrow("missing-doc")).rejects.toThrow(
        "TestDocument not found: missing-doc"
      );
    });
  });

  describe("exists", () => {
    test("returns true when document exists", async () => {
      mockExists.mockImplementationOnce(() => Promise.resolve(true));

      const result = await repo.exists("doc-1");
      expect(result).toBe(true);
    });

    test("returns false when document does not exist", async () => {
      mockExists.mockImplementationOnce(() => Promise.resolve(false));

      const result = await repo.exists("nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("findByIds", () => {
    test("delegates to KVOperations.getMulti", async () => {
      const resultMap = new Map<string, TestDocument>([
        ["doc-1", { id: "doc-1", name: "A", value: 1 }],
        ["doc-2", { id: "doc-2", name: "B", value: 2 }],
      ]);
      mockGetMulti.mockImplementationOnce(() => Promise.resolve(resultMap));

      const result = await repo.findByIds(["doc-1", "doc-2"]);
      expect(result.size).toBe(2);
      expect(result.get("doc-1")?.name).toBe("A");
    });

    test("passes fields for projection", async () => {
      mockGetMulti.mockImplementationOnce(() => Promise.resolve(new Map()));

      await repo.findByIds(["doc-1"], ["name"]);
      expect(mockGetMulti).toHaveBeenCalledWith(
        mockCollection,
        ["doc-1"],
        { project: ["name"] }
      );
    });
  });

  describe("save", () => {
    test("upserts document successfully", async () => {
      mockUpsert.mockImplementationOnce(() => Promise.resolve({ cas: "cas-2" }));

      const doc: TestDocument = { id: "doc-1", name: "Test", value: 42 };
      await repo.save("doc-1", doc);

      expect(mockUpsert).toHaveBeenCalledTimes(1);
      expect(mockUpsert).toHaveBeenCalledWith(
        mockCollection,
        "doc-1",
        doc,
        { cas: undefined }
      );
    });

    test("passes CAS value when provided", async () => {
      mockUpsert.mockImplementationOnce(() => Promise.resolve({ cas: "cas-2" }));

      const doc: TestDocument = { id: "doc-1", name: "Test", value: 42 };
      await repo.save("doc-1", doc, "cas-1");

      expect(mockUpsert).toHaveBeenCalledWith(
        mockCollection,
        "doc-1",
        doc,
        { cas: "cas-1" }
      );
    });

    test("retries on CasMismatchError with backoff", async () => {
      const doc: TestDocument = { id: "doc-1", name: "Test", value: 42 };

      // First attempt: CAS mismatch
      mockUpsert.mockImplementationOnce(() =>
        Promise.reject(new CasMismatchError("CAS mismatch"))
      );
      // findById to refresh CAS
      mockGet.mockImplementationOnce(() =>
        Promise.resolve({ value: doc, content: doc, cas: "cas-fresh" })
      );
      // Second attempt: success
      mockUpsert.mockImplementationOnce(() => Promise.resolve({ cas: "cas-3" }));

      await repo.save("doc-1", doc, "cas-old");

      expect(mockUpsert).toHaveBeenCalledTimes(2);
    });

    test("throws after exhausting max CAS retry attempts", async () => {
      const doc: TestDocument = { id: "doc-1", name: "Test", value: 42 };

      // All 5 attempts fail with CAS mismatch
      for (let i = 0; i < 5; i++) {
        mockUpsert.mockImplementationOnce(() =>
          Promise.reject(new CasMismatchError("CAS mismatch"))
        );
        if (i < 4) {
          mockGet.mockImplementationOnce(() =>
            Promise.resolve({ value: doc, content: doc, cas: `cas-${i}` })
          );
        }
      }

      await expect(repo.save("doc-1", doc, "cas-old")).rejects.toThrow();
      expect(mockUpsert).toHaveBeenCalledTimes(5);
    });

    test("rethrows non-CasMismatch errors immediately", async () => {
      const doc: TestDocument = { id: "doc-1", name: "Test", value: 42 };

      mockUpsert.mockImplementationOnce(() =>
        Promise.reject(new Error("network error"))
      );

      await expect(repo.save("doc-1", doc)).rejects.toThrow("network error");
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    });
  });

  describe("create", () => {
    test("delegates to KVOperations.insert", async () => {
      mockInsert.mockImplementationOnce(() => Promise.resolve({ cas: "cas-1" }));

      const doc: TestDocument = { id: "doc-1", name: "New", value: 1 };
      await repo.create("doc-1", doc);

      expect(mockInsert).toHaveBeenCalledWith(mockCollection, "doc-1", doc);
    });
  });

  describe("replace", () => {
    test("delegates to KVOperations.replace", async () => {
      mockReplace.mockImplementationOnce(() => Promise.resolve({ cas: "cas-2" }));

      const doc: TestDocument = { id: "doc-1", name: "Updated", value: 2 };
      await repo.replace("doc-1", doc, "cas-1");

      expect(mockReplace).toHaveBeenCalledWith(
        mockCollection,
        "doc-1",
        doc,
        { cas: "cas-1" }
      );
    });
  });

  describe("updateField", () => {
    test("delegates to KVOperations.mutateIn with upsert spec", async () => {
      mockMutateIn.mockImplementationOnce(() => Promise.resolve({ cas: "cas-2" }));

      await repo.updateField("doc-1", "name", "NewName", "cas-1");

      expect(mockMutateIn).toHaveBeenCalledWith(
        mockCollection,
        "doc-1",
        [{ type: "upsert", path: "name", value: "NewName" }],
        { cas: "cas-1" }
      );
    });
  });

  describe("updateFields", () => {
    test("creates multiple upsert operations", async () => {
      mockMutateIn.mockImplementationOnce(() => Promise.resolve({ cas: "cas-2" }));

      await repo.updateFields("doc-1", { name: "NewName", value: 99 });

      expect(mockMutateIn).toHaveBeenCalledTimes(1);
      const operations = mockMutateIn.mock.calls[0][2];
      expect(operations).toHaveLength(2);
      expect(operations[0]).toEqual({ type: "upsert", path: "name", value: "NewName" });
      expect(operations[1]).toEqual({ type: "upsert", path: "value", value: 99 });
    });
  });

  describe("delete", () => {
    test("removes document", async () => {
      mockRemove.mockImplementationOnce(() => Promise.resolve({ cas: "cas-1" }));

      await repo.delete("doc-1");
      expect(mockRemove).toHaveBeenCalledWith(mockCollection, "doc-1");
    });

    test("is idempotent - ignores DocumentNotFoundError", async () => {
      mockRemove.mockImplementationOnce(() =>
        Promise.reject(new DocumentNotFoundError("not found"))
      );

      // Should not throw
      await repo.delete("already-deleted");
    });

    test("rethrows non-DocumentNotFoundError errors", async () => {
      mockRemove.mockImplementationOnce(() =>
        Promise.reject(new Error("permission denied"))
      );

      await expect(repo.delete("doc-1")).rejects.toThrow("permission denied");
    });
  });

  describe("findByFilter", () => {
    test("constructs parameterized N1QL query", async () => {
      mockExecuteQuery.mockImplementationOnce(() =>
        Promise.resolve({
          rows: [{ "test-collection": { id: "1", name: "A", value: 1 } }],
        })
      );

      const cluster = createMockCluster();
      const results = await repo.findByFilter(cluster, "status", "active");

      expect(mockExecuteQuery).toHaveBeenCalledTimes(1);
      const [, statement, options] = mockExecuteQuery.mock.calls[0];
      expect(statement).toContain("FROM `test-collection`");
      expect(statement).toContain("WHERE status = $filterValue");
      expect(statement).toContain("LIMIT 100");
      expect(options.parameters).toEqual({ filterValue: "active" });
    });

    test("applies orderBy and direction", async () => {
      mockExecuteQuery.mockImplementationOnce(() =>
        Promise.resolve({ rows: [] })
      );

      const cluster = createMockCluster();
      await repo.findByFilter(cluster, "status", "active", {
        orderBy: "name",
        orderDirection: "DESC",
      });

      const [, statement] = mockExecuteQuery.mock.calls[0];
      expect(statement).toContain("ORDER BY name DESC");
    });

    test("applies custom limit and offset", async () => {
      mockExecuteQuery.mockImplementationOnce(() =>
        Promise.resolve({ rows: [] })
      );

      const cluster = createMockCluster();
      await repo.findByFilter(cluster, "status", "active", {
        limit: 10,
        offset: 20,
      });

      const [, statement] = mockExecuteQuery.mock.calls[0];
      expect(statement).toContain("LIMIT 10");
      expect(statement).toContain("OFFSET 20");
    });

    test("maps rows extracting collection values", async () => {
      mockExecuteQuery.mockImplementationOnce(() =>
        Promise.resolve({
          rows: [
            { "test-collection": { id: "1", name: "A", value: 1 } },
            { "test-collection": { id: "2", name: "B", value: 2 } },
          ],
        })
      );

      const cluster = createMockCluster();
      const results = await repo.findByFilter(cluster, "type", "item");

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe("A");
      expect(results[1].name).toBe("B");
    });
  });

  describe("findOneBy", () => {
    test("returns first result from findByFilter", async () => {
      mockExecuteQuery.mockImplementationOnce(() =>
        Promise.resolve({
          rows: [{ "test-collection": { id: "1", name: "A", value: 1 } }],
        })
      );

      const cluster = createMockCluster();
      const result = await repo.findOneBy(cluster, "name", "A");

      expect(result).toBeDefined();
      expect(result?.name).toBe("A");
    });

    test("returns null when no results", async () => {
      mockExecuteQuery.mockImplementationOnce(() =>
        Promise.resolve({ rows: [] })
      );

      const cluster = createMockCluster();
      const result = await repo.findOneBy(cluster, "name", "nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("count", () => {
    test("returns count from query", async () => {
      mockExecuteQuery.mockImplementationOnce(() =>
        Promise.resolve({ rows: [{ count: 42 }] })
      );

      const cluster = createMockCluster();
      const result = await repo.count(cluster);

      expect(result).toBe(42);
      const [, statement] = mockExecuteQuery.mock.calls[0];
      expect(statement).toContain("SELECT COUNT(*) as count");
    });

    test("adds WHERE clause when filter provided", async () => {
      mockExecuteQuery.mockImplementationOnce(() =>
        Promise.resolve({ rows: [{ count: 5 }] })
      );

      const cluster = createMockCluster();
      const result = await repo.count(cluster, "status", "active");

      expect(result).toBe(5);
      const [, statement, options] = mockExecuteQuery.mock.calls[0];
      expect(statement).toContain("WHERE status = $filterValue");
      expect(options.parameters).toEqual({ filterValue: "active" });
    });

    test("returns 0 when no rows", async () => {
      mockExecuteQuery.mockImplementationOnce(() =>
        Promise.resolve({ rows: [] })
      );

      const cluster = createMockCluster();
      const result = await repo.count(cluster);
      expect(result).toBe(0);
    });
  });

  describe("createRepository factory", () => {
    test("creates a CouchbaseRepository instance", () => {
      const repo = createRepository<TestDocument>(mockCollection, "TestDoc");
      expect(repo).toBeInstanceOf(CouchbaseRepository);
    });
  });
});
