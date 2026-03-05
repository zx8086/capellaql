# CapellaQL Troubleshooting Runbook

> Quick reference for diagnosing and resolving CapellaQL production issues.
> All error codes follow RFC 7807 Problem Details and are defined in `src/errors/error-codes.ts`.

## Quick Diagnostics

```bash
# 1. Overall health
curl -s http://localhost:4000/health/comprehensive | jq .overall

# 2. Database connectivity
curl -s http://localhost:4000/health/system | jq .components.database

# 3. Telemetry pipeline
curl -s http://localhost:4000/health/telemetry | jq .

# 4. Cache performance
curl -s http://localhost:4000/health/cache | jq .comparison

# 5. Readiness (for container orchestrators)
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/health/ready

# 6. Liveness probe
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/health/live

# 7. GraphQL performance
curl -s http://localhost:4000/health/graphql | jq .

# 8. Standardized status
curl -s http://localhost:4000/health/status | jq .
```

### Health Endpoint Reference

| Endpoint | Purpose | Key Fields |
|----------|---------|------------|
| `GET /health` | Basic liveness | `status` |
| `GET /health/system` | Database + circuit breaker state | `components.database`, `components.database.circuitBreaker` |
| `GET /health/performance` | Latency and throughput | `metrics`, `histogram` |
| `GET /health/telemetry` | OTEL pipeline status | `healthy`, `exportStats` |
| `GET /health/telemetry/detailed` | Full OTEL diagnostics | `exportStats.traces`, `exportStats.metrics`, `exportStats.logs` |
| `GET /health/cache` | Cache hit rates | `comparison`, `analytics` |
| `GET /health/comprehensive` | Full report (all subsystems) | `overall`, `components` |
| `GET /health/graphql` | Resolver and query metrics | `resolvers`, `queries` |
| `GET /health/status` | Standardized status | `status`, `checks` |
| `GET /health/ready` | K8s readiness probe | HTTP 200 = ready, 503 = not ready |
| `GET /health/live` | K8s liveness probe | HTTP 200 = alive |

---

## Error Code Reference

### Database Errors (DB_0xx)

#### DB_001: Connection Failed

**HTTP Status:** 503 Service Unavailable

**Quick Diagnostics:**
```bash
curl -s http://localhost:4000/health/system | jq '.components.database'
curl -s http://localhost:4000/health/system | jq '.components.database.circuitBreaker'
```

**Common Causes:**
- Couchbase cluster unreachable (network partition, firewall rules, DNS failure)
- Invalid connection string in `CB_CONNECTION_STRING` / `COUCHBASE_URL`
- Cluster is in maintenance mode or rebalancing
- TLS certificate issues when using `couchbases://` protocol

**Resolution:**
1. Verify the cluster is reachable: `curl -u <user>:<pass> http://<cluster-host>:8091/pools`
2. Confirm the connection string uses the correct protocol (`couchbase://` for plaintext, `couchbases://` for TLS)
3. Test DNS resolution: `dig <cluster-hostname>` or `nslookup <cluster-hostname>`
4. Check the circuit breaker state -- if OPEN, it will auto-recover after the timeout period (default 60s). Three consecutive successes in HALF-OPEN state close the circuit.
5. Review environment variables: `COUCHBASE_URL`, `COUCHBASE_CONNECT_TIMEOUT` (default 10000ms), `COUCHBASE_BOOTSTRAP_TIMEOUT` (default 15000ms)

**Verification:**
```bash
curl -s http://localhost:4000/health/system | jq '.components.database.status'
# Expected: "healthy"
```

---

#### DB_002: Query Timeout

**HTTP Status:** 504 Gateway Timeout

**Quick Diagnostics:**
```bash
curl -s http://localhost:4000/health/performance | jq '.metrics'
curl -s http://localhost:4000/health/system | jq '.components.database'
```

**Common Causes:**
- N1QL query exceeding `COUCHBASE_QUERY_TIMEOUT` (default 15000ms)
- Missing or stale GSI indexes on the target bucket
- Cluster under heavy load or rebalancing
- Large result sets without `LIMIT` clauses

**Resolution:**
1. Identify slow queries from logs -- look for structured log entries with `queryType` and `duration` fields
2. Check query indexes in Couchbase Console under Indexes tab
3. Increase timeout if the query is expected to be long-running: set `COUCHBASE_QUERY_TIMEOUT` (max 120000ms)
4. Add appropriate indexes using `CREATE INDEX` for frequently queried fields
5. Use `EXPLAIN` on the problematic N1QL query to verify index usage

**Verification:**
```bash
curl -s http://localhost:4000/health/performance | jq '.metrics.avgResponseTime'
# Should be under your SLA threshold
```

---

#### DB_003: Document Not Found

**HTTP Status:** 404 Not Found

**Quick Diagnostics:**
```bash
# Execute a test GraphQL query for the missing document
curl -s http://localhost:4000/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ look(id: \"<document-key>\") { id } }"}' | jq .errors
```

**Common Causes:**
- Requested document key does not exist in the collection
- Document was deleted or expired (TTL)
- Wrong bucket/scope/collection targeted (`COUCHBASE_BUCKET`, `COUCHBASE_SCOPE`, `COUCHBASE_COLLECTION`)

