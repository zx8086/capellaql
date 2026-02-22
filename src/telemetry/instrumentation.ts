/* src/telemetry/instrumentation.ts */
// Implementation follows migrate/telemetry/instrumentation.ts EXACTLY

import os from "node:os";
import { logs } from "@opentelemetry/api-logs";
import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HostMetrics } from "@opentelemetry/host-metrics";
import { GraphQLInstrumentation } from "@opentelemetry/instrumentation-graphql";
import { RedisInstrumentation } from "@opentelemetry/instrumentation-redis-4";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader, type PushMetricExporter, type ResourceMetrics } from "@opentelemetry/sdk-metrics";
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
import type { ExportResult } from "@opentelemetry/core";
import { type TelemetryConfig, telemetryConfig } from "$config";
import { BunPerf } from "$utils/bunUtils";
import {
  createExportStatsTracker,
  type ExportStats,
  type ExportStatsTracker,
  wrapLogRecordExporter,
  wrapMetricExporter,
  wrapSpanExporter,
} from "./export-stats-tracker";
import { log, warn, winstonTelemetryLogger } from "./winston-logger";

// ============================================================================
// Module-level state (per migrate/telemetry/instrumentation.ts)
// ============================================================================

interface MetricReaderLike {
  forceFlush(): Promise<void>;
  shutdown(): Promise<void>;
  collect?(): Promise<unknown>;
}

let sdk: NodeSDK | undefined;
let loggerProvider: LoggerProvider | undefined;
let hostMetrics: HostMetrics | undefined;
let metricExporter: PushMetricExporter | undefined;
let metricReader: MetricReaderLike | undefined;
let isInitialized = false;
let config: TelemetryConfig;

// Export stats trackers (per migrate/telemetry/instrumentation.ts lines 57-59)
const traceExportStats = createExportStatsTracker();
const metricExportStats = createExportStatsTracker();
const logExportStats = createExportStatsTracker();

