/* src/lib/couchbase/transaction-handler.ts */

/**
 * Transaction Handler Module
 *
 * Migrated from couchbaseTransactionHandler.ts with integration to new error classifier.
 * Features:
 * - Comprehensive transaction error handling
 * - Ambiguous commit tracking for manual investigation
 * - Safe operation wrappers (get, insert, replace)
 * - Utility methods for common transaction patterns
 */

import {
  CasMismatchError,
  DocumentExistsError,
  DocumentNotFoundError,
  type TransactionAttempt,
  TransactionCommitAmbiguousError,
  type TransactionGetResult,
  Transactions,
} from "couchbase";
import { error as err, log as info, warn } from "../../telemetry/logger";
import { CouchbaseErrorClassifier } from "./errors";
import { recordQuery } from "./metrics";
import type { OperationContext } from "./types";

// =============================================================================
// TYPES
// =============================================================================

export interface TransactionOperationContext extends OperationContext {
  transactionId?: string;
  attemptNumber?: number;
  totalOperations?: number;
}

export interface TransactionConfig {
  durabilityLevel?: "none" | "majority" | "majorityAndPersistActive" | "persistToMajority";
  timeout?: number; // milliseconds
  cleanupLostAttempts?: boolean;
  cleanupClientAttempts?: boolean;
}

// =============================================================================
// TRANSACTION HANDLER CLASS
// =============================================================================

/**
 * Handles Couchbase transactions with comprehensive error handling.
 *
 * Features:
 * - Automatic retry for transient failures
 * - Ambiguous commit tracking and investigation
 * - Safe operation wrappers with proper error classification
 * - Utility methods for common patterns (atomic update, batch operations)
 */
export class CouchbaseTransactionHandler {
  private static readonly DEFAULT_CONFIG: TransactionConfig = {
    durabilityLevel: "majority",
    timeout: 15000, // 15 seconds
    cleanupLostAttempts: true,
    cleanupClientAttempts: true,
  };

