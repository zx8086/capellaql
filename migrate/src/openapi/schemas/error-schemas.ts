// src/openapi/schemas/error-schemas.ts

// RFC 7807 Problem Details error schemas for OpenAPI specification.

import type { OpenAPISchemaObject } from "./openapi-types";

export function createDebugResponseSchema(): OpenAPISchemaObject {
  return Object.freeze({
    type: "object",
    required: Object.freeze(["timestamp", "message", "success"]),
    properties: Object.freeze({
      timestamp: Object.freeze({
        type: "string",
        format: "date-time",
        description: "Operation timestamp",
        example: new Date().toISOString(),
      }),
      message: Object.freeze({
        type: "string",
        description: "Operation result message",
        example: "Test metrics recorded successfully",
      }),
      success: Object.freeze({
        type: "boolean",
        description: "Operation success status",
        example: true,
      }),
      details: Object.freeze({
        type: "object",
        description: "Additional operation details",
        additionalProperties: true,
      }),
    }),
    description: "Debug operation response",
  });
}

export function createErrorResponseSchema(): OpenAPISchemaObject {
  return Object.freeze({
    type: "object",
    description:
      "RFC 7807 Problem Details error response. See https://www.rfc-editor.org/rfc/rfc7807",
    required: Object.freeze([
      "type",
      "title",
      "status",
      "detail",
      "instance",
      "code",
      "requestId",
      "timestamp",
    ]),
    properties: Object.freeze({
      type: Object.freeze({
        type: "string",
        format: "uri",
        description: "URI reference that identifies the problem type (RFC 7807)",
        example: "urn:problem-type:auth-service:auth-001",
      }),
      title: Object.freeze({
        type: "string",
        description: "Short, human-readable summary of the problem type (RFC 7807)",
        example: "Missing Consumer Headers",
      }),
      status: Object.freeze({
        type: "integer",
        description: "HTTP status code (RFC 7807)",
        example: 401,
        minimum: 400,
        maximum: 599,
      }),
      detail: Object.freeze({
        type: "string",
        description: "Human-readable explanation specific to this occurrence (RFC 7807)",
        example: "Required Kong consumer headers are missing from the request",
      }),
      instance: Object.freeze({
        type: "string",
        description: "URI reference identifying the specific occurrence (RFC 7807)",
        example: "/tokens",
      }),
      code: Object.freeze({
        type: "string",
        description: "Internal error code for programmatic handling",
        pattern: "^AUTH_\\d{3}$",
        example: "AUTH_001",
        enum: Object.freeze([
          "AUTH_001",
          "AUTH_002",
          "AUTH_003",
          "AUTH_004",
          "AUTH_005",
          "AUTH_006",
          "AUTH_007",
          "AUTH_008",
          "AUTH_009",
          "AUTH_010",
          "AUTH_011",
          "AUTH_012",
        ]),
      }),
      requestId: Object.freeze({
        type: "string",
        format: "uuid",
        description: "Correlation ID for distributed tracing",
        example: "550e8400-e29b-41d4-a716-446655440000",
      }),
      timestamp: Object.freeze({
        type: "string",
        format: "date-time",
        description: "ISO 8601 timestamp of when the error occurred",
        example: new Date().toISOString(),
      }),
      extensions: Object.freeze({
        type: "object",
        description: "Additional context-specific details (RFC 7807 extension members)",
        additionalProperties: true,
        example: Object.freeze({
          reason: "X-Consumer-ID header missing",
        }),
      }),
    }),
  });
}

export function createErrorCodeReferenceSchema(): OpenAPISchemaObject {
  return Object.freeze({
    type: "object",
    description: "Reference table of all structured error codes",
    properties: Object.freeze({
      AUTH_001: Object.freeze({
        description:
          "Missing Consumer Headers - Required Kong consumer headers are missing from the request",
        httpStatus: 401,
      }),
      AUTH_002: Object.freeze({
        description:
          "Consumer Not Found - The specified consumer was not found or has no JWT credentials",
        httpStatus: 401,
      }),
      AUTH_003: Object.freeze({
        description: "JWT Creation Failed - Failed to create JWT token due to an internal error",
        httpStatus: 500,
      }),
      AUTH_004: Object.freeze({
        description: "Kong API Unavailable - The Kong gateway API is temporarily unavailable",
        httpStatus: 503,
      }),
      AUTH_005: Object.freeze({
        description:
          "Circuit Breaker Open - Service is temporarily unavailable due to circuit breaker protection",
        httpStatus: 503,
      }),
      AUTH_006: Object.freeze({
        description: "Rate Limit Exceeded - Request rate limit has been exceeded",
        httpStatus: 429,
      }),
      AUTH_007: Object.freeze({
        description: "Invalid Request Format - The request format is invalid or malformed",
        httpStatus: 400,
      }),
      AUTH_008: Object.freeze({
        description: "Internal Server Error - An unexpected internal server error occurred",
        httpStatus: 500,
      }),
      AUTH_009: Object.freeze({
        description: "Anonymous Consumer - Anonymous consumers are not allowed to request tokens",
        httpStatus: 401,
      }),
      AUTH_010: Object.freeze({
        description: "Token Expired - The provided JWT token has expired",
        httpStatus: 401,
      }),
      AUTH_011: Object.freeze({
        description: "Invalid Token - The provided JWT token is invalid or malformed",
        httpStatus: 400,
      }),
      AUTH_012: Object.freeze({
        description: "Missing Authorization - Authorization header with Bearer token is required",
        httpStatus: 400,
      }),
    }),
  });
}

export function createErrorSchemas(): Record<string, OpenAPISchemaObject> {
  return Object.freeze({
    DebugResponse: createDebugResponseSchema(),
    ErrorResponse: createErrorResponseSchema(),
    ErrorCodeReference: createErrorCodeReferenceSchema(),
  });
}
