/* src/utils/performance.ts */

// Stryker disable all: Performance measurement utilities with timing/instrumentation code.
// Tested via timing assertions in integration tests.

import { log } from "./logger";

const isBun = () => typeof Bun !== "undefined";

// REQUIRED: Standardized performance measurement pattern
export async function measure<T>(name: string, op: () => Promise<T>) {
  const start = isBun() ? Bun.nanoseconds() : performance.now() * 1_000_000;
  const result = await op();
  const ms = (isBun() ? Bun.nanoseconds() : performance.now() * 1_000_000 - start) / 1_000_000;

  log("Performance measurement", {
    component: "performance",
    operation: name,
    duration_ms: Number.parseFloat(ms.toFixed(2)),
    "event.duration": Math.round(ms * 1_000_000), // nanoseconds for ECS
  });
  return { result, ms };
}

export function measureSync<T>(name: string, op: () => T) {
  const start = isBun() ? Bun.nanoseconds() : performance.now() * 1_000_000;
  const result = op();
  const ms = (isBun() ? Bun.nanoseconds() : performance.now() * 1_000_000 - start) / 1_000_000;

  log("Performance measurement", {
    component: "performance",
    operation: name,
    duration_ms: Number.parseFloat(ms.toFixed(2)),
    "event.duration": Math.round(ms * 1_000_000), // nanoseconds for ECS
  });
  return { result, ms };
}

export function getHighResTime(): number {
  return isBun() ? Bun.nanoseconds() : performance.now() * 1_000_000;
}

export function calculateDuration(startTime: number): number {
  return (getHighResTime() - startTime) / 1_000_000;
}

/**
 * Format a duration in milliseconds to a human-readable string with appropriate units.
 * Auto-scales from sub-milliseconds to minutes.
 *
 * Examples:
 * - 0.45 -> "0.45ms"
 * - 123.4 -> "123.4ms"
 * - 1500 -> "1.5s"
 * - 65000 -> "1m 5s"
 */
export function formatResponseTime(ms: number): string {
  if (ms < 1000) {
    // Sub-second: show in milliseconds with up to 2 decimal places
    return `${Number(ms.toFixed(2))}ms`;
  } else if (ms < 60000) {
    // Sub-minute: show in seconds with up to 2 decimal places
    return `${Number((ms / 1000).toFixed(2))}s`;
  } else {
    // Minutes and above: show minutes and seconds
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    if (seconds === 0) {
      return `${minutes}m`;
    }
    return `${minutes}m ${seconds}s`;
  }
}

/**
 * Format uptime in seconds to a human-readable string.
 * Auto-scales from seconds to days.
 *
 * Examples:
 * - 45 -> "45s"
 * - 125 -> "2m 5s"
 * - 3725 -> "1h 2m 5s"
 * - 90125 -> "1d 1h 2m"
 */
export function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.floor(seconds)}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (secs === 0) {
      return `${minutes}m`;
    }
    return `${minutes}m ${secs}s`;
  } else if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (minutes === 0 && secs === 0) {
      return `${hours}h`;
    } else if (secs === 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${hours}h ${minutes}m ${secs}s`;
  } else {
    // Days and above
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours === 0 && minutes === 0) {
      return `${days}d`;
    } else if (minutes === 0) {
      return `${days}d ${hours}h`;
    }
    return `${days}d ${hours}h ${minutes}m`;
  }
}
