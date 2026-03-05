// src/services/api-gateway.service.ts

import type { IAPIGatewayAdapter } from "../adapters/api-gateway-adapter.interface";
import type {
  ConsumerSecret,
  IKongService,
  KongCacheStats,
  KongHealthCheckResult,
} from "../config";
import type { OpossumCircuitBreakerStats } from "../types/circuit-breaker.types";

export class APIGatewayService implements IKongService {
  constructor(private readonly adapter: IAPIGatewayAdapter) {}

  async getConsumerSecret(consumerId: string): Promise<ConsumerSecret | null> {
    return await this.adapter.getConsumerSecret(consumerId);
  }

  async createConsumerSecret(consumerId: string): Promise<ConsumerSecret | null> {
    return await this.adapter.createConsumerSecret(consumerId);
  }

  async healthCheck(): Promise<KongHealthCheckResult> {
    return await this.adapter.healthCheck();
  }

  async clearCache(consumerId?: string): Promise<void> {
    return await this.adapter.clearCache(consumerId);
  }

  async getCacheStats(): Promise<KongCacheStats> {
    return await this.adapter.getCacheStats();
  }

  getCircuitBreakerStats(): Record<string, OpossumCircuitBreakerStats> {
    return this.adapter.getCircuitBreakerStats();
  }
}
