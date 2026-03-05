# OpenTelemetry Implementation Guide - CapellaQL

## Overview

This comprehensive guide details the OpenTelemetry implementation in CapellaQL, a high-performance GraphQL service built with Bun. The implementation follows 2025 OpenTelemetry standards with advanced cost optimization, error preservation, and production-ready patterns.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Configuration Management](#configuration-management)
3. [Instrumentation Setup](#instrumentation-setup)
4. [Custom OTLP Exporters](#custom-otlp-exporters)
5. [Smart Sampling Strategy](#smart-sampling-strategy)
6. [Metrics Collection](#metrics-collection)
7. [Health Monitoring](#health-monitoring)
8. [Circuit Breaker Integration](#circuit-breaker-integration)
9. [Implementation for Other Projects](#implementation-for-other-projects)
10. [Best Practices](#best-practices)

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│  GraphQL Resolvers  │  HTTP Endpoints  │  Database Operations   │
└─────────────────┬───┴──────────────────┴────────────────────────┘
                 │
┌─────────────────▼────────────────────────────────────────────────┐
│                   TELEMETRY LAYER                               │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                │
│ │   TRACES    │ │   METRICS   │ │    LOGS     │                │
│ │             │ │             │ │             │                │
│ │ • Spans     │ │ • Counters  │ │ • Structured│                │
│ │ • Context   │ │ • Histograms│ │ • Levels    │                │
│ │ • Baggage   │ │ • Gauges    │ │ • Correlation│               │
│ └─────────────┘ └─────────────┘ └─────────────┘                │
└─────────────────┬────────────────────────────────────────────────┘
                 │
┌─────────────────▼────────────────────────────────────────────────┐
│                SAMPLING & FILTERING                             │
├─────────────────────────────────────────────────────────────────┤
│  SimpleSmartSampler                                             │
│  • 3-tier sampling (traces/metrics/logs)                       │
│  • Error preservation (100% capture)                           │
│  • Cost optimization (60-70% reduction)                        │
│  • Health check filtering                                       │
└─────────────────┬────────────────────────────────────────────────┘
                 │
┌─────────────────▼────────────────────────────────────────────────┐
│              STANDARD OTLP HTTP EXPORTERS                        │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                │
│ │OTLPTrace    │ │OTLPMetric   │ │OTLPLog      │                │
│ │Exporter     │ │Exporter     │ │Exporter     │                │
│ │             │ │             │ │             │                │
│ │• HTTP/JSON  │ │• Periodic   │ │• Batch      │                │
│ │• Batch      │ │  export     │ │  processing │                │
│ │  processing │ │• Stats      │ │• Stats      │                │
│ │• Stats wrap │ │  tracking   │ │  tracking   │                │
│ └─────────────┘ └─────────────┘ └─────────────┘                │
└─────────────────┬────────────────────────────────────────────────┘
                 │
┌─────────────────▼────────────────────────────────────────────────┐
│               OTLP COLLECTORS                                   │
├─────────────────────────────────────────────────────────────────┤
│  • Traces: :4318/v1/traces                                     │
│  • Metrics: :4318/v1/metrics                                   │
│  • Logs: :4318/v1/logs                                         │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

- **Unified Configuration System**: Centralized config with Zod validation
- **Standard OTLP HTTP Exporters**: Uses `@opentelemetry/exporter-*-otlp-http` packages with export stats tracking wrappers
- **Export Stats Tracking**: Wraps standard exporters to track success/failure rates
- **Health Monitoring**: Circuit breakers and comprehensive health checks
- **Production-Ready Patterns**: Timeout handling, batch processing, graceful shutdown

## Configuration Management

### Unified Configuration Structure

The telemetry configuration is integrated into a unified system (`src/config.ts`):

```typescript
interface TelemetryConfig {
  // Core settings
  ENABLE_OPENTELEMETRY: boolean;
  SERVICE_NAME: string;
  SERVICE_VERSION: string;
  DEPLOYMENT_ENVIRONMENT: string;

  // Endpoints
  TRACES_ENDPOINT: string;
  METRICS_ENDPOINT: string;
  LOGS_ENDPOINT: string;

  // Performance settings (2025 standards)
  EXPORT_TIMEOUT_MS: number;      // 30,000ms
  BATCH_SIZE: number;             // 2,048
  MAX_QUEUE_SIZE: number;         // 10,000
  METRIC_READER_INTERVAL: number; // 60,000ms

  // Simplified 3-tier sampling
  TRACES_SAMPLING_RATE: number;   // 0.15 (15%)
  METRICS_SAMPLING_RATE: number;  // 0.25 (25%)
  LOGS_SAMPLING_RATE: number;     // 0.30 (30%)

  // Cost optimization
  COST_OPTIMIZATION_MODE: boolean;        // true
  HEALTH_CHECK_SAMPLING_RATE: number;     // 0.05 (5%)

  // Circuit breaker
  CIRCUIT_BREAKER_THRESHOLD: number;      // 5
  CIRCUIT_BREAKER_TIMEOUT_MS: number;     // 60,000ms
}
```

### Environment Variables

```bash
# Core Configuration
ENABLE_OPENTELEMETRY=true
SERVICE_NAME="CapellaQL Service"
SERVICE_VERSION="2.0"
DEPLOYMENT_ENVIRONMENT="production"

# OTLP Endpoints
TRACES_ENDPOINT="http://localhost:4318/v1/traces"
METRICS_ENDPOINT="http://localhost:4318/v1/metrics"
LOGS_ENDPOINT="http://localhost:4318/v1/logs"

# Performance Tuning (2025 Standards)
EXPORT_TIMEOUT_MS=30000
BATCH_SIZE=2048
MAX_QUEUE_SIZE=10000
METRIC_READER_INTERVAL=60000

# Cost-Optimized 3-Tier Sampling
TRACES_SAMPLING_RATE=0.15    # 15% traces
METRICS_SAMPLING_RATE=0.25   # 25% metrics
LOGS_SAMPLING_RATE=0.30      # 30% logs
COST_OPTIMIZATION_MODE=true
HEALTH_CHECK_SAMPLING_RATE=0.05

# Circuit Breaker Protection
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_TIMEOUT_MS=60000
```

### Configuration Validation

All configuration uses Zod schemas for runtime validation:

```typescript
const TelemetryConfigSchema = z.object({
  ENABLE_OPENTELEMETRY: z.boolean().default(true),
  SERVICE_NAME: z.string().min(1),
  SERVICE_VERSION: z.string().min(1),
  DEPLOYMENT_ENVIRONMENT: z.enum(["development", "staging", "production"]),

  // Sampling rates validation
  TRACES_SAMPLING_RATE: z.number().min(0).max(1),
  METRICS_SAMPLING_RATE: z.number().min(0).max(1),
  LOGS_SAMPLING_RATE: z.number().min(0).max(1),

  // Performance constraints
  EXPORT_TIMEOUT_MS: z.number().min(1000).max(60000),
  BATCH_SIZE: z.number().min(1).max(5000),
});
```

## Instrumentation Setup

### Main Initialization (`src/telemetry/instrumentation.ts`)

```typescript
export async function initializeTelemetry(): Promise<void> {
  if (isInitialized()) {
    warn("OpenTelemetry already initialized, skipping");
    return;
  }

  // 1. Load and validate configuration from unified config system
  config = telemetryConfig;

  // 2. Set up diagnostic logging
  diag.setLogger(
    new DiagConsoleLogger(),
    config.DEPLOYMENT_ENVIRONMENT === "development" ? DiagLogLevel.INFO : DiagLogLevel.WARN
  );

  // 3. Create synchronous resource (eliminates async warnings)
  const resource = createResource(config);

  // 4. Create standard OTLP exporters with stats tracking wrappers
  const baseTraceExporter = new OTLPTraceExporter({
    url: config.TRACES_ENDPOINT,
    timeoutMillis: config.EXPORT_TIMEOUT_MS,
  });
  const baseMetricExporter = new OTLPMetricExporter({
    url: config.METRICS_ENDPOINT,
    timeoutMillis: config.EXPORT_TIMEOUT_MS,
  });
  const baseLogExporter = new OTLPLogExporter({
    url: config.LOGS_ENDPOINT,
    timeoutMillis: config.EXPORT_TIMEOUT_MS,
  });

  // Wrap with export stats tracking
  const traceExporter = wrapSpanExporter(baseTraceExporter, traceExportStats);
  const metricExporter = wrapMetricExporter(baseMetricExporter, metricExportStats);
  const logExporter = wrapLogRecordExporter(baseLogExporter, logExportStats);

  // 5. Create processors with batch settings
  const spanProcessor = new BatchSpanProcessor(traceExporter, {
    maxQueueSize: config.MAX_QUEUE_SIZE,
    scheduledDelayMillis: config.EXPORT_INTERVAL_MS,
  });
  const logProcessor = new BatchLogRecordProcessor(logExporter);
  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: config.EXPORT_INTERVAL_MS,
  });

  // 6. Create W3C-compliant propagator
  const propagator = new CompositePropagator({
    propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
  });

  // 7. Initialize NodeSDK with all components
  sdk = new NodeSDK({
    resource,
    autoDetectResources: false,
    textMapPropagator: propagator,
    spanProcessors: [spanProcessor],
    logRecordProcessors: [logProcessor],
    metricReader,
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-runtime-node": { enabled: false }, // Bun incompatible
        "@opentelemetry/instrumentation-http": {
          ignoreIncomingRequestHook: (req) => req.url?.includes("/health"),
        },
      }),
      new GraphQLInstrumentation({
        allowValues: true,
        depth: -1,
        mergeItems: true,
      }),
      new DataloaderInstrumentation(),
      new RedisInstrumentation(),
    ],
  });

  await sdk.start();
  setInitialized();
  setupGracefulShutdown();
}
```

### Resource Creation (Synchronous)

```typescript
function createResource(config: TelemetryConfig) {
  // All attributes are synchronous to eliminate async warnings
  const attributes = {
    // Service identification (2025 standards)
    [ATTR_SERVICE_NAME]: config.SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: config.SERVICE_VERSION,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: config.DEPLOYMENT_ENVIRONMENT,
    [SEMRESATTRS_SERVICE_NAMESPACE]: "capella-graphql-api",
    [SEMRESATTRS_SERVICE_INSTANCE_ID]: os.hostname(),

    // Runtime information
    "runtime.name": "bun",
    "runtime.version": typeof Bun !== "undefined" ? Bun.version : process.version,

    // Process information (replaces async processDetector)
    "process.pid": process.pid,
    "process.executable.name": typeof Bun !== "undefined" ? "bun" : "node",

    // Host information (replaces async hostDetector)
    "host.name": os.hostname(),
    "host.arch": os.arch(),
    "host.type": os.type(),
  };

  return resourceFromAttributes(attributes);
}
```

## Standard OTLP HTTP Exporters

The implementation uses **standard OTLP HTTP exporters** from the official OpenTelemetry packages, wrapped with export statistics tracking for observability.

### Exporter Configuration

```typescript
// From src/telemetry/instrumentation.ts
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { wrapSpanExporter, wrapMetricExporter, wrapLogRecordExporter } from "./export-stats-tracker";

// Create base exporters with configuration
const baseOtlpTraceExporter = new OTLPTraceExporter({
  url: config.TRACES_ENDPOINT,
  timeoutMillis: config.EXPORT_TIMEOUT_MS,
});

const baseOtlpMetricExporter = new OTLPMetricExporter({
  url: config.METRICS_ENDPOINT,
  timeoutMillis: config.EXPORT_TIMEOUT_MS,
});

const baseOtlpLogExporter = new OTLPLogExporter({
  url: config.LOGS_ENDPOINT,
  timeoutMillis: config.EXPORT_TIMEOUT_MS,
});

// Wrap with stats tracking
const trackingTraceExporter = wrapSpanExporter(baseOtlpTraceExporter, traceExportStats);
const trackingMetricExporter = wrapMetricExporter(baseOtlpMetricExporter, metricExportStats);
const trackingLogExporter = wrapLogRecordExporter(baseOtlpLogExporter, logExportStats);
```

### Export Stats Tracking (`src/telemetry/export-stats-tracker.ts`)

The export stats tracker wraps standard exporters to provide observability into export operations:

```typescript
export interface ExportStats {
  totalExports: number;
  successCount: number;
  failureCount: number;
  lastExportTime: number | null;
  lastSuccessTime: number | null;
  lastFailureTime: number | null;
  recentErrors: string[];
}

export interface ExportStatsTracker {
  recordExportAttempt(): void;
  recordExportSuccess(): void;
  recordExportFailure(error?: Error): void;
  getStats(): ExportStats;
}

export function createExportStatsTracker(): ExportStatsTracker {
  const stats: ExportStats = {
    totalExports: 0,
    successCount: 0,
    failureCount: 0,
    lastExportTime: null,
    lastSuccessTime: null,
    lastFailureTime: null,
    recentErrors: [],
  };

  return {
    recordExportAttempt() {
      stats.totalExports++;
      stats.lastExportTime = Date.now();
    },
    recordExportSuccess() {
      stats.successCount++;
      stats.lastSuccessTime = Date.now();
    },
    recordExportFailure(error?: Error) {
      stats.failureCount++;
      stats.lastFailureTime = Date.now();
      if (error) {
        stats.recentErrors.push(`${new Date().toISOString()}: ${error.message}`);
        // Keep only last 10 errors
        if (stats.recentErrors.length > 10) {
          stats.recentErrors.shift();
        }
      }
    },
    getStats() {
      return { ...stats, recentErrors: [...stats.recentErrors] };
    },
  };
}
```

### Wrapper Functions

```typescript
// Wrap span exporter with stats tracking
export function wrapSpanExporter(
  exporter: SpanExporter,
  tracker: ExportStatsTracker
): SpanExporter {
  return {
    export(spans, resultCallback) {
      tracker.recordExportAttempt();
      exporter.export(spans, (result) => {
        if (result.code === 0) {
          tracker.recordExportSuccess();
        } else {
          tracker.recordExportFailure(result.error);
        }
        resultCallback(result);
      });
    },
    shutdown: () => exporter.shutdown(),
    forceFlush: () => exporter.forceFlush?.() ?? Promise.resolve(),
  };
}

// Similar wrappers exist for metric and log exporters
export function wrapMetricExporter(exporter, tracker): PushMetricExporter;
export function wrapLogRecordExporter(exporter, tracker): LogRecordExporter;
```

### Batch Processors

Standard batch processors are used with optimized settings:

```typescript
// Trace processor - small batches, frequent exports
const traceProcessor = new BatchSpanProcessor(trackingTraceExporter, {
  maxExportBatchSize: 10,
  scheduledDelayMillis: 1000,
});

// Metric reader - periodic export
const periodicReader = new PeriodicExportingMetricReader({
  exporter: trackingMetricExporter,
  exportIntervalMillis: config.METRIC_READER_INTERVAL, // Default: 60000ms
});

// Log processor - default batch settings
const logProcessor = new BatchLogRecordProcessor(trackingLogExporter);
```

### Accessing Export Statistics

Export statistics are available via the telemetry status API:

```typescript
import { getTelemetryStatus } from "./telemetry/instrumentation";

const status = getTelemetryStatus();
console.log(status.exportStats);
// {
//   traces: { totalExports: 150, successCount: 148, failureCount: 2, ... },
//   metrics: { totalExports: 50, successCount: 50, failureCount: 0, ... },
//   logs: { totalExports: 200, successCount: 198, failureCount: 2, ... }
// }
```

### Health Endpoint Integration

Export statistics are exposed via the `/health/telemetry` endpoint for monitoring:

```json
{
  "overall": "healthy",
  "components": {
    "exports": {
      "status": "healthy",
      "stats": {
        "totalExports": 1500,
        "successCount": 1485,
        "failureCount": 15,
        "successRate": 99,
        "lastExportTime": "2025-02-25T12:00:00.000Z",
        "recentErrors": []
      }
    }
  }
}
```

## Sampling Strategy

### Built-in Sampling Configuration

CapellaQL uses standard OpenTelemetry sampling configured via environment variables:

```typescript
// Sampling is controlled via telemetry configuration
interface TelemetryConfig {
  TRACES_SAMPLING_RATE: number;   // 0.0-1.0 (default: 1.0 = 100%)
  METRICS_SAMPLING_RATE: number;  // 0.0-1.0 (default: 1.0 = 100%)
  LOGS_SAMPLING_RATE: number;     // 0.0-1.0 (default: 1.0 = 100%)
}
```

### Environment Variables

```bash
# Sampling rates (0.0-1.0)
OTEL_TRACES_SAMPLING_RATE=0.15     # 15% of traces
OTEL_METRICS_SAMPLING_RATE=0.25    # 25% of metrics
OTEL_LOGS_SAMPLING_RATE=0.30       # 30% of logs
```

### Health Check Filtering

Health checks are filtered at the instrumentation level to reduce noise:

```typescript
getNodeAutoInstrumentations({
  "@opentelemetry/instrumentation-http": {
    ignoreIncomingRequestHook: (req) => req.url?.includes("/health"),
  },
})
```

### Cost Optimization Recommendations

For production environments, consider these sampling configurations:

| Environment | Traces | Metrics | Logs | Est. Cost Reduction |
|-------------|--------|---------|------|---------------------|
| Development | 1.0    | 1.0     | 1.0  | 0%                  |
| Staging     | 0.50   | 0.50    | 0.50 | 50%                 |
| Production  | 0.15   | 0.25    | 0.30 | 60-70%              |

**Best Practices:**
- Always capture 100% of errors (handle at application level, not sampling)
- Reduce health check noise via instrumentation hooks
- Use head-based sampling for consistent trace propagation

## Metrics Collection

### HTTP Metrics (`src/telemetry/metrics/httpMetrics.ts`)

```typescript
export function recordHttpRequest(method: string, route: string, statusCode?: number): void {
  if (!isInitialized || !httpRequestCounter) return;

  // Record metric with labels
  httpRequestCounter.add(1, {
    method: method.toUpperCase(),
    route,
    ...(statusCode && { status_code: statusCode.toString() }),
  });
}

export function recordHttpResponseTime(durationMs: number, method?: string, route?: string, statusCode?: number): void {
  if (!isInitialized || !httpResponseTimeHistogram) return;

  // Convert to seconds for UCUM compliance (2025 standards)
  const durationSeconds = durationMs / 1000;

  const labels: Record<string, string> = {};
  if (method) labels.method = method.toUpperCase();
  if (route) labels.route = route;
  if (statusCode) labels.status_code = statusCode.toString();

  // Add trace context for correlation
  const activeContext = context.active();
  const span = trace.getSpan(activeContext);
  if (span) {
    const spanContext = span.spanContext();
    if (spanContext.traceId) {
      labels.trace_id = spanContext.traceId;
    }
  }

  httpResponseTimeHistogram.record(durationSeconds, labels);
}
```

### Database Metrics (`src/telemetry/metrics/databaseMetrics.ts`)

```typescript
export function recordDatabaseOperation(
  operation: string,
  bucket: string,
  durationMs: number,
  success: boolean,
  scope?: string,
  collection?: string,
  errorType?: string
): void {
  // Check circuit breaker
  const circuitBreaker = telemetryHealthMonitor.getCircuitBreaker();
  if (!circuitBreaker.canExecute()) return;

  try {
    const labels: DatabaseMetricsLabels = {
      operation: operation.toLowerCase(),
      bucket,
      status: success ? "success" : "error",
    };

    // Add optional labels
    if (scope) labels.scope = scope;
    if (collection) labels.collection = collection;
    if (errorType && !success) labels.error_type = errorType;

    // Add trace correlation
    const activeContext = context.active();
    const span = trace.getSpan(activeContext);
    const spanContext = span?.spanContext();

    const metricsAttributes = {
      ...labels,
      ...(spanContext?.traceId && { trace_id: spanContext.traceId.slice(0, 8) }),
    };

    // Record metrics
    dbOperationCounter.add(1, metricsAttributes);
    dbResponseTimeHistogram.record(durationMs / 1000, metricsAttributes);

    // Update health monitoring
    telemetryHealthMonitor.recordExporterSuccess("metrics");
    circuitBreaker.recordSuccess();
  } catch (error) {
    telemetryHealthMonitor.recordExporterFailure("metrics", error as Error);
    circuitBreaker.recordFailure();
  }
}
```

### SLI/SLO Metrics

```typescript
export function recordSLIMetric(
  sliName: string,
  value: number,
  success: boolean,
  additionalLabels?: Record<string, string>
): void {
  if (!isInitialized) return;

  // Check circuit breaker for resilience
  const circuitBreaker = telemetryHealthMonitor.getCircuitBreaker();
  if (!circuitBreaker.canExecute()) return;

  try {
    const meter = metrics.getMeter("capellaql-sli-metrics", "1.0.0");
    const sliCounter = meter.createCounter(`sli_${sliName}_total`, {
      description: `SLI metric for ${sliName}`,
      unit: "1",
    });

    sliCounter.add(value, {
      sli_name: sliName,
      status: success ? "success" : "failure",
      ...additionalLabels,
    });

    circuitBreaker.recordSuccess();
  } catch (error) {
    circuitBreaker.recordFailure();
  }
}
```

## Health Monitoring

### Telemetry Health Monitor (`src/telemetry/health/telemetryHealth.ts`)

```typescript
class TelemetryHealthMonitor {
  private exporterHealth: Map<string, ExporterHealthStatus> = new Map();
  private circuitBreaker: TelemetryCircuitBreaker;
  private config: TelemetryConfig | null = null;

  constructor() {
    this.circuitBreaker = new TelemetryCircuitBreaker({
      threshold: 5,
      timeoutMs: 60000,
    });
  }

  recordExporterSuccess(exporterType: string): void {
    const status = this.getExporterStatus(exporterType);
    status.successCount++;
    status.lastSuccess = Date.now();
    status.consecutiveFailures = 0;
    this.exporterHealth.set(exporterType, status);
  }

  recordExporterFailure(exporterType: string, error: Error): void {
    const status = this.getExporterStatus(exporterType);
    status.failureCount++;
    status.lastFailure = Date.now();
    status.lastError = error.message;
    status.consecutiveFailures++;
    this.exporterHealth.set(exporterType, status);
  }

  getOverallHealth(): {
    healthy: boolean;
    status: 'healthy' | 'degraded' | 'unhealthy';
    exporters: Record<string, ExporterHealthStatus>;
    circuitBreaker: {
      state: CircuitBreakerState;
      canExecute: boolean;
    };
  } {
    const exporters: Record<string, ExporterHealthStatus> = {};
    let healthyCount = 0;
    let totalCount = 0;

    for (const [type, status] of this.exporterHealth.entries()) {
      exporters[type] = status;
      totalCount++;
      if (status.consecutiveFailures < 3) {
        healthyCount++;
      }
    }

    const healthRatio = totalCount > 0 ? healthyCount / totalCount : 1;
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';

    if (healthRatio >= 0.8) {
      overallStatus = 'healthy';
    } else if (healthRatio >= 0.5) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'unhealthy';
    }

    return {
      healthy: overallStatus === 'healthy',
      status: overallStatus,
      exporters,
      circuitBreaker: {
        state: this.circuitBreaker.getState(),
        canExecute: this.circuitBreaker.canExecute(),
      },
    };
  }
}
```

### Circuit Breaker Implementation

```typescript
export class TelemetryCircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly threshold: number;
  private readonly timeoutMs: number;

  constructor(config: { threshold: number; timeoutMs: number }) {
    this.threshold = config.threshold;
    this.timeoutMs = config.timeoutMs;
  }

  canExecute(): boolean {
    if (this.state === CircuitBreakerState.CLOSED) {
      return true;
    }

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      return true; // Allow single test request
    }

    // OPEN state - check if timeout expired
    if (Date.now() - this.lastFailureTime > this.timeoutMs) {
      this.state = CircuitBreakerState.HALF_OPEN;
      return true;
    }

    return false;
  }

  recordSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitBreakerState.CLOSED;
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold) {
      this.state = CircuitBreakerState.OPEN;
    }
  }
}
```

## Implementation for Other Projects

### Step 1: Install Dependencies

```bash
# Core OpenTelemetry packages (exact versions from CapellaQL)
bun add @opentelemetry/api
bun add @opentelemetry/sdk-node
bun add @opentelemetry/auto-instrumentations-node

# OTLP Exporters (for fallback when not using custom Bun exporters)
bun add @opentelemetry/exporter-trace-otlp-http
bun add @opentelemetry/exporter-metrics-otlp-http
bun add @opentelemetry/exporter-logs-otlp-http

# Processors and readers
bun add @opentelemetry/sdk-trace-base
bun add @opentelemetry/sdk-logs
bun add @opentelemetry/sdk-metrics

# Additional instrumentations
bun add @opentelemetry/instrumentation-graphql  # If using GraphQL
bun add @opentelemetry/core                     # For utilities like hrTimeToMicroseconds

# Semantic conventions
bun add @opentelemetry/semantic-conventions

# Configuration validation
bun add zod
```

### Step 2: Copy the Unified Configuration System

Create a configuration module based on CapellaQL's actual implementation:

```typescript
// config/modules/telemetry.ts
import { z } from "zod";

// Environment variable mapping for telemetry section
export const telemetryEnvMapping = {
  ENABLE_OPENTELEMETRY: "ENABLE_OPENTELEMETRY",
  SERVICE_NAME: "SERVICE_NAME",
  SERVICE_VERSION: "SERVICE_VERSION",
  DEPLOYMENT_ENVIRONMENT: "DEPLOYMENT_ENVIRONMENT",
  TRACES_ENDPOINT: "TRACES_ENDPOINT",
  METRICS_ENDPOINT: "METRICS_ENDPOINT",
  LOGS_ENDPOINT: "LOGS_ENDPOINT",
  METRIC_READER_INTERVAL: "METRIC_READER_INTERVAL",
  EXPORT_TIMEOUT_MS: "EXPORT_TIMEOUT_MS",
  BATCH_SIZE: "BATCH_SIZE",
  MAX_QUEUE_SIZE: "MAX_QUEUE_SIZE",
  SAMPLING_RATE: "SAMPLING_RATE",
  CIRCUIT_BREAKER_THRESHOLD: "CIRCUIT_BREAKER_THRESHOLD",
  CIRCUIT_BREAKER_TIMEOUT_MS: "CIRCUIT_BREAKER_TIMEOUT_MS",
} as const;

// Telemetry configuration defaults (2025 compliance)
export const telemetryDefaults = {
  ENABLE_OPENTELEMETRY: true,
  SERVICE_NAME: "MyService",
  SERVICE_VERSION: "1.0.0",
  DEPLOYMENT_ENVIRONMENT: "development",
  TRACES_ENDPOINT: "http://localhost:4318/v1/traces",
  METRICS_ENDPOINT: "http://localhost:4318/v1/metrics",
  LOGS_ENDPOINT: "http://localhost:4318/v1/logs",
  METRIC_READER_INTERVAL: 60000,
  EXPORT_TIMEOUT_MS: 30000,
  BATCH_SIZE: 2048,
  MAX_QUEUE_SIZE: 10000,
  SAMPLING_RATE: 0.15,
  CIRCUIT_BREAKER_THRESHOLD: 5,
  CIRCUIT_BREAKER_TIMEOUT_MS: 60000,
};

// Zod schema for telemetry configuration
export const TelemetryConfigSchema = z.object({
  ENABLE_OPENTELEMETRY: z.coerce.boolean().default(true),
  SERVICE_NAME: z.string().min(1, "SERVICE_NAME is required and cannot be empty").default("MyService"),
  SERVICE_VERSION: z.string().min(1, "SERVICE_VERSION is required and cannot be empty").default("1.0.0"),
  DEPLOYMENT_ENVIRONMENT: z.enum(["development", "staging", "production", "test"]).default("development"),

  TRACES_ENDPOINT: z.string().url("TRACES_ENDPOINT must be a valid URL").default("http://localhost:4318/v1/traces"),
  METRICS_ENDPOINT: z.string().url("METRICS_ENDPOINT must be a valid URL").default("http://localhost:4318/v1/metrics"),
  LOGS_ENDPOINT: z.string().url("LOGS_ENDPOINT must be a valid URL").default("http://localhost:4318/v1/logs"),

  METRIC_READER_INTERVAL: z.coerce
    .number()
    .min(1000, "METRIC_READER_INTERVAL must be at least 1000ms")
    .max(300000, "METRIC_READER_INTERVAL should not exceed 5 minutes")
    .default(60000),

  EXPORT_TIMEOUT_MS: z.coerce
    .number()
    .min(5000, "EXPORT_TIMEOUT_MS must be at least 5 seconds")
    .max(30000, "EXPORT_TIMEOUT_MS must not exceed 30 seconds")
    .default(30000),

  BATCH_SIZE: z.coerce
    .number()
    .min(1, "BATCH_SIZE must be at least 1")
    .max(4096, "BATCH_SIZE should not exceed 4096")
    .default(2048),

  MAX_QUEUE_SIZE: z.coerce
    .number()
    .min(100, "MAX_QUEUE_SIZE must be at least 100")
    .max(20000, "MAX_QUEUE_SIZE should not exceed 20000")
    .default(10000),

  SAMPLING_RATE: z.coerce
    .number()
    .min(0.01, "SAMPLING_RATE must be at least 1%")
    .max(1.0, "SAMPLING_RATE cannot exceed 100%")
    .default(0.15),

  CIRCUIT_BREAKER_THRESHOLD: z.coerce
    .number()
    .min(1, "CIRCUIT_BREAKER_THRESHOLD must be at least 1")
    .max(20, "CIRCUIT_BREAKER_THRESHOLD should not exceed 20")
    .default(5),

  CIRCUIT_BREAKER_TIMEOUT_MS: z.coerce
    .number()
    .min(10000, "CIRCUIT_BREAKER_TIMEOUT_MS must be at least 10 seconds")
    .max(300000, "CIRCUIT_BREAKER_TIMEOUT_MS should not exceed 5 minutes")
    .default(60000),
});

type TelemetryConfig = z.infer<typeof TelemetryConfigSchema>;

// Load telemetry configuration from environment variables
function getEnvVar(name: string): string | undefined {
  return process.env[name];
}

function parseEnvVar(value: string | undefined, type: string, name: string): any {
  if (value === undefined) return undefined;

  switch (type) {
    case "boolean":
      return value.toLowerCase() === "true";
    case "number":
      const num = parseFloat(value);
      return isNaN(num) ? undefined : num;
    case "string":
      return value;
    default:
      return value;
  }
}

export function loadTelemetryConfig(): TelemetryConfig {
  const rawConfig = {
    ENABLE_OPENTELEMETRY: parseEnvVar(getEnvVar("ENABLE_OPENTELEMETRY"), "boolean", "ENABLE_OPENTELEMETRY") ?? telemetryDefaults.ENABLE_OPENTELEMETRY,
    SERVICE_NAME: parseEnvVar(getEnvVar("SERVICE_NAME"), "string", "SERVICE_NAME") || telemetryDefaults.SERVICE_NAME,
    SERVICE_VERSION: parseEnvVar(getEnvVar("SERVICE_VERSION"), "string", "SERVICE_VERSION") || telemetryDefaults.SERVICE_VERSION,
    DEPLOYMENT_ENVIRONMENT: parseEnvVar(getEnvVar("DEPLOYMENT_ENVIRONMENT"), "string", "DEPLOYMENT_ENVIRONMENT") || telemetryDefaults.DEPLOYMENT_ENVIRONMENT,
    TRACES_ENDPOINT: parseEnvVar(getEnvVar("TRACES_ENDPOINT"), "string", "TRACES_ENDPOINT") || telemetryDefaults.TRACES_ENDPOINT,
    METRICS_ENDPOINT: parseEnvVar(getEnvVar("METRICS_ENDPOINT"), "string", "METRICS_ENDPOINT") || telemetryDefaults.METRICS_ENDPOINT,
    LOGS_ENDPOINT: parseEnvVar(getEnvVar("LOGS_ENDPOINT"), "string", "LOGS_ENDPOINT") || telemetryDefaults.LOGS_ENDPOINT,
    METRIC_READER_INTERVAL: parseEnvVar(getEnvVar("METRIC_READER_INTERVAL"), "number", "METRIC_READER_INTERVAL") || telemetryDefaults.METRIC_READER_INTERVAL,
    EXPORT_TIMEOUT_MS: parseEnvVar(getEnvVar("EXPORT_TIMEOUT_MS"), "number", "EXPORT_TIMEOUT_MS") || telemetryDefaults.EXPORT_TIMEOUT_MS,
    BATCH_SIZE: parseEnvVar(getEnvVar("BATCH_SIZE"), "number", "BATCH_SIZE") || telemetryDefaults.BATCH_SIZE,
    MAX_QUEUE_SIZE: parseEnvVar(getEnvVar("MAX_QUEUE_SIZE"), "number", "MAX_QUEUE_SIZE") || telemetryDefaults.MAX_QUEUE_SIZE,
    SAMPLING_RATE: parseEnvVar(getEnvVar("SAMPLING_RATE"), "number", "SAMPLING_RATE") || telemetryDefaults.SAMPLING_RATE,
    CIRCUIT_BREAKER_THRESHOLD: parseEnvVar(getEnvVar("CIRCUIT_BREAKER_THRESHOLD"), "number", "CIRCUIT_BREAKER_THRESHOLD") || telemetryDefaults.CIRCUIT_BREAKER_THRESHOLD,
    CIRCUIT_BREAKER_TIMEOUT_MS: parseEnvVar(getEnvVar("CIRCUIT_BREAKER_TIMEOUT_MS"), "number", "CIRCUIT_BREAKER_TIMEOUT_MS") || telemetryDefaults.CIRCUIT_BREAKER_TIMEOUT_MS,
  };

  return TelemetryConfigSchema.parse(rawConfig);
}

export const telemetryConfig = loadTelemetryConfig();
export type { TelemetryConfig };
```

### Step 3: Copy SimpleSmartSampler Implementation

Copy the exact `SimpleSmartSampler` implementation from CapellaQL:

```typescript
// telemetry/sampling/SimpleSmartSampler.ts
import {
  type Attributes,
  type Context,
  type Link,
  type Sampler,
  SamplingDecision,
  type SamplingResult,
  type SpanKind,
} from "@opentelemetry/api";

// Simple 3-tier sampling configuration
export interface SimpleSmartSamplingConfig {
  // Core signal sampling rates (0.0 to 1.0)
  traces: number;   // Distributed tracing sampling rate
  metrics: number;  // Metrics collection sampling rate
  logs: number;     // Log entries sampling rate

  // Error preservation (always 1.0 for critical observability)
  preserveErrors: boolean;

  // Optional configuration
  costOptimizationMode: boolean; // Enable aggressive cost optimization
  healthCheckSampling: number;   // Special rate for health endpoints (typically lower)
}

// Sampling decision metadata
export interface SimpleSamplingDecision {
  shouldSample: boolean;
  signalType: 'trace' | 'metric' | 'log';
  samplingRate: number;
  reason: string;
  costSavings?: number; // Estimated percentage savings
}

// Default configuration optimized for cost-effectiveness
export const DEFAULT_SIMPLE_SAMPLING_CONFIG: SimpleSmartSamplingConfig = {
  traces: 0.15,    // 15% trace sampling - captures patterns while reducing costs
  metrics: 0.20,   // 20% metrics sampling - higher for performance monitoring
  logs: 0.25,      // 25% log sampling - balance between visibility and storage

  preserveErrors: true,        // Always preserve errors for debugging
  costOptimizationMode: true,  // Enable cost optimization by default
  healthCheckSampling: 0.05,   // 5% health check sampling - reduce noise
};

export class SimpleSmartSampler implements Sampler {
  private readonly config: SimpleSmartSamplingConfig;
  private samplingStats = {
    totalDecisions: 0,
    sampledCount: 0,
    errorPreservedCount: 0,
    costSavingsEstimate: 0,
  };

  constructor(config: SimpleSmartSamplingConfig = DEFAULT_SIMPLE_SAMPLING_CONFIG) {
    this.config = this.validateAndNormalizeConfig(config);
  }

  // OpenTelemetry Sampler interface - handles trace sampling
  shouldSample(
    _context: Context,
    _traceId: string,
    spanName: string,
    _spanKind: SpanKind,
    attributes: Attributes,
    _links: Link[]
  ): SamplingResult {
    const decision = this.shouldSampleTrace(spanName, attributes);
    this.updateStats(decision);

    return {
      decision: decision.shouldSample ? SamplingDecision.RECORD_AND_SAMPLED : SamplingDecision.NOT_RECORD,
      attributes: decision.shouldSample ? {
        "sampling.signal_type": decision.signalType,
        "sampling.rate": decision.samplingRate,
        "sampling.reason": decision.reason,
        "sampling.cost_optimized": this.config.costOptimizationMode,
      } : undefined,
    };
  }

  // Main sampling decision logic for traces
  shouldSampleTrace(spanName: string, attributes?: Attributes): SimpleSamplingDecision {
    // Check for errors first - always preserve
    if (this.config.preserveErrors && this.isErrorTrace(attributes)) {
      return {
        shouldSample: true,
        signalType: 'trace',
        samplingRate: 1.0,
        reason: 'error_preservation',
        costSavings: 0, // No savings for errors - they must be preserved
      };
    }

    // Special handling for health checks - reduce sampling
    if (this.isHealthCheckTrace(spanName, attributes)) {
      const shouldSample = Math.random() < this.config.healthCheckSampling;
      return {
        shouldSample,
        signalType: 'trace',
        samplingRate: this.config.healthCheckSampling,
        reason: 'health_check_sampling',
        costSavings: shouldSample ? 0 : this.calculateCostSavings(this.config.traces),
      };
    }

    // Standard trace sampling
    const shouldSample = Math.random() < this.config.traces;
    return {
      shouldSample,
      signalType: 'trace',
      samplingRate: this.config.traces,
      reason: 'standard_trace_sampling',
      costSavings: shouldSample ? 0 : this.calculateCostSavings(this.config.traces),
    };
  }

  // Metric sampling decision
  shouldSampleMetric(metricName: string, attributes?: Attributes): SimpleSamplingDecision {
    // Always preserve error-related metrics
    if (this.config.preserveErrors && this.isErrorMetric(metricName, attributes)) {
      return {
        shouldSample: true,
        signalType: 'metric',
        samplingRate: 1.0,
        reason: 'error_metric_preservation',
        costSavings: 0,
      };
    }

    // Standard metric sampling
    const shouldSample = Math.random() < this.config.metrics;
    return {
      shouldSample,
      signalType: 'metric',
      samplingRate: this.config.metrics,
      reason: 'standard_metric_sampling',
      costSavings: shouldSample ? 0 : this.calculateCostSavings(this.config.metrics),
    };
  }

  // Log sampling decision
  shouldSampleLog(level: string, message?: string, attributes?: Attributes): SimpleSamplingDecision {
    // Always preserve error logs
    if (this.config.preserveErrors && this.isErrorLog(level, message, attributes)) {
      return {
        shouldSample: true,
        signalType: 'log',
        samplingRate: 1.0,
        reason: 'error_log_preservation',
        costSavings: 0,
      };
    }

    // Standard log sampling
    const shouldSample = Math.random() < this.config.logs;
    return {
      shouldSample,
      signalType: 'log',
      samplingRate: this.config.logs,
      reason: 'standard_log_sampling',
      costSavings: shouldSample ? 0 : this.calculateCostSavings(this.config.logs),
    };
  }

  private validateAndNormalizeConfig(config: SimpleSmartSamplingConfig): SimpleSmartSamplingConfig {
    // Validate sampling rates
    const rates = ['traces', 'metrics', 'logs'] as const;
    rates.forEach(rate => {
      if (config[rate] < 0 || config[rate] > 1) {
        throw new Error(`${rate} sampling rate must be between 0 and 1, got: ${config[rate]}`);
      }
    });

    return {
      ...config,
      // Ensure error preservation is always true in cost optimization mode
      preserveErrors: config.costOptimizationMode ? true : config.preserveErrors,
    };
  }

  private isErrorTrace(attributes?: Attributes): boolean {
    if (!attributes) return false;

    // Check common error indicators in trace attributes
    const httpStatusCode = attributes['http.status_code'];
    const hasError = attributes.error === true;
    const errorMessage = attributes['error.message'];

    return hasError ||
           (httpStatusCode && Number(httpStatusCode) >= 400) ||
           (errorMessage !== undefined);
  }

  private isHealthCheckTrace(spanName: string, attributes?: Attributes): boolean {
    const healthIndicators = ['/health', 'health-check', 'healthz', 'liveness', 'readiness'];

    // Check span name
    if (healthIndicators.some(indicator => spanName.toLowerCase().includes(indicator))) {
      return true;
    }

    // Check HTTP attributes
    const httpRoute = attributes?.['http.route'] || attributes?.['http.target'];
    if (httpRoute && healthIndicators.some(indicator => String(httpRoute).toLowerCase().includes(indicator))) {
      return true;
    }

    return false;
  }

  private isErrorMetric(metricName: string, attributes?: Attributes): boolean {
    // Check metric name for error indicators
    const errorKeywords = ['error', 'exception', 'failure', 'fault', '4xx', '5xx', 'timeout'];
    if (errorKeywords.some(keyword => metricName.toLowerCase().includes(keyword))) {
      return true;
    }

    // Check attributes for error indicators
    if (attributes) {
      const statusCode = attributes['http.status_code'];
      if (statusCode && Number(statusCode) >= 400) {
        return true;
      }
    }

    return false;
  }

  private isErrorLog(level: string, message?: string, attributes?: Attributes): boolean {
    // Error level logs
    if (level.toLowerCase() === 'error') {
      return true;
    }

    // Check message for error indicators
    if (message) {
      const errorKeywords = ['error', 'exception', 'failed', 'failure', 'fatal', 'critical'];
      if (errorKeywords.some(keyword => message.toLowerCase().includes(keyword))) {
        return true;
      }
    }

    // Check attributes for error indicators
    if (attributes) {
      const hasError = attributes.error === true;
      const errorMessage = attributes['error.message'];
      if (hasError || errorMessage) {
        return true;
      }
    }

    return false;
  }

  private calculateCostSavings(samplingRate: number): number {
    // Calculate percentage savings from not sampling
    return (1 - samplingRate) * 100;
  }

  private updateStats(decision: SimpleSamplingDecision): void {
    this.samplingStats.totalDecisions++;

    if (decision.shouldSample) {
      this.samplingStats.sampledCount++;

      if (decision.reason.includes('error')) {
        this.samplingStats.errorPreservedCount++;
      }
    } else {
      // Accumulate cost savings
      this.samplingStats.costSavingsEstimate += (decision.costSavings || 0) / 100;
    }
  }
}

// Utility function to create a pre-configured cost-optimized sampler
export function createCostOptimizedSampler(customRates?: Partial<SimpleSmartSamplingConfig>): SimpleSmartSampler {
  const costOptimizedConfig: SimpleSmartSamplingConfig = {
    traces: 0.10,    // 10% - aggressive cost reduction for traces
    metrics: 0.15,   // 15% - moderate reduction for metrics
    logs: 0.20,      // 20% - conservative reduction for logs

    preserveErrors: true,        // Never compromise on error visibility
    costOptimizationMode: true,
    healthCheckSampling: 0.02,   // 2% - minimal health check noise

    ...customRates, // Allow customization
  };

  return new SimpleSmartSampler(costOptimizedConfig);
}
```

### Step 4: Create Export Stats Tracker (Optional but Recommended)

Create an export stats tracker to monitor exporter health:

```typescript
// telemetry/export-stats-tracker.ts
export interface ExportStats {
  totalExports: number;
  successCount: number;
  failureCount: number;
  lastExportTime: number | null;
  lastSuccessTime: number | null;
  lastFailureTime: number | null;
  recentErrors: string[];
}

export function createExportStatsTracker() {
  const stats: ExportStats = {
    totalExports: 0,
    successCount: 0,
    failureCount: 0,
    lastExportTime: null,
    lastSuccessTime: null,
    lastFailureTime: null,
    recentErrors: [],
  };

  return {
    recordExportAttempt() { stats.totalExports++; stats.lastExportTime = Date.now(); },
    recordExportSuccess() { stats.successCount++; stats.lastSuccessTime = Date.now(); },
    recordExportFailure(error?: Error) {
      stats.failureCount++;
      stats.lastFailureTime = Date.now();
      if (error) {
        stats.recentErrors.push(`${new Date().toISOString()}: ${error.message}`);
        if (stats.recentErrors.length > 10) stats.recentErrors.shift();
      }
    },
    getStats() { return { ...stats }; },
  };
}

// Wrapper function for span exporters
export function wrapSpanExporter(exporter: any, tracker: ReturnType<typeof createExportStatsTracker>) {
  return {
    export(spans: any, resultCallback: any) {
      tracker.recordExportAttempt();
      exporter.export(spans, (result: any) => {
        result.code === 0 ? tracker.recordExportSuccess() : tracker.recordExportFailure(result.error);
        resultCallback(result);
      });
    },
    shutdown: () => exporter.shutdown(),
    forceFlush: () => exporter.forceFlush?.() ?? Promise.resolve(),
  };
}
```

### Step 5: Create Complete Instrumentation Setup

Create the instrumentation file using standard OTLP exporters:

```typescript
// telemetry/instrumentation.ts
import os from "node:os";
import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_TELEMETRY_SDK_LANGUAGE,
  ATTR_TELEMETRY_SDK_NAME,
  ATTR_TELEMETRY_SDK_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
  SEMRESATTRS_SERVICE_INSTANCE_ID,
  SEMRESATTRS_SERVICE_NAMESPACE,
} from "@opentelemetry/semantic-conventions";

import { telemetryConfig } from "./config/modules/telemetry";
import { createExportStatsTracker, wrapSpanExporter, wrapMetricExporter, wrapLogRecordExporter } from "./export-stats-tracker";

let sdk: NodeSDK | undefined;
let loggerProvider: LoggerProvider | undefined;
let isInitialized = false;
const config = telemetryConfig;

// Export stats trackers for observability
const traceExportStats = createExportStatsTracker();
const metricExportStats = createExportStatsTracker();
const logExportStats = createExportStatsTracker();

export async function initializeTelemetry(): Promise<void> {
  if (isInitialized) {
    console.warn("OpenTelemetry already initialized, skipping");
    return;
  }

  try {
    if (!config.ENABLE_OPENTELEMETRY) {
      console.log("OpenTelemetry is disabled");
      return;
    }

    // Set up diagnostic logging
    diag.setLogger(
      new DiagConsoleLogger(),
      config.DEPLOYMENT_ENVIRONMENT === "development" ? DiagLogLevel.INFO : DiagLogLevel.WARN
    );

    // Create synchronous resource
    const resource = createResource(config);

    // Create standard OTLP exporters with stats tracking
    const baseTraceExporter = new OTLPTraceExporter({
      url: config.TRACES_ENDPOINT,
      timeoutMillis: config.EXPORT_TIMEOUT_MS,
    });
    const trackingTraceExporter = wrapSpanExporter(baseTraceExporter, traceExportStats);

    const baseMetricExporter = new OTLPMetricExporter({
      url: config.METRICS_ENDPOINT,
      timeoutMillis: config.EXPORT_TIMEOUT_MS,
    });
    const trackingMetricExporter = wrapMetricExporter(baseMetricExporter, metricExportStats);

    const baseLogExporter = new OTLPLogExporter({
      url: config.LOGS_ENDPOINT,
      timeoutMillis: config.EXPORT_TIMEOUT_MS,
    });
    const trackingLogExporter = wrapLogRecordExporter(baseLogExporter, logExportStats);

    // Create processors
    const traceProcessor = new BatchSpanProcessor(trackingTraceExporter, {
      maxExportBatchSize: 10,
      scheduledDelayMillis: 1000,
    });

    const metricReader = new PeriodicExportingMetricReader({
      exporter: trackingMetricExporter,
      exportIntervalMillis: config.METRIC_READER_INTERVAL,
    });

    const logProcessor = new BatchLogRecordProcessor(trackingLogExporter);

    // Create and register LoggerProvider globally (SDK 0.212.0+ requirement)
    loggerProvider = new LoggerProvider({
      resource,
      processors: [logProcessor],
    });
    logs.setGlobalLoggerProvider(loggerProvider);

    // Create W3C propagator
    const propagator = new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    });

    // Initialize NodeSDK
    sdk = new NodeSDK({
      resource,
      autoDetectResources: false,
      textMapPropagator: propagator,
      spanProcessors: [traceProcessor],
      metricReaders: [metricReader],
      instrumentations: [
        getNodeAutoInstrumentations({
          "@opentelemetry/instrumentation-runtime-node": { enabled: false },
          "@opentelemetry/instrumentation-http": {
            enabled: true,
            ignoreIncomingRequestHook: (req) => req.url?.includes("/health") || false,
          },
        }),
      ],
    });

    sdk.start();
    isInitialized = true;
    console.log("OpenTelemetry initialized successfully");

    setupGracefulShutdown();
  } catch (err) {
    console.error("Failed to initialize OpenTelemetry SDK:", err);
    throw err;
  }
}

function createResource(config: typeof telemetryConfig) {
  return resourceFromAttributes({
    [ATTR_SERVICE_NAME]: config.SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: config.SERVICE_VERSION,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: config.DEPLOYMENT_ENVIRONMENT,
    [SEMRESATTRS_SERVICE_NAMESPACE]: config.SERVICE_NAMESPACE,
    [SEMRESATTRS_SERVICE_INSTANCE_ID]: os.hostname(),
    [ATTR_TELEMETRY_SDK_NAME]: "opentelemetry",
    [ATTR_TELEMETRY_SDK_LANGUAGE]: "nodejs",
    [ATTR_TELEMETRY_SDK_VERSION]: "2.0.1",
    "runtime.name": typeof Bun !== "undefined" ? "bun" : "node",
    "runtime.version": typeof Bun !== "undefined" ? Bun.version : process.version,
    "process.pid": process.pid,
    "host.name": os.hostname(),
    "host.arch": os.arch(),
  });
}

function setupGracefulShutdown(): void {
  const gracefulShutdown = async (signal: string) => {
    console.debug(`Received ${signal}, shutting down...`);
    await shutdownTelemetry();
    process.exit(0);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

export async function shutdownTelemetry(): Promise<void> {
  if (loggerProvider) {
    await loggerProvider.shutdown();
    loggerProvider = undefined;
  }
  if (sdk) {
    await sdk.shutdown();
    sdk = undefined;
    isInitialized = false;
  }
}

export function getTelemetryStatus() {
  return {
    initialized: isInitialized,
    exportStats: {
      traces: traceExportStats.getStats(),
      metrics: metricExportStats.getStats(),
      logs: logExportStats.getStats(),
    },
  };
}
```

### Step 6: Application Integration

```typescript
// app.ts or main.ts
import './telemetry/instrumentation'; // Import FIRST, before anything else

// Your application code here...
import express from 'express';

const app = express();

// Your routes and middleware
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

### Step 7: Environment Configuration

```bash
# .env file
ENABLE_OPENTELEMETRY=true
SERVICE_NAME="MyService"
SERVICE_VERSION="1.0.0"
DEPLOYMENT_ENVIRONMENT="production"

# OTLP Collector endpoints
TRACES_ENDPOINT="http://localhost:4318/v1/traces"
METRICS_ENDPOINT="http://localhost:4318/v1/metrics"
LOGS_ENDPOINT="http://localhost:4318/v1/logs"

# Performance settings
EXPORT_TIMEOUT_MS=30000
BATCH_SIZE=2048
MAX_QUEUE_SIZE=10000
METRIC_READER_INTERVAL=60000

# Sampling configuration
SAMPLING_RATE=0.15

# Circuit breaker settings
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_TIMEOUT_MS=60000
```
  const spanProcessor = new BatchSpanProcessor(traceExporter, {
    maxExportBatchSize: telemetryConfig.BATCH_SIZE,
    maxQueueSize: telemetryConfig.MAX_QUEUE_SIZE,
    scheduledDelayMillis: 5000,
    exportTimeoutMillis: telemetryConfig.EXPORT_TIMEOUT_MS,
  });

  const logProcessor = new BatchLogRecordProcessor(logExporter, {
    maxExportBatchSize: Math.min(telemetryConfig.BATCH_SIZE, 512),
    maxQueueSize: telemetryConfig.MAX_QUEUE_SIZE,
    scheduledDelayMillis: 5000,
    exportTimeoutMillis: telemetryConfig.EXPORT_TIMEOUT_MS,
  });

  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 60000, // 1 minute
    exportTimeoutMillis: telemetryConfig.EXPORT_TIMEOUT_MS,
  });

  // Create sampler
  const sampler = new SimpleSmartSampler({
    traces: telemetryConfig.TRACES_SAMPLING_RATE,
    metrics: telemetryConfig.METRICS_SAMPLING_RATE,
    logs: telemetryConfig.LOGS_SAMPLING_RATE,
    preserveErrors: true,
    costOptimizationMode: telemetryConfig.COST_OPTIMIZATION_MODE,
    healthCheckSampling: telemetryConfig.HEALTH_CHECK_SAMPLING_RATE,
  });

  // Initialize SDK
  sdk = new NodeSDK({
    resource,
    sampler,
    spanProcessors: [spanProcessor],
    logRecordProcessors: [logProcessor],
    metricReader,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) => {
            return req.url?.includes('/health') || false;
          },
        },
      }),
    ],
  });

  await sdk.start();
  console.log('OpenTelemetry initialized successfully');

  // Setup graceful shutdown
  process.on('SIGTERM', async () => {
    await shutdownTelemetry();
  });
}

export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    console.log('OpenTelemetry shut down successfully');
  }
}

// Initialize on module load
initializeTelemetry().catch(console.error);
```

### Step 5: Basic Metrics Collection

```typescript
// telemetry/metrics.ts
import { metrics } from '@opentelemetry/api';

let isInitialized = false;
let httpRequestCounter: any;
let httpResponseTimeHistogram: any;

export function initializeMetrics(): void {
  if (isInitialized) return;

  const meter = metrics.getMeter('my-service-metrics', '1.0.0');

  httpRequestCounter = meter.createCounter('http_requests_total', {
    description: 'Total number of HTTP requests',
    unit: '1',
  });

  httpResponseTimeHistogram = meter.createHistogram('http_response_time_seconds', {
    description: 'HTTP request response time in seconds',
    unit: 's',
  });

  isInitialized = true;
}

export function recordHttpRequest(method: string, route: string, statusCode?: number): void {
  if (!isInitialized) return;

  httpRequestCounter.add(1, {
    method: method.toUpperCase(),
    route,
    ...(statusCode && { status_code: statusCode.toString() }),
  });
}

export function recordHttpResponseTime(durationMs: number, method: string, route: string): void {
  if (!isInitialized) return;

  const durationSeconds = durationMs / 1000;
  httpResponseTimeHistogram.record(durationSeconds, {
    method: method.toUpperCase(),
    route,
  });
}

// Initialize metrics
initializeMetrics();
```

### Step 6: Application Integration

```typescript
// app.ts or main.ts
import './telemetry/instrumentation'; // Import first
import express from 'express';
import { recordHttpRequest, recordHttpResponseTime } from './telemetry/metrics';

const app = express();

// Middleware for metrics
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    recordHttpRequest(req.method, req.route?.path || req.path, res.statusCode);
    recordHttpResponseTime(duration, req.method, req.route?.path || req.path);
  });

  next();
});

// Your application routes
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

### Step 7: Environment Configuration

```bash
# .env file
ENABLE_OPENTELEMETRY=true
SERVICE_NAME="MyService"
SERVICE_VERSION="1.0.0"
NODE_ENV="development"

# OTLP Collector endpoints
TRACES_ENDPOINT="http://localhost:4318/v1/traces"
METRICS_ENDPOINT="http://localhost:4318/v1/metrics"
LOGS_ENDPOINT="http://localhost:4318/v1/logs"

# Cost-optimized sampling rates
TRACES_SAMPLING_RATE=0.15
METRICS_SAMPLING_RATE=0.25
LOGS_SAMPLING_RATE=0.30

# Cost optimization settings
COST_OPTIMIZATION_MODE=true
HEALTH_CHECK_SAMPLING_RATE=0.05

# Performance settings
EXPORT_TIMEOUT_MS=30000
BATCH_SIZE=2048
MAX_QUEUE_SIZE=10000
```

## Best Practices

### 1. Production Deployment

- **Use environment-specific sampling rates**: Lower rates in production, higher in development
- **Monitor telemetry costs**: Track data volume and adjust sampling rates accordingly
- **Always preserve errors**: Never sample out error traces, metrics, or logs
- **Health check optimization**: Use very low sampling rates for health endpoints

### 2. Configuration Management

- **Validate configuration**: Use schema validation (Zod) to catch configuration errors early
- **Centralize configuration**: Use unified configuration systems instead of scattered config files
- **Environment variable mapping**: Provide clear mapping between config properties and env vars
- **Graceful degradation**: Handle missing or invalid configuration gracefully

### 3. Error Handling

- **Circuit breaker patterns**: Implement circuit breakers for export operations
- **Retry logic**: Use exponential backoff with jitter for failed exports
- **Timeout management**: Set appropriate timeouts for all export operations
- **Graceful shutdown**: Always shut down telemetry systems cleanly

### 4. Performance Optimization

- **Batch processing**: Use appropriate batch sizes (2048 for 2025 standards)
- **Async operations**: Never block application threads with telemetry operations
- **Memory management**: Monitor queue sizes and implement backpressure
- **DNS optimization**: Use DNS caching for repeated exporter connections

### 5. Cost Management

- **3-tier sampling**: Use different rates for traces (expensive), metrics (moderate), logs (cheap)
- **Health check filtering**: Dramatically reduce sampling for health endpoints
- **Error preservation**: Always capture errors regardless of sampling settings
- **Regular review**: Monitor telemetry costs and adjust sampling rates as needed

### 6. Observability Quality

- **Correlation IDs**: Include trace IDs in metrics and logs for correlation
- **Semantic conventions**: Follow OpenTelemetry semantic conventions for attributes
- **Structured logging**: Use structured formats for log entries
- **SLI/SLO metrics**: Track business-critical metrics with appropriate sampling

### 7. Development Experience

- **Debug modes**: Provide debug flags for detailed telemetry information
- **Health endpoints**: Expose telemetry health status via HTTP endpoints
- **Documentation**: Maintain clear documentation for configuration and usage
- **Testing**: Test telemetry setup with sample data and verify export success

This implementation provides a production-ready OpenTelemetry setup that balances comprehensive observability with cost optimization, making it suitable for high-scale production deployments while maintaining the ability to preserve critical error information and business metrics.