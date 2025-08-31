/* src/lib/clusterProvider.ts */

import { error as err, log } from "../telemetry/logger";
import { type capellaConn, clusterConn } from "./couchbaseConnector";

let connection: capellaConn | null = null;

export const getCluster = async (): Promise<capellaConn> => {
  try {
    if (!connection) {
      connection = await clusterConn();
      log("Connection to Couchbase established successfully.");
    }
    return connection;
  } catch (error: any) {
    err("Error connecting to Couchbase:", error);
    throw error;
  }
};

export const closeConnection = async (): Promise<void> => {
  if (connection) {
    try {
      // Use proper SDK v4 method to close the cluster connection
      await connection.cluster.close();
      connection = null;
      log("Couchbase cluster connection closed gracefully");
    } catch (error: any) {
      err("Error closing Couchbase connection", error);
      // Don't throw - let shutdown continue even if close fails
    }
  }
};
