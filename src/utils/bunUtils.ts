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

// Enhanced Bun file operations with streaming support
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

  // Enhanced: Streaming support for large files
  export function stream(path: string): ReadableStream<Uint8Array> {
    if (typeof Bun !== "undefined") {
      return Bun.file(path).stream();
    }

    // Fallback for Node.js environments
    const stream = new ReadableStream({
      start(controller) {
        const readStream = fs.createReadStream(path);
        readStream.on("data", (chunk) => {
          controller.enqueue(new Uint8Array(chunk));
        });
        readStream.on("end", () => controller.close());
        readStream.on("error", (err) => controller.error(err));
      },
    });
    return stream;
  }

  // Enhanced: JSON operations with better error handling
  export async function readJSON<T = any>(path: string): Promise<T> {
    if (typeof Bun !== "undefined") {
      const file = Bun.file(path);
      return await file.json();
    }

    const content = await fs.readFile(path, "utf8");
    return JSON.parse(content);
  }

  export async function writeJSON(path: string, data: any): Promise<void> {
    const content = JSON.stringify(data, null, 2);
    return write(path, content);
  }
}

// Error types that should NOT be retried (expected application errors)
const NON_RETRYABLE_ERROR_TYPES = new Set([
  "DocumentNotFoundError", // Document doesn't exist - won't change on retry
  "DocumentExistsError", // Document already exists - won't change on retry
  "CasMismatchError", // CAS conflict - requires app-level handling
  "AuthenticationFailureError", // Credentials wrong - won't change on retry
  "BucketNotFoundError", // Config error - won't change on retry
  "ScopeNotFoundError", // Config error - won't change on retry
  "CollectionNotFoundError", // Config error - won't change on retry
  "IndexNotFoundError", // Index missing - won't change on retry
  "QueryError", // Query syntax/semantic error - won't change on retry
  "ValidationError", // Input validation - won't change on retry
  "AmbiguousTimeoutError", // NEVER retry ambiguous operations
]);

/**
 * Check if an error is retryable based on its type
 */
function isRetryableError(error: unknown): boolean {
  const errorType = error?.constructor?.name || "UnknownError";
  return !NON_RETRYABLE_ERROR_TYPES.has(errorType);
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
      // Don't retry non-retryable errors - throw immediately
      if (!isRetryableError(error)) {
        throw error;
      }

      if (attempt === maxRetries) {
        throw error;
      }

      // Calculate exponential backoff delay with jitter
      const jitter = Math.random() * 0.1; // 10% jitter
      const delay = Math.min(baseDelay * 2 ** (attempt - 1) * (1 + jitter), maxDelay);

      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorType = error?.constructor?.name || "UnknownError";
      console.warn(
        `Operation failed (attempt ${attempt}/${maxRetries}): [${errorType}] ${errorMessage.substring(0, 200)}. Retrying in ${delay.toFixed(0)}ms...`
      );
      await sleep(delay);
    }
  }

  throw new Error("Should never reach here");
}

// Enhanced circuit breaker with metrics
export class CircuitBreaker {
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private state: "closed" | "open" | "half-open" = "closed";
  private nextAttemptTime = 0;

  constructor(
    private threshold = 5,
    _timeout = 60000,
    private resetTimeout = 30000
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const now = Date.now();

    if (this.state === "open") {
      if (now >= this.nextAttemptTime) {
        this.state = "half-open";
      } else {
        throw new Error(`Circuit breaker is open. Next attempt in ${this.nextAttemptTime - now}ms`);
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
    this.successes++;
    this.state = "closed";
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.nextAttemptTime = this.lastFailureTime + this.resetTimeout;

    if (this.failures >= this.threshold) {
      this.state = "open";
    }
  }

  getStats() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      isHealthy: this.state === "closed",
      successRate: this.successes + this.failures > 0 ? this.successes / (this.successes + this.failures) : 1,
    };
  }

  reset() {
    this.failures = 0;
    this.successes = 0;
    this.state = "closed";
    this.nextAttemptTime = 0;
  }
}

