/* src/server/types.ts */

import type { Server } from "bun";

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

// Pre-created static responses for zero-allocation
export const StaticResponses = {
  NOT_FOUND: new Response(JSON.stringify({ error: "Not Found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  }),

  METHOD_NOT_ALLOWED: new Response(JSON.stringify({ error: "Method Not Allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  }),

  TOO_MANY_REQUESTS: new Response(JSON.stringify({ error: "Too Many Requests" }), {
    status: 429,
    headers: { "Content-Type": "application/json" },
  }),

  INTERNAL_ERROR: new Response(JSON.stringify({ error: "Internal Server Error" }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  }),

  WS_UPGRADE_FAILED: new Response("WebSocket upgrade failed", {
    status: 400,
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
