/* src/lib/queryCache.ts - Query Result Caching Layer */

import { log, err } from "../telemetry";

/**
 * Cache entry with TTL and metadata
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  hits: number;
  size: number; // Approximate size in bytes for memory management
}

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
  memoryUsage: number; // Approximate bytes
}

/**
 * Cache configuration options
 */
export interface CacheConfig {
  defaultTtl: number; // Default TTL in milliseconds
  maxSize: number; // Maximum number of entries
  maxMemory: number; // Maximum memory usage in bytes (approximate)
  cleanupInterval: number; // Cleanup interval in milliseconds
}

/**
 * LRU Cache with TTL for database query results
 */
export class QueryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private accessOrder = new Map<string, number>(); // For LRU tracking
  private stats: CacheStats = {
    size: 0,
    hits: 0,
    misses: 0,
    evictions: 0,
    memoryUsage: 0,
  };
  private accessCounter = 0;
  private cleanupTimer?: Timer;

  constructor(private config: CacheConfig = {
    defaultTtl: 5 * 60 * 1000, // 5 minutes
    maxSize: 1000,
    maxMemory: 10 * 1024 * 1024, // 10MB
    cleanupInterval: 60 * 1000, // 1 minute
  }) {
    this.startCleanupTimer();
    log("QueryCache initialized", {
      maxSize: config.maxSize,
      defaultTtl: config.defaultTtl,
      maxMemory: config.maxMemory,
    });
  }

  /**
   * Get cached data or execute fetcher function
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = this.config.defaultTtl
  ): Promise<T> {
    // Check if key exists and is not expired
    const cached = this.cache.get(key);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < cached.ttl) {
      // Cache hit - update access order and stats
      this.updateAccessOrder(key);
      cached.hits++;
      this.stats.hits++;
      
      log("Cache hit", { key, age: now - cached.timestamp, hits: cached.hits });
      return cached.data;
    }

    // Cache miss - remove expired entry if it exists
    if (cached) {
      this.remove(key);
    }

    this.stats.misses++;
    log("Cache miss", { key, expired: !!cached });

    try {
      // Fetch fresh data
      const data = await fetcher();
      
      // Store in cache
      this.set(key, data, ttl);
      
      return data;
    } catch (error) {
      err("Cache fetcher failed", { key, error });
      throw error;
    }
  }

  /**
   * Set data in cache
   */
  set<T>(key: string, data: T, ttl: number = this.config.defaultTtl): void {
    const size = this.estimateSize(data);
    const now = Date.now();

    // Check if we need to make space
    this.ensureCapacity(size);

    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      ttl,
      hits: 0,
      size,
    };

    this.cache.set(key, entry);
    this.updateAccessOrder(key);
    
    this.stats.size = this.cache.size;
    this.stats.memoryUsage += size;

    log("Cache set", { key, size, ttl, totalSize: this.stats.size });
  }

  /**
   * Get data from cache without fetching
   */
  get<T>(key: string): T | undefined {
    const cached = this.cache.get(key);
    const now = Date.now();

    if (!cached || (now - cached.timestamp) >= cached.ttl) {
      if (cached) {
        this.remove(key);
      }
      this.stats.misses++;
      return undefined;
    }

    this.updateAccessOrder(key);
    cached.hits++;
    this.stats.hits++;
    
    return cached.data;
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const cached = this.cache.get(key);
    const now = Date.now();

    if (!cached || (now - cached.timestamp) >= cached.ttl) {
      if (cached) {
        this.remove(key);
      }
      return false;
    }

    return true;
  }

  /**
   * Remove entry from cache
   */
  remove(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this.stats.size = this.cache.size;
      this.stats.memoryUsage -= entry.size;
      
      log("Cache remove", { key, size: entry.size });
      return true;
    }
    return false;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const oldSize = this.cache.size;
    this.cache.clear();
    this.accessOrder.clear();
    this.stats = {
      size: 0,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      memoryUsage: 0,
    };
    
    log("Cache cleared", { oldSize });
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Invalidate entries by key pattern
   */
  invalidatePattern(pattern: RegExp): number {
    let count = 0;
    
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.remove(key);
        count++;
      }
    }
    
    log("Cache pattern invalidation", { pattern: pattern.toString(), count });
    return count;
  }

  /**
   * Create a cache key from query parameters
   */
  static createKey(
    operation: string,
    params: Record<string, any>,
    collection?: string
  ): string {
    const keyParts = [
      operation,
      collection || 'default',
      JSON.stringify(params, Object.keys(params).sort()),
    ];
    
    return keyParts.join(':');
  }

  /**
   * Update access order for LRU eviction
   */
  private updateAccessOrder(key: string): void {
    this.accessOrder.set(key, ++this.accessCounter);
  }

  /**
   * Ensure cache has capacity for new entry
   */
  private ensureCapacity(newEntrySize: number): void {
    // Check memory limit
    if (this.stats.memoryUsage + newEntrySize > this.config.maxMemory) {
      this.evictByMemory(newEntrySize);
    }

    // Check size limit
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU(1);
    }
  }

  /**
   * Evict entries to free memory
   */
  private evictByMemory(requiredSpace: number): void {
    const entries = Array.from(this.cache.entries())
      .map(([key, entry]) => ({ key, entry, lastAccess: this.accessOrder.get(key) || 0 }))
      .sort((a, b) => a.lastAccess - b.lastAccess);

    let freedSpace = 0;
    let evicted = 0;

    for (const { key } of entries) {
      if (freedSpace >= requiredSpace) break;
      
      const entry = this.cache.get(key);
      if (entry) {
        freedSpace += entry.size;
        this.remove(key);
        evicted++;
      }
    }

    this.stats.evictions += evicted;
    log("Cache memory eviction", { evicted, freedSpace, requiredSpace });
  }

  /**
   * Evict least recently used entries
   */
  private evictLRU(count: number): void {
    const entries = Array.from(this.accessOrder.entries())
      .sort((a, b) => a[1] - b[1]) // Sort by access order
      .slice(0, count);

    for (const [key] of entries) {
      this.remove(key);
    }

    this.stats.evictions += entries.length;
    log("Cache LRU eviction", { evicted: entries.length });
  }

  /**
   * Estimate size of data in bytes (rough approximation)
   */
  private estimateSize(data: any): number {
    if (data === null || data === undefined) return 8;
    
    const jsonString = JSON.stringify(data);
    return jsonString.length * 2; // Rough estimate for UTF-16
  }

  /**
   * Start cleanup timer to remove expired entries
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if ((now - entry.timestamp) >= entry.ttl) {
        this.remove(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log("Cache cleanup", { cleaned, remaining: this.cache.size });
    }
  }

  /**
   * Stop the cache and cleanup resources
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clear();
    log("QueryCache destroyed");
  }
}

// Default cache instance
export const defaultQueryCache = new QueryCache();

/**
 * Helper function to cache database operations
 */
export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl?: number
): Promise<T> {
  return defaultQueryCache.getOrSet(key, fetcher, ttl);
}

/**
 * Helper to create cache keys for common operations
 */
export const CacheKeys = {
  looks: (brand: string, season: string, division: string) =>
    QueryCache.createKey('looks', { brand, season, division }),
  
  lookDetails: (lookId: string) =>
    QueryCache.createKey('lookDetails', { lookId }),
  
  options: (lookId: string, filters?: Record<string, any>) =>
    QueryCache.createKey('options', { lookId, ...filters }),
  
  optionsSummary: (brand: string, season: string, division: string) =>
    QueryCache.createKey('optionsSummary', { brand, season, division }),
    
  assignments: (userId: string, status?: string) =>
    QueryCache.createKey('assignments', { userId, status }),
};