// Enhanced process management with better error handling
export namespace BunProcess {
  export async function spawn(
    command: string[],
    options: {
      cwd?: string;
      env?: Record<string, string>;
      stdin?: string;
      timeout?: number;
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

        // Handle timeout if specified - use Promise.race to properly reject
        let timedOut = false;
        const timeoutPromise = options.timeout
          ? new Promise<never>((_, reject) => {
              setTimeout(() => {
                timedOut = true;
                proc.kill();
                reject(new Error(`Process timeout after ${options.timeout}ms`));
              }, options.timeout);
            })
          : null;

        if (options.stdin && proc.stdin) {
          proc.stdin.write(options.stdin);
          proc.stdin.end();
        }

        const processPromise = (async () => {
          const stdout = await new Response(proc.stdout).text();
          const stderr = await new Response(proc.stderr).text();
          const exitCode = await proc.exited;
          if (timedOut) {
            throw new Error(`Process timeout after ${options.timeout}ms`);
          }
          return { stdout, stderr, exitCode };
        })();

        if (timeoutPromise) {
          return await Promise.race([processPromise, timeoutPromise]);
        }
        return await processPromise;
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
      let timeoutId: NodeJS.Timeout | undefined;

      if (options.timeout) {
        timeoutId = setTimeout(() => {
          child.kill("SIGTERM");
          reject(new Error(`Process timeout after ${options.timeout}ms`));
        }, options.timeout);
      }

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (exitCode) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve({ stdout, stderr, exitCode: exitCode || 0 });
      });

      child.on("error", (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        reject(error);
      });

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
        features: {
          nativeWebSocket: true,
          fileStreaming: true,
          fastStartup: true,
          javaScriptCore: true,
        },
      };
    }

    return {
      runtime: "node" as const,
      version: process.version,
      platform: process.platform,
      arch: process.arch,
      features: {
        nativeWebSocket: false,
        fileStreaming: false,
        fastStartup: false,
        javaScriptCore: false,
      },
    };
  }
}

/**
 * Bun.Glob - Native file pattern matching
 * SIMD-accelerated glob pattern matching using Bun.Glob
 */
export namespace BunGlob {
  /**
   * Scan directory for files matching a glob pattern
   * Uses Bun.Glob for native SIMD-accelerated matching when available
   */
  export async function scan(pattern: string, cwd = "."): Promise<string[]> {
    if (typeof Bun !== "undefined" && typeof Bun.Glob !== "undefined") {
      const glob = new Bun.Glob(pattern);
      const files: string[] = [];
      for await (const file of glob.scan(cwd)) {
        files.push(file);
      }
      return files;
    }

    // Fallback to simple fs-based implementation for non-Bun environments
    const { promises: fs } = await import("fs");
    const { join, relative } = await import("path");

    const files: string[] = [];
    const simplePattern = pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*");
    const regex = new RegExp(`^${simplePattern}$`);

    async function walkDir(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relativePath = relative(cwd, fullPath);
        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else if (regex.test(relativePath)) {
          files.push(relativePath);
        }
      }
    }

    try {
      await walkDir(cwd);
    } catch {
      // Directory might not exist
    }
    return files;
  }

  /**
   * Match a string against a glob pattern
   * Uses Bun.Glob.match() for native pattern matching
   */
  export function match(pattern: string, input: string): boolean {
    if (typeof Bun !== "undefined" && typeof Bun.Glob !== "undefined") {
      const glob = new Bun.Glob(pattern);
      return glob.match(input);
    }

    // Fallback to regex-based matching
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape regex special chars
      .replace(/\*\*/g, ".*") // ** matches anything
      .replace(/\*/g, "[^/]*") // * matches non-slash
      .replace(/\?/g, "."); // ? matches single char
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(input);
  }

  /**
   * Check if Bun.Glob is available
   */
  export function isAvailable(): boolean {
    return typeof Bun !== "undefined" && typeof Bun.Glob !== "undefined";
  }
}

/**
 * Bun.deepEquals - Fast deep equality comparison
 * Uses Bun's native SIMD-accelerated deep comparison when available
 */
export namespace BunCompare {
  /**
   * Deep equality comparison using Bun.deepEquals
   * Falls back to JSON.stringify comparison for non-Bun environments
   */
  export function deepEquals<T>(a: T, b: T): boolean {
    if (typeof Bun !== "undefined" && typeof Bun.deepEquals === "function") {
      return Bun.deepEquals(a, b);
    }

    // Fallback: JSON.stringify comparison (handles most common cases)
    // Note: This doesn't handle functions, undefined values, or circular references
    if (a === b) return true;
    if (a === null || b === null) return a === b;
    if (typeof a !== typeof b) return false;
    if (typeof a !== "object") return a === b;

    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      // Circular reference or other JSON error
      return false;
    }
  }

  /**
   * Strict deep equality (Bun.deepEquals with strict mode)
   * Differentiates between 0 and -0, and uses SameValueZero semantics
   */
  export function strictDeepEquals<T>(a: T, b: T): boolean {
    if (typeof Bun !== "undefined" && typeof Bun.deepEquals === "function") {
      return Bun.deepEquals(a, b, true); // strict mode
    }

    // Fallback with stricter comparison
    if (Object.is(a, b)) return true;
    if (a === null || b === null) return a === b;
    if (typeof a !== typeof b) return false;
    if (typeof a !== "object") return Object.is(a, b);

    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }

  /**
   * Check if Bun.deepEquals is available
   */
  export function isAvailable(): boolean {
    return typeof Bun !== "undefined" && typeof Bun.deepEquals === "function";
  }
}