**Resolution:**
1. Verify the document key exists using the Couchbase Console or SDK: `collection.exists("<key>")`
2. Confirm the correct bucket, scope, and collection are configured in the environment
3. Check if the document has a TTL that may have expired
4. This error does NOT trip the circuit breaker -- it is an application-level error, not a connectivity issue

**Verification:**
```bash
curl -s http://localhost:4000/health/system | jq '.components.database.status'
# Should still be "healthy" -- document-not-found is not a connection error
```

---

#### DB_004: Authentication Failed

**HTTP Status:** 401 Unauthorized

**Quick Diagnostics:**
```bash
curl -s http://localhost:4000/health/system | jq '.components.database'
```

**Common Causes:**
- Incorrect `COUCHBASE_USERNAME` or `COUCHBASE_PASSWORD`
- User does not have RBAC permissions on the target bucket
- Password rotated but environment variable not updated
- Using default `Administrator` / `password` credentials in production (blocked by config validation)

**Resolution:**
1. Verify credentials against Couchbase Console: Security > Users
2. Confirm the user has the required roles for the target bucket (at minimum: `data_reader`, `data_writer`, `query_select`)
3. Update `COUCHBASE_USERNAME` and `COUCHBASE_PASSWORD` environment variables
4. Restart the service after credential changes -- connections are cached

**Verification:**
```bash
curl -s http://localhost:4000/health/system | jq '.components.database.status'
```

---

#### DB_005: Bucket Not Found

**HTTP Status:** 404 Not Found

**Quick Diagnostics:**
```bash
curl -s http://localhost:4000/health/system | jq '.components.database'
```

**Common Causes:**
- Bucket name in `COUCHBASE_BUCKET` does not match any bucket on the cluster
- Bucket was deleted or not yet created
- Typo in the bucket name (names are case-sensitive)

**Resolution:**
1. List available buckets: `curl -u <user>:<pass> http://<cluster-host>:8091/pools/default/buckets | jq '.[].name'`
2. Correct the `COUCHBASE_BUCKET` environment variable
3. Create the bucket if it is missing via Couchbase Console or REST API
4. Restart the service after changes

**Verification:**
```bash
curl -s http://localhost:4000/health/system | jq '.components.database'
```

---

#### DB_006: Collection Not Found

**HTTP Status:** 404 Not Found

**Quick Diagnostics:**
```bash
curl -s http://localhost:4000/health/system | jq '.components.database'
```

**Common Causes:**
- `COUCHBASE_SCOPE` or `COUCHBASE_COLLECTION` does not exist in the target bucket
- Collection was dropped during a schema migration
- Typo in scope or collection name (names are case-sensitive)

**Resolution:**
1. List scopes and collections: `curl -u <user>:<pass> http://<cluster-host>:8091/pools/default/buckets/<bucket>/scopes | jq '.scopes[]'`
2. Correct `COUCHBASE_SCOPE` and `COUCHBASE_COLLECTION` environment variables
3. If using `_default` scope/collection, ensure the bucket was created with default collection enabled
4. Restart the service after changes

**Verification:**
```bash
curl -s http://localhost:4000/health/system | jq '.components.database'
```

---

#### DB_007: CAS Mismatch

**HTTP Status:** 409 Conflict

**Quick Diagnostics:**
```bash
curl -s http://localhost:4000/health/performance | jq '.metrics'
```

**Common Causes:**
- Concurrent writes to the same document from multiple sources
- Stale CAS value used in a replace/mutate operation
- High write contention on a hot document

**Resolution:**
1. Implement retry logic with fresh `GET` to obtain current CAS before retrying the mutation
2. Evaluate whether the document is a hot key -- consider redesigning the data model to reduce contention
3. This error does NOT trip the circuit breaker -- it is an application-level conflict, not a connectivity issue
4. Check application logs for the specific document key causing repeated conflicts

**Verification:**
```bash
# CAS errors are transient -- monitor frequency over time
curl -s http://localhost:4000/health/performance | jq '.metrics'
```

---

#### DB_008: Transaction Failed

**HTTP Status:** 500 Internal Server Error

**Quick Diagnostics:**
```bash
curl -s http://localhost:4000/health/system | jq '.components.database'
curl -s http://localhost:4000/health/performance | jq '.metrics'
```

**Common Causes:**
- Transaction timeout exceeded
- Conflicting concurrent transactions on the same documents
- Cluster instability during multi-document operations
- Ambiguous transaction result (requires manual investigation)

**Resolution:**
1. Check logs for the transaction error details -- CapellaQL classifies transaction errors with severity levels
2. For ambiguous transactions, check the `ambiguous_operation` log entries -- these require manual verification of document state
3. Verify cluster health: all nodes should be active and not rebalancing during heavy transaction workloads
4. Consider increasing `COUCHBASE_KV_DURABLE_TIMEOUT` (default 10000ms) for durable writes within transactions

**Verification:**
```bash
curl -s http://localhost:4000/health/system | jq '.components.database.status'
```

---

