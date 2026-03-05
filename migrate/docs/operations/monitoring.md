# Observability & Monitoring

## OpenTelemetry Integration

The service implements cost-optimized observability using vendor-neutral OpenTelemetry standards, compatible with Elastic APM, Datadog, New Relic, and other OTLP-compliant platforms. Recent improvements include consolidated metrics endpoints and reduced telemetry overhead.

### Telemetry Architecture

The telemetry system consists of three pillars (traces, metrics, logs) with supporting infrastructure for resilience and cardinality management.

```
src/telemetry/
├── instrumentation.ts      # NodeSDK initialization, exporters, processors
├── tracer.ts               # Custom span creation API
├── winston-logger.ts       # Structured logging with OTLP transport
├── metrics.ts              # Legacy metrics entry point
├── metrics/                # Modular metrics system
│   ├── index.ts            # Public API exports
│   ├── initialization.ts   # Meter and instrument creation
│   ├── instruments.ts      # 77 metric instrument definitions
│   ├── types.ts            # TypeScript attribute types
│   ├── http-metrics.ts     # HTTP request/response metrics
│   ├── auth-metrics.ts     # JWT and authentication metrics
│   ├── kong-metrics.ts     # Kong Admin API metrics
│   ├── redis-metrics.ts    # Redis/Valkey cache metrics
│   ├── cache-metrics.ts    # Cache tier metrics
│   ├── process-metrics.ts  # Memory, CPU, GC metrics
│   ├── circuit-breaker-metrics.ts
│   ├── api-version-metrics.ts
│   ├── consumer-metrics.ts
│   ├── security-metrics.ts
│   ├── error-metrics.ts
│   └── telemetry-metrics.ts
├── redis-instrumentation.ts    # Redis span creation
├── cardinality-guard.ts        # Metric cardinality protection
├── consumer-volume.ts          # Consumer traffic classification
├── telemetry-circuit-breaker.ts # Per-signal circuit breakers
├── telemetry-health-monitor.ts  # Export health tracking
├── export-stats-tracker.ts      # Export success/failure stats
├── memory-guardian.ts          # Telemetry backpressure monitoring
├── gc-metrics.ts               # Garbage collection monitoring
├── sla-monitor.ts              # SLA violation detection
├── profiling-metrics.ts        # Profiling integration
└── lifecycle-logger.ts         # Startup/shutdown logging
```

### Memory Optimization: OTLP Transformer Lazy-Loading Patch

The service applies a postinstall patch to `@opentelemetry/otlp-transformer` to prevent excessive memory allocation from protobufjs buffer pools.

#### Problem

When Bun imports `@opentelemetry/otlp-transformer`, it may load one of THREE module formats:
- ESM version: `build/esm/index.js`
- CJS version: `build/src/index.js`
- ESNext version: `build/esnext/index.js`

All three versions eagerly import all protobuf serializers, causing protobufjs to allocate ~50-70MB of Uint8Array buffer pools - even when using http/json protocol (the default).

Additionally, without explicit configuration, NodeSDK's `configureLoggerProviderFromEnv()` defaults to http/protobuf protocol, loading additional protobuf dependencies.

#### Solution

**Layer 1: OTLP Transformer Patch** (`scripts/patch-otel-esm.ts`)

Patches ALL THREE module formats (ESM, CJS, ESNext) with lazy loading:
- **ESM/ESNext**: Uses Proxy objects for deferred module loading
- **CJS**: Uses lazy getter functions via `Object.defineProperty`
- Protobuf serializers only load when actually accessed
- JSON serializers remain eagerly loaded (these are used)
- Applied automatically via `postinstall` hook

**Layer 2: NodeSDK Configuration** (`src/telemetry/instrumentation.ts:252-257`)

Disables automatic LoggerProvider creation:
```typescript
sdk = new NodeSDK({
  // ...
  logRecordProcessors: [],  // Prevents http/protobuf default
});
```

#### Memory Impact

The patches have different effectiveness at startup vs under sustained load:

| Scenario | Metric | Before Patches | After Patches | Change |
|----------|--------|----------------|---------------|--------|
| **Startup** | Total Heap | 57+ MB | 20.3 MB | -64% |
| **Startup** | Uint8Array | 36+ MB (600+ instances) | 641 KB (23 instances) | -98% |
| **Under Load** | Total Heap | 57+ MB | 56.7 MB | ~0% |
| **Under Load** | Uint8Array | 36+ MB | 35.7 MB (589 instances) | ~0% |

**Primary benefit**: 64% memory reduction at startup, improving container cold start times and scaling efficiency.

#### Known Limitation: Bun Runtime Behavior

Under sustained load, protobuf serializers load despite lazy-loading patches:

- **Root cause**: Bun's JIT optimizer performs speculative module resolution on hot paths
- **Behavior**: Lazy getters are triggered by Bun's internal property enumeration during optimization
- **Impact**: Memory returns to ~57MB baseline under load (matching unpatched behavior)
- **Not a bug**: This is Bun runtime behavior, not a patch defect

This cannot be fixed at application level - it would require changes to Bun's module resolution or upstream OpenTelemetry lazy-loading support.

#### Production Recommendation

**Accept current setup**:
- Patches provide significant value for container cold starts (64% reduction)
- Under-load memory footprint (~57MB) is stable and predictable
- Container memory limits should accommodate 128MB minimum (2x baseline)
- Memory is not growing unbounded - this is a fixed allocation

#### Maintenance

The patch targets `@opentelemetry/sdk-node@0.212.0`. When upgrading:
1. The patch script warns if version differs from expected
2. Verify the package still exports the same exporter patterns
3. Test memory usage with heap profiling after upgrade (`bun run profile:scenario:tokens`)

#### When This Can Be Removed

This workaround can be removed if:
- OpenTelemetry adds native lazy loading to all module format exports (ESM, CJS, ESNext)
- Bun adds tree-shaking support for ESM/CJS/ESNext
- Bun changes speculative module resolution behavior
- The service switches to http/protobuf protocol (accepting the memory cost)

References:
- Commit 5a42d2f (SIO-446) - Complete span events migration for tokens handler
- Heap profiles `Heap.393129709695.69364.md` (startup) and `Heap.397287268637.70440.md` (under load)

### Memory Guardian: Telemetry Backpressure Monitoring

The `TelemetryMemoryGuardian` (`src/telemetry/memory-guardian.ts`) monitors heap memory usage and telemetry export health to detect backpressure issues that could lead to Uint8Array buffer accumulation.

#### How It Works

Memory Guardian periodically checks:
1. **Heap Usage**: Compared against configured heap limit (default: 512MB)
2. **Export Failure Rates**: Per-signal (traces, metrics, logs) failure percentages
3. **Export Backlog**: Failed exports that may be accumulating buffers

Based on these metrics, it calculates a **pressure level**:

| Level | Heap Usage | Condition |
|-------|-----------|-----------|
| `normal` | < 60% | No action needed |
| `elevated` | >= 60% | Monitor closely |
| `high` | >= 75% | Consider reducing batch sizes |
| `critical` | >= 85% | Immediate attention required |

#### Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `MEMORY_GUARDIAN_HEAP_LIMIT_MB` | `512` | Heap limit for percentage calculations |

The heap limit setting is important because Bun doesn't expose `v8.getHeapStatistics().heap_size_limit`. Set this to match your container's memory limit for accurate pressure detection.

#### Monitoring Interval

The guardian runs health checks every **30 seconds** (reduced from 5s to minimize CPU overhead). Profile analysis showed the previous 5s interval consumed 4.2% CPU.

#### Log Output

When pressure is detected, warnings are logged with context:

```json
{
  "message": "Memory pressure detected",
  "component": "memory-guardian",
  "pressure_level": "high",
  "heap_usage_percent": 78,
  "heap_used_mb": 400,
  "heap_limit_mb": 512,
  "export_failure_rate_traces": 15,
  "export_failure_rate_metrics": 0,
  "export_failure_rate_logs": 5
}
```

#### Recommendations

At elevated or higher pressure, the guardian provides actionable recommendations:
- Reduce `OTEL_BSP_MAX_QUEUE_SIZE` to limit buffer accumulation
- Check OTLP endpoint connectivity if failure rates are high
- Reduce batch sizes via `OTEL_BSP_MAX_EXPORT_BATCH_SIZE`

### Runtime Metrics Optimization

Runtime metrics collection (event loop delay, detailed memory stats) is **disabled by default** to reduce CPU overhead.

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `OTEL_RUNTIME_METRICS_ENABLED` | `false` | Enable detailed runtime metrics |

**When to Enable:**
- Debugging event loop blocking issues
- Investigating memory growth patterns
- Performance profiling sessions

**CPU Impact:** Enabling runtime metrics adds approximately 10% CPU overhead due to frequent sampling of event loop and memory statistics.

**Initialization Flow:**

```typescript
// src/telemetry/instrumentation.ts:61-221
async function initializeTelemetry(): Promise<void> {
  // 1. Initialize metrics system
  initializeMetrics();

  // 2. Create resource attributes (service.name, version, environment)
  const resource = resourceFromAttributes({ ... });

  // 3. Create OTLP exporters with stats tracking
  const traceExporter = wrapSpanExporter(new OTLPTraceExporter(...), traceExportStats);
  const metricExporter = wrapMetricExporter(new OTLPMetricExporter(...), metricExportStats);
  const logExporter = wrapLogRecordExporter(new OTLPLogExporter(...), logExportStats);

  // 4. Create processors (batching for efficiency)
  const traceProcessor = new BatchSpanProcessor(traceExporter, { maxExportBatchSize: 10 });
  const logProcessor = new BatchLogRecordProcessor(logExporter);
  const metricReader = new PeriodicExportingMetricReader({ exportIntervalMillis: 10000 });

  // 5. Register LoggerProvider globally (SDK 0.212.0+ requirement)
  loggerProvider = new LoggerProvider({ resource, processors: [logProcessor] });
  logs.setGlobalLoggerProvider(loggerProvider);

  // 6. Start NodeSDK with auto-instrumentations
  sdk = new NodeSDK({
    resource,
    spanProcessors: [traceProcessor],
    metricReaders: [metricReader],
    instrumentations: [getNodeAutoInstrumentations(), new RedisInstrumentation()],
  });
  sdk.start();

  // 7. Start host metrics collection
  hostMetrics = new HostMetrics({});
  hostMetrics.start();

  // 8. Reinitialize Winston logger to pick up global LoggerProvider
  winstonTelemetryLogger.reinitialize();
}
```

### Telemetry Features

#### Distributed Tracing
- HTTP request tracing with automatic span correlation
- Request ID generation for end-to-end tracing
- Kong API call instrumentation with W3C Trace Context propagation
- JWT generation timing
- Circuit breaker state transitions
- Cache tier usage tracking

