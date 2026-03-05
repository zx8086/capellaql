// src/cache/backends/local-memory-backend.ts
import type { KongCacheStats } from "../../config/schemas";
import { LocalMemoryCache } from "../../services/cache/local-memory-cache";
import type { CacheStrategy, ICacheBackend } from "../cache.interface";

interface LocalMemoryBackendConfig {
  ttlSeconds: number;
  maxEntries: number;
}

export class LocalMemoryBackend implements ICacheBackend {
  readonly strategy: CacheStrategy = "local-memory";
  readonly name: string = "LocalMemoryBackend";

  private cache: LocalMemoryCache;

  constructor(config: LocalMemoryBackendConfig) {
    this.cache = new LocalMemoryCache({
      ttlSeconds: config.ttlSeconds,
      maxEntries: config.maxEntries,
    });
  }

  async get<T>(key: string): Promise<T | null> {
    return (await this.cache.get(key)) as T | null;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.cache.set(key, value, ttl);
  }

  async delete(key: string): Promise<void> {
    await this.cache.delete(key);
  }

  async clear(): Promise<void> {
    await this.cache.clear();
  }

  async getStats(): Promise<KongCacheStats> {
    return await this.cache.getStats();
  }

  async isHealthy(): Promise<boolean> {
    // Local memory cache is always healthy
    return true;
  }

  async connect(): Promise<void> {
    // Local memory cache doesn't require connection
    return Promise.resolve();
  }

  async disconnect(): Promise<void> {
    // Local memory cache doesn't require disconnection
    return Promise.resolve();
  }
}
