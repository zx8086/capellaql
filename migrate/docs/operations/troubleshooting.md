# Troubleshooting Guide

This runbook-style guide helps diagnose and resolve common operational issues with the Authentication Service.

## Quick Diagnostics

### Health Check Commands

```bash
# Basic health check
curl -s http://localhost:3000/health | jq .

# Health check with telemetry status
curl -s http://localhost:3000/health/telemetry | jq .

# Detailed metrics view
curl -s http://localhost:3000/metrics | jq .

# Full metrics with all subsystems
curl -s "http://localhost:3000/metrics?view=full" | jq .

# Debug info (non-production)
curl -s http://localhost:3000/debug/info | jq .
```

### Service Status Indicators

| Endpoint | Expected Response | Unhealthy Sign |
|----------|-------------------|----------------|
| `/health` | `{"status":"healthy"}` | Non-200 or timeout |
| `/health/telemetry` | `{"healthy":true}` | `{"healthy":false}` |
| `/metrics` | JSON with `circuitBreaker` | Missing or error |

---

## Common Issues

### 1. Token Generation Failures (AUTH_003)

**Error Code**: `AUTH_003` - JWT Creation Failed
**HTTP Status**: 500

**Symptoms**:
- GET `/tokens` returns 500 error
- Logs show "Failed to create JWT token"

**Diagnosis**:
```bash
# Check Kong connectivity
curl -s http://localhost:3000/health | jq '.dependencies.kong'

# Check circuit breaker state
curl -s "http://localhost:3000/metrics?view=operational" | jq '.circuitBreaker'

# Check consumer exists in Kong
curl -s http://localhost:3000/metrics | jq '.kong'
```

**Root Causes**:
1. Consumer doesn't exist in Kong
2. Consumer has no JWT credentials configured
3. Kong JWT plugin misconfigured

**Resolution**:
1. Verify consumer exists in Kong Admin API
2. Ensure consumer has JWT credentials provisioned
3. Check Kong JWT plugin configuration
4. Review logs for specific error details

---

### 2. Kong Unavailable (AUTH_004)

**Error Code**: `AUTH_004` - Kong API Unavailable
**HTTP Status**: 503

**Symptoms**:
- All token requests fail with 503
- Response includes `Retry-After: 30` header
- Logs show "Kong service unavailable"

**Diagnosis**:
```bash
# Check Kong health directly
curl -s ${KONG_ADMIN_URL}/status

# Check service health view
curl -s http://localhost:3000/health | jq '.dependencies'

# Check circuit breaker state
curl -s "http://localhost:3000/metrics?view=operational" | jq '.circuitBreaker.states'
```

**Root Causes**:
1. Kong Admin API is down
2. Network connectivity issues
3. Kong Admin Token expired/invalid
4. DNS resolution failure

**Resolution**:
1. Verify Kong Admin API is accessible
2. Check `KONG_ADMIN_URL` configuration
3. Validate `KONG_ADMIN_TOKEN` is correct
4. Check network/firewall rules
5. Wait for automatic retry after 30 seconds

---

### 3. Circuit Breaker Open (AUTH_005)

**Error Code**: `AUTH_005` - Circuit Breaker Open
**HTTP Status**: 503

**Symptoms**:
- Immediate 503 responses
- Logs show "Circuit breaker open"
- No Kong API calls being made

**Diagnosis**:
```bash
# Check circuit breaker states
curl -s "http://localhost:3000/metrics?view=operational" | jq '.circuitBreaker'

# Check recent failures
curl -s "http://localhost:3000/metrics?view=full" | jq '.circuitBreaker.failureCounts'
```

**Circuit Breaker States**:
| State | Meaning | Action |
|-------|---------|--------|
| `closed` | Normal operation | None needed |
| `open` | Failures exceeded threshold | Wait for recovery |
| `half-open` | Testing recovery | Monitor results |

**Resolution**:
1. Wait 30 seconds for half-open state
2. Fix underlying Kong issue (see AUTH_004)
3. If stale cache available, service continues with cached data
4. Monitor circuit breaker recovery in logs

---

### 3.1 3-Layer Cache Fallback (HA Mode)

When circuit breaker is open, the service uses a 3-layer fallback chain:

**Fallback Chain**:
```
Redis Primary (miss) -> Redis Stale -> In-Memory Stale -> AUTH_005 error
```

**Diagnosis**:
```bash
# Check cache health with new grouped structure
curl -s "http://localhost:3000/health" | jq '.dependencies.cache'

# Check cache tiers
curl -s "http://localhost:3000/health" | jq '{
  connection: .dependencies.cache.connection,
  entries: .dependencies.cache.entries,
  healthMonitor: .dependencies.cache.healthMonitor
}'
```

**Cache Health Response Structure**:
```json
{
  "type": "redis",
  "connection": {
    "connected": true,
    "responseTime": "0.4ms"
  },
  "entries": {
    "primary": 5,
    "primaryActive": 5,
    "stale": 11,
    "staleCacheAvailable": true
  },
  "performance": {
    "hitRate": "62.50%",
    "avgLatencyMs": 0.54
  },
  "healthMonitor": {
    "status": "healthy",
    "isMonitoring": true,
    "consecutiveSuccesses": 47,
    "consecutiveFailures": 0
  }
}
```

**Tier Status Interpretation**:

| Field | Meaning | Action if Low/False |
|-------|---------|---------------------|
| `entries.primary` | Active cache entries | Check Kong connectivity |
| `entries.stale` | Fallback entries | Extend `STALE_DATA_TOLERANCE_MINUTES` |
| `entries.staleCacheAvailable` | Stale tier ready | Wait for primary entries to expire |
| `healthMonitor.consecutiveFailures` | Health check failures | Investigate Redis connectivity |

**In-Memory Stale Cache (Last Resort)**:

When Redis is completely unavailable, in-memory stale cache serves as last resort:

```bash
# Check in-memory cache configuration
echo "CACHE_MAX_MEMORY_ENTRIES=${CACHE_MAX_MEMORY_ENTRIES:-1000}"

# Monitor in-memory fallback usage in logs
grep "in_memory_ha_fallback" logs.json
grep "in_memory_stale_fallback" logs.json
```

**When All Cache Tiers Fail**:
- Service returns `AUTH_005` error
- Check `staleCacheAvailable: false` indicates no fallback data
- Resolution: Wait for Kong to recover and populate cache

---

### 4. High Memory Usage

**Symptoms**:
- Memory alerts triggered
- OOM kills in container
- Slow response times

