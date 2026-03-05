// src/logging/critical-lifecycle.ts
// SIO-447: Critical lifecycle logging that bypasses LOG_LEVEL filtering
// These messages ALWAYS appear regardless of LOG_LEVEL setting

import pkg from "../../package.json" with { type: "json" };

/**
 * Format timestamp in Winston-compatible format: "h:MM:ss TT"
 */
function formatTime(date: Date): string {
  const hours = date.getHours();
  const ampm = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")} ${ampm}`;
}

/**
 * Format a critical lifecycle message for stdout.
 * Matches the Winston/Pino console format for consistency.
 */
function formatCriticalMessage(
  level: "info" | "warn" | "error",
  message: string,
  context?: Record<string, unknown>
): string {
  const timestamp = formatTime(new Date());

  // Color codes matching Pino adapter
  const colors: Record<string, string> = {
    info: "\x1b[32m", // green
    warn: "\x1b[33m", // yellow
    error: "\x1b[31m", // red
  };
  const reset = "\x1b[0m";

  const contextStr =
    context && Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : "";

  return `${timestamp} ${colors[level]}${level}${reset}: ${message}${contextStr}\n`;
}

/**
 * Write a critical lifecycle message directly to stdout.
 * This ALWAYS appears regardless of LOG_LEVEL setting.
 *
 * Use sparingly - only for service start/stop events that operators
 * must always see in container logs.
 */
export function criticalLifecycleLog(message: string, context?: Record<string, unknown>): void {
  const formatted = formatCriticalMessage("info", message, context);
  process.stdout.write(formatted);
}

/**
 * Write a critical lifecycle warning directly to stdout.
 */
export function criticalLifecycleWarn(message: string, context?: Record<string, unknown>): void {
  const formatted = formatCriticalMessage("warn", message, context);
  process.stdout.write(formatted);
}

/**
 * Write a critical lifecycle error directly to stderr.
 */
export function criticalLifecycleError(message: string, context?: Record<string, unknown>): void {
  const formatted = formatCriticalMessage("error", message, context);
  process.stderr.write(formatted);
}

/**
 * Log service startup - ALWAYS visible regardless of LOG_LEVEL.
 * This is the first message operators see when the service starts.
 */
export function logServiceStartup(port: number, environment: string): void {
  criticalLifecycleLog("Authentication Service starting", {
    component: "server",
    event: "startup",
    version: pkg.version || "1.0.0",
    environment,
    port,
    pid: process.pid,
    critical: true,
  });
}

/**
 * Log service ready - ALWAYS visible regardless of LOG_LEVEL.
 * This confirms the service is accepting requests.
 */
export function logServiceReady(port: number): void {
  criticalLifecycleLog("Authentication Service ready", {
    component: "server",
    event: "ready",
    url: `http://localhost:${port}`,
    pid: process.pid,
    critical: true,
  });
}

/**
 * Log service shutdown initiated - ALWAYS visible regardless of LOG_LEVEL.
 */
export function logServiceShutdownInitiated(signal: string): void {
  criticalLifecycleLog(`Authentication Service shutdown initiated (${signal})`, {
    component: "server",
    event: "shutdown_initiated",
    signal,
    pid: process.pid,
    critical: true,
  });
}

/**
 * Log service shutdown completed - ALWAYS visible regardless of LOG_LEVEL.
 */
export function logServiceShutdownCompleted(): void {
  criticalLifecycleLog("Authentication Service shutdown completed", {
    component: "server",
    event: "shutdown_completed",
    pid: process.pid,
    critical: true,
  });
}

/**
 * Log service shutdown error - ALWAYS visible regardless of LOG_LEVEL.
 */
export function logServiceShutdownError(error: Error): void {
  criticalLifecycleError("Authentication Service shutdown error", {
    component: "server",
    event: "shutdown_error",
    error: error.message,
    pid: process.pid,
    critical: true,
  });
}
