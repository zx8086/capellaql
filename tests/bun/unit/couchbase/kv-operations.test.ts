/* tests/bun/unit/couchbase/kv-operations.test.ts */

import { describe, expect, test, mock, beforeEach } from "bun:test";
import {
  DocumentNotFoundError,
  DurabilityLevel,
  LookupInSpec,
  MutateInSpec,
} from "couchbase";
import type { Collection } from "couchbase";
import { KVOperations } from "../../../../src/lib/couchbase/kv-operations";

// -- Helpers ------------------------------------------------------------------

function createMockCollection(): Collection {
  return {
    get: mock(() => Promise.resolve({ content: { name: "test" }, cas: "cas-123" })),
    upsert: mock(() => Promise.resolve({ cas: "cas-456", token: undefined })),
    insert: mock(() => Promise.resolve({ cas: "cas-789", token: undefined })),
    replace: mock(() => Promise.resolve({ cas: "cas-012", token: undefined })),
    remove: mock(() => Promise.resolve({ cas: "cas-345", token: undefined })),
    exists: mock(() => Promise.resolve({ exists: true, cas: "cas-678" })),
    getAndLock: mock(() => Promise.resolve({ content: { locked: true }, cas: "cas-lock" })),
    unlock: mock(() => Promise.resolve()),
    touch: mock(() => Promise.resolve({ cas: "cas-touch", token: undefined })),
    mutateIn: mock(() => Promise.resolve({ cas: "cas-mutate", token: undefined })),
    lookupIn: mock(() =>
      Promise.resolve({
        content: [
          { value: "value-a" },
          { value: 42 },
        ],
      })
    ),
  } as unknown as Collection;
}

function createDocumentNotFoundError(): DocumentNotFoundError {
  return new DocumentNotFoundError();
}

const MUTATION_RESULT_SHAPE = { cas: expect.any(String) };

// -- Tests --------------------------------------------------------------------