#### DB_009: Ambiguous Timeout

**HTTP Status:** 504 Gateway Timeout

**Quick Diagnostics:**
```bash
curl -s http://localhost:4000/health/system | jq '.components.database'
curl -s http://localhost:4000/health/system | jq '.components.database.circuitBreaker'
```

**Common Causes:**
- Network partition between CapellaQL and Couchbase during an operation
- The operation may or may not have completed on the server
- Cluster node failure during request processing

**Resolution:**
1. **Do NOT automatically retry ambiguous operations** -- the mutation may have already been applied
2. Verify the document state manually before deciding to retry
3. Check cluster health for node failures or network partitions
4. Review logs for `ambiguous_timeout` entries with the specific operation details
5. If this occurs frequently, investigate network stability between the application and the cluster

**Verification:**
```bash
curl -s http://localhost:4000/health/system | jq '.components.database.circuitBreaker.state'
# If "open", wait for auto-recovery (60s default). If "closed", the cluster is reachable again.
```

---

#### DB_010: Rate Limited

**HTTP Status:** 429 Too Many Requests

**Quick Diagnostics:**
```bash
curl -s http://localhost:4000/health/performance | jq '.metrics'
```

**Common Causes:**
- Couchbase cluster-side rate limits exceeded (Capella rate limits)
- Application sending more requests than the cluster can handle
- Burst traffic pattern overwhelming the cluster

**Resolution:**
1. Back off and retry with exponential delay -- CapellaQL's `CouchbaseErrorHandler` includes automatic backoff for rate-limited errors
2. Check Couchbase Capella console for cluster-level rate limit configuration
3. Scale the cluster if rate limits are consistently hit during normal load
4. Review the application rate limit: CapellaQL enforces 500 requests/minute per client IP + path combination

**Verification:**
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/health
# Should return 200 once rate limiting subsides
```

---

### GraphQL Errors (GQL_0xx)

#### GQL_001: Invalid Query

**HTTP Status:** 400 Bad Request

**Quick Diagnostics:**
```bash
# Send a test query to see the error response
curl -s http://localhost:4000/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ __schema { types { name } } }"}' | jq .
```

**Common Causes:**
- Malformed GraphQL syntax (missing braces, invalid field names)
- Requesting fields that do not exist in the schema
- Missing required variables in a parameterized query

**Resolution:**
1. Validate the query against the schema using the GraphQL Yoga playground at `GET /graphql` in a browser
2. Check the `extensions.code` field in the error response for specific parser errors
3. Ensure all variable definitions match their usage in the query
4. Review the schema type definitions in `src/graphql/typeDefs.ts`

**Verification:**
```bash
# Introspection query should always work
curl -s http://localhost:4000/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ __typename }"}' | jq .
```

---

#### GQL_002: Depth Limit Exceeded

**HTTP Status:** 400 Bad Request

**Quick Diagnostics:**
```bash
curl -s http://localhost:4000/health/graphql | jq .
```

**Common Causes:**
- Query nests too many levels of related objects
- Recursive relationship traversal (e.g., deeply nested look-option-assignment chains)
- Automated tooling generating excessively deep queries

**Resolution:**
1. Flatten the query by splitting it into multiple requests
2. Use field projection to request only the fields you need at each level
3. If the depth limit is too restrictive for legitimate use cases, adjust the server-side depth limit configuration
4. Review the query to ensure it is not accidentally recursive

**Verification:**
```bash
# A shallow query should succeed
curl -s http://localhost:4000/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ __typename }"}' | jq .
```

---

#### GQL_003: Validation Failed

**HTTP Status:** 400 Bad Request

**Quick Diagnostics:**
```bash
curl -s http://localhost:4000/health/graphql | jq .
```

**Common Causes:**
- Input variables fail Zod schema validation (wrong type, missing required fields, out-of-range values)
- Enum values that do not match the allowed set
- Invalid argument types (e.g., passing a string where an integer is expected)

**Resolution:**
1. Check the error `detail` field -- it contains specific validation failure messages
2. Review the input variable types against the GraphQL schema
3. Ensure enum values are exactly as defined (case-sensitive)
4. Validate inputs client-side before sending to reduce round trips

**Verification:**
```bash
# Test with a known-good query and valid variables
curl -s http://localhost:4000/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ __typename }"}' | jq .
```

---

#### GQL_004: Resolver Error

**HTTP Status:** 500 Internal Server Error

**Quick Diagnostics:**
```bash
curl -s http://localhost:4000/health/graphql | jq '.resolvers'
curl -s http://localhost:4000/health/system | jq '.components.database'
```

**Common Causes:**
- Underlying database error within a resolver (check for accompanying DB_0xx errors in logs)
- Null pointer from unexpected data shape returned by Couchbase
- DataLoader batch function failure
- Unhandled exception in resolver business logic

**Resolution:**
1. Check the structured logs for the correlation ID (request ID) from the error response
2. Look for associated database errors -- resolver errors often wrap DB_0xx errors
3. Verify the database is healthy: `curl -s http://localhost:4000/health/system | jq .components.database`
4. Check the specific resolver file in `src/graphql/resolvers/` for the failing field

