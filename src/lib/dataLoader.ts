/* src/lib/dataLoader.ts */

import {
  AmbiguousTimeoutError,
  AuthenticationFailureError,
  CouchbaseError,
  DocumentLockedError,
  DocumentNotFoundError,
  RateLimitedError,
  ServiceNotAvailableError,
  TemporaryFailureError,
} from "couchbase";
import DataLoader from "dataloader";
import { getCluster } from "$lib/clusterProvider";
import { CouchbaseErrorHandler } from "$lib/couchbaseErrorHandler";
import { debug, error as err, log } from "../telemetry/logger";

// Key type for identifying documents
export interface CollectionKey {
  bucket: string;
  scope: string;
  collection: string;
  key: string;
}

// Result type for batched document fetching
export interface DocumentResult {
  bucket: string;
  scope: string;
  collection: string;
  data: { id: string; [key: string]: any } | null;
  timeTaken: number;
  error?: string;
}

/**
 * Batch function for DataLoader - fetches multiple documents efficiently
 */
async function batchGetDocuments(keys: readonly CollectionKey[]): Promise<DocumentResult[]> {
  const startTime = Date.now();

  try {
    const connection = await CouchbaseErrorHandler.executeWithRetry(
      async () => await getCluster(),
      CouchbaseErrorHandler.createConnectionOperationContext("getCluster")
    );
    const results: DocumentResult[] = [];

    // Group keys by collection for efficient batching
    const keysByCollection = new Map<string, CollectionKey[]>();

    for (const key of keys) {
      const collectionId = `${key.bucket}.${key.scope}.${key.collection}`;
      if (!keysByCollection.has(collectionId)) {
        keysByCollection.set(collectionId, []);
      }
      keysByCollection.get(collectionId)?.push(key);
    }

    log("DataLoader batch operation", {
      totalKeys: keys.length,
      collections: keysByCollection.size,
      keysByCollection: Array.from(keysByCollection.entries()).map(([id, keys]) => ({
        collection: id,
        keyCount: keys.length,
      })),
    });

    // Process each collection's keys in parallel
    const collectionPromises = Array.from(keysByCollection.entries()).map(async ([collectionId, collectionKeys]) => {
      const [bucket, scope, collection] = collectionId.split(".");

      try {
        const collectionRef = connection.collection(bucket, scope, collection);

        // Execute all gets for this collection in parallel
        const keyPromises = collectionKeys.map(async (keyInfo) => {
          const keyStartTime = Date.now();

          try {
            if (!keyInfo.key.trim()) {
              return {
                bucket: keyInfo.bucket,
                scope: keyInfo.scope,
                collection: keyInfo.collection,
                data: null,
                timeTaken: 0,
              };
            }

            const result = await CouchbaseErrorHandler.executeWithRetry(
              async () => await collectionRef.get(keyInfo.key),
              CouchbaseErrorHandler.createDocumentOperationContext(
                "get",
                keyInfo.bucket,
                keyInfo.scope,
                keyInfo.collection,
                keyInfo.key
              ),
              2 // Limit retries for individual document gets
            );
            const timeTaken = Date.now() - keyStartTime;

            return {
              bucket: keyInfo.bucket,
              scope: keyInfo.scope,
              collection: keyInfo.collection,
              data: { id: keyInfo.key, ...result.content },
              timeTaken,
            };
          } catch (error) {
            const timeTaken = Date.now() - keyStartTime;
            const classification = CouchbaseErrorHandler.classifyError(error);

            // Handle specific error types with proper classification
            if (error instanceof DocumentNotFoundError) {
              return {
                bucket: keyInfo.bucket,
                scope: keyInfo.scope,
                collection: keyInfo.collection,
                data: null,
                timeTaken,
              };
            } else if (error instanceof AuthenticationFailureError) {
              // Critical authentication errors - don't retry, but return error info
              err("Authentication/Permission error in DataLoader", {
                errorType: error.constructor.name,
                keyInfo,
                classification,
              });
              return {
                bucket: keyInfo.bucket,
                scope: keyInfo.scope,
                collection: keyInfo.collection,
                data: null,
                timeTaken,
                error: `Access denied: ${error.message}`,
              };
            } else if (error instanceof AmbiguousTimeoutError) {
              // Ambiguous operations need special logging
              err("Ambiguous timeout in DataLoader - manual investigation required", {
                keyInfo,
                errorMessage: error.message,
                requiresInvestigation: true,
              });
              return {
                bucket: keyInfo.bucket,
                scope: keyInfo.scope,
                collection: keyInfo.collection,
                data: null,
                timeTaken,
                error: `Ambiguous timeout: ${error.message}`,
              };
            } else if (
              error instanceof TemporaryFailureError ||
              error instanceof ServiceNotAvailableError ||
              error instanceof RateLimitedError
            ) {
              // These errors are retryable but may have failed after retries
              debug("Retryable error occurred in DataLoader", {
                errorType: error.constructor.name,
                keyInfo,
                classification,
              });
              return {
                bucket: keyInfo.bucket,
                scope: keyInfo.scope,
                collection: keyInfo.collection,
                data: null,
                timeTaken,
                error: `Service error: ${error.message}`,
              };
            } else if (error instanceof DocumentLockedError) {
              // Document locked - could retry but limit attempts
              return {
                bucket: keyInfo.bucket,
                scope: keyInfo.scope,
                collection: keyInfo.collection,
                data: null,
                timeTaken,
                error: `Document locked: ${error.message}`,
              };
            } else if (error instanceof CouchbaseError) {
              return {
                bucket: keyInfo.bucket,
                scope: keyInfo.scope,
                collection: keyInfo.collection,
                data: null,
                timeTaken,
                error: `Couchbase error: ${error.message}`,
              };
            } else {
              err("Unexpected error in DataLoader", {
                error: error.message,
                keyInfo,
                errorType: error.constructor.name,
              });
              return {
                bucket: keyInfo.bucket,
                scope: keyInfo.scope,
                collection: keyInfo.collection,
                data: null,
                timeTaken,
                error: "Unexpected error occurred",
              };
            }
          }
        });

        return await Promise.all(keyPromises);
      } catch (error) {
        err(`Error processing collection ${collectionId}:`, error);

        // Return error results for all keys in this collection
        return collectionKeys.map((keyInfo) => ({
          bucket: keyInfo.bucket,
          scope: keyInfo.scope,
          collection: keyInfo.collection,
          data: null,
          timeTaken: Date.now() - startTime,
          error: "Collection processing failed",
        }));
      }
    });

    // Wait for all collections to complete
    const collectionResults = await Promise.all(collectionPromises);

    // Flatten results and maintain order matching input keys
    const flatResults = collectionResults.flat();

    // Ensure results are in the same order as input keys
    for (const inputKey of keys) {
      const result = flatResults.find(
        (r) =>
          r.bucket === inputKey.bucket &&
          r.scope === inputKey.scope &&
          r.collection === inputKey.collection &&
          (r.data?.id === inputKey.key || (!r.data && !inputKey.key.trim()))
      );

      if (result) {
        results.push(result);
      } else {
        // Fallback if somehow we can't find the result
        results.push({
          bucket: inputKey.bucket,
          scope: inputKey.scope,
          collection: inputKey.collection,
          data: null,
          timeTaken: Date.now() - startTime,
          error: "Result not found in batch processing",
        });
      }
    }

    const totalTime = Date.now() - startTime;

    debug("DataLoader batch completed", {
      totalKeys: keys.length,
      totalTime,
      successful: results.filter((r) => r.data && !r.error).length,
      notFound: results.filter((r) => !r.data && !r.error).length,
      errors: results.filter((r) => r.error).length,
    });

    return results;
  } catch (error) {
    err("DataLoader batch operation failed:", error);

    // Return error results for all keys
    return keys.map((key) => ({
      bucket: key.bucket,
      scope: key.scope,
      collection: key.collection,
      data: null,
      timeTaken: Date.now() - startTime,
      error: "Batch operation failed",
    }));
  }
}

/**
 * Create a DataLoader instance for document fetching
 */
export function createDocumentDataLoader(): DataLoader<CollectionKey, DocumentResult> {
  return new DataLoader(batchGetDocuments, {
    // Cache results per request
    cache: true,
    // Maximum batch size
    maxBatchSize: 100,
    // Use immediate batching to avoid lingering timers during shutdown
    batchScheduleFn: (callback) => process.nextTick(callback),
  });
}

/**
 * Helper function to batch load documents using DataLoader
 */
export async function batchLoadDocuments(
  collections: Array<{ bucket: string; scope: string; collection: string }>,
  keys: string[],
  dataLoader: DataLoader<CollectionKey, DocumentResult>
): Promise<DocumentResult[]> {
  // Create all combinations of collections and keys
  const collectionKeys: CollectionKey[] = [];

  for (const key of keys) {
    for (const { bucket, scope, collection } of collections) {
      collectionKeys.push({
        bucket,
        scope,
        collection,
        key,
      });
    }
  }

  log("Batch loading documents", {
    collections: collections.length,
    keys: keys.length,
    totalRequests: collectionKeys.length,
  });

  // Use DataLoader to efficiently batch and cache requests
  return (await dataLoader.loadMany(collectionKeys)) as DocumentResult[];
}
