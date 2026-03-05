/* src/lib/memoryGuardian.ts */

import { totalmem } from "node:os";
import { log, warn } from "../telemetry/logger";

/**
 * Memory pressure levels with corresponding actions.
 */
export type PressureLevel = "normal" | "elevated" | "high" | "critical";

export interface MemoryGuardianConfig {
  /** Interval between memory checks in ms (default: 5000) */
  checkInterval: number;
  /** Memory usage threshold for elevated level (0-1, default: 0.70) */
  elevatedThreshold: number;
  /** Memory usage threshold for high level (0-1, default: 0.85) */
  highThreshold: number;
  /** Memory usage threshold for critical level (0-1, default: 0.95) */
  criticalThreshold: number;
  /** Maximum memory budget in MB. Defaults to 75% of system memory. */
  memoryBudgetMB: number;
}

const DEFAULT_CONFIG: MemoryGuardianConfig = {
  checkInterval: 5000,
  elevatedThreshold: 0.7,
  highThreshold: 0.85,
  criticalThreshold: 0.95,
  memoryBudgetMB: Math.round((totalmem() * 0.75) / (1024 * 1024)),
};

export interface MemoryStatus {
  pressureLevel: PressureLevel;
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  heapUsageRatio: number;
  timestamp: number;
}

class MemoryGuardian {
  private config: MemoryGuardianConfig;
  private currentLevel: PressureLevel = "normal";
  private checkTimer?: Timer;
  private lastStatus: MemoryStatus;
  private levelChanges = 0;

  constructor(config: Partial<MemoryGuardianConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.lastStatus = this.checkMemory();
    this.startMonitoring();
  }

  /**
   * Check current memory status and update pressure level.
   *
   * Uses RSS / memoryBudgetMB as the pressure ratio. RSS reflects actual
   * process memory consumption, while memoryBudgetMB is a stable ceiling
   * (defaults to 75 % of system RAM). The previous approach used
   * heapUsed / heapTotal which is meaningless — V8/Bun grows heapTotal
   * just ahead of heapUsed, so that ratio always hovers near 0.85–0.98.
   */
  private checkMemory(): MemoryStatus {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / (1024 * 1024);
    const heapTotalMB = memUsage.heapTotal / (1024 * 1024);
    const rssMB = memUsage.rss / (1024 * 1024);
    const memoryUsageRatio = rssMB / this.config.memoryBudgetMB;

    const previousLevel = this.currentLevel;

    if (memoryUsageRatio >= this.config.criticalThreshold) {
      this.currentLevel = "critical";
    } else if (memoryUsageRatio >= this.config.highThreshold) {
      this.currentLevel = "high";
    } else if (memoryUsageRatio >= this.config.elevatedThreshold) {
      this.currentLevel = "elevated";
    } else {
      this.currentLevel = "normal";
    }

    const status: MemoryStatus = {
      pressureLevel: this.currentLevel,
      heapUsedMB: Math.round(heapUsedMB * 100) / 100,
      heapTotalMB: Math.round(heapTotalMB * 100) / 100,
      rssMB: Math.round(rssMB * 100) / 100,
      heapUsageRatio: Math.round(memoryUsageRatio * 1000) / 1000,
      timestamp: Date.now(),
    };

    if (previousLevel !== this.currentLevel) {
      this.levelChanges++;
      const logFn = this.currentLevel === "critical" || this.currentLevel === "high" ? warn : log;
      logFn(`Memory pressure level changed: ${previousLevel} -> ${this.currentLevel}`, {
        ...status,
        levelChanges: this.levelChanges,
      });
    }

    this.lastStatus = status;
    return status;
  }

  /**
   * Start periodic memory monitoring.
   */
  private startMonitoring(): void {
    this.checkTimer = setInterval(() => {
      this.checkMemory();
    }, this.config.checkInterval);

    // Don't prevent process exit
    if (this.checkTimer && typeof this.checkTimer === "object" && "unref" in this.checkTimer) {
      (this.checkTimer as NodeJS.Timer).unref();
    }

    log("Memory guardian started", {
      checkInterval: this.config.checkInterval,
      memoryBudgetMB: this.config.memoryBudgetMB,
      thresholds: {
        elevated: this.config.elevatedThreshold,
        high: this.config.highThreshold,
        critical: this.config.criticalThreshold,
      },
    });
  }

  /**
   * Get the current pressure level.
   */
  getPressureLevel(): PressureLevel {
    return this.currentLevel;
  }

  /**
   * Get the full memory status.
   */
  getStatus(): MemoryStatus {
    return { ...this.lastStatus };
  }

  /**
   * Check if the system should accept new requests.
   * Returns false at critical pressure.
   */
  shouldAcceptRequest(): boolean {
    return this.currentLevel !== "critical";
  }

  /**
   * Get a suggested Retry-After value in seconds based on pressure level.
   */
  getRetryAfter(): number {
    switch (this.currentLevel) {
      case "critical":
        return 30;
      case "high":
        return 10;
      default:
        return 5;
    }
  }

  /**
   * Destroy the guardian and stop monitoring.
   */
  destroy(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }
    log("Memory guardian stopped");
  }
}

// Singleton instance
export const memoryGuardian = new MemoryGuardian();
