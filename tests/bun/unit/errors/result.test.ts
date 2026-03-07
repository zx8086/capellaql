/* tests/bun/unit/errors/result.test.ts */
import { describe, expect, test } from "bun:test";
import {
  chainResult,
  extractErrorDetails,
  isError,
  isSuccess,
  mapResult,
  tryCatch,
  tryCatchSync,
  unwrap,
  unwrapOr,
  type ErrorDetails,
  type Result,
} from "../../../../src/errors/result";

describe("Go-style Result Utilities", () => {
  describe("extractErrorDetails", () => {
    test("should extract details from standard Error", () => {
      const error = new Error("Test error message");
      error.name = "TestError";

      const details = extractErrorDetails(error);

      expect(details.message).toBe("Test error message");
      expect(details.name).toBe("TestError");
      expect(details.stack).toBeDefined();
    });

    test("should extract code from error with code property", () => {
      const error = new Error("DB error") as Error & { code: string };
      error.code = "ECONNREFUSED";

      const details = extractErrorDetails(error);

      expect(details.code).toBe("ECONNREFUSED");
    });

    test("should extract cause from ES2022 error cause", () => {
      const cause = new Error("Root cause");
      const error = new Error("Wrapper error", { cause });

      const details = extractErrorDetails(error);

      expect(details.cause).toBe(cause);
    });

    test("should extract context from custom error", () => {
      const error = new Error("Context error") as Error & {
        context: Record<string, unknown>;
      };
      error.context = { userId: "123", operation: "get" };

      const details = extractErrorDetails(error);

      expect(details.context?.userId).toBe("123");
      expect(details.context?.operation).toBe("get");
    });

    test("should handle string errors", () => {
      const details = extractErrorDetails("String error message");

      expect(details.message).toBe("String error message");
      expect(details.name).toBe("StringError");
    });

    test("should handle object with message property", () => {
      const details = extractErrorDetails({
        message: "Object error",
        name: "CustomError",
        code: "CUSTOM_001",
      });

      expect(details.message).toBe("Object error");
      expect(details.name).toBe("CustomError");
      expect(details.code).toBe("CUSTOM_001");
    });

    test("should handle unknown types", () => {
      const details = extractErrorDetails(42);

      expect(details.message).toBe("42");
      expect(details.name).toBe("UnknownError");
    });

    test("should handle null/undefined", () => {
      const nullDetails = extractErrorDetails(null);
      expect(nullDetails.message).toBe("null");
      expect(nullDetails.name).toBe("UnknownError");

      const undefinedDetails = extractErrorDetails(undefined);
      expect(undefinedDetails.message).toBe("undefined");
      expect(undefinedDetails.name).toBe("UnknownError");
    });
  });

  describe("tryCatch", () => {
    test("should return success tuple on successful async operation", async () => {
      const [result, error] = await tryCatch(async () => {
        return { id: 1, name: "Test" };
      });

      expect(error).toBeUndefined();
      expect(result).toEqual({ id: 1, name: "Test" });
    });

    test("should return error tuple on failed async operation", async () => {
      const [result, error] = await tryCatch(async () => {
        throw new Error("Async operation failed");
      });

      expect(result).toBeUndefined();
      expect(error).toBeDefined();
      expect(error?.message).toBe("Async operation failed");
      expect(error?.name).toBe("Error");
    });

    test("should handle async functions returning primitive values", async () => {
      const [result, error] = await tryCatch(async () => "hello");

      expect(error).toBeUndefined();
      expect(result).toBe("hello");
    });

    test("should handle async functions returning null", async () => {
      const [result, error] = await tryCatch(async () => null);

      expect(error).toBeUndefined();
      expect(result).toBeNull();
    });

    test("should preserve error code in error details", async () => {
      const [, error] = await tryCatch(async () => {
        const err = new Error("DB error") as Error & { code: string };
        err.code = "ECONNREFUSED";
        throw err;
      });

      expect(error?.code).toBe("ECONNREFUSED");
    });
  });

  describe("tryCatchSync", () => {
    test("should return success tuple on successful sync operation", () => {
      const [result, error] = tryCatchSync(() => {
        return JSON.parse('{"key": "value"}');
      });

      expect(error).toBeUndefined();
      expect(result).toEqual({ key: "value" });
    });

    test("should return error tuple on failed sync operation", () => {
      const [result, error] = tryCatchSync(() => {
        return JSON.parse("invalid json");
      });

      expect(result).toBeUndefined();
      expect(error).toBeDefined();
      expect(error?.name).toBe("SyntaxError");
    });

    test("should handle sync functions returning primitive values", () => {
      const [result, error] = tryCatchSync(() => 42);

      expect(error).toBeUndefined();
      expect(result).toBe(42);
    });

    test("should handle sync functions returning undefined", () => {
      const [result, error] = tryCatchSync(() => undefined);

      expect(error).toBeUndefined();
      expect(result).toBeUndefined();
    });
  });

  describe("isError", () => {
    test("should return true for error result", () => {
      const errorResult: Result<string> = [
        undefined,
        { message: "Error", name: "TestError" },
      ];

      expect(isError(errorResult)).toBe(true);
    });

    test("should return false for success result", () => {
      const successResult: Result<string> = ["success", undefined];

      expect(isError(successResult)).toBe(false);
    });

    test("should narrow type correctly", () => {
      const result: Result<number> = [undefined, { message: "err", name: "E" }];

      if (isError(result)) {
        // TypeScript should know result[1] is ErrorDetails
        expect(result[1].message).toBe("err");
      }
    });
  });

  describe("isSuccess", () => {
    test("should return true for success result", () => {
      const successResult: Result<string> = ["success", undefined];

      expect(isSuccess(successResult)).toBe(true);
    });

    test("should return false for error result", () => {
      const errorResult: Result<string> = [
        undefined,
        { message: "Error", name: "TestError" },
      ];

      expect(isSuccess(errorResult)).toBe(false);
    });

    test("should narrow type correctly", () => {
      const result: Result<number> = [42, undefined];

      if (isSuccess(result)) {
        // TypeScript should know result[0] is number
        expect(result[0]).toBe(42);
      }
    });
  });

  describe("unwrap", () => {
    test("should return value for success result", () => {
      const result: Result<string> = ["hello", undefined];

      expect(unwrap(result)).toBe("hello");
    });

    test("should throw for error result", () => {
      const result: Result<string> = [
        undefined,
        { message: "Unwrap failed", name: "UnwrapError" },
      ];

      expect(() => unwrap(result)).toThrow("Unwrap failed");
    });

    test("should preserve error name when throwing", () => {
      const result: Result<string> = [
        undefined,
        { message: "Custom error", name: "CustomError" },
      ];

      try {
        unwrap(result);
      } catch (err) {
        expect((err as Error).name).toBe("CustomError");
      }
    });

    test("should preserve error stack when throwing", () => {
      const result: Result<string> = [
        undefined,
        {
          message: "Stack error",
          name: "StackError",
          stack: "Error: Stack error\n    at test.ts:1:1",
        },
      ];

      try {
        unwrap(result);
      } catch (err) {
        expect((err as Error).stack).toContain("Stack error");
      }
    });
  });

  describe("unwrapOr", () => {
    test("should return value for success result", () => {
      const result: Result<string> = ["hello", undefined];

      expect(unwrapOr(result, "default")).toBe("hello");
    });

    test("should return default value for error result", () => {
      const result: Result<string> = [
        undefined,
        { message: "Error", name: "E" },
      ];

      expect(unwrapOr(result, "default")).toBe("default");
    });

    test("should work with complex default values", () => {
      const result: Result<object> = [
        undefined,
        { message: "Error", name: "E" },
      ];
      const defaultValue = { key: "default", count: 0 };

      expect(unwrapOr(result, defaultValue)).toEqual(defaultValue);
    });
  });

  describe("mapResult", () => {
    test("should transform success value", () => {
      const result: Result<number> = [5, undefined];
      const mapped = mapResult(result, (n) => n * 2);

      expect(isSuccess(mapped)).toBe(true);
      expect(mapped[0]).toBe(10);
    });

    test("should pass through error unchanged", () => {
      const error: ErrorDetails = { message: "Error", name: "E" };
      const result: Result<number> = [undefined, error];
      const mapped = mapResult(result, (n) => n! * 2);

      expect(isError(mapped)).toBe(true);
      expect(mapped[1]).toBe(error);
    });

    test("should support type transformation", () => {
      const result: Result<number> = [42, undefined];
      const mapped = mapResult(result, (n) => n.toString());

      expect(isSuccess(mapped)).toBe(true);
      expect(mapped[0]).toBe("42");
    });
  });

  describe("chainResult", () => {
    test("should chain successful async operations", async () => {
      const result: Result<number> = [5, undefined];

      const chained = await chainResult(result, async (n) => [
        n * 2,
        undefined,
      ]);

      expect(isSuccess(chained)).toBe(true);
      expect(chained[0]).toBe(10);
    });

    test("should pass through error without calling function", async () => {
      const error: ErrorDetails = { message: "Error", name: "E" };
      const result: Result<number> = [undefined, error];

      let called = false;
      const chained = await chainResult(result, async (n) => {
        called = true;
        return [n! * 2, undefined];
      });

      expect(called).toBe(false);
      expect(isError(chained)).toBe(true);
      expect(chained[1]).toBe(error);
    });

    test("should propagate errors from chained function", async () => {
      const result: Result<number> = [5, undefined];

      const chained = await chainResult(result, async () => [
        undefined,
        { message: "Chain error", name: "ChainError" },
      ]);

      expect(isError(chained)).toBe(true);
      expect(chained[1]?.message).toBe("Chain error");
    });
  });

  describe("integration patterns", () => {
    test("should work with real-world JSON parsing", () => {
      const validJson = '{"name": "John", "age": 30}';
      const [parsed, parseError] = tryCatchSync(() => JSON.parse(validJson));

      if (parseError) {
        throw new Error("Should not have error");
      }

      expect(parsed.name).toBe("John");
      expect(parsed.age).toBe(30);
    });

    test("should work with real-world async fetch pattern", async () => {
      const fetchUser = async (id: number) => {
        if (id <= 0) throw new Error("Invalid user ID");
        return { id, name: `User ${id}` };
      };

      const [user, error] = await tryCatch(() => fetchUser(1));

      expect(error).toBeUndefined();
      expect(user?.id).toBe(1);
      expect(user?.name).toBe("User 1");
    });

    test("should work with error handling pattern", async () => {
      const riskyOperation = async () => {
        throw new Error("Operation failed");
      };

      const [result, error] = await tryCatch(riskyOperation);

      if (error) {
        // Handle error - this is the expected path
        expect(error.message).toBe("Operation failed");
        return;
      }

      // This shouldn't be reached
      expect(result).toBeDefined();
    });

    test("should enable Go-style early return pattern", async () => {
      const processData = async () => {
        const [data, fetchError] = await tryCatch(async () => ({
          items: [1, 2, 3],
        }));
        if (fetchError) {
          return { error: fetchError.message };
        }

        const [processed, processError] = tryCatchSync(() =>
          data.items.map((x) => x * 2)
        );
        if (processError) {
          return { error: processError.message };
        }

        return { data: processed };
      };

      const result = await processData();
      expect(result.data).toEqual([2, 4, 6]);
    });
  });
});
