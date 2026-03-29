/* src/lib/couchbase/kv-operations.ts */

import {
  type Collection,
  DurabilityLevel,
  type GetOptions,
  type GetResult,
  LookupInSpec,
  MutateInSpec,
  type MutationResult,
  type UpsertOptions,
} from "couchbase";
import { getErrorMessage } from "$utils/errorUtils";
import { warn } from "../../telemetry/logger";
import { DocumentNotFoundError } from "./errors";
import type { KVGetOptions, KVUpsertOptions, SubdocOperation } from "./types";

const DURABILITY_MAP: Record<string, DurabilityLevel> = {
  none: DurabilityLevel.None,
  majority: DurabilityLevel.Majority,
  majorityAndPersistToActive: DurabilityLevel.MajorityAndPersistOnMaster,
  persistToMajority: DurabilityLevel.PersistToMajority,
};

export type { KVGetOptions, KVUpsertOptions, SubdocOperation };

export class KVOperations {
  static async get<T = any>(
    collection: Collection,
    id: string,
    options: KVGetOptions = {}
  ): Promise<(GetResult & { value: T }) | null> {
    try {
      const getOptions: GetOptions = {
        withExpiry: options.withExpiry,
        project: options.project,
        timeout: options.timeout || 7500,
      };

      const result = await collection.get(id, getOptions);

      return Object.assign(result, { value: result.content as T }) as GetResult & { value: T };
    } catch (error) {
      if (error instanceof DocumentNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  static async upsert<T = any>(
    collection: Collection,
    id: string,
    document: T,
    options: KVUpsertOptions = {}
  ): Promise<MutationResult> {
    const upsertOptions: UpsertOptions = {
      durabilityLevel: options.durability ? DURABILITY_MAP[options.durability] : undefined,
      expiry: options.expiry,
      timeout: options.timeout || 7500,
    };

    return await collection.upsert(id, document, upsertOptions);
  }

  static async insert<T = any>(
    collection: Collection,
    id: string,
    document: T,
    options: Omit<KVUpsertOptions, "cas"> = {}
  ): Promise<MutationResult> {
    return await collection.insert(id, document, {
      durabilityLevel: options.durability ? DURABILITY_MAP[options.durability] : undefined,
      expiry: options.expiry,
      timeout: options.timeout || 7500,
    });
  }

  static async replace<T = any>(
    collection: Collection,
    id: string,
    document: T,
    options: KVUpsertOptions = {}
  ): Promise<MutationResult> {
    return await collection.replace(id, document, {
      durabilityLevel: options.durability ? DURABILITY_MAP[options.durability] : undefined,
      expiry: options.expiry,
      cas: options.cas as any,
      timeout: options.timeout || 7500,
    });
  }

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

  static async exists(collection: Collection, id: string): Promise<boolean> {
    const result = await collection.exists(id);
    return result.exists;
  }

  static async getAndLock<T = any>(
    collection: Collection,
    id: string,
    lockTime: number = 15
  ): Promise<(GetResult & { value: T }) | null> {
    try {
      const result = await collection.getAndLock(id, lockTime);
      return Object.assign(result, { value: result.content as T }) as GetResult & { value: T };
    } catch (error) {
      if (error instanceof DocumentNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  static async unlock(collection: Collection, id: string, cas: any): Promise<void> {
    await collection.unlock(id, cas);
  }

  static async touch(collection: Collection, id: string, expiry: number): Promise<MutationResult> {
    return await collection.touch(id, expiry);
  }

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
    const specs: MutateInSpec[] = [];

    for (const op of operations) {
      switch (op.type) {
        case "upsert":
          specs.push(MutateInSpec.upsert(op.path, op.value));
          break;
        case "insert":
          specs.push(MutateInSpec.insert(op.path, op.value));
          break;
        case "replace":
          specs.push(MutateInSpec.replace(op.path, op.value));
          break;
        case "remove":
          specs.push(MutateInSpec.remove(op.path));
          break;
        case "arrayAppend":
          specs.push(MutateInSpec.arrayAppend(op.path, op.value));
          break;
        case "arrayPrepend":
          specs.push(MutateInSpec.arrayPrepend(op.path, op.value));
          break;
      }
    }

    return (await collection.mutateIn(id, specs, {
      cas: options.cas as any,
      durabilityLevel: options.durability ? DURABILITY_MAP[options.durability] : undefined,
      timeout: options.timeout || 7500,
    })) as unknown as MutationResult;
  }

  static async lookupIn<T extends Record<string, any> = Record<string, any>>(
    collection: Collection,
    id: string,
    paths: string[]
  ): Promise<T | null> {
    try {
      const specs = paths.map((p) => LookupInSpec.get(p));
      const result = await collection.lookupIn(id, specs);
      const data: Record<string, any> = {};

      paths.forEach((path, index) => {
        try {
          data[path] = result.content[index]?.value;
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
            error: getErrorMessage(error),
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