#### W3C Trace Context Propagation
All outbound HTTP requests (particularly to Kong Admin API) include W3C Trace Context headers for distributed tracing:
- `traceparent`: Trace ID, parent span ID, and trace flags
- `tracestate`: Vendor-specific trace information

This is implemented via `createStandardHeaders()` in `src/adapters/kong-utils.ts`, which automatically injects trace context from the active OpenTelemetry context.

#### Redis Trace Hierarchy

Redis cache operations are instrumented to appear as nested spans under HTTP request spans, providing full trace continuity across the entire request lifecycle:

**Trace Hierarchy:**
```
HTTP Request (root span)
├── Kong Consumer Lookup (child span)
├── JWT Generation (child span)
└── Redis Cache Operations (child spans)
    ├── redis.get (check for cached consumer)
    ├── redis.set (cache consumer data)
    └── redis.delete (invalidate cache entry)
```

**Implementation**: `src/telemetry/redis-instrumentation.ts:65-164`

The Redis instrumentation creates spans with the active OpenTelemetry context as parent, ensuring proper trace hierarchy. Each Redis operation is wrapped with `context.with()` to maintain trace continuity.

**Span Naming Conventions:**
- `redis.get` - Read operations (GET, HGET, etc.)
- `redis.set` - Write operations (SET, HSET, etc.)
- `redis.delete` - Delete operations (DEL, HDEL, etc.)
- `redis.list` - List operations (LPUSH, RPUSH, etc.)

**Span Attributes:**
Each Redis span includes:
- `redis.operation` - Operation type (get, set, delete, list)
- `redis.key` - Cache key being accessed
- `redis.result.type` - Result type (string, object, array, null)
- `redis.result.length` - Result size (for performance analysis)
- `redis.error` - Error message (if operation failed)

**Log Correlation:**
Redis operations automatically include trace context in logs, enabling span-to-log navigation in observability tools:

```json
{
  "@timestamp": "2026-01-27T20:58:32.000Z",
  "message": "Redis GET completed",
  "trace.id": "550e8400-e29b-41d4-a716-446655440000",
  "span.id": "redis-span-123",
  "redis.operation": "get",
  "redis.key": "consumer:98765432-9876-5432-1098-765432109876",
  "redis.result.type": "object",
  "redis.result.length": 245
}
```

**Observability Tool Navigation:**
In observability backends (Elastic APM, Datadog, Jaeger):
1. View HTTP request trace
2. Expand nested spans to see Kong and JWT operations
3. Click Redis spans to see cache access patterns
4. Navigate from spans to related logs using trace.id
5. Analyze Redis operation latencies in trace waterfall

**Testing:**
16 Redis instrumentation tests validate trace context propagation:
- `test/bun/telemetry/redis-instrumentation-utils.test.ts`
- Tests verify span creation, attributes, and parent-child relationships
- Cache integration tests validate end-to-end trace hierarchy

**Reference:** Commit f4bc0d5 (2026-01-27) - Fixed Redis instrumentation trace context propagation

#### Consolidated Metrics Collection
- **Runtime Metrics**: Event loop delay, memory usage, CPU utilization
- **System Metrics**: Host-level CPU, memory, disk, network via HostMetrics
- **Business Metrics**: JWT generation, Kong operations, cache performance
- **Circuit Breaker Metrics**: Failure rates, state transitions, stale cache usage
- **Cache Metrics**: Hit rates, tier usage, operations by backend
- **Unified Metrics Endpoint**: Single endpoint with multiple views for different operational needs

#### Structured Logging
- ECS (Elastic Common Schema) format
- Winston transport with OpenTelemetry correlation
- Request context propagation
- Error tracking with stack traces

### ECS Field Mapping

The service automatically maps custom application fields to ECS (Elastic Common Schema) compliant field names, ensuring optimal Elasticsearch indexing and query performance.

**Implementation**: `src/telemetry/winston-logger.ts:108-135`

#### Field Mapping Table

| Custom Field | ECS Field | Type | Description |
|--------------|-----------|------|-------------|
| `consumerId` | `consumer.id` | string | Consumer identifier from Kong |
| `username` | `consumer.name` | string | Consumer username |
| `requestId` | `event.id` | string | Unique request identifier |
| `totalDuration` | `event.duration` | number | Duration in nanoseconds |

#### Benefits of ECS Mapping

1. **Top-Level Fields**: ECS fields appear at root level in Elasticsearch, not nested under `labels.*`
2. **Kibana Auto-Complete**: Standard ECS fields are recognized by Kibana for auto-completion
3. **Simpler Queries**: Direct field access (`consumer.id` instead of `labels.consumerId`)
4. **Standard Compliance**: Follows Elastic Common Schema conventions
5. **No Duplication**: Fields mapped once, not duplicated between top-level and labels

#### Example Log Output

**Before ECS Mapping (nested under labels):**
```json
{
  "@timestamp": "2026-01-20T12:00:00.000Z",
  "message": "Token generated successfully",
  "log.level": "info",
  "labels": {
    "consumerId": "consumer-123",
    "username": "user@example.com",
    "requestId": "req-456",
    "totalDuration": 1500000
  }
}
```

**After ECS Mapping (top-level fields):**
```json
{
  "@timestamp": "2026-01-20T12:00:00.000Z",
  "message": "Token generated successfully",
  "log.level": "info",
  "consumer.id": "consumer-123",
  "consumer.name": "user@example.com",
  "event.id": "req-456",
  "event.duration": 1500000,
  "trace.id": "trace-789",
  "span.id": "span-012"
}
```

#### Non-ECS Fields

Fields not mapped to ECS standards automatically appear under `labels.*`:
- Custom business metrics
- Service-specific identifiers
- Non-standard operational data

**Example:**
```json
{
  "consumer.id": "consumer-123",        // Mapped field
  "consumer.name": "user@example.com",  // Mapped field
  "labels.operationType": "create",     // Non-mapped field
  "labels.cacheHit": true               // Non-mapped field
}
```

#### Elasticsearch Query Examples

**Consumer Fields (Direct Access):**
```json
GET /logs-*/_search
{
  "query": {
    "term": { "consumer.id": "consumer-123" }
  }
}
```

**Non-ECS Fields (Nested Access):**
```json
GET /logs-*/_search
{
  "query": {
    "term": { "labels.operationType": "create" }
  }
}
```

### Tracer API

The tracer provides a clean API for creating custom spans. Use this when adding instrumentation to new code paths.

**Implementation:** `src/telemetry/tracer.ts`

#### Creating Custom Spans

```typescript
import { telemetryTracer, createSpan } from '../telemetry/tracer';
import { SpanKind } from '@opentelemetry/api';

// Method 1: Using telemetryTracer instance
const result = await telemetryTracer.createSpan(
  {
    operationName: 'my.custom.operation',
    kind: SpanKind.INTERNAL,
    attributes: {
      'custom.attribute': 'value',
      'operation.type': 'processing',
    },
  },
  async () => {
    // Your async operation here
    return await doSomething();
  }
);

// Method 2: Using exported createSpan function
const result = createSpan(
  { operationName: 'quick.operation' },
  () => syncOperation()
);
```

#### Specialized Span Methods

```typescript
// HTTP client spans (for outbound requests)
telemetryTracer.createHttpSpan(
  'POST',                           // method
  'https://api.example.com/data',   // url
  200,                              // statusCode
  async () => await fetch(...),     // operation
  {                                 // optional: version context
    version: 'v2',
    source: 'header',
    isLatest: true,
    isSupported: true,
  }
);

// Kong Admin API spans
telemetryTracer.createKongSpan(
  'getConsumer',                    // operation name
  'https://kong:8001/consumers/x',  // url
  'GET',                            // method
  async () => await kongClient.getConsumer(...)
);

// JWT generation spans
telemetryTracer.createJWTSpan(
  'generate',                       // operation
  async () => await generateToken(...),
  'user@example.com'                // optional: username
);

// API versioning spans
telemetryTracer.createApiVersionSpan(
  'route_selection',                // operation
  async () => await selectRoute(...),
  {
    version: 'v2',
    source: 'Accept-Version',
    parseTimeMs: 0.5,
    routingTimeMs: 1.2,
  }
);
```

#### Adding Attributes to Active Span

```typescript
// Add attributes to the currently active span
telemetryTracer.addSpanAttributes({
  'consumer.id': consumerId,
  'cache.hit': true,
  'processing.step': 'validation',
});

// Record exceptions on the active span
try {
  await riskyOperation();
} catch (error) {
  telemetryTracer.recordException(error as Error);
  throw error;
}

// Get trace context for logging
const traceId = telemetryTracer.getCurrentTraceId();
const spanId = telemetryTracer.getCurrentSpanId();
```

#### Span Naming Conventions

| Pattern | Use Case | Example |
|---------|----------|---------|
| `http.client.<service>.<operation>` | Outbound HTTP | `http.client.kong.getConsumer` |
| `crypto.jwt.<operation>` | JWT operations | `crypto.jwt.generate` |
| `cache.<backend>.<operation>` | Cache operations | `cache.redis.get` |
| `api_versioning.<operation>` | Version routing | `api_versioning.route_selection` |
| `<method> <path>` | HTTP server spans | `GET /tokens` |

### Span Events for Critical Correlation Points

Span events are timestamped annotations attached directly to spans, providing a way to capture discrete moments within a span's lifetime. Unlike logs, **span events are ALWAYS captured regardless of LOG_LEVEL**, making them the ideal choice for critical correlation points that must never be filtered out.

#### LOG_LEVEL vs Span Events: Understanding the Trade-off

When you set `LOG_LEVEL=warn` to reduce log verbosity in production:
- **Logs**: Only `warn` and `error` level logs are sent to OTLP (and console)
- **Traces**: ALL spans are still captured (unaffected by LOG_LEVEL)
- **Metrics**: ALL metrics are still captured (unaffected by LOG_LEVEL)
- **Span Events**: ALL events are captured (part of traces, unaffected by LOG_LEVEL)

**The Problem:**
```typescript
// With LOG_LEVEL=warn, this info log is DROPPED
info('Consumer lookup successful', { consumerId, cacheHit: true });

// You lose visibility into successful operations when filtering logs
```

**The Solution: Span Events**
```typescript
// Span events are ALWAYS captured, regardless of LOG_LEVEL
telemetryTracer.addEvent('consumer.lookup.success', {
  'consumer.id': consumerId,
  'cache.hit': true,
});
```

#### When to Use Span Events vs Logs

