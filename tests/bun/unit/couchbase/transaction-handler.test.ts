/* tests/bun/unit/couchbase/transaction-handler.test.ts */

import { beforeEach, describe, expect, mock, test } from "bun:test";

// Mock dependencies before importing the module under test
const mockLog = mock(() => {});
const mockWarn = mock(() => {});
const mockErr = mock(() => {});
const mockRecordQuery = mock(() => {});

mock.module("../../../../src/telemetry/logger", () => ({
  log: mockLog,
  warn: mockWarn,
  error: mockErr,
}));

mock.module("../../../../src/lib/couchbase/metrics", () => ({
  recordQuery: mockRecordQuery,
}));

mock.module("../../../../src/lib/couchbase/errors", () => ({
  CouchbaseErrorClassifier: {
    classifyError: mock(() => ({
      retryable: false,
      severity: "info",
      category: "application",
      shouldLog: false,
      shouldAlert: false,
    })),
    getRetryStrategy: mock(() => ({
      shouldRetry: false,
      baseDelayMs: 100,
      maxRetries: 3,
    })),
  },
}));

import {
  CasMismatchError,
  DocumentExistsError,
  DocumentNotFoundError,
  TransactionCommitAmbiguousError,
} from "couchbase";
import {
  CouchbaseTransactionHandler,
  type TransactionOperationContext,
} from "../../../../src/lib/couchbase/transaction-handler";

// -- Helpers ------------------------------------------------------------------

function createMockTransactionCtx() {
  return {
    get: mock(() => Promise.resolve({ content: { data: "test" } })),
    insert: mock(() => Promise.resolve({ content: { data: "inserted" } })),
    replace: mock(() => Promise.resolve({ content: { data: "replaced" } })),
  };
}

function createOperationContext(
  overrides: Partial<TransactionOperationContext> = {}
): TransactionOperationContext {
  return {
    operationType: "test_operation",
    requestId: "req-123",
    bucket: "test-bucket",
    scope: "test-scope",
    collection: "test-collection",
    transactionId: "txn-001",
    ...overrides,
  };
}

// -- Tests --------------------------------------------------------------------

