import {
  DocumentNotFoundError,
  CouchbaseError,
  TimeoutError,
  UnambiguousTimeoutError,
  AmbiguousTimeoutError,
  ServiceNotAvailableError,
  TemporaryFailureError,
  AuthenticationFailureError,
  RateLimitedError,
  CasMismatchError,
  DocumentLockedError,
  DurabilityLevelNotAvailableError,
  DurabilityAmbiguousError,
  DurabilityImpossibleError,
  FeatureNotAvailableError,
  BucketNotFoundError,
  ScopeNotFoundError,
  CollectionNotFoundError,
  IndexNotFoundError,
  QueryError,
  AnalyticsError,
  ViewError,
  SearchError
} from 'couchbase';
import { retryWithBackoff } from '$utils/bunUtils';
import { error as err, warn, log as info } from '../telemetry/logger';
import { recordHttpResponseTime } from '../telemetry/metrics/httpMetrics';
import { recordQuery } from '$lib/couchbaseMetrics';

export interface ErrorClassification {
  retryable: boolean;
  severity: 'info' | 'warning' | 'critical';
  category: 'client' | 'network' | 'server' | 'application';
  shouldLog: boolean;
  shouldAlert: boolean;
  maxRetries?: number;
}

export interface OperationContext {
  operationType: string;
  operationId?: string;
  bucket?: string;
  scope?: string;
  collection?: string;
  documentKey?: string;
  query?: string;
  requestId?: string;
}

export interface ErrorMetrics {
  errorType: string;
  operationType: string;
  retryCount: number;
  totalDuration: number;
  wasRetried: boolean;
  wasSuccessful: boolean;
}

