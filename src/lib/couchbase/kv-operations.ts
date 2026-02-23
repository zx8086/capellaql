/* src/lib/couchbase/kv-operations.ts */

/**
 * Key-Value Operations Module
 *
 * MEDIUM PRIORITY FIXES INTEGRATED:
 * - Subdocument operations (mutateIn) for partial updates
 * - CAS (Compare-And-Swap) for optimistic locking
 * - Durability levels for write guarantees
 * - Field projection for efficient reads
 * - Batch operations with parallel execution
 */

import type { Collection, DurabilityLevel, GetOptions, GetResult, MutationResult, UpsertOptions } from "couchbase";
import { warn } from "../../telemetry/logger";
import { DocumentNotFoundError } from "./errors";
import type { KVGetOptions, KVUpsertOptions, SubdocOperation } from "./types";

// Re-export types
export type { KVGetOptions, KVUpsertOptions, SubdocOperation };

// =============================================================================
// KV OPERATIONS CLASS
// =============================================================================

/**
 * Enhanced KV operations with SDK best practices.
 *
 * Features:
 * - Field projection for efficient reads
 * - Subdocument operations for partial updates
 * - CAS support for optimistic locking
 * - Durability levels for write guarantees
 * - Batch operations with parallel execution
 */
export class KVOperations {
  /**
   * MEDIUM PRIORITY FIX: Get document with field projection.
   *
   * Usage:
   * ```typescript
   * // Get only specific fields (more efficient than full document)
   * const result = await KVOperations.get(collection, "user::123", {
   *   project: ["name", "email", "status"]
   * });
   * ```
   */
  static async get<T = any>(
    collection: Collection,
    id: string,
    options: KVGetOptions = {}
  ): Promise<(GetResult & { value: T }) | null> {
    try {
      const getOptions: GetOptions = {
        // SDK BEST PRACTICE: Retrieve expiry if needed
        withExpiry: options.withExpiry,

        // MEDIUM PRIORITY FIX: Project specific fields for performance
        // Example: { project: ["name", "email", "status"] }
        // Fetches only these fields instead of entire document
        project: options.project,

        timeout: options.timeout || 7500,
      };

      const result = await collection.get(id, getOptions);

      return {
        ...result,
        value: result.content as T,
      };
    } catch (error) {
      if (error instanceof DocumentNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  /**
   * MEDIUM PRIORITY FIX: Upsert with durability and CAS.
   *
   * Usage:
   * ```typescript
   * // Upsert with durability (waits for replication)
   * await KVOperations.upsert(collection, "user::123", userData, {
   *   durability: "majority",
   *   expiry: 3600 // 1 hour TTL
   * });
   * ```
   */
  static async upsert<T = any>(
    collection: Collection,
    id: string,
    document: T,
    options: KVUpsertOptions = {}
  ): Promise<MutationResult> {
    const upsertOptions: UpsertOptions = {
      // SDK BEST PRACTICE: Use durability for critical writes
      // Options: "none", "majority", "majorityAndPersistToActive", "persistToMajority"
      durabilityLevel: (options.durability as DurabilityLevel) || undefined,

      // Set expiry (TTL) if provided
      expiry: options.expiry,

      // MEDIUM PRIORITY FIX: CAS for optimistic locking
      cas: options.cas as any,

      timeout: options.timeout || 7500,
    };

    return await collection.upsert(id, document, upsertOptions);
  }

  /**
   * Insert a new document (fails if exists).
   */
  static async insert<T = any>(
    collection: Collection,
    id: string,
    document: T,
    options: Omit<KVUpsertOptions, "cas"> = {}
  ): Promise<MutationResult> {
    return await collection.insert(id, document, {
      durabilityLevel: (options.durability as DurabilityLevel) || undefined,
      expiry: options.expiry,
      timeout: options.timeout || 7500,
    });
  }

  /**
   * Replace an existing document (fails if not exists).
   */
  static async replace<T = any>(
    collection: Collection,
    id: string,
    document: T,
    options: KVUpsertOptions = {}
  ): Promise<MutationResult> {
    return await collection.replace(id, document, {
      durabilityLevel: (options.durability as DurabilityLevel) || undefined,
      expiry: options.expiry,
      cas: options.cas as any,
      timeout: options.timeout || 7500,
    });
  }

  /**
   * Remove a document.
   */
  static async remove(
    collection: Collection,
    id: string,
    options: { cas?: string; timeout?: number } = {}
  ): Promise<MutationResult> {
    return await collection.remove(id, {
      cas: options.cas as any,
      timeout: options.timeout || 7500,
    });
  }

  /**
   * Check if a document exists without retrieving it.
   */
  static async exists(collection: Collection, id: string): Promise<boolean> {
    const result = await collection.exists(id);
    return result.exists;
  }

  /**
   * Get document and lock it for modification.
   */
  static async getAndLock<T = any>(
    collection: Collection,
    id: string,
    lockTime: number = 15
  ): Promise<(GetResult & { value: T }) | null> {
    try {
      const result = await collection.getAndLock(id, lockTime);
      return {
        ...result,
        value: result.content as T,
      };
    } catch (error) {
      if (error instanceof DocumentNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Unlock a locked document.
   */
  static async unlock(collection: Collection, id: string, cas: any): Promise<void> {
    await collection.unlock(id, cas);
  }

  /**
   * Touch a document to update its expiry.
   */
  static async touch(collection: Collection, id: string, expiry: number): Promise<MutationResult> {
    return await collection.touch(id, expiry);
  }

  // =============================================================================
  // SUBDOCUMENT OPERATIONS
  // =============================================================================

  /**
   * MEDIUM PRIORITY FIX: Subdocument operations for partial updates.
   *
   * Usage:
   * ```typescript
   * // Update only specific fields (more efficient than full document update)
   * await KVOperations.mutateIn(collection, "user::123", [
   *   { type: "upsert", path: "lastLogin", value: new Date().toISOString() },
   *   { type: "replace", path: "loginCount", value: 42 },
   *   { type: "arrayAppend", path: "tags", value: "premium" }
   * ]);
   * ```
   */
  static async mutateIn(
    collection: Collection,
    id: string,
    operations: SubdocOperation[],
    options: {
      cas?: string;
      durability?: "none" | "majority" | "majorityAndPersistToActive" | "persistToMajority";
      timeout?: number;
    } = {}
  ): Promise<MutationResult> {
    // Build the spec
    let spec = collection.mutateIn(id);

    for (const op of operations) {
      switch (op.type) {
        case "upsert":
          spec = spec.upsert(op.path, op.value);
          break;
        case "insert":
          spec = spec.insert(op.path, op.value);
          break;
        case "replace":
          spec = spec.replace(op.path, op.value);
          break;
        case "remove":
          spec = spec.remove(op.path);
          break;
        case "arrayAppend":
          spec = spec.arrayAppend(op.path, op.value);
          break;
        case "arrayPrepend":
          spec = spec.arrayPrepend(op.path, op.value);
          break;
      }
    }

    // Execute with options
    return await (spec as any).execute({
      cas: options.cas as any,
      durabilityLevel: options.durability as DurabilityLevel,
      timeout: options.timeout || 7500,
    });
  }

  /**
   * Lookup specific paths in a document without retrieving entire document.
   */
  static async lookupIn<T extends Record<string, any> = Record<string, any>>(
    collection: Collection,
    id: string,
    paths: string[]
  ): Promise<T | null> {
    try {
      let spec = collection.lookupIn(id);

      for (const path of paths) {
        spec = spec.get(path);
      }

      const result = await spec.execute();
      const data: Record<string, any> = {};

      paths.forEach((path, index) => {
        try {
          data[path] = result.content(index)?.value;
        } catch {
          data[path] = undefined;
        }
      });

      return data as T;
    } catch (error) {
      if (error instanceof DocumentNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  // =============================================================================
  // BATCH OPERATIONS
  // =============================================================================

  /**
   * Get multiple documents in parallel (batch operation).
   *
   * Usage:
   * ```typescript
   * const users = await KVOperations.getMulti(collection, ["user::1", "user::2", "user::3"]);
   * // Returns Map<string, User>
   * ```
   */
  static async getMulti<T = any>(
    collection: Collection,
    ids: string[],
    options: KVGetOptions & { batchSize?: number } = {}
  ): Promise<Map<string, T>> {
    const results = new Map<string, T>();
    const batchSize = options.batchSize || 100;

    // Process in batches to avoid overwhelming the cluster
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);

      const promises = batch.map(async (id) => {
        try {
          const result = await KVOperations.get<T>(collection, id, options);
          if (result) {
            return { id, value: result.value };
          }
        } catch (error) {
          warn("KV batch get failed for document", {
            component: "couchbase",
            operation: "kv_get_many",
            documentId: id,
            error: String(error),
          });
        }
        return null;
      });

      const batchResults = await Promise.all(promises);

      for (const result of batchResults) {
        if (result) {
          results.set(result.id, result.value);
        }
      }
    }

    return results;
  }

  /**
   * Upsert multiple documents in parallel (batch operation).
   */
  static async upsertMulti<T = any>(
    collection: Collection,
    documents: Array<{ id: string; document: T }>,
    options: KVUpsertOptions & { batchSize?: number } = {}
  ): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: Error }> }> {
    const batchSize = options.batchSize || 100;
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: Error }> = [];

    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);

      const promises = batch.map(async ({ id, document }) => {
        try {
          await KVOperations.upsert(collection, id, document, options);
          return { id, success: true };
        } catch (error) {
          return { id, success: false, error: error as Error };
        }
      });

      const batchResults = await Promise.all(promises);

      for (const result of batchResults) {
        if (result.success) {
          succeeded.push(result.id);
        } else {
          failed.push({ id: result.id, error: result.error! });
        }
      }
    }

    return { succeeded, failed };
  }
}
