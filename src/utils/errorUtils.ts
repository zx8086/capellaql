/**
 * Comprehensive error serialization utilities
 * Handles: Error instances, Couchbase SDK errors, plain objects, primitives
 *
 * This module ensures errors are NEVER logged as [object Object]
 *
 * @module errorUtils
 * @see SIO-442
 */

/**
 * Serialized error structure for logging and API responses
 */
export interface SerializedError {
  name: string;
  message: string;
  code?: string | number;
  stack?: string;
  cause?: SerializedError;
  context?: Record<string, unknown>;
}

/**
 * Serialize any error type to a loggable format
 * NEVER produces [object Object]
 *
 * @param error - Any error type (Error, object, primitive, null/undefined)
 * @returns SerializedError with name, message, and optional code/stack/cause/context
 *
 * @example
 * ```typescript
 * // Error instance
 * serializeError(new Error("test")) // { name: "Error", message: "test", stack: "..." }
 *
 * // Couchbase SDK error with code
 * serializeError(sdkError) // { name: "TimeoutError", message: "...", code: 14, ... }
 *
 * // Plain object
 * serializeError({ foo: "bar" }) // { name: "ObjectError", message: '{"foo":"bar"}', context: {...} }
 *
 * // Primitive
 * serializeError("string error") // { name: "string", message: "string error" }
 *
 * // null/undefined
 * serializeError(null) // { name: "Unknown", message: "No error provided" }
 * ```
 */
export function serializeError(error: unknown): SerializedError {
  // Handle null/undefined
  if (error == null) {
    return { name: "Unknown", message: "No error provided" };
  }

  // Handle Error instances (including Couchbase SDK errors)
  if (error instanceof Error) {
    const serialized: SerializedError = {
      name: error.name || error.constructor.name,
      message: error.message,
      stack: error.stack,
    };

    // Extract Couchbase SDK error codes
    if ("code" in error) {
      serialized.code = (error as Error & { code?: string | number }).code;
    }

    // Preserve error cause chain (ES2022)
    if ("cause" in error && error.cause != null) {
      serialized.cause = serializeError(error.cause);
    }

    // Extract context from AppError or similar
    if ("context" in error) {
      serialized.context = (error as Error & { context?: Record<string, unknown> }).context;
    }

    return serialized;
  }

  // Handle plain objects (Couchbase SDK sometimes returns these)
  if (typeof error === "object") {
    try {
      const obj = error as Record<string, unknown>;
      return {
        name: String(obj.name || obj.constructor?.name || "ObjectError"),
        message: String(obj.message || JSON.stringify(obj, null, 2)),
        code: obj.code as string | number | undefined,
        context: obj,
      };
    } catch {
      // JSON.stringify failed (circular reference, etc.)
      return {
        name: "UnserializableError",
        message: Object.prototype.toString.call(error),
      };
    }
  }

  // Handle primitives (string, number, boolean, symbol, bigint)
  return {
    name: typeof error,
    message: String(error),
  };
}

/**
 * Extract error message safely - never returns [object Object]
 *
 * @param error - Any error type
 * @returns Human-readable error message
 *
 * @example
 * ```typescript
 * getErrorMessage(new Error("test")) // "test"
 * getErrorMessage({ message: "foo" }) // "foo"
 * getErrorMessage("string error") // "string error"
 * getErrorMessage(null) // "No error provided"
 * ```
 */
export function getErrorMessage(error: unknown): string {
  return serializeError(error).message;
}

/**
 * Create a proper Error from any error type, preserving context
 *
 * @param error - Any error type
 * @param defaultMessage - Fallback message if error has none
 * @returns Error instance (original if already Error, wrapped otherwise)
 *
 * @example
 * ```typescript
 * toError(new Error("test")) // Returns the same Error
 * toError("string") // new Error("string") with name="string"
 * toError({ message: "foo" }) // new Error("foo") with name="ObjectError"
 * ```
 */
export function toError(error: unknown, defaultMessage = "Unknown error"): Error {
  if (error instanceof Error) {
    return error;
  }

  const serialized = serializeError(error);
  const err = new Error(serialized.message || defaultMessage);
  err.name = serialized.name;
  return err;
}

