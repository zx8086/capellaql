/* src/lib/couchbase/errors.ts */

/**
 * SDK Error Types Module
 * Imports ALL official SDK error types and provides error classification
 * PRESERVES existing 25+ error classifications with severity levels and categories
 */

import {
  AmbiguousTimeoutError,
  // Authentication & Authorization
  AuthenticationFailureError,
  BucketNotFoundError,
  CasMismatchError,
  CollectionNotFoundError,
  // Core error
  CouchbaseError,
  DmlFailureError,
  DocumentExistsError,
  DocumentLockedError,
  // Document errors
  DocumentNotFoundError,
  DocumentNotLockedError,
  DurabilityAmbiguousError,
  DurabilityImpossibleError,
  DurabilityLevelNotAvailableError,
  DurableWriteInProgressError,
  // Feature availability
  FeatureNotAvailableError,
  IndexExistsError,
  IndexNotFoundError,
  // Query errors
  ParsingFailureError,
  PathExistsError,
  PathInvalidError,
  PathMismatchError,
  // Path errors (subdocument)
  PathNotFoundError,
  PreparedStatementFailureError,
  QuotaLimitedError,
  // Rate limiting
  RateLimitedError,
  // Network errors
  RequestCanceledError,
  ScopeNotFoundError,
  ServiceNotAvailableError,
  // Temporary failures
  TemporaryFailureError,
  // Timeout errors
  TimeoutError,
  UnambiguousTimeoutError,
  UnsupportedOperationError,
  // Value errors
  ValueTooLargeError,
} from "couchbase";

import type { CouchbaseErrorContext, ErrorClassification } from "./types";

/**
 * Error classifier using SDK types with instanceof checks
 * Preserves existing 25+ error classifications with severity, category, and alert flags
 */
export class CouchbaseErrorClassifier {
  /**
   * Complete error classification map (preserved from existing implementation)
   */
  private static readonly ERROR_CLASSIFICATIONS = new Map<string, ErrorClassification>([
    // Document/Key Errors - Not retryable, expected in normal operations
    [
      "DocumentNotFoundError",
      { retryable: false, severity: "info", category: "application", shouldLog: false, shouldAlert: false },
    ],
    [
      "DocumentExistsError",
      { retryable: false, severity: "info", category: "application", shouldLog: true, shouldAlert: false },
    ],
    [
      "CasMismatchError",
      { retryable: false, severity: "info", category: "application", shouldLog: true, shouldAlert: false },
    ],
    [
      "DocumentLockedError",
      {
        retryable: true,
        severity: "warning",
        category: "application",
        shouldLog: true,
        shouldAlert: false,
        maxRetries: 3,
      },
    ],
    [
      "DocumentNotLockedError",
      { retryable: false, severity: "info", category: "application", shouldLog: true, shouldAlert: false },
    ],
    [
      "ValueTooLargeError",
      { retryable: false, severity: "warning", category: "application", shouldLog: true, shouldAlert: false },
    ],

    // Authentication/Authorization - Critical, not retryable
    [
      "AuthenticationFailureError",
      { retryable: false, severity: "critical", category: "client", shouldLog: true, shouldAlert: true },
    ],

    // Network/Timeout Errors - Retryable with different strategies
    [
      "TimeoutError",
      { retryable: true, severity: "warning", category: "network", shouldLog: true, shouldAlert: false, maxRetries: 3 },
    ],
    [
      "UnambiguousTimeoutError",
      { retryable: true, severity: "warning", category: "network", shouldLog: true, shouldAlert: false, maxRetries: 2 },
    ],
    // CRITICAL: AmbiguousTimeoutError - NEVER retry, requires manual investigation
    [
      "AmbiguousTimeoutError",
      { retryable: false, severity: "critical", category: "network", shouldLog: true, shouldAlert: true },
    ],
    [
      "RequestCanceledError",
      { retryable: true, severity: "warning", category: "network", shouldLog: true, shouldAlert: false, maxRetries: 2 },
    ],

    // Service Availability - Retryable, indicates system issues
    [
      "ServiceNotAvailableError",
      { retryable: true, severity: "critical", category: "server", shouldLog: true, shouldAlert: true, maxRetries: 5 },
    ],
    [
      "TemporaryFailureError",
      { retryable: true, severity: "warning", category: "server", shouldLog: true, shouldAlert: false, maxRetries: 3 },
    ],
    [
      "RateLimitedError",
      { retryable: true, severity: "warning", category: "server", shouldLog: true, shouldAlert: false, maxRetries: 2 },
    ],
    [
      "QuotaLimitedError",
      { retryable: false, severity: "warning", category: "server", shouldLog: true, shouldAlert: true },
    ],

    // Resource Not Found - Not retryable, configuration issues
    [
      "BucketNotFoundError",
      { retryable: false, severity: "critical", category: "client", shouldLog: true, shouldAlert: true },
    ],
    [
      "ScopeNotFoundError",
      { retryable: false, severity: "critical", category: "client", shouldLog: true, shouldAlert: true },
    ],
    [
      "CollectionNotFoundError",
      { retryable: false, severity: "critical", category: "client", shouldLog: true, shouldAlert: true },
    ],
    [
      "IndexNotFoundError",
      { retryable: false, severity: "warning", category: "client", shouldLog: true, shouldAlert: false },
    ],
    [
      "IndexExistsError",
      { retryable: false, severity: "info", category: "client", shouldLog: true, shouldAlert: false },
    ],

    // Query/Service Specific Errors - Mixed retry strategies
    [
      "ParsingFailureError",
      { retryable: false, severity: "warning", category: "application", shouldLog: true, shouldAlert: false },
    ],
    [
      "PreparedStatementFailureError",
      {
        retryable: true,
        severity: "warning",
        category: "application",
        shouldLog: true,
        shouldAlert: false,
        maxRetries: 2,
      },
    ],
    [
      "DmlFailureError",
      { retryable: false, severity: "warning", category: "application", shouldLog: true, shouldAlert: false },
    ],

    // Durability Errors - Mixed strategies
    [
      "DurabilityLevelNotAvailableError",
      { retryable: false, severity: "warning", category: "server", shouldLog: true, shouldAlert: false },
    ],
    [
      "DurabilityAmbiguousError",
      { retryable: false, severity: "critical", category: "server", shouldLog: true, shouldAlert: true },
    ],
    [
      "DurabilityImpossibleError",
      { retryable: false, severity: "critical", category: "server", shouldLog: true, shouldAlert: true },
    ],
    [
      "DurableWriteInProgressError",
      { retryable: true, severity: "warning", category: "server", shouldLog: true, shouldAlert: false, maxRetries: 3 },
    ],

    // Path errors (subdocument)
    [
      "PathNotFoundError",
      { retryable: false, severity: "info", category: "application", shouldLog: false, shouldAlert: false },
    ],
    [
      "PathExistsError",
      { retryable: false, severity: "info", category: "application", shouldLog: true, shouldAlert: false },
    ],
    [
      "PathMismatchError",
      { retryable: false, severity: "warning", category: "application", shouldLog: true, shouldAlert: false },
    ],
    [
      "PathInvalidError",
      { retryable: false, severity: "warning", category: "application", shouldLog: true, shouldAlert: false },
    ],

    // Feature Availability
    [
      "FeatureNotAvailableError",
      { retryable: false, severity: "warning", category: "server", shouldLog: true, shouldAlert: false },
    ],
    [
      "UnsupportedOperationError",
      { retryable: false, severity: "warning", category: "server", shouldLog: true, shouldAlert: false },
    ],
  ]);