export class CouchbaseErrorHandler {
  private static readonly ERROR_CLASSIFICATIONS = new Map<string, ErrorClassification>([
    // Document/Key Errors - Not retryable, expected in normal operations
    ['DocumentNotFoundError', { retryable: false, severity: 'info', category: 'application', shouldLog: false, shouldAlert: false }],
    ['CasMismatchError', { retryable: false, severity: 'info', category: 'application', shouldLog: true, shouldAlert: false }],
    ['DocumentLockedError', { retryable: true, severity: 'warning', category: 'application', shouldLog: true, shouldAlert: false, maxRetries: 3 }],
    
    // Authentication/Authorization - Critical, not retryable
    ['AuthenticationFailureError', { retryable: false, severity: 'critical', category: 'client', shouldLog: true, shouldAlert: true }],
    
    // Network/Timeout Errors - Retryable with different strategies
    ['TimeoutError', { retryable: true, severity: 'warning', category: 'network', shouldLog: true, shouldAlert: false, maxRetries: 3 }],
    ['UnambiguousTimeoutError', { retryable: true, severity: 'warning', category: 'network', shouldLog: true, shouldAlert: false, maxRetries: 2 }],
    ['AmbiguousTimeoutError', { retryable: false, severity: 'critical', category: 'network', shouldLog: true, shouldAlert: true }],
    
    // Service Availability - Retryable, indicates system issues
    ['ServiceNotAvailableError', { retryable: true, severity: 'critical', category: 'server', shouldLog: true, shouldAlert: true, maxRetries: 5 }],
    ['TemporaryFailureError', { retryable: true, severity: 'warning', category: 'server', shouldLog: true, shouldAlert: false, maxRetries: 3 }],
    ['RateLimitedError', { retryable: true, severity: 'warning', category: 'server', shouldLog: true, shouldAlert: false, maxRetries: 2 }],
    
    // Resource Not Found - Not retryable, configuration issues
    ['BucketNotFoundError', { retryable: false, severity: 'critical', category: 'client', shouldLog: true, shouldAlert: true }],
    ['ScopeNotFoundError', { retryable: false, severity: 'critical', category: 'client', shouldLog: true, shouldAlert: true }],
    ['CollectionNotFoundError', { retryable: false, severity: 'critical', category: 'client', shouldLog: true, shouldAlert: true }],
    ['IndexNotFoundError', { retryable: false, severity: 'warning', category: 'client', shouldLog: true, shouldAlert: false }],
    
    // Query/Service Specific Errors - Mixed retry strategies
    ['QueryError', { retryable: false, severity: 'warning', category: 'application', shouldLog: true, shouldAlert: false }],
    ['AnalyticsError', { retryable: false, severity: 'warning', category: 'application', shouldLog: true, shouldAlert: false }],
    ['ViewError', { retryable: false, severity: 'warning', category: 'application', shouldLog: true, shouldAlert: false }],
    ['SearchError', { retryable: false, severity: 'warning', category: 'application', shouldLog: true, shouldAlert: false }],
    
    // Durability Errors - Mixed strategies
    ['DurabilityLevelNotAvailableError', { retryable: false, severity: 'warning', category: 'server', shouldLog: true, shouldAlert: false }],
    ['DurabilityAmbiguousError', { retryable: false, severity: 'critical', category: 'server', shouldLog: true, shouldAlert: true }],
    ['DurabilityImpossibleError', { retryable: false, severity: 'critical', category: 'server', shouldLog: true, shouldAlert: true }],
    
    // Feature Availability
    ['FeatureNotAvailableError', { retryable: false, severity: 'warning', category: 'server', shouldLog: true, shouldAlert: false }],
  ]);

  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: OperationContext,
    maxRetries?: number
  ): Promise<T> {
    const startTime = Date.now();
    let lastError: Error | null = null;
    let retryCount = 0;
    
    const operationId = context.operationId || `${context.operationType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      return await retryWithBackoff(
        async () => {
          try {
            const result = await operation();
            
            // Record successful operation metrics
            recordHttpResponseTime(Date.now() - startTime, 'COUCHBASE', context.operationType, 200);

            // Record query metrics for performance tracking
            recordQuery(context.operationType, Date.now() - startTime, true, {
              query: context.query,
              documentKey: context.documentKey,
              bucket: context.bucket,
              scope: context.scope,
              collection: context.collection,
              requestId: context.requestId
            });
            
            return result;
          } catch (error) {
            retryCount++;
            lastError = error as Error;
            
            const classification = this.classifyError(error);
            
            // Handle ambiguous operations - NEVER retry, always log
            if (error instanceof AmbiguousTimeoutError) {
              await this.handleAmbiguousOperation(error, { ...context, operationId });
              throw error;
            }
            
            // Log error based on classification
            if (classification.shouldLog) {
              this.logError(error, context, retryCount, classification);
            }
            
            // Check if error is retryable
            if (!classification.retryable) {
              throw error;
            }
            
            // Check retry limits
            const effectiveMaxRetries = maxRetries ?? classification.maxRetries ?? 3;
            if (retryCount >= effectiveMaxRetries) {
              throw error;
            }
            
            throw error; // Let retry logic handle the delay
          }
        },
        maxRetries || 3,
        1000,
        5000
      );
    } catch (error) {
      // Record failed operation metrics
      recordHttpResponseTime(Date.now() - startTime, 'COUCHBASE', context.operationType, 500);

      // Record failed query metrics
      recordQuery(context.operationType, Date.now() - startTime, false, {
        query: context.query,
        errorType: error.constructor.name,
        documentKey: context.documentKey,
        bucket: context.bucket,
        scope: context.scope,
        collection: context.collection,
        requestId: context.requestId
      });
      
      throw error;
    }
  }

  static classifyError(error: any): ErrorClassification {
    const errorType = error.constructor.name;
    const classification = this.ERROR_CLASSIFICATIONS.get(errorType);
    
    if (classification) {
      return classification;
    }
    
    // Default classification for unknown Couchbase errors
    if (error instanceof CouchbaseError) {
      return {
        retryable: false,
        severity: 'warning',
        category: 'server',
        shouldLog: true,
        shouldAlert: false
      };
    }
    
    // Default for non-Couchbase errors
    return {
      retryable: false,
      severity: 'critical',
      category: 'application',
      shouldLog: true,
      shouldAlert: true
    };
  }

  private static logError(
    error: any,
    context: OperationContext,
    retryCount: number,
    classification: ErrorClassification
  ): void {
    const logData = {
      errorType: error.constructor.name,
      message: error.message,
      context,
      retryCount,
      classification: {
        severity: classification.severity,
        category: classification.category,
        retryable: classification.retryable
      },
      timestamp: new Date().toISOString()
    };

    switch (classification.severity) {
      case 'critical':
        err(`Couchbase ${classification.category} error`, logData);
        break;
      case 'warning':
        warn(`Couchbase ${classification.category} error`, logData);
        break;
      case 'info':
        info(`Couchbase ${classification.category} error`, logData);
        break;
    }
  }

  private static async handleAmbiguousOperation(
    error: AmbiguousTimeoutError,
    context: OperationContext & { operationId: string }
  ): Promise<void> {
    const ambiguousLogData = {
      operationId: context.operationId,
      operationType: context.operationType,
      errorMessage: error.message,
      context: {
        bucket: context.bucket,
        scope: context.scope,
        collection: context.collection,
        documentKey: context.documentKey,
        query: context.query ? context.query.substring(0, 200) + '...' : undefined,
        requestId: context.requestId
      },
      timestamp: new Date().toISOString(),
      requiresManualInvestigation: true,
      investigationNotes: 'Operation may have succeeded on server but client timed out. Manual verification required.'
    };

    err('AMBIGUOUS_TIMEOUT_OPERATION', ambiguousLogData);
    
    // Store ambiguous operations for investigation dashboard
    await this.storeAmbiguousOperation(ambiguousLogData);
  }

  private static async storeAmbiguousOperation(logData: any): Promise<void> {
    try {
      // This could be enhanced to store in a dedicated collection for investigation
      // For now, we rely on structured logging for investigation
      info('Stored ambiguous operation for investigation', { operationId: logData.operationId });
    } catch (storeError) {
      err('Failed to store ambiguous operation', { error: storeError, originalLogData: logData });
    }
  }


  static createDocumentOperationContext(
    operationType: string,
    bucket: string,
    scope: string,
    collection: string,
    documentKey: string,
    requestId?: string
  ): OperationContext {
    return {
      operationType,
      bucket,
      scope,
      collection,
      documentKey,
      requestId
    };
  }

  static createQueryOperationContext(
    operationType: string,
    query: string,
    requestId?: string,
    bucket?: string
  ): OperationContext {
    return {
      operationType,
      query,
      requestId,
      bucket
    };
  }

  static createConnectionOperationContext(
    operationType: string,
    requestId?: string
  ): OperationContext {
    return {
      operationType,
      requestId
    };
  }

  static getErrorStats(): {
    totalErrors: number;
    errorsByType: Record<string, number>;
    errorsByCategory: Record<string, number>;
    retrySuccessRate: number;
  } {
    // This would typically be implemented with actual metrics storage
    // For now, return placeholder data
    return {
      totalErrors: 0,
      errorsByType: {},
      errorsByCategory: {},
      retrySuccessRate: 0
    };
  }
}