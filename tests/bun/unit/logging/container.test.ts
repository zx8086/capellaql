import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  LoggerContainer,
  getChildLogger,
  getLogger,
  loggerContainer,
} from "../../../../src/logging/container";
import type { ILogger } from "../../../../src/logging/ports/logger.port";

/**
 * Unit tests for the LoggerContainer DI container.
 *
 * Validates lazy initialisation, backend switching, custom logger
 * injection, reset behaviour, and the module-level convenience exports.
 */

/* -------------------------------------------------------------------- */
/*  Helpers                                                              */
/* -------------------------------------------------------------------- */

/** Build a mock ILogger that records calls for assertions. */
function createMockLogger(): ILogger & { calls: string[] } {
  const calls: string[] = [];
  const mock: ILogger & { calls: string[] } = {
    calls,
    debug: (msg) => {
      calls.push(`debug:${msg}`);
    },
    info: (msg) => {
      calls.push(`info:${msg}`);
    },
    warn: (msg) => {
      calls.push(`warn:${msg}`);
    },
    error: (msg) => {
      calls.push(`error:${msg}`);
    },
    child: (bindings) => {
      calls.push(`child:${JSON.stringify(bindings)}`);
      return mock;
    },
    flush: () => {
      calls.push("flush");
      return Promise.resolve();
    },
    reinitialize: () => {
      calls.push("reinitialize");
    },
  };
  return mock;
}

/* -------------------------------------------------------------------- */
/*  Tests                                                                */
/* -------------------------------------------------------------------- */