**Diagnosis**:
```bash
# Check memory metrics
curl -s "http://localhost:3000/metrics?view=infrastructure" | jq '.memory'

# Check process stats
curl -s "http://localhost:3000/metrics?view=full" | jq '.process'

# Check GC metrics
curl -s "http://localhost:3000/metrics?view=full" | jq '.gc'
```

**Warning Thresholds**:
- Warning: >70% memory (>180MB of 256MB)
- Critical: >80% memory (>200MB of 256MB)

**Root Causes**:
1. Memory leak from uncleared intervals
2. Large cache size
3. High cardinality metrics
4. Uncollected GC objects

**Resolution**:
1. Verify graceful shutdown clears all intervals (fixed in recent update)
2. Check cache size and TTL configuration
3. Review cardinality guard bucket usage
4. Consider increasing memory limit
5. Restart service if memory leak suspected

---

### 5. Slow Response Times

**Symptoms**:
- P95/P99 latency exceeds SLA
- Health checks slow
- Token generation taking >500ms

**Diagnosis**:
```bash
# Check latency metrics
curl -s "http://localhost:3000/metrics?view=operational" | jq '.latency'

# Check Kong latency specifically
curl -s "http://localhost:3000/metrics?view=full" | jq '.kong.latency'

# Check event loop delay
curl -s "http://localhost:3000/metrics?view=infrastructure" | jq '.eventLoop'
```

**Root Causes**:
1. Kong Admin API slow
2. Cache misses
3. Event loop blocking
4. High CPU usage

**Resolution**:
1. Check Kong Admin API performance
2. Review cache hit rates, increase TTL if needed
3. Check for synchronous blocking operations
4. Review consumer volume classification
5. Consider scaling horizontally

---

### 6. Missing Trace Context

**Symptoms**:
- Distributed traces incomplete
- Kong requests not correlated
- No trace IDs in logs

**Diagnosis**:
```bash
# Check telemetry status
curl -s http://localhost:3000/health/telemetry | jq .

# Verify trace headers in response
curl -v http://localhost:3000/health 2>&1 | grep -i traceparent
```

**Root Causes**:
1. OpenTelemetry not initialized
2. OTLP endpoint unreachable
3. W3C trace context not propagated

**Resolution**:
1. Check `TELEMETRY_MODE` configuration
2. Verify OTLP endpoint URLs
3. Ensure W3C trace headers propagated (via `createStandardHeaders()`)
4. Check telemetry circuit breaker state

---

### 7. Missing Consumer Headers (AUTH_001)

**Error Code**: `AUTH_001` - Missing Consumer Headers
**HTTP Status**: 401

**Symptoms**:
- Token requests return 401
- Error message mentions missing headers

**Expected Headers**:
| Header | Description |
|--------|-------------|
| `X-Consumer-ID` | Kong consumer UUID |
| `X-Consumer-Username` | Kong consumer username |

**Resolution**:
1. Ensure requests come through Kong gateway
2. Verify Kong consumer authentication plugin configured
3. Check Kong is injecting consumer headers
4. Review Kong route configuration

---

### 8. Header Validation Errors (AUTH_007)

**Error Code**: `AUTH_007` - Invalid Request Format
**HTTP Status**: 400

**Symptoms**:
- Token requests return 400
- Error mentions "Header value exceeds maximum allowed length"

**Validation Rules**:
- Maximum header length: 256 characters
- Applies to `X-Consumer-ID` and `X-Consumer-Username`

**Resolution**:
1. Check consumer ID/username length in Kong
2. Truncate or reconfigure consumer identifiers
3. This is a security measure to prevent injection attacks

---

### 9. Token Expired (AUTH_010)

**Error Code**: `AUTH_010` - Token Expired
**HTTP Status**: 401

**Symptoms**:
- Token validation returns 401
- Error response includes `expiredAt` field
- Logs show "Token validation failed" with `expired: true`

**Diagnosis**:
```bash
# Validate a token and check expiration
curl -H "Authorization: Bearer <token>" \
     -H "X-Consumer-ID: <consumer-id>" \
     -H "X-Consumer-Username: <username>" \
     http://localhost:3000/tokens/validate

# Decode JWT to check expiration (without validation)
echo "<token>" | cut -d. -f2 | base64 -d 2>/dev/null | jq '.exp | todate'
```

**Resolution**:
1. Request a new token from `/tokens` endpoint
2. Implement token refresh logic in client application
3. Consider increasing token TTL if legitimate use case requires longer sessions
4. Check client/server clock synchronization

---

### 10. Invalid Token Format (AUTH_011)

**Error Code**: `AUTH_011` - Invalid Token
**HTTP Status**: 400

**Symptoms**:
- Token validation returns 400
- Error mentions "invalid signature" or "malformed"
- Token may be truncated, corrupted, or tampered with

**Diagnosis**:
```bash
# Check token format (should have 3 parts separated by dots)
echo "<token>" | tr '.' '\n' | wc -l  # Should output 3

# Validate token structure
curl -H "Authorization: Bearer <token>" \
     -H "X-Consumer-ID: <consumer-id>" \
     -H "X-Consumer-Username: <username>" \
     http://localhost:3000/tokens/validate
```

**Root Causes**:
1. Token was modified after issuance
2. Token was issued with a different secret
3. Token is malformed (missing parts, invalid base64)
4. Consumer secret was rotated after token issuance

**Resolution**:
1. Request a fresh token from `/tokens` endpoint
2. Ensure token is transmitted correctly (no truncation)
3. Verify consumer secret hasn't changed
4. Check for URL encoding issues in token transmission

---

### 11. Missing Authorization Header (AUTH_012)

**Error Code**: `AUTH_012` - Missing Authorization
**HTTP Status**: 400

**Symptoms**:
- Token validation returns 400
- Error mentions "Authorization header with Bearer token is required"

**Diagnosis**:
```bash
# Correct format
curl -H "Authorization: Bearer eyJhbGc..." http://localhost:3000/tokens/validate

# Common mistakes
curl -H "Authorization: eyJhbGc..."           # Missing "Bearer " prefix
curl -H "Bearer: eyJhbGc..."                  # Wrong header name
curl http://localhost:3000/tokens/validate     # No Authorization header
```

**Resolution**:
1. Add `Authorization` header with `Bearer ` prefix
2. Ensure token follows format: `Authorization: Bearer <jwt>`
3. Check for whitespace issues around the token

---

### 12. Consumer Not Found (AUTH_002)

**Error Code**: `AUTH_002` - Consumer Not Found
**HTTP Status**: 401

**Symptoms**:
- Token requests return 401
- Error message indicates consumer was not found
- Consumer exists in Kong but has no JWT credentials