**Verification:**
```bash
curl -s http://localhost:4000/health/comprehensive | jq '.overall'
```

---

#### GQL_005: Subscription Error

**HTTP Status:** 500 Internal Server Error

**Quick Diagnostics:**
```bash
curl -s http://localhost:4000/health/graphql | jq .
```

**Common Causes:**
- WebSocket upgrade failed (load balancer not forwarding upgrade headers)
- Subscription transport disconnected mid-stream
- Server-side event source error

**Resolution:**
1. Verify WebSocket connectivity: ensure the load balancer or proxy supports WebSocket upgrades
2. Check that the client is connecting to `/graphql` with the `ws://` or `wss://` protocol
3. Review server logs for WebSocket-related errors with the subscription's request ID
4. Confirm the `maxRequestBodySize` (512KB) is not blocking large subscription payloads

**Verification:**
```bash
# WebSocket upgrade should return 101
curl -s -o /dev/null -w "%{http_code}" \
  -H "Upgrade: websocket" \
  -H "Connection: Upgrade" \
  http://localhost:4000/graphql
```

---

### Configuration Errors (CONFIG_0xx)

#### CONFIG_001: Invalid Configuration

**HTTP Status:** 500 Internal Server Error

**Quick Diagnostics:**
```bash
# The server will fail to start -- check stdout/stderr for Zod validation errors
# If the server is running, check comprehensive health
curl -s http://localhost:4000/health/comprehensive | jq '.overall'
```

**Common Causes:**
- One or more environment variables fail Zod schema validation
- Production security rules triggered (e.g., localhost in CORS origins, default password, non-URL connection string)
- Invalid combination of configuration values

**Resolution:**
1. Read the startup error output -- `ConfigurationError` includes detailed per-field messages with paths like `capella.COUCHBASE_URL: Must be a valid Couchbase connection URL`
2. Validate each config section against the schema rules in `src/config/schemas.ts`
3. Common production blockers:
   - `COUCHBASE_PASSWORD` must be 12+ characters and not `password`
   - `COUCHBASE_USERNAME` should not be `Administrator`
   - `COUCHBASE_URL` must not be `localhost` in production
   - `ALLOWED_ORIGINS` must not contain `*` or `localhost` in production
   - `SERVICE_VERSION` must not be `dev`, `latest`, or `0.0.0` in production
4. Fix the offending environment variables and restart

**Verification:**
```bash
# Server should start without validation errors
curl -s http://localhost:4000/health | jq .status
```

---

#### CONFIG_002: Missing Required Field

**HTTP Status:** 500 Internal Server Error

**Quick Diagnostics:**
```bash
# Check startup logs for the missing field name
# The error message identifies the exact path (e.g., "capella.COUCHBASE_BUCKET")
```

**Common Causes:**
- Required environment variable not set and no default value available
- `.env` file not loaded or not present
- Environment variable name typo (e.g., `COUCHBASE_BUCKET` vs `CB_BUCKET`)

**Resolution:**
1. Review the startup error message for the exact missing field path
2. Check the environment variable mapping in `src/config/envMapping.ts` for the correct variable name
3. Ensure `.env` file exists and is loaded (Bun loads `.env` automatically)
4. Review defaults in `src/config/defaults.ts` -- most fields have defaults, so this error indicates a critical missing value

**Verification:**
```bash
curl -s http://localhost:4000/health | jq .status
```

---

#### CONFIG_003: Invalid Value

**HTTP Status:** 500 Internal Server Error

**Quick Diagnostics:**
```bash
# Check startup logs for Zod validation details
```

**Common Causes:**
- Value out of allowed range (e.g., `PORT` outside 1-65535, `COUCHBASE_KV_TIMEOUT` below 1000ms)
- Wrong type (e.g., string where number expected, unrecognized boolean value)
- `LOG_LEVEL` not one of: `debug`, `info`, `warn`, `error`
- `NODE_ENV` not one of: `development`, `staging`, `production`, `test`

**Resolution:**
1. Check the Zod error detail for the field path and constraint that failed
2. Reference the validation ranges in `src/config/schemas.ts`:
   - `PORT`: 1-65535
   - `COUCHBASE_KV_TIMEOUT`: 1000-30000ms
   - `COUCHBASE_QUERY_TIMEOUT`: 5000-120000ms
   - `COUCHBASE_CONNECT_TIMEOUT`: 5000-60000ms
   - `EXPORT_TIMEOUT_MS`: 5000-30000ms
   - `BATCH_SIZE`: 1-4096
   - `MAX_QUEUE_SIZE`: 100-20000
3. Fix the value and restart

**Verification:**
```bash
curl -s http://localhost:4000/health | jq .status
```

---

#### CONFIG_004: Health Check Failed

**HTTP Status:** 503 Service Unavailable

**Quick Diagnostics:**
```bash
curl -s http://localhost:4000/health/comprehensive | jq .
curl -s http://localhost:4000/health/ready | head -1
```

**Common Causes:**
- One or more health check components reporting unhealthy (database, telemetry, cache)
- Readiness probe failing during startup (service not yet fully initialized)
- Health check timeout exceeded

