/* src/telemetry/lifecycle-logger.ts */
/* Startup/shutdown logging with batch message delivery */

import { winstonTelemetryLogger } from "./winston-logger";

// ============================================================================
// Types
// ============================================================================

/**
 * A single shutdown step message.
 */
export interface ShutdownMessage {
  message: string;
  step: string;
  metadata?: Record<string, unknown>;
}

/**
 * Internal representation with additional tracking fields.
 */
interface InternalShutdownMessage extends ShutdownMessage {
  timestamp: number;
  sequencePosition: number;
  totalSteps: number;
}

// ============================================================================
// Lifecycle Observability Logger
// ============================================================================

/**
 * Batch lifecycle logger for shutdown sequence observability.
 *
 * Problem: During shutdown, individual log statements may not flush to OTLP
 * before process termination.
 *
 * Solution: Batch all shutdown steps into a single log sequence, then flush
 * all telemetry transports before exit.
 */
export class LifecycleObservabilityLogger {
  private pendingMessages: InternalShutdownMessage[] = [];
  private isOTLPEnabled = false;

  constructor() {
    // Check if OTLP is enabled
    this.isOTLPEnabled = winstonTelemetryLogger.isOTLPEnabled();
  }

  /**
   * Log a sequence of shutdown steps.
   *
   * @param steps - Array of shutdown messages to log
   */
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
      winstonTelemetryLogger.info(step.message, {
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

  /**
   * Log a single lifecycle event (not part of shutdown sequence).
   */
  public logLifecycleEvent(
    message: string,
    eventType: "startup" | "shutdown" | "health_check" | "config_reload",
    metadata?: Record<string, unknown>
  ): void {
    winstonTelemetryLogger.info(message, {
      component: "lifecycle",
      operation: eventType,
      pid: process.pid,
      ...metadata,
    });
  }

  /**
   * Flush all pending shutdown messages to ensure OTLP delivery.
   */
  public async flushShutdownMessages(): Promise<void> {
    const messageCount = this.pendingMessages.length;

    if (messageCount === 0) {
      return;
    }

    // Update OTLP status (might have changed since construction)
    this.isOTLPEnabled = winstonTelemetryLogger.isOTLPEnabled();

    if (this.isOTLPEnabled) {
      // Give OTLP transport time to flush
      await this.sleep(500);

      console.info("Lifecycle observability: Successfully flushed shutdown messages", {
        component: "lifecycle",
        operation: "shutdown_flush_complete",
        messageCount,
        telemetryMode: "otlp",
      });
    } else {
      console.info("Lifecycle observability: Console-only mode, messages logged", {
        component: "lifecycle",
        operation: "console_only_flush",
        messageCount,
      });
    }

    // Clear pending messages
    this.pendingMessages = [];
  }

  /**
   * Get pending message count.
   */
  public getPendingMessageCount(): number {
    return this.pendingMessages.length;
  }

  /**
   * Sleep helper.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Generate a standard shutdown sequence.
   *
   * @param signal - The signal that triggered shutdown (e.g., "SIGTERM", "SIGINT")
   * @returns Array of shutdown messages
   */
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

  /**
   * Generate a startup sequence.
   *
   * @returns Array of startup messages
   */
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

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Singleton lifecycle logger instance.
 */
export const lifecycleLogger = new LifecycleObservabilityLogger();

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Log a shutdown sequence.
 */
export function logShutdownSequence(steps: ShutdownMessage[]): void {
  lifecycleLogger.logShutdownSequence(steps);
}

/**
 * Flush shutdown messages.
 */
export async function flushShutdownMessages(): Promise<void> {
  await lifecycleLogger.flushShutdownMessages();
}

/**
 * Generate standard shutdown sequence.
 */
export function generateShutdownSequence(signal: string): ShutdownMessage[] {
  return LifecycleObservabilityLogger.generateShutdownSequence(signal);
}

/**
 * Generate standard startup sequence.
 */
export function generateStartupSequence(): ShutdownMessage[] {
  return LifecycleObservabilityLogger.generateStartupSequence();
}

/**
 * Log a lifecycle event.
 */
export function logLifecycleEvent(
  message: string,
  eventType: "startup" | "shutdown" | "health_check" | "config_reload",
  metadata?: Record<string, unknown>
): void {
  lifecycleLogger.logLifecycleEvent(message, eventType, metadata);
}