**Diagnosis**:
```bash
# Check if consumer exists in Kong
curl -s ${KONG_ADMIN_URL}/consumers/{consumer_id}

# Check consumer's JWT credentials
curl -s ${KONG_ADMIN_URL}/consumers/{consumer_id}/jwt

# Verify consumer headers are being sent
curl -v http://localhost:3000/tokens
```

**Root Causes**:
1. Consumer doesn't exist in Kong
2. Consumer has no JWT credentials provisioned
3. JWT plugin not enabled for consumer
4. Stale cache with deleted consumer

**Resolution**:
1. Create consumer in Kong if missing
2. Provision JWT credentials for consumer:
   ```bash
   curl -X POST ${KONG_ADMIN_URL}/consumers/{consumer_id}/jwt \
     -d "key=consumer_key" \
     -d "algorithm=HS256" \
     -d "secret=your_secret"
   ```
3. Verify JWT plugin is enabled on the route
4. Clear cache if consumer was recently added

---

### 13. Rate Limit Exceeded (AUTH_006)

**Error Code**: `AUTH_006` - Rate Limit Exceeded
**HTTP Status**: 429

**Symptoms**:
- Requests return 429 status
- Response includes `Retry-After` header
- Error message indicates rate limit exceeded

**Diagnosis**:
```bash
# Check current rate limit configuration
curl -s http://localhost:3000/debug/info | jq '.rateLimits'

# Monitor rate limit metrics
curl -s http://localhost:3000/metrics | jq '.rateLimiter'

# Check if Kong rate limiting is also applied
curl -s ${KONG_ADMIN_URL}/plugins | jq '.data[] | select(.name=="rate-limiting")'
```

**Root Causes**:
1. Client exceeds configured rate limits
2. Burst traffic from single consumer
3. Rate limit configuration too restrictive
4. Multiple services using same consumer

**Resolution**:
1. Implement exponential backoff in client
2. Respect `Retry-After` header in responses
3. Review rate limit configuration in environment variables:
   - `RATE_LIMIT_TOKENS_PER_MINUTE`
   - `RATE_LIMIT_VALIDATION_PER_MINUTE`
4. Consider increasing limits for high-volume consumers
5. Implement client-side request queuing

**Prevention**:
- Monitor rate limit metrics regularly
- Set up alerts for consumers approaching limits
- Implement gradual backoff strategies
- Consider tiered rate limits for different consumer types

---

### 14. Internal Server Error (AUTH_008)

**Error Code**: `AUTH_008` - Internal Server Error
**HTTP Status**: 500

**Symptoms**:
- Unexpected 500 errors
- Generic error response without specific cause
- Error logged but not classified as other AUTH_XXX codes

**Diagnosis**:
```bash
# Check service logs
docker logs auth-service | grep -i "error"

# Review recent errors in metrics
curl -s http://localhost:3000/metrics | jq '.errors'

# Check health status
curl -s http://localhost:3000/health

# Review telemetry traces for error spans
curl -s http://localhost:3000/health/telemetry
```

**Root Causes**:
1. Uncaught exceptions in application code
2. Resource exhaustion (memory, file descriptors)
3. Unexpected data format or corruption
4. Dependency failures not covered by specific error codes
5. Race conditions or concurrency issues

**Resolution**:
1. Check application logs for stack traces
2. Review OpenTelemetry traces for error context:
   - Examine span attributes for error details
   - Look for exception events in traces
3. Monitor resource usage:
   ```bash
   curl -s http://localhost:3000/metrics | jq '.system'
   ```
4. If persistent, restart service and monitor for recurrence
5. Report to development team with:
   - Full error message and stack trace
   - Request that triggered the error
   - System state at time of error

**Prevention**:
- Monitor error rates via metrics endpoint
- Set up alerts for AUTH_008 spikes
- Review error logs regularly
- Implement comprehensive error handling

---

### 15. Anonymous Consumer (AUTH_009)

**Error Code**: `AUTH_009` - Anonymous Consumer
**HTTP Status**: 401

**Symptoms**:
- Token requests return 401
- Error indicates anonymous consumer attempted to get token
- Request includes `X-Anonymous-Consumer: true` header

**Diagnosis**:
```bash
# Check if request is being marked as anonymous
curl -v http://localhost:3000/tokens | grep "X-Anonymous-Consumer"

# Verify Kong authentication plugin configuration
curl -s ${KONG_ADMIN_URL}/routes/{route_id}/plugins | jq '.data[] | select(.name=="key-auth")'

# Check if anonymous consumer is configured in Kong
curl -s ${KONG_ADMIN_URL}/consumers | jq '.data[] | select(.username=="anonymous")'
```

**Root Causes**:
1. Request bypassed Kong authentication
2. Kong route allows anonymous access
3. Authentication plugin configured with `anonymous` consumer fallback
4. Missing or invalid API key

**Resolution**:
1. Ensure all requests go through Kong gateway
2. Verify Kong authentication plugins are properly configured
3. Remove anonymous consumer fallback from authentication plugins
4. Require valid authentication credentials:
   ```bash
   # Update plugin to disable anonymous access
   curl -X PATCH ${KONG_ADMIN_URL}/plugins/{plugin_id} \
     -d "config.anonymous="
   ```
5. Verify API key or authentication credentials are provided

**Prevention**:
- Do not configure anonymous consumers for authentication endpoints
- Enforce authentication at Kong gateway level
- Monitor for AUTH_009 errors as they indicate misconfiguration
- Regular audit of Kong route and plugin configurations

---

### 16. Bun Development Server Won't Start

**Symptoms**:
- `bun run dev` hangs with no output
- Error: `node_modules/.bin/bun: Undefined error: 0`
- Server starts with `bun src/index.ts` but not with `bun run dev`

**Diagnosis**:
```bash
# Check if broken symlink exists
ls -la node_modules/.bin/bun

# Expected broken symlink (points to Windows path on macOS):
# lrwxrwxrwx node_modules/.bin/bun -> ../bun/bin/bun.exe
```

**Root Cause**:
After Bun upgrades, `bun install` may create a broken symlink at `node_modules/.bin/bun` pointing to a Windows executable path (`bun.exe`) on macOS/Linux systems.

**Resolution**:

Quick fix (removes broken symlink):
```bash
bun run fix:bun-symlink
```

Full fix (clears all caches and reinstalls):
```bash
bun run fix:bun-full
```

Manual fix:
```bash
rm -f node_modules/.bin/bun
```

**Prevention**:
This project includes a `postinstall` hook that automatically removes the broken symlink after every `bun install`:

```json
"postinstall": "rm -f node_modules/.bin/bun || true"
```