export async function initializeTelemetry(): Promise<void> {
  if (isInitialized) {
    warn("OpenTelemetry already initialized, skipping");
    return;
  }

  try {
    // Load and validate configuration from unified config system
    config = telemetryConfig;

    if (!config.ENABLE_OPENTELEMETRY) {
      // Create no-op exporters for disabled mode (per migrate pattern)
      const noOpExporter: PushMetricExporter = {
        export: (_metrics: ResourceMetrics, resultCallback: (result: ExportResult) => void): void => {
          metricExportStats.recordExportAttempt();
          metricExportStats.recordExportSuccess();
          resultCallback({ code: 0 });
        },
        forceFlush: (): Promise<void> => Promise.resolve(),
        shutdown: (): Promise<void> => Promise.resolve(),
        selectAggregationTemporality: () => 1,
      };
      metricExporter = noOpExporter;

      const noOpReader: MetricReaderLike = {
        forceFlush: (): Promise<void> => Promise.resolve(),
        shutdown: (): Promise<void> => Promise.resolve(),
      };
      metricReader = noOpReader;

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
        exportTimeout: config.EXPORT_TIMEOUT_MS,
      });
    }

    // Set up diagnostic logging
    diag.setLogger(
      new DiagConsoleLogger(),
      config.DEPLOYMENT_ENVIRONMENT === "development" ? DiagLogLevel.INFO : DiagLogLevel.WARN
    );

    // Create resource with all 2025-compliant semantic conventions (synchronous)
    const resource = createResource(config);

    // Create OTLP exporters with tracking wrappers
    // Per migrate/telemetry/instrumentation.ts lines 103-120
    const baseOtlpTraceExporter = new OTLPTraceExporter({
      url: config.TRACES_ENDPOINT,
      timeoutMillis: config.EXPORT_TIMEOUT_MS,
    });
    const trackingTraceExporter = wrapSpanExporter(baseOtlpTraceExporter, traceExportStats);

    const baseOtlpMetricExporter = new OTLPMetricExporter({
      url: config.METRICS_ENDPOINT,
      timeoutMillis: config.EXPORT_TIMEOUT_MS,
    });
    const trackingMetricExporter = wrapMetricExporter(baseOtlpMetricExporter, metricExportStats);
    metricExporter = trackingMetricExporter;

    const baseOtlpLogExporter = new OTLPLogExporter({
      url: config.LOGS_ENDPOINT,
      timeoutMillis: config.EXPORT_TIMEOUT_MS,
    });
    const trackingLogExporter = wrapLogRecordExporter(baseOtlpLogExporter, logExportStats);

    // Create processors per migrate/telemetry/instrumentation.ts lines 122-139
    const traceProcessor = new BatchSpanProcessor(trackingTraceExporter, {
      maxExportBatchSize: 10,
      scheduledDelayMillis: 1000,
    });

    if (!metricExporter) {
      throw new Error("metricExporter must be initialized before creating PeriodicExportingMetricReader");
    }

    const periodicReader = new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 10000,
    });
    metricReader = periodicReader;

    const logProcessor = new BatchLogRecordProcessor(trackingLogExporter);

    // OTel SDK 0.212.0 breaking change: LoggerProvider must be explicitly registered
    // as the global provider for OpenTelemetryTransportV3 (Winston) to work.
    // NodeSDK no longer automatically sets the global LoggerProvider.
    // Per migrate/telemetry/instrumentation.ts lines 141-149
    loggerProvider = new LoggerProvider({
      resource,
      processors: [logProcessor],
    });
    logs.setGlobalLoggerProvider(loggerProvider);

    // Create propagator with W3C standards
    const propagator = new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    });

    // Get instrumentations
    const baseInstrumentations = getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-aws-lambda": { enabled: false },
      "@opentelemetry/instrumentation-aws-sdk": { enabled: false },
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-winston": { enabled: false },
      "@opentelemetry/instrumentation-runtime-node": { enabled: false },
      "@opentelemetry/instrumentation-grpc": { enabled: false },
      "@opentelemetry/instrumentation-http": {
        enabled: true,
        ignoreIncomingRequestHook: (req) => {
          return req.url?.includes("/health") || false;
        },
      },
    });

    const graphqlInstrumentation = new GraphQLInstrumentation({
      allowValues: true,
      depth: -1,
      mergeItems: true,
    });

    const redisInstrumentation = new RedisInstrumentation({
      dbStatementSerializer: (cmdName, cmdArgs) => {
        const sanitizedArgs = cmdArgs.map((arg, i) => {
          const argStr = arg instanceof Buffer ? arg.toString() : String(arg);
          if (cmdName.toUpperCase() === "SET" && i === 1) {
            return "***";
          }
          if (cmdName.toUpperCase() === "GET" && argStr.includes("consumer_secret")) {
            return "consumer_secret:***";
          }
          return argStr;
        });
        return [cmdName, ...sanitizedArgs].join(" ");
      },
    });

    const instrumentations = [...baseInstrumentations, graphqlInstrumentation, redisInstrumentation];

    // Initialize NodeSDK per migrate/telemetry/instrumentation.ts lines 201-208
    sdk = new NodeSDK({
      resource,
      autoDetectResources: false,
      textMapPropagator: propagator,
      spanProcessors: [traceProcessor],
      metricReaders: [periodicReader],
      // LoggerProvider is managed separately and registered globally above
      instrumentations: [instrumentations],
    });

    // Start the SDK
    sdk.start();

    // Start host metrics collection
    hostMetrics = new HostMetrics({});
    hostMetrics.start();

    // OTel SDK 0.212.0 breaking change fix:
    // Winston logger must be reinitialized AFTER the global LoggerProvider is set.
    // Per migrate/telemetry/instrumentation.ts lines 215-220
    winstonTelemetryLogger.reinitialize();

    isInitialized = true;

    if (process.env.DEBUG_OTEL_EXPORTERS === "true") {
      console.debug("OpenTelemetry SDK initialized successfully", {
        tracesEndpoint: config.TRACES_ENDPOINT,
        metricsEndpoint: config.METRICS_ENDPOINT,
        logsEndpoint: config.LOGS_ENDPOINT,
        batchSize: config.BATCH_SIZE,
        exportTimeoutMs: config.EXPORT_TIMEOUT_MS,
      });
    }

    // Set up graceful shutdown
    setupGracefulShutdown();
  } catch (err) {
    console.error("Failed to initialize OpenTelemetry SDK:", err);
    throw err;
  }
}

