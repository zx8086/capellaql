// src/adapters/kong.adapter.ts

import type {
  ConsumerResponse,
  ConsumerSecret,
  IKongCacheService,
  KongCacheStats,
  KongHealthCheckResult,
  KongModeType,
} from "../config";
import {
  ConsumerResponseLenientSchema,
  ConsumerSecretLenientSchema,
  getCachingConfig,
  getKongConfig,
} from "../config";
import { CacheFactory } from "../services/cache/cache-factory";
import { KongCircuitBreakerService } from "../services/circuit-breaker.service";
import { recordError, recordKongOperation } from "../telemetry/metrics";
import { SpanEvents, telemetryEmitter } from "../telemetry/tracer";
import type { OpossumCircuitBreakerStats } from "../types/circuit-breaker.types";
import { fetchWithFallback } from "../utils/bun-fetch-fallback";
import { withRetry } from "../utils/retry";
import { validateExternalData } from "../utils/validation";
import type { IAPIGatewayAdapter, IKongModeStrategy } from "./api-gateway-adapter.interface";
import { createKongModeStrategy } from "./kong-mode-strategies";
import {
  createKongApiError,
  createRequestTimeout,
  extractConsumerSecret,
  generateCacheKey,
  generateJwtKey,
  generateSecureSecret,
  isConsumerNotFound,
  isSuccessResponse,
} from "./kong-utils";

// Unified adapter for Kong API Gateway and Kong Konnect using strategy pattern
export class KongAdapter implements IAPIGatewayAdapter {
  private readonly strategy: IKongModeStrategy;
  private cache: IKongCacheService | null = null;
  private circuitBreaker: KongCircuitBreakerService;

  constructor(
    private readonly mode: KongModeType,
    private readonly adminUrl: string,
    private readonly adminToken: string
  ) {
    this.strategy = createKongModeStrategy(mode, adminUrl, adminToken);

    const kongConfig = getKongConfig();
    const cachingConfig = getCachingConfig();
    const circuitBreakerConfig = {
      ...kongConfig.circuitBreaker,
      highAvailability: kongConfig.highAvailability,
    };

    this.circuitBreaker = new KongCircuitBreakerService(
      circuitBreakerConfig,
      cachingConfig,
      undefined
    );

    this.initializeCache();
  }