  /**
   * Check if error is retryable using SDK instanceof checks
   */
  static isRetryable(error: unknown): boolean {
    if (!error) return false;

    // Use instanceof for type-safe checks
    return (
      error instanceof TimeoutError ||
      error instanceof UnambiguousTimeoutError ||
      error instanceof TemporaryFailureError ||
      error instanceof ServiceNotAvailableError ||
      error instanceof RequestCanceledError ||
      error instanceof DurableWriteInProgressError ||
      error instanceof DocumentLockedError ||
      error instanceof RateLimitedError ||
      error instanceof PreparedStatementFailureError ||
      CouchbaseErrorClassifier.isNetworkError(error)
    );
  }

  /**
   * Check if error is a network/connectivity issue
   */
  static isNetworkError(error: unknown): boolean {
    if (!error) return false;

    const message = (error as Error).message?.toLowerCase() || "";

    return (
      message.includes("econnrefused") ||
      message.includes("econnreset") ||
      message.includes("etimedout") ||
      message.includes("enotfound") ||
      message.includes("enetunreach") ||
      message.includes("network unreachable") ||
      message.includes("connection refused") ||
      message.includes("connection reset")
    );
  }

  /**
   * Check if error is authentication/authorization
   */
  static isAuthError(error: unknown): boolean {
    return (
      error instanceof AuthenticationFailureError ||
      error instanceof BucketNotFoundError ||
      error instanceof ScopeNotFoundError ||
      error instanceof CollectionNotFoundError
    );
  }

  /**
   * Check if error is a permanent failure (don't retry)
   */
  static isPermanentFailure(error: unknown): boolean {
    return (
      CouchbaseErrorClassifier.isAuthError(error) ||
      error instanceof ParsingFailureError ||
      error instanceof PathInvalidError ||
      error instanceof PathMismatchError ||
      error instanceof ValueTooLargeError ||
      error instanceof UnsupportedOperationError ||
      error instanceof FeatureNotAvailableError ||
      error instanceof AmbiguousTimeoutError ||
      error instanceof DurabilityAmbiguousError ||
      error instanceof DurabilityImpossibleError
    );
  }

  /**
   * Check if error is a document conflict (CAS mismatch)
   */
  static isConflictError(error: unknown): boolean {
    return (
      error instanceof CasMismatchError || error instanceof DocumentExistsError || error instanceof DocumentLockedError
    );
  }

