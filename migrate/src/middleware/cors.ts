// src/middleware/cors.ts

// Stryker disable all: CORS middleware with header configuration.
// Tested via E2E tests with actual browser requests.

import { addCorsHeadersToResponse, getCorsHeaders } from "../utils/cors";

export function handleOptionsRequest(): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(true), // Include max-age for preflight
  });
}

export function addCorsHeaders(response: Response): Response {
  return addCorsHeadersToResponse(response);
}
