/* src/errors/error-codes.ts */
// Centralized error code registry for RFC 7807 Problem Details
// Per migration plan: Standardized error codes with URI-based types

/**
 * Base URI for error type URIs.
 * RFC 7807 recommends using URIs that can be dereferenced to documentation.
 */
export const PROBLEM_TYPE_BASE = "https://capellaql.tommy.com/errors";

/**
 * Centralized error code definitions.
 * Each code maps to a unique error type for API responses.
 */
export const ErrorCodes = {
  // Database errors (DB_0xx)
  DB_001: "connection_failed",
  DB_002: "query_timeout",
  DB_003: "document_not_found",
  DB_004: "authentication_failed",
  DB_005: "bucket_not_found",
  DB_006: "collection_not_found",
  DB_007: "cas_mismatch",
  DB_008: "transaction_failed",
  DB_009: "ambiguous_timeout",
  DB_010: "rate_limited",

  // GraphQL errors (GQL_0xx)
  GQL_001: "invalid_query",
  GQL_002: "depth_limit_exceeded",
  GQL_003: "validation_failed",
  GQL_004: "resolver_error",
  GQL_005: "subscription_error",

  // Configuration errors (CONFIG_0xx)
  CONFIG_001: "invalid_configuration",
  CONFIG_002: "missing_required_field",
  CONFIG_003: "invalid_value",
  CONFIG_004: "health_check_failed",

  // Cache errors (CACHE_0xx)
  CACHE_001: "cache_unavailable",
  CACHE_002: "cache_write_failed",
  CACHE_003: "cache_read_failed",

  // Authentication/Authorization (AUTH_0xx)
  AUTH_001: "unauthorized",
  AUTH_002: "forbidden",
  AUTH_003: "token_expired",
  AUTH_004: "invalid_token",

  // General HTTP errors (HTTP_0xx)
  HTTP_001: "bad_request",
  HTTP_002: "not_found",
  HTTP_003: "method_not_allowed",
  HTTP_004: "internal_server_error",
  HTTP_005: "service_unavailable",
  HTTP_006: "gateway_timeout",

  // Telemetry errors (OTEL_0xx)
  OTEL_001: "export_failed",
  OTEL_002: "circuit_breaker_open",
  OTEL_003: "memory_pressure",
} as const;

export type ErrorCode = keyof typeof ErrorCodes;
export type ErrorSlug = (typeof ErrorCodes)[ErrorCode];

/**
 * Get the full RFC 7807 type URI for an error code.
 */
export function getErrorTypeUri(code: ErrorCode): string {
  return `${PROBLEM_TYPE_BASE}/${ErrorCodes[code]}`;
}

/**
 * HTTP status code mappings for error codes.
 */
export const ErrorStatusCodes: Record<ErrorCode, number> = {
  // Database errors - mostly 5xx (server errors) or 404 (not found)
  DB_001: 503,
  DB_002: 504,
  DB_003: 404,
  DB_004: 401,
  DB_005: 404,
  DB_006: 404,
  DB_007: 409,
  DB_008: 500,
  DB_009: 504,
  DB_010: 429,

  // GraphQL errors - mostly 400 (bad request)
  GQL_001: 400,
  GQL_002: 400,
  GQL_003: 400,
  GQL_004: 500,
  GQL_005: 500,

  // Configuration errors - 500 (server misconfiguration)
  CONFIG_001: 500,
  CONFIG_002: 500,
  CONFIG_003: 500,
  CONFIG_004: 503,

  // Cache errors - 503 (service unavailable) or 500
  CACHE_001: 503,
  CACHE_002: 500,
  CACHE_003: 500,

  // Authentication errors
  AUTH_001: 401,
  AUTH_002: 403,
  AUTH_003: 401,
  AUTH_004: 401,

  // HTTP errors
  HTTP_001: 400,
  HTTP_002: 404,
  HTTP_003: 405,
  HTTP_004: 500,
  HTTP_005: 503,
  HTTP_006: 504,

  // Telemetry errors - 500 (internal issues)
  OTEL_001: 500,
  OTEL_002: 503,
  OTEL_003: 503,
};

/**
 * Human-readable titles for error codes.
 */
export const ErrorTitles: Record<ErrorCode, string> = {
  DB_001: "Database Connection Failed",
  DB_002: "Query Timeout",
  DB_003: "Document Not Found",
  DB_004: "Database Authentication Failed",
  DB_005: "Bucket Not Found",
  DB_006: "Collection Not Found",
  DB_007: "CAS Mismatch",
  DB_008: "Transaction Failed",
  DB_009: "Ambiguous Timeout",
  DB_010: "Rate Limited",

  GQL_001: "Invalid GraphQL Query",
  GQL_002: "Query Depth Limit Exceeded",
  GQL_003: "Input Validation Failed",
  GQL_004: "Resolver Error",
  GQL_005: "Subscription Error",

  CONFIG_001: "Invalid Configuration",
  CONFIG_002: "Missing Required Field",
  CONFIG_003: "Invalid Configuration Value",
  CONFIG_004: "Health Check Failed",

  CACHE_001: "Cache Unavailable",
  CACHE_002: "Cache Write Failed",
  CACHE_003: "Cache Read Failed",

  AUTH_001: "Unauthorized",
  AUTH_002: "Forbidden",
  AUTH_003: "Token Expired",
  AUTH_004: "Invalid Token",

  HTTP_001: "Bad Request",
  HTTP_002: "Not Found",
  HTTP_003: "Method Not Allowed",
  HTTP_004: "Internal Server Error",
  HTTP_005: "Service Unavailable",
  HTTP_006: "Gateway Timeout",

  OTEL_001: "Telemetry Export Failed",
  OTEL_002: "Circuit Breaker Open",
  OTEL_003: "Memory Pressure Detected",
};
