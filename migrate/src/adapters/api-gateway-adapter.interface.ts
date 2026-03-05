// src/adapters/api-gateway-adapter.interface.ts

import type { ConsumerSecret, KongCacheStats, KongHealthCheckResult } from "../config";
import type { OpossumCircuitBreakerStats } from "../types/circuit-breaker.types";

// Unified interface for API gateway operations (Kong API Gateway, Kong Konnect, etc.)
export interface IAPIGatewayAdapter {
  getConsumerSecret(consumerId: string): Promise<ConsumerSecret | null>;
  createConsumerSecret(consumerId: string): Promise<ConsumerSecret | null>;
  healthCheck(): Promise<KongHealthCheckResult>;
  clearCache(consumerId?: string): Promise<void>;
  getCacheStats(): Promise<KongCacheStats>;
  getCircuitBreakerStats(): Record<string, OpossumCircuitBreakerStats>;
}

// Strategy interface for mode-specific operations (API_GATEWAY vs KONNECT)
export interface IKongModeStrategy {
  buildConsumerUrl(baseUrl: string, consumerId: string): Promise<string>;
  buildHealthUrl(baseUrl: string): string;
  createAuthHeaders(token: string): Record<string, string>;
  ensurePrerequisites?(): Promise<void>;
  resolveConsumerId?(consumerId: string): Promise<string | null>;
}
