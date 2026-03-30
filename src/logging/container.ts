// src/logging/container.ts

import type { ILogger, LogContext } from "./ports/logger.port";

export type LoggingBackend = "pino";

export class LoggerContainer {
  private logger: ILogger | null = null;

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

  setBackend(_backend: LoggingBackend): void {
    this.logger = null;
  }

  reset(): void {
    this.logger = null;
  }

  private createLogger(): ILogger {
    try {
      const { PinoAdapter } = require("./adapters/pino.adapter");
      return new PinoAdapter();
    } catch (error) {
      console.error("Pino failed to load, using console fallback:", error);
      return this.createConsoleFallback();
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
