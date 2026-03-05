# Architecture Overview

## System Architecture

```
                         Client Application
                                |
                         [API Key Header]
                                |
                                v
                      +-------------------+
                      |   Kong Gateway    |
                      | (Key-Auth Plugin) |
                      +--------+----------+
                               |
                  [X-Consumer-ID, X-Consumer-Username]
                               |
                               v
+---------------------------------------------------------------+
|                     Authentication Service                     |
|                                                               |
|  +------------------+    +------------------+                 |
|  | Router Layer     |--->| Handler Layer    |                 |
|  | (Bun Routes API) |    | (tokens, health) |                 |
|  +------------------+    +--------+---------+                 |
|                                   |                           |
|  +------------------+    +--------v---------+                 |
|  | Middleware       |    | Service Layer    |                 |
|  | (error, CORS)    |    | (JWT, cache)     |                 |
|  +------------------+    +--------+---------+                 |
|                                   |                           |
|  +------------------+    +--------v---------+                 |
|  | Circuit Breaker  |<-->| Adapter Layer    |                 |
|  | (Opossum)        |    | (Kong Admin API) |                 |
|  +------------------+    +------------------+                 |
+---------------------------------------------------------------+
         |                          |                    |
         v                          v                    v
+----------------+    +------------------+    +------------------+
| Kong Admin API |    |  Unified Cache   |    |  OpenTelemetry   |
| (Consumers)    |    | (Redis/Memory)   |    |   Collector      |
+----------------+    +------------------+    +------------------+
```

## Layered Architecture

The service implements a clean layered architecture for maintainability and testability:

| Layer | Responsibility | Key Components |
|-------|----------------|----------------|
| **Router** | Route matching, handler dispatch | `src/routes/router.ts` |
| **Middleware** | Cross-cutting concerns, error handling | `error-handler.ts`, `cors.ts` |
| **Handler** | HTTP request/response, business orchestration | `tokens.ts`, `health.ts`, `metrics.ts` |
| **Service** | Core business logic, domain operations | `jwt.service.ts`, `cache-manager.ts` |
| **Adapter** | External system integration | `kong.adapter.ts`, Redis client |

## Technology Stack

| Category | Technology | Purpose |
|----------|------------|---------|
| Runtime | Bun v1.3.9+ | Native JavaScript runtime with parallel execution |
| Language | TypeScript | Type safety and developer experience |
| HTTP Server | Bun.serve() Routes API | Maximum performance (100k+ req/sec) |
| JWT | crypto.subtle Web API | HMAC-SHA256 signing (RFC 7519) |
| Caching | Redis + in-memory | Unified cache architecture with failover |
| Circuit Breaker | Opossum | Kong Admin API resilience |
| Container | DHI distroless base | 0 CVEs, 12/12 security score |
| Monitoring | OpenTelemetry + OTLP | Distributed tracing, metrics, logs |
| Testing | Bun Test + Playwright + K6 | Unit, E2E, performance testing |
| CI/CD | GitHub Actions | Parallel job execution |

## Performance Characteristics

| Metric | Target | Description |
|--------|--------|-------------|
| Throughput | 100,000+ req/sec | Native Bun Routes API |
| Memory | 50-80MB baseline | Optimized telemetry |
| Cold Start | <100ms | Hybrid caching strategy |
| Response Time | <10ms p99 | Token generation latency |
| Container Size | 58MB | Distroless multi-stage build |
| Cache Hit Rate | 90%+ | Memory-first hybrid strategy |

---

## Authentication Flow

### Why Use This Service?

**Without Authentication Service** (Direct Kong JWT):
- Clients must store and manage JWT signing secrets
- Every client needs JWT generation logic
- Secret rotation requires updating all clients
- Security risk: secrets in client applications

**With Authentication Service**:
- Clients only need an API key (no secrets)
- Simple HTTP call to get tokens
- Centralized secret management in Kong
- Instant revocation via Kong

### Architectural Comparison

| Aspect | Without Auth Service | With Auth Service |
|--------|---------------------|-------------------|
| Secret Management | Distributed to all clients | Centralized in Kong |
| Client Security | Secrets in client code | Only API key needed |
| Implementation | Complex JWT logic required | Simple HTTP call |
| Secret Rotation | Update all clients | Single Kong update |
| Audit Trail | Distributed across clients | Centralized logging |

### Token Generation Flow