describe("CouchbaseTransactionHandler", () => {
  beforeEach(() => {
    mockLog.mockClear();
    mockWarn.mockClear();
    mockErr.mockClear();
    mockRecordQuery.mockClear();
  });

  // --------------------------------------------------------------------------
  // createTransactionContext
  // --------------------------------------------------------------------------
  describe("createTransactionContext", () => {
    test("creates context with all parameters", () => {
      const ctx = CouchbaseTransactionHandler.createTransactionContext(
        "upsert",
        "req-456",
        "my-bucket",
        "my-scope",
        "my-collection"
      );

      expect(ctx).toEqual({
        operationType: "upsert",
        requestId: "req-456",
        bucket: "my-bucket",
        scope: "my-scope",
        collection: "my-collection",
      });
    });

    test("creates context with minimal parameters (only operationType)", () => {
      const ctx = CouchbaseTransactionHandler.createTransactionContext("insert");

      expect(ctx).toEqual({
        operationType: "insert",
        requestId: undefined,
        bucket: undefined,
        scope: undefined,
        collection: undefined,
      });
    });

    test("includes correct operationType", () => {
      const ctx = CouchbaseTransactionHandler.createTransactionContext("remove");

      expect(ctx.operationType).toBe("remove");
    });
  });

  // --------------------------------------------------------------------------
  // safeGet
  // --------------------------------------------------------------------------
  describe("safeGet", () => {
    test("returns transaction get result on success", async () => {
      const txCtx = createMockTransactionCtx();
      const mockCollection = {};
      const opCtx = createOperationContext();

      const result = await CouchbaseTransactionHandler.safeGet(
        txCtx as any,
        mockCollection,
        "doc-key-1",
        opCtx
      );

      expect(result).toEqual({ content: { data: "test" } });
      expect(txCtx.get).toHaveBeenCalledTimes(1);
      expect(txCtx.get).toHaveBeenCalledWith(mockCollection, "doc-key-1");
    });

    test("returns null on DocumentNotFoundError", async () => {
      const txCtx = createMockTransactionCtx();
      txCtx.get = mock(() => Promise.reject(new DocumentNotFoundError()));
      const opCtx = createOperationContext();

      const result = await CouchbaseTransactionHandler.safeGet(
        txCtx as any,
        {},
        "missing-key",
        opCtx
      );

      expect(result).toBeNull();
    });

    test("rethrows other errors", async () => {
      const txCtx = createMockTransactionCtx();
      const genericError = new Error("unexpected failure");
      txCtx.get = mock(() => Promise.reject(genericError));
      const opCtx = createOperationContext();

      await expect(
        CouchbaseTransactionHandler.safeGet(txCtx as any, {}, "key", opCtx)
      ).rejects.toThrow("unexpected failure");
    });

    test("logs warning for non-DocumentNotFoundError errors", async () => {
      mockWarn.mockClear();
      const txCtx = createMockTransactionCtx();
      txCtx.get = mock(() => Promise.reject(new Error("network timeout")));
      const opCtx = createOperationContext({
        transactionId: "txn-warn-test",
        requestId: "req-warn-test",
      });

      try {
        await CouchbaseTransactionHandler.safeGet(txCtx as any, {}, "key", opCtx);
      } catch {
        // Expected to throw
      }

      expect(mockWarn).toHaveBeenCalledTimes(1);
      expect(mockWarn).toHaveBeenCalledWith(
        "Transaction get operation failed",
        expect.objectContaining({
          key: "key",
          transactionId: "txn-warn-test",
          requestId: "req-warn-test",
        })
      );
    });
  });

  // --------------------------------------------------------------------------
  // safeInsert
  // --------------------------------------------------------------------------
  describe("safeInsert", () => {
    test("returns result on success", async () => {
      const txCtx = createMockTransactionCtx();
      const mockCollection = {};
      const opCtx = createOperationContext();

      const result = await CouchbaseTransactionHandler.safeInsert(
        txCtx as any,
        mockCollection,
        "new-key",
        { value: "new-data" },
        opCtx
      );

      expect(result).toEqual({ content: { data: "inserted" } });
      expect(txCtx.insert).toHaveBeenCalledTimes(1);
      expect(txCtx.insert).toHaveBeenCalledWith(mockCollection, "new-key", {
        value: "new-data",
      });
    });

    test("logs error on DocumentExistsError but still throws", async () => {
      mockErr.mockClear();
      const txCtx = createMockTransactionCtx();
      const docExistsError = new DocumentExistsError();
      txCtx.insert = mock(() => Promise.reject(docExistsError));
      const opCtx = createOperationContext({
        transactionId: "txn-exists",
        requestId: "req-exists",
      });

      await expect(
        CouchbaseTransactionHandler.safeInsert(
          txCtx as any,
          {},
          "dup-key",
          { data: 1 },
          opCtx
        )
      ).rejects.toThrow(DocumentExistsError);

      expect(mockErr).toHaveBeenCalledTimes(1);
      expect(mockErr).toHaveBeenCalledWith(
        "Document already exists in transaction",
        docExistsError,
        expect.objectContaining({
          key: "dup-key",
          transactionId: "txn-exists",
          requestId: "req-exists",
        })
      );
    });

    test("rethrows other errors", async () => {
      const txCtx = createMockTransactionCtx();
      txCtx.insert = mock(() => Promise.reject(new Error("insert failure")));
      const opCtx = createOperationContext();

      await expect(
        CouchbaseTransactionHandler.safeInsert(
          txCtx as any,
          {},
          "key",
          {},
          opCtx
        )
      ).rejects.toThrow("insert failure");
    });
  });

  // --------------------------------------------------------------------------
  // safeReplace
  // --------------------------------------------------------------------------
  describe("safeReplace", () => {
    test("returns result on success", async () => {
      const txCtx = createMockTransactionCtx();
      const mockDoc = { content: { old: "data" } };
      const opCtx = createOperationContext();

      const result = await CouchbaseTransactionHandler.safeReplace(
        txCtx as any,
        mockDoc as any,
        { updated: "data" },
        opCtx
      );

      expect(result).toEqual({ content: { data: "replaced" } });
      expect(txCtx.replace).toHaveBeenCalledTimes(1);
      expect(txCtx.replace).toHaveBeenCalledWith(mockDoc, { updated: "data" });
    });

    test("logs CasMismatchError warning but still throws", async () => {
      mockWarn.mockClear();
      const txCtx = createMockTransactionCtx();
      const casMismatch = new CasMismatchError();
      txCtx.replace = mock(() => Promise.reject(casMismatch));
      const opCtx = createOperationContext({
        transactionId: "txn-cas",
        requestId: "req-cas",
      });

      await expect(
        CouchbaseTransactionHandler.safeReplace(
          txCtx as any,
          { content: {} } as any,
          { new: "value" },
          opCtx
        )
      ).rejects.toThrow(CasMismatchError);

      expect(mockWarn).toHaveBeenCalledTimes(1);
      expect(mockWarn).toHaveBeenCalledWith(
        "CAS mismatch in transaction replace",
        expect.objectContaining({
          transactionId: "txn-cas",
          requestId: "req-cas",
          suggestion: "Document was modified by another transaction",
        })
      );
    });

    test("rethrows other errors", async () => {
      const txCtx = createMockTransactionCtx();
      txCtx.replace = mock(() => Promise.reject(new Error("replace failure")));
      const opCtx = createOperationContext();

      await expect(
        CouchbaseTransactionHandler.safeReplace(
          txCtx as any,
          { content: {} } as any,
          {},
          opCtx
        )
      ).rejects.toThrow("replace failure");
    });
  });

  // --------------------------------------------------------------------------
  // classifyTransactionError (private -- accessed via cast)
  // --------------------------------------------------------------------------
  describe("classifyTransactionError", () => {
    const classify = (error: unknown) =>
      (CouchbaseTransactionHandler as any).classifyTransactionError(error);

    test("TransactionCommitAmbiguousError is classified as critical and requires investigation", () => {
      const result = classify(new TransactionCommitAmbiguousError());

      expect(result).toEqual({
        retryable: false,
        severity: "critical",
        requiresInvestigation: true,
        category: "ambiguous",
      });
    });

    test("DocumentNotFoundError is classified as permanent and not retryable", () => {
      const result = classify(new DocumentNotFoundError());

      expect(result).toEqual({
        retryable: false,
        severity: "info",
        requiresInvestigation: false,
        category: "permanent",
      });
    });

    test("CasMismatchError is classified as retryable and transient", () => {
      const result = classify(new CasMismatchError());

      expect(result).toEqual({
        retryable: true,
        severity: "info",
        requiresInvestigation: false,
        category: "transient",
      });
    });

    test("DocumentExistsError is classified as permanent and not retryable", () => {
      const result = classify(new DocumentExistsError());

      expect(result).toEqual({
        retryable: false,
        severity: "info",
        requiresInvestigation: false,
        category: "permanent",
      });
    });

    test("unknown errors are classified as critical and permanent", () => {
      class CompletelyUnknownError extends Error {
        constructor() {
          super("something unexpected");
          this.name = "CompletelyUnknownError";
        }
      }
      const result = classify(new CompletelyUnknownError());

      expect(result).toEqual({
        retryable: false,
        severity: "critical",
        requiresInvestigation: true,
        category: "permanent",
      });
    });
  });
});
