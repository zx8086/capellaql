import { describe, expect, test, beforeEach } from "bun:test";
import { telemetryEmitter } from "../../../../src/telemetry/telemetry-emitter";
import { SpanEvents } from "../../../../src/telemetry/span-event-names";
import { loggerContainer } from "../../../../src/logging/container";
import type { ILogger, LogContext } from "../../../../src/logging/ports/logger.port";

/**
 * Minimal mock logger that records calls for verification.
 */
function createMockLogger(): ILogger & { calls: { method: string; msg: string; ctx?: LogContext }[] } {
  const calls: { method: string; msg: string; ctx?: LogContext }[] = [];
  const logger: ILogger & { calls: typeof calls } = {
    calls,
    debug(msg: string, ctx?: LogContext) { calls.push({ method: "debug", msg, ctx }); },
    info(msg: string, ctx?: LogContext) { calls.push({ method: "info", msg, ctx }); },
    warn(msg: string, ctx?: LogContext) { calls.push({ method: "warn", msg, ctx }); },
    error(msg: string, ctx?: LogContext) { calls.push({ method: "error", msg, ctx }); },
    child() { return logger; },
    flush() { return Promise.resolve(); },
    reinitialize() {},
  };
  return logger;
}

describe("TelemetryEmitter", () => {
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    loggerContainer.setLogger(mockLogger);
  });

  describe("convenience methods do not throw", () => {
    test("info() does not throw", () => {
      expect(() => {
        telemetryEmitter.info(SpanEvents.CACHE_HIT, "Cache hit occurred", { key: "doc-123" });
      }).not.toThrow();
    });

    test("debug() does not throw", () => {
      expect(() => {
        telemetryEmitter.debug(SpanEvents.COUCHBASE_KV_STARTED, "KV get started");
      }).not.toThrow();
    });

    test("warn() does not throw", () => {
      expect(() => {
        telemetryEmitter.warn(SpanEvents.RATE_LIMIT_NEAR_THRESHOLD, "Approaching rate limit", { current: 450 });
      }).not.toThrow();
    });

    test("error() does not throw", () => {
      expect(() => {
        telemetryEmitter.error(SpanEvents.COUCHBASE_QUERY_FAILED, "Query failed", { error: "timeout" });
      }).not.toThrow();
    });
  });

  describe("timed() does not throw", () => {
    test("timed() with valid startTime", () => {
      const start = performance.now();
      expect(() => {
        telemetryEmitter.timed(SpanEvents.COUCHBASE_QUERY_COMPLETED, "Query completed", start, { rows: 42 });
      }).not.toThrow();
    });

    test("timed() with zero startTime", () => {
      expect(() => {
        telemetryEmitter.timed(SpanEvents.HTTP_REQUEST_COMPLETED, "Request done", 0);
      }).not.toThrow();
    });
  });

  describe("emit() with full options does not throw", () => {
    test("emit() with all options populated", () => {
      expect(() => {
        telemetryEmitter.emit({
          event: SpanEvents.LIFECYCLE_STARTUP_COMPLETED,
          message: "Server started successfully",
          level: "info",
          attributes: { port: 4000, duration_ms: 150 },
          startTime: performance.now() - 150,
        });
      }).not.toThrow();
    });

    test("emit() with minimal options", () => {
      expect(() => {
        telemetryEmitter.emit({
          event: SpanEvents.HEALTH_CHECK_SUCCESS,
          message: "Health OK",
          level: "debug",
        });
      }).not.toThrow();
    });

    test("emit() with empty attributes", () => {
      expect(() => {
        telemetryEmitter.emit({
          event: SpanEvents.CACHE_MISS,
          message: "Cache miss",
          level: "info",
          attributes: {},
        });
      }).not.toThrow();
    });
  });

  describe("delegates to logger at correct level", () => {
    test("info() calls logger.info", () => {
      telemetryEmitter.info(SpanEvents.CACHE_HIT, "hit");
      expect(mockLogger.calls.length).toBe(1);
      expect(mockLogger.calls[0]!.method).toBe("info");
    });

    test("debug() calls logger.debug", () => {
      telemetryEmitter.debug(SpanEvents.CACHE_MISS, "miss");
      expect(mockLogger.calls.length).toBe(1);
      expect(mockLogger.calls[0]!.method).toBe("debug");
    });

    test("warn() calls logger.warn", () => {
      telemetryEmitter.warn(SpanEvents.HEALTH_CHECK_DEGRADED, "degraded");
      expect(mockLogger.calls.length).toBe(1);
      expect(mockLogger.calls[0]!.method).toBe("warn");
    });

    test("error() calls logger.error", () => {
      telemetryEmitter.error(SpanEvents.COUCHBASE_QUERY_FAILED, "failed");
      expect(mockLogger.calls.length).toBe(1);
      expect(mockLogger.calls[0]!.method).toBe("error");
    });
  });

  describe("enriches attributes with event.name", () => {
    test("attributes contain event.name", () => {
      telemetryEmitter.info(SpanEvents.CACHE_HIT, "hit", { key: "abc" });
      const ctx = mockLogger.calls[0]!.ctx as Record<string, unknown>;
      expect(ctx["event.name"]).toBe("cache.hit");
    });

    test("original attributes are preserved", () => {
      telemetryEmitter.info(SpanEvents.CACHE_HIT, "hit", { key: "abc", size: 100 });
      const ctx = mockLogger.calls[0]!.ctx as Record<string, unknown>;
      expect(ctx["key"]).toBe("abc");
      expect(ctx["size"]).toBe(100);
    });
  });

  describe("timed emissions include duration", () => {
    test("timed() includes event.duration_ms", () => {
      const start = performance.now() - 50; // simulate 50ms ago
      telemetryEmitter.timed(SpanEvents.COUCHBASE_QUERY_COMPLETED, "done", start);
      const ctx = mockLogger.calls[0]!.ctx as Record<string, unknown>;
      expect(ctx["event.duration_ms"]).toBeDefined();
      expect(typeof ctx["event.duration_ms"]).toBe("number");
      expect(ctx["event.duration_ms"] as number).toBeGreaterThan(0);
    });

    test("timedWithLevel() includes duration and uses correct level", () => {
      const start = performance.now() - 10;
      telemetryEmitter.timedWithLevel(SpanEvents.COUCHBASE_QUERY_SLOW, "slow query", "warn", start, { query: "SELECT 1" });
      expect(mockLogger.calls[0]!.method).toBe("warn");
      const ctx = mockLogger.calls[0]!.ctx as Record<string, unknown>;
      expect(ctx["event.duration_ms"]).toBeDefined();
      expect(ctx["query"]).toBe("SELECT 1");
    });
  });

  describe("emit without startTime omits duration", () => {
    test("no event.duration_ms when startTime is undefined", () => {
      telemetryEmitter.info(SpanEvents.CACHE_HIT, "hit");
      const ctx = mockLogger.calls[0]!.ctx as Record<string, unknown>;
      expect(ctx["event.duration_ms"]).toBeUndefined();
    });
  });
});
