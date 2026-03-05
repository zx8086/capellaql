// src/services/cache/cache-factory.ts

import type { CacheManagerConfig } from "../../cache/cache.interface";
import { UnifiedCacheManager } from "../../cache/cache-manager";
import { getCachingConfig } from "../../config";
import type { IKongCacheService } from "../../config/schemas";
import { SpanEvents, telemetryEmitter } from "../../telemetry/tracer";

export class CacheFactory {
  private static instance: IKongCacheService | null = null;
  private static currentConfig: string | null = null;
  private static initializationPromise: Promise<void> | null = null;

  static async createKongCache(): Promise<IKongCacheService> {
    const config = getCachingConfig();
    const configKey = `${config.highAvailability}-${config.redisUrl}-${config.redisDb}-${config.ttlSeconds}`;

    if (CacheFactory.instance && CacheFactory.currentConfig === configKey) {
      return CacheFactory.instance;
    }

    if (CacheFactory.initializationPromise) {
      await CacheFactory.initializationPromise;
      if (CacheFactory.instance && CacheFactory.currentConfig === configKey) {
        return CacheFactory.instance;
      }
    }

    if (CacheFactory.instance && CacheFactory.instance instanceof UnifiedCacheManager) {
      try {
        const managerConfig = CacheFactory.createManagerConfig(config);
        await CacheFactory.instance.reconfigure(managerConfig);
        CacheFactory.currentConfig = configKey;
        return CacheFactory.instance;
      } catch (error) {
        telemetryEmitter.warn(
          SpanEvents.CACHE_FACTORY_RECONFIGURE_FAILED,
          "Failed to reconfigure existing cache manager, creating new instance",
          {
            error: error instanceof Error ? error.message : "Unknown error",
            component: "cache_factory",
            operation: "reconfigure_failed",
          }
        );
      }
    }

    CacheFactory.initializationPromise = CacheFactory.initializeCache(config, configKey);
    await CacheFactory.initializationPromise;
    CacheFactory.initializationPromise = null;

    if (!CacheFactory.instance) {
      throw new Error("Cache initialization failed");
    }
    return CacheFactory.instance;
  }

  private static async initializeCache(
    config: CacheManagerConfig,
    configKey: string
  ): Promise<void> {
    telemetryEmitter.info(
      SpanEvents.CACHE_FACTORY_INITIALIZING,
      "Initializing Unified Cache Manager",
      {
        strategy: config.highAvailability ? "shared-redis" : "local-memory",
        redis_url: config.redisUrl || "redis://localhost:6379",
        redis_db: config.redisDb,
        ttl_seconds: config.ttlSeconds,
        component: "cache_factory",
        operation: "initialization",
      }
    );

    try {
      const managerConfig = CacheFactory.createManagerConfig(config);
      const cacheManager = new UnifiedCacheManager(managerConfig);

      await cacheManager.isHealthy();

      CacheFactory.instance = cacheManager;
      CacheFactory.currentConfig = configKey;

      telemetryEmitter.info(
        SpanEvents.CACHE_FACTORY_CREATED,
        "Unified Cache Manager initialized successfully",
        {
          strategy: cacheManager.getStrategy() ?? "unknown",
          backend: cacheManager.getBackendName() ?? "unknown",
          component: "cache_factory",
          operation: "initialization_success",
        }
      );
    } catch (error) {
      telemetryEmitter.error(
        SpanEvents.CACHE_FACTORY_FAILED,
        "Failed to initialize Unified Cache Manager",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          component: "cache_factory",
          operation: "initialization_failed",
        }
      );
      throw error;
    }
  }

  private static createManagerConfig(config: CacheManagerConfig): CacheManagerConfig {
    return {
      highAvailability: config.highAvailability,
      redisUrl: config.redisUrl,
      redisPassword: config.redisPassword,
      redisDb: config.redisDb,
      ttlSeconds: config.ttlSeconds,
      staleDataToleranceMinutes: config.staleDataToleranceMinutes,
      maxMemoryEntries: 1000,
    };
  }

  static async reset(): Promise<void> {
    if (CacheFactory.instance && CacheFactory.instance instanceof UnifiedCacheManager) {
      try {
        await CacheFactory.instance.shutdown();
      } catch (error) {
        telemetryEmitter.warn(
          SpanEvents.CACHE_FACTORY_SHUTDOWN,
          "Error during cache shutdown in reset",
          {
            error: error instanceof Error ? error.message : "Unknown error",
            component: "cache_factory",
            operation: "reset_shutdown_error",
          }
        );
      }
    }
    CacheFactory.instance = null;
    CacheFactory.currentConfig = null;
    CacheFactory.initializationPromise = null;
  }
}