| Scenario | Use Span Event | Use Log |
|----------|----------------|---------|
| Critical correlation points (e.g., cache hit/miss) | Yes | No |
| Debug information for development | No | Yes |
| Error conditions | Both | Yes |
| Business logic milestones | Yes | Optional |
| Verbose diagnostic output | No | Yes (debug level) |
| Data that MUST appear in traces | Yes | No |
| High-volume repetitive messages | No | Yes (can be filtered) |

#### Tracer API for Span Events

**Implementation:** `src/telemetry/tracer.ts`

```typescript
import { telemetryTracer } from '../telemetry/tracer';

// Basic event - always captured regardless of LOG_LEVEL
telemetryTracer.addEvent('cache.hit', {
  'cache.tier': 'l1',
  'cache.key': 'consumer:abc123',
});

// Timed event - automatically calculates duration
const startTime = performance.now();
await doExpensiveOperation();
telemetryTracer.addTimedEvent('expensive.operation.complete', startTime, {
  'operation.type': 'validation',
  'items.processed': 150,
});
```

#### Critical Correlation Points to Capture

These operations should use span events for guaranteed visibility:

**1. Cache Operations**
```typescript
// Cache hit - critical for performance analysis
telemetryTracer.addEvent('cache.hit', {
  'cache.tier': tier,           // 'l1' | 'l2'
  'cache.backend': 'redis',
  'cache.key_prefix': 'consumer',
  'cache.ttl_remaining_ms': ttl,
});

// Cache miss - triggers downstream lookup
telemetryTracer.addEvent('cache.miss', {
  'cache.tier': tier,
  'cache.backend': 'redis',
  'fallback.action': 'kong_lookup',
});
```

**2. Kong Consumer Lookup**
```typescript
// Consumer found
telemetryTracer.addEvent('kong.consumer.found', {
  'consumer.id': consumerId,
  'consumer.username': username,
  'lookup.duration_ms': durationMs,
});

// Consumer validation
telemetryTracer.addEvent('consumer.validation.complete', {
  'validation.result': 'valid',
  'consumer.is_anonymous': false,
});
```

**3. JWT Operations**
```typescript
// Token generation milestones
telemetryTracer.addEvent('jwt.claims.prepared', {
  'claims.count': Object.keys(claims).length,
  'audience.count': Array.isArray(aud) ? aud.length : 1,
});

telemetryTracer.addEvent('jwt.signed', {
  'algorithm': 'HS256',
  'token.length': token.length,
});
```

**4. Circuit Breaker State Changes**
```typescript
// State transitions (critical for understanding failures)
telemetryTracer.addEvent('circuit_breaker.state_change', {
  'cb.name': 'kong',
  'cb.previous_state': 'closed',
  'cb.new_state': 'open',
  'cb.failure_count': failureCount,
});

// Stale cache fallback (important for resilience visibility)
telemetryTracer.addEvent('circuit_breaker.stale_cache_used', {
  'cb.name': 'kong',
  'cache.age_seconds': cacheAge,
  'cache.key': cacheKey,
});
```

#### Event Naming Conventions

| Pattern | Use Case | Example |
|---------|----------|---------|
| `<component>.<action>` | General events | `cache.hit`, `jwt.signed` |
| `<component>.<entity>.<action>` | Entity operations | `kong.consumer.found` |
| `<component>.<action>.<result>` | Result-based | `validation.complete.success` |
| `circuit_breaker.<event>` | CB state changes | `circuit_breaker.state_change` |

#### Viewing Span Events in Observability Tools

**Elastic APM:**
1. Open the trace/transaction view
2. Expand the span of interest
3. Events appear in the "Events" tab with timestamps
4. Click event to see all attributes

**Jaeger:**
1. View trace details
2. Expand span
3. Events listed under "Logs" section (Jaeger terminology)
4. Each event shows timestamp and attributes

**Datadog:**
1. Open trace view
2. Click on span
3. Events appear in "Span Events" section
4. Attributes displayed as key-value pairs

#### TelemetryEmitter: Unified Span Events + Logs API

The `TelemetryEmitter` provides a unified API that emits BOTH span events AND logs in a single call. This is the recommended approach for critical correlation points.

**Implementation:** `src/telemetry/telemetry-emitter.ts`

**Key Benefits:**
- **Single API**: One call emits both span event and log
- **Span events ALWAYS captured**: Regardless of LOG_LEVEL setting
- **Logs filtered by LOG_LEVEL**: Reduces noise in production
- **Type-safe event names**: Use `SpanEvents` constants for compile-time checking
- **Consistent attributes**: Same data appears in both traces and logs

**Basic Usage:**
```typescript
import { telemetryEmitter, SpanEvents } from '../telemetry/tracer';

// Info level - emits span event + info log
telemetryEmitter.info(SpanEvents.CACHE_HIT, 'Cache hit', {
  key: 'consumer:123',
  tier: 'l1',
});

// Warning level - emits span event + warn log
telemetryEmitter.warn(SpanEvents.CB_FAILURE, 'Circuit breaker failure', {
  operation: 'getConsumerSecret',
  error: 'Connection timeout',
  failure_count: 3,
});

// Error level - emits span event + error log
telemetryEmitter.error(SpanEvents.CB_STATE_OPEN, 'Circuit breaker opened', {
  operation: 'kong_health_check',
  failure_count: 5,
  reset_timeout_ms: 30000,
});

// Debug level (filtered in production with LOG_LEVEL=warn)
telemetryEmitter.debug(SpanEvents.CACHE_OPERATION_STARTED, 'Starting cache operation', {
  key: 'consumer:456',
});
```

**Timed Operations:**
```typescript
const startTime = performance.now();
await doExpensiveOperation();

// Automatically calculates duration_ms
telemetryEmitter.timed(SpanEvents.CACHE_SET, 'Cache set completed', startTime, {
  key: 'consumer:123',
  ttl_seconds: 300,
});

// With explicit log level
telemetryEmitter.timedWithLevel(
  SpanEvents.CB_TIMEOUT,
  'Operation timed out',
  'warn',
  startTime,
  { operation: 'kong_lookup' }
);
```

**Full Options API:**
```typescript
telemetryEmitter.emit({
  event: SpanEvents.CB_STATE_OPEN,
  message: 'Circuit breaker opened',
  level: 'error',  // 'debug' | 'info' | 'warn' | 'error'
  attributes: {
    operation: 'getConsumerSecret',
    failure_count: 5,
  },
  startTime: operationStartTime,  // Optional: auto-calculates duration
});
```

#### SpanEvents Constants

Type-safe event name constants following the `<component>.<sub_component>.<action>` naming convention:

```typescript
import { SpanEvents } from '../telemetry/tracer';

// Circuit Breaker Events
SpanEvents.CB_STATE_OPEN           // "circuit_breaker.state.open"
SpanEvents.CB_STATE_HALF_OPEN      // "circuit_breaker.state.half_open"
SpanEvents.CB_STATE_CLOSED         // "circuit_breaker.state.closed"
SpanEvents.CB_FAILURE              // "circuit_breaker.failure"
SpanEvents.CB_FALLBACK_USED        // "circuit_breaker.fallback.used"
SpanEvents.CB_REQUEST_REJECTED     // "circuit_breaker.request.rejected"

// Cache Events
SpanEvents.CACHE_HIT               // "cache.hit"
SpanEvents.CACHE_MISS              // "cache.miss"
SpanEvents.CACHE_SET               // "cache.set"
SpanEvents.CACHE_DELETE            // "cache.delete"
SpanEvents.CACHE_CONNECTED         // "cache.connection.established"
SpanEvents.CACHE_DISCONNECTED      // "cache.connection.lost"
SpanEvents.CACHE_OPERATION_STARTED // "cache.operation.started"
SpanEvents.CACHE_OPERATION_COMPLETED // "cache.operation.completed"
SpanEvents.CACHE_OPERATION_FAILED  // "cache.operation.failed"

// Kong Events
SpanEvents.KONG_CONSUMER_FOUND     // "kong.consumer.found"
SpanEvents.KONG_CONSUMER_NOT_FOUND // "kong.consumer.not_found"
SpanEvents.KONG_CACHE_HIT          // "kong.cache.hit"
SpanEvents.KONG_REQUEST_SUCCESS    // "kong.request.success"
SpanEvents.KONG_REQUEST_FAILED     // "kong.request.failed"
SpanEvents.KONG_REALM_CREATED      // "kong.realm.created"

// Validation Events
SpanEvents.VALIDATION_FAILED       // "validation.failed"
SpanEvents.VALIDATION_FAILED_STRICT // "validation.failed.strict"
SpanEvents.VALIDATION_JSON_PARSE_FAILED // "validation.json.parse_failed"

// Health Check Events
SpanEvents.HEALTH_CHECK_SUCCESS    // "health.check.success"
SpanEvents.HEALTH_CHECK_DEGRADED   // "health.check.degraded"
SpanEvents.HEALTH_CHECK_FAILED     // "health.check.failed"
```

#### Migration Strategy: Logs to TelemetryEmitter

When converting existing logs to use the unified TelemetryEmitter:

**Before (log-based):**
```typescript
import { winstonTelemetryLogger } from '../telemetry/winston-logger';

// These get filtered when LOG_LEVEL=warn
winstonTelemetryLogger.info('Cache lookup completed', {
  cacheHit: true,
  tier: 'l1',
  duration: 2.5,
});
```

**After (TelemetryEmitter):**
```typescript
import { telemetryEmitter, SpanEvents } from '../telemetry/tracer';

// Span event is ALWAYS captured, log is filtered by LOG_LEVEL
telemetryEmitter.info(SpanEvents.CACHE_HIT, 'Cache lookup completed', {
  cache_hit: true,       // Note: snake_case for attributes
  tier: 'l1',
  duration_ms: 2.5,
});
```

**Key Migration Steps:**
1. Replace `winstonTelemetryLogger` import with `import { telemetryEmitter, SpanEvents } from "../telemetry/tracer";`
2. Add appropriate `SpanEvents` constant as first argument
3. Convert attribute names from camelCase to snake_case
4. Flatten any nested objects (TelemetryEmitter expects flat key-value pairs)
5. Handle null values with `?? "default"` (undefined is allowed)

#### Best Practices

1. **Event names should be dot-separated lowercase**: `cache.hit`, not `CacheHit` or `cache-hit`
2. **Keep attribute count reasonable**: 3-7 attributes per event
3. **Use semantic attribute names**: Prefix with component (`cache.`, `kong.`, `jwt.`)
4. **Include timing for async operations**: Use `addTimedEvent()` for duration tracking
5. **Don't duplicate information**: If it's in span attributes, don't repeat in events
6. **Reserve logs for verbosity**: Use debug/info logs for detailed diagnostics that can be filtered

#### Performance Considerations

Span events have minimal overhead:
- Events are stored in memory with the span until export
- Export happens in batches via `BatchSpanProcessor`
- Event attributes are limited to primitive types (string, number, boolean)
- No network I/O until batch export

