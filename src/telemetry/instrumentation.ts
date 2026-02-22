/* src/telemetry/instrumentation.ts */

import os from "node:os";
import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { GraphQLInstrumentation } from "@opentelemetry/instrumentation-graphql";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
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
import { type TelemetryConfig, telemetryConfig } from "$config";
import { BunPerf } from "$utils/bunUtils";
import { BunLogExporter } from "./exporters/BunLogExporter";
import { BunMetricExporter } from "./exporters/BunMetricExporter";
import { BunMetricReader } from "./exporters/BunMetricReader";
import { BunSpanProcessor } from "./exporters/BunSpanProcessor";
// Bun-optimized exporters for better timeout handling
import { BunTraceExporter } from "./exporters/BunTraceExporter";
import { telemetryHealthMonitor } from "./health/telemetryHealth";
import { log, telemetryLogger, warn } from "./logger";
import { DEFAULT_SIMPLE_SAMPLING_CONFIG, SimpleSmartSampler, type SimpleSmartSamplingConfig } from "./sampling/SimpleSmartSampler";

let sdk: NodeSDK | undefined;
let isInitialized = false;
let config: TelemetryConfig;
let simpleSmartSampler: SimpleSmartSampler | undefined;

export async function initializeTelemetry(): Promise<void> {
  if (isInitialized) {
    warn("OpenTelemetry already initialized, skipping");
    return;
  }

  try {
    // Load and validate configuration from unified config system
    config = telemetryConfig;

    if (!config.ENABLE_OPENTELEMETRY) {
      if (process.env.DEBUG_OTEL_EXPORTERS === "true") {
        console.debug("OpenTelemetry instrumentation is disabled");
      }
      return;
    }

    if (process.env.DEBUG_OTEL_EXPORTERS === "true") {
      console.debug("Initializing 2025-compliant OpenTelemetry SDK...", {
        serviceName: config.SERVICE_NAME,
        serviceVersion: config.SERVICE_VERSION,
        environment: config.DEPLOYMENT_ENVIRONMENT,
        samplingRate: config.SAMPLING_RATE,
        exportTimeout: config.EXPORT_TIMEOUT_MS,
      });
    }

    // Set up diagnostic logging
    diag.setLogger(
      new DiagConsoleLogger(),
      config.DEPLOYMENT_ENVIRONMENT === "development" ? DiagLogLevel.INFO : DiagLogLevel.WARN
    );

    // Initialize health monitor with config
    telemetryHealthMonitor.setConfig(config);

    // Create resource with all 2025-compliant semantic conventions (synchronous)
    const resource = createResource(config);

    // Create 2025-compliant exporters - use Bun-optimized exporters when running under Bun
    const traceExporter = createTraceExporter(config);
    const metricExporter = createMetricExporter(config);
    const logExporter = createLogExporter(config);

    // Create span processor - use custom Bun processor when running under Bun
    let spanProcessor;
    if (typeof Bun !== "undefined") {
      if (process.env.DEBUG_OTEL_EXPORTERS === "true") {
        console.debug("Using Bun-optimized span processor (bypasses BatchSpanProcessor)");
      }
      spanProcessor = new BunSpanProcessor({
        url: config.TRACES_ENDPOINT,
        maxBatchSize: config.BATCH_SIZE,
        scheduledDelayMillis: 5000,
        maxQueueSize: config.MAX_QUEUE_SIZE,
        timeoutMillis: 10000,
        retryConfig: {
          maxRetries: 3,
          initialDelayMs: 1000,
          maxDelayMs: 10000,
          backoffMultiplier: 2,
        },
      });
    } else {
      spanProcessor = new BatchSpanProcessor(traceExporter, {
        maxExportBatchSize: config.BATCH_SIZE, // 2048 (2025 standard)
        maxQueueSize: config.MAX_QUEUE_SIZE, // 10,000 (2025 standard)
        scheduledDelayMillis: 5000, // 5 seconds
        exportTimeoutMillis: config.EXPORT_TIMEOUT_MS, // 30 seconds (2025 standard)
      });
    }

    // Create log processor with 2025 batch settings
    const logProcessor = new BatchLogRecordProcessor(logExporter, {
      maxExportBatchSize: Math.min(config.BATCH_SIZE, 512), // Logs can be smaller batches
      maxQueueSize: config.MAX_QUEUE_SIZE,
      scheduledDelayMillis: 5000,
      exportTimeoutMillis: config.EXPORT_TIMEOUT_MS,
    });

    // Create metric reader - use custom Bun reader when running under Bun
    let metricReader;
    if (typeof Bun !== "undefined") {
      if (process.env.DEBUG_OTEL_EXPORTERS === "true") {
        console.debug("Using Bun-optimized metric reader (bypasses PeriodicExportingMetricReader)");
      }
      metricReader = new BunMetricReader({
        url: config.METRICS_ENDPOINT,
        exportIntervalMillis: config.METRIC_READER_INTERVAL,
        timeoutMillis: 10000,
        retryConfig: {
          maxRetries: 3,
          initialDelayMs: 1000,
          maxDelayMs: 10000,
          backoffMultiplier: 2,
        },
      });
    } else {
      metricReader = new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: config.METRIC_READER_INTERVAL,
        exportTimeoutMillis: config.EXPORT_TIMEOUT_MS,
      });
    }

    // Create simple 3-tier sampling strategy (streamlined approach)
    const simpleSamplingConfig: SimpleSmartSamplingConfig = {
      // Use new simplified rates or fall back to derived values for backward compatibility
      traces: config.TRACES_SAMPLING_RATE || config.SAMPLING_RATE,
      metrics: config.METRICS_SAMPLING_RATE || 
               ((config.METRIC_SAMPLING_BUSINESS + config.METRIC_SAMPLING_TECHNICAL + 
                 config.METRIC_SAMPLING_INFRASTRUCTURE + config.METRIC_SAMPLING_DEBUG) / 4),
      logs: config.LOGS_SAMPLING_RATE || 
            ((config.LOG_SAMPLING_DEBUG + config.LOG_SAMPLING_INFO + 
              config.LOG_SAMPLING_WARN + config.LOG_SAMPLING_ERROR) / 4),
      
      preserveErrors: true,        // Always preserve errors
      costOptimizationMode: config.COST_OPTIMIZATION_MODE !== undefined ? config.COST_OPTIMIZATION_MODE : config.DEPLOYMENT_ENVIRONMENT === 'production',
      healthCheckSampling: config.HEALTH_CHECK_SAMPLING_RATE || 0.05,
    };

    const sampler = new SimpleSmartSampler(simpleSamplingConfig);
    simpleSmartSampler = sampler;

    // Create propagator with W3C standards
    const propagator = new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    });

    // Initialize NodeSDK with 2025-compliant configuration
    sdk = new NodeSDK({
      resource,
      autoDetectResources: false, // Disable async resource detection to eliminate warnings
      sampler,
      textMapPropagator: propagator,
      spanProcessors: [spanProcessor],
      logRecordProcessors: [logProcessor],
      metricReader,
      instrumentations: [
        // Auto-instrumentations with optimized settings
        getNodeAutoInstrumentations({
          "@opentelemetry/instrumentation-aws-lambda": { enabled: false },
          "@opentelemetry/instrumentation-aws-sdk": { enabled: false },
          "@opentelemetry/instrumentation-fs": { enabled: false },
          "@opentelemetry/instrumentation-winston": { enabled: false }, // We use our own
          "@opentelemetry/instrumentation-runtime-node": { enabled: false }, // Not compatible with Bun
          "@opentelemetry/instrumentation-http": {
            enabled: true,
            ignoreIncomingRequestHook: (req) => {
              // Reduce noise from health checks
              return req.url?.includes("/health") || false;
            },
          },
        }),
        // GraphQL instrumentation with proper settings
        new GraphQLInstrumentation({
          allowValues: true,
          depth: -1, // Capture full query depth
          mergeItems: true, // Merge similar operations
        }),
      ],
    });

    // Start the SDK
    await sdk.start();

    // Initialize logger after SDK is started
    telemetryLogger.initialize();

    isInitialized = true;

    if (process.env.DEBUG_OTEL_EXPORTERS === "true") {
      console.debug("OpenTelemetry SDK initialized successfully", {
        tracesEndpoint: config.TRACES_ENDPOINT,
        metricsEndpoint: config.METRICS_ENDPOINT,
        logsEndpoint: config.LOGS_ENDPOINT,
        samplingRate: `${config.SAMPLING_RATE * 100}%`,
        batchSize: config.BATCH_SIZE,
        exportTimeoutMs: config.EXPORT_TIMEOUT_MS,
      });
    }

    // Set up graceful shutdown
    setupGracefulShutdown();
  } catch (err) {
    console.error("Failed to initialize OpenTelemetry SDK:", err);
    throw err; // Re-throw to fail fast
  }
}

