# Performance SLA Documentation

This document defines the Service Level Agreements (SLAs) for the CapellaQL GraphQL service, providing explicit performance expectations for SRE teams and stakeholders.

## Response Time SLAs

| Endpoint Category | P50 | P95 | P99 | Max |
|-------------------|-----|-----|-----|-----|
| Health Check (`/health`) | <5ms | <15ms | <25ms | <100ms |
| Health Sub-endpoints (`/health/*`) | <10ms | <50ms | <100ms | <500ms |
| Health Comprehensive (`/health/comprehensive`) | <100ms | <400ms | <500ms | <1000ms |
| GraphQL Simple Query (`/graphql`) | <50ms | <150ms | <300ms | <1000ms |
| GraphQL Complex Query (`/graphql`) | <200ms | <500ms | <800ms | <2000ms |

**Note on Health Endpoint Performance:**

The `/health/comprehensive` endpoint performs active validation of all subsystems including Couchbase connectivity, telemetry endpoints, cache status, and system resources. This adds latency compared to lightweight checks:

- **Lightweight checks** (`/health`, `/health/live`, `/health/ready`): p95 <15ms, p99 <25ms
- **System checks** (`/health/system`, `/health/performance`): p95 <50ms, p99 <100ms
- **Comprehensive check** (`/health/comprehensive`): p95 <400ms, p99 <500ms

For Kubernetes liveness probes, use `/health/live` which performs no dependency checks (p95 <10ms). For readiness probes, use `/health/ready` which validates Couchbase connectivity (p95 <25ms).

**Note on GraphQL Query Performance:**

Response times depend on query complexity and Couchbase query execution. Cached responses (via multi-tier cache) are significantly faster:

- **Cache hit (SQLite response cache)**: p95 <10ms
- **Cache hit (DataLoader batch)**: p95 <30ms
- **Cache miss (Couchbase query)**: p95 varies by query complexity

### Measurement Methodology

- Response times measured from request receipt to response sent
- Excludes network latency between client and service
- Measured at application level via OpenTelemetry instrumentation
- K6 performance tests validate these SLAs in CI/CD pipeline

## Availability SLA

| Metric | Target | Measurement |
|--------|--------|-------------|
| Service Availability | 99.9% | Health endpoint responding with 200 |
| GraphQL Query Availability | 99.5% | Successful GraphQL query resolution rate |

### Exclusions

- Planned maintenance windows (communicated 24h in advance)
- Couchbase Capella dependency outages
- Infrastructure-level outages (network, compute)
- Force majeure events

### Degraded Mode Operation

The service supports degraded mode when Couchbase is unavailable:
- Health checks continue to respond (reporting degraded status)
- Cached GraphQL responses may still be served from SQLite cache
- New Couchbase queries return structured GraphQL errors
- Circuit breaker prevents cascading failures to the database layer

## Throughput Targets

| Endpoint | Target RPS | Notes |
|----------|-----------|-------|
| Health Check (`/health`) | 100,000+ | Bun native performance, no dependency checks |
| Health Sub-endpoints | 50,000+ | Varies by subsystem validation depth |
| GraphQL (`/graphql`) | 5,000+ | Depends on query complexity and cache hit rate |
| GraphQL (cached) | 20,000+ | Responses served from SQLite or DataLoader cache |

### Concurrent Connection Limits

- Maximum concurrent connections: 10,000+
- Connection keep-alive: Enabled
- Request timeout: 30 seconds (idle timeout)
- Maximum request body size: 512KB

## Resource Limits

| Resource | Baseline | Warning | Critical | Max |
|----------|----------|---------|----------|-----|
| Memory (RSS) | 50-80MB | >180MB (70%) | >200MB (80%) | 256MB |
| CPU Usage | <1% idle | >50% | >80% | - |
| Event Loop Delay | <10ms | >50ms | >100ms | - |
| Heap Usage | 30-50MB | >70% | >85% | - |

### Cold Start Performance

- Target cold start time: <100ms
- Includes telemetry initialization
- Measured from process spawn to first request handled

## Circuit Breaker SLAs

The service implements a custom circuit breaker for Couchbase database operations (`src/lib/couchbase/circuit-breaker.ts`):

| Parameter | Value | Description |
|-----------|-------|-------------|
| Failure Threshold | 5 | Number of connection failures before opening the circuit |
| Success Threshold | 3 | Number of successes in half-open state before closing |
| Timeout | 60s | Time before transitioning from OPEN to HALF-OPEN |
| Monitoring Period | 120s | Time window for tracking error rates |

### Circuit Breaker States