```
1. Client sends API key to Kong Gateway
   GET /tokens
   Header: apikey: consumer-api-key-12345

2. Kong validates API key, adds consumer headers
   X-Consumer-ID: 98765432-...
   X-Consumer-Username: example-consumer
   X-Anonymous-Consumer: false

3. Auth Service validates headers, fetches consumer secret from Kong Admin API

4. Auth Service generates JWT token
   {
     "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     "expires_in": 900
   }

5. Client uses JWT for subsequent API calls
   Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Kong Mode Support

| Mode | Description | URL Format |
|------|-------------|------------|
| API_GATEWAY | Traditional self-hosted Kong | `http://kong-admin:8001` |
| KONNECT | Kong's cloud-native platform | `https://region.api.konghq.com/v2/control-planes/{id}` |

---

## Resilience: Circuit Breaker

The service implements circuit breaker protection with stale cache fallback for Kong Admin API outages.

### Circuit Breaker Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| Timeout | 5 seconds | Per Kong API call |
| Error Threshold | 50% | Failure rate to open circuit |
| Reset Timeout | 60 seconds | Before testing recovery |
| Stale Tolerance | 30 minutes | Default stale data window |

### Failure Scenarios

| Kong Status | Cache Status | Circuit State | Behavior |
|-------------|--------------|---------------|----------|
| Available | Fresh | Closed | Normal operation |
| Available | Stale | Closed | Refresh cache from Kong |
| Unavailable | Fresh | Open | Use cache |
| Unavailable | Stale (<tolerance) | Open | Use stale cache (degraded) |
| Unavailable | Stale (>tolerance) | Open | Return AUTH_005 error |
| Unavailable | No cache | Open | Return AUTH_005 error |

### High Availability Mode

```bash
HIGH_AVAILABILITY=true
REDIS_URL=redis://localhost:6379
STALE_DATA_TOLERANCE_MINUTES=120  # 2-hour fallback window
```

### 3-Layer Cache Resilience (HA Mode)

The service implements a 3-layer fallback chain to maximize availability during Redis failures:

```
Request arrives for consumer secret
          |
          v
    +-------------------+
    |  Redis Primary    |  <-- Layer 1: Active cache with TTL
    |  (TTL: 300s)      |
    +-------------------+
          |
          | (miss or error)
          v
    +-------------------+
    |  Redis Stale      |  <-- Layer 2: Expired entries, kept for tolerance window
    |  (tolerance: 30m) |
    +-------------------+
          |
          | (miss or Redis unavailable)
          v
    +-------------------+
    |  In-Memory Stale  |  <-- Layer 3: Last-resort LRU cache per instance
    |  (max: 1000)      |
    +-------------------+
          |
          | (miss)
          v
    Return null (AUTH_005)
```

### Fallback Chain by Mode

| Mode | Fallback Chain |
|------|----------------|
| **Non-HA** | Local Memory Cache -> In-Memory Stale -> Return null |
| **HA** | Redis Primary -> Redis Stale -> In-Memory Stale (last resort) -> Return null |

### Cache Tier Behaviors

| Tier | Source | TTL/Retention | Eviction | Use Case |
|------|--------|---------------|----------|----------|
| Redis Primary | Kong API lookups | `CACHING_TTL_SECONDS` (300s default) | TTL expiration | Normal operation |
| Redis Stale | Expired primary entries | `STALE_DATA_TOLERANCE_MINUTES` (30m default) | Tolerance window | Redis healthy, primary miss |
| In-Memory Stale | Successful Redis reads | Lazy populated | LRU (`CACHE_MAX_MEMORY_ENTRIES`, 1000 default) | Redis unavailable |

### Lazy Population of In-Memory Cache

In HA mode, each instance lazily populates an in-memory cache on successful Redis reads:

1. **On successful Redis read**: Entry is copied to in-memory cache
2. **When Redis becomes unavailable**: In-memory cache serves as last resort
3. **LRU eviction**: When max entries exceeded, oldest entries are evicted
4. **Instance-specific**: Each service instance has its own in-memory cache

```bash
# Configuration
CACHE_MAX_MEMORY_ENTRIES=1000  # Max entries before LRU eviction
```

### Circuit Breaker States

| State | Behavior | Cache Access |
|-------|----------|--------------|
| **Closed** | Normal operation | Redis Primary |
| **Half-Open** | Testing recovery | Attempt Redis, fall back to stale |
| **Open** | Redis unavailable | Stale tiers only (Redis Stale -> In-Memory Stale) |

When circuit is open, the service walks the stale chain:
1. Check Redis stale cache (if Redis connection available but primary miss)
2. Check in-memory stale cache (if Redis completely unavailable)
3. Return null and AUTH_005 error if no cached data found

---

## Observability

### Distributed Tracing

W3C Trace Context propagation through the entire flow:

