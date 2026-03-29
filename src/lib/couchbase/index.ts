/* src/lib/couchbase/index.ts */

export {
  CouchbaseConnectionManager,
  connectionManager,
} from "./connection-manager";

export type {
  CircuitBreakerStats,
  ConnectionMetrics,
  ConnectionStringMeta,
  CouchbaseConfig,
  CouchbaseConnection,
  CouchbaseErrorContext,
  ErrorClassification,
  HealthStatus,
  KVGetOptions,
  KVUpsertOptions,
  OperationContext,
  PerformanceDetails,
  QueryExecutionOptions,
  RetryContext,
  ServiceHealthDetails,
  SubdocOperation,
} from "./types";

export {
  AmbiguousTimeoutError,
  AuthenticationFailureError,
  BucketNotFoundError,
  CasMismatchError,
  CollectionNotFoundError,
  CouchbaseError,
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

export {
  CouchbaseConfigSchema,
  loadCouchbaseConfig,
  parseConnectionString,
  validateProductionConfig,
} from "./config";

export {
  buildConnectionOptions,
  getOptimizedTimeouts,
  validateConnectionOptions,
} from "./connection-options";

export type { CircuitBreakerConfig } from "./circuit-breaker";
export {
  CircuitBreaker,
  CircuitBreakerOpenError,
  createCouchbaseCircuitBreaker,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from "./circuit-breaker";

export {
  buildParameterizedQuery,
  createQueryContext,
  QueryExecutor,
} from "./query-executor";

export { KVOperations } from "./kv-operations";

export { CouchbaseRepository, createRepository } from "./repository";

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

export type { CollectionKey, DocumentResult } from "./data-loader";
export {
  batchLoadDocuments,
  createDocumentDataLoader,
} from "./data-loader";

export type {
  TransactionConfig,
  TransactionOperationContext,
} from "./transaction-handler";
export { CouchbaseTransactionHandler } from "./transaction-handler";
