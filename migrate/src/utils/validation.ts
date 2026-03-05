/**
 * Zod Validation Utilities
 *
 * Provides wrapper functions for Zod validation at external data boundaries.
 * Uses "warn and continue" mode - logs validation failures but passes data through
 * with best-effort parsing using .passthrough() for compatibility.
 *
 * @module utils/validation
 */

import type { z } from "zod";
import { SpanEvents, telemetryEmitter } from "../telemetry/tracer";

/**
 * Result of external data validation.
 */
export interface ValidationResult<T> {
  /** Whether validation succeeded */
  success: boolean;
  /** The validated/parsed data (available even on partial success with passthrough) */
  data?: T;
  /** Validation error message if validation failed */
  error?: string;
  /** Individual validation issues for debugging */
  issues?: Array<{ path: string; message: string }>;
}

/**
 * Context for validation logging and debugging.
 */
export interface ValidationContext {
  /** The source of the data (e.g., "kong_api", "redis_cache") */
  source: string;
  /** The operation being performed (e.g., "getConsumerSecret") */
  operation: string;
  /** Optional consumer ID for correlation */
  consumerId?: string;
  /** Optional request ID for tracing */
  requestId?: string;
}

/**
 * Validate external data against a Zod schema.
 *
 * Uses "warn and continue" mode:
 * - On success: returns validated data
 * - On failure: logs warning and returns data with passthrough (if possible)
 * - Only returns null for completely unparseable data
 *
 * @param schema - The Zod schema to validate against
 * @param data - The unknown data to validate
 * @param context - Logging context for debugging
 * @returns ValidationResult with success status and data
 *
 * @example
 * const result = validateExternalData(ConsumerSecretSchema, responseData, {
 *   source: "kong_api",
 *   operation: "getConsumerSecret",
 *   consumerId: "user-123"
 * });
 *
 * if (result.success) {
 *   // Use result.data with full type safety
 * } else {
 *   // Data may still be available via result.data (passthrough mode)
 * }
 */
export function validateExternalData<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: ValidationContext
): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  // Extract validation issues for logging
  const issues = result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));

  // Log validation warning
  telemetryEmitter.warn(SpanEvents.VALIDATION_FAILED, "External data validation failed", {
    component: "validation",
    source: context.source,
    operation: context.operation,
    consumer_id: context.consumerId,
    request_id: context.requestId,
    issue_count: issues.length,
    first_issue: issues[0]?.message ?? "unknown",
    data_type: typeof data,
    has_data: data !== null && data !== undefined,
  });

  // Attempt passthrough parsing for partial data recovery
  // This allows the data to flow through even if validation fails
  // (warn and continue mode)
  if (data !== null && data !== undefined && typeof data === "object") {
    return {
      success: false,
      data: data as T, // Passthrough: return data as-is with type assertion
      error: issues.map((i) => i.message).join(", "),
      issues,
    };
  }

  return {
    success: false,
    error: issues.map((i) => i.message).join(", "),
    issues,
  };
}

/**
 * Validate external data with strict mode (no passthrough).
 * Returns null on validation failure instead of attempting passthrough.
 *
 * @param schema - The Zod schema to validate against
 * @param data - The unknown data to validate
 * @param context - Logging context for debugging
 * @returns The validated data or null on failure
 */
export function validateExternalDataStrict<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: ValidationContext
): T | null {
  const result = schema.safeParse(data);

  if (result.success) {
    return result.data;
  }

  // Extract validation issues for logging
  const issues = result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));

  // Log validation error (more severe than warn)
  telemetryEmitter.error(
    SpanEvents.VALIDATION_FAILED_STRICT,
    "External data validation failed (strict mode)",
    {
      component: "validation",
      source: context.source,
      operation: context.operation,
      consumer_id: context.consumerId,
      request_id: context.requestId,
      issue_count: issues.length,
      first_issue: issues[0]?.message ?? "unknown",
      data_type: typeof data,
    }
  );

  return null;
}

/**
 * Validate and transform JSON string to typed data.
 * Combines JSON parsing and schema validation.
 *
 * @param schema - The Zod schema to validate against
 * @param jsonString - The JSON string to parse and validate
 * @param context - Logging context for debugging
 * @returns ValidationResult with parsed and validated data
 */
export function validateJsonData<T>(
  schema: z.ZodSchema<T>,
  jsonString: string | null | undefined,
  context: ValidationContext
): ValidationResult<T> {
  if (!jsonString) {
    return {
      success: false,
      error: "JSON string is null or undefined",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (parseError) {
    telemetryEmitter.warn(
      SpanEvents.VALIDATION_JSON_PARSE_FAILED,
      "JSON parsing failed during validation",
      {
        component: "validation",
        source: context.source,
        operation: context.operation,
        consumer_id: context.consumerId,
        error: parseError instanceof Error ? parseError.message : "Unknown parse error",
      }
    );

    return {
      success: false,
      error: "Invalid JSON format",
    };
  }

  return validateExternalData(schema, parsed, context);
}

/**
 * Create a validated cache getter function.
 * Wraps cache retrieval with automatic schema validation.
 *
 * @param schema - The Zod schema for cached data
 * @param source - The cache source name for logging
 * @returns A function that validates cache data
 */
export function createValidatedCacheGetter<T>(
  schema: z.ZodSchema<T>,
  source: string
): (data: unknown, operation: string, consumerId?: string) => ValidationResult<T> {
  return (data: unknown, operation: string, consumerId?: string) => {
    return validateExternalData(schema, data, {
      source,
      operation,
      consumerId,
    });
  };
}

/**
 * Type guard that validates and narrows data type.
 * Returns true if data matches schema, narrowing the type.
 *
 * @param schema - The Zod schema to validate against
 * @param data - The unknown data to validate
 * @returns true if data matches schema (with type narrowing)
 */
export function isValidData<T>(schema: z.ZodSchema<T>, data: unknown): data is T {
  return schema.safeParse(data).success;
}

/**
 * Validate an array of items, filtering out invalid entries.
 * Returns only items that pass validation.
 *
 * @param schema - The Zod schema for individual items
 * @param items - Array of unknown items to validate
 * @param context - Logging context for debugging
 * @returns Array of validated items (invalid items are filtered out)
 */
export function validateArrayItems<T>(
  schema: z.ZodSchema<T>,
  items: unknown[],
  context: ValidationContext
): T[] {
  const validItems: T[] = [];
  const invalidCount = { count: 0 };

  for (const item of items) {
    const result = schema.safeParse(item);
    if (result.success) {
      validItems.push(result.data);
    } else {
      invalidCount.count++;
    }
  }

  if (invalidCount.count > 0) {
    telemetryEmitter.warn(
      SpanEvents.VALIDATION_ARRAY_FILTERED,
      "Array validation filtered invalid items",
      {
        component: "validation",
        source: context.source,
        operation: context.operation,
        total_items: items.length,
        valid_items: validItems.length,
        invalid_items: invalidCount.count,
      }
    );
  }

  return validItems;
}