This hook runs automatically, but if you encounter issues after Bun version upgrades, manually run:
```bash
rm -rf node_modules bun.lockb
bun install
```

The `postinstall` hook will clean up any broken symlinks automatically.

---

### 17. Winston Logger Environment Conflicts

**Symptoms**:
- Winston logger tests disabled with `test.skip` in parallel test execution
- Test failures related to environment variable configuration during concurrent runs
- Inconsistent logging behavior in test environments

**Cause**:
The Winston logger is configured via environment variables (`LOG_LEVEL`, `NODE_ENV`) which creates conflicts when multiple tests run concurrently. Each test may expect different environment settings, but environment variables are process-global, causing interference between concurrent tests.

**Why Tests Are Disabled**:
```typescript
// test/bun/logging/winston-logger.test.ts
test.skip("winston logger environment tests", () => {
  // Disabled: Environment variable conflicts in parallel execution
  // Trade-off: Ensures suite stability over 100% parallel coverage
});
```

**Resolution**:
1. **Accept the trade-off**: Winston logger tests are intentionally disabled during parallel execution to ensure overall test suite stability
2. **Manual testing**: Run Winston logger tests individually when needed:
   ```bash
   bun test test/bun/logging/winston-logger.test.ts --no-parallel
   ```
3. **CI/CD approach**: Consider running environment-sensitive tests in a separate, sequential test stage

**Prevention**:
- Design future logger implementations to support per-test-instance configuration rather than global environment variables
- Use dependency injection to pass logger instances rather than relying on global state
- Consider using test-scoped configuration objects instead of process environment variables

---

### 18. Elasticsearch Field Mapping Issues

**Symptoms**:
- Custom application fields not appearing in expected Elasticsearch indexes
- Queries against standard Elasticsearch fields returning no results
- Fields appearing under `labels.*` instead of standard ECS fields

**Cause**:
The service implements Elastic Common Schema (ECS) field mapping to transform custom application fields to Elasticsearch-standard field names. If logging or indexing is not configured to recognize these mappings, fields may be stored under non-standard paths.

**Expected Field Structure**:

| Custom Field | Mapped Field | Description |
|--------------|--------------|-------------|
| `consumerId` | `consumer.id` | Consumer identifier from Kong |
| `username` | `consumer.name` | Consumer username |
| `requestId` | `event.id` | Unique request identifier |
| `totalDuration` | `event.duration` | Duration in nanoseconds |

**Why Custom Fields May Appear Under `labels.*`**:
- Log shipper (Filebeat, Fluentd) not configured to parse ECS format
- Elasticsearch index template not configured with ECS field mappings
- Custom fields sent without ECS transformation (non-Winston loggers)

**Verification**:
```bash
# Check if field mapping is working
curl -X GET "http://elasticsearch:9200/logs-*/_search?pretty" -H 'Content-Type: application/json' -d'
{
  "query": {
    "bool": {
      "must": [
        { "exists": { "field": "consumer.id" }},
        { "exists": { "field": "consumer.name" }},
        { "exists": { "field": "event.id" }}
      ]
    }
  },
  "_source": ["consumer.id", "consumer.name", "event.id", "event.duration"],
  "size": 10
}
'
```

**Resolution**:
1. **Verify Winston logger configuration**: Ensure field mapping is enabled (`src/telemetry/winston-logger.ts:39-56`)
2. **Check Elasticsearch index template**: Verify field mappings are defined
3. **Review log shipper configuration**: Ensure Filebeat/Fluentd is configured to preserve field structure
4. **Query optimization**: Use mapped fields in queries:
   ```javascript
   // Good: Mapped field query
   { "term": { "consumer.id": "consumer-uuid" }}

   // Avoid: Custom field query
   { "term": { "consumerId": "consumer-uuid" }}
   ```

**Documentation Reference**: See `docs/operations/monitoring.md` ECS Field Mapping section for complete field reference and implementation details.

---

### 19. Parallel Test Intermittency

**Symptoms**:
- Tests pass individually but fail when run in parallel
- Intermittent cache-related test failures
- Timeout errors during concurrent test execution
- Inconsistent test results between runs

**Cause**:
Parallel test execution requires careful isolation of shared resources (Redis cache, environment variables, timers). Without proper isolation, tests can interfere with each other through shared state.

**Redis Database Isolation Strategy**:

The test suite uses a separate Redis database for test isolation:

```bash
# Test suite configuration
REDIS_DB=10  # Tests use DB 10 (separate from production DB 0)
```

**Benefits**:
- Tests run concurrently without cache collisions
- Local development server (DB 0) unaffected by test runs
- Clean state for each test run via `FLUSHDB` on DB 10 only

**Timeout Configuration Best Practices**:

```typescript
// Good: Operation-specific timeout with clean error handling
const response = await fetch(url, {
  signal: AbortSignal.timeout(5000)  // 5-second timeout for external APIs
});

// Avoid: Test framework timeout (less granular control)
test("should fetch data", { timeout: 5000 }, async () => {
  await fetch(url);  // No operation-specific timeout
});
```

**Functional Equivalence vs Instance Equality**:

```typescript
// AVOID: Instance equality (fragile in concurrent tests)
expect(cachedObject).toBe(originalObject);

// PREFER: Functional equivalence (stable in parallel execution)
expect(cachedObject.id).toBe(originalObject.id);
expect(cachedObject.username).toBe(originalObject.username);
expect(cachedObject.secret).toBe(originalObject.secret);
```

**Why This Matters**:
- Cache implementations may deserialize/reserialize objects
- Parallel tests may have separate cache instances
- Functional equivalence verifies the API contract, not memory addresses

**Resolution**:
1. **Use Redis DB 10**: Ensure test configuration sets `REDIS_DB=10`
2. **Flush between tests**: Use `beforeEach` hooks to flush test database:
   ```typescript
   beforeEach(async () => {
     await redis.select(10);
     await redis.flushdb();
   });
   ```
3. **Set operation-specific timeouts**: Use `AbortSignal.timeout()` for fetch operations
4. **Test behavior, not implementation**: Prefer functional equivalence over strict equality
5. **Isolate environment-sensitive tests**: Use `test.skip` for tests with global environment dependencies

**Garbage Collection Thresholds**:
- 20ms thresholds for GC monitoring tests
- Environment-aware: stricter in CI, looser in local development
- Prevents false positives during parallel execution

**Documentation Reference**: See `docs/development/testing.md` Parallel Test Execution section for comprehensive patterns and best practices.

---

## Mutation Testing Troubleshooting

### Problem: "There were failed tests in the initial test run"

