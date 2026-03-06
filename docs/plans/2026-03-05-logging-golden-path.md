# Golden Path Logging Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the golden path 3-layer logging architecture with Pino as default backend, DI container, TelemetryEmitter, SpanEvents, and critical lifecycle logging.

**Architecture:** 3-layer DI pattern — application code imports from `src/utils/logger.ts` (Layer 3), which delegates to a DI container (Layer 2) that resolves to Pino (default) or Winston (legacy) backend adapters (Layer 1). TelemetryEmitter provides dual span-event + log emission for operational data.

**Tech Stack:** Pino + `@elastic/ecs-pino-format`, Winston (existing), OpenTelemetry API, Zod v4, Bun runtime

**Linear Issue:** SIO-458

---

## Phase 1: Foundation — ILogger Interface & DI Container

### Task 1: Install new dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install pino and ECS format packages**

Run:
```bash
bun add pino @elastic/ecs-pino-format
bun add -d pino-pretty
```

**Step 2: Verify installation**

Run: `bun run typecheck 2>&1 | head -5`
Expected: No new errors from pino packages

**Step 3: Commit**

```bash
git add package.json bun.lockb
git commit -m "chore(deps): add pino, @elastic/ecs-pino-format, pino-pretty

SIO-458"
```

---

### Task 2: Create ILogger and ITelemetryLogger interfaces

**Files:**
- Create: `src/logging/ports/logger.port.ts`
- Test: `tests/bun/unit/logging/logger-port.test.ts`

**Step 1: Write the failing test**

```typescript
/* tests/bun/unit/logging/logger-port.test.ts */
import { describe, expect, test } from "bun:test";
import type { ILogger, ITelemetryLogger, LogContext } from "../../../../src/logging/ports/logger.port";

describe("ILogger interface", () => {
  test("mock logger satisfies ILogger interface", () => {
    const mockLogger: ILogger = {
      debug: (_msg: string, _ctx?: LogContext) => {},
      info: (_msg: string, _ctx?: LogContext) => {},
      warn: (_msg: string, _ctx?: LogContext) => {},
      error: (_msg: string, _ctx?: LogContext) => {},
      child: (_bindings: LogContext) => mockLogger,
      flush: () => Promise.resolve(),
      reinitialize: () => {},
    };
    expect(mockLogger).toBeDefined();
    expect(mockLogger.child({ requestId: "test" })).toBeDefined();
  });

  test("mock logger satisfies ITelemetryLogger interface", () => {
    const mockTelemetryLogger: ITelemetryLogger = {
      debug: (_msg: string, _ctx?: LogContext) => {},
      info: (_msg: string, _ctx?: LogContext) => {},
      warn: (_msg: string, _ctx?: LogContext) => {},
      error: (_msg: string, _ctx?: LogContext) => {},
      child: (_bindings: LogContext) => mockTelemetryLogger,
      flush: () => Promise.resolve(),
      reinitialize: () => {},
      logHttpRequest: () => {},
      logGraphQLRequest: () => {},
      logCouchbaseOperation: () => {},
    };
    expect(mockTelemetryLogger.logHttpRequest).toBeDefined();
    expect(mockTelemetryLogger.logGraphQLRequest).toBeDefined();
    expect(mockTelemetryLogger.logCouchbaseOperation).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/bun/unit/logging/logger-port.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
/* src/logging/ports/logger.port.ts */

/**
 * Context fields for structured logging.
 * All fields are optional and merged into log output.
 */
export type LogContext = Record<string, unknown>;

/**
 * Core logger interface. All backends implement this.
 * Per golden path: identical to auth service ILogger.
 */
export interface ILogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(bindings: LogContext): ILogger;
  flush(): Promise<void>;
  reinitialize(): void;
}

/**
 * Extended logger with domain-specific methods.
 * Adapted from auth service: replaced logAuthenticationEvent/logKongOperation
 * with logGraphQLRequest/logCouchbaseOperation for CapellaQL domain.
 */
export interface ITelemetryLogger extends ILogger {
  logHttpRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    context?: LogContext,
  ): void;
  logGraphQLRequest(
    operation: string,
    duration: number,
    success: boolean,
    context?: LogContext,
  ): void;
  logCouchbaseOperation(
    operation: string,
    responseTime: number,
    success: boolean,
    context?: LogContext,
  ): void;
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/bun/unit/logging/logger-port.test.ts`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add src/logging/ports/logger.port.ts tests/bun/unit/logging/logger-port.test.ts
git commit -m "feat(logging): add ILogger and ITelemetryLogger interfaces

Per golden path: ILogger with child(), flush(), reinitialize().
ITelemetryLogger adds logHttpRequest, logGraphQLRequest, logCouchbaseOperation.

SIO-458"
```

---

### Task 3: Create Pino adapter

**Files:**
- Create: `src/logging/adapters/pino.adapter.ts`
- Test: `tests/bun/unit/logging/pino-adapter.test.ts`

**Step 1: Write the failing test**

```typescript
/* tests/bun/unit/logging/pino-adapter.test.ts */
import { describe, expect, test, beforeEach, mock } from "bun:test";
import type { ILogger, ITelemetryLogger } from "../../../../src/logging/ports/logger.port";

