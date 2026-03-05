// src/services/cache/cache-operation-timeout.ts

export class CacheOperationTimeoutError extends Error {
  public readonly operation: string;
  public readonly timeoutMs: number;
  public readonly startTime: number;

  constructor(operation: string, timeoutMs: number, startTime: number = Date.now()) {
    super(`Cache ${operation} operation timed out after ${timeoutMs}ms`);
    this.name = "CacheOperationTimeoutError";
    this.operation = operation;
    this.timeoutMs = timeoutMs;
    this.startTime = startTime;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CacheOperationTimeoutError);
    }
  }
}

export interface CacheOperationTimeouts {
  get: number;
  set: number;
  delete: number;
  scan: number;
  ping: number;
  connect: number;
}

export const DEFAULT_OPERATION_TIMEOUTS: CacheOperationTimeouts = {
  get: 1000,
  set: 2000,
  delete: 1000,
  scan: 5000,
  ping: 500,
  connect: 5000,
};

export async function withOperationTimeout<T>(
  operation: string,
  timeoutMs: number,
  promise: Promise<T>
): Promise<T> {
  const startTime = Date.now();

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new CacheOperationTimeoutError(operation, timeoutMs, startTime));
    }, timeoutMs);

    if (timeoutId && typeof timeoutId === "object" && "unref" in timeoutId) {
      (timeoutId as { unref: () => void }).unref();
    }
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export function isTimeoutError(error: unknown): error is CacheOperationTimeoutError {
  return error instanceof CacheOperationTimeoutError;
}

export function getOperationTimeout(
  operationType: keyof CacheOperationTimeouts,
  customTimeouts?: Partial<CacheOperationTimeouts>
): number {
  const timeouts = { ...DEFAULT_OPERATION_TIMEOUTS, ...customTimeouts };
  return timeouts[operationType];
}

export function createTimeoutConfig(
  overrides?: Partial<CacheOperationTimeouts>
): CacheOperationTimeouts {
  return { ...DEFAULT_OPERATION_TIMEOUTS, ...overrides };
}