**Resolution:**
1. Run the comprehensive health check to identify which component is failing
2. Address the failing component using the relevant error code section in this runbook
3. For transient startup failures, wait for the circuit breaker recovery cycle (60s)
4. Check that the readiness probe is not being called before initialization completes

**Verification:**
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/health/ready
# Expected: 200
```

---

### Cache Errors (CACHE_0xx)

#### CACHE_001: Cache Unavailable

**HTTP Status:** 503 Service Unavailable

**Quick Diagnostics:**
```bash
curl -s http://localhost:4000/health/cache | jq .
```

**Common Causes:**
- In-memory cache subsystem failed to initialize
- Memory pressure causing cache eviction failures
- Cache system disabled but code path still attempting access

**Resolution:**
1. Check cache status in the health endpoint
2. Verify available system memory: the cache operates in-process (no external cache service)
3. Response caching TTL is controlled by `YOGA_RESPONSE_CACHE_TTL` (default 900000ms / 15 minutes)
4. If cache is non-critical, the service should continue operating with degraded performance

**Verification:**
```bash
curl -s http://localhost:4000/health/cache | jq '.comparison'
```

---

#### CACHE_002: Cache Write Failed

**HTTP Status:** 500 Internal Server Error

**Quick Diagnostics:**
```bash
curl -s http://localhost:4000/health/cache | jq .
curl -s http://localhost:4000/health/performance | jq '.metrics'
```

**Common Causes:**
- Memory limit reached for the in-memory cache
- Serialization error when storing a response
- Concurrent write conflict in the cache store

**Resolution:**
1. Monitor memory usage via `/health/performance`
2. Cache write failures are non-fatal -- the request will still return successfully, just without caching
3. If persistent, check for unusually large GraphQL responses that may exceed cache entry limits
4. Restart the service to clear the cache if corruption is suspected

**Verification:**
```bash
curl -s http://localhost:4000/health/cache | jq '.comparison'
```

---

#### CACHE_003: Cache Read Failed

**HTTP Status:** 500 Internal Server Error

**Quick Diagnostics:**
```bash
curl -s http://localhost:4000/health/cache | jq .
```

**Common Causes:**
- Cache entry corrupted or deserialization failure
- Cache key collision (extremely rare)
- Concurrent cache invalidation during read

**Resolution:**
1. Cache read failures are non-fatal -- the system falls back to executing the query directly
2. Monitor the frequency via `/health/cache` analytics
3. If persistent, restart the service to clear the in-memory cache
4. Check logs for specific deserialization error details

**Verification:**
```bash
curl -s http://localhost:4000/health/cache | jq '.comparison'
```

---

### HTTP Errors (HTTP_0xx)

#### HTTP_001: Bad Request

**HTTP Status:** 400 Bad Request

**Quick Diagnostics:**
```bash
# Check the response body for RFC 7807 problem details
curl -s http://localhost:4000/graphql \
  -H 'Content-Type: application/json' \
  -d '{"invalid": "payload"}' | jq .
```

**Common Causes:**
- Missing or malformed `Content-Type: application/json` header on GraphQL requests
- Invalid JSON in the request body
- Request body exceeds 512KB limit (`maxRequestBodySize`)

**Resolution:**
1. Ensure `Content-Type: application/json` header is set for all GraphQL POST requests
2. Validate JSON payload before sending
3. For large queries, reduce the selection set or paginate
4. Check the RFC 7807 `detail` field in the response for specifics

**Verification:**
```bash
curl -s http://localhost:4000/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ __typename }"}' | jq .
```

---

#### HTTP_002: Not Found

**HTTP Status:** 404 Not Found

**Quick Diagnostics:**
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/<path>
```

**Common Causes:**
- Requesting a path that is not registered in the server routes
- Typo in the URL (e.g., `/graphql/` with trailing slash vs `/graphql`)

**Resolution:**
1. Valid endpoints: `/graphql` (GET, POST), `/health`, `/health/*` variants
2. Check the URL for typos or extra path segments
3. The server returns a pre-built 404 response for any unmatched route

**Verification:**
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/graphql
# Expected: 200 (GET) or valid response (POST)
```

---

#### HTTP_003: Method Not Allowed

**HTTP Status:** 405 Method Not Allowed

**Quick Diagnostics:**
```bash
curl -s -o /dev/null -w "%{http_code}" -X DELETE http://localhost:4000/graphql
```

**Common Causes:**
- Using an unsupported HTTP method (e.g., PUT, DELETE, PATCH on `/graphql`)
- `/graphql` only accepts GET, POST, and OPTIONS

**Resolution:**
1. Use GET for introspection and simple queries
2. Use POST for mutations and complex queries with variables
3. OPTIONS is handled automatically for CORS preflight

**Verification:**
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:4000/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ __typename }"}'
# Expected: 200
```

---

#### HTTP_004: Internal Server Error

**HTTP Status:** 500 Internal Server Error

**Quick Diagnostics:**
```bash
curl -s http://localhost:4000/health/comprehensive | jq '.overall'
curl -s http://localhost:4000/health/system | jq '.components'
```

