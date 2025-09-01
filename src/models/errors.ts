/* src/models/errors.ts - Structured Error Hierarchy */

/**
 * Base application error class that all custom errors extend
 */
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;
  public readonly context?: Record<string, any>;
  public readonly timestamp: string;

  constructor(
    message: string,
    public readonly cause?: Error,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;
    this.timestamp = new Date().toISOString();

    // Maintains proper stack trace for where our error was thrown (Node.js only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialize error for logging or API responses
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      context: this.context,
      cause: this.cause?.message,
    };
  }
}

/**
 * Database-related errors
 */
export class DatabaseError extends AppError {
  readonly statusCode = 500;
  readonly code = "DATABASE_ERROR";

  constructor(message: string, cause?: Error, context?: Record<string, any>) {
    super(`Database operation failed: ${message}`, cause, context);
  }
}

/**
 * Document not found errors (specific type of database error)
 */
export class DocumentNotFoundError extends DatabaseError {
  readonly statusCode = 404;
  readonly code = "DOCUMENT_NOT_FOUND";

  constructor(documentId: string, collection?: string, cause?: Error) {
    const message = collection
      ? `Document '${documentId}' not found in collection '${collection}'`
      : `Document '${documentId}' not found`;

    super(message, cause, { documentId, collection });
  }
}

/**
 * Input validation errors
 */
export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly code = "VALIDATION_ERROR";

  constructor(message: string, field?: string, value?: any, cause?: Error) {
    super(`Validation failed: ${message}`, cause, { field, value });
  }
}

/**
 * Authentication errors
 */
export class AuthenticationError extends AppError {
  readonly statusCode = 401;
  readonly code = "AUTHENTICATION_ERROR";

  constructor(message: string = "Authentication required", cause?: Error) {
    super(message, cause);
  }
}

/**
 * Authorization errors
 */
export class AuthorizationError extends AppError {
  readonly statusCode = 403;
  readonly code = "AUTHORIZATION_ERROR";

  constructor(message: string = "Access denied", resource?: string, cause?: Error) {
    super(message, cause, { resource });
  }
}

/**
 * GraphQL operation errors
 */
export class GraphQLError extends AppError {
  readonly statusCode = 400;
  readonly code = "GRAPHQL_ERROR";

  constructor(message: string, operationName?: string, variables?: Record<string, any>, cause?: Error) {
    super(`GraphQL operation failed: ${message}`, cause, { operationName, variables });
  }
}

/**
 * External service errors (OpenTelemetry, third-party APIs)
 */
export class ExternalServiceError extends AppError {
  readonly statusCode = 502;
  readonly code = "EXTERNAL_SERVICE_ERROR";

  constructor(serviceName: string, message: string, endpoint?: string, cause?: Error) {
    super(`External service '${serviceName}' error: ${message}`, cause, {
      serviceName,
      endpoint,
    });
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends AppError {
  readonly statusCode = 429;
  readonly code = "RATE_LIMIT_EXCEEDED";

  constructor(limit: number, windowMs: number, clientId?: string, cause?: Error) {
    super(`Rate limit exceeded: ${limit} requests per ${windowMs}ms`, cause, { limit, windowMs, clientId });
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends AppError {
  readonly statusCode = 500;
  readonly code = "CONFIGURATION_ERROR";

  constructor(message: string, configKey?: string, cause?: Error) {
    super(`Configuration error: ${message}`, cause, { configKey });
  }
}

/**
 * Circuit breaker errors
 */
export class CircuitBreakerError extends AppError {
  readonly statusCode = 503;
  readonly code = "CIRCUIT_BREAKER_OPEN";

  constructor(serviceName: string, cause?: Error) {
    super(`Circuit breaker is open for service: ${serviceName}`, cause, {
      serviceName,
    });
  }
}

/**
 * Utility function to check if an error is an application error
 */
export function isAppError(error: any): error is AppError {
  return error instanceof AppError;
}

/**
 * Utility function to convert any error to an AppError
 */
export function toAppError(error: any, defaultMessage?: string): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new DatabaseError(defaultMessage || error.message, error);
  }

  return new DatabaseError(defaultMessage || "An unknown error occurred", undefined, { originalError: error });
}

/**
 * Error response formatter for GraphQL/HTTP responses
 */
export function formatErrorResponse(error: AppError) {
  return {
    error: {
      code: error.code,
      message: error.message,
      timestamp: error.timestamp,
      ...(error.context && { context: error.context }),
    },
  };
}

/**
 * Map Couchbase errors to application errors
 */
export function mapCouchbaseError(error: any, context?: Record<string, any>): AppError {
  if (error?.name === "DocumentNotFoundError") {
    return new DocumentNotFoundError(context?.documentId || "unknown", context?.collection, error);
  }

  if (error?.name === "CouchbaseError") {
    return new DatabaseError(error.message || "Couchbase operation failed", error, context);
  }

  return new DatabaseError("Unexpected database error", error, context);
}