| State | Behavior |
|-------|----------|
| Closed | Normal operation, Couchbase queries execute normally |
| Open | Queries rejected immediately with `CircuitBreakerOpenError`, fallback invoked if provided |
| Half-Open | Limited requests sent to test Couchbase recovery; any failure re-opens the circuit |

### Error Classification

The circuit breaker distinguishes between connection errors and application-level errors:

- **Connection errors** (trip the breaker): Timeouts, unreachable nodes, authentication failures, service-level errors
- **Application errors** (do NOT trip the breaker): `DocumentNotFoundError`, `DocumentExistsError`, `CasMismatchError`, `DocumentLockedError`, `PathNotFoundError`, `PathExistsError`, `ParsingFailureError`

This ensures that normal application behavior (such as a document not existing) does not cause the circuit to open.

### Multi-Tier Cache Fallback

When the circuit breaker is open, the multi-tier cache stack may still serve responses:

- **Tier 1 - GraphQL Yoga response cache**: Full response cache for identical queries
- **Tier 2 - SQLite cache**: Persistent cache with configurable TTL (default 100MB, 10,000 max entries)
- **Tier 3 - DataLoader**: Per-request batching and deduplication of Couchbase document lookups
- **Tier 4 - Map-based cache**: In-memory key-value cache for frequently accessed data

## Monitoring Thresholds

### Alert Definitions

| Metric | Warning Threshold | Critical Threshold | Window |
|--------|-------------------|-------------------|--------|
| Event Loop Delay | >50ms | >100ms | 1 min |
| Memory Usage | >70% | >80% | 1 min |
| HTTP Error Rate (5xx) | >2% | >5% | 5 min |
| Couchbase Query Latency (P95) | >200ms | >500ms | 5 min |
| Circuit Breaker Opens | >1/hour | >3/hour | 1 hour |
| GraphQL Error Rate | >1% | >5% | 5 min |

### Metric Collection

- Collection interval: 15 seconds (default)
- Export interval: 60 seconds (OTLP)
- OpenTelemetry instrumentation covers HTTP, GraphQL, and Couchbase operations
- Structured logging with correlation IDs for distributed tracing

## Error Budget

| SLA Target | Monthly Downtime Budget |
|------------|------------------------|
| 99.9% | 43.2 minutes |
| 99.5% | 3.6 hours |
| 99.0% | 7.2 hours |

### Error Budget Policy

1. **Green Zone (>50% remaining)**: Normal development velocity
2. **Yellow Zone (25-50% remaining)**: Increased focus on reliability
3. **Red Zone (<25% remaining)**: Feature freeze, reliability focus only

## Disaster Recovery

### Recovery Objectives

| Objective | Target | Description |
|-----------|--------|-------------|
| RTO (Recovery Time Objective) | <5 minutes | Maximum time to restore service after failure |
| RPO (Recovery Point Objective) | N/A | Stateless query service - no persistent data to lose |

**Rationale:**
- Service is a stateless GraphQL query layer (reads from Couchbase Capella)
- All persistent data resides in Couchbase Capella (managed cloud database)
- Local SQLite cache is ephemeral and rebuilt on startup
- Fast container startup (<100ms cold start) enables rapid recovery

### Recovery Procedures

| Failure Scenario | Recovery Mechanism | Expected Recovery Time |
|------------------|-------------------|----------------------|
| Pod Failure | Kubernetes auto-restart (liveness probe) | ~30 seconds |
| Node Failure | Kubernetes pod rescheduling | <2 minutes |
| Zone Failure | Pod anti-affinity ensures cross-zone distribution | <2 minutes |
| Couchbase Dependency Failure | Circuit breaker with cached response fallback | Immediate (degraded) |
| Telemetry Collector Unavailable | Buffered in-memory, no impact on queries | Immediate (full) |
| Complete Cluster Failure | Kubernetes deployment rollout | <5 minutes |

### Dependency Failure Scenarios

#### Couchbase Capella Unavailable

1. Circuit breaker opens after 5 consecutive connection failures
2. Cached responses served from SQLite cache and DataLoader (if available)
3. New queries return structured GraphQL errors indicating database unavailability
4. Health check (`/health`) reports degraded status with Couchbase connectivity details
5. Automatic recovery when Couchbase becomes available (half-open state tests connectivity)
6. After 3 successful operations in half-open state, circuit closes and full service resumes

#### Telemetry Collector Unavailable

1. Telemetry export failures are logged
2. Metrics buffered in-memory (up to max queue size)
3. No impact on service functionality or GraphQL query resolution
4. Automatic retry with exponential backoff

### Recovery Verification

After any recovery event, verify:

1. **Health Check**: `GET /health` returns 200 with `status: healthy`
2. **GraphQL Endpoint**: `POST /graphql` successfully executes a test query
3. **Readiness**: `GET /health/ready` confirms Couchbase connectivity restored
4. **System Health**: `GET /health/system` shows all subsystems operational

