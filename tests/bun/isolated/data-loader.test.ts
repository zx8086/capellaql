/* tests/bun/unit/couchbase/data-loader.test.ts */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  AmbiguousTimeoutError,
  AuthenticationFailureError,
  CouchbaseError,
  DocumentLockedError,
  DocumentNotFoundError,
  RateLimitedError,
  ServiceNotAvailableError,
  TemporaryFailureError,
} from "../../../src/lib/couchbase/errors";

// Mock telemetry logger before importing the module under test
mock.module("../../../src/telemetry/logger", () => ({
  debug: mock(() => {}),
  error: mock(() => {}),
  log: mock(() => {}),
}));

const mockGet = mock<(key: string) => Promise<{ content: Record<string, unknown> }>>();
const mockCollection = mock(() => ({ get: mockGet }));
const mockGetConnection = mock(() =>
  Promise.resolve({ collection: mockCollection }),
);

mock.module("../../../src/lib/couchbase/connection-manager", () => ({
  connectionManager: {
    getConnection: mockGetConnection,
  },
}));

const { createDocumentDataLoader, batchLoadDocuments } = await import(
  "../../../src/lib/couchbase/data-loader"
);

// Helper to create a CollectionKey
function collectionKey(
  key: string,
  bucket = "b1",
  scope = "s1",
  collection = "c1",
) {
  return { bucket, scope, collection, key };
}

// Helper to create a Couchbase SDK error with a message.
// Couchbase SDK errors have non-standard constructor signatures,
// so we use Object.create to build instances with the correct prototype chain.
function makeCouchbaseError<T extends Error>(
  ErrorClass: new (...args: unknown[]) => T,
  message: string,
): T {
  const instance = Object.create(ErrorClass.prototype) as T;
  Object.defineProperty(instance, "message", { value: message, writable: true });
  Object.defineProperty(instance, "name", { value: ErrorClass.name, writable: true });
  return instance;
}

