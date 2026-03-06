import { describe, expect, it } from "bun:test";
import { PinoAdapter } from "../../../../src/logging/adapters/pino.adapter";
import type {
  ILogger,
  ITelemetryLogger,
} from "../../../../src/logging/ports/logger.port";

/**
 * Unit tests for the PinoAdapter — the default Layer 1 backend
 * for the CapellaQL logging DI architecture.
 *
 * These tests verify interface compliance and that no method throws.
 * The adapter is constructed with a silent pino instance so tests
 * produce no console output.
 */

function createSilentAdapter(): PinoAdapter {
  // Use pino with level "silent" to suppress all output during tests.
  // We import pino inline so the test file stays self-contained.
  const pino = require("pino");
  const logger = pino({ level: "silent" });
  return new PinoAdapter(logger);
}

describe("PinoAdapter", () => {
  /* ---------------------------------------------------------------- */
  /*  ILogger interface compliance                                     */
  /* ---------------------------------------------------------------- */

  describe("ILogger methods", () => {
    it("implements debug without throwing", () => {
      const adapter = createSilentAdapter();
      expect(() => adapter.debug("test debug")).not.toThrow();
      expect(() =>
        adapter.debug("test debug", { key: "value" }),
      ).not.toThrow();
    });

    it("implements info without throwing", () => {
      const adapter = createSilentAdapter();
      expect(() => adapter.info("test info")).not.toThrow();
      expect(() => adapter.info("test info", { key: "value" })).not.toThrow();
    });

    it("implements warn without throwing", () => {
      const adapter = createSilentAdapter();
      expect(() => adapter.warn("test warn")).not.toThrow();
      expect(() => adapter.warn("test warn", { key: "value" })).not.toThrow();
    });

    it("implements error without throwing", () => {
      const adapter = createSilentAdapter();
      expect(() => adapter.error("test error")).not.toThrow();
      expect(() =>
        adapter.error("test error", { key: "value" }),
      ).not.toThrow();
    });

    it("child() returns a new PinoAdapter instance with bound context", () => {
      const adapter = createSilentAdapter();
      const child = adapter.child({ requestId: "abc-123" });

      expect(child).toBeInstanceOf(PinoAdapter);
      expect(child).not.toBe(adapter);
    });

    it("child logger does not throw when logging", () => {
      const adapter = createSilentAdapter();
      const child = adapter.child({ service: "test-service" });

      expect(() => child.info("child message")).not.toThrow();
      expect(() =>
        child.error("child error", { extra: "data" }),
      ).not.toThrow();
    });

    it("flush() resolves without error", async () => {
      const adapter = createSilentAdapter();
      await expect(adapter.flush()).resolves.toBeUndefined();
    });

    it("reinitialize() does not throw (no-op)", () => {
      const adapter = createSilentAdapter();
      expect(() => adapter.reinitialize()).not.toThrow();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  ITelemetryLogger interface compliance                            */
  /* ---------------------------------------------------------------- */

  describe("ITelemetryLogger methods", () => {
    it("logHttpRequest does not throw", () => {
      const adapter = createSilentAdapter();
      expect(() =>
        adapter.logHttpRequest("GET", "/health", 200, 12.5),
      ).not.toThrow();
      expect(() =>
        adapter.logHttpRequest("POST", "/graphql", 500, 250, {
          requestId: "req-1",
        }),
      ).not.toThrow();
    });

    it("logGraphQLRequest does not throw", () => {
      const adapter = createSilentAdapter();
      expect(() =>
        adapter.logGraphQLRequest("GetLooks", 45.2, true),
      ).not.toThrow();
      expect(() =>
        adapter.logGraphQLRequest("MutateOption", 120, false, {
          userId: "u-1",
        }),
      ).not.toThrow();
    });

    it("logCouchbaseOperation does not throw", () => {
      const adapter = createSilentAdapter();
      expect(() =>
        adapter.logCouchbaseOperation("get", 3.1, true),
      ).not.toThrow();
      expect(() =>
        adapter.logCouchbaseOperation("query", 55, false, {
          bucket: "main",
        }),
      ).not.toThrow();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Type-level interface satisfaction                                 */
  /* ---------------------------------------------------------------- */

  describe("interface satisfaction", () => {
    it("satisfies ILogger interface", () => {
      const adapter: ILogger = createSilentAdapter();
      expect(adapter).toBeDefined();
      expect(typeof adapter.debug).toBe("function");
      expect(typeof adapter.info).toBe("function");
      expect(typeof adapter.warn).toBe("function");
      expect(typeof adapter.error).toBe("function");
      expect(typeof adapter.child).toBe("function");
      expect(typeof adapter.flush).toBe("function");
      expect(typeof adapter.reinitialize).toBe("function");
    });

    it("satisfies ITelemetryLogger interface", () => {
      const adapter: ITelemetryLogger = createSilentAdapter();
      expect(adapter).toBeDefined();
      expect(typeof adapter.logHttpRequest).toBe("function");
      expect(typeof adapter.logGraphQLRequest).toBe("function");
      expect(typeof adapter.logCouchbaseOperation).toBe("function");
    });
  });
});