// Enhanced performance measurement with memory tracking
export namespace BunPerf {
  export async function measure<T>(
    operation: () => Promise<T>,
    label?: string
  ): Promise<{ result: T; duration: number; memoryDelta?: number }> {
    const start = typeof Bun !== "undefined" ? Bun.nanoseconds() : performance.now() * 1_000_000;
    const memoryBefore = process.memoryUsage().heapUsed;

    try {
      const result = await operation();
      const end = typeof Bun !== "undefined" ? Bun.nanoseconds() : performance.now() * 1_000_000;
      const duration = (end - start) / 1_000_000; // Convert to milliseconds
      const memoryAfter = process.memoryUsage().heapUsed;
      const memoryDelta = memoryAfter - memoryBefore;

      if (label) {
        console.log(`${label}: ${duration.toFixed(2)}ms (memory: ${formatBytes(memoryDelta)})`);
      }

      return { result, duration, memoryDelta };
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
    const memoryBefore = process.memoryUsage().heapUsed;

    return {
      end: () => {
        const end = typeof Bun !== "undefined" ? Bun.nanoseconds() : performance.now() * 1_000_000;
        const duration = (end - start) / 1_000_000;
        const memoryAfter = process.memoryUsage().heapUsed;
        const memoryDelta = memoryAfter - memoryBefore;

        console.log(`${label}: ${duration.toFixed(2)}ms (memory: ${formatBytes(memoryDelta)})`);
        return { duration, memoryDelta };
      },
    };
  }

  // Benchmark utility for comparing performance
  export async function benchmark<T>(
    operations: Record<string, () => Promise<T>>,
    iterations = 10
  ): Promise<Record<string, { avg: number; min: number; max: number; total: number }>> {
    const results: Record<string, number[]> = {};

    // Initialize results
    for (const name of Object.keys(operations)) {
      results[name] = [];
    }

    // Run benchmark iterations
    for (let i = 0; i < iterations; i++) {
      for (const [name, operation] of Object.entries(operations)) {
        const { duration } = await measure(operation);
        results[name].push(duration);
      }
    }

    // Calculate statistics
    const stats: Record<string, { avg: number; min: number; max: number; total: number }> = {};
    for (const [name, durations] of Object.entries(results)) {
      const total = durations.reduce((sum, d) => sum + d, 0);
      stats[name] = {
        avg: total / durations.length,
        min: Math.min(...durations),
        max: Math.max(...durations),
        total,
      };
    }

    // Log results
    console.log("\nBenchmark Results:");
    for (const [name, stat] of Object.entries(stats)) {
      console.log(`${name}: avg=${stat.avg.toFixed(2)}ms, min=${stat.min.toFixed(2)}ms, max=${stat.max.toFixed(2)}ms`);
    }

    return stats;
  }
}

// Utility functions
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  const size = bytes / k ** i;
  return `${bytes >= 0 ? "+" : ""}${size.toFixed(1)} ${sizes[i]}`;
}

// Enhanced health check with more comprehensive system information
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
  system: {
    platform: string;
    arch: string;
    nodeVersion?: string;
    bunVersion?: string;
    v8Version?: string;
  };
  performance: {
    eventLoopLag?: number;
    gcStats?: any;
  };
}> {
  const runtimeInfo = BunEnv.getRuntimeInfo();
  const memoryUsage = process.memoryUsage();

  // Measure event loop lag
  let eventLoopLag: number | undefined;
  try {
    const start = Date.now();
    await new Promise((resolve) => setImmediate(resolve));
    eventLoopLag = Date.now() - start;
  } catch {
    // Ignore if setImmediate is not available
  }

  return {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    runtime: runtimeInfo,
    memory: memoryUsage,
    config: {
      environment: config.runtime.NODE_ENV,
      telemetryEnabled: config.telemetry.ENABLE_OPENTELEMETRY,
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      ...(typeof Bun !== "undefined" && { bunVersion: Bun.version }),
      ...(typeof process.version !== "undefined" && { nodeVersion: process.version }),
      ...(typeof process.versions?.v8 !== "undefined" && { v8Version: process.versions.v8 }),
    },
    performance: {
      ...(eventLoopLag !== undefined && { eventLoopLag }),
      // Add GC stats if available
      ...(typeof process.memoryUsage.rss === "function" && {
        gcStats: {
          rss: memoryUsage.rss,
          heapTotal: memoryUsage.heapTotal,
          heapUsed: memoryUsage.heapUsed,
          external: memoryUsage.external,
          arrayBuffers: memoryUsage.arrayBuffers,
        },
      }),
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
  BunGlob,
  BunCompare,
  BunPerf,
  createHealthcheck,
};
