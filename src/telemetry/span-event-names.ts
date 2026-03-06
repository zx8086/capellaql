/* src/telemetry/span-event-names.ts */

export const SpanEvents = {
  // Circuit Breaker
  CIRCUIT_BREAKER_STATE_OPEN: "circuit_breaker.state.open",
  CIRCUIT_BREAKER_STATE_CLOSED: "circuit_breaker.state.closed",
  CIRCUIT_BREAKER_STATE_HALF_OPEN: "circuit_breaker.state.half_open",
  CIRCUIT_BREAKER_FALLBACK_USED: "circuit_breaker.fallback.used",
  CIRCUIT_BREAKER_FAILURE_RECORDED: "circuit_breaker.failure.recorded",
  CIRCUIT_BREAKER_SUCCESS_RECORDED: "circuit_breaker.success.recorded",
  CIRCUIT_BREAKER_THRESHOLD_REACHED: "circuit_breaker.threshold.reached",
  CIRCUIT_BREAKER_RECOVERY_STARTED: "circuit_breaker.recovery.started",
  CIRCUIT_BREAKER_RECOVERY_COMPLETED: "circuit_breaker.recovery.completed",

  // Cache (SQLite)
  CACHE_HIT: "cache.hit",
  CACHE_MISS: "cache.miss",
  CACHE_SET: "cache.set",
  CACHE_DELETE: "cache.delete",
  CACHE_EVICTION: "cache.eviction",
  CACHE_ERROR: "cache.error",
  CACHE_CONNECTION_ESTABLISHED: "cache.connection.established",
  CACHE_CONNECTION_FAILED: "cache.connection.failed",

  // Couchbase
  COUCHBASE_QUERY_STARTED: "couchbase.query.started",
  COUCHBASE_QUERY_COMPLETED: "couchbase.query.completed",
  COUCHBASE_QUERY_FAILED: "couchbase.query.failed",
  COUCHBASE_QUERY_SLOW: "couchbase.query.slow",
  COUCHBASE_KV_STARTED: "couchbase.kv.started",
  COUCHBASE_KV_COMPLETED: "couchbase.kv.completed",
  COUCHBASE_KV_FAILED: "couchbase.kv.failed",
  COUCHBASE_CONNECTION_ESTABLISHED: "couchbase.connection.established",
  COUCHBASE_CONNECTION_FAILED: "couchbase.connection.failed",
  COUCHBASE_CONNECTION_RETRY: "couchbase.connection.retry",
  COUCHBASE_TRANSACTION_STARTED: "couchbase.transaction.started",
  COUCHBASE_TRANSACTION_COMMITTED: "couchbase.transaction.committed",
  COUCHBASE_TRANSACTION_AMBIGUOUS: "couchbase.transaction.ambiguous",

  // GraphQL
  GRAPHQL_REQUEST_STARTED: "graphql.request.started",
  GRAPHQL_REQUEST_COMPLETED: "graphql.request.completed",
  GRAPHQL_REQUEST_FAILED: "graphql.request.failed",
  GRAPHQL_DEPTH_LIMIT_EXCEEDED: "graphql.depth_limit.exceeded",
  GRAPHQL_CACHE_HIT: "graphql.cache.hit",
  GRAPHQL_CACHE_MISS: "graphql.cache.miss",

  // HTTP
  HTTP_REQUEST_STARTED: "http.request.started",
  HTTP_REQUEST_COMPLETED: "http.request.completed",
  HTTP_REQUEST_FAILED: "http.request.failed",

  // Health Check
  HEALTH_CHECK_SUCCESS: "health.check.success",
  HEALTH_CHECK_DEGRADED: "health.check.degraded",
  HEALTH_CHECK_FAILED: "health.check.failed",

  // Lifecycle
  LIFECYCLE_STATE_CHANGED: "lifecycle.state.changed",
  LIFECYCLE_STARTUP_INITIATED: "lifecycle.startup.initiated",
  LIFECYCLE_STARTUP_COMPLETED: "lifecycle.startup.completed",
  LIFECYCLE_SHUTDOWN_INITIATED: "lifecycle.shutdown.initiated",
  LIFECYCLE_SHUTDOWN_COMPLETED: "lifecycle.shutdown.completed",
  LIFECYCLE_DRAIN_STARTED: "lifecycle.drain.started",
  LIFECYCLE_DRAIN_COMPLETED: "lifecycle.drain.completed",

  // DataLoader
  DATALOADER_BATCH_STARTED: "dataloader.batch.started",
  DATALOADER_BATCH_COMPLETED: "dataloader.batch.completed",
  DATALOADER_BATCH_FAILED: "dataloader.batch.failed",
  DATALOADER_CACHE_HIT: "dataloader.cache.hit",

  // Rate Limiting
  RATE_LIMIT_EXCEEDED: "rate_limit.exceeded",
  RATE_LIMIT_NEAR_THRESHOLD: "rate_limit.near_threshold",

  // WebSocket
  WEBSOCKET_CONNECTION_OPENED: "websocket.connection.opened",
  WEBSOCKET_CONNECTION_CLOSED: "websocket.connection.closed",
  WEBSOCKET_MESSAGE_RECEIVED: "websocket.message.received",
  WEBSOCKET_ERROR: "websocket.error",
} as const;

export type SpanEventName = (typeof SpanEvents)[keyof typeof SpanEvents];
