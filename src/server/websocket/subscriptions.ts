/* src/server/websocket/subscriptions.ts */

import type { ServerWebSocket } from "bun";
import { debug, err } from "../../telemetry";
import { activeConnections } from "../middleware/logging";
import type { WebSocketData } from "../types";

/**
 * WebSocket handlers for GraphQL subscriptions.
 * These are passed directly to Bun.serve() websocket option.
 */
export const websocketHandlers = {
  /**
   * Handle incoming WebSocket message
   */
  message(ws: ServerWebSocket<WebSocketData>, message: string | Buffer) {
    try {
      const data = JSON.parse(message.toString());

      // Handle GraphQL over WebSocket protocol
      if (data.type === "connection_init") {
        ws.send(JSON.stringify({ type: "connection_ack" }));
      } else if (data.type === "start") {
        // GraphQL subscription started
        debug("GraphQL subscription started", {
          id: data.id,
          operationType: "subscription",
          requestId: ws.data.requestId,
        });
      } else if (data.type === "stop") {
        // GraphQL subscription stopped
        debug("GraphQL subscription stopped", {
          id: data.id,
          operationType: "subscription",
          requestId: ws.data.requestId,
        });
      }
    } catch (error) {
      err("WebSocket message handling error", error);
      ws.send(
        JSON.stringify({
          type: "error",
          payload: { message: "Invalid message format" },
        })
      );
    }
  },

  /**
   * Handle WebSocket connection open
   */
  open(ws: ServerWebSocket<WebSocketData>) {
    activeConnections.add(1);
    debug("WebSocket connection opened", {
      requestId: ws.data.requestId,
      clientIp: ws.data.clientIp,
    });
  },

  /**
   * Handle WebSocket connection close
   */
  close(ws: ServerWebSocket<WebSocketData>, code: number, reason: string) {
    activeConnections.add(-1);
    debug("WebSocket connection closed", {
      requestId: ws.data.requestId,
      code,
      reason,
      connectionDuration: Date.now() - ws.data.connectedAt,
    });
  },

  /**
   * Handle WebSocket error
   */
  error(ws: ServerWebSocket<WebSocketData>, error: Error) {
    err("WebSocket connection error", error, {
      connectionType: "websocket",
      requestId: ws.data.requestId,
    });
  },
};

/**
 * Check if request should be upgraded to WebSocket
 */
export function shouldUpgradeWebSocket(request: Request): boolean {
  const upgrade = request.headers.get("upgrade");
  const url = new URL(request.url);

  return upgrade?.toLowerCase() === "websocket" && url.pathname === "/graphql";
}
