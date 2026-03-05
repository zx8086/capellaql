// src/openapi/schemas/openapi-types.ts

// Zod schemas for OpenAPI 3.1.1 specification objects.
// Used for type inference only - not runtime validation in hot paths.

import { z } from "zod";

// Base JSON Schema type values
const OpenAPISchemaTypeSchema = z.enum([
  "string",
  "number",
  "integer",
  "boolean",
  "array",
  "object",
  "null",
]);

// Common format values (reserved for future validation use)
const _OpenAPIFormatSchema = z
  .enum([
    "date-time",
    "date",
    "time",
    "duration",
    "email",
    "uri",
    "uuid",
    "int32",
    "int64",
    "float",
    "double",
    "byte",
    "binary",
    "password",
  ])
  .optional();

// Base schema object type for recursive definition
type OpenAPISchemaObjectType = {
  type?: z.infer<typeof OpenAPISchemaTypeSchema>;
  format?: string;
  description?: string;
  example?: unknown;
  enum?: readonly unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  required?: readonly string[];
  properties?: Record<string, OpenAPISchemaObjectType>;
  items?: OpenAPISchemaObjectType;
  additionalProperties?: boolean | OpenAPISchemaObjectType;
  oneOf?: OpenAPISchemaObjectType[];
  allOf?: OpenAPISchemaObjectType[];
  anyOf?: OpenAPISchemaObjectType[];
  $ref?: string;
  [key: string]: unknown;
};

// JSON Schema Object (passthrough for extra properties)
export const OpenAPISchemaObjectSchema: z.ZodType<OpenAPISchemaObjectType> = z.lazy(() =>
  z
    .object({
      type: OpenAPISchemaTypeSchema.optional(),
      format: z.string().optional(),
      description: z.string().optional(),
      example: z.unknown().optional(),
      enum: z.array(z.unknown()).readonly().optional(),
      minimum: z.number().optional(),
      maximum: z.number().optional(),
      minLength: z.number().int().optional(),
      maxLength: z.number().int().optional(),
      pattern: z.string().optional(),
      required: z.array(z.string()).readonly().optional(),
      properties: z.record(z.string(), OpenAPISchemaObjectSchema).optional(),
      items: OpenAPISchemaObjectSchema.optional(),
      additionalProperties: z.union([z.boolean(), OpenAPISchemaObjectSchema]).optional(),
      oneOf: z.array(OpenAPISchemaObjectSchema).optional(),
      allOf: z.array(OpenAPISchemaObjectSchema).optional(),
      anyOf: z.array(OpenAPISchemaObjectSchema).optional(),
      $ref: z.string().optional(),
    })
    .passthrough()
);

// Reference Object
export const OpenAPIReferenceSchema = z.strictObject({
  $ref: z.string(),
});

// Parameter location
const ParameterInSchema = z.enum(["query", "header", "path", "cookie"]);

// Parameter Object
export const OpenAPIParameterSchema = z
  .object({
    name: z.string(),
    in: ParameterInSchema,
    required: z.boolean().optional(),
    description: z.string().optional(),
    schema: OpenAPISchemaObjectSchema.optional(),
    example: z.unknown().optional(),
  })
  .passthrough();

// Media Type Object
export const OpenAPIMediaTypeSchema = z
  .object({
    schema: z.union([OpenAPISchemaObjectSchema, OpenAPIReferenceSchema]).optional(),
    example: z.unknown().optional(),
    examples: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

// Header Object (for response headers)
export const OpenAPIHeaderSchema = z
  .object({
    description: z.string().optional(),
    schema: OpenAPISchemaObjectSchema.optional(),
  })
  .passthrough();

// Response Object
export const OpenAPIResponseSchema = z
  .object({
    description: z.string(),
    content: z.record(z.string(), OpenAPIMediaTypeSchema).optional(),
    headers: z.record(z.string(), OpenAPIHeaderSchema).optional(),
  })
  .passthrough();

// Responses Object (keyed by status code)
export const OpenAPIResponsesSchema = z.record(
  z.string(), // Status codes: "200", "400", "default", etc.
  z.union([OpenAPIResponseSchema, OpenAPIReferenceSchema])
);

// Request Body Object
export const OpenAPIRequestBodySchema = z
  .object({
    description: z.string().optional(),
    content: z.record(z.string(), OpenAPIMediaTypeSchema),
    required: z.boolean().optional(),
  })
  .passthrough();

// Security Scheme type
const SecuritySchemeTypeSchema = z.enum(["apiKey", "http", "oauth2", "openIdConnect"]);

// Security Scheme Object
export const OpenAPISecuritySchemeSchema = z
  .object({
    type: SecuritySchemeTypeSchema,
    description: z.string().optional(),
    name: z.string().optional(),
    in: z.enum(["query", "header", "cookie"]).optional(),
    scheme: z.string().optional(),
    bearerFormat: z.string().optional(),
  })
  .passthrough();

// Tag Object
export const OpenAPITagSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    externalDocs: z
      .object({
        description: z.string().optional(),
        url: z.string(),
      })
      .optional(),
  })
  .passthrough();