For high-throughput paths, prefer a single event with multiple attributes over multiple events:

```typescript
// Better: Single event with multiple attributes
telemetryTracer.addEvent('request.processed', {
  'cache.hit': true,
  'cache.tier': 'l1',
  'kong.called': false,
  'jwt.generated': true,
  'total_duration_ms': totalMs,
});

// Worse: Multiple events for same logical operation
telemetryTracer.addEvent('cache.hit');
telemetryTracer.addEvent('kong.skipped');
telemetryTracer.addEvent('jwt.generated');
```

### Telemetry Circuit Breakers

Each telemetry signal (traces, metrics, logs) has its own circuit breaker to prevent cascade failures when OTLP endpoints are unavailable.

**Implementation:** `src/telemetry/telemetry-circuit-breaker.ts`

#### Circuit Breaker Instances

```typescript
import { telemetryCircuitBreakers, getTelemetryCircuitBreakerStats } from '../telemetry/telemetry-circuit-breaker';

// Three independent circuit breakers
telemetryCircuitBreakers.traces   // Protects trace exports
telemetryCircuitBreakers.metrics  // Protects metric exports
telemetryCircuitBreakers.logs     // Protects log exports

// Get stats for all circuit breakers
const stats = getTelemetryCircuitBreakerStats();
// Returns: { traces: {...}, metrics: {...}, logs: {...} }
```

#### Default Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| `failureThreshold` | 5 | Failures before opening |
| `recoveryTimeout` | 60000ms | Time before half-open |
| `successThreshold` | 3 | Successes to close |
| `monitoringInterval` | 10000ms | Recovery check interval |

**Environment Variable Overrides:**
```bash
TELEMETRY_CB_FAILURE_THRESHOLD=5
TELEMETRY_CB_RECOVERY_TIMEOUT=60000
TELEMETRY_CB_SUCCESS_THRESHOLD=3
TELEMETRY_CB_MONITORING_INTERVAL=10000
```

#### Circuit Breaker States

| State | Value | Behavior |
|-------|-------|----------|
| `CLOSED` | 0 | Normal operation, exports allowed |
| `OPEN` | 1 | Exports rejected, waiting for recovery |
| `HALF_OPEN` | 2 | Testing recovery with limited exports |

#### State Transitions

```
CLOSED --[5 failures]--> OPEN --[60s timeout]--> HALF_OPEN
                           ^                         |
                           |                         v
                           +---[1 failure]---[3 successes]--> CLOSED
```

#### Manual Control

```typescript
import { resetTelemetryCircuitBreakers } from '../telemetry/telemetry-circuit-breaker';

// Reset all circuit breakers to CLOSED state
resetTelemetryCircuitBreakers();
```

### Cardinality Guard

Prevents metric cardinality explosion by limiting unique consumer IDs tracked in metrics. When the limit is reached, new consumers are hashed into buckets.

**Implementation:** `src/telemetry/cardinality-guard.ts`

#### Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| `maxUniqueConsumers` | 1000 | Max individually tracked consumers |
| `hashBuckets` | 256 | Overflow bucket count |
| `resetIntervalMs` | 3600000 (1 hour) | Tracking reset interval |
| `warningThresholdPercent` | 80 | Warning at 80% capacity |

#### How It Works

```typescript
import { getBoundedConsumerId, getCardinalityStats } from '../telemetry/cardinality-guard';

// Returns consumerId if under limit, otherwise bucket_XXX
const metricConsumerId = getBoundedConsumerId(actualConsumerId);

// Examples:
getBoundedConsumerId('consumer-001')  // 'consumer-001' (tracked individually)
getBoundedConsumerId('consumer-1001') // 'bucket_042' (hashed to bucket)

// Get current stats
const stats = getCardinalityStats();
// {
//   uniqueConsumersTracked: 847,
//   maxUniqueConsumers: 1000,
//   usagePercent: 84.7,
//   limitExceeded: false,
//   bucketsUsed: 0,
//   totalBuckets: 256,
//   totalRequests: 125000,
//   warningsEmitted: 1,
//   timeSinceReset: 1800000
// }
```

#### Warning Levels

```typescript
import { getCardinalityWarningLevel } from '../telemetry/cardinality-guard';

const level = getCardinalityWarningLevel();
// 'ok'       - Under 80% capacity
// 'warning'  - 80-99% capacity
// 'critical' - At or over 100% (bucketing active)
```

#### Monitoring Cardinality

The cardinality stats are exposed in the `/metrics?view=full` endpoint:

```json
{
  "cardinality": {
    "uniqueConsumersTracked": 847,
    "maxUniqueConsumers": 1000,
    "usagePercent": 84.7,
    "limitExceeded": false,
    "warningLevel": "warning"
  }
}
```

### Winston Logger API

Structured logging with ECS format and OTLP transport integration.

**Implementation:** `src/telemetry/winston-logger.ts`

#### Basic Logging

```typescript
import { info, warn, error, debug } from '../telemetry/winston-logger';

// Simple messages
info('Operation completed');
warn('Cache miss, falling back to Kong');
error('Failed to generate token');
debug('Processing request details');

// With context
info('Token generated', {
  consumerId: 'abc-123',
  username: 'user@example.com',
  requestId: 'req-456',
  totalDuration: 45,
});
```

#### Specialized Logging Methods

```typescript
import {
  logHttpRequest,
  logAuthenticationEvent,
  logKongOperation
} from '../telemetry/winston-logger';

// HTTP request logging
logHttpRequest('POST', '/tokens', 200, 45, {
  consumerId: 'abc-123',
  cacheHit: true,
});

// Authentication events
logAuthenticationEvent('token_generation', true, {
  consumerId: 'abc-123',
  tokenType: 'jwt',
});

// Kong operations
logKongOperation('getConsumerSecret', 32, true, {
  consumerId: 'abc-123',
  cacheHit: false,
});
```

#### ECS Field Mapping

Fields are automatically mapped to ECS (Elastic Common Schema):

| Input Field | ECS Field | Type |
|-------------|-----------|------|
| `consumerId` | `consumer.id` | string |
| `username` | `consumer.name` | string |
| `requestId` | `event.id` | string |
| `totalDuration` | `event.duration` | number (ns) |

**Automatic Trace Correlation:**
```json
{
  "@timestamp": "2026-01-20T12:00:00.000Z",
  "message": "Token generated",
  "log.level": "info",
  "consumer.id": "abc-123",
  "consumer.name": "user@example.com",
  "event.id": "req-456",
  "trace.id": "550e8400-e29b-41d4-a716-446655440000",
  "span.id": "550e8400-e29b"
}
```

#### Logger Lifecycle

```typescript
import { winstonTelemetryLogger } from '../telemetry/winston-logger';

// Flush all transports (call before shutdown)
await winstonTelemetryLogger.flush();

// Reinitialize after telemetry SDK changes
winstonTelemetryLogger.reinitialize();
```

#### Log Levels

| Level | Use Case |
|-------|----------|
| `error` | Failures requiring attention |
| `warn` | Degraded operation, recoverable issues |
| `info` | Normal operations, business events |
| `debug` | Development debugging (disabled in production) |

**Configuration:**
```bash
LOG_LEVEL=info  # Minimum level to output (default: info)
```

## Telemetry Modes

Configure via `TELEMETRY_MODE` environment variable:

| Mode | Description | Use Case |
|------|-------------|----------|
| `console` | Logs only to console | Development |
| `otlp` | Exports only to OTLP endpoints | Production |
| `both` | Console logs + OTLP export | Debugging |

### OpenTelemetry SDK 0.212.0 Compatibility

The service is compatible with OpenTelemetry SDK 0.212.0+, which introduced a breaking change requiring explicit LoggerProvider registration.

**Required Initialization Sequence:**
1. Initialize OpenTelemetry SDK
2. Register LoggerProvider via `logs.setGlobalLoggerProvider()`
3. Reinitialize Winston logger to pick up the new provider

**Implementation:** `src/telemetry/telemetry.ts`

**Troubleshooting:** If console logs are not appearing after telemetry initialization in `TELEMETRY_MODE=both`, ensure the Winston logger is reinitialized after the LoggerProvider is set. The logger caches its reference to the OTLP transport, which must be updated after the SDK is fully initialized.

**Reference:** Commits a5045d3, 8d070bb (2026-02-14/15) - Fix OTEL log export for SDK 0.212.0 breaking change

## Key Metrics

### Complete Metrics Reference (65 Instruments)

The service exports 65 OpenTelemetry metric instruments organized by category. All metrics are defined in `src/telemetry/metrics/instruments.ts`.

#### HTTP Metrics (7 instruments)

| Metric Name | Type | Attributes | Description |
|-------------|------|------------|-------------|
| `http_requests_total` | Counter | method, path, status | Total HTTP requests |
| `http_requests_by_status` | Counter | method, path, status | Requests grouped by status code |
| `http_response_time` | Histogram | method, path, status | Response time distribution (ms) |
| `http_request_size` | Histogram | method, path | Request body size (bytes) |
| `http_response_size` | Histogram | method, path, status | Response body size (bytes) |
| `http_active_requests` | Gauge | method, path | Currently processing requests |
| `http_requests_in_flight` | Gauge | - | Total in-flight requests |

**Recording Functions:** `src/telemetry/metrics/http-metrics.ts`
```typescript
recordHttpRequest(method: string, path: string, statusCode: number)
recordHttpResponseTime(method: string, path: string, statusCode: number, durationMs: number)
recordHttpRequestSize(method: string, path: string, sizeBytes: number)
recordHttpResponseSize(method: string, path: string, statusCode: number, sizeBytes: number)
recordActiveRequests(method: string, path: string, delta: number)
```

#### Authentication Metrics (4 instruments)

| Metric Name | Type | Attributes | Description |
|-------------|------|------------|-------------|
| `jwt_token_creation_time` | Histogram | consumer_id, success | JWT generation latency (ms) |
| `authentication_attempts` | Counter | consumer_id, success | Total auth attempts |
| `authentication_success` | Counter | consumer_id | Successful authentications |
| `authentication_failure` | Counter | consumer_id, reason | Failed authentications |

**Recording Functions:** `src/telemetry/metrics/auth-metrics.ts`
```typescript
recordJwtTokenCreation(consumerId: string, durationMs: number, success: boolean)
recordAuthenticationAttempt(consumerId: string, success: boolean)
recordAuthenticationSuccess(consumerId: string)
recordAuthenticationFailure(consumerId: string, reason: string)
```

#### Kong Metrics (4 instruments)

