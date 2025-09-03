import {
  Transactions,
  TransactionFailedError,
  TransactionCommitAmbiguousError,
  TransactionExpiredError,
  TransactionAttempt,
  type TransactionResult,
  type TransactionGetResult,
  DocumentExistsError,
  DocumentNotFoundError,
  CasMismatchError
} from 'couchbase';
import { CouchbaseErrorHandler, type OperationContext } from '$lib/couchbaseErrorHandler';
import { recordQuery } from '$lib/couchbaseMetrics';
import { error as err, warn, log as info } from '../telemetry/logger';

export interface TransactionOperationContext extends OperationContext {
  transactionId?: string;
  attemptNumber?: number;
  totalOperations?: number;
}

export interface TransactionConfig {
  durabilityLevel?: 'none' | 'majority' | 'majorityAndPersistActive' | 'persistToMajority';
  timeout?: number; // milliseconds
  cleanupLostAttempts?: boolean;
  cleanupClientAttempts?: boolean;
}

export class CouchbaseTransactionHandler {
  private static readonly DEFAULT_CONFIG: TransactionConfig = {
    durabilityLevel: 'majority',
    timeout: 15000, // 15 seconds
    cleanupLostAttempts: true,
    cleanupClientAttempts: true
  };

  static async executeTransaction<T>(
    transactionLogic: (ctx: TransactionAttempt) => Promise<T>,
    context: TransactionOperationContext,
    config: TransactionConfig = {}
  ): Promise<T> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    const startTime = Date.now();
    const transactionId = context.transactionId || `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    let attemptCount = 0;
    let lastError: Error | null = null;

    try {
      const result = await CouchbaseErrorHandler.executeWithRetry(
        async () => {
          attemptCount++;
          
          const enhancedContext: TransactionOperationContext = {
            ...context,
            transactionId,
            attemptNumber: attemptCount,
            operationType: `transaction_${context.operationType}`
          };

          info('Starting transaction', {
            transactionId,
            attemptNumber: attemptCount,
            operationType: context.operationType,
            requestId: context.requestId,
            config: finalConfig
          });

          // Execute transaction with comprehensive error handling
          const transactions = Transactions.create();
          
          const txnResult = await transactions.run(
            async (ctx: TransactionAttempt) => {
              try {
                return await transactionLogic(ctx);
              } catch (error) {
                // Handle transaction-specific errors within the transaction
                this.handleInTransactionError(error, enhancedContext);
                throw error;
              }
            },
            {
              durabilityLevel: finalConfig.durabilityLevel,
              timeout: finalConfig.timeout
            }
          );

          const duration = Date.now() - startTime;
          
          info('Transaction completed successfully', {
            transactionId,
            totalAttempts: attemptCount,
            duration,
            operationType: context.operationType,
            requestId: context.requestId
          });

          // Record successful transaction metrics
          recordQuery(`transaction_${context.operationType}`, duration, true, {
            requestId: context.requestId,
            bucket: context.bucket,
            scope: context.scope,
            collection: context.collection
          });

          return txnResult;
        },
        {
          ...context,
          operationType: `transaction_${context.operationType}`,
          transactionId
        },
        3 // Maximum transaction retries
      );

      return result;

    } catch (error) {
      lastError = error as Error;
      const duration = Date.now() - startTime;
      const classification = this.classifyTransactionError(error);

      err('Transaction failed', {
        transactionId,
        totalAttempts: attemptCount,
        duration,
        errorType: error.constructor.name,
        classification,
        operationType: context.operationType,
        requestId: context.requestId,
        isRetryable: classification.retryable,
        requiresInvestigation: classification.requiresInvestigation
      });

      // Record failed transaction metrics
      recordQuery(`transaction_${context.operationType}`, duration, false, {
        errorType: error.constructor.name,
        requestId: context.requestId,
        bucket: context.bucket,
        scope: context.scope,
        collection: context.collection
      });

      // Handle specific transaction failure scenarios
      if (error instanceof TransactionCommitAmbiguousError) {
        await this.handleAmbiguousTransaction(error, { ...context, transactionId });
      }

      throw error;
    }
  }

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
      warn('Transaction get operation failed', {
        error: error.constructor.name,
        key,
        transactionId: operationContext.transactionId,
        requestId: operationContext.requestId
      });
      
      throw error;
    }
  }

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
        err('Document already exists in transaction', {
          key,
          transactionId: operationContext.transactionId,
          requestId: operationContext.requestId,
          suggestion: 'Consider using upsert or checking existence first'
        });
      }
      throw error;
    }
  }

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
        warn('CAS mismatch in transaction replace', {
          transactionId: operationContext.transactionId,
          requestId: operationContext.requestId,
          suggestion: 'Document was modified by another transaction'
        });
      }
      throw error;
    }
  }

  private static classifyTransactionError(error: any): {
    retryable: boolean;
    severity: 'info' | 'warning' | 'critical';
    requiresInvestigation: boolean;
    category: 'transient' | 'permanent' | 'ambiguous' | 'configuration';
  } {
    const errorType = error.constructor.name;

    const classifications = {
      TransactionFailedError: { 
        retryable: true, 
        severity: 'warning' as const, 
        requiresInvestigation: false, 
        category: 'transient' as const 
      },
      TransactionCommitAmbiguousError: { 
        retryable: false, 
        severity: 'critical' as const, 
        requiresInvestigation: true, 
        category: 'ambiguous' as const 
      },
      TransactionExpiredError: { 
        retryable: true, 
        severity: 'warning' as const, 
        requiresInvestigation: false, 
        category: 'transient' as const 
      },
      DocumentExistsError: { 
        retryable: false, 
        severity: 'info' as const, 
        requiresInvestigation: false, 
        category: 'permanent' as const 
      },
      DocumentNotFoundError: { 
        retryable: false, 
        severity: 'info' as const, 
        requiresInvestigation: false, 
        category: 'permanent' as const 
      },
      CasMismatchError: { 
        retryable: true, 
        severity: 'info' as const, 
        requiresInvestigation: false, 
        category: 'transient' as const 
      }
    };

    return classifications[errorType] || {
      retryable: false,
      severity: 'critical',
      requiresInvestigation: true,
      category: 'permanent'
    };
  }

  private static handleInTransactionError(error: any, context: TransactionOperationContext): void {
    const classification = this.classifyTransactionError(error);

    if (classification.severity === 'critical') {
      err('Critical error within transaction', {
        errorType: error.constructor.name,
        message: error.message,
        transactionId: context.transactionId,
        attemptNumber: context.attemptNumber,
        requestId: context.requestId,
        classification
      });
    } else if (classification.severity === 'warning') {
      warn('Warning within transaction', {
        errorType: error.constructor.name,
        message: error.message,
        transactionId: context.transactionId,
        attemptNumber: context.attemptNumber,
        requestId: context.requestId
      });
    }
  }

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
        requestId: context.requestId
      },
      timestamp: new Date().toISOString(),
      requiresManualInvestigation: true,
      investigationNotes: [
        'Transaction commit state is ambiguous - changes may or may not have been applied',
        'Manual verification of data state required',
        'Consider implementing idempotent operations to handle duplicate execution',
        'Check cluster logs for transaction commit confirmation'
      ]
    };

    err('AMBIGUOUS_TRANSACTION_COMMIT', ambiguousLogData);

    // Store for investigation dashboard
    try {
      // This could be enhanced to store in a dedicated investigation collection
      info('Stored ambiguous transaction for investigation', { 
        transactionId: context.transactionId,
        operationType: context.operationType 
      });
    } catch (storeError) {
      err('Failed to store ambiguous transaction data', { 
        error: storeError, 
        originalTransactionId: context.transactionId 
      });
    }
  }

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
      collection
    };
  }

  // Utility method for common transaction patterns
  static async atomicUpdate<T>(
    collection: any,
    key: string,
    updateFn: (currentValue: T | null) => T,
    context: TransactionOperationContext,
    config?: TransactionConfig
  ): Promise<T> {
    return await this.executeTransaction(
      async (ctx) => {
        // Get current document
        const currentDoc = await this.safeGet(ctx, collection, key, context);
        const currentValue = currentDoc ? currentDoc.content : null;

        // Apply update function
        const newValue = updateFn(currentValue);

        // Upsert the new value
        if (currentDoc) {
          await this.safeReplace(ctx, currentDoc, newValue, context);
        } else {
          await this.safeInsert(ctx, collection, key, newValue, context);
        }

        return newValue;
      },
      context,
      config
    );
  }

  // Utility method for batch operations within a transaction
  static async batchOperation<T>(
    operations: Array<(ctx: TransactionAttempt) => Promise<T>>,
    context: TransactionOperationContext,
    config?: TransactionConfig
  ): Promise<T[]> {
    return await this.executeTransaction(
      async (ctx) => {
        const results: T[] = [];
        
        for (let i = 0; i < operations.length; i++) {
          try {
            const result = await operations[i](ctx);
            results.push(result);
          } catch (error) {
            err('Batch operation failed', {
              operationIndex: i,
              totalOperations: operations.length,
              transactionId: context.transactionId,
              error: error.constructor.name
            });
            throw error;
          }
        }

        return results;
      },
      {
        ...context,
        totalOperations: operations.length
      },
      config
    );
  }
}