```bash
# Quick recovery verification
curl -s http://localhost:4000/health | jq '.status'
# Expected: "healthy"

curl -s http://localhost:4000/health/ready | jq '.status'
# Expected: "ready"

curl -s -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}' | jq '.data'
# Expected: { "__typename": "Query" }
```

## Dependency SLAs

### Couchbase Capella

| Metric | Expectation |
|--------|-------------|
| Cluster Availability | 99.99% (Capella managed SLA) |
| Query Latency (P95) | <100ms |
| Key-Value Operation Latency (P95) | <5ms |
| Connection Pool Health | >90% active connections |

### Multi-Tier Cache

| Metric | Expectation |
|--------|-------------|
| SQLite Cache Availability | 99.99% (local to pod) |
| SQLite Cache Latency (P95) | <5ms |
| DataLoader Batch Efficiency | >70% deduplication rate |
| Overall Cache Hit Rate | >60% |

## Validation

### Resilience Tests

Resilience patterns are validated via integration and unit tests:

```bash
# Run all unit tests (includes circuit breaker, error handling, cache tests)
bun test tests/bun/unit/ --timeout 60000

# Run integration tests (includes database connection, GraphQL resolver tests)
bun test tests/bun/integration/ --timeout 60000

# Run end-to-end tests (server startup, endpoint validation)
bun test tests/bun/e2e/ --timeout 60000
```

### Resilience Test Coverage

| Scenario | Location | Validates |
|----------|----------|-----------|
| Circuit Breaker States | `tests/bun/unit/lib/` | CLOSED -> OPEN -> HALF-OPEN transitions |
| Error Classification | `tests/bun/unit/lib/` | Connection vs application error handling |
| Cache Fallback | `tests/bun/unit/lib/` | SQLite cache, DataLoader, Map-based cache |
| Configuration Validation | `tests/bun/unit/config/` | Zod schema validation, env mapping |
| Error Handling (RFC 7807) | `tests/bun/unit/errors/` | Structured error responses |
| GraphQL Resolution | `tests/bun/integration/graphql/` | Query execution and error handling |
| Database Connectivity | `tests/bun/integration/database/` | Connection manager, retry logic |
| Server Lifecycle | `tests/bun/e2e/` | Startup, shutdown, endpoint routing |

### K6 Performance Tests

SLAs are validated via K6 tests in CI/CD:

```bash
# Smoke test (quick validation - 3 VUs, 3 min)
bun run test:k6:smoke:all

# Load test (sustained average load - 50-100 VUs)
bun run test:k6:load:all

# Stress test (high load - 100-200 VUs)
bun run test:k6:stress:all

# Spike test (traffic spike simulation)
bun run test:k6:spike

# Soak test (long-duration stability - 50 VUs, 3 hours)
bun run test:k6:soak
```

### K6 Test Organization

```
tests/k6/
  smoke/       - Quick validation (3 VUs, 3 min)
  load/        - Average load (50-100 VUs)
  stress/      - High load (100-200 VUs)
  spike/       - Traffic spike simulation
  soak/        - Long-duration stability
  scenarios/   - Business scenario tests (fashion buyer journey, database stress)
  data/        - Test data loaders
  utils/       - Shared K6 utilities
  legacy/      - Legacy JS tests
```

### K6 Threshold Configuration

```typescript
// Health endpoint thresholds
export const healthThresholds = {
  http_req_duration: ['p(95)<50', 'p(99)<100'],
  http_req_failed: ['rate<0.01'],
};

// GraphQL endpoint thresholds
export const graphqlThresholds = {
  http_req_duration: ['p(95)<500', 'p(99)<1000'],
  http_req_failed: ['rate<0.05'],
};
```

## Incident Response

### Severity Levels

| Level | Definition | Response Time | Resolution Time |
|-------|------------|---------------|-----------------|
| P1 - Critical | Service unavailable | 15 min | 1 hour |
| P2 - High | Degraded performance | 30 min | 4 hours |
| P3 - Medium | Non-critical issue | 2 hours | 24 hours |
| P4 - Low | Minor issue | 24 hours | 1 week |

### Escalation Path

1. On-call engineer investigates
2. Team lead notified if P1/P2
3. Engineering manager if >1 hour P1
4. VP Engineering if >2 hours P1

## Related Documentation

- [Monitoring Guide](monitoring.md) - Detailed observability setup
- [OpenTelemetry Guide](opentelemetry.md) - Telemetry configuration and instrumentation
- [Troubleshooting Guide](troubleshooting.md) - Common issues and resolutions
- [API Endpoints](../api/endpoints.md) - Complete API reference
