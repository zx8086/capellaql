/* src/telemetry/span-event-names.ts */

/**
 * Type-safe span event name constants for the TelemetryEmitter.
 *
 * Span events are timestamped annotations attached to spans that are ALWAYS
 * captured regardless of LOG_LEVEL, making them ideal for critical correlation
 * data that must never be filtered out in production.
 *
 * Naming Convention: <component>.<sub_component>.<action>
 * - Use lowercase with dots as separators
 * - Be specific about the action (state.open vs just open)
 */
export const SpanEvents = {
  // Circuit Breaker Events
  CB_STATE_OPEN: "circuit_breaker.state.open",
  CB_STATE_HALF_OPEN: "circuit_breaker.state.half_open",
  CB_STATE_CLOSED: "circuit_breaker.state.closed",
  CB_FALLBACK_USED: "circuit_breaker.fallback.used",
  CB_REQUEST_REJECTED: "circuit_breaker.request.rejected",
  CB_TIMEOUT: "circuit_breaker.timeout",
  CB_SUCCESS: "circuit_breaker.success",
  CB_FAILURE: "circuit_breaker.failure",
  CB_CACHE_CLEARED: "circuit_breaker.cache.cleared",

  // Cache Connection Events
  CACHE_CONNECTED: "cache.connection.established",
  CACHE_DISCONNECTED: "cache.connection.lost",
  CACHE_CONNECTION_BROKEN: "cache.connection.broken",
  CACHE_RECONNECT_STARTED: "cache.reconnect.started",
  CACHE_RECONNECT_SUCCESS: "cache.reconnect.success",
  CACHE_RECONNECT_FAILED: "cache.reconnect.failed",
  CACHE_RECONNECT_EXHAUSTED: "cache.reconnect.exhausted",

  // Cache Operations Events
  CACHE_HIT: "cache.hit",
  CACHE_MISS: "cache.miss",
  CACHE_SET: "cache.set",
  CACHE_DELETE: "cache.delete",
  CACHE_STALE_RETRIEVED: "cache.stale.retrieved",
  CACHE_OPERATION_STARTED: "cache.operation.started",
  CACHE_OPERATION_COMPLETED: "cache.operation.completed",
  CACHE_OPERATION_FAILED: "cache.operation.failed",

  // Cache Circuit Breaker Events
  CACHE_CB_STATE_CHANGE: "cache.circuit_breaker.state_change",
  CACHE_CB_RECOVERED: "cache.circuit_breaker.recovered",
  CACHE_CB_FAILURE: "cache.circuit_breaker.failure",

  // Cache Health Monitor Events
  CACHE_HEALTH_STARTED: "cache.health.monitoring_started",
  CACHE_HEALTH_STOPPED: "cache.health.monitoring_stopped",
  CACHE_HEALTH_CHANGED: "cache.health.status_changed",
  CACHE_HEALTH_CHECK_SUCCESS: "cache.health.check_success",
  CACHE_HEALTH_CHECK_FAILED: "cache.health.check_failed",
  CACHE_HEALTH_RESET: "cache.health.reset",

  // Cache Connection State Events
  CACHE_STATE_CHANGED: "cache.state.changed",
  CACHE_STATE_RESET: "cache.state.reset",
  CACHE_STATE_SHUTDOWN: "cache.state.shutdown",

  // Cache Factory/Manager Events
  CACHE_FACTORY_INITIALIZING: "cache.factory.initializing",
  CACHE_FACTORY_INITIALIZED: "cache.factory.initialized",
  CACHE_FACTORY_CREATED: "cache.factory.created",
  CACHE_FACTORY_FAILED: "cache.factory.failed",
  CACHE_FACTORY_RECONFIGURE_FAILED: "cache.factory.reconfigure_failed",
  CACHE_FACTORY_SHUTDOWN: "cache.factory.shutdown",
  CACHE_MANAGER_INITIALIZING: "cache.manager.initializing",
  CACHE_MANAGER_INITIALIZED: "cache.manager.initialized",
  CACHE_MANAGER_RECONFIGURED: "cache.manager.reconfigured",
  CACHE_MANAGER_SHUTDOWN: "cache.manager.shutdown",

  // Kong Events
  KONG_CONSUMER_FOUND: "kong.consumer.found",
  KONG_CONSUMER_NOT_FOUND: "kong.consumer.not_found",
  KONG_CONSUMER_MISMATCH: "kong.consumer.mismatch",
  KONG_CACHE_HIT: "kong.cache.hit",
  KONG_CACHE_MISS: "kong.cache.miss",
  KONG_SECRET_CREATED: "kong.secret.created",
  KONG_SECRET_COLLISION: "kong.secret.collision",
  KONG_HEALTH_CHECK: "kong.health_check",
  KONG_REALM_CREATED: "kong.realm.created",
  KONG_REQUEST_SUCCESS: "kong.request.success",
  KONG_REQUEST_FAILED: "kong.request.failed",
  KONG_REQUEST_RETRIED: "kong.request.retried",

  // JWT Events
  JWT_GENERATED: "jwt.generated",
  JWT_GENERATION_FAILED: "jwt.generation.failed",
  JWT_VALIDATED: "jwt.validated",
  JWT_VALIDATION_FAILED: "jwt.validation.failed",
  JWT_EXPIRED: "jwt.expired",
  JWT_NOT_YET_VALID: "jwt.not_yet_valid",

  // Auth Flow Events
  AUTH_HEADERS_VALIDATED: "auth.headers.validated",
  AUTH_HEADERS_INVALID: "auth.headers.invalid",
  AUTH_CONSUMER_ANONYMOUS: "auth.consumer.anonymous",
  AUTH_REQUEST_SUCCESS: "auth.request.success",
  AUTH_REQUEST_FAILED: "auth.request.failed",

  // Health Check Events
  HEALTH_CHECK_SUCCESS: "health.check.success",
  HEALTH_CHECK_DEGRADED: "health.check.degraded",
  HEALTH_CHECK_FAILED: "health.check.failed",

  // HTTP Request Events
  HTTP_REQUEST_STARTED: "http.request.started",
  HTTP_REQUEST_COMPLETED: "http.request.completed",
  HTTP_REQUEST_FAILED: "http.request.failed",

  // Token Handler Events
  TOKEN_REQUEST_STARTED: "token.request.started",
  TOKEN_REQUEST_SUCCESS: "token.request.success",
  TOKEN_REQUEST_FAILED: "token.request.failed",
  TOKEN_VALIDATION_STARTED: "token.validation.started",
  TOKEN_VALIDATION_SUCCESS: "token.validation.success",
  TOKEN_VALIDATION_FAILED: "token.validation.failed",

  // Validation Events
  VALIDATION_FAILED: "validation.failed",
  VALIDATION_FAILED_STRICT: "validation.failed.strict",
  VALIDATION_JSON_PARSE_FAILED: "validation.json.parse_failed",
  VALIDATION_ARRAY_FILTERED: "validation.array.filtered",
} as const;

/**
 * Type representing all valid span event names.
 */
export type SpanEventName = (typeof SpanEvents)[keyof typeof SpanEvents];