// Server Object
export const OpenAPIServerSchema = z
  .object({
    url: z.string(),
    description: z.string().optional(),
    variables: z.record(z.string(), z.unknown()).optional(),
    environment: z.string().optional(), // Custom extension
  })
  .passthrough();

// Operation Object
export const OpenAPIOperationSchema = z
  .object({
    summary: z.string().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    operationId: z.string().optional(),
    parameters: z.array(z.union([OpenAPIParameterSchema, OpenAPIReferenceSchema])).optional(),
    requestBody: z.union([OpenAPIRequestBodySchema, OpenAPIReferenceSchema]).optional(),
    responses: OpenAPIResponsesSchema,
    security: z.array(z.record(z.string(), z.array(z.string()))).optional(),
    deprecated: z.boolean().optional(),
  })
  .passthrough();

// Path Item Object
export const OpenAPIPathItemSchema = z
  .object({
    get: OpenAPIOperationSchema.optional(),
    put: OpenAPIOperationSchema.optional(),
    post: OpenAPIOperationSchema.optional(),
    delete: OpenAPIOperationSchema.optional(),
    patch: OpenAPIOperationSchema.optional(),
    options: OpenAPIOperationSchema.optional(),
    head: OpenAPIOperationSchema.optional(),
    trace: OpenAPIOperationSchema.optional(),
    summary: z.string().optional(),
    description: z.string().optional(),
    parameters: z.array(z.union([OpenAPIParameterSchema, OpenAPIReferenceSchema])).optional(),
  })
  .passthrough();

// Components Object
export const OpenAPIComponentsSchema = z
  .object({
    schemas: z.record(z.string(), OpenAPISchemaObjectSchema).optional(),
    parameters: z.record(z.string(), OpenAPIParameterSchema).optional(),
    securitySchemes: z.record(z.string(), OpenAPISecuritySchemeSchema).optional(),
    responses: z.record(z.string(), OpenAPIResponseSchema).optional(),
    requestBodies: z.record(z.string(), OpenAPIRequestBodySchema).optional(),
  })
  .passthrough();

// Contact Object
const OpenAPIContactSchema = z
  .object({
    name: z.string().optional(),
    email: z.string().optional(),
    url: z.string().optional(),
  })
  .passthrough();

// License Object
const OpenAPILicenseSchema = z
  .object({
    name: z.string(),
    identifier: z.string().optional(),
    url: z.string().optional(),
  })
  .passthrough();

// Info Object
export const OpenAPIInfoSchema = z
  .object({
    title: z.string(),
    description: z.string().optional(),
    version: z.string(),
    contact: OpenAPIContactSchema.optional(),
    license: OpenAPILicenseSchema.optional(),
    termsOfService: z.string().optional(),
  })
  .passthrough();

// Full OpenAPI Document
export const OpenAPIDocumentSchema = z
  .object({
    openapi: z.string(), // "3.1.1"
    jsonSchemaDialect: z.string().optional(),
    info: OpenAPIInfoSchema,
    servers: z.array(OpenAPIServerSchema).optional(),
    paths: z.record(z.string(), OpenAPIPathItemSchema).optional(),
    components: OpenAPIComponentsSchema.optional(),
    security: z.array(z.record(z.string(), z.array(z.string()))).optional(),
    tags: z.array(OpenAPITagSchema).optional(),
  })
  .passthrough();

// Export inferred types
export type OpenAPISchemaObject = z.infer<typeof OpenAPISchemaObjectSchema>;
export type OpenAPIParameter = z.infer<typeof OpenAPIParameterSchema>;
export type OpenAPIResponse = z.infer<typeof OpenAPIResponseSchema>;
export type OpenAPIResponses = z.infer<typeof OpenAPIResponsesSchema>;
export type OpenAPIRequestBody = z.infer<typeof OpenAPIRequestBodySchema>;
export type OpenAPISecurityScheme = z.infer<typeof OpenAPISecuritySchemeSchema>;
export type OpenAPITag = z.infer<typeof OpenAPITagSchema>;
export type OpenAPIServer = z.infer<typeof OpenAPIServerSchema>;
export type OpenAPIOperation = z.infer<typeof OpenAPIOperationSchema>;
export type OpenAPIPathItem = z.infer<typeof OpenAPIPathItemSchema>;
export type OpenAPIComponents = z.infer<typeof OpenAPIComponentsSchema>;
export type OpenAPIInfo = z.infer<typeof OpenAPIInfoSchema>;
export type OpenAPIDocument = z.infer<typeof OpenAPIDocumentSchema>;
export type OpenAPIMediaType = z.infer<typeof OpenAPIMediaTypeSchema>;
export type OpenAPIReference = z.infer<typeof OpenAPIReferenceSchema>;
export type OpenAPIHeader = z.infer<typeof OpenAPIHeaderSchema>;
