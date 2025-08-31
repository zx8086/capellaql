/* src/lib/clusterProvider.ts */

import { log, error as err } from "../telemetry/logger";
import { clusterConn, type capellaConn } from "./couchbaseConnector";

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
