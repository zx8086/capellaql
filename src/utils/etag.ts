/* src/utils/etag.ts */

const encoder = new TextEncoder();

/**
 * Generate a weak ETag from response body using SHA-256.
 * Uses Bun's native crypto for performance.
 */
export async function generateETag(body: string): Promise<string> {
  const hash = new Bun.CryptoHasher("sha256");
  hash.update(encoder.encode(body));
  const hex = hash.digest("hex");
  return `W/"${hex.slice(0, 16)}"`;
}

/**
 * Check if the client's If-None-Match header matches the current ETag.
 */
export function isETagMatch(request: Request, etag: string): boolean {
  const ifNoneMatch = request.headers.get("if-none-match");
  if (!ifNoneMatch) return false;

  // Handle multiple ETags: "etag1", "etag2"
  const tags = ifNoneMatch.split(",").map((t) => t.trim());
  return tags.includes(etag) || tags.includes("*");
}

/**
 * Wrap a JSON health response with ETag + Cache-Control headers.
 * Returns 304 Not Modified if client's ETag matches.
 *
 * @param request - The incoming request (to check If-None-Match)
 * @param data - The response data object
 * @param maxAge - Cache-Control max-age in seconds (default: 5)
 * @param status - HTTP status code (default: 200)
 */
export async function jsonResponseWithETag(
  request: Request,
  data: unknown,
  maxAge = 5,
  status = 200
): Promise<Response> {
  const body = JSON.stringify(data);
  const etag = await generateETag(body);

  // Check for conditional request
  if (isETagMatch(request, etag)) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": `public, max-age=${maxAge}`,
      },
    });
  }

  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      ETag: etag,
      "Cache-Control": `public, max-age=${maxAge}`,
    },
  });
}
