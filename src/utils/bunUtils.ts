// Bun-specific utilities and optimizations

import { promises as fs } from "fs";
import config from "$config";

export async function sleep(ms: number): Promise<void> {
  if (typeof Bun !== "undefined") {
    return Bun.sleep(ms);
  }

  // Fallback for non-Bun environments
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export namespace BunFile {
  export async function read(path: string): Promise<string> {
    if (typeof Bun !== "undefined") {
      try {
        const file = Bun.file(path);
        return await file.text();
      } catch (error) {
        throw new Error(`Failed to read file with Bun.file(): ${error}`);
      }
    }

    // Fallback to fs for compatibility
    return fs.readFile(path, "utf8");
  }

  export async function write(path: string, content: string): Promise<void> {
    if (typeof Bun !== "undefined") {
      try {
        await Bun.write(path, content);
        return;
      } catch (error) {
        throw new Error(`Failed to write file with Bun.write(): ${error}`);
      }
    }

    // Fallback to fs for compatibility
    return fs.writeFile(path, content, "utf8");
  }

  export async function exists(path: string): Promise<boolean> {
    if (typeof Bun !== "undefined") {
      try {
        const file = Bun.file(path);
        return await file.exists();
      } catch {
        return false;
      }
    }

    // Fallback using fs.access
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  export async function size(path: string): Promise<number> {
    if (typeof Bun !== "undefined") {
      const file = Bun.file(path);
      return file.size;
    }

    const stats = await fs.stat(path);
    return stats.size;
  }
}

// Retry with exponential backoff
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000,
  maxDelay = 30000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      // Calculate exponential backoff delay
      const delay = Math.min(baseDelay * 2 ** (attempt - 1), maxDelay);

      console.warn(`Operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  throw new Error("Should never reach here");
}

// Circuit breaker for external services
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: "closed" | "open" | "half-open" = "closed";

  constructor(
    private threshold = 5,
    _timeout = 60000,
    private resetTimeout = 30000
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = "half-open";
      } else {
        throw new Error("Circuit breaker is open");
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = "closed";
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = "open";
    }
  }

  getStats() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      isHealthy: this.state === "closed",
    };
  }
}

export namespace BunProcess {
  export async function spawn(
    command: string[],
    options: {
      cwd?: string;
      env?: Record<string, string>;
      stdin?: string;
    } = {}
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }> {
    if (typeof Bun !== "undefined") {
      try {
        const proc = Bun.spawn(command, {
          cwd: options.cwd,
          env: { ...Bun.env, ...options.env },
          stdin: options.stdin ? "pipe" : undefined,
        });

        if (options.stdin && proc.stdin) {
          proc.stdin.write(options.stdin);
          proc.stdin.end();
        }

        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;

        return { stdout, stderr, exitCode };
      } catch (error) {
        throw new Error(`Process spawn failed: ${error}`);
      }
    }

    // Fallback to child_process for compatibility
    const { spawn } = await import("child_process");
    return new Promise((resolve, reject) => {
      const child = spawn(command[0], command.slice(1), {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (exitCode) => {
        resolve({ stdout, stderr, exitCode: exitCode || 0 });
      });

      child.on("error", reject);

      if (options.stdin) {
        child.stdin?.write(options.stdin);
        child.stdin?.end();
      }
    });
  }
}

export namespace BunEnv {
  export function get(key: string): string | undefined {
    if (typeof Bun !== "undefined") {
      return Bun.env[key];
    }
    return process.env[key];
  }

  export function isBun(): boolean {
    return typeof Bun !== "undefined";
  }

  export function getRuntimeInfo() {
    if (typeof Bun !== "undefined") {
      return {
        runtime: "bun" as const,
        version: Bun.version,
        platform: process.platform,
        arch: process.arch,
      };
    }

    return {
      runtime: "node" as const,
      version: process.version,
      platform: process.platform,
      arch: process.arch,
    };
  }
}

export namespace BunPerf {
  export async function measure<T>(
    operation: () => Promise<T>,
    label?: string
  ): Promise<{ result: T; duration: number }> {
    const start = typeof Bun !== "undefined" ? Bun.nanoseconds() : performance.now() * 1_000_000;

    try {
      const result = await operation();
      const end = typeof Bun !== "undefined" ? Bun.nanoseconds() : performance.now() * 1_000_000;
      const duration = (end - start) / 1_000_000; // Convert to milliseconds

      if (label) {
        console.log(`${label}: ${duration.toFixed(2)}ms`);
      }

      return { result, duration };
    } catch (error) {
      const end = typeof Bun !== "undefined" ? Bun.nanoseconds() : performance.now() * 1_000_000;
      const duration = (end - start) / 1_000_000;

      if (label) {
        console.error(`${label} failed after ${duration.toFixed(2)}ms:`, error);
      }

      throw error;
    }
  }

  export function createTimer(label: string) {
    const start = typeof Bun !== "undefined" ? Bun.nanoseconds() : performance.now() * 1_000_000;

    return {
      end: () => {
        const end = typeof Bun !== "undefined" ? Bun.nanoseconds() : performance.now() * 1_000_000;
        const duration = (end - start) / 1_000_000;
        console.log(`${label}: ${duration.toFixed(2)}ms`);
        return duration;
      },
    };
  }
}

export async function createHealthcheck(): Promise<{
  status: string;
  timestamp: string;
  uptime: number;
  runtime: ReturnType<typeof BunEnv.getRuntimeInfo>;
  memory: NodeJS.MemoryUsage;
  config: {
    environment: string;
    telemetryEnabled: boolean;
  };
}> {
  return {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    runtime: BunEnv.getRuntimeInfo(),
    memory: process.memoryUsage(),
    config: {
      environment: config.runtime.NODE_ENV,
      telemetryEnabled: config.telemetry.ENABLE_OPENTELEMETRY,
    },
  };
}

export default {
  sleep,
  BunFile,
  retryWithBackoff,
  CircuitBreaker,
  BunProcess,
  BunEnv,
  BunPerf,
  createHealthcheck,
};
