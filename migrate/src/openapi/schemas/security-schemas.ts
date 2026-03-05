// src/openapi/schemas/security-schemas.ts

// Security scheme definitions for OpenAPI specification.
// Includes RFC 8594 Sunset header documentation for API deprecation.

import type { OpenAPIHeader, OpenAPIParameter, OpenAPISecurityScheme } from "./openapi-types";

export function createSecuritySchemes(): Record<string, OpenAPISecurityScheme> {
  return Object.freeze({
    KongAdminToken: Object.freeze({
      type: "apiKey",
      in: "header",
      name: "Kong-Admin-Token",
      description: "Kong Admin API authentication token",
    }),
  });
}

export function createCommonParameters(): Record<string, OpenAPIParameter> {
  return Object.freeze({
    ConsumerIdHeader: Object.freeze({
      name: "x-consumer-id",
      in: "header",
      required: true,
      description: "Kong consumer ID",
      schema: Object.freeze({
        type: "string",
        example: "demo_user",
      }),
    }),
    ConsumerUsernameHeader: Object.freeze({
      name: "x-consumer-username",
      in: "header",
      required: true,
      description: "Kong consumer username",
      schema: Object.freeze({
        type: "string",
        example: "demo_user",
      }),
    }),
    AnonymousConsumerHeader: Object.freeze({
      name: "x-anonymous-consumer",
      in: "header",
      required: false,
      description: "Indicates if the request is from an anonymous consumer",
      schema: Object.freeze({
        type: "string",
        enum: Object.freeze(["true", "false"]),
        example: "false",
      }),
    }),
  });
}

// Create RFC 8594 deprecation response headers documentation.
// @see https://www.rfc-editor.org/rfc/rfc8594
export function createDeprecationHeaders(): Record<string, OpenAPIHeader> {
  return Object.freeze({
    Sunset: Object.freeze({
      description:
        "RFC 8594 Sunset header indicating when this API version will be retired. Format: RFC 7231 HTTP-date.",
      schema: Object.freeze({
        type: "string",
        format: "date-time",
        example: "Sun, 01 Jun 2025 00:00:00 GMT",
      }),
    }),
    Deprecation: Object.freeze({
      description: "Indicates the resource or API version is deprecated.",
      schema: Object.freeze({
        type: "string",
        enum: Object.freeze(["true"]),
        example: "true",
      }),
    }),
    Link: Object.freeze({
      description: 'Link header with rel="sunset" pointing to migration documentation.',
      schema: Object.freeze({
        type: "string",
        example: '<https://docs.example.com/api/v2-migration>; rel="sunset"',
      }),
    }),
  });
}
