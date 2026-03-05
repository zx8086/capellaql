// src/utils/cors.ts

import { loadConfig } from "../config/index";

const config = loadConfig();

/**
 * Get CORS headers for responses.
 * @param includeMaxAge - Include Access-Control-Max-Age header (for preflight/OPTIONS requests)
 * @returns Record of CORS headers
 */
export function getCorsHeaders(includeMaxAge = false): Record<string, string> {
  const cors = config.apiInfo.cors;
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": cors.origin,
    "Access-Control-Allow-Headers": cors.allowHeaders.join(", "),
    "Access-Control-Allow-Methods": cors.allowMethods.join(", "),
  };

  if (includeMaxAge) {
    headers["Access-Control-Max-Age"] = String(cors.maxAge);
  }

  return headers;
}

/**
 * Add CORS headers to an existing Response object.
 * @param response - Response to add headers to
 * @returns The modified Response
 */
export function addCorsHeadersToResponse(response: Response): Response {
  const corsHeaders = getCorsHeaders();
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}
