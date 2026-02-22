/* src/lib/couchbaseBatchProcessor.ts */

/**
 * Couchbase Batch Processing Utility
 * Uses Bun.deepEquals() for SIMD-accelerated batch document comparison
 * Efficiently processes bulk operations with change detection
 */

import { BunCompare } from "$utils/bunUtils";
import { log, warn } from "../telemetry/logger";
import { generateHashedKey } from "./bunSQLiteCache";

/**
 * Batch processing result
 */
export interface BatchProcessingResult<T> {
  changed: T[];
  unchanged: T[];
  added: T[];
  removed: string[];
  stats: {
    totalProcessed: number;
    changedCount: number;
    unchangedCount: number;
    addedCount: number;
    removedCount: number;
    processingTimeMs: number;
  };
}

/**
 * Filter changed documents from a batch
 * Uses SIMD-accelerated comparison for optimal performance
 */
export function filterChangedDocuments<T extends { id: string }>(
  cachedDocs: Map<string, T>,
  freshDocs: T[]
): BatchProcessingResult<T> {
  const startTime = Date.now();

  const changed: T[] = [];
  const unchanged: T[] = [];
  const added: T[] = [];
  const freshIds = new Set<string>();

  for (const fresh of freshDocs) {
    freshIds.add(fresh.id);
    const cached = cachedDocs.get(fresh.id);

    if (!cached) {
      added.push(fresh);
    } else if (!BunCompare.deepEquals(cached, fresh)) {
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

  const processingTimeMs = Date.now() - startTime;

  return {
    changed,
    unchanged,
    added,
    removed,
    stats: {
      totalProcessed: freshDocs.length,
      changedCount: changed.length,
      unchangedCount: unchanged.length,
      addedCount: added.length,
      removedCount: removed.length,
      processingTimeMs,
    },
  };
}

/**
 * Process documents in batches with optional transformation
 */
export async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R[]>,
  options: {
    onBatchComplete?: (batchIndex: number, results: R[]) => void;
    onError?: (error: Error, batchIndex: number) => void;
    continueOnError?: boolean;
  } = {}
): Promise<{ results: R[]; errors: Array<{ batchIndex: number; error: Error }> }> {
  const results: R[] = [];
  const errors: Array<{ batchIndex: number; error: Error }> = [];
  const totalBatches = Math.ceil(items.length / batchSize);

  log("Batch processing started", {
    totalItems: items.length,
    batchSize,
    totalBatches,
  });

  for (let i = 0; i < items.length; i += batchSize) {
    const batchIndex = Math.floor(i / batchSize);
    const batch = items.slice(i, i + batchSize);

    try {
      const batchResults = await processor(batch);
      results.push(...batchResults);

      if (options.onBatchComplete) {
        options.onBatchComplete(batchIndex, batchResults);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push({ batchIndex, error: err });

      if (options.onError) {
        options.onError(err, batchIndex);
      }

      if (!options.continueOnError) {
        warn("Batch processing stopped due to error", {
          batchIndex,
          error: err.message,
        });
        break;
      }
    }
  }

  log("Batch processing completed", {
    totalResults: results.length,
    totalErrors: errors.length,
    successRate: `${((results.length / items.length) * 100).toFixed(1)}%`,
  });

  return { results, errors };
}

/**
 * Merge multiple document maps with change tracking
 */
export function mergeMapsWithTracking<T extends { id: string }>(
  existingMap: Map<string, T>,
  updates: T[]
): {
  mergedMap: Map<string, T>;
  changes: BatchProcessingResult<T>;
} {
  const changes = filterChangedDocuments(existingMap, updates);
  const mergedMap = new Map(existingMap);

  // Apply changes
  for (const doc of changes.changed) {
    mergedMap.set(doc.id, doc);
  }

  // Add new documents
  for (const doc of changes.added) {
    mergedMap.set(doc.id, doc);
  }

  // Remove deleted documents
  for (const id of changes.removed) {
    mergedMap.delete(id);
  }

  return { mergedMap, changes };
}

/**
 * Group documents by a key with deduplication
 */
export function groupDocuments<T, K extends string | number>(
  documents: T[],
  keySelector: (doc: T) => K,
  options: { deduplicate?: boolean } = {}
): Map<K, T[]> {
  const groups = new Map<K, T[]>();

  for (const doc of documents) {
    const key = keySelector(doc);
    const existing = groups.get(key) || [];

    if (options.deduplicate) {
      // Check if document already exists in group
      const isDuplicate = existing.some((existingDoc) => BunCompare.deepEquals(existingDoc, doc));

      if (!isDuplicate) {
        existing.push(doc);
      }
    } else {
      existing.push(doc);
    }

    groups.set(key, existing);
  }

  return groups;
}

/**
 * Create a document index for fast lookups
 */
export function createDocumentIndex<T>(documents: T[], keySelector: (doc: T) => string): Map<string, T> {
  const index = new Map<string, T>();

  for (const doc of documents) {
    const key = keySelector(doc);
    index.set(key, doc);
  }

  return index;
}

/**
 * Create a compound index for multi-field lookups
 */
export function createCompoundIndex<T>(
  documents: T[],
  ...keySelectors: Array<(doc: T) => string | number>
): Map<string, T> {
  const index = new Map<string, T>();

  for (const doc of documents) {
    const keyParts = keySelectors.map((selector) => String(selector(doc)));
    const compoundKey = generateHashedKey(keyParts.join(":"));
    index.set(compoundKey, doc);
  }

  return index;
}

/**
 * Find documents matching a predicate with early termination
 */
export function findMatching<T>(documents: T[], predicate: (doc: T) => boolean, limit?: number): T[] {
  const matches: T[] = [];

  for (const doc of documents) {
    if (predicate(doc)) {
      matches.push(doc);

      if (limit && matches.length >= limit) {
        break;
      }
    }
  }

  return matches;
}

/**
 * Partition documents into groups based on a condition
 */
export function partitionDocuments<T>(
  documents: T[],
  predicate: (doc: T) => boolean
): { matching: T[]; nonMatching: T[] } {
  const matching: T[] = [];
  const nonMatching: T[] = [];

  for (const doc of documents) {
    if (predicate(doc)) {
      matching.push(doc);
    } else {
      nonMatching.push(doc);
    }
  }

  return { matching, nonMatching };
}

/**
 * Compare two arrays of documents and return diff
 */
export function diffDocumentArrays<T extends { id: string }>(
  before: T[],
  after: T[]
): {
  added: T[];
  removed: T[];
  modified: Array<{ before: T; after: T }>;
  unchanged: T[];
} {
  const beforeMap = createDocumentIndex(before, (doc) => doc.id);
  const afterMap = createDocumentIndex(after, (doc) => doc.id);

  const added: T[] = [];
  const removed: T[] = [];
  const modified: Array<{ before: T; after: T }> = [];
  const unchanged: T[] = [];

  // Check for added and modified
  for (const [id, afterDoc] of afterMap) {
    const beforeDoc = beforeMap.get(id);

    if (!beforeDoc) {
      added.push(afterDoc);
    } else if (!BunCompare.deepEquals(beforeDoc, afterDoc)) {
      modified.push({ before: beforeDoc, after: afterDoc });
    } else {
      unchanged.push(afterDoc);
    }
  }

  // Check for removed
  for (const [id, beforeDoc] of beforeMap) {
    if (!afterMap.has(id)) {
      removed.push(beforeDoc);
    }
  }

  return { added, removed, modified, unchanged };
}

/**
 * Create a batch processor with configurable concurrency
 */
export class BatchProcessor<T, R> {
  constructor(
    private processor: (items: T[]) => Promise<R[]>,
    private options: {
      batchSize: number;
      concurrency?: number;
      retryAttempts?: number;
      retryDelay?: number;
    }
  ) {}

  async process(items: T[]): Promise<{ results: R[]; errors: Error[] }> {
    const { batchSize, concurrency = 1, retryAttempts = 0, retryDelay = 1000 } = this.options;

    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    const results: R[] = [];
    const errors: Error[] = [];

    // Process batches with concurrency limit
    for (let i = 0; i < batches.length; i += concurrency) {
      const concurrentBatches = batches.slice(i, i + concurrency);

      const batchPromises = concurrentBatches.map(async (batch) => {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= retryAttempts; attempt++) {
          try {
            return await this.processor(batch);
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt < retryAttempts) {
              await new Promise((resolve) => setTimeout(resolve, retryDelay * (attempt + 1)));
            }
          }
        }

        throw lastError;
      });

      const batchResults = await Promise.allSettled(batchPromises);

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          results.push(...result.value);
        } else {
          errors.push(result.reason);
        }
      }
    }

    return { results, errors };
  }
}

export default {
  filterChangedDocuments,
  processBatches,
  mergeMapsWithTracking,
  groupDocuments,
  createDocumentIndex,
  createCompoundIndex,
  findMatching,
  partitionDocuments,
  diffDocumentArrays,
  BatchProcessor,
};
