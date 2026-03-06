import { describe, expect, it } from "bun:test";
import { WinstonAdapter } from "../../../../src/logging/adapters/winston.adapter";
import type { ILogger, ITelemetryLogger } from "../../../../src/logging/ports/logger.port";

describe("WinstonAdapter", () => {
  // ---------------------------------------------------------------------------
  // ILogger contract
  // ---------------------------------------------------------------------------

  describe("ILogger methods", () => {
    it("implements debug()", () => {
      const adapter: ILogger = new WinstonAdapter();
      expect(() => adapter.debug("test debug")).not.toThrow();
    });

    it("implements info()", () => {
      const adapter: ILogger = new WinstonAdapter();
      expect(() => adapter.info("test info")).not.toThrow();
    });

    it("implements warn()", () => {
      const adapter: ILogger = new WinstonAdapter();
      expect(() => adapter.warn("test warn")).not.toThrow();
    });

    it("implements error()", () => {
      const adapter: ILogger = new WinstonAdapter();
      expect(() => adapter.error("test error")).not.toThrow();
    });

    it("info() accepts optional context", () => {
      const adapter: ILogger = new WinstonAdapter();
      expect(() => adapter.info("with context", { requestId: "abc-123" })).not.toThrow();
    });

    it("child() returns an ILogger", () => {
      const adapter: ILogger = new WinstonAdapter();
      const child = adapter.child({ requestId: "req-1" });
      expect(child).toBeDefined();
      expect(typeof child.info).toBe("function");
      expect(typeof child.debug).toBe("function");
      expect(typeof child.warn).toBe("function");
      expect(typeof child.error).toBe("function");
      expect(typeof child.child).toBe("function");
      expect(typeof child.flush).toBe("function");
      expect(typeof child.reinitialize).toBe("function");
    });

    it("child() preserves bound context without throwing", () => {
      const adapter = new WinstonAdapter({ component: "test" });
      const child = adapter.child({ requestId: "req-2" });
      expect(() => child.info("child log")).not.toThrow();
    });

    it("flush() resolves", async () => {
      const adapter: ILogger = new WinstonAdapter();
      await expect(adapter.flush()).resolves.toBeUndefined();
    });

    it("reinitialize() does not throw", () => {
      const adapter: ILogger = new WinstonAdapter();
      expect(() => adapter.reinitialize()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // ITelemetryLogger contract
  // ---------------------------------------------------------------------------

  describe("ITelemetryLogger methods", () => {
    it("implements logHttpRequest()", () => {
      const adapter: ITelemetryLogger = new WinstonAdapter();
      expect(() => adapter.logHttpRequest("GET", "/health", 200, 15)).not.toThrow();
    });

    it("logHttpRequest() accepts optional context", () => {
      const adapter: ITelemetryLogger = new WinstonAdapter();
      expect(() =>
        adapter.logHttpRequest("POST", "/graphql", 200, 42, { requestId: "r-1" }),
      ).not.toThrow();
    });

    it("implements logGraphQLRequest()", () => {
      const adapter: ITelemetryLogger = new WinstonAdapter();
      expect(() => adapter.logGraphQLRequest("GetLooks", 35, true)).not.toThrow();
    });

    it("logGraphQLRequest() handles failure outcome", () => {
      const adapter: ITelemetryLogger = new WinstonAdapter();
      expect(() =>
        adapter.logGraphQLRequest("MutateItem", 120, false, { errorCode: "INTERNAL" }),
      ).not.toThrow();
    });

    it("implements logCouchbaseOperation()", () => {
      const adapter: ITelemetryLogger = new WinstonAdapter();
      expect(() => adapter.logCouchbaseOperation("get", 8, true)).not.toThrow();
    });

    it("logCouchbaseOperation() handles failure outcome", () => {
      const adapter: ITelemetryLogger = new WinstonAdapter();
      expect(() =>
        adapter.logCouchbaseOperation("query", 250, false, { bucket: "main" }),
      ).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Type safety — compile-time verification
  // ---------------------------------------------------------------------------

  describe("type conformance", () => {
    it("is assignable to ILogger", () => {
      const adapter: ILogger = new WinstonAdapter();
      expect(adapter).toBeDefined();
    });

    it("is assignable to ITelemetryLogger", () => {
      const adapter: ITelemetryLogger = new WinstonAdapter();
      expect(adapter).toBeDefined();
    });
  });
});