| Metric Name | Type | Attributes | Description |
|-------------|------|------------|-------------|
| `kong_operations` | Counter | operation, status | Kong Admin API operations |
| `kong_response_time` | Histogram | operation | Kong API latency (ms) |
| `kong_cache_hits` | Counter | operation | Cache hits for Kong data |
| `kong_cache_misses` | Counter | operation | Cache misses requiring Kong call |

**Recording Functions:** `src/telemetry/metrics/kong-metrics.ts`
```typescript
recordKongOperation(operation: string, responseTimeMs: number, success?: boolean)
recordKongResponseTime(operation: string, responseTimeMs: number)
recordKongCacheHit(operation: string)
recordKongCacheMiss(operation: string)
```

#### Redis/Cache Metrics (6 instruments)

| Metric Name | Type | Attributes | Description |
|-------------|------|------------|-------------|
| `redis_operations` | Counter | operation, status | Redis command executions |
| `redis_operation_duration` | Histogram | operation | Redis latency (ms) |
| `redis_connections` | Gauge | state | Active Redis connections |
| `redis_cache_hits` | Counter | key_prefix | Cache hits |
| `redis_cache_misses` | Counter | key_prefix | Cache misses |
| `redis_errors` | Counter | error_type | Redis errors |

**Recording Functions:** `src/telemetry/metrics/redis-metrics.ts`
```typescript
recordRedisOperation(operation: string, durationMs: number, success?: boolean)
recordRedisConnection(state: 'connected' | 'disconnected' | 'reconnecting')
recordCacheOperation(operation: string, hit: boolean, keyPrefix?: string)
```

#### Cache Tier Metrics (3 instruments)

| Metric Name | Type | Attributes | Description |
|-------------|------|------------|-------------|
| `cache_tier_usage` | Counter | tier, operation, result | Cache tier access patterns |
| `cache_tier_latency` | Histogram | tier, operation | Tier-specific latency |
| `cache_tier_errors` | Counter | tier, error_type | Cache tier failures |

**Tier Values:** `redis-primary`, `redis-stale`, `memory-stale`, `kong-fallback`

**Recording Functions:** `src/telemetry/metrics/cache-metrics.ts`
```typescript
recordCacheTierUsage(tier: string, operation: string, result: 'hit' | 'miss' | 'error')
recordCacheTierLatency(tier: string, operation: string, latencyMs: number)
recordCacheTierError(tier: string, errorType: string)
```

#### Circuit Breaker Metrics (5 instruments)

| Metric Name | Type | Attributes | Description |
|-------------|------|------------|-------------|
| `circuit_breaker_state` | Gauge | name | State (0=closed, 1=open, 2=half-open) |
| `circuit_breaker_requests` | Counter | name, result | Requests through circuit breaker |
| `circuit_breaker_rejected` | Counter | name | Rejected due to open circuit |
| `circuit_breaker_fallback` | Counter | name, fallback_type | Fallback invocations |
| `circuit_breaker_state_transitions` | Counter | name, from_state, to_state | State changes |

**Recording Functions:** `src/telemetry/metrics/circuit-breaker-metrics.ts`
```typescript
recordCircuitBreakerState(name: string, state: CircuitBreakerStateEnum)
recordCircuitBreakerRequest(name: string, result: 'success' | 'failure' | 'timeout')
recordCircuitBreakerRejection(name: string)
recordCircuitBreakerFallback(name: string, fallbackType: string)
recordCircuitBreakerStateTransition(name: string, fromState: string, toState: string)
```

#### Process Metrics (22 instruments)

| Metric Name | Type | Description |
|-------------|------|-------------|
| `process_start_time` | Gauge | Process start timestamp |
| `process_uptime` | Gauge | Uptime in seconds |
| `process_memory_usage` | Gauge | Total memory usage |
| `process_heap_used` | Gauge | V8 heap used bytes |
| `process_heap_total` | Gauge | V8 heap total bytes |
| `process_rss` | Gauge | Resident set size |
| `process_external` | Gauge | External memory (C++ objects) |
| `process_cpu_usage` | Gauge | CPU utilization percentage |
| `process_event_loop_delay` | Histogram | Event loop delay distribution |
| `process_event_loop_utilization` | Gauge | Event loop utilization ratio |
| `system_memory_usage` | Gauge | System memory used |
| `system_memory_free` | Gauge | System memory free |
| `system_memory_total` | Gauge | System total memory |
| `system_cpu_usage` | Gauge | System CPU percentage |
| `system_load_average` | Gauge | System load average |
| `gc_collections` | Counter | GC collection count by type |
| `gc_duration` | Histogram | GC pause duration |
| `gc_old_generation_size_before` | Gauge | Old gen size before GC |
| `gc_old_generation_size_after` | Gauge | Old gen size after GC |
| `gc_young_generation_size_before` | Gauge | Young gen size before GC |
| `gc_young_generation_size_after` | Gauge | Young gen size after GC |
| `file_descriptor_usage` | Gauge | Open file descriptors |

**Recording Functions:** `src/telemetry/metrics/process-metrics.ts`
```typescript
recordGCCollection(type: string)
recordGCDuration(durationMs: number)
recordGCHeapSizes(before: { old: number, young: number }, after: { old: number, young: number })
startSystemMetricsCollection(intervalMs?: number)
stopSystemMetricsCollection()
```

#### API Versioning Metrics (6 instruments)

| Metric Name | Type | Attributes | Description |
|-------------|------|------------|-------------|
| `api_version_requests` | Counter | version, path | Requests by API version |
| `api_version_header_source` | Counter | source, version | Version header source |
| `api_version_unsupported` | Counter | requested_version | Unsupported version requests |
| `api_version_fallback` | Counter | from_version, to_version | Version fallback events |
| `api_version_parsing_duration` | Histogram | version | Version parsing latency |
| `api_version_routing_duration` | Histogram | version | Version routing latency |

**Recording Functions:** `src/telemetry/metrics/api-version-metrics.ts`
```typescript
recordApiVersionRequest(version: string, path: string)
recordApiVersionHeaderSource(source: 'header' | 'query' | 'default', version: string)
recordApiVersionUnsupported(requestedVersion: string)
recordApiVersionFallback(fromVersion: string, toVersion: string)
```

#### Consumer Volume Metrics (3 instruments)

| Metric Name | Type | Attributes | Description |
|-------------|------|------------|-------------|
| `consumer_requests_by_volume` | Counter | volume_class, consumer_id | Requests by volume tier |
| `consumer_errors_by_volume` | Counter | volume_class, error_type | Errors by volume tier |
| `consumer_latency_by_volume` | Histogram | volume_class | Latency by volume tier |

**Volume Classes:** `high` (>5K req/hr), `medium` (100-5K req/hr), `low` (<100 req/hr)

#### Security Metrics (5 instruments)

| Metric Name | Type | Attributes | Description |
|-------------|------|------------|-------------|
| `security_events` | Counter | event_type, severity | Security events |
| `security_headers_applied` | Counter | header_set, version | Security headers applied |
| `audit_events` | Counter | event_type, consumer_id | Audit log events |
| `security_risk_score` | Histogram | consumer_id | Risk score distribution |
| `security_anomalies` | Counter | anomaly_type | Detected anomalies |

**Recording Functions:** `src/telemetry/metrics/security-metrics.ts`
```typescript
recordSecurityEvent(eventType: string, severity: 'low' | 'medium' | 'high' | 'critical')
recordSecurityHeaders(headerSet: string, version: string)
recordAuditEvent(eventType: string, consumerId: string)
```

#### Error Metrics (2 instruments)

| Metric Name | Type | Attributes | Description |
|-------------|------|------------|-------------|
| `error_rate` | Counter | error_code, path | Errors by code |
| `exceptions` | Counter | exception_type, handled | Exceptions caught |

**Recording Functions:** `src/telemetry/metrics/error-metrics.ts`
```typescript
recordError(errorCode: string, path: string)
recordException(exceptionType: string, handled: boolean)
```

#### Telemetry Self-Metrics (2 instruments)

| Metric Name | Type | Attributes | Description |
|-------------|------|------------|-------------|
| `telemetry_exports` | Counter | signal_type, status | Export attempts |
| `telemetry_export_errors` | Counter | signal_type, error_type | Export failures |

**Recording Functions:** `src/telemetry/metrics/telemetry-metrics.ts`
```typescript
recordTelemetryExport(signalType: 'traces' | 'metrics' | 'logs', success: boolean)
recordTelemetryExportError(signalType: string, errorType: string)
```

### Health Check Endpoints

#### Main Health Check - `/health`
```bash
curl http://localhost:3000/health
```

