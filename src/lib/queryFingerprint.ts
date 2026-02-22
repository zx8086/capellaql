/* src/lib/queryFingerprint.ts */

/**
 * Query Fingerprinting Utility
 * Uses Bun.hash() for SIMD-accelerated fingerprint generation
 * Provides consistent cache keys for GraphQL operations
 */

import { generateHashedKey } from "./bunSQLiteCache";

/**
 * Query fingerprint options
 */
export interface FingerprintOptions {
  /** Include user ID in fingerprint (for user-specific caching) */
  includeUser?: boolean;
  /** Include timestamp bucket for time-based cache invalidation */
  timeBucket?: "minute" | "hour" | "day" | null;
  /** Custom prefix for the fingerprint */
  prefix?: string;
}

/**
 * Generate a unique fingerprint for GraphQL operations
 * Uses SIMD-accelerated hashing for fast cache key generation
 */
export function createQueryFingerprint(
  operationName: string,
  variables: Record<string, unknown>,
  options: FingerprintOptions & { userId?: string } = {}
): string {
  const { includeUser = false, timeBucket = null, prefix, userId } = options;

  // Sort variables keys for consistent hashing
  const sortedVariables = sortObjectKeys(variables);

  const components: string[] = [operationName, JSON.stringify(sortedVariables)];

  if (includeUser && userId) {
    components.push(`user:${userId}`);
  }

  if (timeBucket) {
    const bucket = getTimeBucket(timeBucket);
    components.push(`time:${bucket}`);
  }

  const input = components.join("|");
  const hash = generateHashedKey(input);

  return prefix ? `${prefix}:${hash}` : hash;
}

/**
 * Generate fingerprint for a batch of operations
 */
export function createBatchFingerprint(
  operations: Array<{ name: string; variables: Record<string, unknown> }>
): string {
  const input = operations
    .map((op) => `${op.name}:${JSON.stringify(sortObjectKeys(op.variables))}`)
    .sort()
    .join("|");

  return generateHashedKey(input);
}

/**
 * Create a fingerprint for subscription topics
 */
export function createSubscriptionFingerprint(topic: string, filters: Record<string, unknown> = {}): string {
  const input = `sub:${topic}:${JSON.stringify(sortObjectKeys(filters))}`;
  return generateHashedKey(input);
}

/**
 * Create a fingerprint for persisted queries
 */
export function createPersistedQueryId(query: string): string {
  // Remove whitespace and normalize query for consistent hashing
  const normalized = query.replace(/\s+/g, " ").trim();
  return generateHashedKey(normalized);
}

/**
 * Verify if a fingerprint matches the expected operation
 */
export function verifyFingerprint(
  fingerprint: string,
  operationName: string,
  variables: Record<string, unknown>,
  options: FingerprintOptions & { userId?: string } = {}
): boolean {
  const expected = createQueryFingerprint(operationName, variables, options);
  return fingerprint === expected;
}

/**
 * Sort object keys recursively for consistent serialization
 */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj).sort();

  for (const key of keys) {
    sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
  }

  return sorted;
}

/**
 * Get time bucket for cache key generation
 */
function getTimeBucket(granularity: "minute" | "hour" | "day"): string {
  const now = new Date();

  switch (granularity) {
    case "minute":
      return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}-${now.getUTCMinutes()}`;
    case "hour":
      return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
    case "day":
      return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
  }
}

/**
 * Cache key builder with fluent API
 */
export class QueryFingerprintBuilder {
  private components: string[] = [];
  private _prefix?: string;

  constructor(operationName: string) {
    this.components.push(operationName);
  }

  static for(operationName: string): QueryFingerprintBuilder {
    return new QueryFingerprintBuilder(operationName);
  }

  withVariables(variables: Record<string, unknown>): this {
    this.components.push(JSON.stringify(sortObjectKeys(variables)));
    return this;
  }

  withUser(userId: string): this {
    this.components.push(`user:${userId}`);
    return this;
  }

  withTimeBucket(granularity: "minute" | "hour" | "day"): this {
    this.components.push(`time:${getTimeBucket(granularity)}`);
    return this;
  }

  withPrefix(prefix: string): this {
    this._prefix = prefix;
    return this;
  }

  withCustom(key: string, value: string): this {
    this.components.push(`${key}:${value}`);
    return this;
  }

  build(): string {
    const input = this.components.join("|");
    const hash = generateHashedKey(input);
    return this._prefix ? `${this._prefix}:${hash}` : hash;
  }
}

export default {
  createQueryFingerprint,
  createBatchFingerprint,
  createSubscriptionFingerprint,
  createPersistedQueryId,
  verifyFingerprint,
  QueryFingerprintBuilder,
};
