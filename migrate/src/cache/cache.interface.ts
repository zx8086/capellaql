// src/cache/cache.interface.ts
import type { ConsumerSecret, KongCacheStats } from "../config/schemas";

export interface ICacheService {
  get<T = ConsumerSecret>(key: string): Promise<T | null>;
  set<T = ConsumerSecret>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  getStats(): Promise<KongCacheStats>;
  isHealthy(): Promise<boolean>;
  getStale?<T = ConsumerSecret>(key: string): Promise<T | null>;
  connect?(): Promise<void>;
  disconnect?(): Promise<void>;
}

export interface ICacheBackend extends ICacheService {
  readonly strategy: CacheStrategy;
  readonly name: string;
}

export type CacheStrategy = "local-memory" | "shared-redis" | "composite";

export interface CacheManagerConfig {
  highAvailability: boolean;
  redisUrl?: string;
  redisPassword?: string;
  redisDb: number;
  ttlSeconds: number;
  staleDataToleranceMinutes: number;
  maxMemoryEntries?: number;
}

export interface CacheBackendFactory {
  createBackend(config: CacheManagerConfig): Promise<ICacheBackend>;
  supports(strategy: CacheStrategy): boolean;
}