function createResource(config: TelemetryConfig) {
  const attributes = {
    [ATTR_SERVICE_NAME]: config.SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: config.SERVICE_VERSION,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: config.DEPLOYMENT_ENVIRONMENT,
    [SEMRESATTRS_SERVICE_NAMESPACE]: "capella-graphql-api",
    [SEMRESATTRS_SERVICE_INSTANCE_ID]: config.runtime?.HOSTNAME || config.runtime?.INSTANCE_ID || os.hostname(),
    [ATTR_TELEMETRY_SDK_NAME]: "opentelemetry",
    [ATTR_TELEMETRY_SDK_LANGUAGE]: "nodejs",
    [ATTR_TELEMETRY_SDK_VERSION]: "2.0.1",
    "runtime.name": "bun",
    "runtime.version": typeof Bun !== "undefined" ? Bun.version : process.version,
    "process.pid": process.pid,
    "process.executable.name": typeof Bun !== "undefined" ? "bun" : "node",
    "process.executable.path": process.execPath,
    "process.command": process.argv[1] || "unknown",
    "process.runtime.name": typeof Bun !== "undefined" ? "bun" : "nodejs",
    "process.runtime.version": typeof Bun !== "undefined" ? Bun.version : process.version,
    "host.name": os.hostname(),
    "host.arch": os.arch(),
    "host.type": os.type(),
    "host.cpu.family": os.cpus()[0]?.model || "unknown",
    ...(config.runtime?.CONTAINER_ID && { "container.id": config.runtime.CONTAINER_ID }),
    ...(config.runtime?.K8S_POD_NAME && { "k8s.pod.name": config.runtime.K8S_POD_NAME }),
    ...(config.runtime?.K8S_NAMESPACE && { "k8s.namespace.name": config.runtime.K8S_NAMESPACE }),
  };

  return resourceFromAttributes(attributes);
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

// Per migrate/telemetry/instrumentation.ts lines 223-243
export async function shutdownTelemetry(): Promise<void> {
  if (hostMetrics) {
    hostMetrics = undefined;
  }

  if (loggerProvider) {
    try {
      await loggerProvider.shutdown();
    } catch (error) {
      console.warn("Error shutting down LoggerProvider:", error);
    }
  }

  if (sdk) {
    try {
      await sdk.shutdown();
      sdk = undefined;
      isInitialized = false;
    } catch (error) {
      console.warn("Error shutting down OpenTelemetry:", error);
    }
  }
}

// Per migrate/telemetry/instrumentation.ts lines 245-256
export function getTelemetryStatus() {
  return {
    initialized: !!sdk,
    config: telemetryConfig,
    exportStats: {
      traces: traceExportStats.getStats(),
      metrics: metricExportStats.getStats(),
      logs: logExportStats.getStats(),
    },
    metricsExportStats: metricExportStats,
  };
}

// Per migrate/telemetry/instrumentation.ts lines 258-277
export async function forceMetricsFlush(): Promise<void> {
  if (!metricReader) {
    throw new Error("Metrics reader not initialized");
  }
  await metricReader.forceFlush();

  if (metricExporter) {
    if (!config.ENABLE_OPENTELEMETRY) {
      const emptyMetrics: ResourceMetrics = {
        resource: resourceFromAttributes({}),
        scopeMetrics: [],
      };
      metricExporter.export(emptyMetrics, () => {});
    } else {
      await metricExporter.forceFlush();
    }
  }
}

// Per migrate/telemetry/instrumentation.ts lines 279-289
export function getTraceExportStats(): ExportStats {
  return traceExportStats.getStats();
}

export function getMetricsExportStats(): ExportStatsTracker {
  return metricExportStats;
}

export function getLogExportStats(): ExportStats {
  return logExportStats.getStats();
}

// Per migrate/telemetry/instrumentation.ts lines 291-300
export async function triggerImmediateMetricsExport(): Promise<void> {
  if (!metricReader) {
    throw new Error("Metrics reader not initialized");
  }
  if (typeof metricReader.collect === "function") {
    await metricReader.collect();
  } else {
    await metricReader.forceFlush();
  }
}

export function getTelemetrySDK(): NodeSDK | undefined {
  return sdk;
}

export function isTelemetryInitialized(): boolean {
  return isInitialized;
}

export const initializeBunFullTelemetry = initializeTelemetry;
export const initializeSimpleTelemetry = initializeTelemetry;
export const getBunTelemetryStatus = getTelemetryStatus;
export const getSimpleTelemetryStatus = getTelemetryStatus;
export const shutdownSimpleTelemetry = shutdownTelemetry;

// Performance monitoring utilities with Bun integration
export async function measureDatabaseOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  queryType: string = "unknown"
): Promise<T> {
  const { result, duration } = await BunPerf.measure(operation, `DB:${operationName}`);

  if (isInitialized) {
    try {
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
    if (config?.DEPLOYMENT_ENVIRONMENT === "production") {
      process.exit(1);
    }
  });
}
