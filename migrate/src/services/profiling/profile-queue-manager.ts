// src/services/profiling/profile-queue-manager.ts

import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Subprocess } from "bun";
import type { ContinuousProfilingConfig } from "../../config/schemas";
import { error, log, warn } from "../../utils/logger";

// Maximum queue size to prevent unbounded memory growth from accumulated profile requests
const MAX_QUEUE_SIZE = 100;

interface ProfileRequest {
  endpoint: string;
  reason: "sla_violation" | "manual";
  requestedAt: number;
  violationMetrics?: {
    p95: number;
    p99: number;
    count: number;
  };
}

interface ActiveProfile {
  request: ProfileRequest;
  subprocess: Subprocess;
  startedAt: number;
  outputDir: string;
}

export class ProfileQueueManager {
  private readonly config: ContinuousProfilingConfig;
  private readonly maxConcurrent: number;
  private readonly maxStorageBytes: number;
  private activeProfile: ActiveProfile | null = null;
  private readonly queue: ProfileRequest[] = [];
  private isShuttingDown = false;

  constructor(config: ContinuousProfilingConfig, maxStorageGb = 1) {
    this.config = config;
    this.maxConcurrent = config.maxConcurrentProfiles;
    this.maxStorageBytes = maxStorageGb * 1024 * 1024 * 1024;

    this.ensureOutputDirectory();

    log("Profile Queue Manager initialized", {
      component: "profile-queue-manager",
      maxConcurrent: this.maxConcurrent,
      maxStorageGb,
      outputDir: config.outputDir,
    });
  }

  private ensureOutputDirectory(): void {
    if (!existsSync(this.config.outputDir)) {
      mkdirSync(this.config.outputDir, { recursive: true });
      log("Created profiling output directory", {
        component: "profile-queue-manager",
        directory: this.config.outputDir,
      });
    }
  }

