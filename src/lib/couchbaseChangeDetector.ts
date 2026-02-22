/* src/lib/couchbaseChangeDetector.ts */

/**
 * Couchbase Change Detection Utility
 * Uses Bun.deepEquals() for SIMD-accelerated change detection
 * Enables smart cache invalidation based on document changes
 */

import { BunCompare } from "$utils/bunUtils";
import { log } from "../telemetry/logger";

/**
 * Change detection result
 */
export interface ChangeDetectionResult<T> {
  hasChanged: boolean;
  changedFields?: string[];
  previousValue?: T;
  currentValue?: T;
}

/**
 * Detect if a document has changed
 * Uses SIMD-accelerated deep comparison
 */
export function hasDocumentChanged<T>(cachedDoc: T, freshDoc: T): boolean {
  return !BunCompare.deepEquals(cachedDoc, freshDoc);
}

/**
 * Detect changes with detailed field-level information
 */
export function detectChanges<T extends Record<string, unknown>>(cachedDoc: T, freshDoc: T): ChangeDetectionResult<T> {
  if (BunCompare.deepEquals(cachedDoc, freshDoc)) {
    return { hasChanged: false };
  }

  const changedFields = findChangedFields(cachedDoc, freshDoc);

  return {
    hasChanged: true,
    changedFields,
    previousValue: cachedDoc,
    currentValue: freshDoc,
  };
}

/**
 * Find which fields have changed between two objects
 */
function findChangedFields<T extends Record<string, unknown>>(obj1: T, obj2: T, prefix = ""): string[] {
  const changedFields: string[] = [];
  const allKeys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);

  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const val1 = obj1?.[key];
    const val2 = obj2?.[key];

    if (!BunCompare.deepEquals(val1, val2)) {
      if (typeof val1 === "object" && typeof val2 === "object" && val1 !== null && val2 !== null) {
        // Recursively check nested objects
        const nestedChanges = findChangedFields(val1 as Record<string, unknown>, val2 as Record<string, unknown>, path);
        changedFields.push(...nestedChanges);
      } else {
        changedFields.push(path);
      }
    }
  }

  return changedFields;
}

/**
 * Check if specific fields have changed
 */
export function haveFieldsChanged<T extends Record<string, unknown>>(
  cachedDoc: T,
  freshDoc: T,
  fieldsToCheck: string[]
): boolean {
  for (const field of fieldsToCheck) {
    const cachedValue = getNestedValue(cachedDoc, field);
    const freshValue = getNestedValue(freshDoc, field);

    if (!BunCompare.deepEquals(cachedValue, freshValue)) {
      return true;
    }
  }

  return false;
}

/**
 * Get a nested value from an object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Smart cache update - only update if changed
 * Returns true if cache was updated, false if no change detected
 */
export async function smartCacheUpdate<T>(
  cacheKey: string,
  getCached: () => Promise<T | null>,
  getFresh: () => Promise<T>,
  setCache: (key: string, value: T) => Promise<void>,
  options: { logChanges?: boolean } = {}
): Promise<{ data: T; fromCache: boolean; changed: boolean }> {
  const cached = await getCached();

  if (cached === null) {
    // Cache miss - fetch and store
    const fresh = await getFresh();
    await setCache(cacheKey, fresh);

    if (options.logChanges) {
      log("Cache populated (miss)", {
        cacheKey: cacheKey.substring(0, 50),
        cacheOperation: "populate",
      });
    }

    return { data: fresh, fromCache: false, changed: true };
  }

  // Check if we should validate the cache
  const fresh = await getFresh();
  const changed = hasDocumentChanged(cached, fresh);

  if (changed) {
    await setCache(cacheKey, fresh);

    if (options.logChanges) {
      log("Cache invalidated (stale)", {
        cacheKey: cacheKey.substring(0, 50),
        cacheOperation: "invalidate",
      });
    }

    return { data: fresh, fromCache: false, changed: true };
  }

  if (options.logChanges) {
    log("Cache hit (fresh)", {
      cacheKey: cacheKey.substring(0, 50),
      cacheOperation: "hit",
    });
  }

  return { data: cached, fromCache: true, changed: false };
}

/**
 * Batch change detection for multiple documents
 */
export function detectBatchChanges<T extends { id: string }>(
  cachedDocs: Map<string, T>,
  freshDocs: T[]
): {
  added: T[];
  removed: string[];
  changed: T[];
  unchanged: T[];
} {
  const added: T[] = [];
  const changed: T[] = [];
  const unchanged: T[] = [];
  const freshIds = new Set<string>();

  for (const fresh of freshDocs) {
    freshIds.add(fresh.id);
    const cached = cachedDocs.get(fresh.id);

    if (!cached) {
      added.push(fresh);
    } else if (hasDocumentChanged(cached, fresh)) {
      changed.push(fresh);
    } else {
      unchanged.push(fresh);
    }
  }

  // Find removed documents
  const removed: string[] = [];
  for (const cachedId of cachedDocs.keys()) {
    if (!freshIds.has(cachedId)) {
      removed.push(cachedId);
    }
  }

  return { added, removed, changed, unchanged };
}

/**
 * Create a change summary for logging
 */
export function createChangeSummary<T extends { id: string }>(
  result: ReturnType<typeof detectBatchChanges<T>>
): string {
  const parts: string[] = [];

  if (result.added.length > 0) {
    parts.push(`+${result.added.length} added`);
  }
  if (result.changed.length > 0) {
    parts.push(`~${result.changed.length} changed`);
  }
  if (result.removed.length > 0) {
    parts.push(`-${result.removed.length} removed`);
  }
  if (result.unchanged.length > 0) {
    parts.push(`=${result.unchanged.length} unchanged`);
  }

  return parts.join(", ") || "no changes";
}

export default {
  hasDocumentChanged,
  detectChanges,
  haveFieldsChanged,
  smartCacheUpdate,
  detectBatchChanges,
  createChangeSummary,
};