Returns service health with dependency status:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T12:00:00.000Z",
  "uptime": "1h",
  "version": "1.0.0",
  "environment": "production",
  "highAvailability": false,
  "circuitBreakerState": "closed",
  "dependencies": {
    "kong": {
      "status": "healthy",
      "mode": "KONNECT",
      "url": "https://us.api.konghq.com/v2/control-planes/abc123",
      "responseTime": "45ms"
    },
    "telemetry": {
      "traces": {
        "status": "healthy",
        "endpoint": "https://otel.example.com/v1/traces",
        "responseTime": "10ms",
        "exports": {
          "successRate": "100%",
          "total": 50,
          "failures": 0,
          "lastExportTime": "2025-01-15T11:59:50.000Z",
          "lastFailureTime": null,
          "recentErrors": []
        }
      },
      "metrics": {
        "status": "healthy",
        "endpoint": "https://otel.example.com/v1/metrics",
        "responseTime": "8ms",
        "exports": {
          "successRate": "100%",
          "total": 100,
          "failures": 0,
          "lastExportTime": "2025-01-15T11:59:50.000Z",
          "lastFailureTime": null,
          "recentErrors": []
        }
      },
      "logs": {
        "status": "healthy",
        "endpoint": "https://otel.example.com/v1/logs",
        "responseTime": "12ms",
        "exports": {
          "successRate": "100%",
          "total": 200,
          "failures": 0,
          "lastExportTime": "2025-01-15T11:59:50.000Z",
          "lastFailureTime": null,
          "recentErrors": []
        }
      }
    }
  }
}
```

#### Telemetry Export Statistics

Each telemetry type (traces, metrics, logs) includes per-type export statistics in the `exports` object:

| Field | Type | Description |
|-------|------|-------------|
| `successRate` | String | Export success rate as percentage (e.g., "100%") |
| `total` | Integer | Total export attempts |
| `failures` | Integer | Failed exports |
| `lastExportTime` | String/null | ISO-8601 timestamp of last export attempt |
| `lastFailureTime` | String/null | ISO-8601 timestamp of last failure (null if no failures) |
| `recentErrors` | Array | Recent error messages with timestamps (max 10 entries) |

These statistics help diagnose telemetry export issues by showing success rates and recent errors per signal type.

#### Telemetry Health Check - `/health/telemetry`
```bash
curl http://localhost:3000/health/telemetry
```

Returns telemetry system status:
```json
{
  "status": "healthy",
  "mode": "otlp",
  "endpoints": {
    "traces": "https://otel.example.com/v1/traces",
    "metrics": "https://otel.example.com/v1/metrics",
    "logs": "https://otel.example.com/v1/logs"
  },
  "exporters": {
    "traces": "active",
    "metrics": "active",
    "logs": "active"
  }
}
```

### OTLP Connectivity Validation

The `/health` endpoint performs active connectivity checks to all configured OTLP endpoints (traces, metrics, logs) to validate observability infrastructure.

#### How It Works

1. **Parallel Connectivity Tests**: All OTLP endpoints are tested concurrently for responsiveness
2. **5-Second Timeout**: Each endpoint check has a 5-second timeout to prevent health check delays
3. **Status Aggregation**: Overall telemetry status reflects the health of all endpoints
4. **Response Time Tracking**: Each endpoint reports its response time in human-readable format (e.g., "45ms", "1.5s")

#### Health Response with OTLP Status

```json
{
  "status": "healthy",
  "dependencies": {
    "telemetry": {
      "status": "healthy",
      "mode": "otlp",
      "endpoints": {
        "traces": {
          "url": "https://otel.example.com/v1/traces",
          "status": "reachable",
          "responseTime": "45ms"
        },
        "metrics": {
          "url": "https://otel.example.com/v1/metrics",
          "status": "reachable",
          "responseTime": "52ms"
        },
        "logs": {
          "url": "https://otel.example.com/v1/logs",
          "status": "reachable",
          "responseTime": "38ms"
        }
      }
    }
  }
}
```

#### Status Values

| Status | Meaning | Health Impact |
|--------|---------|---------------|
| `reachable` | Endpoint responded within 5 seconds | Healthy |
| `unreachable` | Endpoint timeout or connection error | Degraded |
| `disabled` | Telemetry mode is `console` only | N/A (expected) |

#### Fallback Behavior

When OTLP endpoints are unreachable:

1. **Telemetry continues**: Logs still output to console (if `TELEMETRY_MODE=both`)
2. **Health status**: Marked as "degraded" but not "unhealthy"
3. **No blocking**: Service continues processing requests normally
4. **Retry logic**: OpenTelemetry SDK handles automatic retries with exponential backoff

#### Performance Considerations

OTLP connectivity checks add network latency to health endpoint response times:

- **Without OTLP checks**: p95 ~50ms, p99 ~100ms
- **With OTLP checks**: p95 ~400ms, p99 ~500ms

**SLA Thresholds** have been adjusted to account for OTLP validation latency. See [sla.md](sla.md) for updated thresholds.

#### Use Cases

**Kubernetes Liveness Probe** (Use `/health/ready` instead):
```yaml
livenessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
```

**Kubernetes Readiness Probe** (Includes OTLP validation):
```yaml
readinessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 5
  timeoutSeconds: 10
```

**Monitoring Alerts** (Check specific endpoints):
```bash
# Alert if telemetry endpoints are unreachable
curl http://localhost:3000/health/telemetry | jq '.status'
```

#### Troubleshooting OTLP Connectivity

**Symptom**: Health endpoint shows telemetry as "unreachable"

**Diagnosis:**
```bash
# Check telemetry endpoint connectivity
curl -I https://otel.example.com/v1/traces

# Verify environment variables
echo $OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
echo $OTEL_EXPORTER_OTLP_METRICS_ENDPOINT
echo $OTEL_EXPORTER_OTLP_LOGS_ENDPOINT

# Test with increased timeout
curl -X GET "http://localhost:3000/health" --max-time 10
```

**Common Causes:**
1. OTLP collector is down or unreachable
2. Network connectivity issues (firewall, DNS)
3. OTLP endpoint URL misconfiguration
4. Authentication token expired (if required)

#### Metrics Health Check - `/health/metrics`
```bash
curl http://localhost:3000/health/metrics
```

Returns metrics system status:
```json
{
  "status": "healthy",
  "metricsEnabled": true,
  "exportInterval": 10000,
  "lastExport": "2025-01-15T12:00:00.000Z",
  "counters": {
    "http_requests_total": 1000,
    "jwt_tokens_generated": 500,
    "kong_operations": 600,
    "cache_hits": 450,
    "cache_misses": 150
  }
}
```

### Unified Metrics Endpoint - `/metrics`

The service provides a unified metrics endpoint with multiple views:

#### Available Views
```bash
# Operational metrics (default)
curl http://localhost:3000/metrics

# Infrastructure view
curl http://localhost:3000/metrics?view=infrastructure

# Telemetry system status
curl http://localhost:3000/metrics?view=telemetry

# Export statistics
curl http://localhost:3000/metrics?view=exports

# Configuration summary
curl http://localhost:3000/metrics?view=config

# Complete metrics data
curl http://localhost:3000/metrics?view=full
```

#### Operational View Response
```json
{
  "timestamp": "2025-01-15T12:00:00.000Z",
  "uptime": "1h",
  "memory": {
    "used": 64,
    "total": 128,
    "rss": 80,
    "external": 16
  },
  "cache": {
    "strategy": "local-memory",
    "size": 150,
    "activeEntries": 45,
    "hitRate": "0.90",
    "operations": {
      "hits": 450,
      "misses": 50,
      "sets": 100
    }
  },
  "kong": {
    "mode": "KONNECT",
    "circuitBreaker": {
      "state": "CLOSED",
      "failures": 0,
      "successes": 500
    }
  }
}
```

## Debugging Telemetry

### Test Metrics Collection
```bash
# Test metrics collection
curl -X POST http://localhost:3000/debug/metrics/test

# Force immediate export
curl -X POST http://localhost:3000/debug/metrics/export

# View export statistics
curl http://localhost:3000/metrics?view=exports
```

### Development Debug Commands
```bash
# Test metrics recording
curl -X POST http://localhost:3000/debug/metrics/test \
  -H "Content-Type: application/json" \
  -d '{"count": 10, "type": "test-metric"}'

# Force metrics export
curl -X POST http://localhost:3000/debug/metrics/export
```

## Monitoring Best Practices

### Recommended Alerts

#### Performance Alerts
- Event loop delay >100ms sustained for 5 minutes
- Memory usage >80% of container limit
- HTTP error rate >5%
- JWT generation p99 latency >50ms

#### Service Health Alerts
- Kong API failures >1%
- Circuit breaker state transitions to "open"
- Cache miss rate >50%
- OTLP export failures >10%

#### Business Logic Alerts
- JWT token generation failures
- Anonymous consumer access attempts
- Consumer secret creation failures

### Monitoring Dashboards

#### Operational Dashboard Metrics
- Request rate and latency
- Memory and CPU utilization
- Error rates by endpoint
- Cache hit/miss ratios
- Circuit breaker status

#### Infrastructure Dashboard Metrics
- Host-level CPU, memory, disk, network
- Container resource usage
- Cache tier performance
- Circuit breaker metrics
- OpenTelemetry export health

#### Business Dashboard Metrics
- JWT tokens generated per minute
- Unique consumers served
- Kong operations by type
- Authentication success/failure rates

### Log Analysis

#### Request Tracing
All HTTP requests include trace IDs for correlation:
```json
{
  "timestamp": "2025-01-15T12:00:00.000Z",
  "level": "info",
  "message": "HTTP request completed",
  "traceId": "550e8400-e29b-41d4-a716-446655440000",
  "spanId": "550e8400-e29b",
  "method": "GET",
  "path": "/tokens",
  "statusCode": 200,
  "duration": 45,
  "consumerId": "98765432-9876-5432-1098-765432109876"
}
```

#### Error Tracking
Errors include full context and stack traces:
```json
{
  "timestamp": "2025-01-15T12:00:00.000Z",
  "level": "error",
  "message": "Kong API request failed",
  "traceId": "550e8400-e29b-41d4-a716-446655440000",
  "error": {
    "name": "ConnectionError",
    "message": "ECONNREFUSED localhost:8001",
    "stack": "..."
  },
  "context": {
    "operation": "getConsumerSecret",
    "consumerId": "98765432-9876-5432-1098-765432109876",
    "circuitBreakerState": "OPEN"
  }
}
```

## Production Monitoring Setup

### Complete Environment Variables Reference

All telemetry-related environment variables in one place for easy copy-paste setup.

#### Core Telemetry Settings

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `TELEMETRY_MODE` | Output mode: `console`, `otlp`, `both` | `both` | No |
| `LOG_LEVEL` | Logging level: `error`, `warn`, `info`, `debug`, `silent` | `info` | No |

#### OpenTelemetry Service Identity

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `OTEL_SERVICE_NAME` | Service name in traces/metrics | `authentication-service` | No |
| `OTEL_SERVICE_VERSION` | Service version (overrides package.json) | from `package.json` | No |
| `NODE_ENV` | Environment name for `deployment.environment` | `development` | No |

#### OTLP Exporter Endpoints

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Base OTLP endpoint (if all signals use same host) | - | No |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Traces endpoint | `{base}/v1/traces` | No |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | Metrics endpoint | `{base}/v1/metrics` | No |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | Logs endpoint | `{base}/v1/logs` | No |

#### OTLP Exporter Tuning

| Variable | Description | Default | Range |
|----------|-------------|---------|-------|
| `OTEL_EXPORTER_OTLP_TIMEOUT` | Export timeout (ms) | `30000` | 1000-120000 |
| `OTEL_BSP_MAX_EXPORT_BATCH_SIZE` | Batch size for spans | `512` | 1-4096 |
| `OTEL_BSP_MAX_QUEUE_SIZE` | Max queued spans | `2048` | 512-16384 |
| `OTEL_BSP_SCHEDULE_DELAY` | Export interval (ms) | `1000` | 100-60000 |

#### Telemetry Circuit Breaker

| Variable | Description | Default | Range |
|----------|-------------|---------|-------|
| `TELEMETRY_CB_FAILURE_THRESHOLD` | Failures before opening | `5` | 1-100 |
| `TELEMETRY_CB_RECOVERY_TIMEOUT` | Recovery timeout (ms) | `60000` | 1000-600000 |
| `TELEMETRY_CB_SUCCESS_THRESHOLD` | Successes to close | `3` | 1-20 |
| `TELEMETRY_CB_MONITORING_INTERVAL` | Monitoring interval (ms) | `10000` | 1000-60000 |

### Configuration Examples

#### Development (Console Only)
```bash
TELEMETRY_MODE=console
LOG_LEVEL=debug
OTEL_SERVICE_NAME=authentication-service
```

#### Development with Local Collector
```bash
TELEMETRY_MODE=both
LOG_LEVEL=debug
OTEL_SERVICE_NAME=authentication-service
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

