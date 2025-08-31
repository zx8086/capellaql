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