describe("PinoAdapter", () => {
  let adapter: ITelemetryLogger;

  beforeEach(async () => {
    const { PinoAdapter } = await import("../../../../src/logging/adapters/pino.adapter");
    adapter = new PinoAdapter();
  });

  test("implements ILogger interface", () => {
    expect(typeof adapter.debug).toBe("function");
    expect(typeof adapter.info).toBe("function");
    expect(typeof adapter.warn).toBe("function");
    expect(typeof adapter.error).toBe("function");
    expect(typeof adapter.child).toBe("function");
    expect(typeof adapter.flush).toBe("function");
    expect(typeof adapter.reinitialize).toBe("function");
  });

  test("implements ITelemetryLogger interface", () => {
    expect(typeof adapter.logHttpRequest).toBe("function");
    expect(typeof adapter.logGraphQLRequest).toBe("function");
    expect(typeof adapter.logCouchbaseOperation).toBe("function");
  });

  test("child() returns a new ILogger with bound context", () => {
    const child = adapter.child({ requestId: "req-123" });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe("function");
    // Child should be a different instance
    expect(child).not.toBe(adapter);
  });

  test("info() does not throw", () => {
    expect(() => adapter.info("test message", { key: "value" })).not.toThrow();
  });

  test("error() does not throw", () => {
    expect(() => adapter.error("error message", { error: "details" })).not.toThrow();
  });

  test("flush() resolves", async () => {
    await expect(adapter.flush()).resolves.toBeUndefined();
  });

  test("logHttpRequest() does not throw", () => {
    expect(() => adapter.logHttpRequest("GET", "/health", 200, 15)).not.toThrow();
  });

  test("logGraphQLRequest() does not throw", () => {
    expect(() => adapter.logGraphQLRequest("looksSummary", 42, true)).not.toThrow();
  });

  test("logCouchbaseOperation() does not throw", () => {
    expect(() => adapter.logCouchbaseOperation("get", 5, true)).not.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/bun/unit/logging/pino-adapter.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
/* src/logging/adapters/pino.adapter.ts */

import pino from "pino";
import ecsFormat from "@elastic/ecs-pino-format";
import { context, trace } from "@opentelemetry/api";
import type { ILogger, ITelemetryLogger, LogContext } from "../ports/logger.port";

/**
 * Pino-based logger adapter. Default backend per golden path.
 * 5-10x faster than Winston, ECS-compliant via @elastic/ecs-pino-format.
 */
export class PinoAdapter implements ITelemetryLogger {
  private logger: pino.Logger;

  constructor(level?: string) {
    const configuredLevel = level || process.env.LOG_LEVEL || "info";

    this.logger = pino({
      level: configuredLevel,
      ...ecsFormat(),
      // Merge trace context into every log entry
      mixin: () => this.getTraceContext(),
      // Clean console format for development readability
      transport:
        process.env.NODE_ENV !== "production"
          ? {
              target: "pino-pretty",
              options: {
                colorize: true,
                translateTime: "SYS:h:MM:ss TT",
                ignore: "pid,hostname,ecs.version,@timestamp",
                messageFormat: "{msg}",
              },
            }
          : undefined,
    });
  }

  debug(message: string, ctx?: LogContext): void {
    this.logger.debug(ctx ?? {}, message);
  }

  info(message: string, ctx?: LogContext): void {
    this.logger.info(ctx ?? {}, message);
  }

  warn(message: string, ctx?: LogContext): void {
    this.logger.warn(ctx ?? {}, message);
  }

  error(message: string, ctx?: LogContext): void {
    this.logger.error(ctx ?? {}, message);
  }

  child(bindings: LogContext): ILogger {
    const childPino = this.logger.child(bindings);
    const childAdapter = Object.create(this) as PinoAdapter;
    childAdapter.logger = childPino;
    return childAdapter;
  }

  async flush(): Promise<void> {
    this.logger.flush();
  }

  reinitialize(): void {
    // OTLP transport uses global LoggerProvider — no action needed.
    // Pino streams are set at construction time.
  }

  logHttpRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    ctx?: LogContext,
  ): void {
    this.logger.info(
      {
        http: { request: { method }, response: { status_code: statusCode } },
        url: { path },
        "event.duration": duration * 1_000_000, // ms -> ns per ECS
        ...ctx,
      },
      `${method} ${path} ${statusCode} ${duration}ms`,
    );
  }

  logGraphQLRequest(
    operation: string,
    duration: number,
    success: boolean,
    ctx?: LogContext,
  ): void {
    this.logger.info(
      {
        graphql: { operation },
        "event.duration": duration * 1_000_000,
        "event.outcome": success ? "success" : "failure",
        ...ctx,
      },
      `GraphQL ${operation} ${success ? "OK" : "FAIL"} ${duration}ms`,
    );
  }

  logCouchbaseOperation(
    operation: string,
    responseTime: number,
    success: boolean,
    ctx?: LogContext,
  ): void {
    this.logger.info(
      {
        db: { operation, system: "couchbase" },
        "event.duration": responseTime * 1_000_000,
        "event.outcome": success ? "success" : "failure",
        ...ctx,
      },
      `Couchbase ${operation} ${success ? "OK" : "FAIL"} ${responseTime}ms`,
    );
  }

  private getTraceContext(): Record<string, string> {
    try {
      const span = trace.getSpan(context.active());
      const spanContext = span?.spanContext();
      if (spanContext) {
        return {
          "trace.id": spanContext.traceId,
          "span.id": spanContext.spanId,
        };
      }
    } catch {
      // No active span — fine
    }
    return {};
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/bun/unit/logging/pino-adapter.test.ts`
Expected: PASS (9 tests)

**Step 5: Commit**

```bash
git add src/logging/adapters/pino.adapter.ts tests/bun/unit/logging/pino-adapter.test.ts
git commit -m "feat(logging): add Pino adapter with ECS format and trace context

Default backend per golden path. @elastic/ecs-pino-format for ECS compliance,
automatic trace.id/span.id injection, pino-pretty for dev, child logger support.

SIO-458"
```

---

### Task 4: Create Winston adapter

**Files:**
- Create: `src/logging/adapters/winston.adapter.ts`
- Test: `tests/bun/unit/logging/winston-adapter.test.ts`

**Step 1: Write the failing test**

```typescript
/* tests/bun/unit/logging/winston-adapter.test.ts */
import { describe, expect, test, beforeEach } from "bun:test";
import type { ITelemetryLogger } from "../../../../src/logging/ports/logger.port";

describe("WinstonAdapter", () => {
  let adapter: ITelemetryLogger;

  beforeEach(async () => {
    const { WinstonAdapter } = await import("../../../../src/logging/adapters/winston.adapter");
    adapter = new WinstonAdapter();
  });

  test("implements ILogger interface", () => {
    expect(typeof adapter.debug).toBe("function");
    expect(typeof adapter.info).toBe("function");
    expect(typeof adapter.warn).toBe("function");
    expect(typeof adapter.error).toBe("function");
    expect(typeof adapter.child).toBe("function");
    expect(typeof adapter.flush).toBe("function");
    expect(typeof adapter.reinitialize).toBe("function");
  });

  test("implements ITelemetryLogger interface", () => {
    expect(typeof adapter.logHttpRequest).toBe("function");
    expect(typeof adapter.logGraphQLRequest).toBe("function");
    expect(typeof adapter.logCouchbaseOperation).toBe("function");
  });

  test("child() returns a new ILogger", () => {
    const child = adapter.child({ requestId: "req-456" });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe("function");
  });

  test("info() does not throw", () => {
    expect(() => adapter.info("test message")).not.toThrow();
  });

  test("flush() resolves", async () => {
    await expect(adapter.flush()).resolves.toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/bun/unit/logging/winston-adapter.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
/* src/logging/adapters/winston.adapter.ts */

import type { ILogger, ITelemetryLogger, LogContext } from "../ports/logger.port";
import { winstonTelemetryLogger } from "../../telemetry/winston-logger";

/**
 * Winston adapter wrapping the existing WinstonTelemetryLogger.
 * Legacy backend per golden path — kept for backward compatibility.
 * No new Winston code; just adapts the existing class to ILogger/ITelemetryLogger.
 */
export class WinstonAdapter implements ITelemetryLogger {
  private boundContext: LogContext;

  constructor(boundContext: LogContext = {}) {
    this.boundContext = boundContext;
  }

  private mergeContext(ctx?: LogContext): Record<string, unknown> {
    return { ...this.boundContext, ...ctx };
  }

  debug(message: string, ctx?: LogContext): void {
    winstonTelemetryLogger.debug(message, this.mergeContext(ctx));
  }

  info(message: string, ctx?: LogContext): void {
    winstonTelemetryLogger.info(message, this.mergeContext(ctx));
  }

  warn(message: string, ctx?: LogContext): void {
    winstonTelemetryLogger.warn(message, this.mergeContext(ctx));
  }

  error(message: string, ctx?: LogContext): void {
    winstonTelemetryLogger.error(message, undefined, this.mergeContext(ctx));
  }

  child(bindings: LogContext): ILogger {
    return new WinstonAdapter({ ...this.boundContext, ...bindings });
  }

  async flush(): Promise<void> {
    // Winston flushes synchronously via its transports
  }

  reinitialize(): void {
    winstonTelemetryLogger.reinitialize();
  }

  logHttpRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    ctx?: LogContext,
  ): void {
    winstonTelemetryLogger.info(`${method} ${path} ${statusCode} ${duration}ms`, {
      "http.request.method": method,
      "url.path": path,
      "http.response.status_code": statusCode,
      "event.duration": duration * 1_000_000,
      ...this.mergeContext(ctx),
    });
  }

  logGraphQLRequest(
    operation: string,
    duration: number,
    success: boolean,
    ctx?: LogContext,
  ): void {
    winstonTelemetryLogger.info(
      `GraphQL ${operation} ${success ? "OK" : "FAIL"} ${duration}ms`,
      {
        "graphql.operation": operation,
        "event.duration": duration * 1_000_000,
        "event.outcome": success ? "success" : "failure",
        ...this.mergeContext(ctx),
      },
    );
  }

  logCouchbaseOperation(
    operation: string,
    responseTime: number,
    success: boolean,
    ctx?: LogContext,
  ): void {
    winstonTelemetryLogger.info(
      `Couchbase ${operation} ${success ? "OK" : "FAIL"} ${responseTime}ms`,
      {
        "db.operation": operation,
        "db.system": "couchbase",
        "event.duration": responseTime * 1_000_000,
        "event.outcome": success ? "success" : "failure",
        ...this.mergeContext(ctx),
      },
    );
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/bun/unit/logging/winston-adapter.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add src/logging/adapters/winston.adapter.ts tests/bun/unit/logging/winston-adapter.test.ts
git commit -m "feat(logging): add Winston adapter wrapping existing WinstonTelemetryLogger

Legacy backend for backward compatibility. Implements ITelemetryLogger
by delegating to existing winstonTelemetryLogger singleton.

SIO-458"
```

---

### Task 5: Create DI container

**Files:**
- Create: `src/logging/container.ts`
- Test: `tests/bun/unit/logging/container.test.ts`

**Step 1: Write the failing test**

```typescript
/* tests/bun/unit/logging/container.test.ts */
import { describe, expect, test, beforeEach, afterEach } from "bun:test";

describe("Logging Container", () => {
  beforeEach(async () => {
    const { loggerContainer } = await import("../../../../src/logging/container");
    loggerContainer.reset();
  });

  afterEach(async () => {
    const { loggerContainer } = await import("../../../../src/logging/container");
    loggerContainer.reset();
  });

  test("getLogger() returns an ILogger instance", async () => {
    const { getLogger } = await import("../../../../src/logging/container");
    const logger = getLogger();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.child).toBe("function");
    expect(typeof logger.flush).toBe("function");
  });

  test("getChildLogger() returns a child with bound context", async () => {
    const { getChildLogger } = await import("../../../../src/logging/container");
    const child = getChildLogger({ requestId: "req-789" });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe("function");
  });

  test("setLogger() injects a custom logger", async () => {
    const { loggerContainer, getLogger } = await import("../../../../src/logging/container");
    const calls: string[] = [];
    const mock = {
      debug: () => calls.push("debug"),
      info: () => calls.push("info"),
      warn: () => calls.push("warn"),
      error: () => calls.push("error"),
      child: () => mock,
      flush: () => Promise.resolve(),
      reinitialize: () => {},
    };
    loggerContainer.setLogger(mock);
    getLogger().info("test");
    expect(calls).toContain("info");
  });

  test("reset() restores default logger", async () => {
    const { loggerContainer, getLogger } = await import("../../../../src/logging/container");
    const mock = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      child: () => mock,
      flush: () => Promise.resolve(),
      reinitialize: () => {},
    };
    loggerContainer.setLogger(mock);
    loggerContainer.reset();
    const logger = getLogger();
    // After reset, should not be our mock
    expect(logger).not.toBe(mock);
  });

  test("setBackend() switches backend", async () => {
    const { loggerContainer, getLogger } = await import("../../../../src/logging/container");
    // Default is pino, switch to winston
    loggerContainer.setBackend("winston");
    const logger = getLogger();
    expect(typeof logger.info).toBe("function");
    // Switch back
    loggerContainer.setBackend("pino");
    const pinoLogger = getLogger();
    expect(typeof pinoLogger.info).toBe("function");
    expect(pinoLogger).not.toBe(logger);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/bun/unit/logging/container.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
/* src/logging/container.ts */

import type { ILogger, LogContext } from "./ports/logger.port";

type LoggingBackend = "pino" | "winston";

/**
 * Logging DI Container.
 * Per golden path Layer 2: resolves LOGGING_BACKEND env var to the active adapter.
 * Fallback chain: Container -> Legacy Winston -> Console JSON.
 */
class LoggerContainer {
  private logger: ILogger | null = null;
  private backend: LoggingBackend | null = null;

  /**
   * Get the active logger. Lazy-initializes on first call.
   */
  getLogger(): ILogger {
    if (!this.logger) {
      this.logger = this.createLogger();
    }
    return this.logger;
  }

  /**
   * Create a child logger with bound context.
   */
  getChildLogger(bindings: LogContext): ILogger {
    return this.getLogger().child(bindings);
  }

  /**
   * Inject a custom logger (for testing).
   */
  setLogger(logger: ILogger): void {
    this.logger = logger;
  }

  /**
   * Switch backend at runtime.
   */
  setBackend(backend: LoggingBackend): void {
    this.backend = backend;
    this.logger = null; // Force re-creation on next getLogger()
  }

  /**
   * Reset to defaults (for testing).
   */
  reset(): void {
    this.logger = null;
    this.backend = null;
  }

  private resolveBackend(): LoggingBackend {
    if (this.backend) return this.backend;
    const envBackend = process.env.LOGGING_BACKEND?.toLowerCase();
    if (envBackend === "winston") return "winston";
    return "pino"; // Default
  }

  private createLogger(): ILogger {
    const backend = this.resolveBackend();

    // Attempt primary backend
    try {
      if (backend === "pino") {
        const { PinoAdapter } = require("./adapters/pino.adapter");
        return new PinoAdapter();
      }
      const { WinstonAdapter } = require("./adapters/winston.adapter");
      return new WinstonAdapter();
    } catch (primaryError) {
      // Fallback: try the other backend
      try {
        if (backend === "pino") {
          const { WinstonAdapter } = require("./adapters/winston.adapter");
          console.warn("Pino failed to load, falling back to Winston:", primaryError);
          return new WinstonAdapter();
        }
        const { PinoAdapter } = require("./adapters/pino.adapter");
        console.warn("Winston failed to load, falling back to Pino:", primaryError);
        return new PinoAdapter();
      } catch (fallbackError) {
        // Ultimate fallback: Console JSON logger
        console.error("All logging backends failed, using console fallback:", fallbackError);
        return this.createConsoleFallback();
      }
    }
  }

  private createConsoleFallback(): ILogger {
    const fallback: ILogger = {
      debug: (msg, ctx?) =>
        console.debug(JSON.stringify({ "@timestamp": new Date().toISOString(), "log.level": "debug", message: msg, ...ctx })),
      info: (msg, ctx?) =>
        console.log(JSON.stringify({ "@timestamp": new Date().toISOString(), "log.level": "info", message: msg, ...ctx })),
      warn: (msg, ctx?) =>
        console.warn(JSON.stringify({ "@timestamp": new Date().toISOString(), "log.level": "warn", message: msg, ...ctx })),
      error: (msg, ctx?) =>
        console.error(JSON.stringify({ "@timestamp": new Date().toISOString(), "log.level": "error", message: msg, ...ctx })),
      child: (_bindings) => fallback,
      flush: () => Promise.resolve(),
      reinitialize: () => {},
    };
    return fallback;
  }
}

// Singleton
export const loggerContainer = new LoggerContainer();

// Convenience exports
export function getLogger(): ILogger {
  return loggerContainer.getLogger();
}

export function getChildLogger(bindings: LogContext): ILogger {
  return loggerContainer.getChildLogger(bindings);
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/bun/unit/logging/container.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add src/logging/container.ts tests/bun/unit/logging/container.test.ts
git commit -m "feat(logging): add DI container with LOGGING_BACKEND resolution

Resolves 'pino' (default) or 'winston' via LOGGING_BACKEND env var.
Fallback chain: primary -> alternate backend -> console JSON.
Exposes getLogger(), getChildLogger(), setLogger() for testing.

SIO-458"
```

---

## Phase 2: Rewire Existing Logging Paths

### Task 6: Add `$logging` path alias to tsconfig

**Files:**
- Modify: `tsconfig.json:51-59` (paths section)

**Step 1: Add the alias**

In `tsconfig.json`, add to the `paths` object (after `$telemetry` line ~59):

```json
"$logging": ["src/logging/container"],
"$logging/*": ["src/logging/*"],
```

**Step 2: Verify**

Run: `bun run typecheck 2>&1 | head -5`
Expected: No new errors from alias

**Step 3: Commit**

```bash
git add tsconfig.json
git commit -m "chore: add \$logging path alias to tsconfig

SIO-458"
```

---

### Task 7: Rewire `src/telemetry/logger.ts` to use container

**Files:**
- Modify: `src/telemetry/logger.ts`
- Test: Run existing tests that import from `../../telemetry/logger`

**Step 1: Rewrite the file**

Replace `src/telemetry/logger.ts` contents:

```typescript
/* src/telemetry/logger.ts */
/* Re-exports logging from DI container for backward compatibility */
/* Application code importing from this path continues to work unchanged */

export type { LogContext } from "../logging/ports/logger.port";
export type { LogLevel, StructuredLogData } from "./winston-logger";

// Re-export convenience functions from container
import { getLogger, getChildLogger } from "../logging/container";
export { getChildLogger };

export function log(message: string, meta?: Record<string, unknown>): void {
  getLogger().info(message, meta);
}

export function debug(message: string, meta?: Record<string, unknown>): void {
  getLogger().debug(message, meta);
}

export function warn(message: string, meta?: Record<string, unknown>): void {
  getLogger().warn(message, meta);
}

export function err(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
  const errorContext: Record<string, unknown> = {};
  if (error != null) {
    const e = error instanceof Error ? error : new Error(String(error));
    errorContext["error.type"] = e.name;
    errorContext["error.message"] = e.message;
    if (e.stack) {
      const frames = e.stack.split("\n").slice(1, 4).map((l) => l.trim()).join(" → ");
      errorContext["error.stack"] = frames;
    }
  }
  getLogger().error(message, { ...errorContext, ...meta });
}

export function error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
  err(message, error, meta);
}

// Re-export singleton references for backward compatibility
export { winstonTelemetryLogger, telemetryLogger } from "./winston-logger";
export { LogLevel } from "./winston-logger";
```

**Step 2: Run existing tests that depend on this module**

Run: `bun test tests/bun/unit/telemetry/ --timeout 15000`
Expected: All existing telemetry tests still pass

**Step 3: Commit**

```bash
git add src/telemetry/logger.ts
git commit -m "refactor(logging): rewire telemetry/logger.ts to DI container

27 files importing from telemetry/logger continue to work unchanged.
err() function preserves error serialization for ECS compliance.

SIO-458"
```

---

### Task 8: Rewire `src/utils/logger.ts` to use container

**Files:**
- Modify: `src/utils/logger.ts`

**Step 1: Rewrite the file**

Replace `src/utils/logger.ts` contents:

```typescript
/* src/utils/logger.ts */
/* Layer 3: Application logging facade over DI container */
/* Per golden path: this is the primary import for all application code */

import { getLogger, getChildLogger } from "../logging/container";
export { getChildLogger };

export function log(message: string, context: Record<string, unknown> = {}) {
  getLogger().info(message, context);
}

export function warn(message: string, context: Record<string, unknown> = {}) {
  getLogger().warn(message, context);
}

export function error(message: string, context: Record<string, unknown> = {}) {
  getLogger().error(message, context);
}

export function audit(eventType: string, context: Record<string, unknown> = {}) {
  getLogger().info(eventType, { audit: true, event_type: eventType, ...context });
}

export function logError(message: string, err: Error, context: Record<string, unknown> = {}) {
  getLogger().error(message, {
    error: { name: err.name, message: err.message, stack: err.stack },
    ...context,
  });
}

export const logger = { log, warn, error, audit, logError };
```

**Step 2: Run existing util tests**

Run: `bun test tests/bun/unit/utils/ --timeout 15000`
Expected: All existing tests still pass

**Step 3: Commit**

```bash
git add src/utils/logger.ts
git commit -m "refactor(logging): rewire utils/logger.ts to DI container

Thin facade over getLogger(). Same public API: log, warn, error, audit, logError.
Adds getChildLogger export for request-scoped logging.

SIO-458"
```

---

### Task 9: Update `src/telemetry/index.ts` barrel exports

**Files:**
- Modify: `src/telemetry/index.ts:157-159`

**Step 1: Update the logging exports section**

Replace lines 157-159 in `src/telemetry/index.ts`:

```typescript
// Logging exports (via DI container for backend flexibility)
export type { LogContext } from "../logging/ports/logger.port";
export type { LogLevel, StructuredLogData } from "./winston-logger";
export { debug, err, error, log, warn } from "./logger";
export { telemetryLogger, winstonTelemetryLogger } from "./winston-logger";
// DI container access
export { getChildLogger, getLogger, loggerContainer } from "../logging/container";
```

**Step 2: Verify barrel consumers still work**

Run: `bun run typecheck 2>&1 | grep -c "error TS"` (count should not increase from baseline)

**Step 3: Commit**

```bash
git add src/telemetry/index.ts
git commit -m "refactor(logging): update telemetry barrel to export from DI container

12 files importing from telemetry barrel continue to work unchanged.
Adds getLogger, getChildLogger, loggerContainer exports.

SIO-458"
```

---

### Task 10: Migrate 11 telemetry-internal files from `./winston-logger` to container

**Files to modify** (all within `src/telemetry/`):
- `lifecycle-logger.ts` — `import { winstonTelemetryLogger } from "./winston-logger"` → `import { getLogger } from "../logging/container"`
- `gc-metrics.ts` — `import { log, warn } from "./winston-logger"` → `import { getLogger } from "../logging/container"`
- `sla-monitor.ts` — same pattern
- `config.ts` — same pattern
- `profiling-metrics.ts` — same pattern
- `metrics/databaseMetrics.ts` — `import { err, warn } from "../winston-logger"` → `import { getLogger } from "../../logging/container"`
- `metrics/httpMetrics.ts` — same pattern
- `metrics/initialization.ts` — same pattern
- `metrics/process-metrics.ts` — same pattern
- `coordinator/BatchCoordinator.ts` — `import { err, log, warn } from "../../telemetry/winston-logger"` → `import { getLogger } from "../../logging/container"`
- `instrumentation.ts` — `import { log, warn, winstonTelemetryLogger } from "./winston-logger"` → keep `winstonTelemetryLogger` import for reinitialize(), add `import { getLogger } from "../logging/container"` for log/warn

**Migration pattern for each file:**

For files using convenience functions (`log`, `warn`, `err`):
```typescript
// Before:
import { log, warn } from "./winston-logger";
log("message", { key: "value" });

// After:
import { getLogger } from "../logging/container";
const logger = getLogger();
logger.info("message", { key: "value" });
```

For `lifecycle-logger.ts` using `winstonTelemetryLogger` directly:
```typescript
// Before:
import { winstonTelemetryLogger } from "./winston-logger";
winstonTelemetryLogger.info(message, meta);

// After:
import { getLogger } from "../logging/container";
getLogger().info(message, meta);
```

For `instrumentation.ts` — special case, keep direct Winston import for `reinitialize()`:
```typescript
import { getLogger } from "../logging/container";
import { winstonTelemetryLogger } from "./winston-logger";
// Use getLogger() for log/warn, keep winstonTelemetryLogger.reinitialize()
```

**Step 1: Apply migration to all 11 files**

Each file follows the same pattern. Replace the import and all call sites.

**Step 2: Run all telemetry tests**

Run: `bun test tests/bun/unit/telemetry/ --timeout 15000`
Expected: All pass

**Step 3: Run biome check**

Run: `bun run biome:check`
Expected: No issues (or fix with `bun run biome:check:write`)

**Step 4: Commit**

```bash
git add src/telemetry/
git commit -m "refactor(logging): migrate 11 telemetry files from winston-logger to DI container

Breaks direct dependency on Winston singleton. All telemetry-internal
files now use getLogger() from container for backend flexibility.

SIO-458"
```

---

## Phase 3: Config Integration

### Task 11: Add LOGGING_BACKEND and TELEMETRY_MODE to 4-pillar config

**Files:**
- Modify: `src/config/schemas.ts:12-18` (ApplicationConfig interface) and `src/config/schemas.ts:99-111` (ApplicationConfigSchema)
- Modify: `src/config/defaults.ts:9-15` (application section)
- Modify: `src/config/envMapping.ts:35-41` (application section)

**Step 1: Update schemas.ts**

Add to `ApplicationConfig` interface (after `BASE_URL` on line 17):

```typescript
LOGGING_BACKEND: string;
TELEMETRY_MODE: string;
```

Add to `ApplicationConfigSchema` (after `BASE_URL` on line 110):

```typescript
LOGGING_BACKEND: z.enum(["pino", "winston"]).describe("Logging backend selection"),
TELEMETRY_MODE: z.enum(["console", "otlp", "both"]).describe("Telemetry output mode"),
```

**Step 2: Update defaults.ts**

Add to `application` section (after `BASE_URL` on line 14):

```typescript
LOGGING_BACKEND: "pino",
TELEMETRY_MODE: "both",
```

**Step 3: Update envMapping.ts**

Add to `application` section (after `BASE_URL` on line 40):

```typescript
LOGGING_BACKEND: { envVar: "LOGGING_BACKEND", type: "string" },
TELEMETRY_MODE: { envVar: "TELEMETRY_MODE", type: "string" },
```

**Step 4: Run config tests**

Run: `bun test tests/bun/unit/config/ --timeout 15000`
Expected: All pass (may need to update test fixtures if they use strict config shape)

**Step 5: Commit**

```bash
git add src/config/schemas.ts src/config/defaults.ts src/config/envMapping.ts
git commit -m "feat(config): add LOGGING_BACKEND and TELEMETRY_MODE to 4-pillar config

LOGGING_BACKEND: 'pino' (default) | 'winston'
TELEMETRY_MODE: 'console' | 'otlp' | 'both' (default)

SIO-458"
```

---

## Phase 4: Critical Lifecycle Logging

### Task 12: Create critical lifecycle logging module

**Files:**
- Create: `src/logging/critical-lifecycle.ts`
- Test: `tests/bun/unit/logging/critical-lifecycle.test.ts`

**Step 1: Write the failing test**

```typescript
/* tests/bun/unit/logging/critical-lifecycle.test.ts */
import { describe, expect, test, mock, beforeEach } from "bun:test";

describe("Critical Lifecycle Logging", () => {
  let originalLog: typeof console.log;
  let originalError: typeof console.error;
  let logOutput: string[];
  let errorOutput: string[];

  beforeEach(() => {
    logOutput = [];
    errorOutput = [];
    originalLog = console.log;
    originalError = console.error;
    console.log = (...args: unknown[]) => logOutput.push(args.map(String).join(" "));
    console.error = (...args: unknown[]) => errorOutput.push(args.map(String).join(" "));
  });

  // Restore after each test
  const restore = () => {
    console.log = originalLog;
    console.error = originalError;
  };

  test("logServiceStartup writes to stdout", async () => {
    const { logServiceStartup } = await import("../../../../src/logging/critical-lifecycle");
    logServiceStartup(4000, "development");
    restore();
    expect(logOutput.length).toBeGreaterThan(0);
    expect(logOutput[0]).toContain("Service starting");
  });

  test("logServiceReady writes to stdout", async () => {
    const { logServiceReady } = await import("../../../../src/logging/critical-lifecycle");
    logServiceReady(4000);
    restore();
    expect(logOutput.length).toBeGreaterThan(0);
    expect(logOutput[0]).toContain("Service ready");
  });

  test("logServiceShutdownInitiated writes to stdout", async () => {
    const { logServiceShutdownInitiated } = await import("../../../../src/logging/critical-lifecycle");
    logServiceShutdownInitiated("SIGTERM");
    restore();
    expect(logOutput.length).toBeGreaterThan(0);
    expect(logOutput[0]).toContain("SIGTERM");
  });

  test("logServiceShutdownError writes to stderr", async () => {
    const { logServiceShutdownError } = await import("../../../../src/logging/critical-lifecycle");
    logServiceShutdownError(new Error("test error"));
    restore();
    expect(errorOutput.length).toBeGreaterThan(0);
    expect(errorOutput[0]).toContain("test error");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/bun/unit/logging/critical-lifecycle.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
/* src/logging/critical-lifecycle.ts */

/**
 * Critical lifecycle logging that bypasses LOG_LEVEL entirely.
 * Per golden path: operators always see startup/shutdown in container logs.
 * Writes directly to stdout/stderr — guaranteed output.
 */

function formatMessage(level: string, message: string, context?: Record<string, unknown>): string {
  const ts = new Date().toLocaleTimeString();
  const ctx = context && Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : "";
  return `${ts} ${level}: ${message}${ctx}`;
}

export function logServiceStartup(port: number, environment: string): void {
  console.log(formatMessage("info", "Service starting", {
    port,
    environment,
    pid: process.pid,
    version: process.env.npm_package_version || "unknown",
    runtime: `bun ${typeof Bun !== "undefined" ? Bun.version : "unknown"}`,
  }));
}

export function logServiceReady(port: number): void {
  console.log(formatMessage("info", `Service ready on port ${port}`, {
    port,
    pid: process.pid,
  }));
}

export function logServiceShutdownInitiated(signal: string): void {
  console.log(formatMessage("info", `Shutdown initiated via ${signal}`, {
    signal,
    pid: process.pid,
    uptime: process.uptime(),
  }));
}

export function logServiceShutdownCompleted(): void {
  console.log(formatMessage("info", "Shutdown completed", {
    pid: process.pid,
    uptime: process.uptime(),
  }));
}

export function logServiceShutdownError(error: Error | unknown): void {
  const e = error instanceof Error ? error : new Error(String(error));
  console.error(formatMessage("error", `Shutdown error: ${e.message}`, {
    error: e.name,
    stack: e.stack?.split("\n").slice(1, 4).map((l) => l.trim()).join(" → "),
    pid: process.pid,
  }));
}

export function criticalLifecycleLog(message: string, context?: Record<string, unknown>): void {
  console.log(formatMessage("info", message, context));
}

export function criticalLifecycleWarn(message: string, context?: Record<string, unknown>): void {
  console.warn(formatMessage("warn", message, context));
}

export function criticalLifecycleError(message: string, context?: Record<string, unknown>): void {
  console.error(formatMessage("error", message, context));
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/bun/unit/logging/critical-lifecycle.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add src/logging/critical-lifecycle.ts tests/bun/unit/logging/critical-lifecycle.test.ts
git commit -m "feat(logging): add critical lifecycle logging bypassing LOG_LEVEL

logServiceStartup, logServiceReady, logServiceShutdownInitiated,
logServiceShutdownCompleted, logServiceShutdownError write directly
to stdout/stderr for guaranteed operator visibility.

SIO-458"
```

---

## Phase 5: TelemetryEmitter & SpanEvents

### Task 13: Create SpanEvents constants

**Files:**
- Create: `src/telemetry/span-event-names.ts`
- Test: `tests/bun/unit/telemetry/span-event-names.test.ts`

**Step 1: Write the failing test**

```typescript
/* tests/bun/unit/telemetry/span-event-names.test.ts */
import { describe, expect, test } from "bun:test";

describe("SpanEvents", () => {
  test("exports type-safe span event constants", async () => {
    const { SpanEvents } = await import("../../../../src/telemetry/span-event-names");
    expect(SpanEvents).toBeDefined();
    // Verify categories exist
    expect(SpanEvents.CIRCUIT_BREAKER_STATE_OPEN).toBe("circuit_breaker.state.open");
    expect(SpanEvents.CACHE_HIT).toBe("cache.hit");
    expect(SpanEvents.CACHE_MISS).toBe("cache.miss");
    expect(SpanEvents.COUCHBASE_QUERY_STARTED).toBe("couchbase.query.started");
    expect(SpanEvents.GRAPHQL_REQUEST_STARTED).toBe("graphql.request.started");
    expect(SpanEvents.HTTP_REQUEST_STARTED).toBe("http.request.started");
    expect(SpanEvents.HEALTH_CHECK_SUCCESS).toBe("health.check.success");
    expect(SpanEvents.LIFECYCLE_SHUTDOWN_INITIATED).toBe("lifecycle.shutdown.initiated");
    expect(SpanEvents.DATALOADER_BATCH_STARTED).toBe("dataloader.batch.started");
  });

  test("all values are lowercase dot-separated strings", async () => {
    const { SpanEvents } = await import("../../../../src/telemetry/span-event-names");
    for (const [key, value] of Object.entries(SpanEvents)) {
      expect(value).toMatch(/^[a-z][a-z0-9_.]+$/);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/bun/unit/telemetry/span-event-names.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
/* src/telemetry/span-event-names.ts */

/**
 * Type-safe span event name constants for CapellaQL.
 * Per golden path: always use SpanEvents.* instead of raw strings.
 * Naming convention: <component>.<sub_component>.<action>
 */
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
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/bun/unit/telemetry/span-event-names.test.ts`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add src/telemetry/span-event-names.ts tests/bun/unit/telemetry/span-event-names.test.ts
git commit -m "feat(telemetry): add type-safe SpanEvents constants

8 categories: circuit_breaker, cache, couchbase, graphql, http,
health, lifecycle, dataloader, rate_limit, websocket.

SIO-458"
```

---

### Task 14: Create TelemetryEmitter

**Files:**
- Create: `src/telemetry/telemetry-emitter.ts`
- Test: `tests/bun/unit/telemetry/telemetry-emitter.test.ts`

**Step 1: Write the failing test**

```typescript
/* tests/bun/unit/telemetry/telemetry-emitter.test.ts */
import { describe, expect, test } from "bun:test";
import { SpanEvents } from "../../../../src/telemetry/span-event-names";

describe("TelemetryEmitter", () => {
  test("info() does not throw", async () => {
    const { telemetryEmitter } = await import("../../../../src/telemetry/telemetry-emitter");
    expect(() => telemetryEmitter.info(SpanEvents.CACHE_HIT, "Cache hit", { key: "test" })).not.toThrow();
  });

  test("debug() does not throw", async () => {
    const { telemetryEmitter } = await import("../../../../src/telemetry/telemetry-emitter");
    expect(() => telemetryEmitter.debug(SpanEvents.DATALOADER_CACHE_HIT, "DataLoader cache hit")).not.toThrow();
  });

  test("warn() does not throw", async () => {
    const { telemetryEmitter } = await import("../../../../src/telemetry/telemetry-emitter");
    expect(() => telemetryEmitter.warn(SpanEvents.CIRCUIT_BREAKER_STATE_OPEN, "CB opened")).not.toThrow();
  });

  test("error() does not throw", async () => {
    const { telemetryEmitter } = await import("../../../../src/telemetry/telemetry-emitter");
    expect(() => telemetryEmitter.error(SpanEvents.COUCHBASE_QUERY_FAILED, "Query failed")).not.toThrow();
  });

  test("timed() calculates duration", async () => {
    const { telemetryEmitter } = await import("../../../../src/telemetry/telemetry-emitter");
    const start = performance.now();
    // Tiny delay
    await new Promise((r) => setTimeout(r, 5));
    expect(() => telemetryEmitter.timed(SpanEvents.COUCHBASE_QUERY_COMPLETED, "Query done", start)).not.toThrow();
  });

  test("emit() with full options does not throw", async () => {
    const { telemetryEmitter } = await import("../../../../src/telemetry/telemetry-emitter");
    expect(() =>
      telemetryEmitter.emit({
        event: SpanEvents.HTTP_REQUEST_COMPLETED,
        message: "Request done",
        level: "info",
        attributes: { statusCode: 200 },
        startTime: performance.now() - 100,
      }),
    ).not.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/bun/unit/telemetry/telemetry-emitter.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
/* src/telemetry/telemetry-emitter.ts */

/**
 * TelemetryEmitter: dual emission to OpenTelemetry span events + logs.
 *
 * Per golden path:
 * - Span events are ALWAYS captured regardless of LOG_LEVEL
 * - Logs are filtered by LOG_LEVEL
 * This makes span events ideal for critical operational data in production.
 */

import { context, trace } from "@opentelemetry/api";
import { getLogger } from "../logging/container";
import type { SpanEventName } from "./span-event-names";

type EmitLevel = "debug" | "info" | "warn" | "error";

interface EmitOptions {
  event: SpanEventName;
  message: string;
  level: EmitLevel;
  attributes?: Record<string, unknown>;
  startTime?: number;
}

class TelemetryEmitter {
  /**
   * Full-control emission.
   */
  emit(options: EmitOptions): void {
    const { event, message, level, attributes = {}, startTime } = options;

    const duration = startTime != null ? performance.now() - startTime : undefined;
    const enriched = {
      ...attributes,
      "event.name": event,
      ...(duration != null ? { "event.duration_ms": Math.round(duration * 100) / 100 } : {}),
    };

    // Span event: ALWAYS added (ignores LOG_LEVEL)
    this.addSpanEvent(event, enriched);

    // Log: filtered by LOG_LEVEL
    const logger = getLogger();
    switch (level) {
      case "debug":
        logger.debug(message, enriched);
        break;
      case "info":
        logger.info(message, enriched);
        break;
      case "warn":
        logger.warn(message, enriched);
        break;
      case "error":
        logger.error(message, enriched);
        break;
    }
  }

  info(event: SpanEventName, message: string, attributes?: Record<string, unknown>): void {
    this.emit({ event, message, level: "info", attributes });
  }

  debug(event: SpanEventName, message: string, attributes?: Record<string, unknown>): void {
    this.emit({ event, message, level: "debug", attributes });
  }

  warn(event: SpanEventName, message: string, attributes?: Record<string, unknown>): void {
    this.emit({ event, message, level: "warn", attributes });
  }

  error(event: SpanEventName, message: string, attributes?: Record<string, unknown>): void {
    this.emit({ event, message, level: "error", attributes });
  }

  timed(event: SpanEventName, message: string, startTime: number, attributes?: Record<string, unknown>): void {
    this.emit({ event, message, level: "info", attributes, startTime });
  }

  timedWithLevel(
    event: SpanEventName,
    message: string,
    level: EmitLevel,
    startTime: number,
    attributes?: Record<string, unknown>,
  ): void {
    this.emit({ event, message, level, attributes, startTime });
  }

  private addSpanEvent(event: string, attributes: Record<string, unknown>): void {
    try {
      const span = trace.getSpan(context.active());
      if (span) {
        // Convert attributes to span-safe types (strings/numbers/booleans only)
        const safeAttrs: Record<string, string | number | boolean> = {};
        for (const [k, v] of Object.entries(attributes)) {
          if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
            safeAttrs[k] = v;
          } else if (v != null) {
            safeAttrs[k] = String(v);
          }
        }
        span.addEvent(event, safeAttrs);
      }
    } catch {
      // No active span — span event silently skipped, log still emitted
    }
  }
}

export const telemetryEmitter = new TelemetryEmitter();
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/bun/unit/telemetry/telemetry-emitter.test.ts`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add src/telemetry/telemetry-emitter.ts tests/bun/unit/telemetry/telemetry-emitter.test.ts
git commit -m "feat(telemetry): add TelemetryEmitter for dual span-event + log emission

Span events always captured (bypass LOG_LEVEL). Logs filtered by LOG_LEVEL.
API: emit(), info(), debug(), warn(), error(), timed(), timedWithLevel().

SIO-458"
```

---

### Task 15: Export TelemetryEmitter and SpanEvents from barrel

**Files:**
- Modify: `src/telemetry/index.ts`

**Step 1: Add exports**

Add to `src/telemetry/index.ts` (at end):

```typescript
// Span event names and TelemetryEmitter
export { SpanEvents, type SpanEventName } from "./span-event-names";
export { telemetryEmitter } from "./telemetry-emitter";
```

**Step 2: Verify**

Run: `bun run typecheck 2>&1 | head -5`

**Step 3: Commit**

```bash
git add src/telemetry/index.ts
git commit -m "feat(telemetry): export SpanEvents and telemetryEmitter from barrel

SIO-458"
```

---

## Phase 6: Documentation & Cleanup

### Task 16: Write logging guide documentation

**Files:**
- Create: `docs/development/logging.md`

Write a comprehensive logging guide adapted from the golden path for CapellaQL's domain. Cover:

1. Architecture (3-layer diagram)
2. Quick start (importing `log`, `warn`, `error`, `logError`, `audit` from `src/utils/logger.ts`)
3. Child loggers (`getChildLogger({ requestId })`)
4. Public API reference table
5. Configuration (`LOG_LEVEL`, `LOGGING_BACKEND`, `TELEMETRY_MODE`)
6. Backends (Pino default, Winston legacy)
7. TelemetryEmitter vs `log()` decision matrix
8. SpanEvents categories table
9. Critical lifecycle logging
10. Testing (LOG_LEVEL=silent, mock injection via `loggerContainer.setLogger()`)

**Step 1: Write the doc**

Use the golden path guide as template, replace auth-specific content with CapellaQL domain.

**Step 2: Commit**

```bash
git add docs/development/logging.md
git commit -m "docs: add comprehensive logging guide per golden path

Covers 3-layer architecture, Pino/Winston backends, TelemetryEmitter,
SpanEvents, critical lifecycle logging, testing patterns.

SIO-458"
```

---

### Task 17: Update environment.md with new config vars

**Files:**
- Modify: `docs/configuration/environment.md`

**Step 1: Add to Application Settings table**

After `BASE_URL` row, add:

```markdown
| `LOGGING_BACKEND` | `LOGGING_BACKEND` | string | `"pino"` | Logging backend (`pino`, `winston`) |
| `TELEMETRY_MODE` | `TELEMETRY_MODE` | string | `"both"` | Log output mode (`console`, `otlp`, `both`) |
```

**Step 2: Commit**

```bash
git add docs/configuration/environment.md
git commit -m "docs: add LOGGING_BACKEND and TELEMETRY_MODE to environment guide

SIO-458"
```

---

### Task 18: Final verification

**Step 1: Run full typecheck**

Run: `bun run typecheck`

**Step 2: Run biome**

Run: `bun run biome:check`
If issues: `bun run biome:check:write`

**Step 3: Run all tests**

Run: `bun test --timeout 30000`

**Step 4: Verify no remaining direct winston-logger imports outside telemetry/**

Run: `grep -r "from.*winston-logger" src/ --include="*.ts" | grep -v "src/telemetry/" | grep -v "src/logging/adapters/winston"`
Expected: No output (only winston.adapter.ts and telemetry/ files should reference it)

**Step 5: Final commit if any biome fixes were needed**

```bash
git add -A
git commit -m "chore: biome formatting fixes for logging architecture

SIO-458"
```

---

## Summary

| Phase | Tasks | New Files | Modified Files |
|---|---|---|---|
| 1: Foundation | 1-5 | 4 (`ports/logger.port.ts`, `adapters/pino.adapter.ts`, `adapters/winston.adapter.ts`, `container.ts`) | 1 (`package.json`) |
| 2: Rewire | 6-10 | 0 | 14 (`tsconfig.json`, `telemetry/logger.ts`, `utils/logger.ts`, `telemetry/index.ts`, + 11 telemetry internals) |
| 3: Config | 11 | 0 | 3 (`schemas.ts`, `defaults.ts`, `envMapping.ts`) |
| 4: Lifecycle | 12 | 1 (`critical-lifecycle.ts`) | 0 |
| 5: Emitter | 13-15 | 2 (`span-event-names.ts`, `telemetry-emitter.ts`) | 1 (`telemetry/index.ts`) |
| 6: Docs | 16-18 | 1 (`docs/development/logging.md`) | 1 (`docs/configuration/environment.md`) |
| **Total** | **18 tasks** | **8 new files** | **~20 modified files** |

**Test files created:** 6 (one per new module)
**Commits:** 18 (one per task)
