/* src/lib/couchbase/types.ts */

import type { Bucket, Cluster, Collection, Scope } from "couchbase";

/**
 * Enhanced connection interface with all SDK features
 */
export interface CouchbaseConnection {
  // Core SDK objects
  cluster: Cluster;
  bucket: (name?: string) => Bucket;
  scope: (bucketName?: string, scopeName?: string) => Scope;
  collection: (bucketName?: string, scopeName?: string, collectionName?: string) => Collection;

  // Default references (cached)
  defaultBucket: Bucket;
  defaultScope: Scope;
  defaultCollection: Collection;

  // Enhanced methods
  getHealth: () => Promise<HealthStatus>;
  executeWithRetry?: <T>(operation: () => Promise<T>, context?: RetryContext) => Promise<T>;

  // Error classes (for instanceof checks)
  errors: {
    DocumentNotFoundError: any;
    CouchbaseError: any;
    TimeoutError: any;
    AuthenticationFailureError: any;
    CasMismatchError: any;
    TemporaryFailureError: any;
  };
}

/**
 * Health status with diagnostics support
 */
export interface HealthStatus {
  status: "healthy" | "unhealthy" | "degraded" | "disconnected" | "critical";
  timestamp: number;
  error?: string;
  details?: {
    latency?: number;
    services?: Record<string, boolean>;
    healthPercentage?: number;
    diagnosticsId?: string;
    healthyEndpoints?: number;
    totalEndpoints?: number;
    connection?: "connected" | "disconnected" | "connecting" | "error";
    circuitBreaker?: CircuitBreakerStats;
    performance?: PerformanceDetails;
    serviceHealth?: ServiceHealthDetails;
    errors?: string[];
    warnings?: string[];
    recommendations?: string[];
    [key: string]: any;
  };
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  state: "closed" | "open" | "half-open";
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastSuccessTime?: number | null;
  nextAttemptTime: number | null;
  isHealthy?: boolean;
  successRate?: number;
  totalOperations?: number;
  errorRate?: number;
}

/**
 * Performance details for health reporting
 */
export interface PerformanceDetails {
  avgQueryTime?: number;
  errorRate?: number;
  documentsPerSecond?: number;
  connectionPoolSize?: number;
}

/**
 * Service health details
 */
export interface ServiceHealthDetails {
  kv?: { status: string; healthy: boolean };
  query?: { status: string; healthy: boolean };
  analytics?: { status: string; healthy: boolean };
  search?: { status: string; healthy: boolean };
}

/**
 * Connection metrics
 */
export interface ConnectionMetrics {
  totalConnections: number;
  failedConnections: number;
  successfulConnections: number;
  totalQueries: number;
  failedQueries: number;
  avgQueryTime: number;
  lastConnectionTime: Date | null;
  lastQueryTime: Date | null;
  circuitBreakerState: "closed" | "open" | "half-open";
}

/**
 * Retry context for operations
 */
export interface RetryContext {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  fallback?: () => Promise<any>;
  onRetry?: (attempt: number, error: Error, nextDelay: number) => void;
}

/**
 * Operation context for error handling and logging
 */
export interface OperationContext {
  operationType: string;
  operationId?: string;
  bucket?: string;
  scope?: string;
  collection?: string;
  documentKey?: string;
  query?: string;
  requestId?: string;
}

/**
 * Error context with SDK information
 */
export interface CouchbaseErrorContext {
  message: string;
  cause?: Error;
  errorCode?: number;
  errorName?: string;
  operation?: string;
  documentKey?: string;
  isRetryable: boolean;
  isCritical: boolean;
  isTransient: boolean;
  cas?: string;
  statement?: string;
  queryId?: string;
}

/**
 * Error classification structure (preserved from existing implementation)
 */
export interface ErrorClassification {
  retryable: boolean;
  severity: "info" | "warning" | "critical";
  category: "client" | "network" | "server" | "application";
  shouldLog: boolean;
  shouldAlert: boolean;
  maxRetries?: number;
}

/**
 * Query execution options
 */
export interface QueryExecutionOptions {
  parameters?: Record<string, any>;
  usePreparedStatement?: boolean;
  queryContext?: string;
  profile?: boolean;
  metrics?: boolean;
  timeout?: number;
  scanConsistency?: "notBounded" | "requestPlus" | "atPlus";
  readonly?: boolean;
  maxRetries?: number;
  requestId?: string;
  clientContextId?: string;
}

/**
 * KV get options
 */
export interface KVGetOptions {
  project?: string[];
  withExpiry?: boolean;
  timeout?: number;
}

/**
 * KV upsert options
 */
export interface KVUpsertOptions {
  durability?: "none" | "majority" | "majorityAndPersistToActive" | "persistToMajority";
  expiry?: number;
  cas?: string;
  timeout?: number;
}

/**
 * Subdocument operation definition
 */
export interface SubdocOperation {
  type: "upsert" | "insert" | "replace" | "remove" | "arrayAppend" | "arrayPrepend";
  path: string;
  value?: any;
}

/**
 * Connection string metadata
 */
export interface ConnectionStringMeta {
  isTls: boolean;
  isCapella: boolean;
  isDnsSrv: boolean;
  protocol: string;
  hosts: string[];
}

/**
 * Complete configuration interface for Couchbase
 */
export interface CouchbaseConfig {
  // Connection
  connectionString: string;
  username: string;
  password: string;
  bucketName: string;
  scopeName?: string;
  collectionName?: string;

  // TLS/Security
  trustStorePath?: string;

  // Timeouts (milliseconds)
  timeouts?: {
    connectTimeout?: number;
    bootstrapTimeout?: number;
    resolveTimeout?: number;
    kvTimeout?: number;
    kvDurableTimeout?: number;
    queryTimeout?: number;
    analyticsTimeout?: number;
    searchTimeout?: number;
    viewTimeout?: number;
    managementTimeout?: number;
  };

  // Connection options
  compression?: {
    enabled?: boolean;
    minSize?: number;
    minRatio?: number;
  };

  // Threshold logging
  thresholdLogging?: {
    enabled?: boolean;
    kvThreshold?: number;
    queryThreshold?: number;
    analyticsThreshold?: number;
    searchThreshold?: number;
    interval?: number;
  };

  // Feature flags
  features?: {
    enableObservability?: boolean;
    enablePerformance?: boolean;
    enableResilience?: boolean;
  };
}
