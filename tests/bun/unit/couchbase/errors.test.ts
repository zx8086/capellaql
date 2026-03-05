// Unit tests for Couchbase error handling
import { describe, expect, test, beforeEach } from "bun:test";
import { CouchbaseErrorClassifier, ConnectionError } from "../../../../src/lib/couchbase/errors";

describe("CouchbaseErrorClassifier", () => {
  describe("getErrorClassifications", () => {
    test("returns classifications map", () => {
      const classifications = CouchbaseErrorClassifier.getErrorClassifications();
      expect(classifications instanceof Map).toBe(true);
      expect(classifications.size).toBeGreaterThan(20); // Should have 25+ error types
    });

    test("contains all expected error types", () => {
      const classifications = CouchbaseErrorClassifier.getErrorClassifications();

      const expectedErrors = [
        "DocumentNotFoundError",
        "DocumentExistsError",
        "CasMismatchError",
        "AuthenticationFailureError",
        "TimeoutError",
        "AmbiguousTimeoutError",
        "UnambiguousTimeoutError",
        "ServiceNotAvailableError",
        "TemporaryFailureError",
        "BucketNotFoundError",
        "ScopeNotFoundError",
        "CollectionNotFoundError",
        "ParsingFailureError",
        "DurabilityAmbiguousError",
        "RateLimitedError",
      ];

      expectedErrors.forEach((errorType) => {
        expect(classifications.has(errorType)).toBe(true);
      });
    });

    test("classifications have required fields", () => {
      const classifications = CouchbaseErrorClassifier.getErrorClassifications();

      for (const [errorType, classification] of classifications) {
        expect(typeof classification.retryable).toBe("boolean");
        expect(["info", "warning", "critical"]).toContain(classification.severity);
        expect(["application", "client", "server", "network"]).toContain(classification.category);
        expect(typeof classification.shouldLog).toBe("boolean");
        expect(typeof classification.shouldAlert).toBe("boolean");
      }
    });
  });

  describe("isRetryable", () => {
    test("returns false for null/undefined", () => {
      expect(CouchbaseErrorClassifier.isRetryable(null)).toBe(false);
      expect(CouchbaseErrorClassifier.isRetryable(undefined)).toBe(false);
    });

    test("returns true for network errors", () => {
      const networkErrors = [
        new Error("ECONNREFUSED"),
        new Error("ECONNRESET"),
        new Error("ETIMEDOUT"),
        new Error("ENOTFOUND"),
        new Error("ENETUNREACH"),
        new Error("network unreachable"),
        new Error("connection refused"),
        new Error("connection reset"),
      ];

      networkErrors.forEach((error) => {
        expect(CouchbaseErrorClassifier.isRetryable(error)).toBe(true);
      });
    });

    test("returns false for regular errors without network keywords", () => {
      const nonNetworkError = new Error("Some random error");
      expect(CouchbaseErrorClassifier.isRetryable(nonNetworkError)).toBe(false);
    });
  });

  describe("isNetworkError", () => {
    test("returns false for null/undefined", () => {
      expect(CouchbaseErrorClassifier.isNetworkError(null)).toBe(false);
      expect(CouchbaseErrorClassifier.isNetworkError(undefined)).toBe(false);
    });

    test("detects network error keywords", () => {
      const testCases = [
        { message: "ECONNREFUSED: connection refused", expected: true },
        { message: "ECONNRESET: connection reset by peer", expected: true },
        { message: "ETIMEDOUT: connection timed out", expected: true },
        { message: "ENOTFOUND: DNS lookup failed", expected: true },
        { message: "ENETUNREACH: network is unreachable", expected: true },
        { message: "network unreachable", expected: true },
        { message: "connection refused by server", expected: true },
        { message: "connection reset during operation", expected: true },
        { message: "Document not found", expected: false },
        { message: "Invalid query syntax", expected: false },
      ];

      testCases.forEach(({ message, expected }) => {
        const error = new Error(message);
        expect(CouchbaseErrorClassifier.isNetworkError(error)).toBe(expected);
      });
    });

    test("handles case-insensitive matching", () => {
      expect(CouchbaseErrorClassifier.isNetworkError(new Error("ECONNREFUSED"))).toBe(true);
      expect(CouchbaseErrorClassifier.isNetworkError(new Error("econnrefused"))).toBe(true);
      expect(CouchbaseErrorClassifier.isNetworkError(new Error("EconnRefused"))).toBe(true);
    });
  });

  describe("classifyError", () => {
    test("returns default classification for unknown errors", () => {
      const unknownError = new Error("Unknown error type");

      const classification = CouchbaseErrorClassifier.classifyError(unknownError);

      expect(classification.retryable).toBe(false);
      expect(classification.severity).toBe("critical");
      expect(classification.category).toBe("application");
      expect(classification.shouldLog).toBe(true);
      expect(classification.shouldAlert).toBe(true);
    });

    test("uses error constructor name for classification lookup", () => {
      // Create mock error with specific constructor name
      // Note: constructor.name is used, not error.name property
      // So we need to define a class with the exact name
      const createDocumentNotFoundError = () => {
        const error = new Error("Document not found");
        // Override constructor.name by creating a new function with that name
        Object.defineProperty(error.constructor, "name", { value: "DocumentNotFoundError" });
        return error;
      };

      const mockError = createDocumentNotFoundError();
      const classification = CouchbaseErrorClassifier.classifyError(mockError);

      // Should get DocumentNotFoundError classification
      expect(classification.retryable).toBe(false);
      expect(classification.severity).toBe("info");
      expect(classification.category).toBe("application");
      expect(classification.shouldLog).toBe(false);
      expect(classification.shouldAlert).toBe(false);
    });
  });

  describe("extractContext", () => {
    test("extracts basic error context", () => {
      const error = new Error("Test error message");
      const context = CouchbaseErrorClassifier.extractContext(error, "testOperation");

      expect(context.message).toBe("Test error message");
      expect(context.cause).toBe(error);
      expect(context.operation).toBe("testOperation");
      expect(typeof context.isRetryable).toBe("boolean");
      expect(typeof context.isCritical).toBe("boolean");
      expect(typeof context.isTransient).toBe("boolean");
    });

    test("handles non-Error values", () => {
      const context = CouchbaseErrorClassifier.extractContext("string error", "op");
      expect(context.message).toBe("string error");
      expect(context.cause).toBeUndefined();
    });

    test("includes operation in context", () => {
      const error = new Error("Test");
      const context = CouchbaseErrorClassifier.extractContext(error, "query");
      expect(context.operation).toBe("query");
    });

    test("handles missing operation", () => {
      const error = new Error("Test");
      const context = CouchbaseErrorClassifier.extractContext(error);
      expect(context.operation).toBeUndefined();
    });
  });

  describe("getRetryStrategy", () => {
    test("returns no-retry for permanent failures", () => {
      // Network error message patterns that would be retryable
      const networkError = new Error("ECONNREFUSED");
      const strategy = CouchbaseErrorClassifier.getRetryStrategy(networkError);

      expect(strategy.shouldRetry).toBe(true);
      expect(strategy.maxAttempts).toBeGreaterThan(0);
    });

    test("returns default no-retry for unknown errors", () => {
      const unknownError = new Error("Unknown");
      const strategy = CouchbaseErrorClassifier.getRetryStrategy(unknownError);

      expect(strategy.shouldRetry).toBe(false);
      expect(strategy.maxAttempts).toBe(0);
      expect(strategy.baseDelayMs).toBe(0);
    });

    test("network errors get retry strategy", () => {
      const networkError = new Error("ECONNRESET: connection reset");
      const strategy = CouchbaseErrorClassifier.getRetryStrategy(networkError);

      expect(strategy.shouldRetry).toBe(true);
      expect(strategy.maxAttempts).toBe(3);
      expect(strategy.baseDelayMs).toBe(1000);
    });
  });

  describe("isPermanentFailure", () => {
    test("returns false for null/undefined", () => {
      // Method checks error types, not null/undefined directly
      expect(CouchbaseErrorClassifier.isPermanentFailure(null)).toBe(false);
      expect(CouchbaseErrorClassifier.isPermanentFailure(undefined)).toBe(false);
    });
  });

  describe("isConflictError", () => {
    test("returns false for non-conflict errors", () => {
      const regularError = new Error("Not a conflict");
      expect(CouchbaseErrorClassifier.isConflictError(regularError)).toBe(false);
    });
  });

  describe("isNotFoundError", () => {
    test("returns false for non-not-found errors", () => {
      const regularError = new Error("Some error");
      expect(CouchbaseErrorClassifier.isNotFoundError(regularError)).toBe(false);
    });
  });

  describe("isAmbiguousError", () => {
    test("returns false for non-ambiguous errors", () => {
      const regularError = new Error("Regular error");
      expect(CouchbaseErrorClassifier.isAmbiguousError(regularError)).toBe(false);
    });
  });

  describe("isAuthError", () => {
    test("returns false for non-auth errors", () => {
      const regularError = new Error("Not an auth error");
      expect(CouchbaseErrorClassifier.isAuthError(regularError)).toBe(false);
    });
  });
});

