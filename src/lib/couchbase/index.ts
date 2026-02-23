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
  // Connection types
  CouchbaseConnection,
  HealthStatus,
  ConnectionMetrics,
  RetryContext,

  // Configuration types
  CouchbaseConfig,
  ConnectionStringMeta,

  // Operation types
  OperationContext,
  CouchbaseErrorContext,
  ErrorClassification,
  QueryExecutionOptions,
  KVGetOptions,
  KVUpsertOptions,
  SubdocOperation,

  // Health types
  CircuitBreakerStats,
  PerformanceDetails,
  ServiceHealthDetails,
} from "./types";

// =============================================================================
// ERROR HANDLING
// =============================================================================

export {
  // Error classifier
  CouchbaseErrorClassifier,

  // SDK error types (re-exported from couchbase)
  CouchbaseError,
  AuthenticationFailureError,
  BucketNotFoundError,
  ScopeNotFoundError,
  CollectionNotFoundError,
  DocumentNotFoundError,
  DocumentExistsError,
  DocumentLockedError,
  DocumentNotLockedError,
  ValueTooLargeError,
  CasMismatchError,
  TimeoutError,
  AmbiguousTimeoutError,
  UnambiguousTimeoutError,
  RequestCanceledError,
  ServiceNotAvailableError,
  ParsingFailureError,
  IndexNotFoundError,
  IndexExistsError,
  PreparedStatementFailureError,
  DmlFailureError,
  TemporaryFailureError,
  DurabilityImpossibleError,
  DurabilityAmbiguousError,
  DurableWriteInProgressError,
  DurabilityLevelNotAvailableError,
  PathNotFoundError,
  PathExistsError,
  PathMismatchError,
  PathInvalidError,
  RateLimitedError,
  QuotaLimitedError,
  FeatureNotAvailableError,
  UnsupportedOperationError,
} from "./errors";

// =============================================================================
// CONFIGURATION
// =============================================================================

export {
  CouchbaseConfigSchema,
  loadCouchbaseConfig,
  validateProductionConfig,
  parseConnectionString,
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

export {
  CircuitBreaker,
  CircuitBreakerOpenError,
  createCouchbaseCircuitBreaker,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from "./circuit-breaker";

export type { CircuitBreakerConfig } from "./circuit-breaker";

// =============================================================================
// QUERY EXECUTOR
// =============================================================================

export {
  QueryExecutor,
  buildParameterizedQuery,
  createQueryContext,
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

export {
  couchbaseMetrics,
  recordQuery,
  getPerformanceStats,
  getSlowQueries,
  getErrorBreakdown,
  getQueryTypeBreakdown,
  resetMetrics,
  getDiagnosticInfo,
} from "./metrics";

export type { QueryMetric, PerformanceStats } from "./metrics";

// =============================================================================
// DATA LOADER
// =============================================================================

export {
  createDocumentDataLoader,
  batchLoadDocuments,
} from "./data-loader";

export type { CollectionKey, DocumentResult } from "./data-loader";

// =============================================================================
// TRANSACTION HANDLER
// =============================================================================

export {
  CouchbaseTransactionHandler,
} from "./transaction-handler";

export type {
  TransactionOperationContext,
  TransactionConfig,
} from "./transaction-handler";