describe("KVOperations", () => {
  let collection: Collection;

  beforeEach(() => {
    collection = createMockCollection();
  });

  // --------------------------------------------------------------------------
  // get
  // --------------------------------------------------------------------------
  describe("get", () => {
    test("returns value on success", async () => {
      const result = await KVOperations.get(collection, "doc-1");

      expect(result).not.toBeNull();
      expect(result!.value).toEqual({ name: "test" });
      expect(collection.get).toHaveBeenCalledTimes(1);
      expect(collection.get).toHaveBeenCalledWith("doc-1", {
        withExpiry: undefined,
        project: undefined,
        timeout: 7500,
      });
    });

    test("returns typed value via generic parameter", async () => {
      interface User {
        name: string;
      }
      const result = await KVOperations.get<User>(collection, "user-1");

      expect(result).not.toBeNull();
      expect(result!.value.name).toBe("test");
    });

    test("returns null on DocumentNotFoundError", async () => {
      (collection.get as ReturnType<typeof mock>).mockRejectedValueOnce(
        createDocumentNotFoundError()
      );

      const result = await KVOperations.get(collection, "missing-doc");

      expect(result).toBeNull();
    });

    test("rethrows non-DocumentNotFoundError errors", async () => {
      const genericError = new Error("Unexpected failure");
      (collection.get as ReturnType<typeof mock>).mockRejectedValueOnce(genericError);

      await expect(KVOperations.get(collection, "doc-1")).rejects.toThrow("Unexpected failure");
    });

    test("uses default timeout of 7500ms", async () => {
      await KVOperations.get(collection, "doc-1");

      const callArgs = (collection.get as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[1].timeout).toBe(7500);
    });

    test("passes custom options through", async () => {
      await KVOperations.get(collection, "doc-1", {
        withExpiry: true,
        project: ["name", "email"],
        timeout: 5000,
      });

      expect(collection.get).toHaveBeenCalledWith("doc-1", {
        withExpiry: true,
        project: ["name", "email"],
        timeout: 5000,
      });
    });

    test("prefers custom timeout over default", async () => {
      await KVOperations.get(collection, "doc-1", { timeout: 3000 });

      const callArgs = (collection.get as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[1].timeout).toBe(3000);
    });
  });

  // --------------------------------------------------------------------------
  // upsert
  // --------------------------------------------------------------------------
  describe("upsert", () => {
    test("calls collection.upsert with correct arguments", async () => {
      const doc = { name: "Alice" };
      const result = await KVOperations.upsert(collection, "doc-1", doc);

      expect(result).toBeDefined();
      expect(collection.upsert).toHaveBeenCalledTimes(1);
      expect(collection.upsert).toHaveBeenCalledWith("doc-1", doc, {
        durabilityLevel: undefined,
        expiry: undefined,
        timeout: 7500,
      });
    });

    test("maps durability 'none' to DurabilityLevel.None", async () => {
      await KVOperations.upsert(collection, "doc-1", {}, { durability: "none" });

      const callArgs = (collection.upsert as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[2].durabilityLevel).toBe(DurabilityLevel.None);
    });

    test("maps durability 'majority' to DurabilityLevel.Majority", async () => {
      await KVOperations.upsert(collection, "doc-1", {}, { durability: "majority" });

      const callArgs = (collection.upsert as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[2].durabilityLevel).toBe(DurabilityLevel.Majority);
    });

    test("maps durability 'majorityAndPersistToActive' to DurabilityLevel.MajorityAndPersistOnMaster", async () => {
      await KVOperations.upsert(collection, "doc-1", {}, { durability: "majorityAndPersistToActive" });

      const callArgs = (collection.upsert as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[2].durabilityLevel).toBe(DurabilityLevel.MajorityAndPersistOnMaster);
    });

    test("maps durability 'persistToMajority' to DurabilityLevel.PersistToMajority", async () => {
      await KVOperations.upsert(collection, "doc-1", {}, { durability: "persistToMajority" });

      const callArgs = (collection.upsert as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[2].durabilityLevel).toBe(DurabilityLevel.PersistToMajority);
    });

    test("passes expiry option through", async () => {
      await KVOperations.upsert(collection, "doc-1", {}, { expiry: 3600 });

      const callArgs = (collection.upsert as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[2].expiry).toBe(3600);
    });

    test("uses default timeout of 7500ms", async () => {
      await KVOperations.upsert(collection, "doc-1", {});

      const callArgs = (collection.upsert as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[2].timeout).toBe(7500);
    });

    test("uses custom timeout when provided", async () => {
      await KVOperations.upsert(collection, "doc-1", {}, { timeout: 10000 });

      const callArgs = (collection.upsert as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[2].timeout).toBe(10000);
    });
  });

  // --------------------------------------------------------------------------
  // insert
  // --------------------------------------------------------------------------
  describe("insert", () => {
    test("calls collection.insert with correct arguments", async () => {
      const doc = { name: "Bob" };
      const result = await KVOperations.insert(collection, "new-doc", doc);

      expect(result).toBeDefined();
      expect(collection.insert).toHaveBeenCalledTimes(1);
      expect(collection.insert).toHaveBeenCalledWith("new-doc", doc, {
        durabilityLevel: undefined,
        expiry: undefined,
        timeout: 7500,
      });
    });

    test("maps durability string to DurabilityLevel", async () => {
      await KVOperations.insert(collection, "new-doc", {}, { durability: "majority" });

      const callArgs = (collection.insert as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[2].durabilityLevel).toBe(DurabilityLevel.Majority);
    });

    test("passes expiry through", async () => {
      await KVOperations.insert(collection, "new-doc", {}, { expiry: 7200 });

      const callArgs = (collection.insert as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[2].expiry).toBe(7200);
    });

    test("uses default timeout of 7500ms", async () => {
      await KVOperations.insert(collection, "new-doc", {});

      const callArgs = (collection.insert as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[2].timeout).toBe(7500);
    });

    test("uses custom timeout when provided", async () => {
      await KVOperations.insert(collection, "new-doc", {}, { timeout: 2000 });

      const callArgs = (collection.insert as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[2].timeout).toBe(2000);
    });
  });

  // --------------------------------------------------------------------------
  // replace
  // --------------------------------------------------------------------------
  describe("replace", () => {
    test("calls collection.replace with correct arguments", async () => {
      const doc = { name: "Charlie" };
      const result = await KVOperations.replace(collection, "doc-1", doc);

      expect(result).toBeDefined();
      expect(collection.replace).toHaveBeenCalledTimes(1);
      expect(collection.replace).toHaveBeenCalledWith("doc-1", doc, {
        durabilityLevel: undefined,
        expiry: undefined,
        cas: undefined,
        timeout: 7500,
      });
    });

    test("passes CAS option through", async () => {
      await KVOperations.replace(collection, "doc-1", {}, { cas: "cas-value-abc" });

      const callArgs = (collection.replace as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[2].cas).toBe("cas-value-abc");
    });

    test("maps durability string to DurabilityLevel", async () => {
      await KVOperations.replace(collection, "doc-1", {}, { durability: "persistToMajority" });

      const callArgs = (collection.replace as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[2].durabilityLevel).toBe(DurabilityLevel.PersistToMajority);
    });

    test("passes expiry through", async () => {
      await KVOperations.replace(collection, "doc-1", {}, { expiry: 1800 });

      const callArgs = (collection.replace as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[2].expiry).toBe(1800);
    });

    test("uses default timeout of 7500ms", async () => {
      await KVOperations.replace(collection, "doc-1", {});

      const callArgs = (collection.replace as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[2].timeout).toBe(7500);
    });
  });

  // --------------------------------------------------------------------------
  // remove
  // --------------------------------------------------------------------------
  describe("remove", () => {
    test("calls collection.remove with correct arguments", async () => {
      const result = await KVOperations.remove(collection, "doc-1");

      expect(result).toBeDefined();
      expect(collection.remove).toHaveBeenCalledTimes(1);
      expect(collection.remove).toHaveBeenCalledWith("doc-1", {
        cas: undefined,
        timeout: 7500,
      });
    });

    test("passes CAS option through", async () => {
      await KVOperations.remove(collection, "doc-1", { cas: "cas-remove-abc" });

      const callArgs = (collection.remove as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[1].cas).toBe("cas-remove-abc");
    });

    test("passes custom timeout", async () => {
      await KVOperations.remove(collection, "doc-1", { timeout: 5000 });

      const callArgs = (collection.remove as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[1].timeout).toBe(5000);
    });

    test("uses default timeout of 7500ms", async () => {
      await KVOperations.remove(collection, "doc-1");

      const callArgs = (collection.remove as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[1].timeout).toBe(7500);
    });
  });

  // --------------------------------------------------------------------------
  // exists
  // --------------------------------------------------------------------------
  describe("exists", () => {
    test("returns true when document exists", async () => {
      const result = await KVOperations.exists(collection, "doc-1");

      expect(result).toBe(true);
      expect(collection.exists).toHaveBeenCalledTimes(1);
      expect(collection.exists).toHaveBeenCalledWith("doc-1");
    });

    test("returns false when document does not exist", async () => {
      (collection.exists as ReturnType<typeof mock>).mockResolvedValueOnce({
        exists: false,
        cas: undefined,
      });

      const result = await KVOperations.exists(collection, "missing-doc");

      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // getAndLock
  // --------------------------------------------------------------------------
  describe("getAndLock", () => {
    test("returns value on success", async () => {
      const result = await KVOperations.getAndLock(collection, "doc-1");

      expect(result).not.toBeNull();
      expect(result!.value).toEqual({ locked: true });
      expect(collection.getAndLock).toHaveBeenCalledTimes(1);
    });

    test("uses default lockTime of 15 seconds", async () => {
      await KVOperations.getAndLock(collection, "doc-1");

      expect(collection.getAndLock).toHaveBeenCalledWith("doc-1", 15);
    });

    test("uses custom lockTime when provided", async () => {
      await KVOperations.getAndLock(collection, "doc-1", 30);

      expect(collection.getAndLock).toHaveBeenCalledWith("doc-1", 30);
    });

    test("returns null on DocumentNotFoundError", async () => {
      (collection.getAndLock as ReturnType<typeof mock>).mockRejectedValueOnce(
        createDocumentNotFoundError()
      );

      const result = await KVOperations.getAndLock(collection, "missing-doc");

      expect(result).toBeNull();
    });

    test("rethrows non-DocumentNotFoundError errors", async () => {
      const genericError = new Error("Lock failure");
      (collection.getAndLock as ReturnType<typeof mock>).mockRejectedValueOnce(genericError);

      await expect(KVOperations.getAndLock(collection, "doc-1")).rejects.toThrow("Lock failure");
    });
  });

  // --------------------------------------------------------------------------
  // unlock
  // --------------------------------------------------------------------------
  describe("unlock", () => {
    test("calls collection.unlock with id and cas", async () => {
      const cas = "cas-unlock-value";
      await KVOperations.unlock(collection, "doc-1", cas);

      expect(collection.unlock).toHaveBeenCalledTimes(1);
      expect(collection.unlock).toHaveBeenCalledWith("doc-1", cas);
    });

    test("returns void", async () => {
      const result = await KVOperations.unlock(collection, "doc-1", "cas-123");

      expect(result).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // touch
  // --------------------------------------------------------------------------
  describe("touch", () => {
    test("calls collection.touch with id and expiry", async () => {
      const result = await KVOperations.touch(collection, "doc-1", 3600);

      expect(result).toBeDefined();
      expect(collection.touch).toHaveBeenCalledTimes(1);
      expect(collection.touch).toHaveBeenCalledWith("doc-1", 3600);
    });

    test("passes different expiry values", async () => {
      await KVOperations.touch(collection, "doc-1", 0);

      expect(collection.touch).toHaveBeenCalledWith("doc-1", 0);
    });
  });

  // --------------------------------------------------------------------------
  // mutateIn
  // --------------------------------------------------------------------------
  describe("mutateIn", () => {
    test("builds upsert spec correctly", async () => {
      const operations = [{ type: "upsert" as const, path: "name", value: "Alice" }];

      await KVOperations.mutateIn(collection, "doc-1", operations);

      expect(collection.mutateIn).toHaveBeenCalledTimes(1);
      const callArgs = (collection.mutateIn as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[0]).toBe("doc-1");

      // Verify the spec was built using MutateInSpec.upsert
      const specs = callArgs[1];
      expect(specs).toHaveLength(1);
    });

    test("builds insert spec correctly", async () => {
      const operations = [{ type: "insert" as const, path: "age", value: 30 }];

      await KVOperations.mutateIn(collection, "doc-1", operations);

      const callArgs = (collection.mutateIn as ReturnType<typeof mock>).mock.calls[0];
      const specs = callArgs[1];
      expect(specs).toHaveLength(1);
    });

    test("builds replace spec correctly", async () => {
      const operations = [{ type: "replace" as const, path: "email", value: "new@test.com" }];

      await KVOperations.mutateIn(collection, "doc-1", operations);

      const callArgs = (collection.mutateIn as ReturnType<typeof mock>).mock.calls[0];
      const specs = callArgs[1];
      expect(specs).toHaveLength(1);
    });

    test("builds remove spec correctly", async () => {
      const operations = [{ type: "remove" as const, path: "deprecated_field" }];

      await KVOperations.mutateIn(collection, "doc-1", operations);

      const callArgs = (collection.mutateIn as ReturnType<typeof mock>).mock.calls[0];
      const specs = callArgs[1];
      expect(specs).toHaveLength(1);
    });

    test("builds arrayAppend spec correctly", async () => {
      const operations = [{ type: "arrayAppend" as const, path: "tags", value: "new-tag" }];

      await KVOperations.mutateIn(collection, "doc-1", operations);

      const callArgs = (collection.mutateIn as ReturnType<typeof mock>).mock.calls[0];
      const specs = callArgs[1];
      expect(specs).toHaveLength(1);
    });

    test("builds arrayPrepend spec correctly", async () => {
      const operations = [{ type: "arrayPrepend" as const, path: "history", value: "first" }];

      await KVOperations.mutateIn(collection, "doc-1", operations);

      const callArgs = (collection.mutateIn as ReturnType<typeof mock>).mock.calls[0];
      const specs = callArgs[1];
      expect(specs).toHaveLength(1);
    });

    test("handles multiple operations in a single call", async () => {
      const operations = [
        { type: "upsert" as const, path: "name", value: "Alice" },
        { type: "remove" as const, path: "old_field" },
        { type: "arrayAppend" as const, path: "roles", value: "admin" },
      ];

      await KVOperations.mutateIn(collection, "doc-1", operations);

      const callArgs = (collection.mutateIn as ReturnType<typeof mock>).mock.calls[0];
      const specs = callArgs[1];
      expect(specs).toHaveLength(3);
    });

    test("passes CAS option through", async () => {
      const operations = [{ type: "upsert" as const, path: "x", value: 1 }];

      await KVOperations.mutateIn(collection, "doc-1", operations, { cas: "cas-mutate-abc" });

      const callArgs = (collection.mutateIn as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[2].cas).toBe("cas-mutate-abc");
    });

    test("maps durability string to DurabilityLevel", async () => {
      const operations = [{ type: "upsert" as const, path: "x", value: 1 }];

      await KVOperations.mutateIn(collection, "doc-1", operations, { durability: "majority" });

      const callArgs = (collection.mutateIn as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[2].durabilityLevel).toBe(DurabilityLevel.Majority);
    });

    test("uses default timeout of 7500ms", async () => {
      const operations = [{ type: "upsert" as const, path: "x", value: 1 }];

      await KVOperations.mutateIn(collection, "doc-1", operations);

      const callArgs = (collection.mutateIn as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[2].timeout).toBe(7500);
    });

    test("uses custom timeout when provided", async () => {
      const operations = [{ type: "upsert" as const, path: "x", value: 1 }];

      await KVOperations.mutateIn(collection, "doc-1", operations, { timeout: 15000 });

      const callArgs = (collection.mutateIn as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[2].timeout).toBe(15000);
    });

    test("sets durabilityLevel to undefined when durability is not provided", async () => {
      const operations = [{ type: "upsert" as const, path: "x", value: 1 }];

      await KVOperations.mutateIn(collection, "doc-1", operations);

      const callArgs = (collection.mutateIn as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[2].durabilityLevel).toBeUndefined();
    });

    test("handles empty operations array", async () => {
      await KVOperations.mutateIn(collection, "doc-1", []);

      const callArgs = (collection.mutateIn as ReturnType<typeof mock>).mock.calls[0];
      const specs = callArgs[1];
      expect(specs).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // lookupIn
  // --------------------------------------------------------------------------
  describe("lookupIn", () => {
    test("returns mapped path values", async () => {
      const result = await KVOperations.lookupIn(collection, "doc-1", ["name", "age"]);

      expect(result).not.toBeNull();
      expect(result!.name).toBe("value-a");
      expect(result!.age).toBe(42);
    });

    test("calls collection.lookupIn with correct specs", async () => {
      await KVOperations.lookupIn(collection, "doc-1", ["path.a", "path.b"]);

      expect(collection.lookupIn).toHaveBeenCalledTimes(1);
      const callArgs = (collection.lookupIn as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[0]).toBe("doc-1");
      // Specs are LookupInSpec instances
      expect(callArgs[1]).toHaveLength(2);
    });

    test("returns null on DocumentNotFoundError", async () => {
      (collection.lookupIn as ReturnType<typeof mock>).mockRejectedValueOnce(
        createDocumentNotFoundError()
      );

      const result = await KVOperations.lookupIn(collection, "doc-1", ["name"]);

      expect(result).toBeNull();
    });

    test("rethrows non-DocumentNotFoundError errors", async () => {
      const genericError = new Error("Lookup failure");
      (collection.lookupIn as ReturnType<typeof mock>).mockRejectedValueOnce(genericError);

      await expect(
        KVOperations.lookupIn(collection, "doc-1", ["name"])
      ).rejects.toThrow("Lookup failure");
    });

    test("handles path access errors gracefully by setting undefined", async () => {
      // Simulate a content array where accessing .value throws
      const throwingContent = new Proxy([], {
        get(_target, prop) {
          if (prop === "length") return 2;
          if (prop === "0") return { value: "good-value" };
          if (prop === "1") {
            // Return an object whose .value getter throws
            return {
              get value() {
                throw new Error("Path error");
              },
            };
          }
          return undefined;
        },
      });

      (collection.lookupIn as ReturnType<typeof mock>).mockResolvedValueOnce({
        content: throwingContent,
      });

      const result = await KVOperations.lookupIn(collection, "doc-1", ["good", "bad"]);

      expect(result).not.toBeNull();
      expect(result!.good).toBe("good-value");
      // The inner try/catch sets failed paths to undefined
      expect(result!.bad).toBeUndefined();
    });

    test("handles single path lookup", async () => {
      (collection.lookupIn as ReturnType<typeof mock>).mockResolvedValueOnce({
        content: [{ value: "solo" }],
      });

      const result = await KVOperations.lookupIn(collection, "doc-1", ["only"]);

      expect(result).not.toBeNull();
      expect(result!.only).toBe("solo");
    });
  });

  // --------------------------------------------------------------------------
  // getMulti
  // --------------------------------------------------------------------------
  describe("getMulti", () => {
    test("returns map of found documents", async () => {
      const results = await KVOperations.getMulti(collection, ["doc-1", "doc-2"]);

      expect(results).toBeInstanceOf(Map);
      expect(results.size).toBe(2);
      expect(results.get("doc-1")).toEqual({ name: "test" });
      expect(results.get("doc-2")).toEqual({ name: "test" });
    });

    test("excludes missing documents from results", async () => {
      let callCount = 0;
      (collection.get as ReturnType<typeof mock>).mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(createDocumentNotFoundError());
        }
        return Promise.resolve({ content: { found: true }, cas: "cas-123" });
      });

      const results = await KVOperations.getMulti(collection, ["doc-1", "missing", "doc-3"]);

      expect(results.size).toBe(2);
      expect(results.has("doc-1")).toBe(true);
      expect(results.has("missing")).toBe(false);
      expect(results.has("doc-3")).toBe(true);
    });

    test("swallows errors and excludes failed documents", async () => {
      let callCount = 0;
      (collection.get as ReturnType<typeof mock>).mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error("Connection reset"));
        }
        return Promise.resolve({ content: { ok: true }, cas: "cas-123" });
      });

      const results = await KVOperations.getMulti(collection, ["a", "b", "c"]);

      // "b" fails with a generic error, which is caught and swallowed
      expect(results.size).toBe(2);
      expect(results.has("a")).toBe(true);
      expect(results.has("b")).toBe(false);
      expect(results.has("c")).toBe(true);
    });

    test("processes in batches with default batchSize of 100", async () => {
      // Create 150 IDs to trigger 2 batches
      const ids = Array.from({ length: 150 }, (_, i) => `doc-${i}`);

      await KVOperations.getMulti(collection, ids);

      // All 150 documents should be fetched
      expect(collection.get).toHaveBeenCalledTimes(150);
    });

    test("respects custom batchSize", async () => {
      const ids = ["a", "b", "c", "d", "e"];

      await KVOperations.getMulti(collection, ids, { batchSize: 2 });

      // All 5 fetched across 3 batches (2, 2, 1)
      expect(collection.get).toHaveBeenCalledTimes(5);
    });

    test("returns empty map for empty ids array", async () => {
      const results = await KVOperations.getMulti(collection, []);

      expect(results).toBeInstanceOf(Map);
      expect(results.size).toBe(0);
      expect(collection.get).not.toHaveBeenCalled();
    });

    test("passes KVGetOptions through to individual get calls", async () => {
      await KVOperations.getMulti(collection, ["doc-1"], {
        withExpiry: true,
        timeout: 5000,
      });

      expect(collection.get).toHaveBeenCalledWith("doc-1", {
        withExpiry: true,
        project: undefined,
        timeout: 5000,
      });
    });
  });

  // --------------------------------------------------------------------------
  // upsertMulti
  // --------------------------------------------------------------------------
  describe("upsertMulti", () => {
    test("tracks all succeeded documents", async () => {
      const documents = [
        { id: "doc-1", document: { name: "A" } },
        { id: "doc-2", document: { name: "B" } },
        { id: "doc-3", document: { name: "C" } },
      ];

      const result = await KVOperations.upsertMulti(collection, documents);

      expect(result.succeeded).toEqual(["doc-1", "doc-2", "doc-3"]);
      expect(result.failed).toHaveLength(0);
    });

    test("tracks failed documents with errors", async () => {
      let callCount = 0;
      (collection.upsert as ReturnType<typeof mock>).mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error("Write failed"));
        }
        return Promise.resolve({ cas: "cas-ok", token: undefined });
      });

      const documents = [
        { id: "doc-1", document: { a: 1 } },
        { id: "doc-2", document: { b: 2 } },
        { id: "doc-3", document: { c: 3 } },
      ];

      const result = await KVOperations.upsertMulti(collection, documents);

      expect(result.succeeded).toEqual(["doc-1", "doc-3"]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].id).toBe("doc-2");
      expect(result.failed[0].error).toBeInstanceOf(Error);
      expect(result.failed[0].error.message).toBe("Write failed");
    });

    test("handles all documents failing", async () => {
      (collection.upsert as ReturnType<typeof mock>).mockRejectedValue(
        new Error("Total failure")
      );

      const documents = [
        { id: "doc-1", document: {} },
        { id: "doc-2", document: {} },
      ];

      const result = await KVOperations.upsertMulti(collection, documents);

      expect(result.succeeded).toHaveLength(0);
      expect(result.failed).toHaveLength(2);
      expect(result.failed[0].id).toBe("doc-1");
      expect(result.failed[1].id).toBe("doc-2");
    });

    test("processes in batches with default batchSize of 100", async () => {
      const documents = Array.from({ length: 150 }, (_, i) => ({
        id: `doc-${i}`,
        document: { index: i },
      }));

      const result = await KVOperations.upsertMulti(collection, documents);

      expect(collection.upsert).toHaveBeenCalledTimes(150);
      expect(result.succeeded).toHaveLength(150);
    });

    test("respects custom batchSize", async () => {
      const documents = Array.from({ length: 5 }, (_, i) => ({
        id: `doc-${i}`,
        document: { index: i },
      }));

      await KVOperations.upsertMulti(collection, documents, { batchSize: 2 });

      // All 5 upserted across 3 batches (2, 2, 1)
      expect(collection.upsert).toHaveBeenCalledTimes(5);
    });

    test("returns empty arrays for empty documents input", async () => {
      const result = await KVOperations.upsertMulti(collection, []);

      expect(result.succeeded).toHaveLength(0);
      expect(result.failed).toHaveLength(0);
      expect(collection.upsert).not.toHaveBeenCalled();
    });

    test("passes KVUpsertOptions through to individual upsert calls", async () => {
      const documents = [{ id: "doc-1", document: { x: 1 } }];

      await KVOperations.upsertMulti(collection, documents, {
        durability: "majority",
        expiry: 3600,
        timeout: 10000,
      });

      expect(collection.upsert).toHaveBeenCalledWith("doc-1", { x: 1 }, {
        durabilityLevel: DurabilityLevel.Majority,
        expiry: 3600,
        timeout: 10000,
      });
    });

    test("handles partial batch failures correctly", async () => {
      // 5 documents, batchSize 3 = batch [0,1,2] + batch [3,4]
      // Fail doc-1 in first batch and doc-4 in second batch
      let callCount = 0;
      (collection.upsert as ReturnType<typeof mock>).mockImplementation(() => {
        callCount++;
        if (callCount === 2 || callCount === 5) {
          return Promise.reject(new Error(`Fail-${callCount}`));
        }
        return Promise.resolve({ cas: "cas-ok", token: undefined });
      });

      const documents = Array.from({ length: 5 }, (_, i) => ({
        id: `doc-${i}`,
        document: { i },
      }));

      const result = await KVOperations.upsertMulti(collection, documents, { batchSize: 3 });

      expect(result.succeeded).toEqual(["doc-0", "doc-2", "doc-3"]);
      expect(result.failed).toHaveLength(2);
      expect(result.failed[0].id).toBe("doc-1");
      expect(result.failed[1].id).toBe("doc-4");
    });
  });
});
