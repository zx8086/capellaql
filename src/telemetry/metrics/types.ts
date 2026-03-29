/* src/telemetry/metrics/types.ts */
// TypeScript attribute types per monitoring-updated.md line 39

export interface BaseMetricAttributes {
  service_name?: string;
  service_version?: string;
  deployment_environment?: string;
}

export interface HttpRequestAttributes extends BaseMetricAttributes {
  method: string;
  route: string;
  status_code?: string;
  protocol?: string;
}

export interface HttpResponseAttributes extends HttpRequestAttributes {
  trace_id?: string;
  span_id?: string;
}

export interface GraphQLOperationAttributes extends BaseMetricAttributes {
  operation_name: string;
  operation_type: "query" | "mutation" | "subscription";
  has_errors?: string;
  complexity?: number;
}

export interface GraphQLResolverAttributes extends BaseMetricAttributes {
  resolver_name: string;
  field_name: string;
  parent_type: string;
  return_type?: string;
}

export interface DatabaseOperationAttributes extends BaseMetricAttributes {
  operation: string;
  bucket: string;
  scope?: string;
  collection?: string;
  status: "success" | "error";
  error_type?: string;
  trace_id?: string;
}

export interface DatabaseConnectionAttributes extends BaseMetricAttributes {
  bucket: string;
  state: "connecting" | "connected" | "disconnecting" | "disconnected";
}

export interface CacheOperationAttributes extends BaseMetricAttributes {
  cache_type: "sqlite" | "map" | "query";
  operation: "get" | "set" | "delete" | "clear";
  hit: boolean;
}

export interface CircuitBreakerAttributes extends BaseMetricAttributes {
  circuit_name: string;
  state: "closed" | "open" | "half-open";
  service?: string;
}

export interface ProcessMetricAttributes extends BaseMetricAttributes {
  process_type?: string;
}

export interface GCMetricAttributes extends BaseMetricAttributes {
  gc_type: "minor" | "major" | "incremental" | "unknown";
}

export interface MemoryMetricAttributes extends BaseMetricAttributes {
  memory_type: "heap_used" | "heap_total" | "external" | "rss" | "array_buffers";
}

export interface SecurityEventAttributes extends BaseMetricAttributes {
  event_type: string;
  severity: "info" | "warning" | "critical";
  source?: string;
}

export interface ErrorMetricAttributes extends BaseMetricAttributes {
  error_type: string;
  error_code?: string;
  component: string;
  recoverable: boolean;
}

export interface TelemetryExportAttributes extends BaseMetricAttributes {
  signal_type: "traces" | "metrics" | "logs";
  exporter: string;
  status: "success" | "failure";
  error_message?: string;
}
