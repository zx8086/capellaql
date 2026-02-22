/* src/lib/graphqlDeduplication.ts */

/**
 * GraphQL Response Deduplication Utility
 * Uses Bun.deepEquals() for SIMD-accelerated deduplication
 * Removes duplicate items from GraphQL array responses
 */

import { BunCompare } from "$utils/bunUtils";
import { generateHashedKey } from "./bunSQLiteCache";

/**
 * Deduplication options
 */
export interface DeduplicationOptions<T> {
  /** Custom key function for determining uniqueness */
  keyFn?: (item: T) => string;
  /** Whether to preserve order (first occurrence wins) */
  preserveOrder?: boolean;
  /** Maximum items to return after deduplication */
  limit?: number;
}

/**
 * Deduplicate array items using deep equality comparison
 * Uses SIMD-accelerated comparison for optimal performance
 */
export function deduplicateResults<T>(items: T[], options: DeduplicationOptions<T> = {}): T[] {
  if (!items || items.length === 0) {
    return [];
  }

  const { keyFn, preserveOrder = true, limit } = options;

  // If a key function is provided, use hash-based deduplication (faster)
  if (keyFn) {
    return deduplicateByKey(items, keyFn, { preserveOrder, limit });
  }

  // Use deep equality comparison for complex objects
  return deduplicateByEquality(items, { preserveOrder, limit });
}

/**
 * Deduplicate using a key function (faster for large arrays)
 */
function deduplicateByKey<T>(
  items: T[],
  keyFn: (item: T) => string,
  options: { preserveOrder?: boolean; limit?: number }
): T[] {
  const { preserveOrder = true, limit } = options;
  const seen = new Map<string, T>();

  for (const item of items) {
    const key = keyFn(item);

    if (!seen.has(key)) {
      seen.set(key, item);

      if (limit && seen.size >= limit) {
        break;
      }
    }
  }

  return preserveOrder ? Array.from(seen.values()) : [...seen.values()];
}

/**
 * Deduplicate using deep equality (more accurate for complex objects)
 */
function deduplicateByEquality<T>(items: T[], options: { preserveOrder?: boolean; limit?: number }): T[] {
  const { limit } = options;
  const unique: T[] = [];

  for (const item of items) {
    const isDuplicate = unique.some((existing) => BunCompare.deepEquals(existing, item));

    if (!isDuplicate) {
      unique.push(item);

      if (limit && unique.length >= limit) {
        break;
      }
    }
  }

  return unique;
}

/**
 * Deduplicate by specific fields
 */
export function deduplicateByFields<T extends Record<string, unknown>>(
  items: T[],
  fields: (keyof T)[],
  options: { preserveOrder?: boolean; limit?: number } = {}
): T[] {
  const keyFn = (item: T): string => {
    const keyParts = fields.map((field) => JSON.stringify(item[field]));
    return generateHashedKey(keyParts.join("|"));
  };

  return deduplicateByKey(items, keyFn, options);
}

/**
 * Deduplicate by ID field (common pattern for GraphQL)
 */
export function deduplicateById<T extends { id: string | number }>(
  items: T[],
  options: { preserveOrder?: boolean; limit?: number } = {}
): T[] {
  return deduplicateByKey(items, (item) => String(item.id), options);
}

/**
 * Merge and deduplicate multiple arrays
 */
export function mergeAndDeduplicate<T>(arrays: T[][], options: DeduplicationOptions<T> = {}): T[] {
  const merged = arrays.flat();
  return deduplicateResults(merged, options);
}

/**
 * Deduplicate with merge function for conflicting items
 */
export function deduplicateWithMerge<T>(
  items: T[],
  keyFn: (item: T) => string,
  mergeFn: (existing: T, incoming: T) => T
): T[] {
  const merged = new Map<string, T>();

  for (const item of items) {
    const key = keyFn(item);
    const existing = merged.get(key);

    if (existing) {
      merged.set(key, mergeFn(existing, item));
    } else {
      merged.set(key, item);
    }
  }

  return Array.from(merged.values());
}

/**
 * Get duplicate items from an array
 */
export function findDuplicates<T>(items: T[], keyFn?: (item: T) => string): T[] {
  const seen = new Set<string>();
  const duplicates: T[] = [];

  for (const item of items) {
    const key = keyFn ? keyFn(item) : generateHashedKey(JSON.stringify(item));

    if (seen.has(key)) {
      duplicates.push(item);
    } else {
      seen.add(key);
    }
  }

  return duplicates;
}

/**
 * Count duplicates in an array
 */
export function countDuplicates<T>(items: T[], keyFn?: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();

  for (const item of items) {
    const key = keyFn ? keyFn(item) : generateHashedKey(JSON.stringify(item));
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return counts;
}

/**
 * Check if array has duplicates
 */
export function hasDuplicates<T>(items: T[], keyFn?: (item: T) => string): boolean {
  const seen = new Set<string>();

  for (const item of items) {
    const key = keyFn ? keyFn(item) : generateHashedKey(JSON.stringify(item));

    if (seen.has(key)) {
      return true;
    }

    seen.add(key);
  }

  return false;
}

/**
 * Deduplicate GraphQL connection edges
 */
export function deduplicateEdges<T extends { node: { id: string | number } }>(
  edges: T[],
  options: { preserveOrder?: boolean; limit?: number } = {}
): T[] {
  return deduplicateByKey(edges, (edge) => String(edge.node.id), options);
}

/**
 * Create a deduplication transformer for GraphQL responses
 */
export function createDeduplicator<T>(options: DeduplicationOptions<T> = {}): (items: T[]) => T[] {
  return (items: T[]) => deduplicateResults(items, options);
}

/**
 * Deduplication statistics
 */
export interface DeduplicationStats {
  inputCount: number;
  outputCount: number;
  duplicatesRemoved: number;
  deduplicationRate: number;
}

/**
 * Deduplicate with statistics
 */
export function deduplicateWithStats<T>(
  items: T[],
  options: DeduplicationOptions<T> = {}
): { results: T[]; stats: DeduplicationStats } {
  const inputCount = items.length;
  const results = deduplicateResults(items, options);
  const outputCount = results.length;
  const duplicatesRemoved = inputCount - outputCount;
  const deduplicationRate = inputCount > 0 ? duplicatesRemoved / inputCount : 0;

  return {
    results,
    stats: {
      inputCount,
      outputCount,
      duplicatesRemoved,
      deduplicationRate,
    },
  };
}

/**
 * Stable deduplication that maintains insertion order
 */
export function stableDeduplicateById<T extends { id: string | number }>(items: T[]): T[] {
  const seen = new Set<string | number>();
  const result: T[] = [];

  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      result.push(item);
    }
  }

  return result;
}

export default {
  deduplicateResults,
  deduplicateByFields,
  deduplicateById,
  mergeAndDeduplicate,
  deduplicateWithMerge,
  findDuplicates,
  countDuplicates,
  hasDuplicates,
  deduplicateEdges,
  createDeduplicator,
  deduplicateWithStats,
  stableDeduplicateById,
};
