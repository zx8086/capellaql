/* tests/bun/unit/lib/queryFingerprint.test.ts */
import { describe, expect, test } from "bun:test";
import {
  QueryFingerprintBuilder,
  createBatchFingerprint,
  createPersistedQueryId,
  createQueryFingerprint,
  createSubscriptionFingerprint,
  verifyFingerprint,
} from "../../../../src/lib/queryFingerprint";

describe("Query Fingerprint", () => {
  describe("createQueryFingerprint", () => {
    test("produces deterministic fingerprints", () => {
      const fp1 = createQueryFingerprint("GetUser", { id: "1" });
      const fp2 = createQueryFingerprint("GetUser", { id: "1" });
      expect(fp1).toBe(fp2);
    });

    test("different operations produce different fingerprints", () => {
      const fp1 = createQueryFingerprint("GetUser", { id: "1" });
      const fp2 = createQueryFingerprint("GetPost", { id: "1" });
      expect(fp1).not.toBe(fp2);
    });

    test("different variables produce different fingerprints", () => {
      const fp1 = createQueryFingerprint("GetUser", { id: "1" });
      const fp2 = createQueryFingerprint("GetUser", { id: "2" });
      expect(fp1).not.toBe(fp2);
    });

    test("sorts variable keys for consistency", () => {
      const fp1 = createQueryFingerprint("Query", { a: 1, b: 2 });
      const fp2 = createQueryFingerprint("Query", { b: 2, a: 1 });
      expect(fp1).toBe(fp2);
    });

    test("includes user ID when includeUser is true", () => {
      const withUser = createQueryFingerprint("Query", {}, {
        includeUser: true,
        userId: "user-123",
      });
      const withoutUser = createQueryFingerprint("Query", {});
      expect(withUser).not.toBe(withoutUser);
    });

    test("does not include user when includeUser is false", () => {
      const fp1 = createQueryFingerprint("Query", {}, { includeUser: false, userId: "user-123" });
      const fp2 = createQueryFingerprint("Query", {});
      expect(fp1).toBe(fp2);
    });

    test("does not include user when userId is missing", () => {
      const fp1 = createQueryFingerprint("Query", {}, { includeUser: true });
      const fp2 = createQueryFingerprint("Query", {});
      expect(fp1).toBe(fp2);
    });

    test("adds prefix when specified", () => {
      const fp = createQueryFingerprint("Query", {}, { prefix: "cache" });
      expect(fp).toMatch(/^cache:/);
    });

    test("no prefix by default", () => {
      const fp = createQueryFingerprint("Query", {});
      expect(fp).not.toContain(":");
    });

    test("time bucket changes fingerprint", () => {
      // Two fingerprints with same time bucket should be equal
      const fp1 = createQueryFingerprint("Query", {}, { timeBucket: "day" });
      const fp2 = createQueryFingerprint("Query", {}, { timeBucket: "day" });
      expect(fp1).toBe(fp2);

      // With and without time bucket should differ
      const fpNoTime = createQueryFingerprint("Query", {});
      expect(fp1).not.toBe(fpNoTime);
    });

    test("handles nested variables", () => {
      const fp1 = createQueryFingerprint("Query", { filter: { name: "test", age: 25 } });
      const fp2 = createQueryFingerprint("Query", { filter: { age: 25, name: "test" } });
      expect(fp1).toBe(fp2);
    });
  });

  describe("createBatchFingerprint", () => {
    test("produces deterministic fingerprint for batch", () => {
      const ops = [
        { name: "GetUser", variables: { id: "1" } },
        { name: "GetPost", variables: { id: "2" } },
      ];
      const fp1 = createBatchFingerprint(ops);
      const fp2 = createBatchFingerprint(ops);
      expect(fp1).toBe(fp2);
    });

    test("sorts operations for consistency", () => {
      const fp1 = createBatchFingerprint([
        { name: "GetUser", variables: { id: "1" } },
        { name: "GetPost", variables: { id: "2" } },
      ]);
      const fp2 = createBatchFingerprint([
        { name: "GetPost", variables: { id: "2" } },
        { name: "GetUser", variables: { id: "1" } },
      ]);
      expect(fp1).toBe(fp2);
    });

    test("different operations produce different fingerprints", () => {
      const fp1 = createBatchFingerprint([{ name: "A", variables: {} }]);
      const fp2 = createBatchFingerprint([{ name: "B", variables: {} }]);
      expect(fp1).not.toBe(fp2);
    });
  });

  describe("createSubscriptionFingerprint", () => {
    test("produces deterministic fingerprint", () => {
      const fp1 = createSubscriptionFingerprint("user.updated", { userId: "1" });
      const fp2 = createSubscriptionFingerprint("user.updated", { userId: "1" });
      expect(fp1).toBe(fp2);
    });

    test("different topics produce different fingerprints", () => {
      const fp1 = createSubscriptionFingerprint("user.created", {});
      const fp2 = createSubscriptionFingerprint("user.updated", {});
      expect(fp1).not.toBe(fp2);
    });

    test("handles empty filters", () => {
      const fp1 = createSubscriptionFingerprint("topic");
      const fp2 = createSubscriptionFingerprint("topic", {});
      expect(fp1).toBe(fp2);
    });
  });

  describe("createPersistedQueryId", () => {
    test("normalizes whitespace", () => {
      const fp1 = createPersistedQueryId("query { user { id } }");
      const fp2 = createPersistedQueryId("query  {  user  {  id  }  }");
      expect(fp1).toBe(fp2);
    });

    test("trims leading and trailing whitespace", () => {
      const fp1 = createPersistedQueryId("query { user }");
      const fp2 = createPersistedQueryId("  query { user }  ");
      expect(fp1).toBe(fp2);
    });

    test("normalizes newlines and tabs", () => {
      const fp1 = createPersistedQueryId("query { user { id } }");
      const fp2 = createPersistedQueryId("query {\n  user {\n\t\tid\n  }\n}");
      expect(fp1).toBe(fp2);
    });

    test("different queries produce different IDs", () => {
      const fp1 = createPersistedQueryId("query { user { id } }");
      const fp2 = createPersistedQueryId("query { post { id } }");
      expect(fp1).not.toBe(fp2);
    });
  });

  describe("verifyFingerprint", () => {
    test("returns true for matching fingerprint", () => {
      const fp = createQueryFingerprint("Query", { id: "1" });
      const result = verifyFingerprint(fp, "Query", { id: "1" });
      expect(result).toBe(true);
    });

    test("returns false for non-matching fingerprint", () => {
      const fp = createQueryFingerprint("Query", { id: "1" });
      const result = verifyFingerprint(fp, "Query", { id: "2" });
      expect(result).toBe(false);
    });

    test("returns false for wrong operation name", () => {
      const fp = createQueryFingerprint("GetUser", {});
      const result = verifyFingerprint(fp, "GetPost", {});
      expect(result).toBe(false);
    });

    test("verifies with options", () => {
      const fp = createQueryFingerprint("Query", {}, { prefix: "cache" });
      const result = verifyFingerprint(fp, "Query", {}, { prefix: "cache" });
      expect(result).toBe(true);
    });
  });

  describe("QueryFingerprintBuilder", () => {
    test("creates builder with static for()", () => {
      const builder = QueryFingerprintBuilder.for("GetUser");
      expect(builder).toBeInstanceOf(QueryFingerprintBuilder);
    });

    test("build produces deterministic hash", () => {
      const fp1 = QueryFingerprintBuilder.for("Query").build();
      const fp2 = QueryFingerprintBuilder.for("Query").build();
      expect(fp1).toBe(fp2);
    });

    test("withVariables adds variables to fingerprint", () => {
      const withVars = QueryFingerprintBuilder.for("Query")
        .withVariables({ id: "1" })
        .build();
      const withoutVars = QueryFingerprintBuilder.for("Query").build();
      expect(withVars).not.toBe(withoutVars);
    });

    test("withUser adds user to fingerprint", () => {
      const withUser = QueryFingerprintBuilder.for("Query")
        .withUser("user-123")
        .build();
      const withoutUser = QueryFingerprintBuilder.for("Query").build();
      expect(withUser).not.toBe(withoutUser);
    });

    test("withPrefix prepends prefix to hash", () => {
      const fp = QueryFingerprintBuilder.for("Query")
        .withPrefix("myprefix")
        .build();
      expect(fp).toMatch(/^myprefix:/);
    });

    test("withCustom adds custom key-value", () => {
      const with_ = QueryFingerprintBuilder.for("Query")
        .withCustom("tenant", "acme")
        .build();
      const without_ = QueryFingerprintBuilder.for("Query").build();
      expect(with_).not.toBe(without_);
    });

    test("fluent API allows chaining", () => {
      const fp = QueryFingerprintBuilder.for("Query")
        .withVariables({ id: "1" })
        .withUser("user-1")
        .withPrefix("cache")
        .withCustom("version", "2")
        .build();

      expect(fp).toMatch(/^cache:/);
      expect(typeof fp).toBe("string");
    });

    test("variable key order does not affect result", () => {
      const fp1 = QueryFingerprintBuilder.for("Query")
        .withVariables({ a: 1, b: 2 })
        .build();
      const fp2 = QueryFingerprintBuilder.for("Query")
        .withVariables({ b: 2, a: 1 })
        .build();
      expect(fp1).toBe(fp2);
    });
  });
});
