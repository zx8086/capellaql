/* src/lib/couchbase/index.ts */

/**
 * Couchbase Connection Manager Module
 *
 * Production-ready Couchbase integration with ALL SDK best practices:
 *
 * HIGH PRIORITY (Critical Correctness):
 *   - SDK error types with instanceof checks
 *   - Bucket readiness verification via getAllScopes()
 *   - diagnostics() for health checks
 *   - ping() with ServiceType.KeyValue, ServiceType.Query
 *   - Error classification (retryable vs permanent)
 *
 * MEDIUM PRIORITY (Performance):
 *   - Prepared statements (adhoc: false)
 *   - Query context (bucket.scope)
 *   - Subdocument operations (mutateIn)
 *   - CAS conflict handling
 *   - Durability levels
 *   - Field projection
 *
 * LOW PRIORITY (Optimization):
 *   - Compression enabled
 *   - Threshold logging
 *   - Collection caching
 *   - Orphan response logging
 *   - DNS SRV support
 *
 * @module $lib/couchbase
 */

// =============================================================================
// CONNECTION MANAGER (Primary API)
// =============================================================================

export {
  CouchbaseConnectionManager,
  connectionManager,
} from "./connection-manager";

// =============================================================================
// TYPES
// =============================================================================

export type {
  // Health types
  CircuitBreakerStats,
  ConnectionMetrics,
  ConnectionStringMeta,
  // Configuration types
  CouchbaseConfig,
  // Connection types
  CouchbaseConnection,
  CouchbaseErrorContext,
  ErrorClassification,
  HealthStatus,
  KVGetOptions,
  KVUpsertOptions,
  // Operation types
  OperationContext,
  PerformanceDetails,
  QueryExecutionOptions,
  RetryContext,
  ServiceHealthDetails,
  SubdocOperation,
} from "./types";

// =============================================================================
// ERROR HANDLING
// =============================================================================

export {
  AmbiguousTimeoutError,
  AuthenticationFailureError,
  BucketNotFoundError,
  CasMismatchError,
  CollectionNotFoundError,
  // SDK error types (re-exported from couchbase)
  CouchbaseError,
  // Error classifier
  CouchbaseErrorClassifier,
  DmlFailureError,
  DocumentExistsError,
  DocumentLockedError,
  DocumentNotFoundError,
  DocumentNotLockedError,
  DurabilityAmbiguousError,
  DurabilityImpossibleError,
  DurabilityLevelNotAvailableError,
  DurableWriteInProgressError,
  FeatureNotAvailableError,
  IndexExistsError,
  IndexNotFoundError,
  ParsingFailureError,
  PathExistsError,
  PathInvalidError,
  PathMismatchError,
  PathNotFoundError,
  PreparedStatementFailureError,
  QuotaLimitedError,
  RateLimitedError,
  RequestCanceledError,
  ScopeNotFoundError,
  ServiceNotAvailableError,
  TemporaryFailureError,
  TimeoutError,
  UnambiguousTimeoutError,
  UnsupportedOperationError,
  ValueTooLargeError,
} from "./errors";

// =============================================================================
// CONFIGURATION
// =============================================================================

export {
  CouchbaseConfigSchema,
  loadCouchbaseConfig,
  parseConnectionString,
  validateProductionConfig,
} from "./config";

// =============================================================================
// CONNECTION OPTIONS
// =============================================================================

export {
  buildConnectionOptions,
  getOptimizedTimeouts,
  validateConnectionOptions,
} from "./connection-options";

// =============================================================================
// CIRCUIT BREAKER
// =============================================================================

export type { CircuitBreakerConfig } from "./circuit-breaker";
export {
  CircuitBreaker,
  CircuitBreakerOpenError,
  createCouchbaseCircuitBreaker,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from "./circuit-breaker";

// =============================================================================
// QUERY EXECUTOR
// =============================================================================

export {
  buildParameterizedQuery,
  createQueryContext,
  QueryExecutor,
} from "./query-executor";

// =============================================================================
// KV OPERATIONS
// =============================================================================

export { KVOperations } from "./kv-operations";

// =============================================================================
// REPOSITORY
// =============================================================================

export { CouchbaseRepository, createRepository } from "./repository";

// =============================================================================
// METRICS
// =============================================================================

export type { PerformanceStats, QueryMetric } from "./metrics";
export {
  couchbaseMetrics,
  getDiagnosticInfo,
  getErrorBreakdown,
  getPerformanceStats,
  getQueryTypeBreakdown,
  getSlowQueries,
  recordQuery,
  resetMetrics,
} from "./metrics";

// =============================================================================
// DATA LOADER
// =============================================================================

export type { CollectionKey, DocumentResult } from "./data-loader";
export {
  batchLoadDocuments,
  createDocumentDataLoader,
} from "./data-loader";

// =============================================================================
// TRANSACTION HANDLER
// =============================================================================

export type {
  TransactionConfig,
  TransactionOperationContext,
} from "./transaction-handler";
export { CouchbaseTransactionHandler } from "./transaction-handler";
