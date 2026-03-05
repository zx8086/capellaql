// src/telemetry/consumer-volume.ts

import { loadConfig } from "../config/index";
import { log } from "../utils/logger";

const config = loadConfig();

const consumerRequestCounts = new Map<string, number>();

let consumerVolumeIntervalId: ReturnType<typeof setInterval> | null = null;

export function incrementConsumerRequest(consumerId: string): void {
  if (!consumerId) return;

  const current = consumerRequestCounts.get(consumerId) || 0;
  consumerRequestCounts.set(consumerId, current + 1);
}

export function getVolumeBucket(consumerId: string): string {
  if (!consumerId) return "low";

  const hourlyCount = consumerRequestCounts.get(consumerId) || 0;

  if (hourlyCount > 5000) return "high";
  if (hourlyCount > 100) return "medium";
  return "low";
}

export function getConsumerCountByVolume(volume: "high" | "medium" | "low"): number {
  let count = 0;

  for (const [consumerId] of consumerRequestCounts) {
    if (getVolumeBucket(consumerId) === volume) {
      count++;
    }
  }

  return count;
}

export function getConsumerVolumeStats(): {
  high: number;
  medium: number;
  low: number;
  total: number;
} {
  return {
    high: getConsumerCountByVolume("high"),
    medium: getConsumerCountByVolume("medium"),
    low: getConsumerCountByVolume("low"),
    total: consumerRequestCounts.size,
  };
}

// Clear consumer request counts every 15 minutes to prevent unbounded memory growth
// (reduced from 1 hour to limit memory accumulation from unique consumer IDs)
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

// Only start interval in non-test environments to prevent test suite interval leaks
if (config.server.nodeEnv !== "test") {
  consumerVolumeIntervalId = setInterval(() => {
    const previousSize = consumerRequestCounts.size;
    consumerRequestCounts.clear();
    if (previousSize > 0) {
      log("Cleared consumer volume tracking (periodic reset)", {
        component: "consumer-volume",
        action: "periodic_clear",
        clearedEntries: previousSize,
        intervalMinutes: FIFTEEN_MINUTES_MS / 60000,
      });
    }
  }, FIFTEEN_MINUTES_MS);
}

export function shutdownConsumerVolume(): void {
  if (consumerVolumeIntervalId) {
    clearInterval(consumerVolumeIntervalId);
    consumerVolumeIntervalId = null;
  }
  consumerRequestCounts.clear();
}