#### Production (OTLP Export)
```bash
TELEMETRY_MODE=otlp
LOG_LEVEL=info
NODE_ENV=production
OTEL_SERVICE_NAME=authentication-service
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://otel.example.com/v1/traces
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=https://otel.example.com/v1/metrics
OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=https://otel.example.com/v1/logs
OTEL_EXPORTER_OTLP_TIMEOUT=30000
OTEL_BSP_MAX_EXPORT_BATCH_SIZE=2048
OTEL_BSP_MAX_QUEUE_SIZE=10000
```

#### Kubernetes ConfigMap
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: auth-service-telemetry
data:
  TELEMETRY_MODE: "otlp"
  LOG_LEVEL: "info"
  OTEL_SERVICE_NAME: "authentication-service"
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector.monitoring:4318"
  OTEL_EXPORTER_OTLP_TIMEOUT: "30000"
  OTEL_BSP_MAX_EXPORT_BATCH_SIZE: "2048"
  OTEL_BSP_MAX_QUEUE_SIZE: "10000"
```

#### Docker Compose
```yaml
services:
  auth-service:
    environment:
      - TELEMETRY_MODE=otlp
      - LOG_LEVEL=info
      - OTEL_SERVICE_NAME=authentication-service
      - OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
```

### Package Dependencies

The telemetry system requires these OpenTelemetry packages:

```json
{
  "dependencies": {
    "@opentelemetry/api": "^1.9.0",
    "@opentelemetry/api-logs": "^0.212.0",
    "@opentelemetry/auto-instrumentations-node": "^0.212.0",
    "@opentelemetry/exporter-logs-otlp-http": "^0.212.0",
    "@opentelemetry/exporter-metrics-otlp-http": "^0.212.0",
    "@opentelemetry/exporter-trace-otlp-http": "^0.212.0",
    "@opentelemetry/host-metrics": "^0.212.0",
    "@opentelemetry/instrumentation-redis": "^0.212.0",
    "@opentelemetry/resources": "^2.0.0",
    "@opentelemetry/sdk-logs": "^0.212.0",
    "@opentelemetry/sdk-metrics": "^2.0.0",
    "@opentelemetry/sdk-node": "^0.212.0",
    "@opentelemetry/sdk-trace-base": "^2.0.0",
    "@opentelemetry/semantic-conventions": "^1.28.0",
    "@opentelemetry/winston-transport": "^0.12.0",
    "@elastic/ecs-winston-format": "^1.6.2",
    "winston": "^3.18.0"
  }
}
```

### Initialization Code

To mimic this setup in another project, use this initialization pattern:

```typescript
// src/telemetry/instrumentation.ts
import { logs } from "@opentelemetry/api-logs";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HostMetrics } from "@opentelemetry/host-metrics";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { ATTR_DEPLOYMENT_ENVIRONMENT_NAME } from "@opentelemetry/semantic-conventions/incubating";

export async function initializeTelemetry(config: {
  serviceName: string;
  serviceVersion: string;
  environment: string;
  tracesEndpoint: string;
  metricsEndpoint: string;
  logsEndpoint: string;
  exportTimeout?: number;
}): Promise<void> {
  // 1. Create resource with service identity
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: config.serviceVersion,
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: config.environment,
  });

  // 2. Create OTLP exporters
  const traceExporter = new OTLPTraceExporter({
    url: config.tracesEndpoint,
    timeoutMillis: config.exportTimeout || 30000,
  });

  const metricExporter = new OTLPMetricExporter({
    url: config.metricsEndpoint,
    timeoutMillis: config.exportTimeout || 30000,
  });

  const logExporter = new OTLPLogExporter({
    url: config.logsEndpoint,
    timeoutMillis: config.exportTimeout || 30000,
  });

  // 3. Create processors
  const traceProcessor = new BatchSpanProcessor(traceExporter, {
    maxExportBatchSize: 10,
    scheduledDelayMillis: 1000,
  });

  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 10000,
  });

  const logProcessor = new BatchLogRecordProcessor(logExporter);

  // 4. Create and register LoggerProvider (SDK 0.212.0+ requirement)
  const loggerProvider = new LoggerProvider({
    resource,
    processors: [logProcessor],
  });
  logs.setGlobalLoggerProvider(loggerProvider);

  // 5. Start NodeSDK with auto-instrumentations
  const sdk = new NodeSDK({
    resource,
    spanProcessors: [traceProcessor],
    metricReaders: [metricReader],
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-grpc": { enabled: false },
      }),
    ],
  });
  sdk.start();

  // 6. Start host metrics collection
  const hostMetrics = new HostMetrics({});
  hostMetrics.start();
}
```

```typescript
// src/telemetry/winston-logger.ts
import ecsFormat from "@elastic/ecs-winston-format";
import { OpenTelemetryTransportV3 } from "@opentelemetry/winston-transport";
import winston from "winston";

export function createLogger(config: {
  serviceName: string;
  serviceVersion: string;
  environment: string;
  level?: string;
  enableOtlp?: boolean;
}): winston.Logger {
  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.simple()
      ),
    }),
  ];

  if (config.enableOtlp) {
    transports.push(new OpenTelemetryTransportV3());
  }

  return winston.createLogger({
    level: config.level || "info",
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      ecsFormat({
        convertErr: true,
        apmIntegration: true,
        serviceName: config.serviceName,
        serviceVersion: config.serviceVersion,
        serviceEnvironment: config.environment,
      })
    ),
    transports,
  });
}
```

### OTEL Collector Configuration (Required)

The service sends logs via OTLP to an OpenTelemetry Collector. To prevent duplicate fields in Elasticsearch (where ECS fields appear both at root level and in `labels.*` namespace), configure the collector's Transform Processor.

**Problem**: `@elastic/ecs-winston-format` outputs dot-notation fields which the OTLP transport converts to `labels.*` namespace, causing duplicates like `service.name` AND `labels.service_name`.

**Solution**: Add to your `otel-collector.yaml`:

```yaml
processors:
  transform/remove-duplicate-labels:
    log_statements:
      - context: log
        statements:
          # Remove ECS metadata duplicates (already in resource attributes)
          - delete(attributes["service.name"])
          - delete(attributes["service.version"])
          - delete(attributes["service.environment"])
          - delete(attributes["log.level"])
          - delete(attributes["ecs.version"])
          - delete(attributes["event.dataset"])
          - delete(attributes["timestamp"])

service:
  pipelines:
    logs:
      receivers: [otlp]
      processors: [transform/remove-duplicate-labels, batch]
      exporters: [elasticsearch]
```

**Why application-level fix is not possible**: The `OpenTelemetryTransportV3` requires dot-notation fields to construct OTLP LogRecords. Deleting them in the Winston format pipeline breaks OTLP export entirely (see commit 60fa3c2 and revert 0256c43).

**Reference**: [SIO-319](https://linear.app/siobytes/issue/SIO-319)

### Health Check Integration
```yaml
# Kubernetes health checks
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/ready    # Dedicated readiness probe checking Kong connectivity
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
```

**Note**: Use `/health` for liveness (service is running) and `/health/ready` for readiness (service can accept traffic). The readiness probe verifies Kong connectivity before allowing traffic.

### Prometheus Integration
```yaml
# ServiceMonitor for Prometheus
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: authentication-service
spec:
  selector:
    matchLabels:
      app: authentication-service
  endpoints:
  - port: http
    path: /metrics
    interval: 30s
    params:
      view: ["infrastructure"]
```

## Graceful Shutdown

The service implements proper resource cleanup during shutdown to prevent memory leaks and ensure telemetry data is flushed.

### Shutdown Sequence

When receiving SIGTERM or SIGINT:

1. **Log shutdown sequence** - Batch log all shutdown steps to OTLP
2. **Stop HTTP server** - Stop accepting new requests
3. **Clear intervals** - Clean up all background intervals:
   - `shutdownGCMetrics()` - GC monitoring interval
   - `shutdownConsumerVolume()` - Consumer tracking interval
   - `shutdownCardinalityGuard()` - Cardinality cleanup interval
   - `shutdownTelemetryCircuitBreakers()` - Circuit breaker intervals
4. **Flush telemetry** - Export pending metrics, traces, logs
5. **Exit process** - Clean exit with code 0

### Shutdown Timeout

- **Grace period**: 10 seconds
- **Force exit**: If shutdown exceeds timeout, process exits with code 1

### Cardinality Guard

The service implements a cardinality guard to prevent metric explosion:

- **Max unique consumers**: 1000 tracked consumers
- **Hash buckets**: 256 buckets for overflow consumers
- **Cleanup interval**: Periodic cleanup of stale entries
- **Classification**: High (>5K/hr), Medium (100-5K/hr), Low (<100/hr)

### Related Documentation

- [Performance SLA](sla.md) - SLA definitions and monitoring thresholds
- [Troubleshooting Guide](troubleshooting.md) - Common issues and resolutions

---

## Troubleshooting

### Common Monitoring Issues

#### High Memory Usage
```bash
# Check memory metrics
curl http://localhost:3000/metrics?view=infrastructure

# Analyze memory breakdown
curl http://localhost:3000/health/metrics
```

#### Telemetry Export Failures
```bash
# Check telemetry health
curl http://localhost:3000/health/telemetry

# View export statistics
curl http://localhost:3000/metrics?view=exports
```

#### Circuit Breaker Issues
```bash
# Check circuit breaker status
curl http://localhost:3000/metrics | jq '.kong.circuitBreaker'

# View circuit breaker metrics
curl http://localhost:3000/metrics?view=full | jq '.circuitBreaker'
```

#### Cache Performance Issues
```bash
# Check cache hit rates
curl http://localhost:3000/metrics | jq '.cache'

# Analyze cache tier usage
curl http://localhost:3000/metrics?view=infrastructure | jq '.cache'

# Check cache server type (redis or valkey)
curl http://localhost:3000/health | jq '.dependencies.cache.type'
```

#### Cache Tier Architecture

The service implements a two-tier caching strategy for resilience and circuit breaker support:

**Cache Tiers:**

| Tier | Key Prefix | Default TTL | Purpose |
|------|------------|-------------|---------|
| **Primary** | `auth_service:` | 5 minutes | Active cache entries for fast lookups |
| **Stale** | `auth_service_stale:` | 30 minutes | Fallback entries for circuit breaker recovery |

**TTL Configuration:**

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `CACHING_TTL_SECONDS` | 300 | Primary cache TTL in seconds |
| `STALE_DATA_TOLERANCE_MINUTES` | 30 | Stale cache TTL in minutes |

**Lifecycle Example:**

```
Time    Primary Key                          Stale Key
T+0     auth_service:consumer:abc (TTL 300s)  auth_service_stale:consumer:abc (TTL 1800s)
T+5min  EXPIRED                               auth_service_stale:consumer:abc (TTL 1500s)
T+30min EXPIRED                               EXPIRED
```

**Health Endpoint Cache Section:**

```bash
curl http://localhost:3000/health | jq '.dependencies.cache'
```

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
  "healthMonitor": { ... }
}
```

