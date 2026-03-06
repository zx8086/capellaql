/* src/logging/container.ts
 *
 * Dependency Injection container for the logging subsystem.
 *
 * Selects between Pino (default) and Winston backends based on
 * the LOGGING_BACKEND environment variable. Falls back gracefully
 * when the primary backend fails to load — and ultimately drops
 * to a structured-JSON console fallback so the application never
 * crashes due to a missing logger.
 *
 * Usage:
 *   import { getLogger, getChildLogger } from "$logging/container";
 *   const log = getLogger();
 *   const reqLog = getChildLogger({ requestId: "abc-123" });
 */

import type { ILogger, LogContext } from "./ports/logger.port";

export type LoggingBackend = "pino" | "winston";

export class LoggerContainer {
  private logger: ILogger | null = null;
  private backend: LoggingBackend | null = null;

  /** Return the current logger, creating one lazily if needed. */
  getLogger(): ILogger {
    if (!this.logger) {
      this.logger = this.createLogger();
    }
    return this.logger;
  }

  /** Convenience: create a child logger with pre-bound context. */
  getChildLogger(bindings: LogContext): ILogger {
    return this.getLogger().child(bindings);
  }

  /** Inject a custom logger (useful for testing). */
  setLogger(logger: ILogger): void {
    this.logger = logger;
  }

  /** Switch the backend and discard the cached logger. */
  setBackend(backend: LoggingBackend): void {
    this.backend = backend;
    this.logger = null;
  }

  /** Clear all state — next `getLogger()` will re-resolve from env. */
  reset(): void {
    this.logger = null;
    this.backend = null;
  }

  /* ------------------------------------------------------------------ */
  /*  Private helpers                                                     */
  /* ------------------------------------------------------------------ */

  private resolveBackend(): LoggingBackend {
    if (this.backend) return this.backend;
    const envBackend = process.env.LOGGING_BACKEND?.toLowerCase();
    if (envBackend === "winston") return "winston";
    return "pino";
  }

  private createLogger(): ILogger {
    const backend = this.resolveBackend();

    try {
      if (backend === "pino") {
        const { PinoAdapter } = require("./adapters/pino.adapter");
        return new PinoAdapter();
      }
      const { WinstonAdapter } = require("./adapters/winston.adapter");
      return new WinstonAdapter();
    } catch (primaryError) {
      // Primary backend failed — try the other one.
      try {
        if (backend === "pino") {
          const { WinstonAdapter } = require("./adapters/winston.adapter");
          console.warn("Pino failed to load, falling back to Winston:", primaryError);
          return new WinstonAdapter();
        }
        const { PinoAdapter } = require("./adapters/pino.adapter");
        console.warn("Winston failed to load, falling back to Pino:", primaryError);
        return new PinoAdapter();
      } catch {
        // Both backends failed — last-resort console fallback.
        console.error("All logging backends failed, using console fallback");
        return this.createConsoleFallback();
      }
    }
  }

  private createConsoleFallback(): ILogger {
    const fallback: ILogger = {
      debug: (msg: string, ctx?: LogContext) =>
        console.debug(
          JSON.stringify({
            "@timestamp": new Date().toISOString(),
            "log.level": "debug",
            message: msg,
            ...ctx,
          })
        ),
      info: (msg: string, ctx?: LogContext) =>
        console.log(
          JSON.stringify({
            "@timestamp": new Date().toISOString(),
            "log.level": "info",
            message: msg,
            ...ctx,
          })
        ),
      warn: (msg: string, ctx?: LogContext) =>
        console.warn(
          JSON.stringify({
            "@timestamp": new Date().toISOString(),
            "log.level": "warn",
            message: msg,
            ...ctx,
          })
        ),
      error: (msg: string, ctx?: LogContext) =>
        console.error(
          JSON.stringify({
            "@timestamp": new Date().toISOString(),
            "log.level": "error",
            message: msg,
            ...ctx,
          })
        ),
      child: () => fallback,
      flush: () => Promise.resolve(),
      reinitialize: () => {},
    };
    return fallback;
  }
}

/** Singleton container instance. */
export const loggerContainer = new LoggerContainer();

/** Get the active logger (lazy-initialised). */
export function getLogger(): ILogger {
  return loggerContainer.getLogger();
}

/** Get a child logger with pre-bound context fields. */
export function getChildLogger(bindings: LogContext): ILogger {
  return loggerContainer.getChildLogger(bindings);
}
