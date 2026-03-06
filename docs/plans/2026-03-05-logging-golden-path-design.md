# Design: Golden Path Logging Architecture

**Date**: 2026-03-05
**Status**: Approved
**Scope**: Full golden path adoption — 3-layer DI architecture, Pino default backend, TelemetryEmitter, SpanEvents, critical lifecycle logging

---

## Problem

CapellaQL's logging is functional but structurally flat. Winston is hardcoded as the only backend, there's no dependency injection, no child logger support, and no way to swap backends. The golden path authentication service defines a 3-layer logging architecture with DI, dual backends, and advanced features (TelemetryEmitter, SpanEvents, critical lifecycle logging) that CapellaQL should adopt.

## Architecture

3-layer architecture adapted from the golden path:

```
Layer 3: Application Code
  src/utils/logger.ts              log(), warn(), error(), audit(), logError()

Layer 2: DI Container
  src/logging/container.ts         Backend selection (Pino or Winston)
  src/logging/ports/logger.port.ts ILogger / ITelemetryLogger interfaces

Layer 1: Backend Adapters
  src/logging/adapters/pino.adapter.ts      Default, ECS-compliant Pino
  src/logging/adapters/winston.adapter.ts   Wraps existing WinstonTelemetryLogger
```

### Fallback Chain

1. **Logging container** (Pino or Winston via `LOGGING_BACKEND`)
2. **Legacy Winston** (`src/telemetry/winston-logger.ts` direct import)
3. **Console JSON** (structured JSON to stdout/stderr — guaranteed output)

### Domain-Specific ITelemetryLogger Methods

| Auth Service (removed) | CapellaQL (added) |
|---|---|
| `logAuthenticationEvent()` | `logGraphQLRequest(operation, duration, success, context?)` |
| `logKongOperation()` | `logCouchbaseOperation(operation, responseTime, success, context?)` |
| `logHttpRequest()` | `logHttpRequest()` (kept as-is) |

---

## New Components

### ILogger Interface (`src/logging/ports/logger.port.ts`)

```typescript
interface ILogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(bindings: LogContext): ILogger;
  flush(): Promise<void>;
  reinitialize(): void;
}

interface ITelemetryLogger extends ILogger {
  logHttpRequest(method, path, statusCode, duration, context?): void;
  logGraphQLRequest(operation, duration, success, context?): void;
  logCouchbaseOperation(operation, responseTime, success, context?): void;
}
```

### DI Container (`src/logging/container.ts`)

- Resolves `LOGGING_BACKEND` env var (`pino` | `winston`, default: `pino`)
- Exposes `getLogger()`, `getChildLogger(bindings)`, `loggerContainer.setLogger()` (testing), `loggerContainer.reset()`

### Pino Adapter (`src/logging/adapters/pino.adapter.ts`)

- `@elastic/ecs-pino-format` for ECS compliance
- Automatic trace context injection (`trace.id`, `span.id`)
- Sync stdout with clean console format matching current Winston output
- OTLP export via global `LoggerProvider` (fire-and-forget)
- Child logger support via `pino.child()`

### Winston Adapter (`src/logging/adapters/winston.adapter.ts`)

- Wraps existing `WinstonTelemetryLogger` class
- Implements `ITelemetryLogger` as drop-in alternative
- No new Winston code

### TelemetryEmitter (`src/telemetry/telemetry-emitter.ts`)

- Dual emission: OpenTelemetry span events (always captured) + logs (filtered by LOG_LEVEL)
- API: `emit()`, `info()`, `debug()`, `warn()`, `error()`, `timed()`, `timedWithLevel()`

### SpanEvents Constants (`src/telemetry/span-event-names.ts`)

Type-safe constants for CapellaQL domains:

| Category | Examples |
|---|---|
| Circuit Breaker | `circuit_breaker.state.open`, `circuit_breaker.fallback.used` |
| Cache (SQLite) | `cache.hit`, `cache.miss`, `cache.set`, `cache.eviction` |
| Couchbase | `couchbase.query.started`, `couchbase.query.completed` |
| GraphQL | `graphql.request.started`, `graphql.request.completed` |
| HTTP | `http.request.started`, `http.request.completed` |
| Health Check | `health.check.success`, `health.check.degraded` |
| Lifecycle | `lifecycle.state.changed`, `lifecycle.shutdown.initiated` |
| DataLoader | `dataloader.batch.started`, `dataloader.batch.completed` |

### Critical Lifecycle Logging (`src/logging/critical-lifecycle.ts`)

- `logServiceStartup()`, `logServiceReady()`, `logServiceShutdownInitiated()`, `logServiceShutdownCompleted()`, `logServiceShutdownError()`
- Writes directly to stdout/stderr, bypasses LOG_LEVEL

### Config Changes

| Variable | Values | Default |
|---|---|---|
| `LOGGING_BACKEND` | `pino`, `winston` | `pino` |
| `TELEMETRY_MODE` | `console`, `otlp`, `both` | `both` |

---

## Migration Strategy

### Import Path Impact

| Current Pattern | Count | Migration | Breaking? |
|---|---|---|---|
| `../telemetry/logger` | 27 | No change — re-export from container | No |
| `../../telemetry` (barrel) | 12 | No change — barrel re-exports from container | No |
| `./winston-logger` (telemetry internals) | 11 | Migrate to `../logging/container` | Minimal |
| `$utils/logger` | 0 | Already unused | N/A |

39 of 50 files need zero import changes.

### Phased Rollout

1. Create `src/logging/` (ports, container, adapters) — no existing code touched
2. Rewire `src/telemetry/logger.ts` and `src/utils/logger.ts` to use container
3. Migrate 11 telemetry-internal files from `./winston-logger` to container
4. Add TelemetryEmitter, SpanEvents, critical lifecycle logging
5. Add config vars, update docs
6. Write logging guide (`docs/development/logging.md`)

### New Dependencies

| Package | Purpose |
|---|---|
| `pino` | Core Pino logger |
| `@elastic/ecs-pino-format` | ECS formatting |
| `pino-pretty` (devDep) | Development pretty printing |

### Circular Dependency Prevention

- `src/logging/` has zero dependencies on `src/telemetry/`
- Only `winston.adapter.ts` imports from `src/telemetry/winston-logger.ts`
- Telemetry files import from `src/logging/container` (one-way)
- OTLP transport uses global `LoggerProvider` (no import needed)

### Startup Timing

- Before telemetry init: console-only output
- After telemetry init: `getLogger().reinitialize()` adds OTLP transport
- Config files: keep `console.*` with annotation comments

---

## Testing

- Unit tests: each adapter tested via `loggerContainer.setLogger(mockLogger)`
- Integration test: Pino ECS output matches Winston ECS output
- Suppression: `LOG_LEVEL=silent` in test preload
- Mock injection: `loggerContainer.setLogger(mock)` / `loggerContainer.reset()`

---

## File Tree

```
src/logging/                          # NEW
├── ports/
│   └── logger.port.ts
├── adapters/
│   ├── pino.adapter.ts
│   └── winston.adapter.ts
├── container.ts
└── critical-lifecycle.ts

src/telemetry/
├── telemetry-emitter.ts             # NEW
├── span-event-names.ts              # NEW
├── winston-logger.ts                # UNCHANGED
├── logger.ts                        # MODIFIED - re-export from container
├── lifecycle-logger.ts              # MODIFIED
└── index.ts                         # MODIFIED

src/utils/
└── logger.ts                        # MODIFIED - thin facade over container

src/config/
├── defaults.ts                      # MODIFIED
├── envMapping.ts                    # MODIFIED
└── schemas.ts                       # MODIFIED

docs/development/
└── logging.md                       # NEW
```

**6 new files, 7 modified, 39 untouched, 11 telemetry-internal migrated, 3 new packages.**
