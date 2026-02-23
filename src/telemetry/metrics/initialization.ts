/* src/telemetry/metrics/initialization.ts */
// Meter and instrument creation per monitoring-updated.md line 37

import { type Counter, type Histogram, metrics, type UpDownCounter } from "@opentelemetry/api";
import { INSTRUMENT_DEFINITIONS } from "./instruments";

// ============================================================================
// Module State
// ============================================================================

let isInitialized = false;

// Instrument instances
const instruments: {
  counters: Map<string, Counter>;
  histograms: Map<string, Histogram>;
  upDownCounters: Map<string, UpDownCounter>;
} = {
  counters: new Map(),
  histograms: new Map(),
  upDownCounters: new Map(),
};

// ============================================================================
// Meter Names (per documented convention)
// ============================================================================

export const METER_NAMES = {
  http: "capellaql-http-metrics",
  graphql: "capellaql-graphql-metrics",
  database: "capellaql-database-metrics",
  cache: "capellaql-cache-metrics",
  circuitBreaker: "capellaql-circuit-breaker-metrics",
  process: "capellaql-process-metrics",
  gc: "capellaql-gc-metrics",
  telemetry: "capellaql-telemetry-metrics",
  errors: "capellaql-error-metrics",
  security: "capellaql-security-metrics",
} as const;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize all metric instruments per documented structure.
 * Called once during telemetry initialization.
 */
export function initializeMetrics(): void {
  if (isInitialized) {
    console.warn("Metrics system already initialized");
    return;
  }

  try {
    // Create meters for each domain
    const httpMeter = metrics.getMeter(METER_NAMES.http, "1.0.0");
    const graphqlMeter = metrics.getMeter(METER_NAMES.graphql, "1.0.0");
    const databaseMeter = metrics.getMeter(METER_NAMES.database, "1.0.0");
    const cacheMeter = metrics.getMeter(METER_NAMES.cache, "1.0.0");
    const circuitBreakerMeter = metrics.getMeter(METER_NAMES.circuitBreaker, "1.0.0");
    const _processMeter = metrics.getMeter(METER_NAMES.process, "1.0.0");
    const gcMeter = metrics.getMeter(METER_NAMES.gc, "1.0.0");
    const telemetryMeter = metrics.getMeter(METER_NAMES.telemetry, "1.0.0");
    const errorsMeter = metrics.getMeter(METER_NAMES.errors, "1.0.0");

    // HTTP Instruments
    createCounter(httpMeter, INSTRUMENT_DEFINITIONS.httpRequestsTotal);
    createHistogram(httpMeter, INSTRUMENT_DEFINITIONS.httpRequestDurationSeconds);
    createUpDownCounter(httpMeter, INSTRUMENT_DEFINITIONS.httpActiveRequests);

    // GraphQL Instruments
    createCounter(graphqlMeter, INSTRUMENT_DEFINITIONS.graphqlOperationsTotal);
    createHistogram(graphqlMeter, INSTRUMENT_DEFINITIONS.graphqlOperationDurationSeconds);
    createHistogram(graphqlMeter, INSTRUMENT_DEFINITIONS.graphqlResolverDurationSeconds);
    createCounter(graphqlMeter, INSTRUMENT_DEFINITIONS.graphqlErrorsTotal);

    // Database Instruments
    createCounter(databaseMeter, INSTRUMENT_DEFINITIONS.dbOperationsTotal);
    createHistogram(databaseMeter, INSTRUMENT_DEFINITIONS.dbOperationDurationSeconds);
    createUpDownCounter(databaseMeter, INSTRUMENT_DEFINITIONS.dbActiveConnections);

    // Cache Instruments
    createCounter(cacheMeter, INSTRUMENT_DEFINITIONS.cacheOperationsTotal);
    createCounter(cacheMeter, INSTRUMENT_DEFINITIONS.cacheHitsTotal);
    createCounter(cacheMeter, INSTRUMENT_DEFINITIONS.cacheMissesTotal);

    // Circuit Breaker Instruments
    createCounter(circuitBreakerMeter, INSTRUMENT_DEFINITIONS.circuitBreakerStateChangesTotal);
    createCounter(circuitBreakerMeter, INSTRUMENT_DEFINITIONS.circuitBreakerRequestsTotal);
    createCounter(circuitBreakerMeter, INSTRUMENT_DEFINITIONS.circuitBreakerRejectedTotal);

    // GC Instruments
    createCounter(gcMeter, INSTRUMENT_DEFINITIONS.gcCollectionsTotal);
    createHistogram(gcMeter, INSTRUMENT_DEFINITIONS.gcDurationSeconds);

    // Telemetry Export Instruments
    createCounter(telemetryMeter, INSTRUMENT_DEFINITIONS.telemetryExportsTotal);
    createCounter(telemetryMeter, INSTRUMENT_DEFINITIONS.telemetryExportFailuresTotal);
    createHistogram(telemetryMeter, INSTRUMENT_DEFINITIONS.telemetryExportDurationSeconds);

    // Error Instruments
    createCounter(errorsMeter, INSTRUMENT_DEFINITIONS.errorsTotal);
    createCounter(errorsMeter, INSTRUMENT_DEFINITIONS.errorsByTypeTotal);

    // Security Instruments
    createCounter(errorsMeter, INSTRUMENT_DEFINITIONS.securityEventsTotal);

    isInitialized = true;
  } catch (error) {
    console.error("Error initializing metrics system:", error);
    throw error;
  }
}

// ============================================================================
// Instrument Creators
// ============================================================================

function createCounter(
  meter: ReturnType<typeof metrics.getMeter>,
  definition: { name: string; description: string; unit: string }
): void {
  const counter = meter.createCounter(definition.name, {
    description: definition.description,
    unit: definition.unit,
  });
  instruments.counters.set(definition.name, counter);
}

function createHistogram(
  meter: ReturnType<typeof metrics.getMeter>,
  definition: { name: string; description: string; unit: string }
): void {
  const histogram = meter.createHistogram(definition.name, {
    description: definition.description,
    unit: definition.unit,
  });
  instruments.histograms.set(definition.name, histogram);
}

function createUpDownCounter(
  meter: ReturnType<typeof metrics.getMeter>,
  definition: { name: string; description: string; unit: string }
): void {
  const upDownCounter = meter.createUpDownCounter(definition.name, {
    description: definition.description,
    unit: definition.unit,
  });
  instruments.upDownCounters.set(definition.name, upDownCounter);
}

// ============================================================================
// Instrument Accessors
// ============================================================================

export function getCounter(name: string): Counter | undefined {
  return instruments.counters.get(name);
}

export function getHistogram(name: string): Histogram | undefined {
  return instruments.histograms.get(name);
}

export function getUpDownCounter(name: string): UpDownCounter | undefined {
  return instruments.upDownCounters.get(name);
}

// ============================================================================
// Status
// ============================================================================

export function isMetricsInitialized(): boolean {
  return isInitialized;
}

export function getMetricsInitializationStatus(): {
  initialized: boolean;
  counters: number;
  histograms: number;
  upDownCounters: number;
  total: number;
} {
  return {
    initialized: isInitialized,
    counters: instruments.counters.size,
    histograms: instruments.histograms.size,
    upDownCounters: instruments.upDownCounters.size,
    total: instruments.counters.size + instruments.histograms.size + instruments.upDownCounters.size,
  };
}

/**
 * Reset metrics (for testing)
 */
export function resetMetrics(): void {
  instruments.counters.clear();
  instruments.histograms.clear();
  instruments.upDownCounters.clear();
  isInitialized = false;
}
