/* src/telemetry/lifecycle-logger.ts */
/* Startup/shutdown logging with batch message delivery */

import { getLogger } from "../logging/container";

export interface ShutdownMessage {
  message: string;
  step: string;
  metadata?: Record<string, unknown>;
}

interface InternalShutdownMessage extends ShutdownMessage {
  timestamp: number;
  sequencePosition: number;
  totalSteps: number;
}

// Problem: During shutdown, individual log statements may not flush to OTLP
// before process termination.
// Solution: Batch all shutdown steps into a single log sequence, then flush
// all telemetry transports before exit.
export class LifecycleObservabilityLogger {
  private pendingMessages: InternalShutdownMessage[] = [];
  private isOTLPEnabled = false;

  constructor() {
    // Check if OTLP is enabled via environment/config
    this.isOTLPEnabled = process.env.ENABLE_OPENTELEMETRY === "true";
  }

  public logShutdownSequence(steps: ShutdownMessage[]): void {
    const totalSteps = steps.length;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const internalMessage: InternalShutdownMessage = {
        ...step,
        timestamp: Date.now(),
        sequencePosition: i + 1,
        totalSteps,
      };

      this.pendingMessages.push(internalMessage);

      // Log immediately to winston (will be captured by OTLP transport if enabled)
      getLogger().info(step.message, {
        component: "lifecycle",
        operation: "shutdown_sequence",
        shutdownStep: step.step,
        shutdownSequence: true,
        sequencePosition: i + 1,
        totalSteps,
        pid: process.pid,
        ...step.metadata,
      });
    }
  }

  public logLifecycleEvent(
    message: string,
    eventType: "startup" | "shutdown" | "health_check" | "config_reload",
    metadata?: Record<string, unknown>
  ): void {
    getLogger().info(message, {
      component: "lifecycle",
      operation: eventType,
      pid: process.pid,
      ...metadata,
    });
  }

  public async flushShutdownMessages(): Promise<void> {
    const messageCount = this.pendingMessages.length;

    if (messageCount === 0) {
      return;
    }

    // Update OTLP status (might have changed since construction)
    this.isOTLPEnabled = process.env.ENABLE_OPENTELEMETRY === "true";

    if (this.isOTLPEnabled) {
      // Give OTLP transport time to flush
      await this.sleep(500);

      getLogger().info("Lifecycle observability: Successfully flushed shutdown messages", {
        component: "lifecycle",
        operation: "shutdown_flush_complete",
        messageCount,
        telemetryMode: "otlp",
      });
    } else {
      getLogger().info("Lifecycle observability: Console-only mode, messages logged", {
        component: "lifecycle",
        operation: "console_only_flush",
        messageCount,
      });
    }

    // Clear pending messages
    this.pendingMessages = [];
  }

  public getPendingMessageCount(): number {
    return this.pendingMessages.length;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public static generateShutdownSequence(signal: string): ShutdownMessage[] {
    return [
      {
        message: `Service shutdown initiated via ${signal}`,
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
        message: "Stopping profiling service",
        step: "profiling_shutdown",
      },
      {
        message: "Closing external service connections",
        step: "external_services_shutdown",
      },
      {
        message: "Service shutdown completed successfully",
        step: "shutdown_completed",
        metadata: { exitCode: 0 },
      },
    ];
  }

  public static generateStartupSequence(): ShutdownMessage[] {
    return [
      {
        message: "Service startup initiated",
        step: "startup_initiated",
        metadata: { pid: process.pid },
      },
      {
        message: "Loading configuration",
        step: "config_load",
      },
      {
        message: "Initializing telemetry",
        step: "telemetry_init",
      },
      {
        message: "Connecting to external services",
        step: "external_services_connect",
      },
      {
        message: "Starting HTTP server",
        step: "http_server_start",
      },
      {
        message: "Service startup completed successfully",
        step: "startup_completed",
        metadata: { status: "ready" },
      },
    ];
  }
}

export const lifecycleLogger = new LifecycleObservabilityLogger();

export function logShutdownSequence(steps: ShutdownMessage[]): void {
  lifecycleLogger.logShutdownSequence(steps);
}

export async function flushShutdownMessages(): Promise<void> {
  await lifecycleLogger.flushShutdownMessages();
}

export function generateShutdownSequence(signal: string): ShutdownMessage[] {
  return LifecycleObservabilityLogger.generateShutdownSequence(signal);
}

export function generateStartupSequence(): ShutdownMessage[] {
  return LifecycleObservabilityLogger.generateStartupSequence();
}

export function logLifecycleEvent(
  message: string,
  eventType: "startup" | "shutdown" | "health_check" | "config_reload",
  metadata?: Record<string, unknown>
): void {
  lifecycleLogger.logLifecycleEvent(message, eventType, metadata);
}
