// src/telemetry/instrumentation.ts

import { logs } from "@opentelemetry/api-logs";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import type { ExportResult } from "@opentelemetry/core";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HostMetrics } from "@opentelemetry/host-metrics";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import { RedisInstrumentation } from "@opentelemetry/instrumentation-redis";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import {
  type MeterProvider,
  PeriodicExportingMetricReader,
  type PushMetricExporter,
  type ResourceMetrics,
} from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_TELEMETRY_SDK_LANGUAGE,
  ATTR_TELEMETRY_SDK_NAME,
  ATTR_TELEMETRY_SDK_VERSION,
} from "@opentelemetry/semantic-conventions";
import { ATTR_DEPLOYMENT_ENVIRONMENT_NAME } from "@opentelemetry/semantic-conventions/incubating";
import { loadConfig } from "../config/index";
import { loggerContainer } from "../logging/container";
import {
  createExportStatsTracker,
  type ExportStats,
  type ExportStatsTracker,
  wrapLogRecordExporter,
  wrapMetricExporter,
  wrapSpanExporter,
} from "./export-stats-tracker";
import { getMemoryGuardian, type QueueHealth, shutdownMemoryGuardian } from "./memory-guardian";
import { initializeMetrics } from "./metrics";
import { winstonTelemetryLogger } from "./winston-logger";

interface MetricReaderLike {
  forceFlush(): Promise<void>;
  shutdown(): Promise<void>;
  collect?(): Promise<unknown>;
}

const config = loadConfig();
const telemetryConfig = config.telemetry;

let sdk: NodeSDK | undefined;
let loggerProvider: LoggerProvider | undefined;
let hostMetrics: HostMetrics | undefined;
let metricExporter: PushMetricExporter | undefined;
let metricReader: MetricReaderLike | undefined;
let _meterProvider: MeterProvider | undefined;

const traceExportStats = createExportStatsTracker();
const metricExportStats = createExportStatsTracker();
const logExportStats = createExportStatsTracker();