  private async initializeCache(): Promise<void> {
    try {
      this.cache = await CacheFactory.createKongCache();

      const kongConfig = getKongConfig();
      if (kongConfig.highAvailability && this.cache) {
        const circuitBreakerConfig = {
          ...kongConfig.circuitBreaker,
          highAvailability: kongConfig.highAvailability,
        };
        const cachingConfig = getCachingConfig();
        this.circuitBreaker = new KongCircuitBreakerService(
          circuitBreakerConfig,
          cachingConfig,
          this.cache
        );
      }
    } catch (error) {
      telemetryEmitter.error(
        SpanEvents.CACHE_FACTORY_FAILED,
        "Failed to initialize Kong adapter cache",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          mode: this.mode,
          operation: "cache_initialization",
        }
      );
    }
  }

  async getConsumerSecret(consumerId: string): Promise<ConsumerSecret | null> {
    await this.ensureCacheInitialized();

    const cacheKey = generateCacheKey(consumerId);

    const cached = await this.cache?.get(cacheKey);
    if (cached) {
      return cached;
    }

    return await this.circuitBreaker.wrapKongConsumerOperation(
      "getConsumerSecret",
      consumerId,
      async () => {
        if (this.strategy.ensurePrerequisites) {
          await this.strategy.ensurePrerequisites();
        }

        let resolvedConsumerId = consumerId;
        if (this.strategy.resolveConsumerId) {
          const resolved = await this.strategy.resolveConsumerId(consumerId);
          if (!resolved) {
            return null;
          }
          resolvedConsumerId = resolved;
        }

        const url = await this.strategy.buildConsumerUrl(this.adminUrl, resolvedConsumerId);

        const response = await withRetry(
          () =>
            fetchWithFallback(url, {
              method: "GET",
              headers: this.strategy.createAuthHeaders(this.adminToken),
              signal: createRequestTimeout(5000),
            }),
          { maxAttempts: 2, baseDelayMs: 100 }
        );

        if (!isSuccessResponse(response)) {
          if (isConsumerNotFound(response)) {
            return null;
          }

          throw await createKongApiError(response);
        }

        const rawData = await response.json();
        const validationResult = validateExternalData(ConsumerResponseLenientSchema, rawData, {
          source: "kong_api",
          operation: "getConsumerSecret",
          consumerId,
        });
        const data = validationResult.data as ConsumerResponse | undefined;
        const secret = data ? extractConsumerSecret(data) : null;

        if (!secret) {
          return null;
        }

        // Prevent cache pollution - validate consumer ID matches before caching
        if (secret.consumer && secret.consumer.id !== consumerId) {
          telemetryEmitter.error(
            SpanEvents.KONG_CONSUMER_MISMATCH,
            "Consumer ID mismatch in Kong response, not caching",
            {
              operation: "getConsumerSecret",
              requested_consumer_id: consumerId,
              response_consumer_id: secret.consumer.id,
              cache_key: cacheKey,
              component: "kong_adapter",
              action: "consumer_id_mismatch",
              mode: this.mode,
            }
          );
          return secret;
        }

        await this.cache?.set(cacheKey, secret);

        return secret;
      }
    );
  }

  async createConsumerSecret(consumerId: string): Promise<ConsumerSecret | null> {
    return await this.circuitBreaker.wrapKongConsumerOperation(
      "createConsumerSecret",
      consumerId,
      async () => {
        if (this.strategy.ensurePrerequisites) {
          await this.strategy.ensurePrerequisites();
        }

        let resolvedConsumerId = consumerId;
        if (this.strategy.resolveConsumerId) {
          const resolved = await this.strategy.resolveConsumerId(consumerId);
          if (!resolved) {
            return null;
          }
          resolvedConsumerId = resolved;
        }

        const url = await this.strategy.buildConsumerUrl(this.adminUrl, resolvedConsumerId);
        const maxRetries = 3;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          const key = generateJwtKey();
          const secret = generateSecureSecret();

          const response = await fetchWithFallback(url, {
            method: "POST",
            headers: this.strategy.createAuthHeaders(this.adminToken),
            body: JSON.stringify({
              key: key,
              secret: secret,
            }),
            signal: createRequestTimeout(10000),
          });

          if (isSuccessResponse(response)) {
            const rawCreatedSecret = await response.json();
            const createValidationResult = validateExternalData(
              ConsumerSecretLenientSchema,
              rawCreatedSecret,
              {
                source: "kong_api",
                operation: "createConsumerSecret",
                consumerId,
              }
            );
            const createdSecret = createValidationResult.data as ConsumerSecret | undefined;

            if (!createdSecret) {
              telemetryEmitter.error(
                SpanEvents.KONG_CONSUMER_NOT_FOUND,
                "Failed to validate created secret from Kong",
                {
                  operation: "createConsumerSecret",
                  consumer_id: consumerId,
                  component: "kong_adapter",
                  mode: this.mode,
                }
              );
              return null;
            }

            // Prevent cache pollution - validate consumer ID matches before caching
            if (createdSecret.consumer && createdSecret.consumer.id !== consumerId) {
              telemetryEmitter.error(
                SpanEvents.KONG_CONSUMER_MISMATCH,
                "Consumer ID mismatch in Kong create response, not caching",
                {
                  operation: "createConsumerSecret",
                  requested_consumer_id: consumerId,
                  response_consumer_id: createdSecret.consumer.id,
                  component: "kong_adapter",
                  action: "consumer_id_mismatch",
                  mode: this.mode,
                }
              );
              return createdSecret;
            }

            await this.ensureCacheInitialized();
            const cacheKey = generateCacheKey(consumerId);
            await this.cache?.set(cacheKey, createdSecret);

            return createdSecret;
          }

          if (isConsumerNotFound(response)) {
            telemetryEmitter.warn(
              SpanEvents.KONG_CONSUMER_NOT_FOUND,
              "Consumer not found when creating JWT credentials",
              {
                consumer_id: consumerId,
                message:
                  "Consumer must be created in Kong before JWT credentials can be provisioned",
                operation: "create_consumer_secret",
                mode: this.mode,
              }
            );
            return null;
          }

          // Handle 409 Conflict (unique constraint violation) - retry with new key
          if (response.status === 409) {
            telemetryEmitter.warn(
              SpanEvents.KONG_REQUEST_RETRIED,
              "JWT key collision detected, retrying with new key",
              {
                consumer_id: consumerId,
                attempt,
                max_retries: maxRetries,
                status: response.status,
                operation: "create_consumer_secret",
                mode: this.mode,
              }
            );

            if (attempt < maxRetries) {
              continue; // Retry with new key
            }

            // Max retries exhausted
            const kongError = await createKongApiError(response);
            telemetryEmitter.error(
              SpanEvents.KONG_REQUEST_FAILED,
              "Failed to create JWT credentials after max retries due to key collisions",
              {
                consumer_id: consumerId,
                error: kongError.message,
                status: kongError.status,
                attempts: maxRetries,
                operation: "create_jwt_credentials",
                mode: this.mode,
              }
            );
            throw kongError;
          }

          // Other errors - fail immediately
          const kongError = await createKongApiError(response);
          telemetryEmitter.error(
            SpanEvents.KONG_REQUEST_FAILED,
            "Failed to create JWT credentials in Kong",
            {
              consumer_id: consumerId,
              error: kongError.message,
              status: kongError.status,
              operation: "create_jwt_credentials",
              mode: this.mode,
            }
          );
          throw kongError;
        }

        // Should never reach here, but TypeScript needs this
        return null;
      }
    );
  }

  async healthCheck(): Promise<KongHealthCheckResult> {
    const startTime = Bun.nanoseconds();

    try {
      const result = await this.circuitBreaker.wrapKongOperation<KongHealthCheckResult>(
        "healthCheck",
        async () => {
          const url = this.strategy.buildHealthUrl(this.adminUrl);

          const response = await withRetry(
            () =>
              fetchWithFallback(url, {
                method: "GET",
                headers: this.strategy.createAuthHeaders(this.adminToken),
                signal: createRequestTimeout(5000),
              }),
            { maxAttempts: 2, baseDelayMs: 50 }
          );

          const responseTime = (Bun.nanoseconds() - startTime) / 1_000_000;

          if (isSuccessResponse(response)) {
            recordKongOperation("health_check", responseTime, true);
            telemetryEmitter.debug(
              SpanEvents.KONG_REQUEST_SUCCESS,
              "Kong health check successful",
              {
                response_time_ms: responseTime,
                operation: "health_check",
                mode: this.mode,
              }
            );
            return { healthy: true, responseTime };
          } else {
            const kongError = await createKongApiError(response);

            recordKongOperation("health_check", responseTime, false);
            recordError("kong_health_check_failed", {
              status: kongError.status,
              statusText: kongError.statusText,
              mode: this.mode,
            });

            telemetryEmitter.error(SpanEvents.KONG_REQUEST_FAILED, "Kong health check failed", {
              status: kongError.status,
              status_text: kongError.statusText,
              error: kongError.message,
              operation: "health_check",
              mode: this.mode,
            });

            // Throw infrastructure errors to trigger circuit breaker
            if (kongError.isInfrastructureError) {
              throw kongError;
            }

            return {
              healthy: false,
              responseTime,
              error: kongError.message,
            };
          }
        }
      );

      if (result === null) {
        const responseTime = (Bun.nanoseconds() - startTime) / 1_000_000;
        recordKongOperation("health_check", responseTime, false);
        recordError("kong_health_check_circuit_breaker", {
          status: "circuit_open",
          message: "Circuit breaker rejected request",
          mode: this.mode,
        });

        return {
          healthy: false,
          responseTime,
          error: "Circuit breaker open - Kong Admin API unavailable",
        };
      }

      return result;
    } catch (error) {
      const responseTime = (Bun.nanoseconds() - startTime) / 1_000_000;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      recordKongOperation("health_check", responseTime, false);
      recordError("kong_health_check_error", {
        error: errorMessage,
        message: "Health check failed with error",
        mode: this.mode,
      });

      return {
        healthy: false,
        responseTime,
        error: errorMessage,
      };
    }
  }

  async clearCache(consumerId?: string): Promise<void> {
    await this.ensureCacheInitialized();

    if (consumerId) {
      const cacheKey = generateCacheKey(consumerId);
      await this.cache?.delete(cacheKey);
    } else {
      await this.cache?.clear();
    }
  }

  async getCacheStats(): Promise<KongCacheStats> {
    await this.ensureCacheInitialized();
    if (!this.cache) {
      throw new Error("Cache not initialized");
    }
    return await this.cache.getStats();
  }

  getCircuitBreakerStats(): Record<string, OpossumCircuitBreakerStats> {
    return this.circuitBreaker.getStats();
  }

  private async ensureCacheInitialized(): Promise<void> {
    if (!this.cache) {
      this.cache = await CacheFactory.createKongCache();
    }
  }
}
