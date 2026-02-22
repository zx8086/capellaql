/* src/graphql/context.ts */

import type DataLoader from "dataloader";
import { ulid } from "ulid";
import { type CollectionKey, createDocumentDataLoader, type DocumentResult } from "$lib/dataLoader";
import { debug } from "../telemetry/logger";

// Enhanced GraphQL context type with additional tracking
export interface GraphQLContext {
  requestId: string;
  dataLoader: DataLoader<CollectionKey, DocumentResult>;
  user?: {
    id: string;
  };
  clientIp?: string;
  userAgent?: string;
  startTime?: number;
}

/**
 * Create GraphQL context for each request
 */
export function contextFactory({ request }: { request: Request }): GraphQLContext {
  const requestId = ulid();
  const startTime = Date.now();

  // Extract client information for security and debugging
  const clientIp = getClientIp(request);
  const userAgent = request.headers.get("user-agent");

  // Create a new DataLoader instance per request for proper caching isolation
  const dataLoader = createDocumentDataLoader();

  return {
    requestId,
    dataLoader,
    clientIp,
    userAgent,
    startTime,
    // User context could be extracted from headers/JWT in the future
    user: undefined,
  };
}

// Helper function to extract client IP
function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-client-ip") ||
    "unknown"
  );
}

/**
 * Context tracking functions (optional - for performance monitoring)
 */
export function trackDatabaseCall(context: GraphQLContext, operation?: string): void {
  debug("Database operation", {
    requestId: context.requestId,
    operation: operation || "unknown",
    clientIp: context.clientIp,
  });
}

export function trackCacheHit(context: GraphQLContext, cacheKey?: string): void {
  debug("Cache hit", {
    requestId: context.requestId,
    cacheKey: cacheKey?.substring(0, 50) + (cacheKey && cacheKey.length > 50 ? "..." : ""),
  });
}

export function trackCacheMiss(context: GraphQLContext, cacheKey?: string): void {
  debug("Cache miss", {
    requestId: context.requestId,
    cacheKey: cacheKey?.substring(0, 50) + (cacheKey && cacheKey.length > 50 ? "..." : ""),
  });
}