/**
 * Check if a value looks like an error (has message property)
 *
 * @param value - Any value to check
 * @returns true if value has a message property
 */
export function isErrorLike(value: unknown): value is { message: string } {
  return (
    value != null &&
    typeof value === "object" &&
    "message" in value &&
    typeof (value as { message: unknown }).message === "string"
  );
}

/**
 * Safely get error name, handling non-Error types
 *
 * @param error - Any error type
 * @returns Error name or type description
 */
export function getErrorName(error: unknown): string {
  return serializeError(error).name;
}

/**
 * Safely get error code if present
 *
 * @param error - Any error type
 * @returns Error code or undefined
 */
export function getErrorCode(error: unknown): string | number | undefined {
  return serializeError(error).code;
}

/**
 * Format error for clean console output
 * Produces a human-readable, well-structured error display
 *
 * @example Output:
 * ```
 * ╭─ ConnectionError (CONNECTION_ERROR)
 * │  Failed to connect after 3 attempts: unambiguous timeout
 * │
 * │  Cause: UnambiguousTimeoutError (code: 14)
 * │         unambiguous timeout
 * │
 * │  Stack: connection-manager.ts:218 → createConnection
 * ╰─
 * ```
 */
export function formatErrorForConsole(error: unknown, context?: Record<string, unknown>): string {
  const serialized = serializeError(error);
  const lines: string[] = [];

  // Header with error name and code
  const codeStr = serialized.code ? ` (${serialized.code})` : "";
  lines.push(`╭─ ${serialized.name}${codeStr}`);
  lines.push(`│  ${serialized.message}`);

  // Add cause chain if present
  if (serialized.cause) {
    lines.push("│");
    const causeCode = serialized.cause.code ? ` (code: ${serialized.cause.code})` : "";
    lines.push(`│  Cause: ${serialized.cause.name}${causeCode}`);
    if (serialized.cause.message && serialized.cause.message !== serialized.message) {
      lines.push(`│         ${serialized.cause.message}`);
    }

    // Second level cause if present
    if (serialized.cause.cause) {
      const cause2Code = serialized.cause.cause.code ? ` (code: ${serialized.cause.cause.code})` : "";
      lines.push(`│    └─ ${serialized.cause.cause.name}${cause2Code}: ${serialized.cause.cause.message}`);
    }
  }

  // Add context if provided
  if (context && Object.keys(context).length > 0) {
    lines.push("│");
    const contextPairs = Object.entries(context)
      .filter(([k, v]) => v !== undefined && k !== "cause" && typeof v !== "object")
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    if (contextPairs) {
      lines.push(`│  Context: ${contextPairs}`);
    }
  }

  // Add simplified stack trace (just the relevant frames)
  if (serialized.stack) {
    const stackLines = serialized.stack
      .split("\n")
      .slice(1, 4) // Skip error message, take first 3 frames
      .map((line) => {
        // Extract just the file:line → function
        const match = line.match(/at\s+(\S+)\s+\(([^)]+)\)/);
        if (match) {
          const [, fn, location] = match;
          const shortLoc = location.split("/").slice(-1)[0]; // Just filename
          return `${shortLoc} → ${fn}`;
        }
        const simpleMatch = line.match(/at\s+(.+)/);
        return simpleMatch ? simpleMatch[1].split("/").slice(-1)[0] : line.trim();
      })
      .filter(Boolean);

    if (stackLines.length > 0) {
      lines.push("│");
      lines.push(`│  Stack: ${stackLines[0]}`);
      stackLines.slice(1).forEach((frame) => {
        lines.push(`│         ${frame}`);
      });
    }
  }

  lines.push("╰─");

  return lines.join("\n");
}

/**
 * Flatten error context for OTEL-compatible attributes (primitives only)
 * Removes nested objects and converts values to strings
 */
export function flattenErrorContext(context: Record<string, unknown>): Record<string, string | number | boolean> {
  const flattened: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(context)) {
    if (value === undefined || value === null) continue;

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      flattened[key] = value;
    } else if (typeof value === "object") {
    } else {
      flattened[key] = String(value);
    }
  }

  return flattened;
}
