import { describe, expect, test } from "bun:test";
import { SpanEvents, type SpanEventName } from "../../../../src/telemetry/span-event-names";

describe("SpanEvents", () => {
  const allValues = Object.values(SpanEvents);
  const allKeys = Object.keys(SpanEvents);

  test("all values are lowercase dot-separated strings matching /^[a-z][a-z0-9_.]+$/", () => {
    const pattern = /^[a-z][a-z0-9_.]+$/;
    for (const value of allValues) {
      expect(value).toMatch(pattern);
    }
  });

  test("no duplicate values exist", () => {
    const unique = new Set(allValues);
    expect(unique.size).toBe(allValues.length);
  });

  test("contains expected number of event constants", () => {
    // Sanity check: we have a non-trivial number of events
    expect(allKeys.length).toBeGreaterThan(40);
  });

  describe("spot-check specific values", () => {
    test("CIRCUIT_BREAKER_STATE_OPEN", () => {
      expect(SpanEvents.CIRCUIT_BREAKER_STATE_OPEN).toBe("circuit_breaker.state.open");
    });

    test("CIRCUIT_BREAKER_STATE_CLOSED", () => {
      expect(SpanEvents.CIRCUIT_BREAKER_STATE_CLOSED).toBe("circuit_breaker.state.closed");
    });

    test("CIRCUIT_BREAKER_STATE_HALF_OPEN", () => {
      expect(SpanEvents.CIRCUIT_BREAKER_STATE_HALF_OPEN).toBe("circuit_breaker.state.half_open");
    });

    test("CACHE_HIT", () => {
      expect(SpanEvents.CACHE_HIT).toBe("cache.hit");
    });

    test("CACHE_MISS", () => {
      expect(SpanEvents.CACHE_MISS).toBe("cache.miss");
    });

    test("COUCHBASE_QUERY_STARTED", () => {
      expect(SpanEvents.COUCHBASE_QUERY_STARTED).toBe("couchbase.query.started");
    });

    test("COUCHBASE_TRANSACTION_AMBIGUOUS", () => {
      expect(SpanEvents.COUCHBASE_TRANSACTION_AMBIGUOUS).toBe("couchbase.transaction.ambiguous");
    });

    test("GRAPHQL_REQUEST_STARTED", () => {
      expect(SpanEvents.GRAPHQL_REQUEST_STARTED).toBe("graphql.request.started");
    });

    test("GRAPHQL_DEPTH_LIMIT_EXCEEDED", () => {
      expect(SpanEvents.GRAPHQL_DEPTH_LIMIT_EXCEEDED).toBe("graphql.depth_limit.exceeded");
    });

    test("HTTP_REQUEST_COMPLETED", () => {
      expect(SpanEvents.HTTP_REQUEST_COMPLETED).toBe("http.request.completed");
    });

    test("HEALTH_CHECK_DEGRADED", () => {
      expect(SpanEvents.HEALTH_CHECK_DEGRADED).toBe("health.check.degraded");
    });

    test("LIFECYCLE_SHUTDOWN_INITIATED", () => {
      expect(SpanEvents.LIFECYCLE_SHUTDOWN_INITIATED).toBe("lifecycle.shutdown.initiated");
    });

    test("DATALOADER_BATCH_STARTED", () => {
      expect(SpanEvents.DATALOADER_BATCH_STARTED).toBe("dataloader.batch.started");
    });

    test("RATE_LIMIT_EXCEEDED", () => {
      expect(SpanEvents.RATE_LIMIT_EXCEEDED).toBe("rate_limit.exceeded");
    });

    test("WEBSOCKET_CONNECTION_OPENED", () => {
      expect(SpanEvents.WEBSOCKET_CONNECTION_OPENED).toBe("websocket.connection.opened");
    });
  });

  test("SpanEventName type matches object values", () => {
    // TypeScript compile-time check: assigning a value to the type should work
    const eventName: SpanEventName = SpanEvents.CACHE_HIT;
    expect(eventName).toBe("cache.hit");
  });
});
