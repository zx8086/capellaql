// src/telemetry/profiling-metrics.ts

import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("authentication-service-profiling");

const profilingSessionsCounter = meter.createCounter("profiling.sessions.total", {
  description: "Total number of profiling sessions started",
  unit: "sessions",
});

const profilingSessionDurationHistogram = meter.createHistogram("profiling.session.duration", {
  description: "Duration of profiling sessions in seconds",
  unit: "s",
});

const profilingOverheadGauge = meter.createObservableGauge("profiling.overhead.percent", {
  description: "Current profiling overhead as percentage of baseline CPU",
  unit: "%",
});

const profilingQueueLengthGauge = meter.createObservableGauge("profiling.queue.length", {
  description: "Number of profiling requests waiting in queue",
  unit: "requests",
});

const profilingStorageUsageGauge = meter.createObservableGauge("profiling.storage.usage_mb", {
  description: "Disk space used by profiling data in megabytes",
  unit: "MB",
});

const profilingStorageQuotaGauge = meter.createObservableGauge("profiling.storage.quota_percent", {
  description: "Storage usage as percentage of quota",
  unit: "%",
});

const slaViolationsCounter = meter.createCounter("profiling.sla.violations.total", {
  description: "Total number of SLA violations detected",
  unit: "violations",
});

const slaViolationThrottledCounter = meter.createCounter("profiling.sla.violations.throttled", {
  description: "Number of SLA violations that did not trigger profiling due to throttling",
  unit: "violations",
});

export function recordProfilingSessionStart(endpoint: string, reason: string): void {
  profilingSessionsCounter.add(1, {
    endpoint,
    reason,
  });
}

export function recordProfilingSessionDuration(
  endpoint: string,
  reason: string,
  durationSeconds: number
): void {
  profilingSessionDurationHistogram.record(durationSeconds, {
    endpoint,
    reason,
  });
}

export function recordSlaViolation(
  endpoint: string,
  p95: number,
  p99: number,
  triggered: boolean
): void {
  slaViolationsCounter.add(1, {
    endpoint,
    triggered: triggered.toString(),
  });

  if (!triggered) {
    slaViolationThrottledCounter.add(1, {
      endpoint,
    });
  }
}

export function registerProfilingObservables(
  getOverheadMetrics: () => {
    overheadPercent: number;
  },
  getQueueStats: () => {
    queueLength: number;
    storageSizeMb: number;
    storageQuotaMb: number;
    storageUsagePercent: number;
  }
): void {
  profilingOverheadGauge.addCallback((observableResult) => {
    const metrics = getOverheadMetrics();
    observableResult.observe(metrics.overheadPercent);
  });

  profilingQueueLengthGauge.addCallback((observableResult) => {
    const stats = getQueueStats();
    observableResult.observe(stats.queueLength);
  });

  profilingStorageUsageGauge.addCallback((observableResult) => {
    const stats = getQueueStats();
    observableResult.observe(stats.storageSizeMb);
  });

  profilingStorageQuotaGauge.addCallback((observableResult) => {
    const stats = getQueueStats();
    observableResult.observe(stats.storageUsagePercent);
  });
}
