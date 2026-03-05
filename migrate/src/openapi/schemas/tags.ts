// src/openapi/schemas/tags.ts

import type { OpenAPITag } from "./openapi-types";

export function createTags(): readonly OpenAPITag[] {
  return Object.freeze([
    Object.freeze({
      name: "Documentation",
      description: "API documentation and specification",
    }),
    Object.freeze({
      name: "Health",
      description: "Service health and readiness endpoints",
    }),
    Object.freeze({
      name: "Authentication",
      description: "JWT token generation and validation",
    }),
    Object.freeze({
      name: "Metrics",
      description: "Service metrics and observability",
    }),
    Object.freeze({
      name: "Debug",
      description: "Debug and development endpoints (non-production)",
    }),
    Object.freeze({
      name: "Profiling",
      description: "Performance profiling and analysis endpoints",
    }),
  ]);
}
