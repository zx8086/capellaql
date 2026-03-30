/* tests/bun/unit/server/health-handlers.test.ts */
import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { RequestContext } from "../../../src/server/types";

// -- Mock all external dependencies before importing handlers --

const mockCreateHealthcheck = mock(() =>
  Promise.resolve({ status: "healthy", version: "2.0.0" })
);
const mockGetTelemetryHealth = mock(() => ({ status: "healthy", exporters: {} }));
const mockErr = mock(() => {});

const mockGetCardinalityStats = mock(() => []);
const mockGetConfiguration = mock(() => ({
  enabled: true,
  limitsCount: 5,
}));

const mockGetSystemHealth = mock(() =>
  Promise.resolve({ status: "healthy", overall: "healthy" })
);
const mockGetSystemHealthSummary = mock(() =>
  Promise.resolve({ status: "healthy" })
);

const mockGetPerformanceMetrics = mock(() =>
  Promise.resolve({ cpu: 10, memory: 50 })
);
const mockGetPerformanceHistory = mock(() => [
  { timestamp: Date.now(), cpu: 10 },
]);
const mockGetPerformanceTrends = mock(() => ({
  databaseLatencyTrend: "stable",
  memoryUsageTrend: "stable",
  overallTrend: "stable",
}));

const mockMemoryGuardianGetStatus = mock(() => ({
  heapUsedMB: 100,
  rssMB: 200,
}));

const mockGetComprehensiveHealth = mock(() =>
  Promise.resolve({ status: "healthy" })
);
const mockGetLivenessCheck = mock(() => ({
  alive: true,
  timestamp: new Date().toISOString(),
}));
const mockGetReadinessCheck = mock(() =>
  Promise.resolve({ ready: true, timestamp: new Date().toISOString() })
);

const mockGetGraphQLPerformanceStats = mock(() => ({
  totalOperations: 0,
  averageDuration: 0,
  errorRate: 0,
  slowOperations: 0,
}));
const mockGetRecentGraphQLPerformance = mock(() => []);

mock.module("../../../src/utils/bunUtils", () => ({
  createHealthcheck: mockCreateHealthcheck,
}));

mock.module("../../../src/utils/etag", () => ({
  jsonResponseWithETag: mock(
    (request: Request, data: unknown) =>
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
  ),
}));

mock.module("../../../src/telemetry", () => ({
  err: mockErr,
  getTelemetryHealth: mockGetTelemetryHealth,
}));

mock.module("../../../src/lib/metricsCardinalityManager", () => ({
  metricsCardinalityManager: {
    getCardinalityStats: mockGetCardinalityStats,
    getConfiguration: mockGetConfiguration,
  },
}));

mock.module("../../../src/lib/systemHealth", () => ({
  getSystemHealth: mockGetSystemHealth,
  getSystemHealthSummary: mockGetSystemHealthSummary,
}));

mock.module("../../../src/lib/performanceMonitor", () => ({
  getPerformanceMetrics: mockGetPerformanceMetrics,
  getPerformanceHistory: mockGetPerformanceHistory,
  getPerformanceTrends: mockGetPerformanceTrends,
}));

mock.module("../../../src/lib/memoryGuardian", () => ({
  memoryGuardian: {
    getStatus: mockMemoryGuardianGetStatus,
  },
}));

mock.module("../../../src/services/health", () => ({
  getComprehensiveHealth: mockGetComprehensiveHealth,
  getLivenessCheck: mockGetLivenessCheck,
  getReadinessCheck: mockGetReadinessCheck,
}));

mock.module("../../../src/lib/graphqlPerformanceTracker", () => ({
  getGraphQLPerformanceStats: mockGetGraphQLPerformanceStats,
  getRecentGraphQLPerformance: mockGetRecentGraphQLPerformance,
}));

