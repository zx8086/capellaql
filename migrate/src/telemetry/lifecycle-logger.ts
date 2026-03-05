// src/telemetry/lifecycle-logger.ts

import { log } from "../utils/logger";
import { getTelemetryStatus } from "./instrumentation";

export interface ShutdownMessage {
  message: string;
  step: string;
  metadata?: Record<string, unknown>;
}

export class LifecycleObservabilityLogger {
  private pendingShutdownMessages: Array<{
    message: string;
    timestamp: number;
    step: string;
    metadata?: Record<string, unknown>;
  }> = [];
  private shutdownInProgress = false;

  public logShutdownSequence(messages: ShutdownMessage[]): void {
    this.shutdownInProgress = true;

    const baseTimestamp = Date.now();
    messages.forEach((msg, index) => {
      const logData = {
        message: msg.message,
        timestamp: baseTimestamp + index,
        step: msg.step,
        metadata: {
          signal: process.env.SHUTDOWN_SIGNAL || "SIGINT",
          pid: process.pid,
          shutdownSequence: true,
          sequencePosition: index + 1,
          totalSteps: messages.length,
          ...msg.metadata,
        },
      };

      this.pendingShutdownMessages.push(logData);

      log(logData.message, {
        component: "lifecycle",
        operation: "shutdown_sequence",
        shutdownStep: logData.step,
        timestamp: new Date(logData.timestamp).toISOString(),
        ...logData.metadata,
      });
    });
  }

  public async flushShutdownMessages(): Promise<void> {
    if (!this.shutdownInProgress || this.pendingShutdownMessages.length === 0) {
      return;
    }

    try {
      const telemetryStatus = getTelemetryStatus();

      if (telemetryStatus.initialized) {
        const { forceMetricsFlush } = await import("./instrumentation");
        await forceMetricsFlush();

        await new Promise((resolve) => setTimeout(resolve, 500));

        log(
          `Lifecycle observability: Successfully flushed ${this.pendingShutdownMessages.length} shutdown messages`,
          {
            component: "lifecycle",
            operation: "shutdown_flush_complete",
            messageCount: this.pendingShutdownMessages.length,
            telemetryMode: telemetryStatus.config.mode,
          }
        );
      } else {
        log(
          `Lifecycle observability: Console-only mode, ${this.pendingShutdownMessages.length} messages logged`,
          {
            component: "lifecycle",
            operation: "console_only_flush",
            messageCount: this.pendingShutdownMessages.length,
          }
        );
      }

      this.pendingShutdownMessages = [];
    } catch (flushError) {
      console.error("Lifecycle observability: Failed to flush shutdown messages:", flushError);
    }
  }

  public static generateShutdownSequence(signal: string): ShutdownMessage[] {
    return [
      {
        message: `Authentication service shutdown initiated via ${signal}`,
        step: "shutdown_initiated",
        metadata: { reason: "signal_received", signal },
      },
      {
        message: "Stopping HTTP server and rejecting new connections",
        step: "http_server_stop",
      },
      {
        message: "Flushing telemetry data and metrics",
        step: "telemetry_flush",
      },
      {
        message: "Shutting down profiling service",
        step: "profiling_shutdown",
      },
      {
        message: "Closing cache connections and Kong service",
        step: "external_services_shutdown",
      },
      {
        message: "Authentication service shutdown completed successfully",
        step: "shutdown_completed",
        metadata: { exitCode: 0 },
      },
    ];
  }
}

export const lifecycleLogger = new LifecycleObservabilityLogger();