```
Client Request (traceparent header)
    |
    v
Kong Gateway (trace context preserved)
    |
    v
Auth Service
    |-- Parent Span: http.server.request
    |       |-- http.method = GET
    |       |-- http.route = /tokens
    |       |-- http.status_code = 200
    |
    |-- Child Span: kong.getConsumerSecret
    |       |-- kong.consumer_id = uuid
    |       |-- duration_ms = 12.4
    |
    |-- Child Span: jwt_create
    |       |-- jwt.username = consumer
    |       |-- duration_ms = 0.342
    |
    |-- Child Span: redis.get (if HA mode)
            |-- trace_id correlated
```

### Key Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `http_request_duration_ms` | Histogram | Total request duration |
| `jwt_creation_duration_ms` | Histogram | JWT generation time |
| `kong_api_call_duration_ms` | Histogram | Kong Admin API latency |
| `cache_hit_rate` | Counter | Cache effectiveness |
| `circuit_breaker_state` | Gauge | Current circuit state |

---

## Internal Components

### Handler Layer (`src/handlers/`)
- `tokens.ts` - JWT token generation with Kong integration
- `health.ts` - Health checks with dependency monitoring
- `metrics.ts` - Performance metrics and debugging
- `openapi.ts` - Dynamic OpenAPI specification
- `profiling.ts` - Chrome DevTools integration

### Service Layer (`src/services/`)
- `jwt.service.ts` - Token generation using crypto.subtle
- `cache-manager.ts` - Unified cache with Redis/memory backends
- `circuit-breaker.service.ts` - Centralized circuit breaker management

### Adapter Layer
- `kong.adapter.ts` - Unified Kong adapter (API Gateway + Konnect)
- Redis client with automatic failover

### Key Features
- **Response Builders**: Standardized response patterns
- **Stale Cache Resilience**: Up to 2 hours during Kong outages
- **4-Pillar Configuration**: Enterprise-grade configuration management
- **Profiling Service**: Chrome DevTools integration for performance analysis

---

## API Standards Compliance

The service implements comprehensive RFC compliance for interoperability and industry best practices.

### RFC Standards Implemented

| RFC | Standard | Implementation |
|-----|----------|----------------|
| **RFC 7519** | JSON Web Token | JWT claims (iss, aud, exp, nbf, iat, jti, sub) |
| **RFC 7518** | JSON Web Algorithms | HS256 (HMAC-SHA256) signing via crypto.subtle |
| **RFC 7807** | Problem Details | Structured error responses with `application/problem+json` |
| **RFC 8594** | Sunset Header | API deprecation signaling with migration URLs |
| **RFC 9110** | HTTP Semantics | Method validation, 405 responses with Allow header |
| **RFC 7232** | Conditional Requests | ETag generation, If-None-Match, 304 responses |
| **RFC 6585** | Additional HTTP Status Codes | Rate limiting headers (429 infrastructure) |
| **RFC 7231** | HTTP/1.1 Semantics | HTTP-date format in Sunset header |

### Error Response Standards (RFC 7807)

All error responses use the Problem Details format:

```json
{
  "type": "urn:problem-type:auth-service:auth-001",
  "title": "Missing Consumer Headers",
  "status": 401,
  "detail": "Required Kong consumer headers are missing from the request",
  "instance": "/tokens",
  "code": "AUTH_001",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-02-14T12:00:00.000Z"
}
```

**Key Fields**:
- `type`: URN identifying the problem type
- `title`: Short, human-readable summary
- `status`: HTTP status code
- `detail`: Specific explanation for this occurrence
- `instance`: URI reference identifying the request
- `code`: Application-specific error code (AUTH_001-012)
- `requestId`: UUID for distributed tracing
- `timestamp`: ISO-8601 timestamp

### API Deprecation (RFC 8594)

Deprecated API versions include sunset headers:

```http
Sunset: Sat, 01 Jan 2028 00:00:00 GMT
Deprecation: true
Link: <https://api.example.com/docs/migration>; rel="sunset"
```

### HTTP Method Validation (RFC 9110)

Invalid HTTP methods return 405 with allowed methods:

```http
HTTP/1.1 405 Method Not Allowed
Allow: GET, OPTIONS
Content-Type: application/problem+json
```

### Conditional Requests (RFC 7232)

The OpenAPI endpoint supports ETag-based caching:

```http
GET / HTTP/1.1
If-None-Match: "a1b2c3d4e5f6..."

HTTP/1.1 304 Not Modified
ETag: "a1b2c3d4e5f6..."
Cache-Control: public, max-age=300
```

### Request Validation

| Validation | Default | Purpose |
|------------|---------|---------|
| Max Request Body Size | 10MB | Prevent memory exhaustion |
| Request Timeout | 30 seconds | Prevent hanging requests |
| Content-Type | application/json | Enforce expected formats |

See [api-best-practices.md](../development/api-best-practices.md) for detailed implementation guidance.
