/* src/telemetry/instrumentation.ts */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { GraphQLInstrumentation } from "@opentelemetry/instrumentation-graphql";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { 
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_TELEMETRY_SDK_NAME,
  ATTR_TELEMETRY_SDK_LANGUAGE,
  ATTR_TELEMETRY_SDK_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
  SEMRESATTRS_SERVICE_NAMESPACE,
  SEMRESATTRS_SERVICE_INSTANCE_ID
} from "@opentelemetry/semantic-conventions";
import { 
  CompositePropagator, 
  W3CTraceContextPropagator, 
  W3CBaggagePropagator 
} from "@opentelemetry/core";
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";

import { SmartSampler } from "./sampling/SmartSampler";
import { telemetryHealthMonitor } from "./health/telemetryHealth";
import { telemetryLogger, log, warn, error } from "./logger";
import { type TelemetryConfig, loadTelemetryConfigFromEnv } from "./config";

let sdk: NodeSDK | undefined;
let isInitialized = false;
let config: TelemetryConfig;

export async function initializeTelemetry(): Promise<void> {
  if (isInitialized) {
    warn("OpenTelemetry already initialized, skipping");
    return;
  }

  try {
    // Load and validate configuration (fail fast if invalid)
    config = loadTelemetryConfigFromEnv();
    
    if (!config.ENABLE_OPENTELEMETRY) {
      console.log("OpenTelemetry instrumentation is disabled");
      return;
    }

    console.log("Initializing 2025-compliant OpenTelemetry SDK...", {
      serviceName: config.SERVICE_NAME,
      serviceVersion: config.SERVICE_VERSION,
      environment: config.DEPLOYMENT_ENVIRONMENT,
      samplingRate: config.SAMPLING_RATE,
      exportTimeout: config.EXPORT_TIMEOUT_MS,
    });

    // Set up diagnostic logging
    diag.setLogger(
      new DiagConsoleLogger(), 
      config.DEPLOYMENT_ENVIRONMENT === "development" ? DiagLogLevel.INFO : DiagLogLevel.WARN
    );

    // Initialize health monitor with config
    telemetryHealthMonitor.setConfig(config);

    // Create resource with all 2025-compliant semantic conventions
    const resource = await createResource(config);

    // Create 2025-compliant exporters
    const traceExporter = createTraceExporter(config);
    const metricExporter = createMetricExporter(config);
    const logExporter = createLogExporter(config);

    // Create span processor with 2025 batch settings
    const spanProcessor = new BatchSpanProcessor(traceExporter, {
      maxExportBatchSize: config.BATCH_SIZE, // 2048 (2025 standard)
      maxQueueSize: config.MAX_QUEUE_SIZE,   // 10,000 (2025 standard)
      scheduledDelayMillis: 5000,            // 5 seconds
      exportTimeoutMillis: config.EXPORT_TIMEOUT_MS, // 30 seconds (2025 standard)
    });

    // Create log processor with 2025 batch settings
    const logProcessor = new BatchLogRecordProcessor(logExporter, {
      maxExportBatchSize: Math.min(config.BATCH_SIZE, 512), // Logs can be smaller batches
      maxQueueSize: config.MAX_QUEUE_SIZE,
      scheduledDelayMillis: 5000,
      exportTimeoutMillis: config.EXPORT_TIMEOUT_MS,
    });

    // Create metric reader with proper intervals
    const metricReader = new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: config.METRIC_READER_INTERVAL,
      exportTimeoutMillis: config.EXPORT_TIMEOUT_MS,
    });

    // Create smart sampler with 2025 standards
    const sampler = new SmartSampler({
      defaultSamplingRate: config.SAMPLING_RATE, // 15% (2025 standard)
      errorSamplingRate: 1.0, // 100% error retention (2025 standard)
      enabledEndpoints: ["/graphql", "/health"], // Always sample these
    });

    // Create propagator with W3C standards
    const propagator = new CompositePropagator({
      propagators: [
        new W3CTraceContextPropagator(),
        new W3CBaggagePropagator(),
      ],
    });

    // Initialize NodeSDK with 2025-compliant configuration
    sdk = new NodeSDK({
      resource,
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
            }
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

    console.log("✅ OpenTelemetry SDK initialized successfully", {
      tracesEndpoint: config.TRACES_ENDPOINT,
      metricsEndpoint: config.METRICS_ENDPOINT,
      logsEndpoint: config.LOGS_ENDPOINT,
      samplingRate: `${config.SAMPLING_RATE * 100}%`,
      batchSize: config.BATCH_SIZE,
      exportTimeoutMs: config.EXPORT_TIMEOUT_MS,
    });

    // Set up graceful shutdown
    setupGracefulShutdown();

  } catch (err) {
    console.error("❌ Failed to initialize OpenTelemetry SDK:", err);
    throw err; // Re-throw to fail fast
  }
}

