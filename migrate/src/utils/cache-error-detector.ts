// src/utils/cache-error-detector.ts

export type CacheErrorCategory =
  | "connection_closed"
  | "connection_refused"
  | "connection_timeout"
  | "connection_reset"
  | "network_error"
  | "readonly_mode"
  | "server_busy"
  | "unknown";

export interface CacheErrorInfo {
  category: CacheErrorCategory;
  isRecoverable: boolean;
  shouldReconnect: boolean;
  message: string;
}

interface ErrorPattern {
  pattern: RegExp | string;
  category: CacheErrorCategory;
  isRecoverable: boolean;
  shouldReconnect: boolean;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: "ERR_REDIS_CONNECTION_CLOSED",
    category: "connection_closed",
    isRecoverable: true,
    shouldReconnect: true,
  },
  {
    pattern: "EPIPE",
    category: "connection_closed",
    isRecoverable: true,
    shouldReconnect: true,
  },
  {
    pattern: "ENOTCONN",
    category: "connection_closed",
    isRecoverable: true,
    shouldReconnect: true,
  },
  {
    pattern: /connection\s*(closed|lost)/i,
    category: "connection_closed",
    isRecoverable: true,
    shouldReconnect: true,
  },
  {
    pattern: /socket\s*(closed|hang\s*up)/i,
    category: "connection_closed",
    isRecoverable: true,
    shouldReconnect: true,
  },
  {
    pattern: /broken\s*pipe/i,
    category: "connection_closed",
    isRecoverable: true,
    shouldReconnect: true,
  },
  {
    pattern: "ECONNRESET",
    category: "connection_reset",
    isRecoverable: true,
    shouldReconnect: true,
  },
  {
    pattern: /read\s*ECONNRESET/i,
    category: "connection_reset",
    isRecoverable: true,
    shouldReconnect: true,
  },
  {
    pattern: /connection\s*reset/i,
    category: "connection_reset",
    isRecoverable: true,
    shouldReconnect: true,
  },
  {
    pattern: "ECONNREFUSED",
    category: "connection_refused",
    isRecoverable: true,
    shouldReconnect: true,
  },
  {
    pattern: "ETIMEDOUT",
    category: "connection_timeout",
    isRecoverable: true,
    shouldReconnect: true,
  },
  {
    pattern: /connection\s*timeout/i,
    category: "connection_timeout",
    isRecoverable: true,
    shouldReconnect: true,
  },
  {
    pattern: /operation\s*timed?\s*out/i,
    category: "connection_timeout",
    isRecoverable: true,
    shouldReconnect: true,
  },
  {
    pattern: "EHOSTUNREACH",
    category: "network_error",
    isRecoverable: true,
    shouldReconnect: true,
  },
  {
    pattern: "ENETUNREACH",
    category: "network_error",
    isRecoverable: true,
    shouldReconnect: true,
  },
  {
    pattern: "EADDRNOTAVAIL",
    category: "network_error",
    isRecoverable: true,
    shouldReconnect: true,
  },
  {
    pattern: "ENETDOWN",
    category: "network_error",
    isRecoverable: true,
    shouldReconnect: true,
  },
  {
    pattern: "ENOENT",
    category: "network_error",
    isRecoverable: true,
    shouldReconnect: true,
  },
  {
    pattern: /READONLY/i,
    category: "readonly_mode",
    isRecoverable: false,
    shouldReconnect: false,
  },
  {
    pattern: /LOADING/i,
    category: "server_busy",
    isRecoverable: true,
    shouldReconnect: false,
  },
  {
    pattern: /BUSY/i,
    category: "server_busy",
    isRecoverable: true,
    shouldReconnect: false,
  },
  {
    pattern: /CLUSTERDOWN/i,
    category: "server_busy",
    isRecoverable: true,
    shouldReconnect: false,
  },
];

export function detectCacheError(error: Error | string): CacheErrorInfo {
  const rawMessage = error instanceof Error ? error.message : error;
  const message = typeof rawMessage === "string" ? rawMessage : String(rawMessage ?? "");

  if (!message) {
    return {
      category: "unknown",
      isRecoverable: false,
      shouldReconnect: false,
      message: "",
    };
  }

  for (const { pattern, category, isRecoverable, shouldReconnect } of ERROR_PATTERNS) {
    const matches = typeof pattern === "string" ? message.includes(pattern) : pattern.test(message);

    if (matches) {
      return { category, isRecoverable, shouldReconnect, message };
    }
  }

  return {
    category: "unknown",
    isRecoverable: false,
    shouldReconnect: false,
    message,
  };
}

export function isConnectionError(error: Error | string): boolean {
  const info = detectCacheError(error);
  return info.shouldReconnect;
}

export function isRecoverableError(error: Error | string): boolean {
  const info = detectCacheError(error);
  return info.isRecoverable;
}

export function getSupportedErrorPatterns(): Array<{
  category: CacheErrorCategory;
  patterns: string[];
}> {
  const byCategory = new Map<CacheErrorCategory, string[]>();

  for (const { pattern, category } of ERROR_PATTERNS) {
    const patterns = byCategory.get(category) || [];
    patterns.push(typeof pattern === "string" ? pattern : pattern.source);
    byCategory.set(category, patterns);
  }

  return Array.from(byCategory.entries()).map(([category, patterns]) => ({
    category,
    patterns,
  }));
}