  /**
   * Check if error is resource not found
   */
  static isNotFoundError(error: unknown): boolean {
    return (
      error instanceof DocumentNotFoundError ||
      error instanceof PathNotFoundError ||
      error instanceof IndexNotFoundError
    );
  }

  /**
   * Check if error is an ambiguous timeout (requires manual investigation)
   */
  static isAmbiguousError(error: unknown): boolean {
    return error instanceof AmbiguousTimeoutError || error instanceof DurabilityAmbiguousError;
  }

  /**
   * Classify error using the classification map (preserves existing pattern)
   */
  static classifyError(error: any): ErrorClassification {
    const errorType = error.constructor.name;
    const classification = CouchbaseErrorClassifier.ERROR_CLASSIFICATIONS.get(errorType);

    if (classification) {
      return classification;
    }

    // Default classification for unknown Couchbase errors
    if (error instanceof CouchbaseError) {
      return {
        retryable: false,
        severity: "warning",
        category: "server",
        shouldLog: true,
        shouldAlert: false,
      };
    }

    // Default for non-Couchbase errors
    return {
      retryable: false,
      severity: "critical",
      category: "application",
      shouldLog: true,
      shouldAlert: true,
    };
  }

  /**
   * Extract error context from SDK error
   */
  static extractContext(error: unknown, operation?: string): CouchbaseErrorContext {
    const baseContext: CouchbaseErrorContext = {
      message: error instanceof Error ? error.message : String(error),
      cause: error instanceof Error ? error : undefined,
      operation,
      isRetryable: CouchbaseErrorClassifier.isRetryable(error),
      isCritical: CouchbaseErrorClassifier.isPermanentFailure(error),
      isTransient: CouchbaseErrorClassifier.isNetworkError(error),
    };

    // Extract SDK-specific context
    if (error instanceof CouchbaseError) {
      baseContext.errorCode = (error as any).code;
      baseContext.errorName = error.constructor.name;
    }

    // Extract CAS if available
    if (error instanceof CasMismatchError) {
      baseContext.cas = (error as any).cas?.toString();
    }

    return baseContext;
  }

  /**
   * Get retry strategy based on error type
   */
  static getRetryStrategy(error: unknown): {
    shouldRetry: boolean;
    maxAttempts: number;
    baseDelayMs: number;
  } {
    if (CouchbaseErrorClassifier.isPermanentFailure(error)) {
      return { shouldRetry: false, maxAttempts: 0, baseDelayMs: 0 };
    }

    if (CouchbaseErrorClassifier.isConflictError(error)) {
      // Quick retries for CAS conflicts
      return { shouldRetry: true, maxAttempts: 5, baseDelayMs: 100 };
    }

    if (CouchbaseErrorClassifier.isNetworkError(error) || error instanceof TemporaryFailureError) {
      // Exponential backoff for network issues
      return { shouldRetry: true, maxAttempts: 3, baseDelayMs: 1000 };
    }

    if (error instanceof TimeoutError || error instanceof UnambiguousTimeoutError) {
      // Moderate retries for timeouts
      return { shouldRetry: true, maxAttempts: 2, baseDelayMs: 2000 };
    }

    if (error instanceof ServiceNotAvailableError) {
      // More aggressive retries for service availability
      return { shouldRetry: true, maxAttempts: 5, baseDelayMs: 1000 };
    }

    if (error instanceof RateLimitedError) {
      // Backoff for rate limiting
      return { shouldRetry: true, maxAttempts: 2, baseDelayMs: 5000 };
    }

    // Default: no retry
    return { shouldRetry: false, maxAttempts: 0, baseDelayMs: 0 };
  }

  /**
   * Get the error classifications map (for inspection/testing)
   */
  static getErrorClassifications(): Map<string, ErrorClassification> {
    return new Map(CouchbaseErrorClassifier.ERROR_CLASSIFICATIONS);
  }
}

/**
 * Export all SDK error types for application use
 */
export {
  // Core
  CouchbaseError,
  // Auth
  AuthenticationFailureError,
  BucketNotFoundError,
  ScopeNotFoundError,
  CollectionNotFoundError,
  // Document
  DocumentNotFoundError,
  DocumentExistsError,
  DocumentLockedError,
  DocumentNotLockedError,
  ValueTooLargeError,
  CasMismatchError,
  // Timeout
  TimeoutError,
  AmbiguousTimeoutError,
  UnambiguousTimeoutError,
  // Network
  RequestCanceledError,
  ServiceNotAvailableError,
  // Query
  ParsingFailureError,
  IndexNotFoundError,
  IndexExistsError,
  PreparedStatementFailureError,
  DmlFailureError,
  // Temporary
  TemporaryFailureError,
  DurabilityImpossibleError,
  DurabilityAmbiguousError,
  DurableWriteInProgressError,
  DurabilityLevelNotAvailableError,
  // Subdocument
  PathNotFoundError,
  PathExistsError,
  PathMismatchError,
  PathInvalidError,
  // Rate limiting
  RateLimitedError,
  QuotaLimitedError,
  // Feature
  FeatureNotAvailableError,
  UnsupportedOperationError,
};
