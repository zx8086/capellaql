/* src/telemetry/tracing/dbSpans.ts */

import { type Attributes, type Span, SpanStatusCode, trace } from "@opentelemetry/api";
import { telemetryLogger } from "../logger";
import { recordDatabaseOperation } from "../metrics/databaseMetrics";

export interface CouchbaseSpanOptions {
  bucket: string;
  scope?: string;
  collection?: string;
  operation: "get" | "upsert" | "insert" | "replace" | "remove" | "query" | "search";
  key?: string;
  query?: string;
}

export async function createDatabaseSpan<T>(options: CouchbaseSpanOptions, operation: () => Promise<T>): Promise<T> {
  const tracer = trace.getTracer("couchbase-client", "1.0.0");

  const spanName = `couchbase.${options.operation}`;
  const spanAttributes: Attributes = {
    "db.system": "couchbase",
    "db.name": options.bucket,
    "db.operation": options.operation,
  };

  // Add optional attributes
  if (options.scope) {
    spanAttributes["db.couchbase.scope"] = options.scope;
  }
  if (options.collection) {
    spanAttributes["db.collection.name"] = options.collection;
  }
  if (options.key) {
    spanAttributes["db.couchbase.document_key"] = options.key;
  }
  if (options.query) {
    spanAttributes["db.statement"] = options.query;
  }

  return await tracer.startActiveSpan(spanName, { attributes: spanAttributes }, async (span: Span) => {
    const startTime = Date.now();

    try {
      const result = await operation();

      const duration = Date.now() - startTime;
      span.setAttributes({
        "db.operation.duration_ms": duration,
        "db.operation.success": true,
      });

      // Record database metrics with trace correlation
      recordDatabaseOperation(options.operation, options.bucket, duration, true, options.scope, options.collection);

      // Log successful operation with trace context
      telemetryLogger.debug(`Database operation completed successfully`, {
        operation: options.operation,
        bucket: options.bucket,
        scope: options.scope,
        collection: options.collection,
        key: options.key,
        duration_ms: duration,
      });

      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorType = error instanceof Error ? error.name : "UnknownError";

      span.setAttributes({
        "db.operation.duration_ms": duration,
        "db.operation.success": false,
      });

      if (error instanceof Error) {
        span.setAttributes({
          "db.operation.error_name": error.name,
          "db.operation.error_message": error.message,
        });
        span.recordException(error);
      }

      // Record failed operation metrics with trace correlation
      recordDatabaseOperation(
        options.operation,
        options.bucket,
        duration,
        false,
        options.scope,
        options.collection,
        errorType
      );

      // Log error with trace context and structured metadata
      telemetryLogger.error(`Database operation failed`, error, {
        operation: options.operation,
        bucket: options.bucket,
        scope: options.scope,
        collection: options.collection,
        key: options.key,
        duration_ms: duration,
        error_type: errorType,
      });

      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });

      throw error;
    } finally {
      span.end();
    }
  });
}

export async function createCouchbaseGetSpan<T>(
  bucket: string,
  scope: string,
  collection: string,
  key: string,
  operation: () => Promise<T>
): Promise<T> {
  return createDatabaseSpan(
    {
      bucket,
      scope,
      collection,
      operation: "get",
      key,
    },
    operation
  );
}

export async function createCouchbaseQuerySpan<T>(
  bucket: string,
  query: string,
  operation: () => Promise<T>
): Promise<T> {
  return createDatabaseSpan(
    {
      bucket,
      operation: "query",
      query,
    },
    operation
  );
}

export async function createCouchbaseSearchSpan<T>(
  collections: Array<{ bucket: string; scope: string; collection: string }>,
  keys: string[],
  operation: () => Promise<T>
): Promise<T> {
  const tracer = trace.getTracer("couchbase-client", "1.0.0");

  const spanAttributes: Attributes = {
    "db.system": "couchbase",
    "db.operation": "search",
    "db.couchbase.collections_count": collections.length,
    "db.couchbase.keys_count": keys.length,
    "db.couchbase.collections": collections.map((c) => `${c.bucket}.${c.scope}.${c.collection}`).join(","),
  };

  return await tracer.startActiveSpan(
    "couchbase.multi_collection_search",
    { attributes: spanAttributes },
    async (span: Span) => {
      const startTime = Date.now();

      try {
        const result = await operation();

        const duration = Date.now() - startTime;
        span.setAttributes({
          "db.operation.duration_ms": duration,
          "db.operation.success": true,
        });

        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        span.setAttributes({
          "db.operation.duration_ms": duration,
          "db.operation.success": false,
        });

        if (error instanceof Error) {
          span.setAttributes({
            "db.operation.error_name": error.name,
            "db.operation.error_message": error.message,
          });
          span.recordException(error);
        }

        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });

        throw error;
      } finally {
        span.end();
      }
    }
  );
}