**Symptom:** StrykerJS reports test failures even though `bun test` passes all tests.

**Root Cause:** StrykerJS cannot parse Bun's console output due to mixed Winston JSON logs and test output.

**Solution (SIO-287):**

1. **Verify dots reporter is configured:**
   ```bash
   grep '"--reporter=dots"' scripts/bun-mutation-runner.sh
   ```

2. **Verify silent logging:**
   ```bash
   grep 'LOG_LEVEL=silent' scripts/bun-mutation-runner.sh
   ```

3. **Test fix:**
   ```bash
   # Run dry run to verify configuration
   bun run test:mutation:dry

   # Should see: "Ran X tests in Y seconds" (no Winston logs)
   ```

**Reference:** `docs/workarounds/SIO-287-strykerjs-bun-output-parser.md`

### Problem: ENOEXEC Error When Running Mutation Tests

**Symptom:**
```
Error: spawn ENOEXEC
    at ChildProcess.spawn
```

**Root Cause:** StrykerJS tries to execute Bun directly, which fails due to ENOEXEC permission issue.

**Solution (SIO-276):**

1. **Verify bundled Bun exists:**
   ```bash
   ls -lh scripts/bundled-runtimes/bun-cli
   ```

2. **Test bundled Bun:**
   ```bash
   BUN_BE_BUN=1 ./scripts/bundled-runtimes/bun-cli --version
   ```

3. **Verify wrapper script uses BUN_BE_BUN:**
   ```bash
   grep 'BUN_BE_BUN=1' scripts/bun-mutation-runner.sh
   ```

**Reference:** `docs/workarounds/SIO-276-bun-executable-workaround.md`

### Problem: Mutation Testing Very Slow

**Symptom:** Mutation testing takes 2+ hours on 4-core machine.

**Diagnosis:**

1. **Check concurrency setting:**
   ```bash
   grep '"concurrency"' stryker.config.json
   # Should be: "concurrency": 4 (or 2 for 2-core machines)
   ```

2. **Check if using incremental mode:**
   ```bash
   # Fresh run is slow (expected)
   bun run test:mutation:fresh  # 79 minutes baseline

   # Incremental run should be fast
   bun run test:mutation        # 26 seconds expected
   ```

3. **Verify incremental cache exists:**
   ```bash
   ls -lh .stryker-tmp/incremental.json
   ```

**Solutions:**

- **Use incremental mode:** `bun run test:mutation` (not `:fresh`)
- **Increase concurrency:** Edit `stryker.config.json` (4-8 cores recommended)
- **Use targeted scripts:** Run specific modules instead of all code
- **Upgrade hardware:** 8+ cores significantly improve performance

**Reference:** `docs/development/mutation-testing-optimization.md`

### Problem: Memory Pressure During Mutation Testing

**Symptom:**
- System runs out of memory
- OOM killer terminates Stryker process
- Browser/IDE becomes slow during mutation testing

**Solutions:**

1. **Reduce concurrency:**
   ```json
   {
     "concurrency": 2  // Reduce from 4
   }
   ```

2. **Close memory-intensive applications:**
   ```bash
   # Close browsers, IDEs during mutation testing
   killall chrome firefox
   ```

3. **Increase system swap:**
   ```bash
   # Add swap space if RAM < 8GB
   sudo fallocate -l 4G /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```

4. **Run mutation testing overnight:**
   ```bash
   # Lower priority to avoid impacting other work
   nice -n 19 bun run test:mutation:fresh
   ```

### Problem: Mutation Survivors (Score < 100%)

**Symptom:** Some mutants survive mutation testing, lowering mutation score.

**Diagnosis:**

1. **Run dry run to see mutants:**
   ```bash
   bun run test:mutation:dry
   ```

2. **Check mutation report:**
   ```bash
   cat .stryker-tmp/mutation-report.json | jq '.files'
   ```

3. **Identify surviving mutants:**
   ```bash
   # Look for "Status: Survived" in report
   grep -A5 "Survived" .stryker-tmp/stryker.log
   ```

**Solutions:**

1. **Add mutation killer tests:**
   ```typescript
   // Example: Kill arithmetic mutants
   test('mutation killer: addition vs subtraction', () => {
     expect(add(2, 3)).toBe(5);     // Kills: 2 - 3
     expect(add(5, 7)).toBe(12);    // Kills: 5 - 7
     expect(add(-2, 3)).toBe(1);    // Kills: -2 - 3
   });
   ```

2. **Add boundary tests:**
   ```typescript
   // Example: Kill comparison mutants
   test('mutation killer: comparison boundaries', () => {
     expect(isPositive(1)).toBe(true);   // Kills: < 0
     expect(isPositive(0)).toBe(false);  // Kills: <= 0
     expect(isPositive(-1)).toBe(false); // Kills: > 0
   });
   ```

3. **Test error paths:**
   ```typescript
   // Example: Kill logical mutants
   test('mutation killer: error conditions', () => {
     expect(() => divide(10, 0)).toThrow();  // Kills: && to ||
   });
   ```

**Reference:** `docs/development/testing.md` Section 4 (Mutation Testing)

### Problem: Stale Incremental Cache

**Symptom:**
- Mutation testing reports cached results for changed code
- Test changes not reflected in mutation testing
- Inconsistent mutation scores

**Solution:**

1. **Clear incremental cache:**
   ```bash
   rm -rf .stryker-tmp/incremental.json
   ```

2. **Run fresh mutation testing:**
   ```bash
   bun run test:mutation:fresh
   ```

3. **Verify cache cleared:**
   ```bash
   # Should not exist after fresh run
   ls .stryker-tmp/incremental.json
   ```

**When to clear cache:**
- After major refactoring
- After changing test files significantly
- Before creating baseline mutation report
- If mutation scores seem inconsistent

### Problem: CI/CD Mutation Testing Timeouts

**Symptom:** GitHub Actions workflow times out during mutation testing.

**Solutions:**

1. **Increase timeout:**
   ```yaml
   jobs:
     mutation-test:
       timeout-minutes: 120  # Increase from default 60
   ```

2. **Use larger runner:**
   ```yaml
   runs-on: ubuntu-latest-4-cores  # Instead of ubuntu-latest
   ```

3. **Run mutation testing nightly:**
   ```yaml
   on:
     schedule:
       - cron: '0 2 * * *'  # 2 AM daily, doesn't block PRs
   ```

4. **Use incremental strategy (with caution):**
   ```yaml
   # Only test changed files (faster but less comprehensive)
   - uses: tj-actions/changed-files@v40
   - run: bun run test:mutation  # Incremental mode
   ```

