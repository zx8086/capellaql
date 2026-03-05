/* tests/bun/unit/errors/problem-details.test.ts */
import { describe, expect, test } from "bun:test";
import {
  createProblemDetails,
  createProblemResponse,
  errorToProblemDetails,
  isProblemDetails,
  type ProblemDetails,
} from "../../../../src/errors/problem-details";
import { PROBLEM_TYPE_BASE } from "../../../../src/errors/error-codes";

describe("RFC 7807 Problem Details", () => {
  describe("createProblemDetails", () => {
    test("should create problem details with error code", () => {
      const problem = createProblemDetails({
        code: "DB_003",
        detail: "Document 'user::123' not found",
        instance: "/graphql",
      });

      expect(problem.type).toBe(`${PROBLEM_TYPE_BASE}/document_not_found`);
      expect(problem.title).toBe("Document Not Found");
      expect(problem.status).toBe(404);
      expect(problem.detail).toBe("Document 'user::123' not found");
      expect(problem.instance).toBe("/graphql");
      expect(problem.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    test("should create problem details with custom values", () => {
      const problem = createProblemDetails({
        type: "https://custom.example.com/errors/custom",
        title: "Custom Error",
        status: 418,
        detail: "I'm a teapot",
      });

      expect(problem.type).toBe("https://custom.example.com/errors/custom");
      expect(problem.title).toBe("Custom Error");
      expect(problem.status).toBe(418);
      expect(problem.detail).toBe("I'm a teapot");
    });

    test("should allow custom values to override code-based values", () => {
      const problem = createProblemDetails({
        code: "DB_003",
        title: "Custom Title Override",
        status: 500,
      });

      // Custom values should override code-based values
      expect(problem.title).toBe("Custom Title Override");
      expect(problem.status).toBe(500);
    });

    test("should create minimal problem details with defaults", () => {
      const problem = createProblemDetails({});

      expect(problem.type).toBe(`${PROBLEM_TYPE_BASE}/error`);
      expect(problem.title).toBe("Error");
      expect(problem.status).toBe(500);
      expect(problem.timestamp).toBeDefined();
    });

    test("should include extensions when provided", () => {
      const problem = createProblemDetails({
        code: "GQL_001",
        extensions: {
          operationName: "GetUser",
          query: "{ user(id: 1) { name } }",
        },
      });

      expect(problem.extensions).toBeDefined();
      expect(problem.extensions?.operationName).toBe("GetUser");
      expect(problem.extensions?.query).toBe("{ user(id: 1) { name } }");
    });

    test("should not include extensions when empty", () => {
      const problem = createProblemDetails({
        code: "HTTP_001",
        extensions: {},
      });

      expect(problem.extensions).toBeUndefined();
    });

    test("should include instance when provided", () => {
      const problem = createProblemDetails({
        code: "HTTP_002",
        instance: "/api/users/123",
      });

      expect(problem.instance).toBe("/api/users/123");
    });
  });

  describe("errorToProblemDetails", () => {
    test("should convert standard Error to problem details", () => {
      const error = new Error("Something went wrong");
      const problem = errorToProblemDetails(error);

      expect(problem.detail).toBe("Something went wrong");
      expect(problem.extensions?.errorName).toBe("Error");
      expect(problem.timestamp).toBeDefined();
    });

    test("should detect document not found errors", () => {
      const error = new Error("document not found");
      error.name = "DocumentNotFoundError";
      const problem = errorToProblemDetails(error);

      expect(problem.type).toBe(`${PROBLEM_TYPE_BASE}/document_not_found`);
      expect(problem.title).toBe("Document Not Found");
      expect(problem.status).toBe(404);
    });

    test("should detect timeout errors", () => {
      const error = new Error("operation timed out");
      error.name = "TimeoutError";
      const problem = errorToProblemDetails(error);

      expect(problem.type).toBe(`${PROBLEM_TYPE_BASE}/query_timeout`);
      expect(problem.status).toBe(504);
    });

    test("should detect ambiguous timeout errors", () => {
      const error = new Error("ambiguous timeout occurred");
      error.name = "AmbiguousTimeoutError";
      const problem = errorToProblemDetails(error);

      expect(problem.type).toBe(`${PROBLEM_TYPE_BASE}/ambiguous_timeout`);
      expect(problem.status).toBe(504);
    });

    test("should detect authentication errors", () => {
      const error = new Error("authentication failed");
      const problem = errorToProblemDetails(error);

      expect(problem.type).toBe(`${PROBLEM_TYPE_BASE}/authentication_failed`);
      expect(problem.status).toBe(401);
    });

    test("should detect rate limit errors", () => {
      const error = new Error("rate limit exceeded");
      const problem = errorToProblemDetails(error);

      expect(problem.type).toBe(`${PROBLEM_TYPE_BASE}/rate_limited`);
      expect(problem.status).toBe(429);
    });

    test("should detect GraphQL validation errors", () => {
      const error = new Error("validation failed for input");
      error.name = "GraphQLValidationError";
      const problem = errorToProblemDetails(error);

      expect(problem.type).toBe(`${PROBLEM_TYPE_BASE}/validation_failed`);
      expect(problem.status).toBe(400);
    });

    test("should detect GraphQL depth limit errors", () => {
      const error = new Error("query depth exceeded limit");
      error.name = "GraphQLError";
      const problem = errorToProblemDetails(error);

      expect(problem.type).toBe(`${PROBLEM_TYPE_BASE}/depth_limit_exceeded`);
      expect(problem.status).toBe(400);
    });

    test("should detect configuration errors", () => {
      const error = new Error("invalid configuration value");
      error.name = "ConfigurationError";
      const problem = errorToProblemDetails(error);

      expect(problem.type).toBe(`${PROBLEM_TYPE_BASE}/invalid_configuration`);
      expect(problem.status).toBe(500);
    });

    test("should allow options to override detected code", () => {
      const error = new Error("something happened");
      const problem = errorToProblemDetails(error, {
        code: "HTTP_001",
        instance: "/custom-path",
      });

      expect(problem.type).toBe(`${PROBLEM_TYPE_BASE}/bad_request`);
      expect(problem.instance).toBe("/custom-path");
    });

    test("should not include stack in production", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      const error = new Error("production error");
      const problem = errorToProblemDetails(error);

      expect(problem.extensions?.stack).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe("createProblemResponse", () => {
    test("should create JSON response body and headers", () => {
      const problem = createProblemDetails({
        code: "HTTP_001",
        detail: "Bad request",
      });

      const response = createProblemResponse(problem);

      expect(response.headers["Content-Type"]).toBe("application/problem+json");
      expect(typeof response.body).toBe("string");

      const parsed = JSON.parse(response.body);
      expect(parsed.type).toBe(`${PROBLEM_TYPE_BASE}/bad_request`);
      expect(parsed.title).toBe("Bad Request");
      expect(parsed.status).toBe(400);
    });

    test("should produce valid JSON body", () => {
      const problem = createProblemDetails({
        code: "DB_003",
        detail: "Document not found",
        extensions: { documentId: "user::123" },
      });

      const response = createProblemResponse(problem);

      expect(() => JSON.parse(response.body)).not.toThrow();
      const parsed = JSON.parse(response.body);
      expect(parsed.extensions.documentId).toBe("user::123");
    });
  });

  describe("isProblemDetails", () => {
    test("should return true for valid ProblemDetails object", () => {
      const problem: ProblemDetails = {
        type: "https://example.com/error",
        title: "Error",
        status: 400,
        timestamp: new Date().toISOString(),
      };

      expect(isProblemDetails(problem)).toBe(true);
    });

    test("should return true for full ProblemDetails object", () => {
      const problem: ProblemDetails = {
        type: "https://example.com/error",
        title: "Error",
        status: 400,
        timestamp: new Date().toISOString(),
        detail: "Something went wrong",
        instance: "/api/test",
        traceId: "abc123",
        extensions: { key: "value" },
      };

      expect(isProblemDetails(problem)).toBe(true);
    });

    test("should return false for null", () => {
      expect(isProblemDetails(null)).toBe(false);
    });

    test("should return false for undefined", () => {
      expect(isProblemDetails(undefined)).toBe(false);
    });

    test("should return false for non-object", () => {
      expect(isProblemDetails("string")).toBe(false);
      expect(isProblemDetails(123)).toBe(false);
      expect(isProblemDetails(true)).toBe(false);
    });

    test("should return false for object missing required fields", () => {
      expect(isProblemDetails({ type: "test" })).toBe(false);
      expect(isProblemDetails({ type: "test", title: "Test" })).toBe(false);
      expect(
        isProblemDetails({ type: "test", title: "Test", status: 400 })
      ).toBe(false);
    });

    test("should return false for object with wrong field types", () => {
      expect(
        isProblemDetails({
          type: 123,
          title: "Test",
          status: 400,
          timestamp: "2024-01-01",
        })
      ).toBe(false);
      expect(
        isProblemDetails({
          type: "test",
          title: 123,
          status: 400,
          timestamp: "2024-01-01",
        })
      ).toBe(false);
      expect(
        isProblemDetails({
          type: "test",
          title: "Test",
          status: "400",
          timestamp: "2024-01-01",
        })
      ).toBe(false);
    });
  });
});
