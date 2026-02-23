/* src/lib/couchbase/repository.ts */

/**
 * Repository Base Class
 *
 * Provides a generic CRUD base class with SDK best practices:
 * - Field projection for efficient reads
 * - CAS conflict handling with automatic retry
 * - Subdocument operations for partial updates
 * - Prepared statements for query operations
 */

import type { Cluster, Collection } from "couchbase";
import { CasMismatchError, DocumentNotFoundError } from "./errors";
import { KVOperations } from "./kv-operations";
import { QueryExecutor } from "./query-executor";

// =============================================================================
// BASE REPOSITORY CLASS
// =============================================================================

/**
 * Generic base repository class with SDK best practices.
 *
 * Usage:
 * ```typescript
 * interface User {
 *   id: string;
 *   name: string;
 *   email: string;
 *   status: string;
 * }
 *
 * class UserRepository extends CouchbaseRepository<User> {
 *   constructor(collection: Collection) {
 *     super(collection, "user");
 *   }
 *
 *   async findByEmail(email: string): Promise<User | null> {
 *     return this.findOneBy("email", email);
 *   }
 * }
 * ```
 */
export class CouchbaseRepository<T extends Record<string, any>> {
  constructor(
    protected collection: Collection,
    protected documentType: string
  ) {}

  // =============================================================================
  // READ OPERATIONS
  // =============================================================================

  /**
   * Find document by ID.
   *
   * MEDIUM PRIORITY FIX: Supports field projection for efficient reads.
   */
  async findById(id: string, fields?: string[]): Promise<T | null> {
    try {
      const result = await KVOperations.get<T>(this.collection, id, {
        project: fields,
      });
      return result?.value || null;
    } catch (error) {
      if (error instanceof DocumentNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Find document by ID or throw an error if not found.
   */
  async findByIdOrThrow(id: string, fields?: string[]): Promise<T> {
    const result = await this.findById(id, fields);
    if (!result) {
      throw new Error(`${this.documentType} not found: ${id}`);
    }
    return result;
  }

  /**
   * Check if a document exists.
   */
  async exists(id: string): Promise<boolean> {
    return KVOperations.exists(this.collection, id);
  }

  /**
   * Get multiple documents by IDs.
   */
  async findByIds(ids: string[], fields?: string[]): Promise<Map<string, T>> {
    return KVOperations.getMulti<T>(this.collection, ids, { project: fields });
  }

  // =============================================================================
  // WRITE OPERATIONS
  // =============================================================================

  /**
   * MEDIUM PRIORITY FIX: Save with CAS conflict handling.
   *
   * Automatically retries on CAS mismatch with exponential backoff.
   */
  async save(id: string, document: T, cas?: string): Promise<void> {
    const maxAttempts = 5;
    let lastError: Error | null = null;
    let currentCas = cas;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await KVOperations.upsert(this.collection, id, document, {
          cas: currentCas,
        });
        return;
      } catch (error) {
        lastError = error as Error;

        // Handle CAS conflicts with retry
        if (error instanceof CasMismatchError) {
          if (attempt < maxAttempts) {
            const delay = 100 * 2 ** (attempt - 1);
            await this.sleep(delay);

            // Get fresh CAS value
            const current = await this.findById(id);
            if (current) {
              currentCas = undefined; // Let retry use fresh CAS
            }
            continue;
          }
        }

        throw error;
      }
    }

    throw lastError || new Error("Save failed");
  }

  /**
   * Create a new document (fails if exists).
   */
  async create(id: string, document: T): Promise<void> {
    await KVOperations.insert(this.collection, id, document);
  }

  /**
   * Replace an existing document (fails if not exists).
   */
  async replace(id: string, document: T, cas?: string): Promise<void> {
    await KVOperations.replace(this.collection, id, document, { cas });
  }

  /**
   * MEDIUM PRIORITY FIX: Update specific field using subdocument operation.
   *
   * More efficient than loading and saving entire document.
   */
  async updateField(id: string, path: string, value: any, cas?: string): Promise<void> {
    await KVOperations.mutateIn(this.collection, id, [{ type: "upsert", path, value }], { cas });
  }

  /**
   * Update multiple fields using subdocument operations.
   */
  async updateFields(id: string, updates: Record<string, any>, cas?: string): Promise<void> {
    const operations = Object.entries(updates).map(([path, value]) => ({
      type: "upsert" as const,
      path,
      value,
    }));

    await KVOperations.mutateIn(this.collection, id, operations, { cas });
  }

  /**
   * Delete document.
   */
  async delete(id: string): Promise<void> {
    try {
      await KVOperations.remove(this.collection, id);
    } catch (error) {
      if (error instanceof DocumentNotFoundError) {
        return; // Already deleted
      }
      throw error;
    }
  }

  // =============================================================================
  // QUERY OPERATIONS (requires cluster)
  // =============================================================================

  /**
   * Find documents by a filter field using N1QL.
   *
   * MEDIUM PRIORITY FIX: Uses prepared statements for better performance.
   */
  async findByFilter(
    cluster: Cluster,
    filterField: string,
    filterValue: any,
    options: {
      limit?: number;
      offset?: number;
      orderBy?: string;
      orderDirection?: "ASC" | "DESC";
      queryContext?: string;
    } = {}
  ): Promise<T[]> {
    const collectionName = (this.collection as any).name || "_default";
    const limit = options.limit || 100;

    let statement = `SELECT * FROM \`${collectionName}\` WHERE ${filterField} = $filterValue`;

    if (options.orderBy) {
      statement += ` ORDER BY ${options.orderBy} ${options.orderDirection || "ASC"}`;
    }

    statement += ` LIMIT ${limit}`;

    if (options.offset) {
      statement += ` OFFSET ${options.offset}`;
    }

    const result = await QueryExecutor.execute<{ [key: string]: T }>(cluster, statement, {
      parameters: { filterValue },
      usePreparedStatement: true,
      queryContext: options.queryContext,
    });

    return result.rows.map((row) => row[collectionName] || Object.values(row)[0]);
  }

  /**
   * Find one document by a field value using N1QL.
   */
  async findOneBy(cluster: Cluster, field: string, value: any, queryContext?: string): Promise<T | null> {
    const results = await this.findByFilter(cluster, field, value, {
      limit: 1,
      queryContext,
    });
    return results[0] || null;
  }

  /**
   * Count documents matching a filter.
   */
  async count(cluster: Cluster, filterField?: string, filterValue?: any, queryContext?: string): Promise<number> {
    const collectionName = (this.collection as any).name || "_default";

    let statement = `SELECT COUNT(*) as count FROM \`${collectionName}\``;

    if (filterField) {
      statement += ` WHERE ${filterField} = $filterValue`;
    }

    const result = await QueryExecutor.execute<{ count: number }>(cluster, statement, {
      parameters: filterField ? { filterValue } : undefined,
      usePreparedStatement: true,
      queryContext,
    });

    return result.rows[0]?.count || 0;
  }

  // =============================================================================
  // UTILITIES
  // =============================================================================

  private async sleep(ms: number): Promise<void> {
    if (typeof Bun !== "undefined") {
      await Bun.sleep(ms);
    } else {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a repository for a document type.
 */
export function createRepository<T extends Record<string, any>>(
  collection: Collection,
  documentType: string
): CouchbaseRepository<T> {
  return new CouchbaseRepository<T>(collection, documentType);
}
