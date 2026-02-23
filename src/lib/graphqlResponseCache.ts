/* src/lib/graphqlResponseCache.ts - SQLite-based Response Cache for GraphQL Yoga */

import config from "../config";
import { debug, err, log } from "../telemetry/logger";
import { BunSQLiteCache } from "./bunSQLiteCache";

/**
 * Cache interface compatible with GraphQL Yoga's response cache plugin
 * Uses SQLite instead of WeakMap to avoid compatibility issues
 */
export class SQLiteGraphQLCache implements Cache {
  private sqliteCache: BunSQLiteCache;
  private cacheKeyPrefix = "gql_response:";

  constructor() {
    this.sqliteCache = new BunSQLiteCache({
      maxMemoryMB: 100, // 100MB for response cache
      defaultTtlMs: config.application.YOGA_RESPONSE_CACHE_TTL,
      cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
      maxEntries: 10000,
      compressionThreshold: 1024, // Compress responses > 1KB
    });
  }

  /**
   * Get cached response
   */
  async get(key: string): Promise<any> {
    try {
      const prefixedKey = this.cacheKeyPrefix + key;
      const cached = await this.sqliteCache.get(prefixedKey);

      if (cached !== null) {
        debug("GraphQL response cache hit", {
          cacheKey: key.substring(0, 100) + (key.length > 100 ? "..." : ""),
          hasValue: cached !== null,
        });
        return cached;
      }

      debug("GraphQL response cache miss", {
        cacheKey: key.substring(0, 100) + (key.length > 100 ? "..." : ""),
      });
      return undefined;
    } catch (error) {
      err("GraphQL response cache get error:", error, { key: key.substring(0, 100) });
      return undefined;
    }
  }

  /**
   * Set cached response with TTL
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const prefixedKey = this.cacheKeyPrefix + key;
      const ttlMs = ttl ? ttl * 1000 : config.application.YOGA_RESPONSE_CACHE_TTL; // Convert seconds to ms

      await this.sqliteCache.set(prefixedKey, value, ttlMs);

      log("GraphQL response cached", {
        cacheKey: key.substring(0, 100) + (key.length > 100 ? "..." : ""),
        ttlMs,
        valueSize: JSON.stringify(value).length,
      });
    } catch (error) {
      err("GraphQL response cache set error:", error, { key: key.substring(0, 100) });
    }
  }

  /**
   * Delete cached response (optional method)
   */
  async delete(key: string): Promise<boolean> {
    try {
      const prefixedKey = this.cacheKeyPrefix + key;
      await this.sqliteCache.delete(prefixedKey);
      return true;
    } catch (error) {
      err("GraphQL response cache delete error:", error, { key: key.substring(0, 100) });
      return false;
    }
  }
}

/**
 * Create a global SQLite-based GraphQL cache instance
 */
export const sqliteGraphQLCache = new SQLiteGraphQLCache();

/**
 * Build cache key for GraphQL operations
 * This avoids WeakMap issues by using string-only keys
 */
export function buildGraphQLCacheKey(cacheKeyData: {
  operationName?: string | null;
  source: string;
  variableValues?: Record<string, any> | null;
}): string {
  try {
    const { operationName, source, variableValues } = cacheKeyData;

    // Create a deterministic string key
    const parts = [
      operationName || "anonymous",
      // Use first 200 chars of source for performance
      source.substring(0, 200),
      // Sort variables to ensure consistent key generation
      variableValues ? JSON.stringify(sortObject(variableValues)) : "null",
    ];

    const key = parts.join("|");

    debug("Generated GraphQL cache key", {
      operationName,
      sourceLength: source.length,
      hasVariables: !!variableValues,
      keyLength: key.length,
    });

    return key;
  } catch (error) {
    err("Error building GraphQL cache key:", error);
    // Fallback to a simple key
    return `fallback:${Date.now()}:${Math.random()}`;
  }
}

/**
 * Get session ID for cache key generation
 * Returns null for now (global caching), but can be enhanced for user-specific caching
 */
export function getSessionId(): string | null {
  // For now, use global caching
  // In the future, this could extract user ID from context/headers
  return null;
}

/**
 * Get operation-specific TTL
 */
export function getOperationTTL(operationName: string): number {
  // TTL in seconds (GraphQL Yoga expects seconds, not milliseconds)
  const ttlSeconds = {
    looks: 300, // 5 minutes
    optionsSummary: 180, // 3 minutes
    imageDetails: 600, // 10 minutes
    searchDocuments: 120, // 2 minutes
    assignments: 300, // 5 minutes
  };

  return ttlSeconds[operationName as keyof typeof ttlSeconds] || 300; // 5 minutes default
}

/**
 * Determine if operation should be cached
 */
export function shouldCacheOperation(operationName?: string | null, source?: string): boolean {
  // Don't cache mutations
  if (source?.includes("mutation")) {
    return false;
  }

  // Don't cache introspection queries
  if (operationName === "IntrospectionQuery" || source?.includes("__schema")) {
    return false;
  }

  // Cache all other queries
  return true;
}

/**
 * Sort object keys recursively for consistent serialization
 */
function sortObject(obj: any): any {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObject);
  }

  const sorted: Record<string, any> = {};
  const keys = Object.keys(obj).sort();

  for (const key of keys) {
    sorted[key] = sortObject(obj[key]);
  }

  return sorted;
}

/**
 * Type definition for Cache interface (since it might not be available)
 */
interface Cache {
  get(key: string): Promise<any>;
  set(key: string, value: any, ttl?: number): Promise<void>;
  delete?(key: string): Promise<boolean>;
}