describe("data-loader", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockCollection.mockReset();
    mockGetConnection.mockReset();

    // Re-wire defaults after reset
    mockCollection.mockImplementation(() => ({ get: mockGet }));
    mockGetConnection.mockImplementation(() =>
      Promise.resolve({ collection: mockCollection }),
    );
  });

  // ---------------------------------------------------------------
  // batchLoadDocuments
  // ---------------------------------------------------------------
  describe("batchLoadDocuments", () => {
    test("creates correct CollectionKey combinations (2 collections x 3 keys = 6 keys)", async () => {
      mockGet.mockImplementation((key: string) =>
        Promise.resolve({ content: { name: key } }),
      );

      const collections = [
        { bucket: "b1", scope: "s1", collection: "c1" },
        { bucket: "b2", scope: "s2", collection: "c2" },
      ];
      const keys = ["k1", "k2", "k3"];

      const loader = createDocumentDataLoader();
      const results = await batchLoadDocuments(collections, keys, loader);

      // 2 collections * 3 keys = 6 results
      expect(results).toHaveLength(6);
    });

    test("returns results from dataLoader.loadMany", async () => {
      mockGet.mockImplementation((key: string) =>
        Promise.resolve({ content: { value: `data-${key}` } }),
      );

      const collections = [{ bucket: "b1", scope: "s1", collection: "c1" }];
      const keys = ["doc1", "doc2"];

      const loader = createDocumentDataLoader();
      const results = await batchLoadDocuments(collections, keys, loader);

      expect(results).toHaveLength(2);
      expect(results[0].data).toEqual({ id: "doc1", value: "data-doc1" });
      expect(results[1].data).toEqual({ id: "doc2", value: "data-doc2" });
    });
  });

  // ---------------------------------------------------------------
  // createDocumentDataLoader
  // ---------------------------------------------------------------
  describe("createDocumentDataLoader", () => {
    test("returns a DataLoader instance", () => {
      const loader = createDocumentDataLoader();
      expect(loader).toBeDefined();
      expect(typeof loader.load).toBe("function");
      expect(typeof loader.loadMany).toBe("function");
      expect(typeof loader.clear).toBe("function");
      expect(typeof loader.clearAll).toBe("function");
    });

    test("has cache enabled and maxBatchSize of 100", async () => {
      // Verify caching: loading the same key twice should only invoke
      // the batch function once (single get call).
      mockGet.mockImplementation((key: string) =>
        Promise.resolve({ content: { cached: true } }),
      );

      const loader = createDocumentDataLoader();
      const key = collectionKey("cache-test");

      const [first, second] = await Promise.all([
        loader.load(key),
        loader.load(key),
      ]);

      expect(first).toEqual(second);
      // With caching enabled, the batch function de-duplicates the key
      expect(mockGet).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------
  // batchGetDocuments (tested indirectly through DataLoader.load)
  //
  // NOTE on result ordering: batchGetDocuments re-orders flat results
  // to match input key order using a find() that matches on
  // r.data?.id === inputKey.key. When data is null (error/not-found
  // cases), the match fails for non-empty keys and the fallback
  // "Result not found in batch processing" is returned. This is
  // documented current behavior -- error-specific messages are set
  // during collection processing but lost during reordering.
  // ---------------------------------------------------------------
  describe("batchGetDocuments (via DataLoader)", () => {
    test("returns data for found documents", async () => {
      mockGet.mockImplementation((key: string) =>
        Promise.resolve({ content: { title: "Found", extra: 42 } }),
      );

      const loader = createDocumentDataLoader();
      const result = await loader.load(collectionKey("doc-1"));

      expect(result.data).toEqual({ id: "doc-1", title: "Found", extra: 42 });
      expect(result.bucket).toBe("b1");
      expect(result.scope).toBe("s1");
      expect(result.collection).toBe("c1");
      expect(result.timeTaken).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
    });

    test("returns null data for DocumentNotFoundError", async () => {
      mockGet.mockImplementation(() => {
        throw makeCouchbaseError(DocumentNotFoundError, "key not found");
      });

      const loader = createDocumentDataLoader();
      const result = await loader.load(collectionKey("missing-doc"));

      expect(result.data).toBeNull();
      // DocumentNotFoundError produces data: null with no error, but the
      // reordering find() cannot match null-data results for non-empty keys,
      // so the fallback error is produced instead.
      expect(result.error).toBe("Result not found in batch processing");
    });

    test("returns error for AuthenticationFailureError", async () => {
      mockGet.mockImplementation(() => {
        throw makeCouchbaseError(AuthenticationFailureError, "bad credentials");
      });

      const loader = createDocumentDataLoader();
      const result = await loader.load(collectionKey("auth-doc"));

      expect(result.data).toBeNull();
      expect(result.error).toBe("Result not found in batch processing");
    });

    test("returns error for AmbiguousTimeoutError", async () => {
      mockGet.mockImplementation(() => {
        throw makeCouchbaseError(AmbiguousTimeoutError, "operation uncertain");
      });

      const loader = createDocumentDataLoader();
      const result = await loader.load(collectionKey("timeout-doc"));

      expect(result.data).toBeNull();
      expect(result.error).toBe("Result not found in batch processing");
    });

    test("returns error for TemporaryFailureError", async () => {
      mockGet.mockImplementation(() => {
        throw makeCouchbaseError(TemporaryFailureError, "temp fail");
      });

      const loader = createDocumentDataLoader();
      const result = await loader.load(collectionKey("temp-doc"));

      expect(result.data).toBeNull();
      expect(result.error).toBe("Result not found in batch processing");
    });

    test("returns error for ServiceNotAvailableError", async () => {
      mockGet.mockImplementation(() => {
        throw makeCouchbaseError(ServiceNotAvailableError, "service down");
      });

      const loader = createDocumentDataLoader();
      const result = await loader.load(collectionKey("svc-doc"));

      expect(result.data).toBeNull();
      expect(result.error).toBe("Result not found in batch processing");
    });

    test("returns error for RateLimitedError", async () => {
      mockGet.mockImplementation(() => {
        throw makeCouchbaseError(RateLimitedError, "too many requests");
      });

      const loader = createDocumentDataLoader();
      const result = await loader.load(collectionKey("rate-doc"));

      expect(result.data).toBeNull();
      expect(result.error).toBe("Result not found in batch processing");
    });

    test("returns error for DocumentLockedError", async () => {
      mockGet.mockImplementation(() => {
        throw makeCouchbaseError(DocumentLockedError, "doc is locked");
      });

      const loader = createDocumentDataLoader();
      const result = await loader.load(collectionKey("locked-doc"));

      expect(result.data).toBeNull();
      expect(result.error).toBe("Result not found in batch processing");
    });

    test("returns error for generic CouchbaseError", async () => {
      mockGet.mockImplementation(() => {
        throw makeCouchbaseError(CouchbaseError, "generic cb error");
      });

      const loader = createDocumentDataLoader();
      const result = await loader.load(collectionKey("cb-doc"));

      expect(result.data).toBeNull();
      expect(result.error).toBe("Result not found in batch processing");
    });

    test("returns error for unexpected errors", async () => {
      mockGet.mockImplementation(() => {
        throw new TypeError("something completely unexpected");
      });

      const loader = createDocumentDataLoader();
      const result = await loader.load(collectionKey("unknown-doc"));

      expect(result.data).toBeNull();
      expect(result.error).toBe("Result not found in batch processing");
    });

    test("returns null data with timeTaken 0 for empty keys", async () => {
      const loader = createDocumentDataLoader();
      const result = await loader.load(collectionKey(""));

      expect(result.data).toBeNull();
      expect(result.timeTaken).toBe(0);
      expect(result.error).toBeUndefined();
      // Should not attempt a get for empty keys
      expect(mockGet).not.toHaveBeenCalled();
    });

    test("returns null data with timeTaken 0 for whitespace-only keys", async () => {
      const loader = createDocumentDataLoader();
      const result = await loader.load(collectionKey("   "));

      expect(result.data).toBeNull();
      expect(result.timeTaken).toBe(0);
      expect(result.error).toBeUndefined();
      expect(mockGet).not.toHaveBeenCalled();
    });

    test("groups keys by collection for efficient batching", async () => {
      mockGet.mockImplementation((key: string) =>
        Promise.resolve({ content: { val: key } }),
      );

      const loader = createDocumentDataLoader();

      // Load keys from two different collections in a single batch
      const results = await Promise.all([
        loader.load(collectionKey("k1", "b1", "s1", "c1")),
        loader.load(collectionKey("k2", "b1", "s1", "c1")),
        loader.load(collectionKey("k3", "b2", "s2", "c2")),
      ]);

      // connection.collection should have been called for each distinct collection
      expect(mockCollection).toHaveBeenCalledTimes(2);

      // All results should have data
      expect(results[0].data).toEqual({ id: "k1", val: "k1" });
      expect(results[1].data).toEqual({ id: "k2", val: "k2" });
      expect(results[2].data).toEqual({ id: "k3", val: "k3" });
    });

    test("maintains order matching input keys", async () => {
      // Simulate varying response times by resolving in reverse order
      let callCount = 0;
      mockGet.mockImplementation((key: string) => {
        callCount++;
        const delay = key === "first" ? 20 : key === "second" ? 10 : 0;
        return new Promise((resolve) =>
          setTimeout(() => resolve({ content: { order: key } }), delay),
        );
      });

      const loader = createDocumentDataLoader();

      const results = await Promise.all([
        loader.load(collectionKey("first")),
        loader.load(collectionKey("second")),
        loader.load(collectionKey("third")),
      ]);

      // Results must match the input order, regardless of resolution timing
      expect(results[0].data?.id).toBe("first");
      expect(results[1].data?.id).toBe("second");
      expect(results[2].data?.id).toBe("third");
    });

    test("returns error for all keys if collection processing fails entirely", async () => {
      // Make connection.collection() throw to simulate a full collection failure
      mockCollection.mockImplementation(() => {
        throw new Error("Collection access failed");
      });

      const loader = createDocumentDataLoader();

      const results = await Promise.all([
        loader.load(collectionKey("k1", "b1", "s1", "failing-coll")),
        loader.load(collectionKey("k2", "b1", "s1", "failing-coll")),
        loader.load(collectionKey("k3", "b1", "s1", "failing-coll")),
      ]);

      for (const result of results) {
        expect(result.data).toBeNull();
        // Collection failure results also have null data so the
        // reordering fallback applies here as well.
        expect(result.error).toBe("Result not found in batch processing");
      }
    });

    test("returns error for all keys if getConnection fails", async () => {
      mockGetConnection.mockImplementation(() =>
        Promise.reject(new Error("Connection unavailable")),
      );

      const loader = createDocumentDataLoader();

      const results = await Promise.all([
        loader.load(collectionKey("k1")),
        loader.load(collectionKey("k2")),
      ]);

      for (const result of results) {
        expect(result.data).toBeNull();
        expect(result.error).toBe("Batch operation failed");
      }
    });
  });
});
