// src/telemetry/winston-logger.ts

import ecsFormat from "@elastic/ecs-winston-format";
import { OpenTelemetryTransportV3 } from "@opentelemetry/winston-transport";
import winston from "winston";
import pkg from "../../package.json" with { type: "json" };
import { loadConfig } from "../config/index";

const config = loadConfig();
const telemetryConfig = config.telemetry;

export class WinstonTelemetryLogger {
  private logger: winston.Logger | null = null;

  private initializeLogger(): winston.Logger {
    if (this.logger) {
      return this.logger;
    }

    let localConfig: typeof telemetryConfig;
    try {
      localConfig = telemetryConfig;
    } catch (error) {
      console.warn("Could not load telemetry config, using fallback values:", error);
      localConfig = {
        serviceName: "authentication-service",
        serviceVersion: pkg.version || "1.0.0",
        environment: "development",
        mode: "console",
      } as typeof telemetryConfig;
    }

    this.logger = winston.createLogger({
      level: localConfig.logLevel || "info",
      silent: localConfig.logLevel === "silent",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format((info) => {
          if (info.consumerId !== undefined) {
            info["consumer.id"] = info.consumerId;
            delete info.consumerId;
          }
          if (info.username !== undefined) {
            info["consumer.name"] = info.username;
            delete info.username;
          }
          if (info.requestId !== undefined) {
            info["event.id"] = info.requestId;
            delete info.requestId;
          }
          if (info.totalDuration !== undefined) {
            info["event.duration"] = info.totalDuration;
            delete info.totalDuration;
          }
          return info;
        })(),
        ecsFormat({
          convertErr: true,
          convertReqRes: true,
          apmIntegration: true,
          serviceName: localConfig.serviceName,
          serviceVersion: localConfig.serviceVersion,
          serviceEnvironment: localConfig.environment,
        })
      ),
      transports: this.configureTransports(),
    });

    return this.logger;
  }

  private configureTransports(): winston.transport[] {
    const transports: winston.transport[] = [];
    let mode = "console";
    try {
      // Read mode fresh from config to pick up any TELEMETRY_MODE changes
      const freshConfig = loadConfig();
      mode = freshConfig.telemetry?.mode || "console";
    } catch (_error) {
      console.warn("Could not access telemetry config mode, defaulting to console");
    }

    // Always add console transport as primary/fallback to ensure logs are never lost
    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize({ all: true }),
          winston.format.simple()
        ),
      })
    );

    // Add OTLP transport when configured (in addition to console)
    if (mode === "otlp" || mode === "both") {
      transports.push(new OpenTelemetryTransportV3());
    }

    return transports;
  }

  public info(message: string, context?: Record<string, unknown>): void {
    this.initializeLogger().info(message, context || {});
  }

  public warn(message: string, context?: Record<string, unknown>): void {
    this.initializeLogger().warn(message, context || {});
  }

  public error(message: string, context?: Record<string, unknown>): void {
    this.initializeLogger().error(message, context || {});
  }

  public debug(message: string, context?: Record<string, unknown>): void {
    this.initializeLogger().debug(message, context || {});
  }

  public logHttpRequest(
    method: string,
    path: string,
    statusCode: number,
    _duration: number,
    context?: Record<string, unknown>
  ): void {
    this.info(`HTTP ${method} ${path} - ${statusCode}`, context);
  }

  public logAuthenticationEvent(
    event: string,
    success: boolean,
    context?: Record<string, unknown>
  ): void {
    this.info(`Authentication: ${event} ${success ? "success" : "failed"}`, context);
  }

  public logKongOperation(
    operation: string,
    responseTime: number,
    success: boolean,
    context?: Record<string, unknown>
  ): void {
    this.info(`Kong: ${operation} (${responseTime}ms) ${success ? "success" : "failed"}`, context);
  }

  public async flush(): Promise<void> {
    return new Promise((resolve) => {
      const transports = this.initializeLogger().transports;
      let completed = 0;
      const total = transports.length;

      if (total === 0) {
        resolve();
        return;
      }

      transports.forEach((transport) => {
        transport.end(() => {
          completed++;
          if (completed === total) {
            // Reinitialize logger after flush to restore transports
            this.reinitialize();
            resolve();
          }
        });
      });
    });
  }

  public reinitialize(): void {
    this.logger = null;
    this.initializeLogger();
  }
}

export const winstonTelemetryLogger = new WinstonTelemetryLogger();

export const {
  info,
  warn,
  error,
  debug,
  logHttpRequest,
  logAuthenticationEvent,
  logKongOperation,
} = winstonTelemetryLogger;
