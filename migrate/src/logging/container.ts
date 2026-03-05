// src/logging/container.ts
// SIO-447: DI container for logger selection

import pkg from "../../package.json" with { type: "json" };
import { loadConfig } from "../config/index";
import { PinoAdapter } from "./adapters/pino.adapter";
import type { ILogger, ITelemetryLogger, LoggerConfig, LogLevel } from "./ports/logger.port";

/**
 * Supported logging backends
 */
export type LoggingBackend = "pino" | "winston";

/**
 * Logger container - singleton for logger instance management.
 * Allows runtime backend selection and testing injection.
 */
class LoggerContainer {
  private static instance: LoggerContainer | null = null;
  private currentLogger: ITelemetryLogger | null = null;
  // SIO-447: Default to pino for performance (5-10x faster than Winston)
  private currentBackend: LoggingBackend = "pino";

  private constructor() {
    // Determine backend from environment
    const envBackend = process.env.LOGGING_BACKEND?.toLowerCase();
    if (envBackend === "pino" || envBackend === "winston") {
      this.currentBackend = envBackend;
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): LoggerContainer {
    if (!LoggerContainer.instance) {
      LoggerContainer.instance = new LoggerContainer();
    }
    return LoggerContainer.instance;
  }

  /**
   * Get the current logger instance
   */
  getLogger(): ITelemetryLogger {
    if (!this.currentLogger) {
      this.currentLogger = this.createDefaultLogger();
    }
    return this.currentLogger;
  }

  /**
   * Get the current logging backend
   */
  getBackend(): LoggingBackend {
    return this.currentBackend;
  }

  /**
   * Set a custom logger (for testing)
   */
  setLogger(logger: ITelemetryLogger): void {
    this.currentLogger = logger;
  }

  /**
   * Set the logging backend
   */
  setBackend(backend: LoggingBackend): void {
    this.currentBackend = backend;
    this.currentLogger = null; // Force recreation
  }

  /**
   * Reset to default state (for tests)
   */
  reset(): void {
    this.currentLogger = null;
    // Re-read backend from environment
    const envBackend = process.env.LOGGING_BACKEND?.toLowerCase();
    if (envBackend === "pino" || envBackend === "winston") {
      this.currentBackend = envBackend;
    } else {
      // SIO-447: Default to pino for performance (5-10x faster than Winston)
      this.currentBackend = "pino";
    }
  }

  /**
   * Create the default logger based on current backend
   */
  private createDefaultLogger(): ITelemetryLogger {
    const config = this.loadLoggerConfig();

    if (this.currentBackend === "pino") {
      return new PinoAdapter(config);
    }
    // Default: use Winston adapter (imported dynamically to avoid circular deps)
    return this.createWinstonAdapter();
  }

  /**
   * Load logger configuration from app config
   */
  private loadLoggerConfig(): LoggerConfig {
    try {
      const appConfig = loadConfig();
      const telemetry = appConfig.telemetry;

      return {
        level: (telemetry.logLevel || "info") as LogLevel,
        service: {
          name: telemetry.serviceName || "authentication-service",
          version: telemetry.serviceVersion || pkg.version || "1.0.0",
          environment: telemetry.environment || "development",
        },
        mode: telemetry.mode || "console",
      };
    } catch (error) {
      console.warn("Could not load logger config, using defaults:", error);
      return {
        level: "info",
        service: {
          name: "authentication-service",
          version: pkg.version || "1.0.0",
          environment: "development",
        },
        mode: "console",
      };
    }
  }

  /**
   * Create Winston adapter (lazy import to avoid circular deps)
   */
  private createWinstonAdapter(): ITelemetryLogger {
    // Import existing WinstonTelemetryLogger wrapped as ITelemetryLogger
    // This will be implemented in Phase 2
    const { WinstonAdapter } = require("./adapters/winston.adapter");
    return new WinstonAdapter(this.loadLoggerConfig());
  }
}

/**
 * Singleton container instance
 */
export const loggerContainer = LoggerContainer.getInstance();

/**
 * Convenience function to get the logger
 */
export function getLogger(): ITelemetryLogger {
  return loggerContainer.getLogger();
}

/**
 * Get a child logger with bound context
 */
export function getChildLogger(bindings: Record<string, unknown>): ILogger {
  return loggerContainer.getLogger().child(bindings);
}