function createResource(config: TelemetryConfig) {
  // Create fully synchronous resource to avoid "async attributes settled" warnings
  const attributes = {
    // Service identification (2025 standards)
    [ATTR_SERVICE_NAME]: config.SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: config.SERVICE_VERSION,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: config.DEPLOYMENT_ENVIRONMENT,
    [SEMRESATTRS_SERVICE_NAMESPACE]: "capella-graphql-api", // 2025 standard
    [SEMRESATTRS_SERVICE_INSTANCE_ID]: config.runtime?.HOSTNAME || config.runtime?.INSTANCE_ID || os.hostname(),

    // OpenTelemetry SDK identification (2025 standards)
    [ATTR_TELEMETRY_SDK_NAME]: "opentelemetry",
    [ATTR_TELEMETRY_SDK_LANGUAGE]: "nodejs",
    [ATTR_TELEMETRY_SDK_VERSION]: "2.0.1",

    // Runtime information (manual, synchronous)
    "runtime.name": "bun",
    "runtime.version": typeof Bun !== "undefined" ? Bun.version : process.version,

    // Process information (replaces processDetector)
    "process.pid": process.pid,
    "process.executable.name": typeof Bun !== "undefined" ? "bun" : "node",
    "process.executable.path": process.execPath,
    "process.command": process.argv[1] || "unknown",
    "process.runtime.name": typeof Bun !== "undefined" ? "bun" : "nodejs",
    "process.runtime.version": typeof Bun !== "undefined" ? Bun.version : process.version,

    // Host information (replaces hostDetector)
    "host.name": os.hostname(),
    "host.arch": os.arch(),
    "host.type": os.type(),
    "host.cpu.family": os.cpus()[0]?.model || "unknown",

    // Container information if available through unified config (synchronous)
    ...(config.runtime?.CONTAINER_ID && { "container.id": config.runtime.CONTAINER_ID }),
    ...(config.runtime?.K8S_POD_NAME && { "k8s.pod.name": config.runtime.K8S_POD_NAME }),
    ...(config.runtime?.K8S_NAMESPACE && { "k8s.namespace.name": config.runtime.K8S_NAMESPACE }),
  };

  // Use direct resource creation to ensure all attributes are immediately available
  return resourceFromAttributes(attributes);
}

