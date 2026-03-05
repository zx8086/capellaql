// src/openapi-generator.ts

import type { RouteDefinition } from "./config";
import { type AppConfig, loadConfig } from "./config/index";
import {
  createCommonParameters,
  createErrorSchemas,
  createSecuritySchemes,
  createTags,
} from "./openapi/schemas";

// Generic JSON-like value type for OpenAPI objects
// More permissive than strict OpenAPI types, but eliminates `any`
// Using Record<string, unknown> for flexibility with frozen objects
type OpenAPIObject = Record<string, unknown>;

// Type for values that can be converted to YAML
type YamlValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly YamlValue[]
  | YamlValue[]
  | { readonly [key: string]: YamlValue }
  | { [key: string]: YamlValue };

class OpenAPIGenerator {
  private routes: RouteDefinition[] = [];
  private config: AppConfig;
  // biome-ignore lint/suspicious/noExplicitAny: Internal cache stores heterogeneous types (arrays, objects, strings) with different keys
  private readonly _immutableCache = new Map<string, any>();
  private _specGenerated = false;

  constructor() {
    this.config = loadConfig();
    this._initializeImmutableCache();
  }

  private _initializeImmutableCache(): void {
    this._immutableCache.set("securitySchemes", createSecuritySchemes());
    this._immutableCache.set("commonParameters", createCommonParameters());
    this._immutableCache.set("tags", createTags());
    this._immutableCache.set("errorSchemas", createErrorSchemas());
    this._immutableCache.set("openapi311Info", Object.freeze(this._createOpenAPI311Info()));
  }

  registerRoute(route: RouteDefinition): void {
    this.routes.push(route);
  }

  private getEnvironmentDescription(): string {
    switch (this.config.telemetry.environment) {
      case "production":
        return "Production server";
      case "staging":
        return "Staging server";
      case "development":
        return "Development server";
      case "local":
        return "Local development server";
      default:
        return "Development server";
    }
  }

  generateSpec(): OpenAPIObject {
    if (this._specGenerated && this._immutableCache.has("fullSpec")) {
      return this._immutableCache.get("fullSpec");
    }

    const openapi311Info = this._immutableCache.get("openapi311Info");
    const spec = Object.freeze({
      ...openapi311Info,
      info: Object.freeze({
        title: this.config.apiInfo.title,
        description: this.config.apiInfo.description,
        version: this.config.apiInfo.version,
        contact: Object.freeze({
          name: this.config.apiInfo.contactName,
          email: this.config.apiInfo.contactEmail,
        }),
        license: Object.freeze({
          name: this.config.apiInfo.licenseName,
          identifier: this.config.apiInfo.licenseIdentifier,
        }),
      }),
      servers: this._generateServersImmutable(),
      security: Object.freeze([
        Object.freeze({
          KongAdminToken: Object.freeze([]),
        }),
      ]),
      paths: this._generatePathsImmutable(),
      components: this._generateComponentsImmutable(),
      tags: this._immutableCache.get("tags"),
    });

    this._immutableCache.set("fullSpec", spec);
    this._specGenerated = true;
    return spec;
  }

  registerAllRoutes(): void {
    const routes = [
      { path: "/", method: "GET", handler: "getOpenAPISpec", tags: ["Documentation"] },
      { path: "/tokens", method: "GET", handler: "issueToken", tags: ["Authentication"] },
      {
        path: "/tokens/validate",
        method: "GET",
        handler: "validateToken",
        tags: ["Authentication"],
      },
      { path: "/health", method: "GET", handler: "healthCheck", tags: ["Health"] },
      { path: "/health/telemetry", method: "GET", handler: "getTelemetryHealth", tags: ["Health"] },
      {
        path: "/health/metrics",
        method: "GET",
        handler: "getMetricsHealth",
        tags: ["Health", "Metrics"],
      },
      { path: "/metrics", method: "GET", handler: "getMetrics", tags: ["Metrics"] },
      {
        path: "/debug/metrics/test",
        method: "POST",
        handler: "recordTestMetrics",
        tags: ["Debug", "Metrics"],
      },
      {
        path: "/debug/metrics/export",
        method: "POST",
        handler: "forceMetricsExport",
        tags: ["Debug", "Metrics"],
      },
      {
        path: "/debug/profiling/report",
        method: "GET",
        handler: "getProfilingReport",
        tags: ["Debug", "Profiling"],
      },
      {
        path: "/debug/profiling/start",
        method: "POST",
        handler: "startProfiling",
        tags: ["Debug", "Profiling"],
      },
      {
        path: "/debug/profiling/stop",
        method: "POST",
        handler: "stopProfiling",
        tags: ["Debug", "Profiling"],
      },
      {
        path: "/debug/profiling/status",
        method: "GET",
        handler: "getProfilingStatus",
        tags: ["Debug", "Profiling"],
      },
      {
        path: "/debug/profiling/reports",
        method: "GET",
        handler: "getProfilingReports",
        tags: ["Debug", "Profiling"],
      },
      {
        path: "/debug/profiling/cleanup",
        method: "POST",
        handler: "cleanupProfiling",
        tags: ["Debug", "Profiling"],
      },
      {
        path: "/memory/health",
        method: "GET",
        handler: "getMemoryHealth",
        tags: ["Memory", "Health"],
      },
      {
        path: "/memory/metrics",
        method: "GET",
        handler: "getMemoryMetrics",
        tags: ["Memory", "Metrics"],
      },
      {
        path: "/memory/baseline",
        method: "GET",
        handler: "getMemoryBaseline",
        tags: ["Memory", "Baseline"],
      },
      {
        path: "/memory/actions",
        method: "POST",
        handler: "executeMemoryActions",
        tags: ["Memory", "Actions"],
      },
    ];

    routes.forEach((route) => {
      this.registerRoute({
        path: route.path,
        method: route.method,
        summary: this.generateSummary(route.handler),
        description: this.generateDescription(route.handler),
        tags: route.tags,
        responses: this.generateResponsesForHandler(route.handler),
        requiresAuth: route.path === "/tokens" ? false : undefined,
      });
    });
  }

  private generateSummary(handlerName: string): string {
    return handlerName
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  }

