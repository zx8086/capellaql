/* src/errors/result.ts */
// Go-style error handling with Result tuples
// Per migration plan: tryCatch utility for cleaner error handling

/**
 * Extracted error details from any error type.
 */
export interface ErrorDetails {
  message: string;
  name: string;
  code?: string;
  stack?: string;
  cause?: unknown;
  context?: Record<string, unknown>;
}

/**
 * Result tuple type - either success [T, undefined] or error [undefined, E].
 * This enables Go-style error handling without try/catch blocks.
 *
 * @example
 * ```typescript
 * const [data, error] = await tryCatch(() => fetchData());
 * if (error) {
 *   logger.error("Failed to fetch data", error);
 *   return;
 * }
 * // data is guaranteed to be T here
 * processData(data);
 * ```
 */
export type Result<T, E = ErrorDetails> = [T, undefined] | [undefined, E];

/**
 * Extract error details from any error type.
 * Safely handles unknown error types and Error subclasses.
 */
export function extractErrorDetails(error: unknown): ErrorDetails {
  // Handle standard Error objects
  if (error instanceof Error) {
    const details: ErrorDetails = {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };

    // Extract code if present (common in custom errors)
    if ("code" in error && typeof (error as { code?: string }).code === "string") {
      details.code = (error as { code: string }).code;
    }

    // Extract cause if present (ES2022 error cause)
    if ("cause" in error) {
      details.cause = error.cause;
    }

    // Extract context if present (custom error pattern)
    if ("context" in error && typeof (error as { context?: unknown }).context === "object") {
      details.context = (error as { context: Record<string, unknown> }).context;
    }

    return details;
  }

  // Handle string errors
  if (typeof error === "string") {
    return {
      message: error,
      name: "StringError",
    };
  }

  // Handle objects with message property
  if (error && typeof error === "object" && "message" in error) {
    const obj = error as { message: unknown; name?: unknown; code?: unknown };
    return {
      message: String(obj.message),
      name: obj.name ? String(obj.name) : "ObjectError",
      code: obj.code ? String(obj.code) : undefined,
    };
  }

  // Handle unknown types
  return {
    message: String(error),
    name: "UnknownError",
  };
}

/**
 * Async wrapper for try-catch operations.
 * Returns a Result tuple instead of throwing.
 *
 * @param fn - Async function to execute
 * @returns Result tuple: [T, undefined] on success, [undefined, ErrorDetails] on error
 *
 * @example
 * ```typescript
 * const [user, error] = await tryCatch(() => userService.getById(id));
 * if (error) {
 *   return createProblemDetails({ code: "DB_003", detail: error.message });
 * }
 * return user;
 * ```
 */
export async function tryCatch<T>(fn: () => Promise<T>): Promise<Result<T, ErrorDetails>> {
  try {
    const result = await fn();
    return [result, undefined];
  } catch (error) {
    return [undefined, extractErrorDetails(error)];
  }
}

/**
 * Sync wrapper for try-catch operations.
 * Returns a Result tuple instead of throwing.
 *
 * @param fn - Sync function to execute
 * @returns Result tuple: [T, undefined] on success, [undefined, ErrorDetails] on error
 *
 * @example
 * ```typescript
 * const [parsed, error] = tryCatchSync(() => JSON.parse(jsonString));
 * if (error) {
 *   return createProblemDetails({ code: "HTTP_001", detail: "Invalid JSON" });
 * }
 * return parsed;
 * ```
 */
export function tryCatchSync<T>(fn: () => T): Result<T, ErrorDetails> {
  try {
    const result = fn();
    return [result, undefined];
  } catch (error) {
    return [undefined, extractErrorDetails(error)];
  }
}

/**
 * Check if a Result is an error.
 * Type guard that narrows the Result type.
 */
export function isError<T, E>(result: Result<T, E>): result is [undefined, E] {
  return result[1] !== undefined;
}

/**
 * Check if a Result is a success.
 * Type guard that narrows the Result type.
 */
export function isSuccess<T, E>(result: Result<T, E>): result is [T, undefined] {
  return result[1] === undefined;
}

/**
 * Unwrap a Result, throwing if it's an error.
 * Use when you want to convert back to throw-style error handling.
 *
 * @throws Error if the result is an error
 */
export function unwrap<T>(result: Result<T>): T {
  if (isError(result)) {
    const error = new Error(result[1].message);
    error.name = result[1].name;
    if (result[1].stack) error.stack = result[1].stack;
    throw error;
  }
  return result[0];
}

/**
 * Unwrap a Result, returning a default value if it's an error.
 */
export function unwrapOr<T>(result: Result<T>, defaultValue: T): T {
  if (isError(result)) {
    return defaultValue;
  }
  return result[0];
}

/**
 * Map over a successful Result.
 * If the result is an error, returns the error unchanged.
 */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (isError(result)) {
    return result;
  }
  return [fn(result[0]), undefined];
}

/**
 * Chain async operations on a Result.
 */
export async function chainResult<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Promise<Result<U, E>>
): Promise<Result<U, E>> {
  if (isError(result)) {
    return result;
  }
  return fn(result[0]);
}