function createTraceExporter(config: TelemetryConfig): OTLPTraceExporter | BunTraceExporter {
  // Use Bun-optimized exporter when running under Bun to eliminate timeout issues
  if (typeof Bun !== "undefined") {
    if (process.env.DEBUG_OTEL_EXPORTERS === "true") {
      console.debug("Using Bun-optimized trace exporter");
    }
    return new BunTraceExporter({
      url: config.TRACES_ENDPOINT,
      timeoutMillis: 10000, // Reduced timeout for faster failure detection
      concurrencyLimit: 10,
      retryConfig: {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
      },
    });
  }

  // Fallback to standard exporter for Node.js compatibility
  return new OTLPTraceExporter({
    url: config.TRACES_ENDPOINT,
    headers: {
      "Content-Type": "application/json", // JSON over HTTP for collector on port 4318
      // Gzip compression can cause timeout with some collectors
    },
    timeoutMillis: config.EXPORT_TIMEOUT_MS, // 30 seconds (2025 standard)
    concurrencyLimit: 10, // Reasonable concurrency
    keepAlive: true,
  });
}

function createMetricExporter(config: TelemetryConfig): OTLPMetricExporter | BunMetricExporter {
  // Use Bun-optimized exporter when running under Bun to eliminate timeout issues
  if (typeof Bun !== "undefined") {
    if (process.env.DEBUG_OTEL_EXPORTERS === "true") {
      console.debug("Using Bun-optimized metric exporter");
    }
    return new BunMetricExporter({
      url: config.METRICS_ENDPOINT,
      timeoutMillis: 10000, // Reduced timeout for faster failure detection
      concurrencyLimit: 10,
      retryConfig: {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
      },
    });
  }

  // Fallback to standard exporter for Node.js compatibility
  return new OTLPMetricExporter({
    url: config.METRICS_ENDPOINT,
    headers: {
      "Content-Type": "application/json", // JSON over HTTP for collector on port 4318
      // Gzip compression can cause timeout with some collectors
    },
    timeoutMillis: config.EXPORT_TIMEOUT_MS, // 30 seconds (2025 standard)
    concurrencyLimit: 10,
    keepAlive: true,
  });
}