**Field Groups:**

| Group | Field | Description |
|-------|-------|-------------|
| `connection` | `connected` | Redis/Valkey connection status |
| `connection` | `responseTime` | Ping response time |
| `entries` | `primary` | Total primary cache entries |
| `entries` | `primaryActive` | Entries with TTL > 0 |
| `entries` | `stale` | Stale entries for circuit breaker fallback |
| `entries` | `staleCacheAvailable` | Whether stale fallback is available |
| `performance` | `hitRate` | Cache hit percentage |
| `performance` | `avgLatencyMs` | Average operation latency |

**Circuit Breaker Fallback:**

When Kong becomes unavailable and the circuit breaker opens:
1. Primary cache lookup fails (Kong unreachable)
2. Service falls back to stale tier (`auth_service_stale:*`)
3. Stale data served while circuit breaker recovers
4. After recovery, primary cache repopulates from Kong

#### Cache Health Monitor

The health endpoint exposes a `healthMonitor` object for cache resilience diagnostics. This is useful for SRE troubleshooting when cache health issues occur.

```bash
curl http://localhost:3000/health | jq '.dependencies.cache.healthMonitor'
```

**Response (Distributed Cache - Redis/Valkey):**
```json
{
  "status": "healthy",
  "isMonitoring": true,
  "consecutiveSuccesses": 47,
  "consecutiveFailures": 0,
  "lastStatusChange": "2026-02-21T12:00:17.489Z",
  "lastCheck": {
    "success": true,
    "timestamp": "2026-02-21T12:07:47.606Z",
    "responseTimeMs": 0.5
  }
}
```

**Response (Memory Cache):** `null` (no health monitor for in-memory cache)

**Health Monitor Fields:**

| Field | Description |
|-------|-------------|
| `status` | Health status: `healthy`, `degraded`, `unhealthy`, or `unknown` |
| `isMonitoring` | Whether the health monitor is actively running |
| `consecutiveSuccesses` | Consecutive successful PING checks (threshold: 2 for healthy) |
| `consecutiveFailures` | Consecutive failed PING checks (threshold: 3 for unhealthy) |
| `lastStatusChange` | ISO timestamp when status last transitioned |
| `lastCheck.success` | Whether the most recent PING check succeeded |
| `lastCheck.timestamp` | ISO timestamp of the last check |
| `lastCheck.responseTimeMs` | Response time of the last check |
| `lastCheck.error` | Error message (only when `success: false`) |

**Status Transitions:**

| From | To | Trigger |
|------|----|----|
| `unknown` | `healthy` | 2 consecutive successes |
| `healthy` | `degraded` | 1 failure |
| `degraded` | `healthy` | 2 consecutive successes |
| `degraded` | `unhealthy` | 3 total consecutive failures |
| `unhealthy` | `degraded` | 1 success |

#### Redis vs Valkey Detection

The service automatically detects whether Redis or Valkey is being used as the distributed cache backend. This enables accurate monitoring and server-specific optimizations.

```bash
# Health response includes server type
curl http://localhost:3000/health | jq '.dependencies.cache'
```

**Response (Redis):**
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
    "consecutiveFailures": 0,
    "lastStatusChange": "2026-02-21T12:00:17.489Z",
    "lastCheck": {
      "success": true,
      "timestamp": "2026-02-21T12:07:47.606Z",
      "responseTimeMs": 0.5
    }
  }
}
```

**Response (Valkey):**
```json
{
  "type": "valkey",
  "connection": {
    "connected": true,
    "responseTime": "0.5ms"
  },
  "entries": {
    "primary": 5,
    "primaryActive": 5,
    "stale": 8,
    "staleCacheAvailable": true
  },
  "performance": {
    "hitRate": "75.00%",
    "avgLatencyMs": 0.48
  },
  "healthMonitor": {
    "status": "healthy",
    "isMonitoring": true,
    "consecutiveSuccesses": 32,
    "consecutiveFailures": 0,
    "lastStatusChange": "2026-02-21T12:00:17.489Z",
    "lastCheck": {
      "success": true,
      "timestamp": "2026-02-21T12:07:47.606Z",
      "responseTimeMs": 0.5
    }
  }
}
```

**Response (Memory Cache):**
```json
{
  "type": "memory",
  "connection": {
    "connected": true,
    "responseTime": "0.1ms"
  },
  "entries": {
    "primary": 10,
    "primaryActive": 10,
    "stale": 10,
    "staleCacheAvailable": true
  },
  "performance": {
    "hitRate": "95.00%",
    "avgLatencyMs": 0.1
  },
  "healthMonitor": null
}
```

**Detection Mechanism:**
- Uses `INFO server` Redis command which returns server identification
- Valkey servers return `server:valkey` in the INFO response
- Redis servers return `server:redis` in the INFO response
- Falls back to `redis` if server type cannot be determined
- Memory cache does not include `serverType` field (not applicable)

**Configuration:**
```bash
# Redis (port 6379)
REDIS_URL=redis://localhost:6379
CACHING_HIGH_AVAILABILITY=true

# Valkey (port 6380)
REDIS_URL=redis://localhost:6380
CACHING_HIGH_AVAILABILITY=true
```

**Implementation:** `src/services/cache-health.service.ts` uses `UnifiedCacheManager.getServerType()` which delegates to `SharedRedisCache.getServerType()`.

### Debug Mode
Enable detailed debug logging:
```bash
LOG_LEVEL=debug TELEMETRY_MODE=both bun run dev
```

### Performance Analysis
Use the built-in profiling system for detailed performance analysis:
```bash
# Start profiling session
curl -X POST http://localhost:3000/debug/profiling/start

# Run operations to profile
curl http://localhost:3000/tokens \
  -H "X-Consumer-ID: test-consumer" \
  -H "X-Consumer-Username: test-consumer"

# Stop profiling session
curl -X POST http://localhost:3000/debug/profiling/stop
```

---

## Enhanced Memory Monitoring

### Overview

The service implements enhanced memory monitoring to address Bun v1.3.1 memory measurement issues and provide production-ready memory management.

**Problem Solved:** Bun's JavaScriptCore engine reports impossible memory ratios where `heapUsed > heapTotal`, causing false memory pressure alerts.

**Solution:** Multi-layered memory monitoring using `bun:jsc` APIs as primary source with adaptive memory management.

### Memory Endpoints

#### Memory Health
```bash
# Basic health check
curl http://localhost:3000/memory/health

# Detailed health with leak detection
curl http://localhost:3000/memory/health?details=true
```

**Response:**
```json
{
  "status": "healthy|warning|unhealthy|critical",
  "timestamp": 1729648800000,
  "memory": {
    "state": "normal",
    "heapUtilization": 0.23,
    "memoryPressure": "low",
    "reliability": 95,
    "queuedRequests": 0
  },
  "recommendations": ["Enhanced monitoring active"],
  "alerts": []
}
```

#### Memory Metrics
```bash
# Current metrics
curl http://localhost:3000/memory/metrics

# Include object type breakdown
curl http://localhost:3000/memory/metrics?objectTypes=true

# Trigger GC and measure effect
curl http://localhost:3000/memory/metrics?gc=true
```

#### Memory Actions
```bash
# Force garbage collection
curl -X POST http://localhost:3000/memory/actions?action=gc

# Clear request queue
curl -X POST http://localhost:3000/memory/actions?action=clearQueue

# Reset monitoring history
curl -X POST http://localhost:3000/memory/actions?action=reset
```

#### Memory Baseline
```bash
# Check baseline status
curl http://localhost:3000/memory/baseline?action=status

# Run baseline establishment
curl -X POST http://localhost:3000/memory/baseline?action=run

# Get full baseline report
curl http://localhost:3000/memory/baseline?action=report
```

### Memory Thresholds

| Level | Threshold | Behavior |
|-------|-----------|----------|
| **Normal** | <60% | Requests processed immediately |
| **Warning** | 60% | Enhanced monitoring |
| **High** | 75% | Periodic GC, reduced optimizations |
| **Critical** | 85% | Request queuing, aggressive GC |
| **Emergency** | 95% | Emergency protocols, low-priority request dropping |

### Memory Leak Detection

The system automatically detects several leak patterns:

1. **RSS Growth Without Heap Growth**: Indicates external memory leaks
2. **Excessive Promise Objects**: Unresolved promises accumulating
3. **Object Count Divergence**: Objects not being garbage collected
4. **Reliability Degradation**: Measurement system becoming unreliable

**Manual Investigation:**
```bash
# Get detailed metrics with object breakdown
curl http://localhost:3000/memory/metrics?objectTypes=true

# Check for specific object types
curl http://localhost:3000/memory/metrics | jq '.objectTypes[] | select(.type == "Promise")'
```

### Memory Troubleshooting

#### "heapUsed > heapTotal" Errors
**Cause:** JavaScriptCore measurement artifact during GC
**Solution:** Automatically handled by validation layer
**Action:** Monitor reliability score - should remain >70%

#### High Memory Pressure Alerts
```bash
# Check reliability
curl http://localhost:3000/memory/health?details=true

# Force GC and remeasure
curl http://localhost:3000/memory/metrics?gc=true

# Check for leaks
curl http://localhost:3000/memory/metrics | jq '.trends.memoryLeakDetection'
```

#### Emergency Memory Crisis
```bash
# 1. Check current status
curl http://localhost:3000/memory/health

# 2. Force garbage collection
curl -X POST http://localhost:3000/memory/actions?action=gc

# 3. Clear request queue
curl -X POST http://localhost:3000/memory/actions?action=clearQueue

# 4. Check for leaks
curl http://localhost:3000/memory/metrics?objectTypes=true
```

### Memory Alert Thresholds

| Level | Condition |
|-------|-----------|
| **Warning** | Reliability < 80% OR Health = warning |
| **Critical** | Reliability < 50% OR Health = critical |
| **Emergency** | Health = critical + Queue size > 100 |

### OpenTelemetry Memory Metrics

```
# Gauge metrics
bun_auth_service.process.memory.heap.size
bun_auth_service.process.memory.heap.utilization
bun_auth_service.process.memory.reliability.score

# Counter metrics
bun_auth_service.process.memory.gc.detected.total
bun_auth_service.process.memory.anomalies.detected.total
```

**Attributes:**
- `service.name`: authentication-service
- `runtime.name`: bun
- `memory.source`: jsc|process|hybrid
- `memory.pressure.level`: low|moderate|high|critical