**Reference:** `docs/development/mutation-testing-optimization.md` CI/CD Integration section

### Problem: Bundled Bun Executable Missing or Corrupted

**Symptom:**
```bash
BUN_BE_BUN=1 ./scripts/bundled-runtimes/bun-cli --version
# Error: No such file or directory
```

**Solution:**

1. **Download bundled Bun for your platform:**
   ```bash
   # macOS ARM64
   curl -fsSL https://github.com/oven-sh/bun/releases/download/bun-v1.3.6/bun-darwin-aarch64.zip -o bun.zip
   unzip bun.zip
   mv bun-darwin-aarch64/bun scripts/bundled-runtimes/bun-cli
   chmod +x scripts/bundled-runtimes/bun-cli

   # Linux x64
   curl -fsSL https://github.com/oven-sh/bun/releases/download/bun-v1.3.6/bun-linux-x64.zip -o bun.zip
   unzip bun.zip
   mv bun-linux-x64/bun scripts/bundled-runtimes/bun-cli
   chmod +x scripts/bundled-runtimes/bun-cli
   ```

2. **Verify installation:**
   ```bash
   BUN_BE_BUN=1 ./scripts/bundled-runtimes/bun-cli --version
   # Should output: 1.3.6
   ```

3. **Run mutation testing:**
   ```bash
   bun run test:mutation:dry  # Test without running mutations
   ```

**Reference:** `docs/workarounds/SIO-276-bun-executable-workaround.md`

### Quick Reference: Common Mutation Testing Commands

```bash
# Dry run (preview mutants, no test execution)
bun run test:mutation:dry

# Debug mode (verbose output)
bun run test:mutation:dry:debug

# Fresh run (clear cache, full mutation testing)
bun run test:mutation:fresh

# Incremental run (fast, uses cache)
bun run test:mutation

# Clear all Stryker artifacts
rm -rf .stryker-tmp/

# Verify bundled Bun
BUN_BE_BUN=1 ./scripts/bundled-runtimes/bun-cli --version

# Check mutation report
cat .stryker-tmp/mutation-report.json | jq

# View Stryker logs
cat .stryker-tmp/stryker.log
```

---

## Redis Tracing Troubleshooting

### Problem: Redis Operations Not Appearing in Distributed Traces

**Symptoms:**
- Redis operations missing from trace waterfall in observability tools
- Redis spans appear as orphaned root spans (not nested under HTTP requests)
- trace.id or span.id missing from Redis operation logs

**Common Causes:**

1. **OpenTelemetry Context Not Propagated**
   ```bash
   # Check if Redis instrumentation is enabled
   grep -r "redis-instrumentation" src/telemetry/

   # Verify context API is imported
   grep "context.active()" src/telemetry/redis-instrumentation.ts
   ```

2. **Spans Created Without Parent Context**
   - Redis spans must be created with `context.active()` as parent
   - Operations must be wrapped with `context.with()` to maintain hierarchy

   **Fix**: Ensure `src/telemetry/redis-instrumentation.ts:65` uses:
   ```typescript
   const span = tracer.startSpan(spanName, {...}, context.active());
   ```

3. **Trace Context Not Maintained During Async Operations**
   - Async operations can lose trace context if not properly wrapped

   **Fix**: Wrap operation execution with context binding:
   ```typescript
   return context.with(trace.setSpan(context.active(), span), () => {
     return operation();
   });
   ```

**Verification Steps:**

1. **Check Span Hierarchy in Observability Tool:**
   ```
   Expected:
   HTTP Request (root)
   ├── Kong Consumer Lookup
   ├── JWT Generation
   └── Redis Operations
       ├── redis.get
       └── redis.set

   Not Expected:
   HTTP Request (root)
   redis.get (orphaned root span)
   redis.set (orphaned root span)
   ```

2. **Verify Log Correlation:**
   ```bash
   # Check logs for trace.id correlation
   curl http://localhost:3000/tokens -H "X-Consumer-ID: test" | jq '.trace.id'

   # Check Redis operation logs have same trace.id
   grep "Redis GET completed" logs.json | jq '.trace.id'
   ```

3. **Test Trace Continuity:**
   ```bash
   # Generate token and verify full trace
   curl http://localhost:3000/tokens \
     -H "X-Consumer-ID: 98765432-9876-5432-1098-765432109876" \
     -H "X-Consumer-Username: test-consumer"

   # Check observability tool for:
   # - HTTP request span
   # - Kong lookup span (child of HTTP)
   # - JWT generation span (child of HTTP)
   # - Redis operations spans (children of HTTP)
   ```

**Debug Mode:**
```bash
# Enable detailed tracing logs
LOG_LEVEL=debug TELEMETRY_MODE=both bun run dev

# Monitor Redis operations
curl http://localhost:3000/tokens -H "X-Consumer-ID: test" -H "X-Consumer-Username: test"

# Look for logs showing:
# - "Redis instrumentation creating span with parent context"
# - trace.id and span.id present in all Redis logs
```

**Reference:**
- Implementation: `src/telemetry/redis-instrumentation.ts`
- Tests: `test/bun/telemetry/redis-instrumentation-utils.test.ts` (16 tests)
- Documentation: `docs/operations/monitoring.md` (Redis Trace Hierarchy section)
- Commit: f4bc0d5 (2026-01-27) - Fixed Redis trace context propagation

---

## Error Code Reference

| Code | HTTP | Title | Typical Action |
|------|------|-------|----------------|
| AUTH_001 | 401 | Missing Consumer Headers | Check Kong gateway configuration |
| AUTH_002 | 401 | Consumer Not Found | Create consumer in Kong |
| AUTH_003 | 500 | JWT Creation Failed | Check Kong JWT plugin |
| AUTH_004 | 503 | Kong API Unavailable | Verify Kong connectivity |
| AUTH_005 | 503 | Circuit Breaker Open | Wait for recovery |
| AUTH_006 | 429 | Rate Limit Exceeded | Reduce request rate |
| AUTH_007 | 400 | Invalid Request Format | Check header length |
| AUTH_008 | 500 | Internal Server Error | Check logs for details |
| AUTH_009 | 401 | Anonymous Consumer | Configure authenticated consumer |
| AUTH_010 | 401 | Token Expired | Request new token |
| AUTH_011 | 400 | Invalid Token | Check token format |
| AUTH_012 | 400 | Missing Authorization | Add Bearer token |

---

## Graceful Shutdown Verification

The service implements proper interval cleanup during shutdown:

### Shutdown Functions Called

