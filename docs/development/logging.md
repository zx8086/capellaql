# Logging Guide

## 1. Architecture Overview

CapellaQL uses a 3-layer dependency-injection logging architecture. Application code never touches a concrete logger directly.

```
 Layer 3 — Application Facade
 ┌──────────────────────────────────────────────┐
 │  src/utils/logger.ts                         │
 │  Exports: log, warn, error, audit, logError  │
 │  getChildLogger                              │
 └──────────────────┬───────────────────────────┘
                    │ calls getLogger()
 Layer 2 — DI Container
 ┌──────────────────┴───────────────────────────┐
 │  src/logging/container.ts                    │
 │  LoggerContainer: lazy init, fallback chain, │
 │  setLogger() for testing, setBackend()       │
 └──────────────────┬───────────────────────────┘
                    │ resolves from LOGGING_BACKEND
 Layer 1 — Backend Adapter
 ┌──────────────────┴───────────────────────────┐
 │  src/logging/adapters/pino.adapter.ts        │
 │  (console fallback if Pino fails)            │
 └──────────────────────────────────────────────┘
```

**Why this matters:**

- **Layer 3** is the only import application code should use.
- **Layer 2** handles backend selection, lazy initialization, and provides the `setLogger()` seam for tests.
- **Layer 1** adapter implements the `ILogger` / `ITelemetryLogger` interfaces from `src/logging/ports/logger.port.ts`.

If Pino fails to load, the container automatically falls back to a structured-JSON console fallback so the application never crashes due to logging.

---

## 2. Quick Start

All application code should import from `src/utils/logger.ts`:

```typescript
import { log, warn, error, logError, audit } from "$utils/logger";

// Info-level message
log("Cache warmed", { entries: 1200 });

// Warning
warn("Rate limit approaching", { usage: 480, limit: 500 });

// Error (string message + context)
error("Query timeout", { bucket: "looks", duration_ms: 5200 });

// Error with Error object (captures name, message, stack)
logError("Connection failed", new Error("ECONNREFUSED"), {
  host: "cb.example.com",
});

// Audit event (info-level with audit=true marker)
audit("USER_LOGIN", { userId: "u-123", ip: "10.0.0.5" });
```

All functions accept an optional `Record<string, unknown>` context object that is merged into the structured log output.

---

## 3. Child Loggers

Use `getChildLogger()` to create a logger with pre-bound context fields. Every subsequent call on the child logger automatically includes those fields.

```typescript
import { getChildLogger } from "$utils/logger";

function handleGraphQLRequest(requestId: string, operation: string) {
  const reqLog = getChildLogger({ requestId, operation });

  reqLog.info("Resolver started");
  // Output includes { requestId: "abc-123", operation: "GetLooks", message: "Resolver started" }

  try {
    const result = await fetchData();
    reqLog.info("Resolver completed", { resultCount: result.length });
  } catch (err) {
    reqLog.error("Resolver failed", {
      error: { name: err.name, message: err.message },
    });
  }
}
```

Child loggers can be nested. Bindings accumulate:

```typescript
const serviceLog = getChildLogger({ service: "couchbase" });
const opLog = serviceLog.child({ bucket: "looks", scope: "inventory" });
// opLog carries: { service: "couchbase", bucket: "looks", scope: "inventory" }
```

---

## 4. Public API Reference

### `src/utils/logger.ts` (primary import for application code)

| Export | Signature | Description |
|---|---|---|
| `log` | `(message: string, context?: Record<string, unknown>) => void` | Info-level log |
| `warn` | `(message: string, context?: Record<string, unknown>) => void` | Warning-level log |
| `error` | `(message: string, context?: Record<string, unknown>) => void` | Error-level log |
| `logError` | `(message: string, err: Error, context?: Record<string, unknown>) => void` | Error-level with structured error (name, message, stack) |
| `audit` | `(eventType: string, context?: Record<string, unknown>) => void` | Info-level with `audit: true` and `event_type` markers |
| `getChildLogger` | `(bindings: Record<string, unknown>) => ILogger` | Returns child logger with pre-bound context |
| `logger` | `{ log, warn, error, audit, logError }` | Convenience object export |

