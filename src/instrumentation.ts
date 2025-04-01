/* src/instrumentation.ts */

import { debug, log, warn, err } from "$utils/simpleLogger";
import { trace, context } from "@opentelemetry/api";

log("Starting Application - Couchbase Capella GraphQL API Service");

import {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  metrics,
  type Meter,
  type Counter,
  type Histogram,
} from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { Resource } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from "@opentelemetry/semantic-conventions";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { MonitoredOTLPTraceExporter } from "./otlp/MonitoredOTLPTraceExporter";
import { MonitoredOTLPMetricExporter } from "./otlp/MonitoredOTLPMetricExporter";
import { MonitoredOTLPLogExporter } from "./otlp/MonitoredOTLPLogExporter";
import type { SpanExporter } from "@opentelemetry/sdk-trace-base";
import type { PushMetricExporter } from "@opentelemetry/sdk-metrics";
import type { LogRecordExporter } from "@opentelemetry/sdk-logs";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  LoggerProvider,
  BatchLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston";
import { GraphQLInstrumentation } from "@opentelemetry/instrumentation-graphql";
import * as api from "@opentelemetry/api-logs";
import config from "./config";

log("Staring Instrumentation............");

const INSTRUMENTATION_ENABLED =
  (Bun.env["ENABLE_OPENTELEMETRY"] as string) === "true";
log("OpenTelemetry Instrumentation Status", { INSTRUMENTATION_ENABLED });

log("OpenTelemetry Environment Variables", {
  ENABLE_OPENTELEMETRY: Bun.env["ENABLE_OPENTELEMETRY"],
  PARSED_INSTRUMENTATION_ENABLED: INSTRUMENTATION_ENABLED,
});

log("Parsed INSTRUMENTATION_ENABLED:", { INSTRUMENTATION_ENABLED });

let sdk: NodeSDK | undefined;
let meter: Meter | undefined;
let httpRequestCounter: Counter | undefined;
let httpResponseTimeHistogram: Histogram | undefined;
let isInitialized = false;

const createResource = async () => {
  const { defaultResource, resourceFromAttributes } = await import('@opentelemetry/resources');
  return (await defaultResource()).merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.openTelemetry.SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: config.openTelemetry.SERVICE_VERSION,
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]:
        config.openTelemetry.DEPLOYMENT_ENVIRONMENT,
    })
  );
};

const exporterTimeout = 300000; // 5 minutes

const commonConfig = {
  timeoutMillis: exporterTimeout,
  concurrencyLimit: 100,
  keepAlive: true,
};

export function initializeHttpMetrics() {
  if (INSTRUMENTATION_ENABLED && meter) {
    log("Initializing HTTP metrics");
    try {
      httpRequestCounter = meter.createCounter("http_requests_total", {
        description: "Count of HTTP requests",
      });
      log("HTTP request counter created");

      httpResponseTimeHistogram = meter.createHistogram(
        "http_response_time_seconds",
        {
          description: "HTTP response time in seconds",
        },
      );
      log("HTTP response time histogram created");

      log("HTTP metrics initialized successfully");
    } catch (error) {
      err("Error initializing HTTP metrics:", error);
    }
  } else {
    log(
      "HTTP metrics initialization skipped (instrumentation disabled or meter not available)",
    );
  }
}