export async function initializeTelemetry(): Promise<void> {
  initializeMetrics();

  if (!telemetryConfig.enableOpenTelemetry || telemetryConfig.mode === "console") {
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
    return;
  }

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: telemetryConfig.serviceName,
    [ATTR_SERVICE_VERSION]: telemetryConfig.serviceVersion,
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: telemetryConfig.environment,
    [ATTR_TELEMETRY_SDK_NAME]: "opentelemetry/nodejs",
    [ATTR_TELEMETRY_SDK_VERSION]: "1.26.0",
    [ATTR_TELEMETRY_SDK_LANGUAGE]: "nodejs",

    ...(telemetryConfig.infrastructure.isKubernetes && {
      "k8s.pod.name": telemetryConfig.infrastructure.podName,
      "k8s.namespace.name": telemetryConfig.infrastructure.namespace,
    }),
    ...(telemetryConfig.infrastructure.isEcs && {
      "cloud.provider": "aws",
      "cloud.platform": "aws_ecs",
    }),
  });

  // Memory optimization: Use shorter timeouts to prevent buffer accumulation
  // during backpressure. Default 30s is too long and causes Uint8Array retention.
  const exportTimeout = Math.min(telemetryConfig.exportTimeout, 10000);

  const baseOtlpTraceExporter = new OTLPTraceExporter({
    url: telemetryConfig.tracesEndpoint,
    timeoutMillis: exportTimeout,
  });
  const trackingTraceExporter = wrapSpanExporter(baseOtlpTraceExporter, traceExportStats);

  const baseOtlpMetricExporter = new OTLPMetricExporter({
    url: telemetryConfig.metricsEndpoint,
    timeoutMillis: exportTimeout,
  });
  const trackingMetricExporter = wrapMetricExporter(baseOtlpMetricExporter, metricExportStats);
  metricExporter = trackingMetricExporter;

  const baseOtlpLogExporter = new OTLPLogExporter({
    url: telemetryConfig.logsEndpoint,
    timeoutMillis: exportTimeout,
  });
  const trackingLogExporter = wrapLogRecordExporter(baseOtlpLogExporter, logExportStats);

  // Memory optimization: Configure batch processor with bounded queue to prevent
  // Uint8Array/protobuf buffer accumulation. The maxQueueSize limits memory usage
  // by dropping spans when the queue is full rather than accumulating indefinitely.
  // Key settings:
  // - maxQueueSize: 512 (default) limits worst-case memory to ~32MB per processor
  // - scheduledDelayMillis: 500ms exports frequently to prevent queue buildup
  // - Trade-off: More network calls but prevents memory accumulation during backpressure
  const traceProcessor = new BatchSpanProcessor(trackingTraceExporter, {
    maxExportBatchSize: telemetryConfig.batchSize,
    maxQueueSize: telemetryConfig.maxQueueSize,
    scheduledDelayMillis: 500, // Export every 500ms to prevent queue buildup
    exportTimeoutMillis: exportTimeout,
  });

  if (!metricExporter) {
    throw new Error(
      "metricExporter must be initialized before creating PeriodicExportingMetricReader"
    );
  }

  // Memory optimization: Configure metric reader with longer interval to reduce CPU overhead.
  // Profile analysis showed PeriodicExportingMetricReader._runOnce consuming 31.6% CPU.
  // Increasing from 10s to 30s significantly reduces metrics collection overhead while
  // still providing adequate observability granularity for production monitoring.
  // exportIntervalMillis must be >= exportTimeoutMillis (OTEL SDK constraint)
  const metricExportInterval = 30000; // 30 seconds - reduced from 10s to lower CPU overhead
  const periodicReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: metricExportInterval,
    exportTimeoutMillis: exportTimeout,
  });
  metricReader = periodicReader;

  // Memory optimization: Configure log processor with bounded queue to prevent
  // buffer accumulation. Matches trace processor settings for consistency.
  // Uses same aggressive export settings as trace processor.
  const logProcessor = new BatchLogRecordProcessor(trackingLogExporter, {
    maxExportBatchSize: telemetryConfig.batchSize,
    maxQueueSize: telemetryConfig.maxQueueSize,
    scheduledDelayMillis: 500, // Export every 500ms to prevent queue buildup
    exportTimeoutMillis: exportTimeout,
  });

  // OTel SDK 0.212.0 breaking change: LoggerProvider must be explicitly registered
  // as the global provider for OpenTelemetryTransportV3 (Winston) to work.
  // NodeSDK no longer automatically sets the global LoggerProvider.
  // See: https://github.com/open-telemetry/opentelemetry-js/releases (0.212.0)
  loggerProvider = new LoggerProvider({
    resource,
    processors: [logProcessor],
  });
  logs.setGlobalLoggerProvider(loggerProvider);

  const baseInstrumentations = getNodeAutoInstrumentations({
    "@opentelemetry/instrumentation-http": {
      enabled: true,
      // biome-ignore lint/suspicious/noExplicitAny: OpenTelemetry hook types are complex and not fully exposed
      requestHook: (span: any, request: any) => {
        span.setAttributes({
          "http.request.body.size": request.headers["content-length"] || 0,
          "http.user_agent": request.headers["user-agent"] || "",
        });
      },
      // biome-ignore lint/suspicious/noExplicitAny: OpenTelemetry hook types are complex and not fully exposed
      responseHook: (span: any, response: any) => {
        span.setAttributes({
          "http.response.body.size": response.headers["content-length"] || 0,
        });
      },
    },
    "@opentelemetry/instrumentation-dns": {
      enabled: true,
    },
    "@opentelemetry/instrumentation-net": {
      enabled: true,
    },
    "@opentelemetry/instrumentation-fs": {
      enabled: false,
    },
    "@opentelemetry/instrumentation-grpc": {
      enabled: false,
    },
    // Memory optimization: RuntimeNodeInstrumentation disabled by default to save ~10% CPU
    // The event loop delay collector (monitorEventLoopDelay) consumes significant CPU
    // due to 10ms polling interval. Enable via OTEL_RUNTIME_METRICS_ENABLED=true if needed.
    "@opentelemetry/instrumentation-runtime-node": {
      enabled: telemetryConfig.runtimeMetricsEnabled ?? false,
    },
  });

  const redisInstrumentation = new RedisInstrumentation({
    enabled: true,
    dbStatementSerializer: (cmdName: string, cmdArgs: (string | Buffer)[]) => {
      const sanitizedArgs = cmdArgs.map((arg, index) => {
        const argStr = arg instanceof Buffer ? arg.toString() : arg;
        if (cmdName.toUpperCase() === "SET" && index === 1) {
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

  // PinoInstrumentation injects trace_id/span_id from active OTEL span into Pino logs.
  // This enables log correlation with traces when LOGGING_BACKEND=pino.
  // Works alongside @elastic/ecs-pino-format (which must set apmIntegration: false).
  const pinoInstrumentation = new PinoInstrumentation({
    enabled: true,
  });

  const instrumentations = [...baseInstrumentations, redisInstrumentation, pinoInstrumentation];

  sdk = new NodeSDK({
    resource,
    spanProcessors: [traceProcessor],
    metricReaders: [periodicReader],
    // CRITICAL: Pass empty array to disable NodeSDK's automatic LoggerProvider creation.
    // Without this, NodeSDK calls configureLoggerProviderFromEnv() which defaults to
    // http/protobuf protocol, loading @opentelemetry/exporter-logs-otlp-proto and
    // protobufjs, causing ~70MB of Uint8Array allocations from buffer pooling.
    // We manage our own LoggerProvider (lines 179-183) with http/json exporter instead.
    logRecordProcessors: [],
    instrumentations: [instrumentations],
  });

  sdk.start();

  // CPU optimization: Disable expensive system.network metrics which call os.networkInterfaces()
  // Profile analysis showed networkInterfaces() consuming 2.7% CPU.
  // We keep process-level metrics (process.cpu, process.memory) which are cheaper and more relevant.
  // system.cpu is kept for load monitoring but system.network is disabled.
  hostMetrics = new HostMetrics({
    metricGroups: ["system.cpu", "system.memory", "process.cpu", "process.memory"],
    // Omitted: "system.network" - expensive os.networkInterfaces() calls
  });
  hostMetrics.start();

  // OTel SDK 0.212.0 breaking change fix:
  // Winston logger must be reinitialized AFTER the global LoggerProvider is set.
  // OpenTelemetryTransportV3 captures the global LoggerProvider at construction time,
  // so any transports created before logs.setGlobalLoggerProvider() will not send logs.
  // See: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/packages/winston-transport/README.md
  winstonTelemetryLogger.reinitialize();

  // SIO-447: Pino logger also needs reinitialization to pick up global LoggerProvider.
  // PinoAdapter.emitOtelLog() uses logs.getLogger() which requires the global provider.
  loggerContainer.getLogger().reinitialize();

  // Layer 3: Start memory guardian for adaptive backpressure monitoring
  const memoryGuardian = getMemoryGuardian();
  memoryGuardian.registerTrackers(traceExportStats, metricExportStats, logExportStats);
  memoryGuardian.start();
}

export async function shutdownTelemetry(): Promise<void> {
  // Shutdown memory guardian first to stop monitoring
  shutdownMemoryGuardian();

  if (hostMetrics) {
    // HostMetrics cleanup happens through OTel SDK shutdown (no explicit stop method)
    // Setting to undefined allows garbage collection of internal meter references
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
    } catch (error) {
      console.warn("Error shutting down OpenTelemetry:", error);
    }
  }
}

export function getTelemetryStatus() {
  const memoryGuardian = getMemoryGuardian();
  return {
    initialized: !!sdk,
    config: telemetryConfig,
    exportStats: {
      traces: traceExportStats.getStats(),
      metrics: metricExportStats.getStats(),
      logs: logExportStats.getStats(),
    },
    metricsExportStats: metricExportStats,
    memoryHealth: memoryGuardian.getHealth(),
  };
}

/**
 * Get current memory and queue health status
 */
export function getMemoryHealth(): QueueHealth {
  return getMemoryGuardian().getHealth();
}

/**
 * Check if telemetry system is under memory pressure
 */
export function isTelemetryUnderPressure(): boolean {
  return getMemoryGuardian().isUnderPressure();
}

/**
 * Get raw export stats trackers for advanced monitoring
 */
export function getExportStatsTrackers() {
  return {
    traces: traceExportStats,
    metrics: metricExportStats,
    logs: logExportStats,
  };
}

export async function forceMetricsFlush(): Promise<void> {
  if (!metricReader) {
    throw new Error("Metrics reader not initialized");
  }
  await metricReader.forceFlush();

  if (metricExporter) {
    if (telemetryConfig.mode === "console") {
      const emptyMetrics: ResourceMetrics = {
        resource: resourceFromAttributes({}),
        scopeMetrics: [],
      };
      metricExporter.export(emptyMetrics, () => {
        // No-op callback required by API
      });
    } else {
      await metricExporter.forceFlush();
    }
  }
}

export function getTraceExportStats(): ExportStats {
  return traceExportStats.getStats();
}

export function getMetricsExportStats(): ExportStatsTracker {
  return metricExportStats;
}

export function getLogExportStats(): ExportStats {
  return logExportStats.getStats();
}

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

export const initializeBunFullTelemetry = initializeTelemetry;
export const initializeSimpleTelemetry = initializeTelemetry;
export const getBunTelemetryStatus = getTelemetryStatus;
export const getSimpleTelemetryStatus = getTelemetryStatus;

export const shutdownSimpleTelemetry = shutdownTelemetry;