### `src/telemetry/logger.ts` (backward-compatible re-export)

| Export | Signature | Description |
|---|---|---|
| `log` | `(message: string, meta?: Record<string, unknown>) => void` | Info-level log |
| `debug` | `(message: string, meta?: Record<string, unknown>) => void` | Debug-level log |
| `warn` | `(message: string, meta?: Record<string, unknown>) => void` | Warning-level log |
| `err` | `(message: string, error?: Error \| unknown, meta?: Record<string, unknown>) => void` | Error with ECS error fields (`error.type`, `error.message`, `error.stack`) |
| `error` | Alias for `err` | Same as `err` |
| `getChildLogger` | `(bindings: Record<string, unknown>) => ILogger` | Child logger with pre-bound context |
| `LogContext` | `type` | `Record<string, unknown>` |

### `src/logging/ports/logger.port.ts` (interfaces)

| Interface | Methods |
|---|---|
| `ILogger` | `debug`, `info`, `warn`, `error`, `child`, `flush`, `reinitialize` |
| `ITelemetryLogger` | Extends `ILogger` + `logHttpRequest`, `logGraphQLRequest`, `logCouchbaseOperation` |

---

## 5. Configuration

| Variable | Values | Default | Effect |
|---|---|---|---|
| `LOG_LEVEL` | `silent`, `debug`, `info`, `warn`, `error` | `info` | Minimum severity for log output. `silent` suppresses all output. |
| `LOGGING_BACKEND` | `pino` | `pino` | Selects the Layer 1 adapter. Only Pino is supported. |
| `TELEMETRY_MODE` | `console`, `otlp`, `both` | `both` | Controls where telemetry data is sent. `otlp` sends to an OTEL collector; `both` does console + OTLP. |
| `NODE_ENV` | `development`, `production`, `staging`, etc. | — | `production` or `staging` = raw NDJSON to stdout. Everything else = human-readable single-line format. |

### Log level filtering

Levels are ordered by priority. Setting `LOG_LEVEL` filters out everything below:

| `LOG_LEVEL` | `debug` | `info` | `warn` | `error` |
|---|---|---|---|---|
| `debug` | Yes | Yes | Yes | Yes |
| `info` | No | Yes | Yes | Yes |
| `warn` | No | No | Yes | Yes |
| `error` | No | No | No | Yes |
| `silent` | No | No | No | No |

### Recommended levels by environment

| Environment | `NODE_ENV` | `LOG_LEVEL` | `LOGGING_BACKEND` | `TELEMETRY_MODE` | Pino Output |
|---|---|---|---|---|---|
| Local dev | `development` | `debug` | `pino` | `console` | Single-line formatted |
| Testing | `test` | `silent` | `pino` | `console` | Suppressed |
| Staging | `staging` | `info` | `pino` | `both` | Raw NDJSON |
| Production | `production` | `warn` | `pino` | `otlp` or `both` | Raw NDJSON |

Example `.env`:

```env
LOG_LEVEL=debug
LOGGING_BACKEND=pino
TELEMETRY_MODE=both
```

---

## 6. Backends

### Pino (default)