| Function | Purpose |
|----------|---------|
| `shutdownGCMetrics()` | Stops GC monitoring interval |
| `shutdownConsumerVolume()` | Clears consumer tracking interval |
| `shutdownCardinalityGuard()` | Clears cardinality cleanup interval |
| `shutdownTelemetryCircuitBreakers()` | Clears circuit breaker intervals |
| `shutdownMetrics()` | Flushes final metrics |
| `shutdownSimpleTelemetry()` | Flushes traces and closes exporters |

### Verifying Clean Shutdown

```bash
# Send SIGTERM and check logs
kill -TERM <pid>

# Expected log sequence:
# - "Shutdown sequence initiated"
# - "Stopping HTTP server"
# - "Clearing intervals"
# - "Flushing telemetry"
# - "Shutdown complete"
```

### Timeout Behavior

- Graceful shutdown timeout: 10 seconds
- If exceeded, process force-exits with code 1
- Force exit logs: "Graceful shutdown timeout - forcing exit"

---

## Log Analysis

### Key Log Fields

| Field | Description |
|-------|-------------|
| `component` | Service component (server, kong, telemetry) |
| `event` | Event type (startup, shutdown, error) |
| `operation` | Specific operation (health_check, token_issue) |
| `requestId` | Request correlation ID |
| `errorCode` | Structured error code (AUTH_XXX) |
| `duration` | Operation duration in ms |

### Useful Log Queries

```bash
# Find all errors
grep '"level":"error"' logs.json | jq .

# Find Kong issues
grep '"component":"kong"' logs.json | jq .

# Find slow operations (>100ms)
grep -E '"duration":[1-9][0-9]{2,}' logs.json | jq .

# Find circuit breaker events
grep '"circuitBreaker"' logs.json | jq .
```

---

## Escalation Checklist

Before escalating, verify:

- [ ] Service health endpoint responding
- [ ] Kong Admin API accessible
- [ ] Circuit breaker state checked
- [ ] Recent logs reviewed
- [ ] Memory and CPU within limits
- [ ] OTLP endpoint connectivity verified
- [ ] Error codes documented in ticket

---

## Frequently Asked Questions (FAQ)

### Token Generation

**Q: How long are tokens valid?**
A: By default, tokens expire after 900 seconds (15 minutes). Check the `expires_in` field in the token response.

**Q: Can I customize token expiration time?**
A: Token TTL is configured at the service level. Contact your platform administrator to adjust the default expiration time.

**Q: Why do I need both X-Consumer-ID and X-Consumer-Username headers?**
A: Both headers are required for security:
- `X-Consumer-ID`: UUID that uniquely identifies the consumer in Kong
- `X-Consumer-Username`: Human-readable identifier for logging and audit trails

**Q: What happens if I send a request with X-Anonymous-Consumer: true?**
A: The request will be rejected with `AUTH_009`. Anonymous consumers are not permitted to obtain JWT tokens.

---

### Token Validation

**Q: How do I validate a token I received?**
A: Send a GET request to `/tokens/validate` with the token in the Authorization header:
```bash
curl -H "Authorization: Bearer <your-token>" \
     -H "X-Consumer-ID: <consumer-id>" \
     -H "X-Consumer-Username: <username>" \
     http://localhost:3000/tokens/validate
```

**Q: Why do I need Kong headers to validate a token?**
A: The service needs to look up the consumer's secret to verify the token signature. Kong headers identify which consumer's secret to use.

**Q: Can I validate tokens issued by other services?**
A: No. Only tokens issued by this service can be validated, as they are signed with consumer-specific secrets stored in Kong.

---

### Circuit Breaker

**Q: What triggers the circuit breaker?**
A: The circuit breaker opens when Kong API failures exceed 50% over the rolling window (10 seconds).

**Q: How long does the circuit breaker stay open?**
A: The circuit resets after 60 seconds, entering half-open state to test if the service has recovered.

**Q: Can I still get tokens when the circuit breaker is open?**
A: Yes, if stale cache is available (within 30-minute tolerance). The service uses cached consumer secrets as fallback.

**Q: How do I check circuit breaker status?**
A: Query the metrics endpoint:
```bash
curl http://localhost:3000/metrics?view=operational | jq '.circuitBreakers'
```

---

### Health Checks

**Q: What's the difference between /health and /health/ready?**
A:
- `/health`: Liveness probe - checks if the service is running
- `/health/ready`: Readiness probe - checks if the service can handle traffic (Kong is accessible)

**Q: Which endpoint should I use for Kubernetes probes?**
A:
- **Liveness probe**: Use `/health`
- **Readiness probe**: Use `/health/ready`

**Q: Why does /health return "degraded" status?**
A: The service is running but one or more dependencies (typically Kong) are unhealthy. Token generation may fail.

---

### Metrics and Observability

**Q: What metrics views are available?**
A: Six views accessible via `/metrics?view=<name>`:
| View | Description |
|------|-------------|
| `operational` | Runtime metrics, cache, circuit breakers (default) |
| `infrastructure` | System-level metrics |
| `telemetry` | OpenTelemetry export status |
| `exports` | Detailed export statistics |
| `config` | Current configuration summary |
| `full` | All metrics combined |

**Q: How do I check if telemetry is working?**
A: Check the telemetry health endpoint:
```bash
curl http://localhost:3000/health/telemetry | jq '.telemetry.status.initialized'
```

**Q: What does TELEMETRY_MODE control?**
A:
- `console`: Logs telemetry to stdout (development)
- `otlp`: Exports to OTLP endpoints (production)
- `both`: Console logging + OTLP export (debugging)

---

### Kong Integration

**Q: What Kong mode should I use?**
A:
- `API_GATEWAY`: Self-hosted Kong with Admin API access
- `KONNECT`: Kong Konnect cloud service

**Q: How do I verify Kong connectivity?**
A:
```bash
# Check from the service
curl http://localhost:3000/health | jq '.dependencies.kong'

# Check Kong directly
curl ${KONG_ADMIN_URL}/status
```

**Q: Why is consumer lookup slow?**
A: Possible causes:
1. Network latency to Kong Admin API
2. Large number of consumers in Kong
3. Kong database performance issues

Check cache hit rate to see if caching is effective:
```bash
curl http://localhost:3000/metrics | jq '.cache.hitRate'
```

---

### Security

**Q: Why is there a 256 character limit on headers?**
A: This is a security measure to prevent:
- Buffer overflow attacks
- Injection attempts via oversized headers
- Resource exhaustion from processing large headers

**Q: Are tokens encrypted?**
A: JWT tokens are signed (HMAC-SHA256) but not encrypted. Do not store sensitive data in token claims.