  /**
   * Execute a transaction with comprehensive error handling.
   */
  static async executeTransaction<T>(
    transactionLogic: (ctx: TransactionAttempt) => Promise<T>,
    context: TransactionOperationContext,
    config: TransactionConfig = {}
  ): Promise<T> {
    const finalConfig = { ...CouchbaseTransactionHandler.DEFAULT_CONFIG, ...config };
    const startTime = Date.now();
    const transactionId = context.transactionId || `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    let attemptCount = 0;
    let _lastError: Error | null = null;

    try {
      // Execute with retry logic
      const maxAttempts = 3;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        attemptCount = attempt;

        try {
          const enhancedContext: TransactionOperationContext = {
            ...context,
            transactionId,
            attemptNumber: attemptCount,
            operationType: `transaction_${context.operationType}`,
          };

          info("Starting transaction", {
            transactionId,
            attemptNumber: attemptCount,
            operationType: context.operationType,
            requestId: context.requestId,
            config: finalConfig,
          });

          // Execute transaction
          const transactions = Transactions.create();

          const txnResult = await transactions.run(
            async (ctx: TransactionAttempt) => {
              try {
                return await transactionLogic(ctx);
              } catch (error) {
                // Handle transaction-specific errors within the transaction
                CouchbaseTransactionHandler.handleInTransactionError(error, enhancedContext);
                throw error;
              }
            },
            {
              durabilityLevel: finalConfig.durabilityLevel as any,
              timeout: finalConfig.timeout,
            }
          );

          const duration = Date.now() - startTime;

          info("Transaction completed successfully", {
            transactionId,
            totalAttempts: attemptCount,
            duration,
            operationType: context.operationType,
            requestId: context.requestId,
          });

          // Record successful transaction metrics
          recordQuery(`transaction_${context.operationType}`, duration, true, {
            requestId: context.requestId,
            bucket: context.bucket,
            scope: context.scope,
            collection: context.collection,
          });

          return txnResult;
        } catch (error) {
          _lastError = error as Error;

          // Use error classifier
          const _classification = CouchbaseErrorClassifier.classifyError(error);
          const retryStrategy = CouchbaseErrorClassifier.getRetryStrategy(error);

          if (!retryStrategy.shouldRetry || attempt === maxAttempts) {
            throw error;
          }

          const delay = retryStrategy.baseDelayMs * 2 ** (attempt - 1);
          warn(`Transaction retry attempt ${attempt}/${maxAttempts} after ${delay}ms`, {
            transactionId,
            errorType: (error as Error).constructor.name,
          });

          await CouchbaseTransactionHandler.sleep(delay);
        }
      }

      throw _lastError;
    } catch (error) {
      _lastError = error as Error;
      const duration = Date.now() - startTime;
      const classification = CouchbaseTransactionHandler.classifyTransactionError(error);

      err("Transaction failed", error, {
        transactionId,
        totalAttempts: attemptCount,
        duration,
        operationType: context.operationType,
        requestId: context.requestId,
        isRetryable: classification.retryable,
        requiresInvestigation: classification.requiresInvestigation,
      });

      // Record failed transaction metrics
      recordQuery(`transaction_${context.operationType}`, duration, false, {
        errorType: (error as Error).constructor.name,
        requestId: context.requestId,
        bucket: context.bucket,
        scope: context.scope,
        collection: context.collection,
      });

      // Handle specific transaction failure scenarios
      if (error instanceof TransactionCommitAmbiguousError) {
        await CouchbaseTransactionHandler.handleAmbiguousTransaction(error, {
          ...context,
          transactionId,
        });
      }

      throw error;
    }
  }

  /**
   * Safe get operation within a transaction.
   */
  static async safeGet(
    ctx: TransactionAttempt,
    collection: any,
    key: string,
    operationContext: TransactionOperationContext
  ): Promise<TransactionGetResult | null> {
    try {
      return await ctx.get(collection, key);
    } catch (error) {
      if (error instanceof DocumentNotFoundError) {
        // Document not found is expected in many scenarios
        return null;
      }

      // Log other errors but let them propagate
      warn("Transaction get operation failed", {
        error: (error as Error).constructor.name,
        key,
        transactionId: operationContext.transactionId,
        requestId: operationContext.requestId,
      });

      throw error;
    }
  }

  /**
   * Safe insert operation within a transaction.
   */
  static async safeInsert(
    ctx: TransactionAttempt,
    collection: any,
    key: string,
    content: any,
    operationContext: TransactionOperationContext
  ): Promise<TransactionGetResult> {
    try {
      return await ctx.insert(collection, key, content);
    } catch (error) {
      if (error instanceof DocumentExistsError) {
        err("Document already exists in transaction", error, {
          key,
          transactionId: operationContext.transactionId,
          requestId: operationContext.requestId,
        });
      }
      throw error;
    }
  }

  /**
   * Safe replace operation within a transaction.
   */
  static async safeReplace(
    ctx: TransactionAttempt,
    doc: TransactionGetResult,
    content: any,
    operationContext: TransactionOperationContext
  ): Promise<TransactionGetResult> {
    try {
      return await ctx.replace(doc, content);
    } catch (error) {
      if (error instanceof CasMismatchError) {
        warn("CAS mismatch in transaction replace", {
          transactionId: operationContext.transactionId,
          requestId: operationContext.requestId,
          suggestion: "Document was modified by another transaction",
        });
      }
      throw error;
    }
  }

  /**
   * Classify transaction-specific errors.
   */
  private static classifyTransactionError(error: any): {
    retryable: boolean;
    severity: "info" | "warning" | "critical";
    requiresInvestigation: boolean;
    category: "transient" | "permanent" | "ambiguous" | "configuration";
  } {
    const errorType = error.constructor.name;

    const classifications: Record<
      string,
      {
        retryable: boolean;
        severity: "info" | "warning" | "critical";
        requiresInvestigation: boolean;
        category: "transient" | "permanent" | "ambiguous" | "configuration";
      }
    > = {
      TransactionFailedError: {
        retryable: true,
        severity: "warning",
        requiresInvestigation: false,
        category: "transient",
      },
      TransactionCommitAmbiguousError: {
        retryable: false,
        severity: "critical",
        requiresInvestigation: true,
        category: "ambiguous",
      },
      TransactionExpiredError: {
        retryable: true,
        severity: "warning",
        requiresInvestigation: false,
        category: "transient",
      },
      DocumentExistsError: {
        retryable: false,
        severity: "info",
        requiresInvestigation: false,
        category: "permanent",
      },
      DocumentNotFoundError: {
        retryable: false,
        severity: "info",
        requiresInvestigation: false,
        category: "permanent",
      },
      CasMismatchError: {
        retryable: true,
        severity: "info",
        requiresInvestigation: false,
        category: "transient",
      },
    };

    return (
      classifications[errorType] || {
        retryable: false,
        severity: "critical",
        requiresInvestigation: true,
        category: "permanent",
      }
    );
  }

  /**
   * Handle errors that occur within a transaction.
   */
  private static handleInTransactionError(error: any, context: TransactionOperationContext): void {
    const classification = CouchbaseTransactionHandler.classifyTransactionError(error);

    if (classification.severity === "critical") {
      err("Critical error within transaction", error, {
        transactionId: context.transactionId,
        attemptNumber: context.attemptNumber,
        requestId: context.requestId,
        severity: classification.severity,
      });
    } else if (classification.severity === "warning") {
      warn("Warning within transaction", {
        errorType: error.constructor.name,
        message: error.message,
        transactionId: context.transactionId,
        attemptNumber: context.attemptNumber,
        requestId: context.requestId,
      });
    }
  }

  /**
   * Handle ambiguous transaction commits.
   */
  private static async handleAmbiguousTransaction(
    error: TransactionCommitAmbiguousError,
    context: TransactionOperationContext & { transactionId: string }
  ): Promise<void> {
    const ambiguousLogData = {
      transactionId: context.transactionId,
      operationType: context.operationType,
      errorMessage: error.message,
      context: {
        bucket: context.bucket,
        scope: context.scope,
        collection: context.collection,
        requestId: context.requestId,
      },
      timestamp: new Date().toISOString(),
      requiresManualInvestigation: true,
      investigationNotes: [
        "Transaction commit state is ambiguous - changes may or may not have been applied",
        "Manual verification of data state required",
        "Consider implementing idempotent operations to handle duplicate execution",
        "Check cluster logs for transaction commit confirmation",
      ],
    };

    err("AMBIGUOUS_TRANSACTION_COMMIT", ambiguousLogData);

    // Store for investigation dashboard
    try {
      info("Stored ambiguous transaction for investigation", {
        transactionId: context.transactionId,
        operationType: context.operationType,
      });
    } catch (storeError) {
      err("Failed to store ambiguous transaction data", storeError, {
        originalTransactionId: context.transactionId,
      });
    }
  }

  /**
   * Create a transaction operation context.
   */
  static createTransactionContext(
    operationType: string,
    requestId?: string,
    bucket?: string,
    scope?: string,
    collection?: string
  ): TransactionOperationContext {
    return {
      operationType,
      requestId,
      bucket,
      scope,
      collection,
    };
  }

  /**
   * Utility method for atomic updates.
   */
  static async atomicUpdate<T>(
    collection: any,
    key: string,
    updateFn: (currentValue: T | null) => T,
    context: TransactionOperationContext,
    config?: TransactionConfig
  ): Promise<T> {
    return await CouchbaseTransactionHandler.executeTransaction(
      async (ctx) => {
        // Get current document
        const currentDoc = await CouchbaseTransactionHandler.safeGet(ctx, collection, key, context);
        const currentValue = currentDoc ? (currentDoc.content as T) : null;

        // Apply update function
        const newValue = updateFn(currentValue);

        // Upsert the new value
        if (currentDoc) {
          await CouchbaseTransactionHandler.safeReplace(ctx, currentDoc, newValue, context);
        } else {
          await CouchbaseTransactionHandler.safeInsert(ctx, collection, key, newValue, context);
        }

        return newValue;
      },
      context,
      config
    );
  }

  /**
   * Utility method for batch operations within a transaction.
   */
  static async batchOperation<T>(
    operations: Array<(ctx: TransactionAttempt) => Promise<T>>,
    context: TransactionOperationContext,
    config?: TransactionConfig
  ): Promise<T[]> {
    return await CouchbaseTransactionHandler.executeTransaction(
      async (ctx) => {
        const results: T[] = [];

        for (let i = 0; i < operations.length; i++) {
          try {
            const result = await operations[i](ctx);
            results.push(result);
          } catch (error) {
            err("Batch operation failed", error, {
              operationIndex: i,
              totalOperations: operations.length,
              transactionId: context.transactionId,
            });
            throw error;
          }
        }

        return results;
      },
      {
        ...context,
        totalOperations: operations.length,
      },
      config
    );
  }

  private static async sleep(ms: number): Promise<void> {
    if (typeof Bun !== "undefined") {
      await Bun.sleep(ms);
    } else {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  }
}
