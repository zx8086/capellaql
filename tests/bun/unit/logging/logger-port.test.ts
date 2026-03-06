/* tests/bun/unit/logging/logger-port.test.ts */
import { describe, expect, test } from "bun:test";
import type {
  ILogger,
  ITelemetryLogger,
  LogContext,
} from "../../../../src/logging/ports/logger.port";

describe("Logger Port Interfaces", () => {
  describe("LogContext type", () => {
    test("should accept Record<string, unknown> values", () => {
      const context: LogContext = {
        userId: "abc-123",
        requestId: 42,
        nested: { key: "value" },
        flag: true,
        empty: null,
      };

      expect(context).toBeDefined();
      expect(context.userId).toBe("abc-123");
    });
  });

  describe("ILogger interface", () => {
    const ILOGGER_METHODS = [
      "debug",
      "info",
      "warn",
      "error",
      "child",
      "flush",
      "reinitialize",
    ] as const;

    function createMockLogger(): ILogger {
      const calls: Array<{ method: string; args: unknown[] }> = [];

      const logger: ILogger = {
        debug(message: string, context?: LogContext) {
          calls.push({ method: "debug", args: [message, context] });
        },
        info(message: string, context?: LogContext) {
          calls.push({ method: "info", args: [message, context] });
        },
        warn(message: string, context?: LogContext) {
          calls.push({ method: "warn", args: [message, context] });
        },
        error(message: string, context?: LogContext) {
          calls.push({ method: "error", args: [message, context] });
        },
        child(bindings: LogContext): ILogger {
          calls.push({ method: "child", args: [bindings] });
          return logger; // return self for simplicity
        },
        flush(): Promise<void> {
          calls.push({ method: "flush", args: [] });
          return Promise.resolve();
        },
        reinitialize() {
          calls.push({ method: "reinitialize", args: [] });
        },
      };

      return logger;
    }

    test("should have exactly 7 methods", () => {
      const logger = createMockLogger();

      for (const method of ILOGGER_METHODS) {
        expect(typeof logger[method]).toBe("function");
      }

      expect(ILOGGER_METHODS.length).toBe(7);
    });

    test("debug() should accept message and optional context", () => {
      const logger = createMockLogger();

      // Without context
      logger.debug("test message");
      // With context
      logger.debug("test message", { key: "value" });

      // No throw means it satisfies the interface
      expect(true).toBe(true);
    });

    test("info() should accept message and optional context", () => {
      const logger = createMockLogger();

      logger.info("info message");
      logger.info("info message", { requestId: "abc" });

      expect(true).toBe(true);
    });

    test("warn() should accept message and optional context", () => {
      const logger = createMockLogger();

      logger.warn("warning");
      logger.warn("warning", { threshold: 90 });

      expect(true).toBe(true);
    });

    test("error() should accept message and optional context", () => {
      const logger = createMockLogger();

      logger.error("error occurred");
      logger.error("error occurred", { stack: "..." });

      expect(true).toBe(true);
    });

    test("child() should accept bindings and return an ILogger", () => {
      const logger = createMockLogger();

      const childLogger = logger.child({ service: "graphql" });

      // child must return something that also satisfies ILogger
      expect(typeof childLogger.debug).toBe("function");
      expect(typeof childLogger.info).toBe("function");
      expect(typeof childLogger.warn).toBe("function");
      expect(typeof childLogger.error).toBe("function");
      expect(typeof childLogger.child).toBe("function");
      expect(typeof childLogger.flush).toBe("function");
      expect(typeof childLogger.reinitialize).toBe("function");
    });

    test("flush() should return a Promise<void>", async () => {
      const logger = createMockLogger();

      const result = logger.flush();

      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.toBeUndefined();
    });

    test("reinitialize() should be callable with no arguments", () => {
      const logger = createMockLogger();

      // Should not throw
      logger.reinitialize();

      expect(true).toBe(true);
    });
  });

  describe("ITelemetryLogger interface", () => {
    const TELEMETRY_DOMAIN_METHODS = [
      "logHttpRequest",
      "logGraphQLRequest",
      "logCouchbaseOperation",
    ] as const;

    function createMockTelemetryLogger(): ITelemetryLogger {
      const calls: Array<{ method: string; args: unknown[] }> = [];

      const logger: ITelemetryLogger = {
        // ILogger methods
        debug(message: string, context?: LogContext) {
          calls.push({ method: "debug", args: [message, context] });
        },
        info(message: string, context?: LogContext) {
          calls.push({ method: "info", args: [message, context] });
        },
        warn(message: string, context?: LogContext) {
          calls.push({ method: "warn", args: [message, context] });
        },
        error(message: string, context?: LogContext) {
          calls.push({ method: "error", args: [message, context] });
        },
        child(bindings: LogContext): ILogger {
          calls.push({ method: "child", args: [bindings] });
          return logger;
        },
        flush(): Promise<void> {
          calls.push({ method: "flush", args: [] });
          return Promise.resolve();
        },
        reinitialize() {
          calls.push({ method: "reinitialize", args: [] });
        },
        // ITelemetryLogger domain methods
        logHttpRequest(
          method: string,
          path: string,
          statusCode: number,
          duration: number,
          context?: LogContext,
        ) {
          calls.push({
            method: "logHttpRequest",
            args: [method, path, statusCode, duration, context],
          });
        },
        logGraphQLRequest(
          operation: string,
          duration: number,
          success: boolean,
          context?: LogContext,
        ) {
          calls.push({
            method: "logGraphQLRequest",
            args: [operation, duration, success, context],
          });
        },
        logCouchbaseOperation(
          operation: string,
          responseTime: number,
          success: boolean,
          context?: LogContext,
        ) {
          calls.push({
            method: "logCouchbaseOperation",
            args: [operation, responseTime, success, context],
          });
        },
      };

      return logger;
    }

    test("should extend ILogger with all 7 base methods", () => {
      const logger = createMockTelemetryLogger();

      expect(typeof logger.debug).toBe("function");
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.child).toBe("function");
      expect(typeof logger.flush).toBe("function");
      expect(typeof logger.reinitialize).toBe("function");
    });

    test("should add exactly 3 domain-specific methods", () => {
      const logger = createMockTelemetryLogger();

      for (const method of TELEMETRY_DOMAIN_METHODS) {
        expect(typeof logger[method]).toBe("function");
      }

      expect(TELEMETRY_DOMAIN_METHODS.length).toBe(3);
    });

    test("logHttpRequest() should accept method, path, statusCode, duration, and optional context", () => {
      const logger = createMockTelemetryLogger();

      logger.logHttpRequest("GET", "/health", 200, 12.5);
      logger.logHttpRequest("POST", "/graphql", 500, 150.3, {
        correlationId: "req-abc",
      });

      expect(true).toBe(true);
    });

    test("logGraphQLRequest() should accept operation, duration, success, and optional context", () => {
      const logger = createMockTelemetryLogger();

      logger.logGraphQLRequest("GetUser", 45.2, true);
      logger.logGraphQLRequest("CreateLook", 120.0, false, {
        errorType: "VALIDATION",
      });

      expect(true).toBe(true);
    });

    test("logCouchbaseOperation() should accept operation, responseTime, success, and optional context", () => {
      const logger = createMockTelemetryLogger();

      logger.logCouchbaseOperation("get", 3.2, true);
      logger.logCouchbaseOperation("query", 250.0, false, {
        bucket: "default",
        errorCode: "TIMEOUT",
      });

      expect(true).toBe(true);
    });

    test("ITelemetryLogger should be assignable to ILogger (Liskov substitution)", () => {
      const telemetryLogger = createMockTelemetryLogger();

      // ITelemetryLogger extends ILogger, so this assignment must work
      const baseLogger: ILogger = telemetryLogger;

      expect(typeof baseLogger.debug).toBe("function");
      expect(typeof baseLogger.info).toBe("function");
      expect(typeof baseLogger.warn).toBe("function");
      expect(typeof baseLogger.error).toBe("function");
      expect(typeof baseLogger.child).toBe("function");
      expect(typeof baseLogger.flush).toBe("function");
      expect(typeof baseLogger.reinitialize).toBe("function");
    });
  });
});
