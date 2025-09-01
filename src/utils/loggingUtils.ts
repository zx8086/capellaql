/* src/utils/loggingUtils.ts - Logging Utilities for Consistent Business Impact Tracking */

export type BusinessImpactSeverity = "low" | "medium" | "high" | "critical";
export type BusinessOperationCategory = "query" | "mutation" | "subscription" | "system" | "health";
export type BusinessCostTier = "standard" | "priority" | "critical";

export interface BusinessImpact {
  severity: BusinessImpactSeverity;
  operationCategory: BusinessOperationCategory;
  costTier: BusinessCostTier;
}

/**
 * Standard business impact configurations for common scenarios
 */
export const BusinessImpacts = {
  // System lifecycle events
  SYSTEM_STARTUP: {
    severity: "low" as BusinessImpactSeverity,
    operationCategory: "system" as BusinessOperationCategory,
    costTier: "standard" as BusinessCostTier,
  },
  SYSTEM_SHUTDOWN: {
    severity: "high" as BusinessImpactSeverity,
    operationCategory: "system" as BusinessOperationCategory,
    costTier: "critical" as BusinessCostTier,
  },
  SYSTEM_ERROR: {
    severity: "critical" as BusinessImpactSeverity,
    operationCategory: "system" as BusinessOperationCategory,
    costTier: "critical" as BusinessCostTier,
  },

  // Database operations
  DATABASE_CONNECTION: {
    severity: "medium" as BusinessImpactSeverity,
    operationCategory: "system" as BusinessOperationCategory,
    costTier: "priority" as BusinessCostTier,
  },
  DATABASE_ERROR: {
    severity: "critical" as BusinessImpactSeverity,
    operationCategory: "system" as BusinessOperationCategory,
    costTier: "critical" as BusinessCostTier,
  },
  DATABASE_SLOW_QUERY: {
    severity: "medium" as BusinessImpactSeverity,
    operationCategory: "query" as BusinessOperationCategory,
    costTier: "priority" as BusinessCostTier,
  },

  // GraphQL operations
  GRAPHQL_QUERY_SUCCESS: {
    severity: "low" as BusinessImpactSeverity,
    operationCategory: "query" as BusinessOperationCategory,
    costTier: "standard" as BusinessCostTier,
  },
  GRAPHQL_QUERY_ERROR: {
    severity: "high" as BusinessImpactSeverity,
    operationCategory: "query" as BusinessOperationCategory,
    costTier: "critical" as BusinessCostTier,
  },
  GRAPHQL_MUTATION_SUCCESS: {
    severity: "low" as BusinessImpactSeverity,
    operationCategory: "mutation" as BusinessOperationCategory,
    costTier: "standard" as BusinessCostTier,
  },
  GRAPHQL_MUTATION_ERROR: {
    severity: "high" as BusinessImpactSeverity,
    operationCategory: "mutation" as BusinessOperationCategory,
    costTier: "critical" as BusinessCostTier,
  },

  // Cache operations
  CACHE_HIT: {
    severity: "low" as BusinessImpactSeverity,
    operationCategory: "query" as BusinessOperationCategory,
    costTier: "standard" as BusinessCostTier,
  },
  CACHE_MISS: {
    severity: "low" as BusinessImpactSeverity,
    operationCategory: "query" as BusinessOperationCategory,
    costTier: "standard" as BusinessCostTier,
  },
  CACHE_EVICTION: {
    severity: "medium" as BusinessImpactSeverity,
    operationCategory: "system" as BusinessOperationCategory,
    costTier: "priority" as BusinessCostTier,
  },

  // Security events
  RATE_LIMIT_EXCEEDED: {
    severity: "medium" as BusinessImpactSeverity,
    operationCategory: "system" as BusinessOperationCategory,
    costTier: "priority" as BusinessCostTier,
  },
  SECURITY_VIOLATION: {
    severity: "high" as BusinessImpactSeverity,
    operationCategory: "system" as BusinessOperationCategory,
    costTier: "critical" as BusinessCostTier,
  },
  CORS_VIOLATION: {
    severity: "medium" as BusinessImpactSeverity,
    operationCategory: "system" as BusinessOperationCategory,
    costTier: "priority" as BusinessCostTier,
  },

  // Performance events
  SLOW_REQUEST: {
    severity: "medium" as BusinessImpactSeverity,
    operationCategory: "query" as BusinessOperationCategory,
    costTier: "priority" as BusinessCostTier,
  },
  VERY_SLOW_REQUEST: {
    severity: "high" as BusinessImpactSeverity,
    operationCategory: "query" as BusinessOperationCategory,
    costTier: "critical" as BusinessCostTier,
  },

  // WebSocket operations
  WEBSOCKET_CONNECTION: {
    severity: "low" as BusinessImpactSeverity,
    operationCategory: "subscription" as BusinessOperationCategory,
    costTier: "standard" as BusinessCostTier,
  },
  WEBSOCKET_ERROR: {
    severity: "medium" as BusinessImpactSeverity,
    operationCategory: "subscription" as BusinessOperationCategory,
    costTier: "priority" as BusinessCostTier,
  },
} as const;

/**
 * Helper function to create performance categories
 */
export function getPerformanceCategory(durationMs: number): string {
  if (durationMs > 5000) return "very-slow";
  if (durationMs > 1000) return "slow";
  if (durationMs > 500) return "moderate";
  return "fast";
}

/**
 * Helper function to create cache key summaries for logging
 */
export function summarizeCacheKey(key: string, maxLength = 50): string {
  return key.length > maxLength ? key.substring(0, maxLength) + "..." : key;
}

/**
 * Helper function to mask sensitive information in URLs
 */
export function maskSensitiveUrl(url: string): string {
  return url.replace(/:\\/\\/.*@/, "://***@");
}

/**
 * Helper function to create consistent request metadata for logging
 */
export function createRequestMetadata(request: Request, additionalData?: Record<string, any>) {
  return {
    method: request.method,
    url: new URL(request.url).pathname,
    clientIp: getClientIp(request),
    userAgent: request.headers.get("user-agent")?.substring(0, 100),
    timestamp: new Date().toISOString(),
    ...additionalData,
  };
}

/**
 * Helper function to extract client IP from request
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  
  const otherHeaders = [
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-real-ip"),
    request.headers.get("x-client-ip")
  ];
  
  for (const ip of otherHeaders) {
    if (ip) return ip;
  }
  
  return "unknown";
}

/**
 * Helper function to create operation timing metadata
 */
export function createTimingMetadata(startTime: number, operationName?: string) {
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  return {
    operationName,
    startTime,
    endTime,
    durationMs: duration,
    performanceCategory: getPerformanceCategory(duration),
  };
}