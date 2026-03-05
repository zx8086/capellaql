/* src/server/types.ts */

import type { Server } from "bun";
import { createProblemDetails, createProblemResponse } from "../errors";

export interface RequestContext {
  requestId: string;
  startTime: number;
  clientIp: string;
  url: URL;
  headers: Headers;
  method: string;
}

export type RouteHandler = (request: Request, context: RequestContext, server?: Server) => Response | Promise<Response>;

export type Middleware = (
  request: Request,
  context: RequestContext,
  next: () => Promise<Response>
) => Promise<Response>;

export interface MiddlewareResult {
  response?: Response;
  continue: boolean;
}

export interface ServerConfig {
  port: number;
  idleTimeout?: number;
  development?: boolean;
}

export interface WebSocketData {
  requestId: string;
  clientIp: string;
  connectedAt: number;
}

// RFC 7807 Problem Details responses (pre-created for efficiency)
const notFoundProblem = createProblemResponse(
  createProblemDetails({ code: "HTTP_002", detail: "The requested resource was not found" })
);

const methodNotAllowedProblem = createProblemResponse(
  createProblemDetails({ code: "HTTP_003", detail: "The HTTP method is not allowed for this resource" })
);

const tooManyRequestsProblem = createProblemResponse(
  createProblemDetails({ code: "DB_010", detail: "Rate limit exceeded. Please try again later." })
);

const internalErrorProblem = createProblemResponse(
  createProblemDetails({ code: "HTTP_004", detail: "An unexpected error occurred" })
);

const badRequestProblem = createProblemResponse(
  createProblemDetails({ code: "HTTP_001", detail: "WebSocket upgrade failed" })
);

/**
 * Factory function for 405 Method Not Allowed responses with RFC 9110 Allow header.
 * Unlike the static StaticResponses.METHOD_NOT_ALLOWED, this includes the required
 * Allow header listing permitted methods for the requested resource.
 */
export function createMethodNotAllowed(allowed: string[]): Response {
  const problem = createProblemResponse(
    createProblemDetails({
      code: "HTTP_003",
      detail: `The HTTP method is not allowed for this resource. Allowed methods: ${allowed.join(", ")}`,
    })
  );
  return new Response(problem.body, {
    status: 405,
    headers: {
      ...problem.headers,
      Allow: allowed.join(", "),
    },
  });
}

// Pre-created static responses using RFC 7807 Problem Details format
export const StaticResponses = {
  NOT_FOUND: new Response(notFoundProblem.body, {
    status: 404,
    headers: notFoundProblem.headers,
  }),

  METHOD_NOT_ALLOWED: new Response(methodNotAllowedProblem.body, {
    status: 405,
    headers: methodNotAllowedProblem.headers,
  }),

  TOO_MANY_REQUESTS: new Response(tooManyRequestsProblem.body, {
    status: 429,
    headers: tooManyRequestsProblem.headers,
  }),

  INTERNAL_ERROR: new Response(internalErrorProblem.body, {
    status: 500,
    headers: internalErrorProblem.headers,
  }),

  WS_UPGRADE_FAILED: new Response(badRequestProblem.body, {
    status: 400,
    headers: badRequestProblem.headers,
  }),

  // CORS preflight (zero-allocation)
  OPTIONS: new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  }),
} as const;