async function initializeOpenTelemetry() {
  if (INSTRUMENTATION_ENABLED) {
    try {
      log("Initializing OpenTelemetry SDK...");
      diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

      const resource = await createResource();

      const traceExporter = new MonitoredOTLPTraceExporter(
        {
          url: config.openTelemetry.TRACES_ENDPOINT,
          headers: { "Content-Type": "application/json" },
          ...commonConfig,
        },
        exporterTimeout,
      ) as unknown as SpanExporter;

      const otlpMetricExporter = new MonitoredOTLPMetricExporter(
        {
          url: config.openTelemetry.METRICS_ENDPOINT,
          headers: { "Content-Type": "application/json" },
          ...commonConfig,
        },
        exporterTimeout,
      ) as unknown as PushMetricExporter;

      log("Metric exporter created with timeout:", exporterTimeout);

      const logExporter = new MonitoredOTLPLogExporter(
        {
          url: config.openTelemetry.LOGS_ENDPOINT,
          headers: { "Content-Type": "application/json" },
          ...commonConfig,
        },
        exporterTimeout,
      ) as unknown as LogRecordExporter;

      log("Traces exporter created with config:", {
        url: config.openTelemetry.TRACES_ENDPOINT,
        interval: config.openTelemetry.METRIC_READER_INTERVAL,
        summaryInterval: config.openTelemetry.SUMMARY_LOG_INTERVAL,
      });

      log("Metrics exporter created with config:", {
        url: config.openTelemetry.METRICS_ENDPOINT,
        interval: config.openTelemetry.METRIC_READER_INTERVAL,
        summaryInterval: config.openTelemetry.SUMMARY_LOG_INTERVAL,
      });

      log("Logs exporter created with config:", {
        url: config.openTelemetry.LOGS_ENDPOINT,
        interval: config.openTelemetry.METRIC_READER_INTERVAL,
        summaryInterval: config.openTelemetry.SUMMARY_LOG_INTERVAL,
      });

      const loggerProvider = new LoggerProvider({ resource });
      loggerProvider.addLogRecordProcessor(
        new BatchLogRecordProcessor(logExporter, {
          maxExportBatchSize: 100,
          scheduledDelayMillis: 10000,
          exportTimeoutMillis: exporterTimeout,
        }),
      );

      api.logs.setGlobalLoggerProvider(loggerProvider);

      const otlpMetricReader = new PeriodicExportingMetricReader({
        exporter: otlpMetricExporter,
        exportIntervalMillis: config.openTelemetry.METRIC_READER_INTERVAL,
      });

      // Create MeterProvider separately
      const meterProvider = new MeterProvider({
        resource: resource,
        readers: [otlpMetricReader],
      });

      // Set the global MeterProvider
      metrics.setGlobalMeterProvider(meterProvider);

      try {
        meter = metrics.getMeter(
          config.openTelemetry.SERVICE_NAME,
          config.openTelemetry.SERVICE_VERSION,
        );
        if (!meter) {
          warn("Failed to get meter from global MeterProvider");
        } else {
          log("Metrics Meter created successfully");
        }
      } catch (error) {
        err("Error getting meter:", error);
      }

      const batchSpanProcessor = new BatchSpanProcessor(traceExporter, {
        maxExportBatchSize: 512,
        scheduledDelayMillis: 5000,
        exportTimeoutMillis: exporterTimeout,
      });

      sdk = new NodeSDK({
        resource: resource,
        traceExporter,
        spanProcessors: [batchSpanProcessor],
        logRecordProcessor: new BatchLogRecordProcessor(logExporter),
        instrumentations: [
          getNodeAutoInstrumentations({
            "@opentelemetry/instrumentation-aws-lambda": { enabled: false },
            "@opentelemetry/instrumentation-fs": { enabled: false },
            "@opentelemetry/instrumentation-winston": { enabled: false },
          }),
          new GraphQLInstrumentation({
            allowValues: true,
            depth: -1,
          }),
          new WinstonInstrumentation({
            enabled: true,
            disableLogSending: true,
          }),
        ],
      });

      sdk.start();
      log("OpenTelemetry SDK started with auto-instrumentation");

      initializeHttpMetrics();

      process.on("SIGTERM", () => {
        const shutdownTimeout = setTimeout(() => {
          err("SDK shutdown timed out, forcing exit");
          process.exit(1);
        }, 5000);

        sdk
          ?.shutdown()
          .then(() => {
            clearTimeout(shutdownTimeout);
            log("SDK shut down successfully");
            setTimeout(() => process.exit(0), 1000);
          })
          .catch((error) => {
            clearTimeout(shutdownTimeout);
            err("Error shutting down SDK", error);
            process.exit(1);
          });
      });
    } catch (error) {
      err("Error initializing OpenTelemetry SDK:", error);
    }
  } else {
    log("OpenTelemetry instrumentation is disabled");
  }

  if (INSTRUMENTATION_ENABLED) {
    if (!httpRequestCounter || !httpResponseTimeHistogram) {
      err("HTTP metrics not properly initialized");
    } else {
      log("HTTP metrics initialized successfully");
    }
  }

  isInitialized = true;
}

initializeOpenTelemetry().catch(console.error);

export const otelSDK = sdk;

export function getMeter(): Meter | undefined {
  return meter;
}

export function recordHttpRequest(method: string, route: string) {
  if (INSTRUMENTATION_ENABLED) {
    if (httpRequestCounter) {
      httpRequestCounter.add(1, { method, route });
      debug(`Recorded HTTP request: method=${method}, route=${route}`);
    } else {
      err("HTTP request counter not initialized");
    }
  } else {
    warn(`Skipped recording HTTP request: instrumentation disabled`);
    warn("ENABLE_OPENTELEMETRY env var:", Bun.env["ENABLE_OPENTELEMETRY"]);
    warn("INSTRUMENTATION_ENABLED:", INSTRUMENTATION_ENABLED);
  }
}

export function recordHttpResponseTime(duration: number) {
  if (INSTRUMENTATION_ENABLED && isInitialized && httpResponseTimeHistogram) {
    const activeContext = context.active();
    const span = trace.getSpan(activeContext);
    const traceId = span?.spanContext().traceId;
    httpResponseTimeHistogram.record(duration / 1000, { traceId });
  }
}
