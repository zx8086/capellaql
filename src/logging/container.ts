// src/logging/container.ts

import type { ILogger, LogContext } from "./ports/logger.port";

export type LoggingBackend = "pino" | "winston";

export class LoggerContainer {
  private logger: ILogger | null = null;
  private backend: LoggingBackend | null = null;

  getLogger(): ILogger {
    if (!this.logger) {
      this.logger = this.createLogger();
    }
    return this.logger;
  }

  getChildLogger(bindings: LogContext): ILogger {
    return this.getLogger().child(bindings);
  }

  setLogger(logger: ILogger): void {
    this.logger = logger;
  }

  setBackend(backend: LoggingBackend): void {
    this.backend = backend;
    this.logger = null;
  }

  reset(): void {
    this.logger = null;
    this.backend = null;
  }

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

export const loggerContainer = new LoggerContainer();

export function getLogger(): ILogger {
  return loggerContainer.getLogger();
}

export function getChildLogger(bindings: LogContext): ILogger {
  return loggerContainer.getChildLogger(bindings);
}
