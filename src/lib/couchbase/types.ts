/* src/lib/couchbase/types.ts */

import type { Bucket, Cluster, Collection, Scope } from "couchbase";

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

export interface PerformanceDetails {
  avgQueryTime?: number;
  errorRate?: number;
  documentsPerSecond?: number;
  connectionPoolSize?: number;
}

export interface ServiceHealthDetails {
  kv?: { status: string; healthy: boolean };
  query?: { status: string; healthy: boolean };
  analytics?: { status: string; healthy: boolean };
  search?: { status: string; healthy: boolean };
}

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

export interface RetryContext {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  fallback?: () => Promise<any>;
  onRetry?: (attempt: number, error: Error, nextDelay: number) => void;
}

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

export interface ErrorClassification {
  retryable: boolean;
  severity: "info" | "warning" | "critical";
  category: "client" | "network" | "server" | "application";
  shouldLog: boolean;
  shouldAlert: boolean;
  maxRetries?: number;
}

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

export interface KVGetOptions {
  project?: string[];
  withExpiry?: boolean;
  timeout?: number;
}

export interface KVUpsertOptions {
  durability?: "none" | "majority" | "majorityAndPersistToActive" | "persistToMajority";
  expiry?: number;
  cas?: string;
  timeout?: number;
}

export interface SubdocOperation {
  type: "upsert" | "insert" | "replace" | "remove" | "arrayAppend" | "arrayPrepend";
  path: string;
  value?: any;
}

export interface ConnectionStringMeta {
  isTls: boolean;
  isCapella: boolean;
  isDnsSrv: boolean;
  protocol: string;
  hosts: string[];
}

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