describe("ConnectionError", () => {
  describe("constructor", () => {
    test("creates error with message", () => {
      const error = new ConnectionError("Connection failed");
      expect(error.message).toBe("Connection failed");
      expect(error.name).toBe("ConnectionError");
      expect(error.code).toBe("CONNECTION_ERROR");
    });

    test("creates error with cause", () => {
      const cause = new Error("Original error");
      const error = new ConnectionError("Connection failed", cause);

      expect(error.cause).toBe(cause);
      expect(error.message).toBe("Connection failed");
    });

    test("creates error with context", () => {
      const context = {
        message: "Context message",
        operation: "connect",
        isRetryable: true,
        isCritical: false,
        isTransient: true,
      };
      const error = new ConnectionError("Connection failed", undefined, context);

      expect(error.context).toBe(context);
    });

    test("maintains prototype chain for instanceof", () => {
      const error = new ConnectionError("Test");
      expect(error instanceof ConnectionError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    test("has stack trace", () => {
      const error = new ConnectionError("Test");
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("ConnectionError");
    });
  });

  describe("toJSON", () => {
    test("serializes basic error", () => {
      const error = new ConnectionError("Connection failed");
      const json = error.toJSON();

      expect(json.name).toBe("ConnectionError");
      expect(json.message).toBe("Connection failed");
      expect(json.code).toBe("CONNECTION_ERROR");
      expect(json.cause).toBeUndefined();
      expect(json.context).toBeUndefined();
      expect(json.stack).toBeDefined();
    });

    test("serializes error with cause", () => {
      const cause = new Error("Original error");
      (cause as any).code = "ECONNREFUSED";
      const error = new ConnectionError("Connection failed", cause);

      const json = error.toJSON();

      expect(json.cause).toEqual({
        name: "Error",
        message: "Original error",
        code: "ECONNREFUSED",
      });
    });

    test("serializes error with context", () => {
      const context = {
        message: "Context message",
        operation: "connect",
        isRetryable: true,
        isCritical: false,
        isTransient: true,
      };
      const error = new ConnectionError("Connection failed", undefined, context);

      const json = error.toJSON();

      expect(json.context).toEqual(context);
    });

    test("produces valid JSON", () => {
      const cause = new Error("Cause");
      const context = { message: "test", operation: "query", isRetryable: false, isCritical: true, isTransient: false };
      const error = new ConnectionError("Test", cause, context);

      // Should not throw
      const jsonString = JSON.stringify(error.toJSON());
      expect(typeof jsonString).toBe("string");

      // Should parse back
      const parsed = JSON.parse(jsonString);
      expect(parsed.name).toBe("ConnectionError");
      expect(parsed.message).toBe("Test");
    });
  });
});

describe("Error Classification Rules", () => {
  describe("retryable errors", () => {
    test("timeout errors should be retryable", () => {
      const classifications = CouchbaseErrorClassifier.getErrorClassifications();

      expect(classifications.get("TimeoutError")?.retryable).toBe(true);
      expect(classifications.get("UnambiguousTimeoutError")?.retryable).toBe(true);
    });

    test("ambiguous timeout should NOT be retryable", () => {
      const classifications = CouchbaseErrorClassifier.getErrorClassifications();
      expect(classifications.get("AmbiguousTimeoutError")?.retryable).toBe(false);
    });

    test("temporary failures should be retryable", () => {
      const classifications = CouchbaseErrorClassifier.getErrorClassifications();

      expect(classifications.get("TemporaryFailureError")?.retryable).toBe(true);
      expect(classifications.get("ServiceNotAvailableError")?.retryable).toBe(true);
      expect(classifications.get("RateLimitedError")?.retryable).toBe(true);
    });

    test("document locked should be retryable", () => {
      const classifications = CouchbaseErrorClassifier.getErrorClassifications();
      expect(classifications.get("DocumentLockedError")?.retryable).toBe(true);
    });
  });

  describe("non-retryable errors", () => {
    test("document not found should not be retryable", () => {
      const classifications = CouchbaseErrorClassifier.getErrorClassifications();
      expect(classifications.get("DocumentNotFoundError")?.retryable).toBe(false);
    });

    test("authentication errors should not be retryable", () => {
      const classifications = CouchbaseErrorClassifier.getErrorClassifications();
      expect(classifications.get("AuthenticationFailureError")?.retryable).toBe(false);
    });

    test("resource not found errors should not be retryable", () => {
      const classifications = CouchbaseErrorClassifier.getErrorClassifications();

      expect(classifications.get("BucketNotFoundError")?.retryable).toBe(false);
      expect(classifications.get("ScopeNotFoundError")?.retryable).toBe(false);
      expect(classifications.get("CollectionNotFoundError")?.retryable).toBe(false);
    });

    test("parsing failures should not be retryable", () => {
      const classifications = CouchbaseErrorClassifier.getErrorClassifications();
      expect(classifications.get("ParsingFailureError")?.retryable).toBe(false);
    });
  });

  describe("severity levels", () => {
    test("critical errors are auth and durability issues", () => {
      const classifications = CouchbaseErrorClassifier.getErrorClassifications();

      expect(classifications.get("AuthenticationFailureError")?.severity).toBe("critical");
      expect(classifications.get("AmbiguousTimeoutError")?.severity).toBe("critical");
      expect(classifications.get("DurabilityAmbiguousError")?.severity).toBe("critical");
      expect(classifications.get("DurabilityImpossibleError")?.severity).toBe("critical");
    });

    test("info level for expected application errors", () => {
      const classifications = CouchbaseErrorClassifier.getErrorClassifications();

      expect(classifications.get("DocumentNotFoundError")?.severity).toBe("info");
      expect(classifications.get("DocumentExistsError")?.severity).toBe("info");
      expect(classifications.get("PathNotFoundError")?.severity).toBe("info");
    });

    test("warning level for temporary issues", () => {
      const classifications = CouchbaseErrorClassifier.getErrorClassifications();

      expect(classifications.get("TimeoutError")?.severity).toBe("warning");
      expect(classifications.get("TemporaryFailureError")?.severity).toBe("warning");
      expect(classifications.get("RateLimitedError")?.severity).toBe("warning");
    });
  });

  describe("alerting rules", () => {
    test("critical auth/config errors should alert", () => {
      const classifications = CouchbaseErrorClassifier.getErrorClassifications();

      expect(classifications.get("AuthenticationFailureError")?.shouldAlert).toBe(true);
      expect(classifications.get("BucketNotFoundError")?.shouldAlert).toBe(true);
      expect(classifications.get("ScopeNotFoundError")?.shouldAlert).toBe(true);
      expect(classifications.get("CollectionNotFoundError")?.shouldAlert).toBe(true);
    });

    test("ambiguous errors should alert", () => {
      const classifications = CouchbaseErrorClassifier.getErrorClassifications();

      expect(classifications.get("AmbiguousTimeoutError")?.shouldAlert).toBe(true);
      expect(classifications.get("DurabilityAmbiguousError")?.shouldAlert).toBe(true);
    });

    test("temporary failures should not alert", () => {
      const classifications = CouchbaseErrorClassifier.getErrorClassifications();

      expect(classifications.get("TemporaryFailureError")?.shouldAlert).toBe(false);
      expect(classifications.get("TimeoutError")?.shouldAlert).toBe(false);
      expect(classifications.get("RateLimitedError")?.shouldAlert).toBe(false);
    });

    test("document errors should not alert", () => {
      const classifications = CouchbaseErrorClassifier.getErrorClassifications();

      expect(classifications.get("DocumentNotFoundError")?.shouldAlert).toBe(false);
      expect(classifications.get("DocumentExistsError")?.shouldAlert).toBe(false);
      expect(classifications.get("CasMismatchError")?.shouldAlert).toBe(false);
    });
  });

  describe("category classification", () => {
    test("network category for timeout/network errors", () => {
      const classifications = CouchbaseErrorClassifier.getErrorClassifications();

      expect(classifications.get("TimeoutError")?.category).toBe("network");
      expect(classifications.get("UnambiguousTimeoutError")?.category).toBe("network");
      expect(classifications.get("AmbiguousTimeoutError")?.category).toBe("network");
      expect(classifications.get("RequestCanceledError")?.category).toBe("network");
    });

    test("client category for config errors", () => {
      const classifications = CouchbaseErrorClassifier.getErrorClassifications();

      expect(classifications.get("AuthenticationFailureError")?.category).toBe("client");
      expect(classifications.get("BucketNotFoundError")?.category).toBe("client");
      expect(classifications.get("ScopeNotFoundError")?.category).toBe("client");
    });

    test("server category for service errors", () => {
      const classifications = CouchbaseErrorClassifier.getErrorClassifications();

      expect(classifications.get("ServiceNotAvailableError")?.category).toBe("server");
      expect(classifications.get("TemporaryFailureError")?.category).toBe("server");
      expect(classifications.get("RateLimitedError")?.category).toBe("server");
    });

    test("application category for document errors", () => {
      const classifications = CouchbaseErrorClassifier.getErrorClassifications();

      expect(classifications.get("DocumentNotFoundError")?.category).toBe("application");
      expect(classifications.get("DocumentExistsError")?.category).toBe("application");
      expect(classifications.get("CasMismatchError")?.category).toBe("application");
      expect(classifications.get("ParsingFailureError")?.category).toBe("application");
    });
  });
});

describe("Max Retry Configuration", () => {
  test("retryable errors have maxRetries specified", () => {
    const classifications = CouchbaseErrorClassifier.getErrorClassifications();

    const retryableWithMax = [
      "TimeoutError",
      "UnambiguousTimeoutError",
      "RequestCanceledError",
      "ServiceNotAvailableError",
      "TemporaryFailureError",
      "RateLimitedError",
      "DocumentLockedError",
      "DurableWriteInProgressError",
      "PreparedStatementFailureError",
    ];

    retryableWithMax.forEach((errorType) => {
      const classification = classifications.get(errorType);
      expect(classification?.retryable).toBe(true);
      expect(classification?.maxRetries).toBeGreaterThan(0);
    });
  });

  test("service availability has higher retry count", () => {
    const classifications = CouchbaseErrorClassifier.getErrorClassifications();
    const serviceError = classifications.get("ServiceNotAvailableError");

    expect(serviceError?.maxRetries).toBe(5);
  });

  test("rate limited has lower retry count", () => {
    const classifications = CouchbaseErrorClassifier.getErrorClassifications();
    const rateLimited = classifications.get("RateLimitedError");

    expect(rateLimited?.maxRetries).toBe(2);
  });
});
