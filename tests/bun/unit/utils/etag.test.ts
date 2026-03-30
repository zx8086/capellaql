/* tests/bun/unit/utils/etag.test.ts */
import { describe, expect, test } from "bun:test";
import { generateETag, isETagMatch, jsonResponseWithETag } from "../../../../src/utils/etag";

describe("ETag Utilities", () => {
  describe("generateETag", () => {
    test("produces weak ETag format", async () => {
      const etag = await generateETag('{"status":"ok"}');
      expect(etag).toMatch(/^W\/"[a-f0-9]{16}"$/);
    });

    test("produces deterministic output", async () => {
      const body = '{"data":"test"}';
      const etag1 = await generateETag(body);
      const etag2 = await generateETag(body);
      expect(etag1).toBe(etag2);
    });

    test("different inputs produce different ETags", async () => {
      const etag1 = await generateETag('{"a":1}');
      const etag2 = await generateETag('{"a":2}');
      expect(etag1).not.toBe(etag2);
    });

    test("handles empty string", async () => {
      const etag = await generateETag("");
      expect(etag).toMatch(/^W\/"[a-f0-9]{16}"$/);
    });
  });

  describe("isETagMatch", () => {
    test("returns false when no If-None-Match header", () => {
      const request = new Request("http://localhost/test");
      expect(isETagMatch(request, 'W/"abc123"')).toBe(false);
    });

    test("returns true when ETag matches", () => {
      const request = new Request("http://localhost/test", {
        headers: { "If-None-Match": 'W/"abc123"' },
      });
      expect(isETagMatch(request, 'W/"abc123"')).toBe(true);
    });

    test("returns false when ETag does not match", () => {
      const request = new Request("http://localhost/test", {
        headers: { "If-None-Match": 'W/"abc123"' },
      });
      expect(isETagMatch(request, 'W/"different"')).toBe(false);
    });

    test("matches wildcard *", () => {
      const request = new Request("http://localhost/test", {
        headers: { "If-None-Match": "*" },
      });
      expect(isETagMatch(request, 'W/"anything"')).toBe(true);
    });

    test("handles multiple ETags in If-None-Match", () => {
      const request = new Request("http://localhost/test", {
        headers: { "If-None-Match": 'W/"first", W/"second", W/"third"' },
      });
      expect(isETagMatch(request, 'W/"second"')).toBe(true);
      expect(isETagMatch(request, 'W/"fourth"')).toBe(false);
    });
  });

  describe("jsonResponseWithETag", () => {
    test("returns 200 with JSON body and ETag header", async () => {
      const request = new Request("http://localhost/test");
      const data = { status: "healthy" };

      const response = await jsonResponseWithETag(request, data);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(response.headers.get("ETag")).toMatch(/^W\/"[a-f0-9]{16}"$/);
      expect(response.headers.get("Cache-Control")).toBe("public, max-age=5");

      const body = await response.json();
      expect(body).toEqual({ status: "healthy" });
    });

    test("returns 304 when ETag matches If-None-Match", async () => {
      const data = { status: "healthy" };
      const body = JSON.stringify(data);
      const etag = await generateETag(body);

      const request = new Request("http://localhost/test", {
        headers: { "If-None-Match": etag },
      });

      const response = await jsonResponseWithETag(request, data);

      expect(response.status).toBe(304);
      expect(response.headers.get("ETag")).toBe(etag);
      expect(await response.text()).toBe("");
    });

    test("uses custom maxAge", async () => {
      const request = new Request("http://localhost/test");
      const response = await jsonResponseWithETag(request, { data: 1 }, 60);

      expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
    });

    test("uses custom status code", async () => {
      const request = new Request("http://localhost/test");
      const response = await jsonResponseWithETag(request, { status: "degraded" }, 5, 503);

      expect(response.status).toBe(503);
    });

    test("default maxAge is 5 seconds", async () => {
      const request = new Request("http://localhost/test");
      const response = await jsonResponseWithETag(request, {});

      expect(response.headers.get("Cache-Control")).toBe("public, max-age=5");
    });
  });
});
