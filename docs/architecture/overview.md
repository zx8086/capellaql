# Architecture Overview

## System Architecture

```
                              Client Application
                                     |
                              [HTTP / WebSocket]
                                     |
                                     v
                      +-----------------------------+
                      |  Bun.serve()  (port 4000)   |
                      |  SIMD-accelerated routing   |
                      +-----------------------------+
                                     |
                      +--------------+--------------+
                      |    Middleware Pipeline       |
                      |  (7-stage compose() chain)  |
                      +--------------+--------------+
                                     |
               +---------------------+---------------------+
               |                     |                     |
               v                     v                     v
     +-----------------+   +------------------+   +----------------+
     |    /graphql     |   |   /health/*      |   |  WS Upgrade    |
     |  GraphQL Yoga   |   |  Health Handlers |   |  Subscriptions |
     |    5.18.1       |   |  (13 endpoints)  |   |  (Bun native)  |
     +---------+-------+   +------------------+   +----------------+
               |
               v
     +-----------------+
     |   Resolvers     |
     |   (12+ domain)  |
     +---------+-------+
               |
               v
     +-----------------+         +--------------------------+
     | Couchbase       |         | OpenTelemetry Collector  |
     | Capella         |<------->| (traces, metrics, logs)  |
     | SDK 4.6.1       |         | via OTLP HTTP            |
     +-----------------+         +--------------------------+
```

## Layered Architecture

| Layer | Responsibility | Key Components |
|-------|----------------|----------------|
| **Entry Point** | Server lifecycle, middleware wiring, graceful shutdown | `src/index.ts` |
| **Server** | HTTP handling, middleware, WebSocket | `src/server/handlers/` (graphql.ts, health.ts), `src/server/middleware/` (compose.ts, logging.ts, rateLimit.ts, tracing.ts, security.ts, cors.ts, backpressure.ts, methodValidation.ts, deprecation.ts), `src/server/websocket/subscriptions.ts` |
| **GraphQL** | Schema, resolvers, context, validation | `src/graphql/schema.ts`, `typeDefs.ts`, `context.ts`, `types.ts`, `validation/`, `resolvers/` (looks, lookDetails, looksSummary, optionsSummary, optionsProductView, getAllSeasonalAssignments, getDivisionalAssignment, imageDetails, imageUrlCheck, documentSearch) |
| **Data** | Couchbase operations, resilience, batching | `src/lib/couchbase/` (connection-manager.ts, circuit-breaker.ts, data-loader.ts, kv-operations.ts, query-executor.ts, repository.ts, transaction-handler.ts, errors.ts, metrics.ts) |
| **Configuration** | 4-pillar config with Zod validation | `src/config/` (defaults.ts, envMapping.ts, loader.ts, schemas.ts) |
| **Telemetry** | OpenTelemetry SDK, metrics, tracing, logging | `src/telemetry/` (instrumentation.ts, metrics/, tracing/, health/, coordinator/) |
| **Logging** | 3-layer DI architecture | `src/logging/` (ports/, adapters/pino, container.ts) |
| **Errors** | RFC 7807 Problem Details | `src/errors/` (problem-details.ts, error-codes.ts, result.ts) |

## Technology Stack

| Category | Technology | Purpose |
|----------|------------|---------|
| Runtime | Bun v1.0+ | Native JS runtime with Bun.serve() routes (SIMD-accelerated) |
| GraphQL | GraphQL Yoga 5.18.1 | GraphQL server with response caching, depth limiting |
| Database | Couchbase Capella (SDK 4.6.1) | Document database with KV, N1QL, FTS, analytics |
| Validation | Zod 4.3.6 | Runtime schema validation for config and inputs |
| Observability | OpenTelemetry SDK 2.6.1 | Distributed traces, metrics, logs via OTLP HTTP |
| Logging | Pino 10.3.1 | ECS-compliant structured logging via DI container |
| Testing | Bun test + Playwright 1.58.2 + K6 | Unit, E2E, performance testing |
| Container | Docker multi-arch (amd64/arm64) | Distroless production images |
| CI/CD | GitHub Actions | Build, test, security scanning |

## Middleware Pipeline

The server uses a `compose()` function to build a 7-stage middleware pipeline. Every request to `/graphql` and `/health/*` passes through this pipeline in order:

```
Request -> methodValidation -> backpressure -> rateLimit -> cors -> security -> tracing -> logging -> Handler -> Response
```

| Stage | Middleware | Purpose |
|-------|-----------|---------|
| 1 | methodValidation | Rejects unsupported HTTP methods |
| 2 | backpressure | Request queuing under load |
| 3 | rateLimit | Memory-based rate limiting (per client+path) |
| 4 | cors | Cross-origin request handling |
| 5 | security | Security headers (HSTS, CSP, etc.) |
| 6 | tracing | OpenTelemetry span creation with request context |
| 7 | logging | Request/response structured logging |

Handlers are pre-wrapped with middleware at startup (not per-request).

## Resilience Patterns

### Couchbase Circuit Breaker

Custom implementation in `src/lib/couchbase/circuit-breaker.ts` (NOT Opossum):

| Parameter | Default | Description |
|-----------|---------|-------------|
| failureThreshold | 5 | Failures before opening circuit |
| successThreshold | 3 | Successes in half-open before closing |
| timeout | 60000ms | Time before open -> half-open transition |
| monitoringPeriod | 120000ms | Error rate calculation window |

```
States:  closed (normal) ---[failures >= threshold]---> open (reject fast)
                ^                                            |
                |                                     [timeout expires]
                |                                            |
                +---[successes >= threshold]--- half-open (test recovery)
```

Non-retryable errors (DocumentNotFound, CasMismatch, etc.) do not count toward failure threshold.

### Telemetry Circuit Breaker

Per-signal circuit breakers in `src/telemetry/telemetry-circuit-breaker.ts` prevent cascading failures in telemetry export.

## Graceful Shutdown

Multi-phase shutdown sequence from `src/index.ts` prevents race conditions:

1. Stop accepting new requests (server.stop())
2. Cleanup rate limit store
3. Flush telemetry batch coordinator (5s timeout)
4. Close database connections (10s timeout)
5. Shutdown telemetry providers (5s timeout)
6. Cleanup remaining resources (memory guardian, performance monitor)
7. Exit process

Early signal handlers allow Ctrl+C during startup (before Couchbase connection completes).

## GraphQL Features

- Response caching with ETags and conditional requests (If-None-Match)
- Query depth limiting via graphql-depth-limit
- Batch query support (max 10 per request)
- Error masking: BAD_USER_INPUT unmasked; others masked in production
- Custom TTLs per resolver (2-15 minutes)
- WebSocket subscriptions via Bun native WebSocket

## Performance Characteristics

| Metric | Value | Description |
|--------|-------|-------------|
| Max request body | 512KB | Prevents memory exhaustion |
| Idle timeout | 30s | Connection idle timeout |
| Route matching | SIMD-accelerated | Bun.serve() native routes |
| DataLoader batching | Enabled | N+1 prevention for Couchbase lookups |
| Query deduplication | Enabled | Via request fingerprinting |

## Related Documentation

- [Couchbase Architecture](couchbase.md) - Database layer details
- [Caching Architecture](caching.md) - Multi-tier caching strategy
- [4-Pillar Configuration](../configuration/4-pillar-pattern.md) - Configuration system
- [OpenTelemetry Guide](../operations/opentelemetry.md) - Observability implementation