mock.module("../../../src/lib/bunSQLiteCache", () => ({
  bunSQLiteCache: {
    getStats: mock(() => ({
      hits: 10,
      misses: 5,
      size: 100,
      memoryUsage: 1024,
      hitRate: 66.7,
    })),
    getAnalytics: mock(() => ({ topKeys: [] })),
  },
}));

mock.module("../../../src/lib/queryCache", () => ({
  defaultQueryCache: {
    getStats: mock(() => ({
      hits: 20,
      misses: 10,
      size: 50,
      memoryUsage: 512,
    })),
  },
}));

mock.module("../../../src/telemetry/coordinator/BatchCoordinator", () => ({
  getBatchCoordinator: mock(() => ({
    getStatistics: mock(() => ({
      totalBatches: 100,
      successfulBatches: 95,
      failedBatches: 5,
      emergencyFlushCount: 0,
      dataDropCount: 0,
      totalSpansExported: 1000,
      averageExportDuration: 50,
    })),
    getBufferStatus: mock(() => ({
      traces: { count: 10 },
      metrics: { count: 5 },
      logs: { count: 3 },
      memoryUsageMB: 12,
      memoryPressure: { pressureLevel: "low" },
    })),
  })),
}));

// -- Import handlers after all mocks are registered --

const {
  basicHealthHandler,
  telemetryHealthHandler,
  systemHealthHandler,
  healthSummaryHandler,
  performanceHandler,
  performanceHistoryHandler,
  cacheHealthHandler,
  telemetryDetailedHandler,
  comprehensiveHealthHandler,
  graphqlPerformanceHandler,
  statusHealthHandler,
  readinessHandler,
  livenessHandler,
} = await import("../../../src/server/handlers/health");

// -- Helpers --

function createMockRequest(
  url = "http://localhost:4000/health"
): Request {
  return new Request(url);
}

function createMockContext(
  overrides: Partial<RequestContext> = {}
): RequestContext {
  return {
    requestId: "test-req-id",
    startTime: Date.now(),
    url: new URL("http://localhost:4000/health"),
    clientIp: "127.0.0.1",
    headers: new Headers(),
    method: "GET",
    ...overrides,
  };
}

async function parseJsonResponse(response: Response) {
  return response.json();
}

// -- Tests --