**Common Causes:**
- Unhandled exception in request processing
- Resolver or middleware throwing an unexpected error
- Dependency failure not caught by specific error handlers

**Resolution:**
1. Check structured logs for the request's correlation ID (returned in the response or logged server-side)
2. Look for the root cause error -- HTTP_004 is often a wrapper around a more specific error (DB_0xx, GQL_0xx)
3. Run the comprehensive health check to identify failing components
4. If reproducible, capture the exact request payload and headers for debugging

**Verification:**
```bash
curl -s http://localhost:4000/health/comprehensive | jq '.overall'
```

---

#### HTTP_005: Service Unavailable

**HTTP Status:** 503 Service Unavailable

**Quick Diagnostics:**
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/health/ready
curl -s http://localhost:4000/health/system | jq '.components.database.circuitBreaker'
```

**Common Causes:**
- Database circuit breaker is OPEN (5 consecutive connection failures)
- Service is starting up and not yet ready
- Graceful shutdown in progress (server stopped accepting requests)

**Resolution:**
1. Check the circuit breaker state: OPEN means the database is unreachable
2. If the circuit breaker is OPEN, it transitions to HALF-OPEN after 60s, then CLOSED after 3 successful operations
3. If the service is starting, wait for initialization to complete (check `/health/ready`)
4. If shutting down, allow the graceful shutdown sequence to complete

**Verification:**
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/health/ready
# Expected: 200
```

---

#### HTTP_006: Gateway Timeout

**HTTP Status:** 504 Gateway Timeout

**Quick Diagnostics:**
```bash
curl -s http://localhost:4000/health/performance | jq '.metrics'
curl -s http://localhost:4000/health/system | jq '.components.database'
```

**Common Causes:**
- Upstream timeout (load balancer or reverse proxy timeout exceeded before CapellaQL responded)
- Long-running GraphQL query exceeded the server's idle timeout (30s)
- Couchbase query timeout propagated as a gateway timeout

**Resolution:**
1. Check if this is a DB_002 (query timeout) propagated through the HTTP layer
2. Increase the load balancer/proxy timeout if the query legitimately requires more time
3. Optimize the GraphQL query to reduce response time
4. The Bun server `idleTimeout` is 30 seconds -- ensure queries complete within this window

**Verification:**
```bash
curl -s http://localhost:4000/health/performance | jq '.metrics.avgResponseTime'
```

---

### Telemetry Errors (OTEL_0xx)

#### OTEL_001: Export Failed

**HTTP Status:** 500 Internal Server Error

**Quick Diagnostics:**
```bash
curl -s http://localhost:4000/health/telemetry | jq .
curl -s http://localhost:4000/health/telemetry/detailed | jq '.exportStats'
```

**Common Causes:**
- OTLP collector unreachable at the configured endpoints
- Export timeout exceeded (`EXPORT_TIMEOUT_MS`, default 30000ms)
- Collector rejecting payloads (authentication, quota, payload size)

**Resolution:**
1. Verify the OTLP collector is running and accessible:
   - `curl -s http://<collector-host>:4318/v1/traces` (should not connection-refuse)
2. Check the endpoint configuration:
   - `TRACES_ENDPOINT` (default `http://localhost:4318/v1/traces`)
   - `METRICS_ENDPOINT` (default `http://localhost:4318/v1/metrics`)
   - `LOGS_ENDPOINT` (default `http://localhost:4318/v1/logs`)
3. Review export stats for failure rates: `curl -s http://localhost:4000/health/telemetry/detailed | jq '.exportStats'`
4. Telemetry export failures do NOT affect request processing -- they are isolated

**Verification:**
```bash
curl -s http://localhost:4000/health/telemetry | jq '.healthy'
# Expected: true
```

---

#### OTEL_002: Circuit Breaker Open

**HTTP Status:** 503 Service Unavailable

**Quick Diagnostics:**
```bash
curl -s http://localhost:4000/health/telemetry | jq .
curl -s http://localhost:4000/health/telemetry/detailed | jq '.exportStats'
```

**Common Causes:**
- Repeated OTLP export failures triggered the telemetry circuit breaker
- Telemetry circuit breaker threshold reached (`CIRCUIT_BREAKER_THRESHOLD`, default 5)
- Collector downtime exceeding the circuit breaker timeout

**Resolution:**
1. The telemetry circuit breaker is separate from the database circuit breaker
2. It auto-recovers after `CIRCUIT_BREAKER_TIMEOUT_MS` (default 60000ms)
3. Fix the underlying OTEL_001 export failure to prevent re-tripping
4. **Telemetry failures do NOT impact request serving** -- only observability data is lost during the open period
5. Consider increasing `CIRCUIT_BREAKER_THRESHOLD` if transient failures are common in your environment

**Verification:**
```bash
curl -s http://localhost:4000/health/telemetry | jq '.healthy'
```

---

#### OTEL_003: Memory Pressure

**HTTP Status:** 503 Service Unavailable

**Quick Diagnostics:**
```bash
curl -s http://localhost:4000/health/performance | jq '.metrics'
curl -s http://localhost:4000/health/telemetry/detailed | jq '.exportStats'
```

