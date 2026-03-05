/* tests/bun/unit/errors/error-codes.test.ts */
import { describe, expect, test } from "bun:test";
import {
  ErrorCodes,
  ErrorStatusCodes,
  ErrorTitles,
  PROBLEM_TYPE_BASE,
  getErrorTypeUri,
  type ErrorCode,
} from "../../../../src/errors/error-codes";

describe("Error Codes Registry", () => {
  describe("PROBLEM_TYPE_BASE", () => {
    test("should be a valid HTTPS URL", () => {
      expect(PROBLEM_TYPE_BASE).toMatch(/^https:\/\//);
      expect(PROBLEM_TYPE_BASE).toBe("https://capellaql.tommy.com/errors");
    });
  });

  describe("ErrorCodes", () => {
    test("should have database error codes (DB_0xx)", () => {
      expect(ErrorCodes.DB_001).toBe("connection_failed");
      expect(ErrorCodes.DB_002).toBe("query_timeout");
      expect(ErrorCodes.DB_003).toBe("document_not_found");
      expect(ErrorCodes.DB_004).toBe("authentication_failed");
      expect(ErrorCodes.DB_005).toBe("bucket_not_found");
      expect(ErrorCodes.DB_006).toBe("collection_not_found");
      expect(ErrorCodes.DB_007).toBe("cas_mismatch");
      expect(ErrorCodes.DB_008).toBe("transaction_failed");
      expect(ErrorCodes.DB_009).toBe("ambiguous_timeout");
      expect(ErrorCodes.DB_010).toBe("rate_limited");
    });

    test("should have GraphQL error codes (GQL_0xx)", () => {
      expect(ErrorCodes.GQL_001).toBe("invalid_query");
      expect(ErrorCodes.GQL_002).toBe("depth_limit_exceeded");
      expect(ErrorCodes.GQL_003).toBe("validation_failed");
      expect(ErrorCodes.GQL_004).toBe("resolver_error");
      expect(ErrorCodes.GQL_005).toBe("subscription_error");
    });

    test("should have configuration error codes (CONFIG_0xx)", () => {
      expect(ErrorCodes.CONFIG_001).toBe("invalid_configuration");
      expect(ErrorCodes.CONFIG_002).toBe("missing_required_field");
      expect(ErrorCodes.CONFIG_003).toBe("invalid_value");
      expect(ErrorCodes.CONFIG_004).toBe("health_check_failed");
    });

    test("should have cache error codes (CACHE_0xx)", () => {
      expect(ErrorCodes.CACHE_001).toBe("cache_unavailable");
      expect(ErrorCodes.CACHE_002).toBe("cache_write_failed");
      expect(ErrorCodes.CACHE_003).toBe("cache_read_failed");
    });

    test("should have authentication error codes (AUTH_0xx)", () => {
      expect(ErrorCodes.AUTH_001).toBe("unauthorized");
      expect(ErrorCodes.AUTH_002).toBe("forbidden");
      expect(ErrorCodes.AUTH_003).toBe("token_expired");
      expect(ErrorCodes.AUTH_004).toBe("invalid_token");
    });

    test("should have HTTP error codes (HTTP_0xx)", () => {
      expect(ErrorCodes.HTTP_001).toBe("bad_request");
      expect(ErrorCodes.HTTP_002).toBe("not_found");
      expect(ErrorCodes.HTTP_003).toBe("method_not_allowed");
      expect(ErrorCodes.HTTP_004).toBe("internal_server_error");
      expect(ErrorCodes.HTTP_005).toBe("service_unavailable");
      expect(ErrorCodes.HTTP_006).toBe("gateway_timeout");
    });

    test("should have telemetry error codes (OTEL_0xx)", () => {
      expect(ErrorCodes.OTEL_001).toBe("export_failed");
      expect(ErrorCodes.OTEL_002).toBe("circuit_breaker_open");
      expect(ErrorCodes.OTEL_003).toBe("memory_pressure");
    });
  });

  describe("getErrorTypeUri", () => {
    test("should return full URI for error code", () => {
      expect(getErrorTypeUri("DB_001")).toBe(
        "https://capellaql.tommy.com/errors/connection_failed"
      );
      expect(getErrorTypeUri("HTTP_002")).toBe(
        "https://capellaql.tommy.com/errors/not_found"
      );
    });

    test("should generate unique URIs for all error codes", () => {
      const codes = Object.keys(ErrorCodes) as ErrorCode[];
      const uris = codes.map(getErrorTypeUri);
      const uniqueUris = new Set(uris);
      expect(uniqueUris.size).toBe(codes.length);
    });
  });

  describe("ErrorStatusCodes", () => {
    test("should have correct HTTP status for database errors", () => {
      expect(ErrorStatusCodes.DB_001).toBe(503); // connection_failed
      expect(ErrorStatusCodes.DB_002).toBe(504); // query_timeout
      expect(ErrorStatusCodes.DB_003).toBe(404); // document_not_found
      expect(ErrorStatusCodes.DB_004).toBe(401); // authentication_failed
      expect(ErrorStatusCodes.DB_007).toBe(409); // cas_mismatch
      expect(ErrorStatusCodes.DB_010).toBe(429); // rate_limited
    });

    test("should have correct HTTP status for GraphQL errors", () => {
      expect(ErrorStatusCodes.GQL_001).toBe(400);
      expect(ErrorStatusCodes.GQL_002).toBe(400);
      expect(ErrorStatusCodes.GQL_003).toBe(400);
      expect(ErrorStatusCodes.GQL_004).toBe(500);
      expect(ErrorStatusCodes.GQL_005).toBe(500);
    });

    test("should have correct HTTP status for auth errors", () => {
      expect(ErrorStatusCodes.AUTH_001).toBe(401);
      expect(ErrorStatusCodes.AUTH_002).toBe(403);
      expect(ErrorStatusCodes.AUTH_003).toBe(401);
      expect(ErrorStatusCodes.AUTH_004).toBe(401);
    });

    test("should have status codes for all error codes", () => {
      const codes = Object.keys(ErrorCodes) as ErrorCode[];
      for (const code of codes) {
        expect(ErrorStatusCodes[code]).toBeDefined();
        expect(typeof ErrorStatusCodes[code]).toBe("number");
        expect(ErrorStatusCodes[code]).toBeGreaterThanOrEqual(400);
        expect(ErrorStatusCodes[code]).toBeLessThan(600);
      }
    });
  });

  describe("ErrorTitles", () => {
    test("should have human-readable titles for all error codes", () => {
      expect(ErrorTitles.DB_001).toBe("Database Connection Failed");
      expect(ErrorTitles.DB_003).toBe("Document Not Found");
      expect(ErrorTitles.GQL_001).toBe("Invalid GraphQL Query");
      expect(ErrorTitles.AUTH_001).toBe("Unauthorized");
      expect(ErrorTitles.HTTP_004).toBe("Internal Server Error");
    });

    test("should have titles for all error codes", () => {
      const codes = Object.keys(ErrorCodes) as ErrorCode[];
      for (const code of codes) {
        expect(ErrorTitles[code]).toBeDefined();
        expect(typeof ErrorTitles[code]).toBe("string");
        expect(ErrorTitles[code].length).toBeGreaterThan(0);
      }
    });
  });
});