  private generateDescription(handlerName: string): string {
    const descriptions = {
      getOpenAPISpec: "Returns the OpenAPI 3.0.3 specification in JSON or YAML format",
      issueToken: "Generate JWT access token for authenticated Kong consumers",
      validateToken: "Validate a JWT access token and return its claims if valid",
      healthCheck: "Get comprehensive system health status including dependency checks",
      getTelemetryHealth: "Get OpenTelemetry configuration and initialization status",
      getMetricsHealth: "Get metrics system health including export statistics",
      getMetrics: "Get service performance metrics and operational statistics",
      recordTestMetrics: "Manually record test metrics for debugging purposes",
      forceMetricsExport: "Trigger immediate metrics export to OTLP endpoint",
      getExportStats: "Get detailed metrics export statistics and timing information",
      startProfiling: "Start CPU and memory profiling session for performance analysis",
      stopProfiling: "Stop active profiling session and generate reports",
      getProfilingStatus: "Get current profiling service status and active sessions",
      getProfilingReports: "List available profiling reports and analysis files",
      getProfilingReport: "Get specific profiling report data and analysis",
      cleanupProfiling: "Clean up profiling artifacts and session data",
      getMemoryHealth:
        "Get enhanced memory health status with leak detection and reliability scoring",
      getMemoryMetrics: "Get detailed memory metrics including JSC heap stats and trends",
      getMemoryBaseline: "Get memory baseline establishment and reporting data",
      executeMemoryActions:
        "Execute memory management actions (garbage collection, queue clearing, reset)",
    };

    return descriptions[handlerName as keyof typeof descriptions] || `Handler: ${handlerName}`;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Dynamic OpenAPI responses built at runtime with conditional properties
  private generateResponsesForHandler(handlerName: string): any {
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic responses object built conditionally based on handler
    const responses: any = {
      "200": {
        description: "Successful operation",
        content: {
          "application/json": {
            schema: this.getResponseSchemaForHandler(handlerName),
          },
        },
      },
      "400": {
        description: "Bad Request",
        content: {
          "application/problem+json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      "500": {
        description: "Internal Server Error",
        content: {
          "application/problem+json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
    };

    // Add specific responses based on handler
    if (handlerName === "validateToken") {
      responses["401"] = {
        description: "Unauthorized - Token expired or invalid consumer credentials",
        content: {
          "application/problem+json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      };
    }

    if (handlerName === "issueToken") {
      responses["401"] = {
        description: "Unauthorized - Missing or invalid Kong consumer headers",
        content: {
          "application/problem+json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      };
      responses["403"] = {
        description: "Forbidden - Anonymous consumers are not allowed",
        content: {
          "application/problem+json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      };
      responses["429"] = {
        description: "Rate limit exceeded",
        content: {
          "application/problem+json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      };
    }

    if (handlerName === "getOpenAPISpec") {
      responses["200"].content["application/yaml"] = {
        schema: {
          type: "string",
          description: "OpenAPI 3.0.3 specification in YAML format",
        },
      };
    }

    return responses;
  }

  private getResponseSchemaForHandler(handlerName: string): OpenAPIObject {
    const schemaMap = {
      getOpenAPISpec: { type: "object", description: "OpenAPI 3.0.3 specification object" },
      issueToken: { $ref: "#/components/schemas/TokenResponse" },
      validateToken: { $ref: "#/components/schemas/TokenValidationResponse" },
      healthCheck: { $ref: "#/components/schemas/HealthResponse" },
      getTelemetryHealth: { $ref: "#/components/schemas/TelemetryStatus" },
      getMetricsHealth: { $ref: "#/components/schemas/MetricsHealth" },
      getMetrics: { $ref: "#/components/schemas/PerformanceMetrics" },
      recordTestMetrics: { $ref: "#/components/schemas/DebugResponse" },
      forceMetricsExport: { $ref: "#/components/schemas/DebugResponse" },
      getExportStats: { $ref: "#/components/schemas/MetricsStats" },
      startProfiling: { $ref: "#/components/schemas/ProfilingResponse" },
      stopProfiling: { $ref: "#/components/schemas/ProfilingResponse" },
      getProfilingStatus: { $ref: "#/components/schemas/ProfilingStatus" },
      getProfilingReports: { $ref: "#/components/schemas/ProfilingReports" },
      cleanupProfiling: { $ref: "#/components/schemas/DebugResponse" },
    };

    return schemaMap[handlerName as keyof typeof schemaMap] || { type: "object" };
  }

  convertToYaml(obj: YamlValue): string {
    const cacheKey = `yaml_${JSON.stringify(obj).slice(0, 100)}`;

    if (this._immutableCache.has(cacheKey)) {
      return this._immutableCache.get(cacheKey);
    }

    const yamlHeader = `# OpenAPI 3.1.1 specification for Authentication Service
# Generated on: ${new Date().toISOString()}
# This file is auto-generated. Do not edit manually.
# Compliant with JSON Schema Draft 2020-12

`;
    const result = yamlHeader + this._objectToYamlEnhanced(obj, 0);
    this._immutableCache.set(cacheKey, result);
    return result;
  }

  private _generateServersImmutable(): readonly OpenAPIObject[] {
    const cacheKey = `servers_${this.config.server.port}_${this.config.telemetry.environment}`;

    if (this._immutableCache.has(cacheKey)) {
      return this._immutableCache.get(cacheKey);
    }

    const servers = [];
    const currentUrl = `http://localhost:${this.config.server.port}`;
    const envDescription = this.getEnvironmentDescription();

    servers.push(
      Object.freeze({
        url: currentUrl,
        description: `${envDescription} (current)`,
        environment: this.config.telemetry.environment,
      })
    );

    if (this.config.telemetry.environment !== "development") {
      servers.push(
        Object.freeze({
          url: "http://localhost:3000",
          description: "Development server",
          environment: "development",
        })
      );
    }

    if (this.config.telemetry.environment !== "staging") {
      servers.push(
        Object.freeze({
          url: "https://auth-staging.example.com",
          description: "Staging server",
          environment: "staging",
        })
      );
    }

    if (this.config.telemetry.environment !== "production") {
      servers.push(
        Object.freeze({
          url: "https://auth.example.com",
          description: "Production server",
          environment: "production",
        })
      );
    }

    const frozenServers = Object.freeze(servers);
    this._immutableCache.set(cacheKey, frozenServers);
    return frozenServers;
  }

  private _generatePathsImmutable(): Record<string, OpenAPIObject> {
    const cacheKey = `paths_${this.routes.length}_${JSON.stringify(this.routes.map((r) => `${r.path}:${r.method}`))}`;

    if (this._immutableCache.has(cacheKey)) {
      return this._immutableCache.get(cacheKey);
    }

    const paths: Record<string, OpenAPIObject> = {};

    for (const route of this.routes) {
      if (!paths[route.path]) {
        paths[route.path] = {};
      }

      const operation = Object.freeze({
        summary: route.summary,
        description: route.description,
        tags: Object.freeze([...route.tags]),
        operationId: this._generateOperationIdImmutable(route.path, route.method),
        responses: route.responses || this._generateDefaultResponsesImmutable(route),
        ...(route.parameters && { parameters: Object.freeze([...route.parameters]) }),
        ...(route.path === "/tokens" && {
          parameters: Object.freeze(this._getTokensParametersImmutable()),
        }),
        ...(route.path === "/tokens/validate" && {
          parameters: Object.freeze(this._getTokensValidateParametersImmutable()),
        }),
        ...(route.requestBody && { requestBody: Object.freeze(route.requestBody) }),
        ...(route.requiresAuth && {
          security: Object.freeze([Object.freeze({ KongAdminToken: Object.freeze([]) })]),
        }),
      });

      // biome-ignore lint/style/noNonNullAssertion: Safe - paths[route.path] is initialized above
      paths[route.path]![route.method.toLowerCase()] = operation;
    }

    const frozenPaths = Object.freeze(paths);
    this._immutableCache.set(cacheKey, frozenPaths);
    return frozenPaths;
  }

  private _generateComponentsImmutable(): OpenAPIObject {
    const cacheKey = "components";

    if (this._immutableCache.has(cacheKey)) {
      return this._immutableCache.get(cacheKey);
    }

    const components = Object.freeze({
      schemas: Object.freeze({
        ...this._generateAuthSchemasImmutable(),
        ...this._generateHealthSchemasImmutable(),
        ...this._generateMetricsSchemasImmutable(),
        ...this._generateProfilingSchemasImmutable(),
        ...this._immutableCache.get("errorSchemas"),
      }),
      securitySchemes: this._immutableCache.get("securitySchemes"),
      parameters: this._immutableCache.get("commonParameters"),
    });

    this._immutableCache.set(cacheKey, components);
    return components;
  }

  private _generateOperationIdImmutable(path: string, method: string): string {
    const cacheKey = `opId_${path}_${method}`;

    if (this._immutableCache.has(cacheKey)) {
      return this._immutableCache.get(cacheKey);
    }

    const cleanPath = path
      .replace(/^\//, "") // Remove leading slash
      .replace(/\{(\w+)\}/g, "By$1") // Convert {id} to ById
      .replace(/[/-]/g, "_") // Replace slashes and hyphens with underscores
      .split("_")
      .map((part, index) => {
        if (index === 0) return part.toLowerCase();
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      })
      .join("");

    const methodPrefix =
      {
        GET: "get",
        POST: "create",
        PUT: "update",
        DELETE: "delete",
        PATCH: "patch",
      }[method.toUpperCase()] || method.toLowerCase();

    const operationId = `${methodPrefix}${cleanPath.charAt(0).toUpperCase() + cleanPath.slice(1)}`;
    this._immutableCache.set(cacheKey, operationId);
    return operationId;
  }

  private _getTokensParametersImmutable(): readonly OpenAPIObject[] {
    const cacheKey = "tokensParameters";

    if (this._immutableCache.has(cacheKey)) {
      return this._immutableCache.get(cacheKey);
    }

    const params = Object.freeze([
      Object.freeze({
        name: "x-consumer-id",
        in: "header",
        required: true,
        description: "Kong consumer ID",
        schema: Object.freeze({
          type: "string",
          example: "demo_user",
        }),
      }),
      Object.freeze({
        name: "x-consumer-username",
        in: "header",
        required: true,
        description: "Kong consumer username",
        schema: Object.freeze({
          type: "string",
          example: "demo_user",
        }),
      }),
      Object.freeze({
        name: "x-anonymous-consumer",
        in: "header",
        required: false,
        description:
          "Indicates if the request is from an anonymous consumer (must not be 'true' for token issuance)",
        schema: Object.freeze({
          type: "string",
          enum: Object.freeze(["true", "false"]),
          example: "false",
        }),
      }),
    ]);

    this._immutableCache.set(cacheKey, params);
    return params;
  }

  private _getTokensValidateParametersImmutable(): readonly OpenAPIObject[] {
    const cacheKey = "tokensValidateParameters";

    if (this._immutableCache.has(cacheKey)) {
      return this._immutableCache.get(cacheKey);
    }

    const params = Object.freeze([
      Object.freeze({
        name: "Authorization",
        in: "header",
        required: true,
        description: "Bearer token to validate",
        schema: Object.freeze({
          type: "string",
          pattern: "^Bearer .+$",
          example: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        }),
      }),
      Object.freeze({
        name: "x-consumer-id",
        in: "header",
        required: true,
        description: "Kong consumer ID",
        schema: Object.freeze({
          type: "string",
          example: "demo_user",
        }),
      }),
      Object.freeze({
        name: "x-consumer-username",
        in: "header",
        required: true,
        description: "Kong consumer username",
        schema: Object.freeze({
          type: "string",
          example: "demo_user",
        }),
      }),
      Object.freeze({
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
    ]);

    this._immutableCache.set(cacheKey, params);
    return params;
  }

  private _generateDefaultResponsesImmutable(route: RouteDefinition): OpenAPIObject {
    const cacheKey = `responses_${route.path}_${route.method}`;

    if (this._immutableCache.has(cacheKey)) {
      return this._immutableCache.get(cacheKey);
    }

    const responses: OpenAPIObject = {
      "200": Object.freeze({
        description: "Successful operation",
        content: Object.freeze({
          "application/json": Object.freeze({
            schema: this._getResponseSchemaImmutable(route.path, route.method),
          }),
        }),
      }),
      "400": Object.freeze({
        description: "Bad Request",
        content: Object.freeze({
          "application/problem+json": Object.freeze({
            schema: Object.freeze({ $ref: "#/components/schemas/ErrorResponse" }),
          }),
        }),
      }),
      "500": Object.freeze({
        description: "Internal Server Error",
        content: Object.freeze({
          "application/problem+json": Object.freeze({
            schema: Object.freeze({ $ref: "#/components/schemas/ErrorResponse" }),
          }),
        }),
      }),
    };

    if (route.path === "/tokens") {
      responses["401"] = Object.freeze({
        description: "Unauthorized - Missing or invalid Kong consumer headers",
        content: Object.freeze({
          "application/problem+json": Object.freeze({
            schema: Object.freeze({ $ref: "#/components/schemas/ErrorResponse" }),
          }),
        }),
      });
      responses["403"] = Object.freeze({
        description: "Forbidden - Anonymous consumers are not allowed",
        content: Object.freeze({
          "application/problem+json": Object.freeze({
            schema: Object.freeze({ $ref: "#/components/schemas/ErrorResponse" }),
          }),
        }),
      });
      responses["429"] = Object.freeze({
        description: "Rate limit exceeded",
        content: Object.freeze({
          "application/problem+json": Object.freeze({
            schema: Object.freeze({ $ref: "#/components/schemas/ErrorResponse" }),
          }),
        }),
      });
    }

    if (route.path === "/tokens/validate") {
      responses["401"] = Object.freeze({
        description: "Unauthorized - Token expired or invalid consumer credentials",
        content: Object.freeze({
          "application/problem+json": Object.freeze({
            schema: Object.freeze({ $ref: "#/components/schemas/ErrorResponse" }),
          }),
        }),
      });
    }

    const frozenResponses = Object.freeze(responses);
    this._immutableCache.set(cacheKey, frozenResponses);
    return frozenResponses;
  }

  private _getResponseSchemaImmutable(path: string, method: string): OpenAPIObject {
    const cacheKey = `schema_${path}_${method}`;

    if (this._immutableCache.has(cacheKey)) {
      return this._immutableCache.get(cacheKey);
    }

    let schema: OpenAPIObject;
    if (path === "/tokens" && method === "GET") {
      schema = Object.freeze({ $ref: "#/components/schemas/TokenResponse" });
    } else if (path === "/tokens/validate" && method === "GET") {
      schema = Object.freeze({ $ref: "#/components/schemas/TokenValidationResponse" });
    } else if (path === "/health" && method === "GET") {
      schema = Object.freeze({ $ref: "#/components/schemas/HealthResponse" });
    } else if (path === "/health/telemetry" && method === "GET") {
      schema = Object.freeze({ $ref: "#/components/schemas/TelemetryStatus" });
    } else if (path === "/health/metrics" && method === "GET") {
      schema = Object.freeze({ $ref: "#/components/schemas/MetricsHealth" });
    } else if (path === "/metrics" && method === "GET") {
      schema = Object.freeze({ $ref: "#/components/schemas/PerformanceMetrics" });
    } else if (path === "/debug/metrics/test" && method === "POST") {
      schema = Object.freeze({ $ref: "#/components/schemas/DebugResponse" });
    } else if (path === "/debug/metrics/export" && method === "POST") {
      schema = Object.freeze({ $ref: "#/components/schemas/DebugResponse" });
    } else if (path === "/debug/metrics/stats" && method === "GET") {
      schema = Object.freeze({ $ref: "#/components/schemas/MetricsStats" });
    } else if (path === "/debug/profiling/start" && method === "POST") {
      schema = Object.freeze({ $ref: "#/components/schemas/ProfilingResponse" });
    } else if (path === "/debug/profiling/stop" && method === "POST") {
      schema = Object.freeze({ $ref: "#/components/schemas/ProfilingResponse" });
    } else if (path === "/debug/profiling/status" && method === "GET") {
      schema = Object.freeze({ $ref: "#/components/schemas/ProfilingStatus" });
    } else if (path === "/debug/profiling/reports" && method === "GET") {
      schema = Object.freeze({ $ref: "#/components/schemas/ProfilingReports" });
    } else if (path === "/debug/profiling/cleanup" && method === "POST") {
      schema = Object.freeze({ $ref: "#/components/schemas/DebugResponse" });
    } else {
      schema = Object.freeze({ type: "object" });
    }

    this._immutableCache.set(cacheKey, schema);
    return schema;
  }

  private _createOpenAPI311Info(): { openapi: string; jsonSchemaDialect: string } {
    return Object.freeze({
      openapi: "3.1.1",
      jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
    });
  }

  private _generateAuthSchemasImmutable(): Record<string, OpenAPIObject> {
    const cacheKey = "authSchemas";

    if (this._immutableCache.has(cacheKey)) {
      return this._immutableCache.get(cacheKey);
    }

    const schemas = Object.freeze({
      TokenResponse: Object.freeze({
        type: "object",
        required: Object.freeze(["access_token", "expires_in"]),
        properties: Object.freeze({
          access_token: Object.freeze({
            type: "string",
            description: "JWT access token",
            example: this._generateJWTExample(),
          }),
          expires_in: Object.freeze({
            type: "integer",
            description: "Token expiration time in seconds",
            example: 900,
            minimum: 1,
          }),
        }),
        description: "JWT token response",
      }),
      TokenValidationResponse: Object.freeze({
        type: "object",
        required: Object.freeze([
          "valid",
          "tokenId",
          "subject",
          "issuer",
          "audience",
          "issuedAt",
          "expiresAt",
          "expiresIn",
        ]),
        properties: Object.freeze({
          valid: Object.freeze({
            type: "boolean",
            description: "Whether the token is valid",
            example: true,
          }),
          tokenId: Object.freeze({
            type: "string",
            format: "uuid",
            description: "Unique token identifier (jti claim)",
            example: "550e8400-e29b-41d4-a716-446655440000",
          }),
          subject: Object.freeze({
            type: "string",
            description: "Token subject (sub claim) - typically the username",
            example: "demo_user",
          }),
          issuer: Object.freeze({
            type: "string",
            description: "Token issuer (iss claim)",
            example: this.config.jwt.authority,
          }),
          audience: Object.freeze({
            oneOf: Object.freeze([
              Object.freeze({ type: "string" }),
              Object.freeze({
                type: "array",
                items: Object.freeze({ type: "string" }),
              }),
            ]),
            description: "Token audience (aud claim)",
            example: this.config.jwt.audience,
          }),
          issuedAt: Object.freeze({
            type: "string",
            format: "date-time",
            description: "Token issue timestamp (iat claim)",
            example: new Date().toISOString(),
          }),
          expiresAt: Object.freeze({
            type: "string",
            format: "date-time",
            description: "Token expiration timestamp (exp claim)",
            example: new Date(Date.now() + 900000).toISOString(),
          }),
          expiresIn: Object.freeze({
            type: "integer",
            description: "Seconds until token expires",
            example: 850,
            minimum: 0,
          }),
        }),
        description: "Token validation response with claims",
      }),
    });

    this._immutableCache.set(cacheKey, schemas);
    return schemas;
  }

  private _generateHealthSchemasImmutable(): Record<string, OpenAPIObject> {
    const cacheKey = "healthSchemas";

    if (this._immutableCache.has(cacheKey)) {
      return this._immutableCache.get(cacheKey);
    }

    const schemas = Object.freeze({
      HealthResponse: Object.freeze({
        type: "object",
        required: Object.freeze([
          "status",
          "timestamp",
          "version",
          "uptime",
          "environment",
          "dependencies",
        ]),
        properties: Object.freeze({
          status: Object.freeze({
            type: "string",
            enum: Object.freeze(["healthy", "degraded", "unhealthy"]),
            description: "Overall system health status",
            example: "healthy",
          }),
          timestamp: Object.freeze({
            type: "string",
            format: "date-time",
            description: "Health check timestamp",
            example: new Date().toISOString(),
          }),
          version: Object.freeze({
            type: "string",
            description: "Service version",
            example: this.config.apiInfo.version,
          }),
          uptime: Object.freeze({
            type: "integer",
            description: "Service uptime in seconds",
            example: 3600,
            minimum: 0,
          }),
          environment: Object.freeze({
            type: "string",
            description: "Deployment environment",
            example: this.config.telemetry.environment,
          }),
          dependencies: Object.freeze({
            type: "object",
            properties: Object.freeze({
              kong: Object.freeze({
                type: "object",
                required: Object.freeze(["status", "response_time", "url"]),
                properties: Object.freeze({
                  status: Object.freeze({
                    type: "string",
                    enum: Object.freeze(["healthy", "unhealthy"]),
                    description: "Kong Admin API status",
                    example: "healthy",
                  }),
                  response_time: Object.freeze({
                    type: "integer",
                    description: "Kong response time in milliseconds",
                    example: 45,
                    minimum: 0,
                  }),
                  url: Object.freeze({
                    type: "string",
                    format: "uri",
                    description: "Kong Admin API URL",
                    example: "https://kong-admin.example.com",
                  }),
                }),
              }),
              cache: Object.freeze({
                type: "object",
                required: Object.freeze([
                  "type",
                  "connection",
                  "entries",
                  "performance",
                  "healthMonitor",
                ]),
                description: "Cache system health grouped by concern",
                properties: Object.freeze({
                  type: Object.freeze({
                    type: "string",
                    enum: Object.freeze(["redis", "valkey", "memory"]),
                    description: "Cache backend type (auto-detected for distributed)",
                    example: "redis",
                  }),
                  connection: Object.freeze({
                    type: "object",
                    description: "Cache connection status",
                    required: Object.freeze(["connected", "responseTime"]),
                    properties: Object.freeze({
                      connected: Object.freeze({
                        type: "boolean",
                        description: "Whether cache is connected",
                        example: true,
                      }),
                      responseTime: Object.freeze({
                        type: "string",
                        description: "Cache ping response time",
                        example: "0.4ms",
                      }),
                    }),
                  }),
                  entries: Object.freeze({
                    type: "object",
                    description: "Cache entry counts",
                    required: Object.freeze([
                      "primary",
                      "primaryActive",
                      "stale",
                      "staleCacheAvailable",
                    ]),
                    properties: Object.freeze({
                      primary: Object.freeze({
                        type: "integer",
                        description: "Total primary cache entries",
                        example: 5,
                        minimum: 0,
                      }),
                      primaryActive: Object.freeze({
                        type: "integer",
                        description: "Primary entries with TTL > 0",
                        example: 5,
                        minimum: 0,
                      }),
                      stale: Object.freeze({
                        type: "integer",
                        description: "Stale entries for circuit breaker fallback",
                        example: 11,
                        minimum: 0,
                      }),
                      staleCacheAvailable: Object.freeze({
                        type: "boolean",
                        description: "Whether stale cache fallback is available",
                        example: true,
                      }),
                    }),
                  }),
                  performance: Object.freeze({
                    type: "object",
                    description: "Cache performance metrics",
                    required: Object.freeze(["hitRate", "avgLatencyMs"]),
                    properties: Object.freeze({
                      hitRate: Object.freeze({
                        type: "string",
                        description: "Cache hit rate percentage",
                        example: "62.50%",
                      }),
                      avgLatencyMs: Object.freeze({
                        type: "number",
                        description: "Average cache operation latency (ms)",
                        example: 0.54,
                        minimum: 0,
                      }),
                    }),
                  }),
                  healthMonitor: Object.freeze({
                    type: "object",
                    nullable: true,
                    description: "Health monitor state (null for memory cache)",
                    properties: Object.freeze({
                      status: Object.freeze({
                        type: "string",
                        enum: Object.freeze(["healthy", "degraded", "unhealthy", "unknown"]),
                        description: "Health monitor status",
                        example: "healthy",
                      }),
                      isMonitoring: Object.freeze({
                        type: "boolean",
                        description: "Whether health monitor is active",
                        example: true,
                      }),
                      consecutiveSuccesses: Object.freeze({
                        type: "integer",
                        description: "Consecutive successful PING checks",
                        example: 47,
                        minimum: 0,
                      }),
                      consecutiveFailures: Object.freeze({
                        type: "integer",
                        description: "Consecutive failed PING checks",
                        example: 0,
                        minimum: 0,
                      }),
                      lastStatusChange: Object.freeze({
                        type: "string",
                        format: "date-time",
                        description: "When status last changed",
                        example: "2026-02-21T12:00:17.489Z",
                      }),
                      lastCheck: Object.freeze({
                        type: "object",
                        description: "Most recent health check",
                        properties: Object.freeze({
                          success: Object.freeze({
                            type: "boolean",
                            description: "Whether check succeeded",
                            example: true,
                          }),
                          timestamp: Object.freeze({
                            type: "string",
                            format: "date-time",
                            description: "Check timestamp",
                            example: "2026-02-21T12:07:47.606Z",
                          }),
                          responseTimeMs: Object.freeze({
                            type: "number",
                            description: "Check response time (ms)",
                            example: 1,
                            minimum: 0,
                          }),
                          error: Object.freeze({
                            type: "string",
                            description: "Error message (only when failed)",
                            example: "PING timeout after 500ms",
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
        description: "System health status with dependency information",
      }),
      TelemetryStatus: Object.freeze({
        type: "object",
        required: Object.freeze(["initialized", "config"]),
        properties: Object.freeze({
          initialized: Object.freeze({
            type: "boolean",
            description: "Whether OpenTelemetry is initialized",
            example: true,
          }),
          config: Object.freeze({
            type: "object",
            properties: Object.freeze({
              serviceName: Object.freeze({
                type: "string",
                description: "OpenTelemetry service name",
                example: this.config.telemetry.serviceName,
              }),
              serviceVersion: Object.freeze({
                type: "string",
                description: "Service version for telemetry",
                example: this.config.telemetry.serviceVersion,
              }),
              environment: Object.freeze({
                type: "string",
                enum: Object.freeze(["local", "development", "staging", "production"]),
                description: "Deployment environment",
                example: this.config.telemetry.environment,
              }),
              mode: Object.freeze({
                type: "string",
                enum: Object.freeze(["console", "otlp", "both"]),
                description: "Telemetry output mode",
                example: this.config.telemetry.mode,
              }),
              tracesEndpoint: Object.freeze({
                type: "string",
                format: "uri",
                description: "OTLP traces endpoint",
                example: "https://otel-http.example.com/v1/traces",
              }),
              metricsEndpoint: Object.freeze({
                type: "string",
                format: "uri",
                description: "OTLP metrics endpoint",
                example: "https://otel-http.example.com/v1/metrics",
              }),
              logsEndpoint: Object.freeze({
                type: "string",
                format: "uri",
                description: "OTLP logs endpoint",
                example: "https://otel-http.example.com/v1/logs",
              }),
            }),
          }),
        }),
        description: "OpenTelemetry configuration and status",
      }),
    });

    this._immutableCache.set(cacheKey, schemas);
    return schemas;
  }

  private _generateMetricsSchemasImmutable(): Record<string, OpenAPIObject> {
    const cacheKey = "metricsSchemas";

    if (this._immutableCache.has(cacheKey)) {
      return this._immutableCache.get(cacheKey);
    }

    const schemas = Object.freeze({
      MetricsHealth: Object.freeze({
        type: "object",
        required: Object.freeze([
          "timestamp",
          "telemetry",
          "metrics",
          "export_statistics",
          "circuitBreakers",
        ]),
        properties: Object.freeze({
          timestamp: Object.freeze({
            type: "string",
            format: "date-time",
            description: "Metrics health check timestamp",
            example: new Date().toISOString(),
          }),
          telemetry: Object.freeze({
            $ref: "#/components/schemas/TelemetryStatus",
          }),
          metrics: Object.freeze({
            type: "object",
            properties: Object.freeze({
              total_instruments: Object.freeze({
                type: "integer",
                description: "Total number of metric instruments",
                example: 23,
                minimum: 0,
              }),
            }),
          }),
          export_statistics: this._generateExportStatisticsSchemaImmutable(),
          circuitBreakers: this._generateCircuitBreakerSummarySchemaImmutable(),
        }),
        description: "Comprehensive metrics system health information",
      }),
      PerformanceMetrics: Object.freeze({
        type: "object",
        required: Object.freeze(["timestamp", "uptime", "metrics", "circuitBreakers"]),
        properties: Object.freeze({
          timestamp: Object.freeze({
            type: "string",
            format: "date-time",
            description: "Metrics collection timestamp",
            example: new Date().toISOString(),
          }),
          uptime: Object.freeze({
            type: "integer",
            description: "Service uptime in seconds",
            example: 3600,
            minimum: 0,
          }),
          metrics: Object.freeze({
            type: "object",
            properties: Object.freeze({
              requests: Object.freeze({
                type: "object",
                properties: Object.freeze({
                  total: Object.freeze({
                    type: "integer",
                    description: "Total requests processed",
                    example: 15420,
                    minimum: 0,
                  }),
                  rate: Object.freeze({
                    type: "number",
                    description: "Requests per second",
                    example: 4.28,
                    minimum: 0,
                  }),
                }),
              }),
              response_time: Object.freeze({
                type: "object",
                properties: Object.freeze({
                  avg: Object.freeze({
                    type: "number",
                    description: "Average response time in milliseconds",
                    example: 12.5,
                    minimum: 0,
                  }),
                  p95: Object.freeze({
                    type: "number",
                    description: "95th percentile response time in milliseconds",
                    example: 45.2,
                    minimum: 0,
                  }),
                }),
              }),
            }),
          }),
          circuitBreakers: this._generateCircuitBreakerDetailsSchemaImmutable(),
        }),
        description: "Service performance metrics and statistics",
      }),
      MetricsStats: Object.freeze({
        type: "object",
        required: Object.freeze(["timestamp", "message", "export_statistics", "metrics_status"]),
        properties: Object.freeze({
          timestamp: Object.freeze({
            type: "string",
            format: "date-time",
            description: "Statistics retrieval timestamp",
            example: new Date().toISOString(),
          }),
          message: Object.freeze({
            type: "string",
            description: "Status message",
            example: "Metrics statistics retrieved successfully",
          }),
          export_statistics: this._generateExportStatisticsSchemaImmutable(),
          metrics_status: Object.freeze({
            type: "object",
            properties: Object.freeze({
              total_instruments: Object.freeze({
                type: "integer",
                description: "Total number of metric instruments",
                example: 23,
                minimum: 0,
              }),
            }),
          }),
        }),
        description: "Detailed metrics export statistics and status",
      }),
    });

    this._immutableCache.set(cacheKey, schemas);
    return schemas;
  }

  private _generateExportStatisticsSchemaImmutable(): OpenAPIObject {
    const cacheKey = "exportStatsSchema";

    if (this._immutableCache.has(cacheKey)) {
      return this._immutableCache.get(cacheKey);
    }

    const schema = Object.freeze({
      type: "object",
      properties: Object.freeze({
        totalExports: Object.freeze({
          type: "integer",
          description: "Total number of metric exports",
          example: 145,
          minimum: 0,
        }),
        successCount: Object.freeze({
          type: "integer",
          description: "Number of successful exports",
          example: 143,
          minimum: 0,
        }),
        failureCount: Object.freeze({
          type: "integer",
          description: "Number of failed exports",
          example: 2,
          minimum: 0,
        }),
        successRate: Object.freeze({
          type: "number",
          description: "Export success rate percentage",
          example: 98.62,
          minimum: 0,
          maximum: 100,
        }),
        lastExportTime: Object.freeze({
          type: "string",
          format: "date-time",
          description: "Last successful export timestamp",
          example: new Date(Date.now() - 15000).toISOString(),
        }),
      }),
    });

    this._immutableCache.set(cacheKey, schema);
    return schema;
  }

  private _generateJWTExample(): string {
    const cacheKey = "jwtExample";

    if (this._immutableCache.has(cacheKey)) {
      return this._immutableCache.get(cacheKey);
    }

    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = btoa(
      JSON.stringify({
        sub: "demo_user",
        exp: Math.floor(Date.now() / 1000) + 900,
        iat: Math.floor(Date.now() / 1000),
        iss: this.config.jwt.authority,
        aud: this.config.jwt.audience,
        key: "generated-key",
      })
    );
    const example = `${header}.${payload}.signature`;

    this._immutableCache.set(cacheKey, example);
    return example;
  }

  private _objectToYamlEnhanced(obj: YamlValue, indent = 0): string {
    const spaces = "  ".repeat(indent);

    // Handle null and undefined
    if (obj === null || obj === undefined) return "null";

    // Enhanced string handling with proper YAML 1.2 compliance
    if (typeof obj === "string") {
      return this._formatYamlString(obj, spaces, indent);
    }

    // Number and boolean handling
    if (typeof obj === "number") {
      return Number.isFinite(obj) ? obj.toString() : `"${obj.toString()}"`;
    }
    if (typeof obj === "boolean") return obj.toString();

    // Enhanced array handling
    if (Array.isArray(obj)) {
      return this._formatYamlArray(obj as YamlValue[], spaces, indent);
    }

    // At this point, obj is guaranteed to be a non-null, non-array object
    // (null/undefined handled at line 1311, primitives handled above, arrays handled above)
    return this._formatYamlObject(
      obj as { readonly [key: string]: YamlValue } | { [key: string]: YamlValue },
      spaces,
      indent
    );
  }

  private _formatYamlString(str: string, spaces: string, _indent: number): string {
    // Handle empty strings
    if (str === "") return '""';

    // Multi-line strings use literal block scalar
    if (str.includes("\n")) {
      const lines = str.split("\n");
      return `|\n${lines.map((line) => `${spaces}  ${line}`).join("\n")}`;
    }

    // Check if string needs quoting based on YAML 1.2 rules
    if (this._needsQuoting(str)) {
      return `"${this._escapeYamlString(str)}"`;
    }

    return str;
  }

  private _formatYamlArray(arr: YamlValue[], spaces: string, indent: number): string {
    if (arr.length === 0) return "[]";

    // Use flow style for simple arrays
    if (this._isSimpleArray(arr)) {
      return `[${arr.map((item) => this._objectToYamlEnhanced(item, 0)).join(", ")}]`;
    }

    // Use block style for complex arrays
    return arr
      .map((item) => {
        const yamlValue = this._objectToYamlEnhanced(item, indent + 1);
        if (typeof item === "object" && !Array.isArray(item) && item !== null) {
          return `\n${spaces}-${yamlValue.startsWith("\n") ? yamlValue.replace(/\n/g, "\n ") : ` ${yamlValue}`}`;
        }
        return `\n${spaces}- ${yamlValue}`;
      })
      .join("");
  }

  private _formatYamlObject(
    obj: { readonly [key: string]: YamlValue } | { [key: string]: YamlValue },
    spaces: string,
    indent: number
  ): string {
    const entries = Object.entries(obj);
    if (entries.length === 0) return "{}";

    // Sort keys for consistent output
    const sortedEntries = entries.sort(([a], [b]) => {
      // Sort 'type' and 'required' fields first for OpenAPI consistency
      const priority = { type: 0, required: 1, properties: 2, description: 3 };
      const aPriority = priority[a as keyof typeof priority] ?? 999;
      const bPriority = priority[b as keyof typeof priority] ?? 999;

      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.localeCompare(b);
    });

    return sortedEntries
      .map(([key, value]) => {
        const yamlValue = this._objectToYamlEnhanced(value, indent + 1);
        const safeKey = this._needsQuoting(key) ? `"${this._escapeYamlString(key)}"` : key;

        if (typeof value === "object" && !Array.isArray(value) && value !== null) {
          return `\n${spaces}${safeKey}:${yamlValue.startsWith("\n") ? yamlValue : ` ${yamlValue}`}`;
        }
        return `\n${spaces}${safeKey}: ${yamlValue}`;
      })
      .join("");
  }

  private _needsQuoting(str: string): boolean {
    // YAML 1.2 indicators and special cases that need quoting
    const yamlIndicators = /^[-?:,[\]{}#&*!|>'"%@`]/;
    const yamlKeywords = /^(true|false|null|yes|no|on|off|~)$/i;
    const numericPattern = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
    const timestampPattern = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}:\d{2})?/;

    return (
      yamlIndicators.test(str) ||
      yamlKeywords.test(str) ||
      numericPattern.test(str) ||
      timestampPattern.test(str) ||
      str.includes(":") ||
      str.includes("#") ||
      str.includes("\t") ||
      str.includes("\r") ||
      str.trim() !== str
    );
  }

  private _escapeYamlString(str: string): string {
    return str
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
  }

  private _isSimpleArray(arr: YamlValue[]): boolean {
    return (
      arr.length <= 5 &&
      arr.every(
        (item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean"
      ) &&
      JSON.stringify(arr).length <= 80
    );
  }

  private _generateCircuitBreakerSummarySchemaImmutable(): OpenAPIObject {
    const cacheKey = "circuitBreakerSummarySchema";

    if (this._immutableCache.has(cacheKey)) {
      return this._immutableCache.get(cacheKey);
    }

    const schema = Object.freeze({
      type: "object",
      required: Object.freeze(["enabled", "totalBreakers", "states"]),
      properties: Object.freeze({
        enabled: Object.freeze({
          type: "boolean",
          description: "Whether circuit breaker protection is enabled",
          example: true,
        }),
        totalBreakers: Object.freeze({
          type: "integer",
          description: "Total number of circuit breakers configured",
          example: 3,
          minimum: 0,
        }),
        states: Object.freeze({
          type: "object",
          required: Object.freeze(["closed", "open", "halfOpen"]),
          properties: Object.freeze({
            closed: Object.freeze({
              type: "integer",
              description: "Number of circuit breakers in closed state (healthy)",
              example: 2,
              minimum: 0,
            }),
            open: Object.freeze({
              type: "integer",
              description: "Number of circuit breakers in open state (failing)",
              example: 0,
              minimum: 0,
            }),
            halfOpen: Object.freeze({
              type: "integer",
              description: "Number of circuit breakers in half-open state (testing)",
              example: 1,
              minimum: 0,
            }),
          }),
          description: "Circuit breaker state distribution",
        }),
      }),
      description: "Circuit breaker configuration and state summary",
    });

    this._immutableCache.set(cacheKey, schema);
    return schema;
  }

  private _generateCircuitBreakerDetailsSchemaImmutable(): OpenAPIObject {
    const cacheKey = "circuitBreakerDetailsSchema";

    if (this._immutableCache.has(cacheKey)) {
      return this._immutableCache.get(cacheKey);
    }

    const schema = Object.freeze({
      type: "object",
      additionalProperties: Object.freeze({
        type: "object",
        required: Object.freeze([
          "state",
          "failures",
          "successes",
          "timeout",
          "errorThreshold",
          "resetTimeout",
        ]),
        properties: Object.freeze({
          state: Object.freeze({
            type: "string",
            enum: Object.freeze(["closed", "open", "half-open"]),
            description: "Current circuit breaker state",
            example: "closed",
          }),
          failures: Object.freeze({
            type: "integer",
            description: "Number of consecutive failures",
            example: 0,
            minimum: 0,
          }),
          successes: Object.freeze({
            type: "integer",
            description: "Number of consecutive successes",
            example: 15,
            minimum: 0,
          }),
          timeout: Object.freeze({
            type: "integer",
            description: "Operation timeout in milliseconds",
            example: 5000,
            minimum: 0,
          }),
          errorThreshold: Object.freeze({
            type: "integer",
            description: "Failure threshold before opening circuit",
            example: 5,
            minimum: 1,
          }),
          resetTimeout: Object.freeze({
            type: "integer",
            description: "Time before attempting reset in milliseconds",
            example: 30000,
            minimum: 0,
          }),
          nextAttempt: Object.freeze({
            type: "string",
            format: "date-time",
            description: "Next attempt time when circuit is open",
            example: new Date(Date.now() + 30000).toISOString(),
          }),
        }),
        description: "Individual circuit breaker statistics and configuration",
      }),
      description: "Detailed circuit breaker statistics by operation name",
    });

    this._immutableCache.set(cacheKey, schema);
    return schema;
  }

  private _generateProfilingSchemasImmutable(): Record<string, OpenAPIObject> {
    const cacheKey = "profilingSchemas";

    if (this._immutableCache.has(cacheKey)) {
      return this._immutableCache.get(cacheKey);
    }

    const schemas = Object.freeze({
      ProfilingResponse: Object.freeze({
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
            description: "Profiling operation result message",
            example: "Profiling session started successfully",
          }),
          success: Object.freeze({
            type: "boolean",
            description: "Operation success status",
            example: true,
          }),
          sessionId: Object.freeze({
            type: "string",
            description: "Profiling session identifier",
            example: "profile-1697463842234-abc123def",
          }),
          details: Object.freeze({
            type: "object",
            description: "Additional profiling operation details",
            additionalProperties: true,
          }),
        }),
        description: "Profiling operation response",
      }),
      ProfilingStatus: Object.freeze({
        type: "object",
        required: Object.freeze(["enabled", "sessions", "outputDirectory", "autoGenerate"]),
        properties: Object.freeze({
          enabled: Object.freeze({
            type: "boolean",
            description: "Whether profiling service is enabled",
            example: true,
          }),
          sessions: Object.freeze({
            type: "array",
            items: Object.freeze({
              type: "object",
              required: Object.freeze(["id", "type", "startTime", "status"]),
              properties: Object.freeze({
                id: Object.freeze({
                  type: "string",
                  description: "Session identifier",
                  example: "profile-1697463842234-abc123def",
                }),
                type: Object.freeze({
                  type: "string",
                  enum: Object.freeze(["cpu", "heap"]),
                  description: "Profiling type",
                  example: "cpu",
                }),
                startTime: Object.freeze({
                  type: "string",
                  format: "date-time",
                  description: "Session start timestamp",
                  example: new Date().toISOString(),
                }),
                endTime: Object.freeze({
                  type: "string",
                  format: "date-time",
                  description: "Session end timestamp (if completed)",
                  example: new Date().toISOString(),
                }),
                status: Object.freeze({
                  type: "string",
                  enum: Object.freeze(["running", "stopped", "completed", "failed"]),
                  description: "Session status",
                  example: "running",
                }),
                outputFile: Object.freeze({
                  type: "string",
                  description: "Output file path (if available)",
                  example: "profiling/profile-report-1697463842234.txt",
                }),
                htmlFile: Object.freeze({
                  type: "string",
                  description: "HTML report file path (if available)",
                  example: "profiling/profile-report-1697463842234.html",
                }),
                pid: Object.freeze({
                  type: "integer",
                  description: "Process ID of profiled session",
                  example: 12345,
                  minimum: 1,
                }),
              }),
            }),
            description: "List of profiling sessions",
          }),
          outputDirectory: Object.freeze({
            type: "string",
            description: "Directory where profiling outputs are stored",
            example: "profiling",
          }),
          autoGenerate: Object.freeze({
            type: "boolean",
            description: "Whether reports are auto-generated",
            example: false,
          }),
        }),
        description: "Profiling service status and session information",
      }),
      ProfilingReports: Object.freeze({
        type: "object",
        required: Object.freeze(["timestamp", "reports"]),
        properties: Object.freeze({
          timestamp: Object.freeze({
            type: "string",
            format: "date-time",
            description: "Report retrieval timestamp",
            example: new Date().toISOString(),
          }),
          reports: Object.freeze({
            type: "array",
            items: Object.freeze({
              type: "string",
            }),
            description: "List of available profiling report file paths",
            example: Object.freeze([
              "profiling/profile-report-1697463842234.html",
              "profiling/profile-report-1697463734521.txt",
              "profiling/profile-cpu-1697463642123.cpuprofile",
            ]),
          }),
          count: Object.freeze({
            type: "integer",
            description: "Number of available reports",
            example: 3,
            minimum: 0,
          }),
        }),
        description: "List of available profiling reports and analysis files",
      }),
    });

    this._immutableCache.set(cacheKey, schemas);
    return schemas;
  }
}

export function createApiDocGenerator(): OpenAPIGenerator {
  return new OpenAPIGenerator();
}

// For backward compatibility, create instance only when explicitly requested
let _instance: OpenAPIGenerator | null = null;
export function getApiDocGenerator(): OpenAPIGenerator {
  if (!_instance) {
    _instance = new OpenAPIGenerator();
  }
  return _instance;
}