function createLogExporter(config: TelemetryConfig): OTLPLogExporter | BunLogExporter {
  // Use Bun-optimized exporter when running under Bun to eliminate timeout issues
  if (typeof Bun !== "undefined") {
    if (process.env.DEBUG_OTEL_EXPORTERS === "true") {
      console.debug("Using Bun-optimized log exporter with circuit breaker");
    }
    return new BunLogExporter({
      url: config.LOGS_ENDPOINT,
      timeoutMillis: 10000, // Reduced timeout for faster failure detection
      concurrencyLimit: 10,
      retryConfig: {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
      },
    });
  }

  // Fallback to standard exporter for Node.js compatibility
  return new OTLPLogExporter({
    url: config.LOGS_ENDPOINT,
    headers: {
      "Content-Type": "application/json", // JSON over HTTP for collector on port 4318
      // Gzip compression can cause timeout with some collectors
    },
    timeoutMillis: config.EXPORT_TIMEOUT_MS, // 30 seconds (2025 standard)
    concurrencyLimit: 10,
    keepAlive: true,
  });
}

function setupGracefulShutdown(): void {
  const gracefulShutdown = async (signal: string) => {
    if (process.env.DEBUG_OTEL_EXPORTERS === "true") {
      console.debug(`Received ${signal}, shutting down OpenTelemetry SDK gracefully...`);
    }

    try {
      await shutdownTelemetry();
      if (process.env.DEBUG_OTEL_EXPORTERS === "true") {
        console.debug("OpenTelemetry SDK shut down successfully");
      }
    } catch (err) {
      console.error("Error during OpenTelemetry SDK shutdown:", err);
    }
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGQUIT", () => gracefulShutdown("SIGQUIT"));
}

export async function shutdownTelemetry(): Promise<void> {
  if (!sdk || !isInitialized) {
    return;
  }

  try {
    await sdk.shutdown();
    sdk = undefined;
    isInitialized = false;
    if (process.env.DEBUG_OTEL_EXPORTERS === "true") {
      console.debug("OpenTelemetry SDK shutdown completed");
    }
  } catch (err) {
    console.error("Error shutting down OpenTelemetry SDK:", err);
    throw err;
  }
}

export function getTelemetrySDK(): NodeSDK | undefined {
  return sdk;
}

export function isTelemetryInitialized(): boolean {
  return isInitialized;
}

export function getSimpleSmartSampler(): SimpleSmartSampler | undefined {
  return simpleSmartSampler;
}

// Backward compatibility
export function getUnifiedSamplingCoordinator(): SimpleSmartSampler | undefined {
  console.warn('getUnifiedSamplingCoordinator() is deprecated - use getSimpleSmartSampler() instead');
  return simpleSmartSampler;
}

// Performance monitoring utilities with Bun integration
export async function measureDatabaseOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  queryType: string = "unknown"
): Promise<T> {
  const { result, duration } = await BunPerf.measure(operation, `DB:${operationName}`);

  // Record custom metrics
  if (isInitialized) {
    try {
      // Log performance metrics
      log(`Database operation completed`, {
        operation: operationName,
        queryType,
        duration,
        status: "success",
      });
    } catch (err) {
      warn("Failed to record database operation metrics", { error: err });
    }
  }

  return result;
}

export async function measureGraphQLResolver<T>(
  operation: () => Promise<T>,
  resolverName: string,
  fieldName: string
): Promise<T> {
  const { result, duration } = await BunPerf.measure(operation, `GraphQL:${resolverName}.${fieldName}`);

  // Record resolver performance
  if (isInitialized) {
    try {
      log(`GraphQL resolver completed`, {
        resolver: resolverName,
        field: fieldName,
        duration,
        status: "success",
      });
    } catch (err) {
      warn("Failed to record GraphQL resolver metrics", { error: err });
    }
  }

  return result;
}

export function createPerformanceTimer(label: string) {
  return BunPerf.createTimer(label);
}

// Initialize telemetry on module load
if (typeof Bun !== "undefined" || process.env.NODE_ENV !== "test") {
  initializeTelemetry().catch((err) => {
    console.error("Critical: Failed to initialize OpenTelemetry:", err);
    // In production, we might want to exit here
    if (config?.DEPLOYMENT_ENVIRONMENT === "production") {
      process.exit(1);
    }
  });
}