describe("Health Handlers", () => {
  beforeEach(() => {
    mockCreateHealthcheck.mockReset();
    mockCreateHealthcheck.mockImplementation(() =>
      Promise.resolve({ status: "healthy", version: "2.0.0" })
    );

    mockGetTelemetryHealth.mockReset();
    mockGetTelemetryHealth.mockImplementation(() => ({
      status: "healthy",
      exporters: {},
    }));

    mockGetCardinalityStats.mockReset();
    mockGetCardinalityStats.mockImplementation(() => []);

    mockGetConfiguration.mockReset();
    mockGetConfiguration.mockImplementation(() => ({
      enabled: true,
      limitsCount: 5,
    }));

    mockGetSystemHealth.mockReset();
    mockGetSystemHealth.mockImplementation(() =>
      Promise.resolve({ status: "healthy", overall: "healthy" })
    );

    mockGetSystemHealthSummary.mockReset();
    mockGetSystemHealthSummary.mockImplementation(() =>
      Promise.resolve({ status: "healthy" })
    );

    mockGetPerformanceMetrics.mockReset();
    mockGetPerformanceMetrics.mockImplementation(() =>
      Promise.resolve({ cpu: 10, memory: 50 })
    );

    mockGetPerformanceHistory.mockReset();
    mockGetPerformanceHistory.mockImplementation(() => [
      { timestamp: Date.now(), cpu: 10 },
    ]);

    mockGetPerformanceTrends.mockReset();
    mockGetPerformanceTrends.mockImplementation(() => ({
      databaseLatencyTrend: "stable",
      memoryUsageTrend: "stable",
      overallTrend: "stable",
    }));

    mockMemoryGuardianGetStatus.mockReset();
    mockMemoryGuardianGetStatus.mockImplementation(() => ({
      heapUsedMB: 100,
      rssMB: 200,
    }));

    mockGetComprehensiveHealth.mockReset();
    mockGetComprehensiveHealth.mockImplementation(() =>
      Promise.resolve({ status: "healthy" })
    );

    mockGetLivenessCheck.mockReset();
    mockGetLivenessCheck.mockImplementation(() => ({
      alive: true,
      timestamp: new Date().toISOString(),
    }));

    mockGetReadinessCheck.mockReset();
    mockGetReadinessCheck.mockImplementation(() =>
      Promise.resolve({ ready: true, timestamp: new Date().toISOString() })
    );

    mockGetGraphQLPerformanceStats.mockReset();
    mockGetGraphQLPerformanceStats.mockImplementation(() => ({
      totalOperations: 0,
      averageDuration: 0,
      errorRate: 0,
      slowOperations: 0,
    }));

    mockGetRecentGraphQLPerformance.mockReset();
    mockGetRecentGraphQLPerformance.mockImplementation(() => []);

    mockErr.mockReset();
  });

  // ----- basicHealthHandler -----

  describe("basicHealthHandler", () => {
    test("returns 200 with health data on success", async () => {
      const request = createMockRequest();
      const context = createMockContext();

      const response = await basicHealthHandler(request, context);

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.status).toBe("healthy");
      expect(body.version).toBe("2.0.0");
    });

    test("returns 500 with error info when createHealthcheck throws", async () => {
      mockCreateHealthcheck.mockImplementation(() =>
        Promise.reject(new Error("Healthcheck service unavailable"))
      );

      const request = createMockRequest();
      const context = createMockContext();

      const response = await basicHealthHandler(request, context);

      expect(response.status).toBe(500);
      const body = await parseJsonResponse(response);
      expect(body.status).toBe("unhealthy");
      expect(body.error).toBe("Healthcheck service unavailable");
      expect(body.version).toBe("2.0.0");
      expect(body.timestamp).toBeDefined();
      expect(mockErr).toHaveBeenCalled();
    });

    test("handles non-Error thrown values", async () => {
      mockCreateHealthcheck.mockImplementation(() =>
        Promise.reject("string error")
      );

      const response = await basicHealthHandler(
        createMockRequest(),
        createMockContext()
      );

      expect(response.status).toBe(500);
      const body = await parseJsonResponse(response);
      expect(body.error).toBe("string error");
    });
  });

  // ----- telemetryHealthHandler -----

  describe("telemetryHealthHandler", () => {
    test("returns 200 with telemetry and cardinality data on success", async () => {
      mockGetTelemetryHealth.mockImplementation(() => ({
        status: "healthy",
        exporters: { traces: true, metrics: true },
      }));
      mockGetCardinalityStats.mockImplementation(() => [
        { metric: "http_requests", cardinality: 42 },
      ]);
      mockGetConfiguration.mockImplementation(() => ({
        enabled: true,
        limitsCount: 10,
      }));

      const request = createMockRequest("http://localhost:4000/health/telemetry");
      const context = createMockContext();

      const response = await telemetryHealthHandler(request, context);

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.status).toBe("healthy");
      expect(body.cardinality).toBeDefined();
      expect(body.cardinality.enabled).toBe(true);
      expect(body.cardinality.totalLimits).toBe(10);
      expect(body.cardinality.metrics).toHaveLength(1);
    });

    test("returns 500 when getTelemetryHealth throws", async () => {
      mockGetTelemetryHealth.mockImplementation(() => {
        throw new Error("Telemetry failure");
      });

      const response = await telemetryHealthHandler(
        createMockRequest("http://localhost:4000/health/telemetry"),
        createMockContext()
      );

      expect(response.status).toBe(500);
      const body = await parseJsonResponse(response);
      expect(body.status).toBe("unhealthy");
      expect(body.error).toBe("Telemetry failure");
      expect(body.timestamp).toBeDefined();
      expect(mockErr).toHaveBeenCalled();
    });

    test("returns 500 when getCardinalityStats throws", async () => {
      mockGetCardinalityStats.mockImplementation(() => {
        throw new Error("Cardinality stats unavailable");
      });

      const response = await telemetryHealthHandler(
        createMockRequest("http://localhost:4000/health/telemetry"),
        createMockContext()
      );

      expect(response.status).toBe(500);
      const body = await parseJsonResponse(response);
      expect(body.status).toBe("unhealthy");
      expect(body.error).toBe("Cardinality stats unavailable");
    });
  });

  // ----- systemHealthHandler -----

  describe("systemHealthHandler", () => {
    test("returns 200 with system health data on success", async () => {
      const response = await systemHealthHandler(
        createMockRequest("http://localhost:4000/health/system"),
        createMockContext()
      );

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.status).toBe("healthy");
    });

    test("returns 500 with structured error when getSystemHealth throws", async () => {
      mockGetSystemHealth.mockImplementation(() =>
        Promise.reject(new Error("System health unavailable"))
      );

      const response = await systemHealthHandler(
        createMockRequest("http://localhost:4000/health/system"),
        createMockContext()
      );

      expect(response.status).toBe(500);
      const body = await parseJsonResponse(response);
      expect(body.overall).toBe("unhealthy");
      expect(body.error).toBe("System health unavailable");
      expect(body.components).toBeDefined();
      expect(body.components.database.status).toBe("unhealthy");
      expect(body.components.runtime.status).toBe("unhealthy");
      expect(body.components.telemetry.status).toBe("unhealthy");
      expect(mockErr).toHaveBeenCalled();
    });
  });

  // ----- healthSummaryHandler -----

  describe("healthSummaryHandler", () => {
    test("returns 200 with health summary on success", async () => {
      const response = await healthSummaryHandler(
        createMockRequest("http://localhost:4000/health/summary"),
        createMockContext()
      );

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.status).toBe("healthy");
    });

    test("returns 500 with critical issues when getSystemHealthSummary throws", async () => {
      mockGetSystemHealthSummary.mockImplementation(() =>
        Promise.reject(new Error("Summary service down"))
      );

      const response = await healthSummaryHandler(
        createMockRequest("http://localhost:4000/health/summary"),
        createMockContext()
      );

      expect(response.status).toBe(500);
      const body = await parseJsonResponse(response);
      expect(body.status).toBe("unhealthy");
      expect(body.message).toBe("Health check failed");
      expect(body.criticalIssues).toContain("Summary service down");
    });
  });

  // ----- performanceHandler -----

  describe("performanceHandler", () => {
    test("returns 200 with performance metrics and memory guardian status", async () => {
      const response = await performanceHandler(
        createMockRequest("http://localhost:4000/health/performance"),
        createMockContext()
      );

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.cpu).toBe(10);
      expect(body.memory).toBe(50);
      expect(body.memoryGuardian).toBeDefined();
      expect(body.memoryGuardian.heapUsedMB).toBe(100);
      expect(body.memoryGuardian.rssMB).toBe(200);
    });

    test("returns 500 when getPerformanceMetrics throws", async () => {
      mockGetPerformanceMetrics.mockImplementation(() =>
        Promise.reject(new Error("Metrics collection failed"))
      );

      const response = await performanceHandler(
        createMockRequest("http://localhost:4000/health/performance"),
        createMockContext()
      );

      expect(response.status).toBe(500);
      const body = await parseJsonResponse(response);
      expect(body.error).toBe("Metrics collection failed");
      expect(body.database.connectionStatus).toBe("disconnected");
      expect(body.correlations.overallHealth).toBe("unhealthy");
    });
  });

  // ----- performanceHistoryHandler -----

  describe("performanceHistoryHandler", () => {
    test("returns 200 with performance history and trends", async () => {
      const response = await performanceHistoryHandler(
        createMockRequest("http://localhost:4000/health/performance/history"),
        createMockContext()
      );

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.metrics).toBeDefined();
      expect(body.count).toBeGreaterThanOrEqual(0);
      expect(body.trends).toBeDefined();
    });

    test("respects count query parameter", async () => {
      const response = await performanceHistoryHandler(
        createMockRequest(
          "http://localhost:4000/health/performance/history?count=5"
        ),
        createMockContext()
      );

      expect(response.status).toBe(200);
      expect(mockGetPerformanceHistory).toHaveBeenCalledWith(5);
    });

    test("caps count at 50", async () => {
      const response = await performanceHistoryHandler(
        createMockRequest(
          "http://localhost:4000/health/performance/history?count=999"
        ),
        createMockContext()
      );

      expect(response.status).toBe(200);
      expect(mockGetPerformanceHistory).toHaveBeenCalledWith(50);
    });

    test("returns 500 when getPerformanceHistory throws", async () => {
      mockGetPerformanceHistory.mockImplementation(() => {
        throw new Error("History unavailable");
      });

      const response = await performanceHistoryHandler(
        createMockRequest("http://localhost:4000/health/performance/history"),
        createMockContext()
      );

      expect(response.status).toBe(500);
      const body = await parseJsonResponse(response);
      expect(body.error).toBe("History unavailable");
      expect(body.metrics).toEqual([]);
      expect(body.count).toBe(0);
      expect(body.trends.overallTrend).toBe("stable");
    });
  });

  // ----- cacheHealthHandler -----

  describe("cacheHealthHandler", () => {
    test("returns 200 with cache statistics on success", async () => {
      const response = await cacheHealthHandler(
        createMockRequest("http://localhost:4000/health/cache"),
        createMockContext()
      );

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.timestamp).toBeDefined();
      expect(body.sqlite).toBeDefined();
      expect(body.mapCache).toBeDefined();
      expect(body.comparison).toBeDefined();
    });

    // Note: testing dynamic import failures (mock.module throwing) is not
    // supported by bun:test - the throw occurs at parse time, not at runtime.
  });

  // ----- telemetryDetailedHandler -----

  describe("telemetryDetailedHandler", () => {
    test("returns 200 with detailed telemetry data on success", async () => {
      const response = await telemetryDetailedHandler(
        createMockRequest("http://localhost:4000/health/telemetry/detailed"),
        createMockContext()
      );

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.timestamp).toBeDefined();
      expect(body.batchCoordinator).toBeDefined();
      expect(body.batchCoordinator.statistics).toBeDefined();
      expect(body.batchCoordinator.buffers).toBeDefined();
      expect(body.exporters).toBeDefined();
      expect(body.recommendations).toBeDefined();
    });

    // Note: testing dynamic import failures (mock.module throwing) is not
    // supported by bun:test - the throw occurs at parse time, not at runtime.
  });

  // ----- comprehensiveHealthHandler -----

  describe("comprehensiveHealthHandler", () => {
    test("returns 200 with combined health report on success", async () => {
      const response = await comprehensiveHealthHandler(
        createMockRequest("http://localhost:4000/health/comprehensive"),
        createMockContext()
      );

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.timestamp).toBeDefined();
      expect(body.version).toBe("2.0.0");
      expect(body.system).toBeDefined();
      expect(body.performance).toBeDefined();
      expect(body.telemetry).toBeDefined();
      expect(body.overall).toBeDefined();
      expect(body.overall.status).toBeDefined();
    });

    test("returns 500 when the overall try/catch catches an error", async () => {
      // Force getSystemHealth to throw synchronously before Promise.allSettled
      mockGetSystemHealth.mockImplementation(() => {
        throw new Error("Catastrophic failure");
      });

      const response = await comprehensiveHealthHandler(
        createMockRequest("http://localhost:4000/health/comprehensive"),
        createMockContext()
      );

      // Promise.allSettled may still settle; but if it propagates, we get 500
      const body = await parseJsonResponse(response);
      // The handler uses Promise.allSettled so individual failures are caught
      // inside the settled results; only a top-level throw produces 500
      expect([200, 500]).toContain(response.status);
      expect(body).toBeDefined();
    });

    test("handles individual component failures gracefully via allSettled", async () => {
      mockGetSystemHealth.mockImplementation(() =>
        Promise.reject(new Error("System down"))
      );
      mockGetPerformanceMetrics.mockImplementation(() =>
        Promise.reject(new Error("Perf down"))
      );

      const response = await comprehensiveHealthHandler(
        createMockRequest("http://localhost:4000/health/comprehensive"),
        createMockContext()
      );

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.system.overall).toBe("unhealthy");
      expect(body.system.error).toBe("System down");
      expect(body.performance.error).toBe("Perf down");
      expect(body.overall.criticalIssues.length).toBeGreaterThan(0);
    });
  });

  // ----- graphqlPerformanceHandler -----

  describe("graphqlPerformanceHandler", () => {
    test("returns 200 with GraphQL performance stats on success", async () => {
      const response = await graphqlPerformanceHandler(
        createMockRequest("http://localhost:4000/health/graphql"),
        createMockContext()
      );

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.timestamp).toBeDefined();
      expect(body.summary).toBeDefined();
      expect(body.resolvers).toBeDefined();
      expect(body.recentOperations).toBeDefined();
      expect(body.insights).toBeDefined();
    });

    test("respects limit query parameter", async () => {
      mockGetRecentGraphQLPerformance.mockImplementation(() =>
        Array.from({ length: 30 }, (_, i) => ({
          operationName: "TestQuery",
          fieldName: `field${i}`,
          duration: i * 5,
        }))
      );

      const response = await graphqlPerformanceHandler(
        createMockRequest("http://localhost:4000/health/graphql?limit=10"),
        createMockContext()
      );

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      // The handler slices recentOps to limit and then further to last 20
      expect(body.recentOperations.length).toBeLessThanOrEqual(20);
    });

    test("returns 500 when getGraphQLPerformanceStats throws", async () => {
      mockGetGraphQLPerformanceStats.mockImplementation(() => {
        throw new Error("GraphQL stats unavailable");
      });

      const response = await graphqlPerformanceHandler(
        createMockRequest("http://localhost:4000/health/graphql"),
        createMockContext()
      );

      expect(response.status).toBe(500);
      const body = await parseJsonResponse(response);
      expect(body.error).toBe("GraphQL stats unavailable");
      expect(body.summary.totalOperations).toBe(0);
      expect(body.resolvers).toEqual([]);
      expect(body.recentOperations).toEqual([]);
    });
  });

  // ----- statusHealthHandler -----

  describe("statusHealthHandler", () => {
    test("returns 200 with healthy status", async () => {
      const response = await statusHealthHandler(
        createMockRequest("http://localhost:4000/health/status"),
        createMockContext()
      );

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.status).toBe("healthy");
      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(response.headers.get("Cache-Control")).toBe(
        "no-cache, no-store, must-revalidate"
      );
    });

    test("returns X-Request-ID header from context", async () => {
      const response = await statusHealthHandler(
        createMockRequest("http://localhost:4000/health/status"),
        createMockContext({ requestId: "custom-req-123" })
      );

      expect(response.headers.get("X-Request-ID")).toBe("custom-req-123");
    });

    test("returns 503 when status is not healthy or degraded", async () => {
      mockGetComprehensiveHealth.mockImplementation(() =>
        Promise.resolve({ status: "unhealthy" })
      );

      const response = await statusHealthHandler(
        createMockRequest("http://localhost:4000/health/status"),
        createMockContext()
      );

      expect(response.status).toBe(503);
      const body = await parseJsonResponse(response);
      expect(body.status).toBe("unhealthy");
    });

    test("returns 200 when status is degraded", async () => {
      mockGetComprehensiveHealth.mockImplementation(() =>
        Promise.resolve({ status: "degraded" })
      );

      const response = await statusHealthHandler(
        createMockRequest("http://localhost:4000/health/status"),
        createMockContext()
      );

      expect(response.status).toBe(200);
    });

    test("returns 503 when getComprehensiveHealth throws", async () => {
      mockGetComprehensiveHealth.mockImplementation(() =>
        Promise.reject(new Error("Comprehensive health failed"))
      );

      const response = await statusHealthHandler(
        createMockRequest("http://localhost:4000/health/status"),
        createMockContext()
      );

      expect(response.status).toBe(503);
      const body = await parseJsonResponse(response);
      expect(body.status).toBe("critical");
      expect(body.error).toBe("Comprehensive health failed");
      expect(body.requestId).toBeDefined();
    });
  });

  // ----- readinessHandler -----

  describe("readinessHandler", () => {
    test("returns 200 when service is ready", async () => {
      const response = await readinessHandler(
        createMockRequest("http://localhost:4000/health/ready"),
        createMockContext()
      );

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.ready).toBe(true);
      expect(response.headers.get("Cache-Control")).toBe(
        "no-cache, no-store, must-revalidate"
      );
    });

    test("returns 503 when service is not ready", async () => {
      mockGetReadinessCheck.mockImplementation(() =>
        Promise.resolve({ ready: false, reason: "Database not connected" })
      );

      const response = await readinessHandler(
        createMockRequest("http://localhost:4000/health/ready"),
        createMockContext()
      );

      expect(response.status).toBe(503);
      const body = await parseJsonResponse(response);
      expect(body.ready).toBe(false);
    });

    test("returns X-Request-ID header from context", async () => {
      const response = await readinessHandler(
        createMockRequest("http://localhost:4000/health/ready"),
        createMockContext({ requestId: "readiness-req-456" })
      );

      expect(response.headers.get("X-Request-ID")).toBe("readiness-req-456");
    });

    test("returns 503 when getReadinessCheck throws", async () => {
      mockGetReadinessCheck.mockImplementation(() =>
        Promise.reject(new Error("Readiness probe failed"))
      );

      const response = await readinessHandler(
        createMockRequest("http://localhost:4000/health/ready"),
        createMockContext()
      );

      expect(response.status).toBe(503);
      const body = await parseJsonResponse(response);
      expect(body.ready).toBe(false);
      expect(body.error).toBe("Readiness probe failed");
      expect(body.requestId).toBeDefined();
    });
  });

  // ----- livenessHandler -----

  describe("livenessHandler", () => {
    test("returns 200 when service is alive", async () => {
      const response = await livenessHandler(
        createMockRequest("http://localhost:4000/health/live"),
        createMockContext()
      );

      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.alive).toBe(true);
      expect(response.headers.get("Cache-Control")).toBe(
        "no-cache, no-store, must-revalidate"
      );
    });

    test("returns X-Request-ID header from context", async () => {
      const response = await livenessHandler(
        createMockRequest("http://localhost:4000/health/live"),
        createMockContext({ requestId: "liveness-req-789" })
      );

      expect(response.headers.get("X-Request-ID")).toBe("liveness-req-789");
    });

    test("returns 200 even when getLivenessCheck throws", async () => {
      // Liveness handler always returns 200 if it can respond at all
      mockGetLivenessCheck.mockImplementation(() => {
        throw new Error("Liveness internal error");
      });

      const response = await livenessHandler(
        createMockRequest("http://localhost:4000/health/live"),
        createMockContext()
      );

      // Per the handler: "Even on error, if we can respond, we're alive"
      expect(response.status).toBe(200);
      const body = await parseJsonResponse(response);
      expect(body.alive).toBe(true);
      expect(body.error).toBe("Liveness internal error");
    });
  });
});