function createResource(config: TelemetryConfig) {
  const attributes = {
    [ATTR_SERVICE_NAME]: config.SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: config.SERVICE_VERSION,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: config.DEPLOYMENT_ENVIRONMENT,
    [SEMRESATTRS_SERVICE_NAMESPACE]: "capella-graphql-api", // 2025 standard
    [SEMRESATTRS_SERVICE_INSTANCE_ID]: process.env.HOSTNAME || process.env.INSTANCE_ID || "unknown",
    [ATTR_TELEMETRY_SDK_NAME]: "opentelemetry", // 2025 standard
    [ATTR_TELEMETRY_SDK_LANGUAGE]: "nodejs", // 2025 standard
    [ATTR_TELEMETRY_SDK_VERSION]: "2.0.1", // 2025 standard
    // Runtime information
    "runtime.name": "bun",
    "runtime.version": typeof Bun !== "undefined" ? Bun.version : process.version,
    // Container information if available
    ...(process.env.CONTAINER_ID && { "container.id": process.env.CONTAINER_ID }),
    ...(process.env.K8S_POD_NAME && { "k8s.pod.name": process.env.K8S_POD_NAME }),
    ...(process.env.K8S_NAMESPACE && { "k8s.namespace.name": process.env.K8S_NAMESPACE }),
  };

  return resourceFromAttributes(attributes);
}

function createTraceExporter(config: TelemetryConfig): OTLPTraceExporter {
  return new OTLPTraceExporter({
    url: config.TRACES_ENDPOINT,
    headers: {
      "Content-Type": "application/json",     // JSON over HTTP for collector on port 4318
      // Gzip compression can cause timeout with some collectors
    },
    timeoutMillis: config.EXPORT_TIMEOUT_MS,  // 30 seconds (2025 standard)
    concurrencyLimit: 10,                     // Reasonable concurrency
    keepAlive: true,
  });
}

function createMetricExporter(config: TelemetryConfig): OTLPMetricExporter {
  return new OTLPMetricExporter({
    url: config.METRICS_ENDPOINT,
    headers: {
      "Content-Type": "application/json",     // JSON over HTTP for collector on port 4318
      // Gzip compression can cause timeout with some collectors
    },
    timeoutMillis: config.EXPORT_TIMEOUT_MS,  // 30 seconds (2025 standard)
    concurrencyLimit: 10,
    keepAlive: true,
  });
}

function createLogExporter(config: TelemetryConfig): OTLPLogExporter {
  return new OTLPLogExporter({
    url: config.LOGS_ENDPOINT,
    headers: {
      "Content-Type": "application/json",     // JSON over HTTP for collector on port 4318
      // Gzip compression can cause timeout with some collectors
    },
    timeoutMillis: config.EXPORT_TIMEOUT_MS,  // 30 seconds (2025 standard)
    concurrencyLimit: 10,
    keepAlive: true,
  });
}

function setupGracefulShutdown(): void {
  const gracefulShutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down OpenTelemetry SDK gracefully...`);
    
    try {
      await shutdownTelemetry();
      console.log("✅ OpenTelemetry SDK shut down successfully");
    } catch (err) {
      console.error("❌ Error during OpenTelemetry SDK shutdown:", err);
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
    console.log("OpenTelemetry SDK shutdown completed");
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

// Initialize telemetry on module load
if (typeof Bun !== "undefined" || process.env.NODE_ENV !== "test") {
  initializeTelemetry().catch((err) => {
    console.error("Critical: Failed to initialize OpenTelemetry:", err);
    // In production, we might want to exit here
    if (process.env.DEPLOYMENT_ENVIRONMENT === "production") {
      process.exit(1);
    }
  });
}