**Q: How are consumer secrets protected?**
A: Consumer secrets are:
1. Retrieved from Kong Admin API (secured by KONG_ADMIN_TOKEN)
2. Cached in memory with TTL-based expiration
3. Never logged or exposed in API responses

---

### Debugging

**Q: How do I enable debug endpoints?**
A: Debug endpoints are available in development/staging environments. Set `PROFILING_ENABLED=true` for profiling features.

**Q: How do I force a metrics export?**
A:
```bash
curl -X POST http://localhost:3000/debug/metrics/export
```

**Q: How do I test metrics recording?**
A:
```bash
curl -X POST http://localhost:3000/debug/metrics/test
# Wait for export interval, then check
curl http://localhost:3000/metrics?view=exports
```

---

### Common Error Patterns

**Q: I'm getting 401 errors but my consumer exists in Kong**
A: Check:
1. Consumer has JWT credentials configured (not just API key)
2. Headers are spelled correctly (`X-Consumer-ID`, not `x-consumer-id`)
3. `X-Anonymous-Consumer` is not set to "true"

**Q: All my requests suddenly fail with 503**
A: Likely causes:
1. Kong Admin API is down
2. Circuit breaker is open
3. Network connectivity issue

Check circuit breaker state and Kong health:
```bash
curl http://localhost:3000/health | jq '.dependencies.kong'
curl http://localhost:3000/metrics | jq '.circuitBreakers'
```

**Q: Token generation works but validation fails**
A: Possible causes:
1. Token has expired (check `exp` claim)
2. Consumer secret was rotated after token was issued
3. Token was modified/corrupted in transit

---

### Performance

**Q: What is the expected response time?**
A: See [Performance SLA](sla.md) for detailed thresholds:
- Health checks: <50ms (P95)
- Token generation: <100ms (P95)
- Token validation: <50ms (P95)

**Q: How many requests can the service handle?**
A: The service handles 100k+ requests/second on a single instance. Scale horizontally for higher throughput.

**Q: Why are my requests slow?**
A: Check:
1. Kong Admin API latency
2. Cache hit rate (low rate means more Kong lookups)
3. Event loop delay
4. Memory pressure

```bash
curl http://localhost:3000/metrics?view=full | jq '{
  kong_latency: .kong.latency,
  cache_hit_rate: .cache.hitRate,
  memory_usage: .memory.used
}'
```

---

## Bun Fetch Networking Issues (SIO-288)

### Problem: FailedToOpenSocket with Private/LAN IP Addresses

**Symptoms:**
- `fetch()` throws `FailedToOpenSocket: Was there a typo in the url or port?` errors
- `fetch()` throws `ConnectionRefused` errors
- Health check tests timeout (5000ms each) waiting for OTEL endpoints
- Same URL works perfectly with `curl` command
- Affects Kong Admin API and OTEL collector connections on private IPs (192.168.x.x, 10.x.x.x)
- Error occurs almost immediately (~12ms) rather than timing out

**Example Error:**
```
FailedToOpenSocket: Was there a typo in the url or port?
  url: "http://192.168.178.3:4318/v1/traces"
```

**Root Cause:**

Bun v1.3.x has known networking bugs that cause `fetch()` to fail when connecting to services on local/private IP addresses, even when the service is reachable via curl.

**Known Bun GitHub Issues:**
- [#3327](https://github.com/oven-sh/bun/issues/3327) - Socket pooling bug (CLOSE_WAIT accumulation)
- [#10731](https://github.com/oven-sh/bun/issues/10731) - DNS/IPv4 vs IPv6 issues (fixed in v1.1.9)
- [#9917](https://github.com/oven-sh/bun/issues/9917) - Windows/Docker FailedToOpenSocket
- [#24001](https://github.com/oven-sh/bun/issues/24001) - Proxy/Unix socket options bug
- [#1425](https://github.com/oven-sh/bun/issues/1425) - ConnectionRefused on localhost
- [#6885](https://github.com/oven-sh/bun/issues/6885) - Bun doesn't understand "localhost"

**Solution: Use `fetchWithFallback()`**

The service implements automatic curl fallback when Bun's native fetch fails:

```typescript
import { fetchWithFallback } from '../utils/bun-fetch-fallback';

// Use exactly like native fetch
const response = await fetchWithFallback('http://192.168.178.3:30001/status');
const data = await response.json();
```

**Behavior:**
1. Try native `fetch()` first (preferred for performance)
2. If fetch fails, automatically retry via `curl` subprocess
3. Return standard Response object in both cases
4. Check AbortSignal before and after curl execution

**Performance Impact:**

| Scenario | Latency | Notes |
|----------|---------|-------|
| Successful fetch | ~5-10ms | No fallback needed |
| Failed fetch + curl success | ~40-60ms | Acceptable for fallback |
| Failed fetch + curl timeout | ~3000ms | Curl timeout limit |
| Both fail | ~3050ms | Operation fails with original error |

**HEAD Request Handling:**

The curl fallback uses `-I` flag for HEAD requests instead of `-X HEAD`:

```bash
# Correct (returns exit code 0)
curl -s -I -m 3 http://192.168.178.3:4318/v1/traces

# Incorrect (returns exit code 28 timeout even with valid response)
curl -s -i -X HEAD -m 3 http://192.168.178.3:4318/v1/traces
```

**When to Use:**

| Use `fetchWithFallback()` for | Use native `fetch()` for |
|-------------------------------|---------------------------|
| Kong Admin API requests | Public internet URLs |
| External service calls to local IPs | Localhost URLs |
| Integration tests connecting to remote services | Performance-critical paths |
| OTEL collector connections on LAN | |

**Verification:**

```bash
# Test curl fallback is working
LOG_LEVEL=debug bun run dev

# Make request to Kong on local IP
curl -X POST http://localhost:3000/tokens \
  -H "X-Consumer-ID: test-consumer" \
  -H "X-Consumer-Username: test-consumer"

# Look for logs showing:
# - "Fetch failed, trying curl fallback"
# - "Curl fallback successful"
```

**Files Involved:**
- `src/utils/bun-fetch-fallback.ts` - Core fetch fallback implementation
- `src/handlers/health.ts` - Uses fallback for OTEL health checks
- `test/integration/setup.ts` - Test polyfill with same pattern

**Reference:** `docs/development/profiling.md` (Bun Fetch Curl Fallback section)

---

## Related Documentation

- [Performance SLA](sla.md) - SLA definitions and thresholds
- [Monitoring Guide](monitoring.md) - Observability setup
- [API Endpoints](../api/endpoints.md) - Complete API reference
- [Environment Setup](../configuration/environment.md) - Configuration options