- **File:** `src/logging/adapters/pino.adapter.ts`
- **Format:** ECS-compliant via `@elastic/ecs-pino-format` ([Elastic ECS Pino reference](https://www.elastic.co/docs/reference/ecs/logging/nodejs/pino))
- **OTEL correlation:** Automatically injects `trace.id`, `span.id`, and `transaction.id` from the active OpenTelemetry span via a pino `mixin`
- **Service identity:** `service.name`, `service.version`, `service.environment`, `event.dataset` injected via `ecsFormat()` options
- **Error serialization:** `convertErr: true` maps `err` objects to ECS `error.type`, `error.message`, `error.stack_trace`
- **HTTP serialization:** `convertReqRes: true` maps `req`/`res` to ECS `http.*`, `url.*`, `client.*`, `user_agent.*`
- **Dev output:** Golden path single-line format via custom stream (ECS boilerplate stripped for readability)
- **Production output:** Raw NDJSON to stdout with all ECS fields (for log aggregation pipelines)

> **Note:** Winston was previously available as an alternative backend but has been removed. Only Pino is supported.

---

## 6a. ECS Compliance & Dual-Mode Output

The Pino backend produces [Elastic Common Schema](https://www.elastic.co/docs/reference/ecs/logging/nodejs/pino) compliant output via `@elastic/ecs-pino-format`.

### Production output (NDJSON)

In production or staging (`NODE_ENV=production` or `NODE_ENV=staging`), Pino writes raw newline-delimited JSON to stdout. Every log line contains the full ECS field set:

```json
{
  "log.level": "info",
  "@timestamp": "2026-03-05T20:07:25.809Z",
  "process.pid": 3896,
  "host.hostname": "prod-node-1",
  "ecs.version": "8.10.0",
  "service.name": "capellaql-service",
  "service.version": "2.0",
  "service.environment": "production",
  "event.dataset": "capellaql-service",
  "trace.id": "d9eb3e1f772bf653aeba82b071461780",
  "span.id": "bddbeaf0dc1e6670",
  "transaction.id": "d9eb3e1f772bf653aeba82b071461780",
  "component": "couchbase",
  "operation": "connect",
  "message": "Couchbase connection attempt"
}
```

This format is directly ingestible by Elasticsearch, Kibana, Datadog, and any OTLP-compliant platform.

### Development output (golden path)

In development (`NODE_ENV` is neither `production` nor `staging`), a custom stream reformats the JSON into a clean single-line format with colored level names. ECS infrastructure fields are stripped for readability; domain-relevant fields (including trace context) are preserved:

```
8:51:56 PM info: Couchbase connection attempt {"component":"couchbase","operation":"connect","trace.id":"d9eb..."}
```

Level colors: trace=gray, debug=cyan, info=green, warn=yellow, error=red, fatal=magenta.

The underlying pino formatter still produces full ECS JSON — the dev stream just re-presents it.

### ECS field mapping

| ECS Field | Source | Dev Output | Prod Output |
|---|---|---|---|
| `@timestamp` | `ecsFormat()` | In timestamp prefix | ✅ |
| `log.level` | `ecsFormat()` | In level prefix | ✅ |
| `message` | `ecsFormat()` | In message body | ✅ |
| `process.pid` | `ecsFormat()` | Hidden | ✅ |
| `host.hostname` | `ecsFormat()` | Hidden | ✅ |
| `ecs.version` | `ecsFormat()` | Hidden | ✅ |
| `service.name` | `ecsFormat({ serviceName })` | Hidden | ✅ |
| `service.version` | `ecsFormat({ serviceVersion })` | Hidden | ✅ |
| `service.environment` | `ecsFormat({ serviceEnvironment })` | Hidden | ✅ |
| `event.dataset` | `ecsFormat()` (auto from serviceName) | Hidden | ✅ |
| `trace.id` | Pino mixin (OTEL active span) | ✅ | ✅ |
| `span.id` | Pino mixin (OTEL active span) | ✅ | ✅ |
| `transaction.id` | Pino mixin (OTEL active span) | ✅ | ✅ |
| `error.type` | `convertErr: true` | ✅ | ✅ |
| `error.message` | `convertErr: true` | ✅ | ✅ |
| `error.stack_trace` | `convertErr: true` | ✅ | ✅ |
| `http.*`, `url.*` | `convertReqRes: true` | ✅ | ✅ |

### Configuration for ECS service identity

Service identity fields are resolved from environment variables or defaults:

| ECS Field | Env Var | Default |
|---|---|---|
| `service.name` | `OTEL_SERVICE_NAME` | `"capellaql-service"` |
| `service.version` | `OTEL_SERVICE_VERSION` | `"2.0"` |
| `service.environment` | `NODE_ENV` | `"development"` |

### Trace correlation

Trace fields are injected automatically when an OpenTelemetry span is active. No manual configuration is needed — the Pino mixin reads from `@opentelemetry/api`:

```typescript
// This happens automatically in every log call:
mixin() {
  const span = trace.getSpan(context.active());
  if (span) {
    return {
      "trace.id": span.spanContext().traceId,
      "span.id": span.spanContext().spanId,
      "transaction.id": span.spanContext().traceId,
    };
  }
  return {};
}
```

> **Note:** We set `apmIntegration: false` in `ecsFormat()` because we use the OpenTelemetry API for trace injection, not the Elastic APM agent. The mixin approach works with any OTEL-compatible collector.

### OTLP log delivery

**All log records are sent to the Elastic backend via OTLP** using `@opentelemetry/instrumentation-pino` (auto-instrumentation), which patches `pino()` to add an `OTelPinoStream` via `pino.multistream()`. Every log record is teed to both stdout and the global `LoggerProvider` -> `BatchLogRecordProcessor` -> `OTLPLogExporter`.

Data flow:

```
pino.info("message", { key: "value" })
  |
  +---> Original destination (stdout)
  |       production/staging: raw ECS NDJSON
  |       development: single-line formatted
  |
  +---> OTelPinoStream (injected by PinoInstrumentation)
          |
          +---> Global LoggerProvider
                  |
                  +---> BatchLogRecordProcessor
                          |
                          +---> OTLPLogExporter ---> Elastic / collector
```

Console output and OTLP export are independent — OTLP failures do not affect console logging.

The OTLP log pipeline is set up in `src/telemetry/instrumentation.ts`:
1. `OTLPLogExporter` → `BatchLogRecordProcessor` → `LoggerProvider` (registered globally via `logs.setGlobalLoggerProvider()`)
2. `sdk.start()` activates auto-instrumentations, including `PinoInstrumentation` which patches `pino()`
3. When `PinoAdapter` creates its logger (lazy, on first use), pino is already patched — the `OTelPinoStream` is automatically attached

**PinoInstrumentation configuration** (in `src/telemetry/instrumentation.ts`):

| Setting | Value | Reason |
|---|---|---|
| `disableLogCorrelation` | `true` | Our Pino mixin already injects ECS-compliant `trace.id`, `span.id`, `transaction.id`. The instrumentation's default `trace_id`/`span_id` (underscore format) would conflict. |
| `disableLogSending` | `false` | Keeps `OTelPinoStream` active — this is the OTLP delivery path for Pino logs. |

### Error serialization

Pass errors via the `err` key to get ECS-compliant error fields:

```typescript
// Via pino directly (in adapter code):
logger.error({ err: new Error("timeout") }, "Query failed");
// Produces: { "error": { "type": "Error", "message": "timeout", "stack_trace": "..." } }

// Via application facade (err/logError handle this automatically):
import { logError } from "$utils/logger";
logError("Query failed", new Error("timeout"), { bucket: "looks" });
```

---

## 7. TelemetryEmitter vs `log()`

The `TelemetryEmitter` (`src/telemetry/telemetry-emitter.ts`) performs dual emission: it writes a span event to the active OTEL trace **and** emits a log via the DI container logger. Use it for operational events that should be correlated with traces.

| Criteria | `log()` / `warn()` / `error()` | `telemetryEmitter` |
|---|---|---|
| **Purpose** | General application messages | Operational events tied to traces |
| **Span event** | No | Yes (always attached to active span) |
| **Filtered by LOG_LEVEL** | Yes | Yes (log portion); span events are always captured |
| **Requires SpanEventName** | No | Yes (type-safe constant) |
| **Duration tracking** | Manual | Built-in via `timed()` / `timedWithLevel()` |
| **Import** | `$utils/logger` | `src/telemetry/telemetry-emitter.ts` |

### Examples

**General logging (use `log()`):**

```typescript
import { log } from "$utils/logger";

log("Config loaded", { backend: "pino", level: "info" });
```

**Operational event with span correlation (use `telemetryEmitter`):**

```typescript
import { telemetryEmitter } from "../telemetry/telemetry-emitter";
import { SpanEvents } from "../telemetry/span-event-names";

// Simple event
telemetryEmitter.info(
  SpanEvents.CACHE_HIT,
  "Cache hit for query",
  { key: "getLooks:abc", ttl_remaining: 45 }
);

// Timed event (auto-calculates duration)
const start = performance.now();
const result = await collection.get(docId);
telemetryEmitter.timed(
  SpanEvents.COUCHBASE_KV_COMPLETED,
  "KV get completed",
  start,
  { bucket: "looks", docId }
);
```

### TelemetryEmitter methods

| Method | Signature | Notes |
|---|---|---|
| `info` | `(event, message, attributes?)` | Info-level dual emit |
| `debug` | `(event, message, attributes?)` | Debug-level dual emit |
| `warn` | `(event, message, attributes?)` | Warn-level dual emit |
| `error` | `(event, message, attributes?)` | Error-level dual emit |
| `timed` | `(event, message, startTime, attributes?)` | Info-level with auto duration |
| `timedWithLevel` | `(event, message, level, startTime, attributes?)` | Custom level with auto duration |
| `emit` | `(EmitOptions)` | Full control: `{ event, message, level, attributes?, startTime? }` |

---

## 8. SpanEvents

**File:** `src/telemetry/span-event-names.ts`

Type-safe constants for all operational span events, organized into 10 categories. Always use these constants instead of raw strings.

```typescript
import { SpanEvents } from "../telemetry/span-event-names";
import type { SpanEventName } from "../telemetry/span-event-names";
```

| Category | Example Constants | Count |
|---|---|---|
| **circuit_breaker** | `CIRCUIT_BREAKER_STATE_OPEN`, `CIRCUIT_BREAKER_FALLBACK_USED`, `CIRCUIT_BREAKER_THRESHOLD_REACHED` | 9 |
| **cache** | `CACHE_HIT`, `CACHE_MISS`, `CACHE_SET`, `CACHE_EVICTION`, `CACHE_ERROR` | 8 |
| **couchbase** | `COUCHBASE_QUERY_STARTED`, `COUCHBASE_QUERY_SLOW`, `COUCHBASE_KV_COMPLETED`, `COUCHBASE_TRANSACTION_AMBIGUOUS` | 13 |
| **graphql** | `GRAPHQL_REQUEST_STARTED`, `GRAPHQL_REQUEST_COMPLETED`, `GRAPHQL_DEPTH_LIMIT_EXCEEDED`, `GRAPHQL_CACHE_HIT` | 6 |
| **http** | `HTTP_REQUEST_STARTED`, `HTTP_REQUEST_COMPLETED`, `HTTP_REQUEST_FAILED` | 3 |
| **health** | `HEALTH_CHECK_SUCCESS`, `HEALTH_CHECK_DEGRADED`, `HEALTH_CHECK_FAILED` | 3 |
| **lifecycle** | `LIFECYCLE_STARTUP_INITIATED`, `LIFECYCLE_SHUTDOWN_INITIATED`, `LIFECYCLE_DRAIN_STARTED` | 7 |
| **dataloader** | `DATALOADER_BATCH_STARTED`, `DATALOADER_BATCH_COMPLETED`, `DATALOADER_CACHE_HIT` | 4 |
| **rate_limit** | `RATE_LIMIT_EXCEEDED`, `RATE_LIMIT_NEAR_THRESHOLD` | 2 |
| **websocket** | `WEBSOCKET_CONNECTION_OPENED`, `WEBSOCKET_CONNECTION_CLOSED`, `WEBSOCKET_ERROR` | 4 |

The `SpanEventName` type is a union of all constant values, providing compile-time safety when passing events to `telemetryEmitter`.

---

## 9. Critical Lifecycle Logging

**File:** `src/logging/critical-lifecycle.ts`

These functions bypass `LOG_LEVEL` entirely and write directly to `console.log` / `console.error`. They exist for a single purpose: ensuring startup and shutdown messages are always visible regardless of log configuration.

**When to use:** Service startup and shutdown sequences only. Do not use for general application logging.

| Function | Output | Purpose |
|---|---|---|
| `logServiceStartup(port, environment)` | stdout | Service is starting (includes pid, version, runtime) |
| `logServiceReady(port)` | stdout | Service is listening and ready |
| `logServiceShutdownInitiated(signal)` | stdout | Shutdown signal received (includes uptime) |
| `logServiceShutdownCompleted()` | stdout | Clean shutdown finished |
| `logServiceShutdownError(error)` | stderr | Error during shutdown (includes truncated stack) |
| `criticalLifecycleLog(message, context?)` | stdout | Generic critical info |
| `criticalLifecycleWarn(message, context?)` | stderr | Generic critical warning |
| `criticalLifecycleError(message, context?)` | stderr | Generic critical error |

Output format: `HH:MM:SS AM/PM level: message {context}`

```typescript
import { logServiceStartup, logServiceReady } from "../logging/critical-lifecycle";

logServiceStartup(4000, "production");
// 2:30:15 PM info: Service starting {"port":4000,"environment":"production","pid":12345,...}

logServiceReady(4000);
// 2:30:16 PM info: Service ready on port 4000 {"port":4000,"pid":12345}
```

---

## 10. Testing

### Injecting a mock logger

Use `loggerContainer.setLogger()` to replace the real logger with a mock during tests:

```typescript
import { describe, test, expect, beforeEach } from "bun:test";
import { loggerContainer } from "../../src/logging/container";
import type { ILogger, LogContext } from "../../src/logging/ports/logger.port";

function createMockLogger() {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  const mock: ILogger = {
    debug(msg: string, ctx?: LogContext) { calls.push({ method: "debug", args: [msg, ctx] }); },
    info(msg: string, ctx?: LogContext) { calls.push({ method: "info", args: [msg, ctx] }); },
    warn(msg: string, ctx?: LogContext) { calls.push({ method: "warn", args: [msg, ctx] }); },
    error(msg: string, ctx?: LogContext) { calls.push({ method: "error", args: [msg, ctx] }); },
    child(_bindings: LogContext) { return mock; },
    flush() { return Promise.resolve(); },
    reinitialize() {},
  };

  return { mock, calls };
}

describe("MyFeature", () => {
  beforeEach(() => {
    loggerContainer.reset(); // clear any previous state
  });

  test("logs a warning when threshold exceeded", () => {
    const { mock, calls } = createMockLogger();
    loggerContainer.setLogger(mock);

    // ... invoke the code under test ...

    const warnings = calls.filter(c => c.method === "warn");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].args[0]).toContain("threshold");
  });
});
```

### Suppressing log output in tests

Set `LOG_LEVEL=silent` before running tests to prevent log noise:

```bash
LOG_LEVEL=silent bun test
```

Or set it in your test setup:

```typescript
process.env.LOG_LEVEL = "silent";
```

### Resetting the container

Always call `loggerContainer.reset()` in `beforeEach` to ensure tests are isolated. This clears the cached logger and backend selection, so the next `getLogger()` call re-resolves from the environment (or from a freshly injected mock).

### Key files

- Mock pattern reference: `tests/bun/unit/logging/logger-port.test.ts`
- ILogger interface: `src/logging/ports/logger.port.ts`
- Container with `setLogger()` / `reset()`: `src/logging/container.ts`
