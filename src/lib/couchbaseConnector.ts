/* src/lib/couchbaseConnector.ts */

import config from "$config";
import { log, error as err } from "../telemetry/logger";
import {
  Cluster,
  Bucket,
  Scope,
  Collection,
  connect,
  type QueryOptions,
  QueryResult,
  StreamableRowPromise,
  QueryMetaData,
  DocumentNotFoundError,
  CouchbaseError,
} from "couchbase";

interface QueryableCluster extends Cluster {
  query<TRow = any>(
    statement: string,
    options?: QueryOptions,
  ): StreamableRowPromise<QueryResult<TRow>, TRow, QueryMetaData>;
}

export interface capellaConn {
  cluster: QueryableCluster;
  bucket: (name: string) => Bucket;
  scope: (bucket: string, name: string) => Scope;
  collection: (bucket: string, scope: string, name: string) => Collection;
  defaultBucket: Bucket;
  defaultScope: Scope;
  defaultCollection: Collection;
  errors: {
    DocumentNotFoundError: typeof DocumentNotFoundError;
    CouchbaseError: typeof CouchbaseError;
  };
}

export async function clusterConn(): Promise<capellaConn> {
  log("Attempting to connect to Couchbase...");
  try {
    const clusterConnStr: string = config.capella.COUCHBASE_URL;
    const username: string = config.capella.COUCHBASE_USERNAME;
    const password: string = config.capella.COUCHBASE_PASSWORD;
    const bucketName: string = config.capella.COUCHBASE_BUCKET;
    const scopeName: string = config.capella.COUCHBASE_SCOPE;
    const collectionName: string = config.capella.COUCHBASE_COLLECTION;

    log(`Configuring connection with the following default connection details:
                    URL: ${clusterConnStr},
                    Username: ${username},
                    Bucket: ${bucketName},
                    Scope: ${scopeName},
                    Collection: ${collectionName}`);

    const cluster: QueryableCluster = await connect(clusterConnStr, {
      username: username,
      password: password,
    });
    log("Cluster connection established.");

    const bucket: Bucket = cluster.bucket(bucketName);
    log(`Bucket ${bucketName} accessed.`);

    const scope: Scope = bucket.scope(scopeName);
    const collection: Collection = scope.collection(collectionName);
    log(`Collection ${collectionName} accessed under scope ${scopeName}.`);

    return {
      cluster,
      bucket: (name: string) => cluster.bucket(name),
      scope: (bucket: string, name: string) =>
        cluster.bucket(bucket).scope(name),
      collection: (bucket: string, scope: string, name: string) =>
        cluster.bucket(bucket).scope(scope).collection(name),
      defaultBucket: bucket,
      defaultScope: scope,
      defaultCollection: collection,
      errors: {
        DocumentNotFoundError,
        CouchbaseError,
      },
    };
  } catch (error) {
    err("Couchbase connection failed:", error);
    throw error;
  }
}
