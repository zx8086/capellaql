// src/services/cache-health.service.ts

import { getCachingConfig } from "../config";
import type { IKongCacheService } from "../config/schemas";
import { log } from "../utils/logger";
import { formatResponseTime } from "../utils/performance";

export interface CacheHealthResult {
  status: "healthy" | "unhealthy" | "degraded";
  type: "redis" | "memory";
  serverType?: "redis" | "valkey";
  responseTime: string;
}

export class CacheHealthService {
  private static instance: CacheHealthService;
  private lastHealthCheck?: CacheHealthResult;
  private lastCheckTime = 0;
  private readonly CACHE_TTL_MS = 2000; // 2 seconds cache for health results

  static getInstance(): CacheHealthService {
    if (!CacheHealthService.instance) {
      CacheHealthService.instance = new CacheHealthService();
    }
    return CacheHealthService.instance;
  }

  async checkCacheHealth(cacheService: IKongCacheService): Promise<CacheHealthResult> {
    const now = Date.now();

    if (this.lastHealthCheck && now - this.lastCheckTime < this.CACHE_TTL_MS) {
      return this.lastHealthCheck;
    }

    const cachingConfig = getCachingConfig();

    let result: CacheHealthResult;

    if (cachingConfig.highAvailability) {
      result = await this.checkRedisHealth(cacheService);
    } else {
      result = await this.checkMemoryHealth(cacheService);
    }

    this.lastHealthCheck = result;
    this.lastCheckTime = now;

    return result;
  }

  private async checkRedisHealth(cacheService: IKongCacheService): Promise<CacheHealthResult> {
    const startTime = Bun.nanoseconds();

    try {
      // cacheService is UnifiedCacheManager which wraps SharedRedisBackend which wraps SharedRedisCache
      const cacheManager = cacheService as import("../cache/cache-manager").UnifiedCacheManager;
      const redisClient = cacheManager.getClientForHealthCheck?.();
      if (redisClient) {
        const pingResult = await Promise.race([
          redisClient.send("PING", []),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Health check timeout")), 1000)
          ),
        ]);

        if (pingResult !== "PONG") {
          throw new Error("PING command failed");
        }

        const responseTime = (Bun.nanoseconds() - startTime) / 1_000_000;
        const serverType = await cacheManager.getServerType?.();

        return {
          status: "healthy",
          type: "redis",
          serverType: serverType || "redis",
          responseTime: formatResponseTime(responseTime),
        };
      } else {
        const responseTime = (Bun.nanoseconds() - startTime) / 1_000_000;

        return {
          status: "healthy",
          type: "redis",
          serverType: "redis",
          responseTime: formatResponseTime(responseTime),
        };
      }
    } catch (error) {
      const responseTime = (Bun.nanoseconds() - startTime) / 1_000_000;

      log("Redis health check failed", {
        component: "cache-health",
        operation: "redis_health_check",
        error: error instanceof Error ? error.message : "Unknown error",
        responseTime: formatResponseTime(responseTime),
      });

      return {
        status: "unhealthy",
        type: "redis",
        serverType: "redis",
        responseTime: formatResponseTime(responseTime),
      };
    }
  }

  private async checkMemoryHealth(_cacheService: IKongCacheService): Promise<CacheHealthResult> {
    const startTime = Bun.nanoseconds();

    try {
      const responseTime = (Bun.nanoseconds() - startTime) / 1_000_000;

      return {
        status: "healthy",
        type: "memory",
        responseTime: formatResponseTime(responseTime),
      };
    } catch (error) {
      const responseTime = (Bun.nanoseconds() - startTime) / 1_000_000;

      log("Memory cache health check failed", {
        component: "cache-health",
        operation: "memory_health_check",
        error: error instanceof Error ? error.message : "Unknown error",
        responseTime: formatResponseTime(responseTime),
      });

      return {
        status: "unhealthy",
        type: "memory",
        responseTime: formatResponseTime(responseTime),
      };
    }
  }

  async cleanup(): Promise<void> {
    this.lastHealthCheck = undefined;
    this.lastCheckTime = 0;
  }
}
