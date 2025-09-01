/* src/graphql/resolvers/documentSearch.ts */

import { SQLiteCacheKeys, withSQLiteCache } from "$lib/bunSQLiteCache";
import { batchLoadDocuments } from "$lib/dataLoader";
import { createCouchbaseSearchSpan, err, log } from "../../telemetry";
import type { GraphQLContext } from "../context";
import { type DocumentSearchArgs, DocumentSearchArgsSchema, withValidation } from "../validation/schemas";

interface SearchResult {
  bucket: string;
  scope: string;
  collection: string;
  data: { id: string; [key: string]: any } | null;
  timeTaken: number;
  error?: string;
}

/**
 * Enhanced document search resolver with DataLoader and validation
 */
const searchDocumentsResolver = withValidation(
  DocumentSearchArgsSchema,
  async (_: unknown, args: DocumentSearchArgs, context: GraphQLContext): Promise<SearchResult[]> => {
    const { collections, keys } = args;

    // Create cache key based on collections and keys
    const cacheKey = SQLiteCacheKeys.documentSearch(
      collections.map((c) => `${c.bucket}.${c.scope}.${c.collection}`).join(","),
      keys.join(","),
      keys.length
    );

    log("Document search initiated", {
      requestId: context.requestId,
      collections: collections.length,
      keys: keys.length,
      useDataLoader: !!context.dataLoader,
    });

    return await withSQLiteCache(
      cacheKey,
      async () => {
        return await createCouchbaseSearchSpan(collections, keys, async () => {
          try {
            // Use DataLoader for efficient batching
            const startTime = Date.now();
            const batchResults = await batchLoadDocuments(collections, keys, context.dataLoader);
            const totalTime = Date.now() - startTime;

            // Transform DataLoader results to SearchResult format
            const results: SearchResult[] = batchResults.map((result) => ({
              bucket: result.bucket,
              scope: result.scope,
              collection: result.collection,
              data: result.data,
              timeTaken: result.timeTaken,
              error: result.error,
            }));

            log("DataLoader batch operation completed", {
              requestId: context.requestId,
              totalTime,
              successful: results.filter((r) => r.data && !r.error).length,
              notFound: results.filter((r) => !r.data && !r.error).length,
              errors: results.filter((r) => r.error).length,
            });

            return results;
          } catch (error) {
            err("Error in document search:", { error, requestId: context.requestId });
            throw error;
          }
        });
      },
      2 * 60 * 1000 // 2-minute TTL for search results
    );
  }
);

const documentSearch = {
  Query: {
    searchDocuments: searchDocumentsResolver,
  },
};

export default documentSearch;