**Common Causes:**
- Telemetry queue approaching `MAX_QUEUE_SIZE` (default 10000)
- Export backlog building up faster than the collector can consume
- Memory leak in the export pipeline

**Resolution:**
1. Check queue sizes in the detailed telemetry health endpoint
2. Reduce `BATCH_SIZE` (default 2048) to export more frequently in smaller batches
3. Increase `MAX_QUEUE_SIZE` if the collector is temporarily slow but eventually catches up
4. Verify the OTLP collector has adequate resources to handle the export volume
5. The system will drop telemetry data under extreme pressure to protect request serving

**Verification:**
```bash
curl -s http://localhost:4000/health/telemetry/detailed | jq '.exportStats'
```

---

## Common Scenarios

### Scenario: Server Won't Start

**Symptoms:** Process exits immediately with a non-zero exit code. No health endpoints respond.

**Diagnosis:**
```bash
# Check the process output for error messages
bun run start 2>&1 | head -50

# Common patterns in output:
# "ConfigurationError" -> CONFIG_001, CONFIG_002, or CONFIG_003
# "Failed to connect to Couchbase" -> DB_001
# "EADDRINUSE" -> Port 4000 already in use
```

**Resolution by cause:**

1. **Configuration error**: Fix environment variables per the CONFIG_0xx sections above.
2. **Database connection failure**: CapellaQL retries on startup. If the cluster is unreachable, it exits with code 1. Fix Couchbase connectivity, then restart.
3. **Port conflict**: Another process is using port 4000.
   ```bash
   lsof -i :4000
   # Kill the conflicting process or change PORT in configuration
   ```
4. **Missing dependencies**: Run `bun install` to ensure all packages are present.
5. **Telemetry initialization failure**: If OTEL initialization fails, the process will throw. Set `ENABLE_OPENTELEMETRY=false` to start without telemetry, then fix the OTLP endpoint configuration.

---

### Scenario: High Latency

**Symptoms:** Responses are slow. P95/P99 latency exceeds SLA. Users report timeouts.

**Diagnosis:**
```bash
# Check overall performance metrics
curl -s http://localhost:4000/health/performance | jq '.metrics'

# Check database response times
curl -s http://localhost:4000/health/system | jq '.components.database'

# Check GraphQL resolver performance
curl -s http://localhost:4000/health/graphql | jq '.resolvers'

# Check cache hit rates (low hit rate = more database queries)
curl -s http://localhost:4000/health/cache | jq '.comparison'
```

**Resolution:**

1. **Database slow queries**: Check Couchbase slow query log. Add indexes for frequently queried fields. Increase `COUCHBASE_QUERY_TIMEOUT` if queries are legitimate.
2. **Low cache hit rate**: Verify `YOGA_RESPONSE_CACHE_TTL` is set appropriately (default 900000ms / 15 minutes). Common queries should be served from cache.
3. **High DataLoader batch sizes**: Check if resolvers are triggering N+1 queries. DataLoader batching should coalesce duplicate requests.
4. **Network latency**: If the Couchbase cluster is in a different region, consider deploying CapellaQL closer to the cluster.
5. **Rate limiting**: If clients are being rate-limited (429 responses), they may be queuing and experiencing perceived latency. Current limit: 500 requests/minute per client IP + path.

---

### Scenario: Memory Issues

**Symptoms:** RSS growing over time. OOM kills in container environments. OTEL_003 errors.

**Diagnosis:**
```bash
# Check system-level memory usage
curl -s http://localhost:4000/health/performance | jq '.metrics'

# Check telemetry queue pressure
curl -s http://localhost:4000/health/telemetry/detailed | jq '.exportStats'

# Check cache size
curl -s http://localhost:4000/health/cache | jq .

# Process-level memory check (on the host)
ps aux | grep bun | grep -v grep
```

**Resolution:**

1. **Telemetry queue buildup**: If the OTLP collector is slow or down, queues grow in memory. Reduce `MAX_QUEUE_SIZE` (default 10000) or `BATCH_SIZE` (default 2048).
2. **Cache growth**: The in-memory response cache can grow with diverse query patterns. Reduce `YOGA_RESPONSE_CACHE_TTL` or disable caching if memory is constrained.
3. **Bun DNS cache**: `BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS` (default 120) controls the Bun-native DNS cache. This is small and rarely the issue.
4. **Container limits**: Set appropriate memory limits in your container orchestrator. CapellaQL with telemetry typically needs 256-512MB minimum.
5. **Leak investigation**: Enable debug logging (`LOG_LEVEL=debug`) temporarily and monitor heap growth. Check for unclosed connections or event listeners.

---

### Scenario: Telemetry Data Loss

**Symptoms:** Traces, metrics, or logs missing in your observability backend. OTEL_001 or OTEL_002 errors in application logs.

**Diagnosis:**
```bash
# Check all three export pipelines
curl -s http://localhost:4000/health/telemetry/detailed | jq '.exportStats'

# Expected: each pipeline should show successful exports
# {
#   "traces": { "attempts": N, "successes": N, "failures": 0 },
#   "metrics": { "attempts": N, "successes": N, "failures": 0 },
#   "logs": { "attempts": N, "successes": N, "failures": 0 }
# }

# Check if telemetry is enabled
curl -s http://localhost:4000/health/telemetry | jq '.healthy'
```