  private calculateDirectorySize(dirPath: string): number {
    if (!existsSync(dirPath)) {
      return 0;
    }

    let totalSize = 0;

    try {
      const files = readdirSync(dirPath);

      for (const file of files) {
        const filePath = join(dirPath, file);
        const stats = statSync(filePath);

        if (stats.isDirectory()) {
          totalSize += this.calculateDirectorySize(filePath);
        } else {
          totalSize += stats.size;
        }
      }
    } catch (err) {
      error("Failed to calculate directory size", {
        component: "profile-queue-manager",
        directory: dirPath,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return totalSize;
  }

  private isStorageQuotaExceeded(): boolean {
    const currentSize = this.calculateDirectorySize(this.config.outputDir);
    const exceeded = currentSize >= this.maxStorageBytes;

    if (exceeded) {
      warn("Storage quota exceeded", {
        component: "profile-queue-manager",
        currentSizeMb: (currentSize / 1024 / 1024).toFixed(2),
        maxSizeMb: (this.maxStorageBytes / 1024 / 1024).toFixed(2),
        outputDir: this.config.outputDir,
      });
    }

    return exceeded;
  }

  canStartProfiling(): boolean {
    if (this.isShuttingDown) {
      return false;
    }

    if (this.activeProfile !== null) {
      return false;
    }

    if (this.isStorageQuotaExceeded()) {
      return false;
    }

    return true;
  }

  async requestProfiling(request: ProfileRequest): Promise<boolean> {
    if (this.isShuttingDown) {
      warn("Cannot request profiling during shutdown", {
        component: "profile-queue-manager",
        endpoint: request.endpoint,
      });
      return false;
    }

    if (this.isStorageQuotaExceeded()) {
      warn("Cannot request profiling - storage quota exceeded", {
        component: "profile-queue-manager",
        endpoint: request.endpoint,
        reason: request.reason,
      });
      return false;
    }

    if (this.activeProfile !== null) {
      // Enforce max queue size to prevent unbounded memory growth
      if (this.queue.length >= MAX_QUEUE_SIZE) {
        warn("Profiling queue full, rejecting request", {
          component: "profile-queue-manager",
          endpoint: request.endpoint,
          reason: request.reason,
          queueLength: this.queue.length,
          maxQueueSize: MAX_QUEUE_SIZE,
        });
        return false;
      }

      this.queue.push(request);
      log("Profiling request queued", {
        component: "profile-queue-manager",
        endpoint: request.endpoint,
        reason: request.reason,
        queueLength: this.queue.length,
      });
      return false;
    }

    return await this.startProfiling(request);
  }

  private async startProfiling(request: ProfileRequest): Promise<boolean> {
    try {
      const timestamp = Date.now();

      log("Starting profiling session", {
        component: "profile-queue-manager",
        endpoint: request.endpoint,
        reason: request.reason,
        outputDir: this.config.outputDir,
        violationMetrics: request.violationMetrics,
      });

      const subprocess = Bun.spawn(
        [
          "bun",
          "--cpu-prof-md",
          `--cpu-prof-dir=${this.config.outputDir}`,
          "--heap-prof-md",
          `--heap-prof-dir=${this.config.outputDir}`,
          "src/server.ts",
        ],
        {
          stdout: "pipe",
          stderr: "pipe",
          env: {
            ...process.env,
            AUTO_PROFILING_TRIGGER: "true",
            AUTO_PROFILING_ENDPOINT: request.endpoint,
            AUTO_PROFILING_TIMESTAMP: timestamp.toString(),
            AUTO_PROFILING_REASON: request.reason,
          },
        }
      );

      this.activeProfile = {
        request,
        subprocess,
        startedAt: timestamp,
        outputDir: this.config.outputDir,
      };

      setTimeout(() => {
        this.stopProfiling();
      }, 30000);

      return true;
    } catch (err) {
      error("Failed to start profiling session", {
        component: "profile-queue-manager",
        endpoint: request.endpoint,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  private async stopProfiling(): Promise<void> {
    if (!this.activeProfile) {
      return;
    }

    const session = this.activeProfile;
    this.activeProfile = null;

    try {
      session.subprocess.kill("SIGTERM");

      const durationSeconds = (Date.now() - session.startedAt) / 1000;

      log("Profiling session completed", {
        component: "profile-queue-manager",
        endpoint: session.request.endpoint,
        reason: session.request.reason,
        durationSeconds: durationSeconds.toFixed(1),
        outputDir: session.outputDir,
      });

      if (this.queue.length > 0 && !this.isShuttingDown) {
        const nextRequest = this.queue.shift();
        if (nextRequest) {
          log("Processing queued profiling request", {
            component: "profile-queue-manager",
            endpoint: nextRequest.endpoint,
            queueLength: this.queue.length,
          });
          await this.startProfiling(nextRequest);
        }
      }
    } catch (err) {
      error("Failed to stop profiling session", {
        component: "profile-queue-manager",
        endpoint: session.request.endpoint,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  getStats(): {
    hasActiveProfile: boolean;
    activeProfile: {
      endpoint: string;
      reason: string;
      durationSeconds: number;
    } | null;
    queueLength: number;
    queuedEndpoints: string[];
    storageSizeMb: number;
    storageQuotaMb: number;
    storageUsagePercent: number;
  } {
    const currentSize = this.calculateDirectorySize(this.config.outputDir);
    const maxSize = this.maxStorageBytes;

    return {
      hasActiveProfile: this.activeProfile !== null,
      activeProfile: this.activeProfile
        ? {
            endpoint: this.activeProfile.request.endpoint,
            reason: this.activeProfile.request.reason,
            durationSeconds: (Date.now() - this.activeProfile.startedAt) / 1000,
          }
        : null,
      queueLength: this.queue.length,
      queuedEndpoints: this.queue.map((r) => r.endpoint),
      storageSizeMb: currentSize / 1024 / 1024,
      storageQuotaMb: maxSize / 1024 / 1024,
      storageUsagePercent: (currentSize / maxSize) * 100,
    };
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    log("Profile Queue Manager shutting down", {
      component: "profile-queue-manager",
      hasActiveProfile: this.activeProfile !== null,
      queueLength: this.queue.length,
    });

    if (this.activeProfile) {
      await this.stopProfiling();
    }

    this.queue.length = 0;
  }
}
