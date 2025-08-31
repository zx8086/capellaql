/* src/graphql/resolvers/documentSearch.ts */

import { log, err, createCouchbaseSearchSpan } from "../../telemetry";
import { getCluster } from "$lib/clusterProvider";

interface SearchResult {
  bucket: string;
  scope: string;
  collection: string;
  data: { id: string; [key: string]: any } | null;
  timeTaken: number;
  error?: string;
}

const documentSearch = {
  Query: {
    searchDocuments: async (
      _: unknown,
      args: {
        collections: { bucket: string; scope: string; collection: string }[];
        keys: string[];
      },
    ): Promise<SearchResult[]> => {
      const { collections, keys } = args;
      
      return await createCouchbaseSearchSpan(collections, keys, async () => {
        try {
          const connection = await getCluster();
          const results: SearchResult[] = [];

          for (const key of keys) {
            for (const { bucket, scope, collection } of collections) {
              const start = Date.now();

              if (!key.trim()) {
                log(`Skipping empty key for ${bucket}.${scope}.${collection}`);
                results.push({
                  bucket,
                  scope,
                  collection,
                  data: null,
                  timeTaken: 0,
                });
                continue;
              }

              log("Fetching document using K/V operation", {
                bucket,
                scope,
                collection,
                key,
              });

              try {
                const collectionRef = connection.collection(
                  bucket,
                  scope,
                  collection,
                );
                const result = await collectionRef.get(key);
                const timeTaken = Date.now() - start;

                results.push({
                  bucket,
                  scope,
                  collection,
                  data: { id: key, ...result.content },
                  timeTaken,
                });

                log(
                  `Time taken to fetch document from ${bucket}.${scope}.${collection}: ${timeTaken}ms`,
                );
              } catch (error) {
                if (error instanceof connection.errors.DocumentNotFoundError) {
                  log(
                    `Document with key ${key} not found in ${bucket}.${scope}.${collection}`,
                  );
                  results.push({
                    bucket,
                    scope,
                    collection,
                    data: null,
                    timeTaken: Date.now() - start,
                  });
                } else if (error instanceof connection.errors.CouchbaseError) {
                  err(
                    `Couchbase error fetching document with key ${key} from ${bucket}.${scope}.${collection}:`,
                    error,
                  );
                  results.push({
                    bucket,
                    scope,
                    collection,
                    data: null,
                    timeTaken: Date.now() - start,
                    error: error.message,
                  });
                } else {
                  err(
                    `Unexpected error fetching document with key ${key} from ${bucket}.${scope}.${collection}:`,
                    error,
                  );
                  results.push({
                    bucket,
                    scope,
                    collection,
                    data: null,
                    timeTaken: Date.now() - start,
                    error: "Unexpected error occurred",
                  });
                }
              }
            }
          }

          return results;
        } catch (error) {
          err("Error in document search:", error);
          throw error;
        }
      });
    },
  },
};

export default documentSearch;