**Resolution:**

1. **Collector down**: Verify the OTLP collector is running at the configured endpoints. Export failures trigger the circuit breaker after 5 failures.
2. **Wrong endpoints**: Verify `TRACES_ENDPOINT`, `METRICS_ENDPOINT`, and `LOGS_ENDPOINT`. All three must be valid URLs pointing to OTLP HTTP receivers (typically port 4318).
3. **Export timeout**: If the collector is slow, increase `EXPORT_TIMEOUT_MS` (default 30000ms, range 5000-30000ms).
4. **Queue overflow**: If `MAX_QUEUE_SIZE` (default 10000) is reached, new telemetry data is dropped. Increase the queue or improve collector throughput.
5. **Disabled**: Check that `ENABLE_OPENTELEMETRY=true` is set. When disabled, no-op exporters are used and no data is sent.
6. **Circuit breaker open**: If OTEL_002 is logged, wait for auto-recovery (60s default) and fix the underlying export issue.

---

## Circuit Breaker Quick Reference

CapellaQL uses two independent circuit breakers:

### Database Circuit Breaker
- **Location:** `src/lib/couchbase/circuit-breaker.ts`
- **Failure threshold:** 5 consecutive connection errors
- **Recovery timeout:** 60 seconds (OPEN to HALF-OPEN)
- **Success threshold:** 3 successes in HALF-OPEN to close
- **What trips it:** Connection errors, timeouts, service errors
- **What does NOT trip it:** DocumentNotFoundError, CasMismatchError, ParsingFailureError, DocumentExistsError, DocumentLockedError, PathNotFoundError, PathExistsError
- **Check state:** `curl -s http://localhost:4000/health/system | jq '.components.database.circuitBreaker'`

### Telemetry Circuit Breaker
- **Configuration:** `CIRCUIT_BREAKER_THRESHOLD` (default 5), `CIRCUIT_BREAKER_TIMEOUT_MS` (default 60000)
- **What trips it:** Repeated OTLP export failures
- **Impact:** Only telemetry data is lost; request serving is unaffected
- **Check state:** `curl -s http://localhost:4000/health/telemetry | jq .`

---

## Graceful Shutdown Sequence

When CapellaQL receives SIGINT, SIGTERM, or SIGQUIT, it follows a 6-phase shutdown:

| Phase | Action | Timeout |
|-------|--------|---------|
| 1 | Stop accepting new requests | Immediate |
| 2 | Cleanup rate limit store | Immediate |
| 3 | Flush telemetry batch coordinator | 5s |
| 4 | Close database connections | 10s |
| 5 | Shutdown telemetry providers | 5s |
| 6 | Cleanup remaining resources | Immediate |

If a phase times out, it logs a warning and proceeds to the next phase. If the entire shutdown fails, the process exits with code 1.

**To verify clean shutdown:** Check the last log line for `"Graceful shutdown completed"` with `shutdownDurationMs`.

---

## Environment Variable Quick Reference

| Variable | Default | Required | Notes |
|----------|---------|----------|-------|
| `COUCHBASE_URL` | `couchbase://localhost` | Yes (prod) | Use `couchbases://` for TLS |
| `COUCHBASE_USERNAME` | `Administrator` | Yes (prod) | Must not be `Administrator` in prod |
| `COUCHBASE_PASSWORD` | `password` | Yes (prod) | Must be 12+ chars, not `password` in prod |
| `COUCHBASE_BUCKET` | `default` | Yes | Case-sensitive |
| `COUCHBASE_SCOPE` | `_default` | Yes | Case-sensitive |
| `COUCHBASE_COLLECTION` | `_default` | Yes | Case-sensitive |
| `COUCHBASE_QUERY_TIMEOUT` | `15000` | No | 5000-120000ms |
| `COUCHBASE_CONNECT_TIMEOUT` | `10000` | No | 5000-60000ms |
| `PORT` | `4000` | No | 1-65535 |
| `NODE_ENV` | `development` | No | development, staging, production, test |
| `LOG_LEVEL` | `info` | No | debug, info, warn, error |
| `ENABLE_OPENTELEMETRY` | `true` | No | Set `false` to disable telemetry |
| `TRACES_ENDPOINT` | `http://localhost:4318/v1/traces` | No | OTLP HTTP endpoint |
| `METRICS_ENDPOINT` | `http://localhost:4318/v1/metrics` | No | OTLP HTTP endpoint |
| `LOGS_ENDPOINT` | `http://localhost:4318/v1/logs` | No | OTLP HTTP endpoint |
| `EXPORT_TIMEOUT_MS` | `30000` | No | 5000-30000ms |
| `BATCH_SIZE` | `2048` | No | 1-4096 |
| `MAX_QUEUE_SIZE` | `10000` | No | 100-20000 |
| `YOGA_RESPONSE_CACHE_TTL` | `900000` | No | 0-3600000ms |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | No | Comma-separated URLs. No `*` or `localhost` in prod |
