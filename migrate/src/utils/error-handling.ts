/**
 * Error Handling Utilities
 *
 * Provides standardized error extraction and handling functions for consistent
 * error processing across the codebase. Handles unknown error types safely.
 *
 * @module utils/error-handling
 */

/**
 * Error details extracted from an unknown error type.
 */
export interface ErrorDetails {
  /** The error message */
  message: string;
  /** The error name/type */
  name: string;
  /** The stack trace, if available */
  stack?: string;
  /** The error code, if available */
  code?: string | number;
}

/**
 * Extract error message from an unknown error type.
 * Handles Error objects, strings, and objects with message property.
 *
 * @param error - The error to extract message from (can be any type)
 * @returns A string error message
 *
 * @example
 * extractErrorMessage(new Error("failed")); // "failed"
 * extractErrorMessage("simple error"); // "simple error"
 * extractErrorMessage({ message: "custom" }); // "custom"
 * extractErrorMessage(null); // "Unknown error"
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error !== null && typeof error === "object" && "message" in error) {
    const msg = (error as { message: unknown }).message;
    if (typeof msg === "string") {
      return msg;
    }
  }
  return "Unknown error";
}

/**
 * Extract detailed error information for logging and debugging.
 * Provides a consistent structure for error reporting.
 *
 * @param error - The error to extract details from (can be any type)
 * @returns ErrorDetails object with message, name, and optional stack/code
 *
 * @example
 * const err = new Error("connection failed");
 * extractErrorDetails(err);
 * // { message: "connection failed", name: "Error", stack: "..." }
 *
 * extractErrorDetails("simple error");
 * // { message: "simple error", name: "StringError" }
 */
export function extractErrorDetails(error: unknown): ErrorDetails {
  if (error instanceof Error) {
    const details: ErrorDetails = {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };

    // Check for error code (common in Node.js/Bun errors)
    if ("code" in error && (typeof error.code === "string" || typeof error.code === "number")) {
      details.code = error.code;
    }

    return details;
  }

  if (typeof error === "string") {
    return {
      message: error,
      name: "StringError",
    };
  }

  if (error !== null && typeof error === "object") {
    const obj = error as Record<string, unknown>;
    return {
      message: typeof obj.message === "string" ? obj.message : "Unknown error",
      name: typeof obj.name === "string" ? obj.name : "ObjectError",
      code: typeof obj.code === "string" || typeof obj.code === "number" ? obj.code : undefined,
    };
  }

  return {
    message: "Unknown error",
    name: "UnknownError",
  };
}

/**
 * Check if an error is an instance of a specific error type by name.
 * Useful when you need to check error types without importing them.
 *
 * @param error - The error to check
 * @param errorName - The error name to match
 * @returns true if the error has the specified name
 *
 * @example
 * isErrorType(error, "KongApiError"); // true if error.name === "KongApiError"
 * isErrorType(error, "TypeError"); // true for TypeErrors
 */
export function isErrorType(error: unknown, errorName: string): boolean {
  if (error instanceof Error) {
    return error.name === errorName;
  }
  if (error !== null && typeof error === "object" && "name" in error) {
    return (error as { name: unknown }).name === errorName;
  }
  return false;
}

/**
 * Wrap an async function to catch errors and return a result tuple.
 * Provides a Go-style error handling pattern.
 *
 * @param fn - The async function to execute
 * @returns A tuple of [result, error] where one is always undefined
 *
 * @example
 * const [result, error] = await tryCatch(async () => {
 *   return await fetchData();
 * });
 *
 * if (error) {
 *   console.error("Failed:", error.message);
 * } else {
 *   console.log("Success:", result);
 * }
 */
export async function tryCatch<T>(
  fn: () => Promise<T>
): Promise<[T, undefined] | [undefined, ErrorDetails]> {
  try {
    const result = await fn();
    return [result, undefined];
  } catch (error) {
    return [undefined, extractErrorDetails(error)];
  }
}

/**
 * Synchronous version of tryCatch.
 *
 * @param fn - The function to execute
 * @returns A tuple of [result, error] where one is always undefined
 */
export function tryCatchSync<T>(fn: () => T): [T, undefined] | [undefined, ErrorDetails] {
  try {
    const result = fn();
    return [result, undefined];
  } catch (error) {
    return [undefined, extractErrorDetails(error)];
  }
}

/**
 * Create a formatted error log object for structured logging.
 * Provides consistent error context for telemetry.
 *
 * @param error - The error to format
 * @param context - Additional context to include
 * @returns Object suitable for structured logging
 *
 * @example
 * logger.error("Operation failed", formatErrorForLog(error, {
 *   operation: "getConsumer",
 *   consumerId: "123"
 * }));
 */
export function formatErrorForLog(
  error: unknown,
  context: Record<string, unknown> = {}
): Record<string, unknown> {
  const details = extractErrorDetails(error);
  return {
    errorMessage: details.message,
    errorName: details.name,
    errorCode: details.code,
    errorStack: details.stack,
    ...context,
  };
}
