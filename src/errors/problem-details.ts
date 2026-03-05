/* src/errors/problem-details.ts */
// RFC 7807 Problem Details implementation
// https://datatracker.ietf.org/doc/html/rfc7807

import { context, trace } from "@opentelemetry/api";
import { type ErrorCode, ErrorStatusCodes, ErrorTitles, getErrorTypeUri, PROBLEM_TYPE_BASE } from "./error-codes";

/**
 * RFC 7807 Problem Details structure.
 * All fields except `type` and `title` are optional per the RFC.
 */
export interface ProblemDetails {
  /** A URI reference that identifies the problem type */
  type: string;
  /** A short, human-readable summary of the problem type */
  title: string;
  /** The HTTP status code */
  status: number;
  /** A human-readable explanation specific to this occurrence */
  detail?: string;
  /** A URI reference that identifies the specific occurrence */
  instance?: string;
  /** ISO 8601 timestamp of when the error occurred */
  timestamp: string;
  /** OpenTelemetry trace ID for correlation */
  traceId?: string;
  /** Additional extension members */
  extensions?: Record<string, unknown>;
}

/**
 * Options for creating a ProblemDetails response.
 */
export interface ProblemDetailsOptions {
  /** Error code from the registry */
  code?: ErrorCode;
  /** Custom type URI (overrides code-based type) */
  type?: string;
  /** Custom title (overrides code-based title) */
  title?: string;
  /** HTTP status code (overrides code-based status) */
  status?: number;
  /** Detailed error message */
  detail?: string;
  /** Request path for the instance field */
  instance?: string;
  /** Additional extension data */
  extensions?: Record<string, unknown>;
}

/**
 * Create a RFC 7807 ProblemDetails response object.
 *
 * @param options - Configuration for the problem details
 * @returns A ProblemDetails object ready for JSON serialization
 *
 * @example
 * ```typescript
 * const problem = createProblemDetails({
 *   code: "DB_003",
 *   detail: "Document 'look::123' not found in collection 'looks'",
 *   instance: "/graphql"
 * });
 * ```
 */
export function createProblemDetails(options: ProblemDetailsOptions): ProblemDetails {
  const { code, type: customType, title: customTitle, status: customStatus, detail, instance, extensions } = options;

  // Determine type, title, and status from code or custom values
  let type = customType ?? `${PROBLEM_TYPE_BASE}/error`;
  let title = customTitle ?? "Error";
  let status = customStatus ?? 500;

  if (code) {
    type = getErrorTypeUri(code);
    title = ErrorTitles[code];
    status = ErrorStatusCodes[code];
  }

  // Override with custom values if provided
  if (customType) type = customType;
  if (customTitle) title = customTitle;
  if (customStatus) status = customStatus;

  // Get trace ID from OpenTelemetry context
  const span = trace.getSpan(context.active());
  const traceId = span?.spanContext().traceId;

  const problemDetails: ProblemDetails = {
    type,
    title,
    status,
    timestamp: new Date().toISOString(),
  };

  // Add optional fields only if present
  if (detail) problemDetails.detail = detail;
  if (instance) problemDetails.instance = instance;
  if (traceId) problemDetails.traceId = traceId;
  if (extensions && Object.keys(extensions).length > 0) {
    problemDetails.extensions = extensions;
  }

  return problemDetails;
}

/**
 * Create a ProblemDetails response from an Error object.
 *
 * @param error - The error to convert
 * @param options - Additional options
 * @returns A ProblemDetails object
 */
export function errorToProblemDetails(error: Error, options: Partial<ProblemDetailsOptions> = {}): ProblemDetails {
  // Try to detect error code from error name or message
  const detectedCode = detectErrorCode(error);

  return createProblemDetails({
    code: options.code ?? detectedCode,
    detail: options.detail ?? error.message,
    instance: options.instance,
    extensions: {
      ...options.extensions,
      errorName: error.name,
      ...(process.env.NODE_ENV !== "production" && { stack: error.stack }),
    },
  });
}

/**
 * Attempt to detect an error code from an Error object.
 */
function detectErrorCode(error: Error): ErrorCode | undefined {
  const name = error.name.toLowerCase();
  const message = error.message.toLowerCase();

  // Database errors
  if (name.includes("documentnotfound") || message.includes("document not found")) {
    return "DB_003";
  }
  if (name.includes("timeout") || message.includes("timeout")) {
    if (name.includes("ambiguous") || message.includes("ambiguous")) {
      return "DB_009";
    }
    return "DB_002";
  }
  if (name.includes("authentication") || message.includes("authentication")) {
    return "DB_004";
  }
  if (name.includes("ratelimit") || message.includes("rate limit")) {
    return "DB_010";
  }
  if (name.includes("casmismatch") || message.includes("cas mismatch")) {
    return "DB_007";
  }

  // GraphQL errors
  if (name.includes("graphql") || name.includes("validation")) {
    if (message.includes("depth")) {
      return "GQL_002";
    }
    if (message.includes("validation")) {
      return "GQL_003";
    }
    return "GQL_001";
  }

  // Configuration errors
  if (name.includes("configuration") || name.includes("config")) {
    return "CONFIG_001";
  }

  // No specific code detected
  return undefined;
}

/**
 * Create a JSON response body and headers for RFC 7807.
 */
export function createProblemResponse(problemDetails: ProblemDetails): {
  body: string;
  headers: Record<string, string>;
} {
  return {
    body: JSON.stringify(problemDetails),
    headers: {
      "Content-Type": "application/problem+json",
    },
  };
}

/**
 * Type guard to check if a value is a ProblemDetails object.
 */
export function isProblemDetails(value: unknown): value is ProblemDetails {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.type === "string" &&
    typeof obj.title === "string" &&
    typeof obj.status === "number" &&
    typeof obj.timestamp === "string"
  );
}
