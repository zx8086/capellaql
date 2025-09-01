/* src/graphql/context.ts */

import type DataLoader from "dataloader";
import { ulid } from "ulid";
import { type CollectionKey, createDocumentDataLoader, type DocumentResult } from "$lib/dataLoader";
import { debug } from "../telemetry/logger";

// GraphQL context type
export interface GraphQLContext {
  requestId: string;
  dataLoader: DataLoader<CollectionKey, DocumentResult>;
  user?: {
    id: string;
  };
}

/**
 * Create GraphQL context for each request
 */
export function contextFactory({ request }: { request: Request }): GraphQLContext {
  const requestId = ulid();

  // Create a new DataLoader instance per request for proper caching isolation
  const dataLoader = createDocumentDataLoader();

  debug("GraphQL context created", {
    requestId,
    url: request.url,
    method: request.method,
  });

  return {
    requestId,
    dataLoader,
    // User context could be extracted from headers/JWT in the future
    user: undefined,
  };
}

/**
 * Context tracking functions (optional - for performance monitoring)
 */
export function trackDatabaseCall(context: GraphQLContext): void {
  debug("Database call tracked", {
    requestId: context.requestId,
    timestamp: new Date().toISOString(),
  });
}

export function trackCacheHit(context: GraphQLContext): void {
  debug("Cache hit tracked", {
    requestId: context.requestId,
    timestamp: new Date().toISOString(),
  });
}

export function trackCacheMiss(context: GraphQLContext): void {
  debug("Cache miss tracked", {
    requestId: context.requestId,
    timestamp: new Date().toISOString(),
  });
}
