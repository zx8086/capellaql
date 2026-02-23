/* tests/unit/utils/errorUtils.test.ts - Test error serialization utilities */

import { describe, expect, test } from "bun:test";
import {
  getErrorCode,
  getErrorMessage,
  getErrorName,
  isErrorLike,
  serializeError,
  toError,
  type SerializedError,
} from "../../../src/utils/errorUtils";

describe("errorUtils", () => {
  describe("serializeError", () => {
    test("should handle null", () => {
      const result = serializeError(null);

      expect(result.name).toBe("Unknown");
      expect(result.message).toBe("No error provided");
    });

    test("should handle undefined", () => {
      const result = serializeError(undefined);

      expect(result.name).toBe("Unknown");
      expect(result.message).toBe("No error provided");
    });

    test("should serialize standard Error", () => {
      const error = new Error("Test error message");

      const result = serializeError(error);

      expect(result.name).toBe("Error");
      expect(result.message).toBe("Test error message");
      expect(result.stack).toBeDefined();
    });

    test("should serialize TypeError with name preserved", () => {
      const error = new TypeError("Type mismatch");

      const result = serializeError(error);

      expect(result.name).toBe("TypeError");
      expect(result.message).toBe("Type mismatch");
    });

    test("should serialize error with code property", () => {
      const error = new Error("Connection refused") as Error & { code: string };
      error.code = "ECONNREFUSED";

      const result = serializeError(error);

      expect(result.name).toBe("Error");
      expect(result.message).toBe("Connection refused");
      expect(result.code).toBe("ECONNREFUSED");
    });

    test("should serialize error with numeric code", () => {
      const error = new Error("Timeout") as Error & { code: number };
      error.code = 13;

      const result = serializeError(error);

      expect(result.code).toBe(13);
    });

    test("should serialize error with cause chain", () => {
      const cause = new Error("Root cause");
      const error = new Error("Wrapper error", { cause });

      const result = serializeError(error);

      expect(result.name).toBe("Error");
      expect(result.message).toBe("Wrapper error");
      expect(result.cause).toBeDefined();
      expect(result.cause?.name).toBe("Error");
      expect(result.cause?.message).toBe("Root cause");
    });

    test("should serialize error with context property", () => {
      const error = new Error("Operation failed") as Error & { context: Record<string, unknown> };
      error.context = { operation: "query", bucket: "test" };

      const result = serializeError(error);

      expect(result.context).toEqual({ operation: "query", bucket: "test" });
    });

    test("should serialize plain object with message property", () => {
      const errorObj = { message: "Something went wrong", code: 500 };

      const result = serializeError(errorObj);

      expect(result.message).toBe("Something went wrong");
      expect(result.code).toBe(500);
    });

    test("should serialize plain object with name property", () => {
      const errorObj = { name: "CustomError", message: "Custom message" };

      const result = serializeError(errorObj);

      expect(result.name).toBe("CustomError");
      expect(result.message).toBe("Custom message");
    });

    test("should serialize plain object without name using constructor name", () => {
      const errorObj = { message: "No name error" };

      const result = serializeError(errorObj);

      // Plain objects have constructor.name of "Object"
      expect(result.name).toBe("Object");
      expect(result.message).toBe("No name error");
    });

    test("should serialize plain object without message using JSON stringify", () => {
      const errorObj = { foo: "bar", count: 42 };

      const result = serializeError(errorObj);

      expect(result.message).toContain("foo");
      expect(result.message).toContain("bar");
    });

    test("should serialize string primitive", () => {
      const result = serializeError("String error message");

      expect(result.name).toBe("string");
      expect(result.message).toBe("String error message");
    });

    test("should serialize number primitive", () => {
      const result = serializeError(404);

      expect(result.name).toBe("number");
      expect(result.message).toBe("404");
    });

    test("should serialize boolean primitive", () => {
      const result = serializeError(false);

      expect(result.name).toBe("boolean");
      expect(result.message).toBe("false");
    });

    test("should handle SDK-like error object with nested properties", () => {
      const sdkError = {
        name: "CouchbaseError",
        message: "unambiguous timeout",
        code: 13,
        context: {
          operation: "connect",
          host: "cb.example.cloud.couchbase.com",
        },
      };

      const result = serializeError(sdkError);

      expect(result.name).toBe("CouchbaseError");
      expect(result.message).toBe("unambiguous timeout");
      expect(result.code).toBe(13);
      expect(result.context).toBeDefined();
    });

    test("should handle circular reference gracefully", () => {
      const circular: Record<string, any> = { name: "CircularError" };
      circular.self = circular;

      // Should not throw - falls back to UnserializableError due to JSON.stringify failure
      const result = serializeError(circular);

      expect(result.name).toBe("UnserializableError");
      expect(result.message).toBe("[object Object]");
    });
  });

  describe("getErrorMessage", () => {
    test("should extract message from Error", () => {
      const error = new Error("Error message");

      const result = getErrorMessage(error);

      expect(result).toBe("Error message");
    });

    test("should extract message from plain object", () => {
      const errorObj = { message: "Object message" };

      const result = getErrorMessage(errorObj);

      expect(result).toBe("Object message");
    });

    test("should convert string to message", () => {
      const result = getErrorMessage("String message");

      expect(result).toBe("String message");
    });

    test("should handle null gracefully", () => {
      const result = getErrorMessage(null);

      expect(result).toBe("No error provided");
    });
  });

  describe("toError", () => {
    test("should return Error instances as-is", () => {
      const error = new Error("Original error");

      const result = toError(error);

      expect(result).toBe(error);
    });

    test("should convert string to Error", () => {
      const result = toError("String error");

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("String error");
    });

    test("should convert plain object to Error with message", () => {
      const errorObj = { message: "Object error", code: 500 };

      const result = toError(errorObj);

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("Object error");
    });

    test("should convert null to Error", () => {
      const result = toError(null);

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("No error provided");
    });

    test("should convert undefined to Error", () => {
      const result = toError(undefined);

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("No error provided");
    });

    test("should convert number to Error", () => {
      const result = toError(404);

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("404");
    });
  });

  describe("isErrorLike", () => {
    test("should return true for Error instance", () => {
      expect(isErrorLike(new Error("test"))).toBe(true);
    });

    test("should return true for object with message", () => {
      expect(isErrorLike({ message: "test" })).toBe(true);
    });

    test("should return true for object with name and message", () => {
      expect(isErrorLike({ name: "CustomError", message: "test" })).toBe(true);
    });

    test("should return false for null", () => {
      expect(isErrorLike(null)).toBe(false);
    });

    test("should return false for undefined", () => {
      expect(isErrorLike(undefined)).toBe(false);
    });

    test("should return false for string", () => {
      expect(isErrorLike("error")).toBe(false);
    });

    test("should return false for object without message", () => {
      expect(isErrorLike({ foo: "bar" })).toBe(false);
    });
  });

  describe("getErrorName", () => {
    test("should get name from Error", () => {
      const result = getErrorName(new TypeError("test"));

      expect(result).toBe("TypeError");
    });

    test("should get name from object with name property", () => {
      const result = getErrorName({ name: "CustomError", message: "test" });

      expect(result).toBe("CustomError");
    });

    test("should return 'Unknown' for null", () => {
      expect(getErrorName(null)).toBe("Unknown");
    });

    test("should return type name for primitives", () => {
      expect(getErrorName("string")).toBe("string");
      expect(getErrorName(123)).toBe("number");
    });
  });

  describe("getErrorCode", () => {
    test("should get code from error with code property", () => {
      const error = new Error("test") as Error & { code: string };
      error.code = "ECONNREFUSED";

      const result = getErrorCode(error);

      expect(result).toBe("ECONNREFUSED");
    });

    test("should get numeric code", () => {
      const error = { message: "test", code: 13 };

      const result = getErrorCode(error);

      expect(result).toBe(13);
    });

    test("should return undefined when no code", () => {
      const result = getErrorCode(new Error("no code"));

      expect(result).toBeUndefined();
    });

    test("should return undefined for null", () => {
      expect(getErrorCode(null)).toBeUndefined();
    });
  });

  describe("real-world scenarios", () => {
    test("should handle Couchbase SDK timeout error pattern", () => {
      // Simulating Couchbase SDK error structure
      const couchbaseError = {
        name: "UnambiguousTimeoutError",
        message: "unambiguous timeout",
        code: 13,
        context: {
          timeout: 7500,
          last_dispatched_to: "cb.example.cloud.couchbase.com:18093",
          operation_id: "0x123",
        },
        cause: {
          name: "TimeoutError",
          message: "timeout",
        },
      };

      const result = serializeError(couchbaseError);

      expect(result.name).toBe("UnambiguousTimeoutError");
      expect(result.message).toBe("unambiguous timeout");
      expect(result.code).toBe(13);
      // For plain objects, the entire object becomes the context
      expect(result.context).toBeDefined();
      // The original context is nested: result.context.context.timeout
      expect((result.context as any)?.context?.timeout).toBe(7500);
    });

    test("should handle [object Object] scenario that was originally reported", () => {
      // The original bug: { error: "[object Object]" }
      // This happened because String(error) was used on non-Error objects
      const sdkError = {
        name: "CouchbaseError",
        message: "Connection failed",
        code: 1,
      };

      // Old behavior would produce: String(sdkError) => "[object Object]"
      const oldBehavior = String(sdkError);
      expect(oldBehavior).toBe("[object Object]");

      // New behavior extracts proper message
      const newBehavior = getErrorMessage(sdkError);
      expect(newBehavior).toBe("Connection failed");

      // Serialization provides complete error info
      const serialized = serializeError(sdkError);
      expect(serialized.name).toBe("CouchbaseError");
      expect(serialized.message).toBe("Connection failed");
      expect(serialized.code).toBe(1);
    });

    test("should handle nested cause chain from connection failure", () => {
      const rootCause = new Error("DNS resolution failed");
      const middleCause = new Error("Network error", { cause: rootCause });
      const topError = new Error("Failed to connect to Couchbase", { cause: middleCause });

      const result = serializeError(topError);

      expect(result.message).toBe("Failed to connect to Couchbase");
      expect(result.cause?.message).toBe("Network error");
      expect(result.cause?.cause?.message).toBe("DNS resolution failed");
    });
  });
});