describe("LoggerContainer", () => {
  beforeEach(() => {
    loggerContainer.reset();
  });

  afterEach(() => {
    loggerContainer.reset();
    // Clean up any env var side-effects.
    delete process.env.LOGGING_BACKEND;
  });

  /* ------------------------------------------------------------------ */
  /*  getLogger — basic contract                                         */
  /* ------------------------------------------------------------------ */

  describe("getLogger()", () => {
    it("returns an object with all ILogger methods", () => {
      const logger = loggerContainer.getLogger();

      expect(typeof logger.debug).toBe("function");
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.child).toBe("function");
      expect(typeof logger.flush).toBe("function");
      expect(typeof logger.reinitialize).toBe("function");
    });

    it("returns the same instance on repeated calls (lazy singleton)", () => {
      const first = loggerContainer.getLogger();
      const second = loggerContainer.getLogger();

      expect(first).toBe(second);
    });

    it("logging methods do not throw", () => {
      const logger = loggerContainer.getLogger();

      expect(() => logger.debug("d")).not.toThrow();
      expect(() => logger.info("i")).not.toThrow();
      expect(() => logger.warn("w")).not.toThrow();
      expect(() => logger.error("e")).not.toThrow();
    });
  });

  /* ------------------------------------------------------------------ */
  /*  getChildLogger                                                     */
  /* ------------------------------------------------------------------ */

  describe("getChildLogger()", () => {
    it("returns an ILogger with bound context", () => {
      const child = loggerContainer.getChildLogger({
        requestId: "req-42",
      });

      expect(child).toBeDefined();
      expect(typeof child.info).toBe("function");
      expect(typeof child.child).toBe("function");
    });

    it("child logger is distinct from the root logger", () => {
      const root = loggerContainer.getLogger();
      const child = loggerContainer.getChildLogger({ service: "test" });

      expect(child).not.toBe(root);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  setLogger — custom injection                                       */
  /* ------------------------------------------------------------------ */

  describe("setLogger()", () => {
    it("injects a custom logger that subsequent getLogger() calls return", () => {
      const mock = createMockLogger();
      loggerContainer.setLogger(mock);

      const logger = loggerContainer.getLogger();
      expect(logger).toBe(mock);
    });

    it("injected logger receives calls", () => {
      const mock = createMockLogger();
      loggerContainer.setLogger(mock);

      loggerContainer.getLogger().info("hello");
      loggerContainer.getLogger().warn("careful");

      expect(mock.calls).toContain("info:hello");
      expect(mock.calls).toContain("warn:careful");
    });
  });

  /* ------------------------------------------------------------------ */
  /*  reset                                                              */
  /* ------------------------------------------------------------------ */

  describe("reset()", () => {
    it("clears an injected logger so getLogger() creates a fresh default", () => {
      const mock = createMockLogger();
      loggerContainer.setLogger(mock);
      expect(loggerContainer.getLogger()).toBe(mock);

      loggerContainer.reset();
      const fresh = loggerContainer.getLogger();

      expect(fresh).not.toBe(mock);
      expect(typeof fresh.info).toBe("function");
    });

    it("clears the backend selection", () => {
      loggerContainer.setBackend("winston");
      loggerContainer.reset();

      // After reset, the container resolves from env (defaults to pino).
      const logger = loggerContainer.getLogger();
      expect(logger).toBeDefined();
    });
  });

  /* ------------------------------------------------------------------ */
  /*  setBackend — switching backends                                    */
  /* ------------------------------------------------------------------ */

  describe("setBackend()", () => {
    it("setBackend('winston') loads a Winston-backed logger", () => {
      loggerContainer.setBackend("winston");
      const logger = loggerContainer.getLogger();

      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe("function");
      // Should not throw when used.
      expect(() => logger.info("winston test")).not.toThrow();
    });

    it("setBackend('pino') loads a Pino-backed logger", () => {
      loggerContainer.setBackend("pino");
      const logger = loggerContainer.getLogger();

      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe("function");
      expect(() => logger.info("pino test")).not.toThrow();
    });

    it("switching backend discards the previous cached logger", () => {
      loggerContainer.setBackend("pino");
      const pinoLogger = loggerContainer.getLogger();

      loggerContainer.setBackend("winston");
      const winstonLogger = loggerContainer.getLogger();

      expect(winstonLogger).not.toBe(pinoLogger);
    });

    it("switching back to pino after winston creates a new instance", () => {
      loggerContainer.setBackend("winston");
      const w = loggerContainer.getLogger();

      loggerContainer.setBackend("pino");
      const p = loggerContainer.getLogger();

      expect(p).not.toBe(w);
      expect(typeof p.info).toBe("function");
    });
  });

  /* ------------------------------------------------------------------ */
  /*  LOGGING_BACKEND env var                                            */
  /* ------------------------------------------------------------------ */

  describe("LOGGING_BACKEND environment variable", () => {
    it("defaults to pino when env var is unset", () => {
      delete process.env.LOGGING_BACKEND;
      const logger = loggerContainer.getLogger();

      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe("function");
    });

    it("respects LOGGING_BACKEND=winston", () => {
      process.env.LOGGING_BACKEND = "winston";
      const logger = loggerContainer.getLogger();

      expect(logger).toBeDefined();
      expect(() => logger.info("env winston")).not.toThrow();
    });

    it("respects LOGGING_BACKEND=WINSTON (case-insensitive)", () => {
      process.env.LOGGING_BACKEND = "WINSTON";
      const logger = loggerContainer.getLogger();

      expect(logger).toBeDefined();
      expect(() => logger.info("env WINSTON")).not.toThrow();
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Module-level convenience exports                                   */
  /* ------------------------------------------------------------------ */

  describe("module-level exports", () => {
    it("getLogger() returns an ILogger", () => {
      const logger = getLogger();

      expect(typeof logger.debug).toBe("function");
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.child).toBe("function");
      expect(typeof logger.flush).toBe("function");
      expect(typeof logger.reinitialize).toBe("function");
    });

    it("getChildLogger() returns a child with bound context", () => {
      const child = getChildLogger({ traceId: "t-1" });

      expect(child).toBeDefined();
      expect(typeof child.info).toBe("function");
    });

    it("getLogger() uses the same container as loggerContainer", () => {
      const mock = createMockLogger();
      loggerContainer.setLogger(mock);

      expect(getLogger()).toBe(mock);
    });
  });
});
