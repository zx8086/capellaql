/* src/lib/clusterProvider.ts */

import { err, warn } from "../telemetry/logger";
import { type capellaConn, clusterConn } from "./couchbaseConnector";

let connection: capellaConn | null = null;

export const getCluster = async (): Promise<capellaConn> => {
  try {
    if (!connection) {
      const startTime = Date.now();
      connection = await clusterConn();
      const connectionTime = Date.now() - startTime;

      // Only log slow connections
      if (connectionTime > 2000) {
        warn("Slow Couchbase connection established", {
          connectionTimeMs: connectionTime,
        });
      }
    }
    return connection;
  } catch (error: any) {
    err("Failed to establish Couchbase cluster connection", {
      error: error instanceof Error ? error.message : String(error),
      errorType: error?.constructor?.name || "unknown",
    });
    throw error;
  }
};

export const closeConnection = async (): Promise<void> => {
  if (connection) {
    try {
      // Use proper SDK v4 method to close the cluster connection
      await connection.cluster.close();
      connection = null;
    } catch (error: any) {
      err("Error closing Couchbase cluster connection", {
        error: error instanceof Error ? error.message : String(error),
        errorType: error?.constructor?.name || "unknown",
      });
      // Don't throw - let shutdown continue even if close fails
      connection = null;
    }
  }
};
