# Testing Implementation Guide
## Testing Patterns for CapellaQL

**Purpose:** Comprehensive testing strategy for the CapellaQL GraphQL service
**Stack:** Bun (test runner), Playwright (E2E), K6 (performance)

---

## Table of Contents

- [1. Testing Architecture Overview](#1-testing-architecture-overview)
- [2. Live Backend Testing Strategy](#2-live-backend-testing-strategy)
- [3. Test Directory Structure](#3-test-directory-structure)
- [4. Bun Unit Tests — Configuration](#4-bun-unit-tests--configuration)
- [5. Bun Unit Tests — Domain Organization](#5-bun-unit-tests--domain-organization)
- [6. Bun Unit Tests — Best Practices](#6-bun-unit-tests--best-practices)
- [7. Integration Tests — Real Dependencies](#7-integration-tests--real-dependencies)
- [8. Playwright E2E Tests](#8-playwright-e2e-tests)
- [9. Playwright E2E Tests — Configuration](#9-playwright-e2e-tests--configuration)
- [10. K6 Performance Tests — Structure](#10-k6-performance-tests--structure)
- [11. K6 Performance Tests — Configuration](#11-k6-performance-tests--configuration)
- [12. K6 Performance Tests — Best Practices](#12-k6-performance-tests--best-practices)
- [13. Chaos Engineering Tests](#13-chaos-engineering-tests)
- [14. Mutation Testing with StrykerJS](#14-mutation-testing-with-strykerjs)
- [15. Test Coverage Strategy](#15-test-coverage-strategy)
- [16. CI/CD Integration](#16-cicd-integration)
- [17. Test Utilities and Helpers](#17-test-utilities-and-helpers)
- [18. Environment Configuration](#18-environment-configuration)
- [19. Performance Baselines](#19-performance-baselines)
- [20. Troubleshooting Guide](#20-troubleshooting-guide)
- [21. Migration from Jest/Vitest](#21-migration-from-jestvitest)
- [22. Checklist for New Projects](#22-checklist-for-new-projects)
- [23. Platform QA Components Compliance](#23-platform-qa-components-compliance)

---

## 1. Testing Architecture Overview

The testing strategy follows a **three-tier approach** with emphasis on live backends.

```
┌─────────────────────────────────────────────────────────────────┐
│  Testing Architecture (3 Tiers)                                  │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Unit Tests   │  │ Integration  │  │   E2E Tests  │          │
│  │ (Bun native) │  │ (Live deps)  │  │ (Playwright) │          │
│  │ tests/bun/   │  │ tests/bun/   │  │ tests/       │          │
│  │ unit/        │  │ integration/ │  │ playwright/  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │            Performance Testing (K6)                       │   │
│  │  smoke/ | load/ | stress/ | scenarios/                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Key Principles

- **Live backends** — Tests use real services (no mocks unless explicitly required)
- **Domain organization** — Tests organized by business domain, not file type
- **Parallel execution** — Optimized for concurrent test runs with proper isolation
- **Mutation resistance** — Every critical path has mutation-killing tests
- **Fast feedback** — Unit tests complete in <30 seconds
- **Comprehensive coverage** — Unit + Integration + E2E + Performance + Chaos + Mutation

---

## 2. Live Backend Testing Strategy

**ALL TESTS USE LIVE ENDPOINTS — NO MOCKS UNLESS EXPLICITLY STATED**

### Philosophy

```typescript
// AVOID: Traditional mocking approach
const mockCollection = { get: mock(() => ({ content: { id: "123" } })) };

// PREFER: Live backend testing
const { collection } = await getCouchbaseConnection();
const result = await collection.get("doc-id");
expect(result.content).toBeDefined();
```

### Benefits

| Benefit | Description |
|---------|-------------|
| **Real Integration** | Catches actual networking issues, serialization bugs, API changes |
| **Configuration Validation** | Tests verify real .env configuration works |
| **No Mock Maintenance** | No need to keep mocks in sync with API changes |
| **Confidence** | Tests validate actual production behavior |

### Automatic Curl Fallback

For networking issues (e.g., Bun fetch bugs with private IPs):

```typescript
// src/utils/bun-fetch-fallback.ts
import { execSync } from "child_process";

export async function fetchWithFallback(
  url: string,
  options?: RequestInit
): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (error) {
    // Transparent fallback to curl
    const curlCmd = buildCurlCommand(url, options);
    const output = execSync(curlCmd, { timeout: 3000 }).toString();
    return parseCurlResponse(output);
  }
}
```

**Usage in tests:**
```typescript
import { fetchWithFallback } from "../utils/bun-fetch-fallback";

test("Couchbase health endpoint reachable", async () => {
  const response = await fetchWithFallback(
    `${process.env.COUCHBASE_URL}/pools/default`
  );
  expect(response.ok).toBe(true);
});
```

### Graceful Skipping

```typescript
// tests/bun/shared/test-skip-conditions.ts
export async function skipIfServiceUnavailable(
  serviceName: string,
  url: string
) {
  try {
    const response = await fetchWithFallback(url, {
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) {
      test.skip(`${serviceName} unavailable at ${url}`);
    }
  } catch {
    test.skip(`${serviceName} unavailable at ${url}`);
  }
}
```

**Usage:**
```typescript
import { skipIfServiceUnavailable } from "../shared/test-skip-conditions";

describe("Couchbase integration", () => {
  beforeAll(async () => {
    await skipIfServiceUnavailable("Couchbase", process.env.COUCHBASE_URL!);
  });

  test("get document", async () => {
    // Test runs only if Couchbase is available
  });
});
```

---

## 3. Test Directory Structure

### Standard Layout

```
test/
├── bun/                    # Unit tests
│   ├── cache/              # Caching functionality (15 files)
│   ├── circuit-breaker/    # Circuit breaker patterns (5 files)
│   ├── config/             # Configuration management (9 files)
│   ├── couchbase/          # Couchbase database layer tests
│   ├── errors/             # Error handling tests (RFC 7807)
│   ├── handlers/           # HTTP request handlers (6 files)
│   ├── health/             # Health check endpoints (6 files)
│   ├── logging/            # Logging functionality (4 files)
│   ├── middleware/         # Request middleware
│   ├── mutation/           # Mutation-resistant tests (2 files)
│   ├── services/           # Service layer (8 files)
│   ├── shared/             # Shared utilities (2 files)
│   ├── telemetry/          # Observability (18 files)
│   ├── types/              # Type definitions (1 file)
│   └── utils/              # Utility functions (19 files)
├── chaos/                  # Chaos engineering (4 files)
│   ├── couchbase-failure.test.ts
│   ├── redis-failure.test.ts
│   ├── network-partition.test.ts
│   └── resource-exhaustion.test.ts
├── integration/            # Integration tests
│   ├── connection.test.ts
│   ├── circuit-breaker.integration.test.ts
│   └── redis-cache.integration.test.ts
├── playwright/             # E2E scenarios (4 files)
│   ├── consolidated-business.e2e.ts
│   ├── ci-safe.e2e.ts
│   ├── api-best-practices.e2e.ts
│   └── profiling.e2e.ts
├── k6/                     # Performance tests (Platform QA compatible)
│   ├── smoke/              # Quick validation (3 VUs)
│   │   ├── index.ts        # Platform entry point
│   │   └── *.ts
│   ├── load/               # Production simulation (50-100 VUs)
│   │   ├── index.ts        # Platform entry point
│   │   └── *.ts
│   ├── stress/             # Breaking point (100-200 VUs)
│   │   ├── index.ts        # Platform entry point
│   │   └── *.ts
│   ├── spike/              # Traffic burst simulation
│   │   ├── index.ts        # Platform entry point
│   │   └── spike-test.ts
│   ├── soak/               # Extended endurance (~3 hours)
│   │   ├── index.ts        # Platform entry point
│   │   └── soak-test.ts
│   ├── data/               # Test data loaders
│   ├── utils/              # Shared utilities (config, helpers, metrics)
│   └── scenarios/          # Business scenario tests
├── shared/                 # Test utilities
│   ├── test-consumers.ts   # Test user definitions
│   ├── test-skip-conditions.ts
│   └── test-utilities.ts
└── README.md
```

### Domain Organization Benefits

| Benefit | Description |
|---------|-------------|
| **Discoverability** | Find tests by domain: `tests/bun/cache/` |
| **Selective Testing** | Run domain tests: `bun test tests/bun/cache/` |
| **Cleaner Navigation** | Better IDE file tree organization |
| **Code Review** | Review tests by domain during PRs |
| **Maintainability** | Related tests grouped together |

---

## 4. Bun Unit Tests — Configuration

### bunfig.toml

```toml
[test]
# Execution
timeout = 5000                    # 5-second timeout for external API calls
bail = 0                          # Run all tests, don't stop on first failure

# Output
reporter = "spec"                 # Human-readable output (use "dots" for mutation testing)

# Coverage
coverage = true
coverageReporter = ["text", "json", "html"]
coverageThresholds = { line = 80, function = 80, branch = 80 }
coverageSkipTestFiles = true

# Performance
preload = ["./test/setup.ts"]     # Global test setup
concurrent = true                 # Enable parallel execution
```

### test/setup.ts — Global Setup

```typescript
// test/setup.ts
import { beforeAll, afterAll } from "bun:test";
import { enableFetchPolyfill } from "./shared/fetch-polyfill";

// Enable curl fallback for tests with remote IPs
enableFetchPolyfill();

beforeAll(() => {
  // Load test environment
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  
  // Redis test database (separate from production)
  process.env.REDIS_DB = "10";
  
  // Telemetry configuration
  process.env.TELEMETRY_MODE = "console";
});

afterAll(async () => {
  // Cleanup test data
  if (process.env.REDIS_URL) {
    const redis = await import("../src/cache/redis-client");
    await redis.default.flushDb();
    await redis.default.quit();
  }
});
```

### package.json Scripts

```json
{
  "scripts": {
    "test": "bun test",
    "test:bun": "bun test tests/bun/",
    "test:bun:watch": "bun test --watch tests/bun/",
    "test:bun:coverage": "bun test --coverage tests/bun/",
    "test:bun:coverage:ci": "bun test --coverage --coverage-reporter=json tests/bun/",
    "test:bun:concurrent": "bun test --concurrent tests/bun/",
    
    "test:integration": "bun test test/integration/",
    "test:chaos": "bun test test/chaos/",
    
    "test:e2e": "npx playwright test",
    "test:e2e:ui": "npx playwright test --ui",
    "test:e2e:headed": "npx playwright test --headed",
    
    "test:k6:quick": "bun run k6:smoke:health && bun run k6:smoke:tokens",
    "test:suite": "bun run test:bun && bun run test:e2e && bun run test:k6:quick",
    
    "test:mutation": "stryker run",
    "test:mutation:fresh": "rm -rf .stryker-tmp && stryker run",
    "test:mutation:dry": "stryker run --dryRun",
    
    "test:clean": "rm -rf coverage/ playwright-report/ test-results/ .stryker-tmp/"
  }
}
```

---

## 5. Bun Unit Tests — Domain Organization

### Example: Cache Domain Tests

```
tests/bun/cache/
├── cache-factory.test.ts                      # Factory pattern
├── cache-factory-errors.test.ts               # Error handling
├── cache-manager.test.ts                      # Manager operations
├── cache-manager-integration.test.ts          # Live Redis integration
├── cache-health-edge-cases.test.ts            # Edge cases
├── cache-stale-operations.test.ts             # Stale data handling
├── local-memory-cache.test.ts                 # In-memory implementation
├── local-memory-cache-maxentries.test.ts      # Size limits
├── shared-redis-cache.test.ts                 # Redis with live backend
├── shared-redis-cache-errors.test.ts          # Redis errors (uses mocks)
├── shared-redis-cache-operations.test.ts      # Redis operations
├── shared-redis-cache-stale.test.ts           # Redis stale handling
├── unified-cache-manager.test.ts              # Unified manager
└── unified-cache-manager-integration.test.ts  # Full integration
```

**Running cache tests:**
```bash
bun test tests/bun/cache/                        # All cache tests
bun test tests/bun/cache/cache-factory.test.ts  # Specific file
bun test --watch tests/bun/cache/                # Watch mode
```

### Example: Unit Test Directory

```
tests/bun/unit/
├── couchbase/
│   ├── circuit-breaker.test.ts         # Circuit breaker patterns
│   ├── errors.test.ts                  # Error classification (25+ types)
│   ├── kv-operations.test.ts           # Key-value operations
│   ├── query-executor.test.ts          # N1QL query execution
│   ├── repository.test.ts              # Repository pattern
│   └── transaction-handler.test.ts     # ACID transactions
├── config/
│   ├── application.test.ts             # Application config validation
│   ├── couchbase.test.ts               # Couchbase config validation
│   └── telemetry.test.ts               # Telemetry config validation
├── logging/
│   ├── pino-adapter.test.ts            # Pino adapter
│   ├── container.test.ts               # DI container
│   ├── logger-port.test.ts             # Logger interface
│   └── critical-lifecycle.test.ts      # Lifecycle logging
├── middleware/
│   ├── rateLimit.test.ts               # Rate limiting
│   ├── security.test.ts                # Security headers
│   ├── cors.test.ts                    # CORS handling
│   ├── backpressure.test.ts            # Backpressure
│   ├── methodValidation.test.ts        # HTTP method validation
│   └── deprecation.test.ts             # Deprecation warnings
└── telemetry/
    ├── telemetry-emitter.test.ts       # Dual emission
    ├── span-event-names.test.ts        # Span event constants
    ├── export-stats-tracker.test.ts    # Export tracking
    └── telemetry-circuit-breaker.test.ts # Per-signal breakers
```

### Naming Conventions

| Suffix | Purpose | Example |
|--------|---------|---------|
| `.test.ts` | Standard unit test | `circuit-breaker.test.ts` |
| `.integration.test.ts` | Integration with live deps | `connection.integration.test.ts` |
| `.mutation.test.ts` | Mutation-resistant tests | `circuit-breaker.mutation.test.ts` |
| `-errors.test.ts` | Error path coverage | `cache-factory-errors.test.ts` |
| `-edge-cases.test.ts` | Edge case scenarios | `cache-health-edge-cases.test.ts` |

---

## 6. Bun Unit Tests — Best Practices

### Test Structure Pattern

```typescript
// tests/bun/unit/couchbase/circuit-breaker.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  createCouchbaseCircuitBreaker,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from "../../../../src/lib/couchbase/circuit-breaker";

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000, // 1 second for faster tests
    });
  });

  describe("initial state", () => {
    test("starts in closed state", () => {
      expect(breaker.getState()).toBe("closed");
    });

    test("starts healthy", () => {
      expect(breaker.isHealthy()).toBe(true);
    });

    test("initial stats are zero", () => {
      const stats = breaker.getStats();
      expect(stats.state).toBe("closed");
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.totalOperations).toBe(0);
    });
  });

  describe("execute", () => {
    test("executes operation successfully", async () => {
      const result = await breaker.execute(async () => "success");
      expect(result).toBe("success");
    });

    test("propagates operation errors", async () => {
      await expect(
        breaker.execute(async () => {
          throw new Error("Operation failed");
        })
      ).rejects.toThrow("Operation failed");
    });
  });
});
```

### Parallel Execution Safety

```typescript
// ✅ GOOD: Functional equivalence (stable in parallel execution)
test("cached object has same properties", async () => {
  const original = { id: "123", username: "test" };
  await cache.set("key", original);
  const cached = await cache.get("key");

  expect(cached.id).toBe(original.id);
  expect(cached.username).toBe(original.username);
});

// ❌ BAD: Instance equality (fragile in concurrent tests)
test("cached object is same instance", async () => {
  const original = { id: "123", username: "test" };
  await cache.set("key", original);
  const cached = await cache.get("key");

  expect(cached).toBe(original); // Fails in parallel execution
});
```

### Redis Database Separation

```typescript
// test/setup.ts
beforeAll(() => {
  // Use separate Redis database for tests
  process.env.REDIS_DB = "10"; // DB 10 for tests, DB 0 for production
});

afterAll(async () => {
  // Safe to flush - only affects test database
  const redis = await import("../src/cache/redis-client");
  await redis.default.flushDb();
  await redis.default.quit();
});
```

### Timeout Configuration

```typescript
// For tests with external service calls
test("Couchbase fetches document", async () => {
  const { collection } = await getCouchbaseConnection();

  const result = await collection.get("test-doc-001", {
    timeout: 5000 // 5-second timeout
  });

  expect(result.content).toBeDefined();
}, { timeout: 6000 }); // Test timeout slightly higher than operation timeout
```

---

## 7. Integration Tests — Real Dependencies

### Couchbase Integration Test

```typescript
// test/integration/connection.test.ts
import { describe, test, expect, beforeAll } from "bun:test";
import { getCouchbaseConnection } from "../../src/lib/couchbase/connection-manager";
import { skipIfServiceUnavailable } from "../shared/test-skip-conditions";

describe("Couchbase Connection Integration", () => {
  beforeAll(async () => {
    const couchbaseUrl = process.env.COUCHBASE_URL;
    if (!couchbaseUrl) {
      throw new Error("COUCHBASE_URL not configured");
    }

    await skipIfServiceUnavailable("Couchbase", couchbaseUrl);
  });

  describe("Document Operations", () => {
    test("fetches existing document", async () => {
      const { collection } = await getCouchbaseConnection();
      const result = await collection.get("test-doc-001");

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.cas).toBeDefined();
    });

    test("returns DocumentNotFoundError for missing document", async () => {
      const { collection } = await getCouchbaseConnection();

      await expect(collection.get("non-existent-doc"))
        .rejects.toThrow();
    });

    test("handles connection errors gracefully", async () => {
      // Attempting to connect with invalid credentials should throw
      await expect(getCouchbaseConnection({
        connectionString: "couchbase://invalid-host:9999"
      })).rejects.toThrow();
    });
  });

  describe("Query Operations", () => {
    test("executes N1QL query", async () => {
      const { cluster } = await getCouchbaseConnection();
      const result = await cluster.query("SELECT 1 AS num");

      expect(result.rows).toBeDefined();
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].num).toBe(1);
    });
  });
});
```

### Redis Cache Integration Test

```typescript
// test/integration/redis-cache.integration.test.ts
import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { RedisCache } from "../../src/cache/redis-cache";
import { skipIfServiceUnavailable } from "../shared/test-skip-conditions";

describe("Redis Cache Integration", () => {
  let cache: RedisCache;

  beforeAll(async () => {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    await skipIfServiceUnavailable("Redis", redisUrl);
    
    cache = new RedisCache({ 
      url: redisUrl,
      db: 10 // Test database
    });
  });

  afterEach(async () => {
    // Clean up test data
    await cache.clear();
  });

  test("sets and gets values", async () => {
    await cache.set("test-key", { data: "value" });
    const result = await cache.get("test-key");

    expect(result).toEqual({ data: "value" });
  });

  test("respects TTL expiration", async () => {
    await cache.set("expire-key", "value", { ttl: 1 }); // 1 second TTL
    
    const immediate = await cache.get("expire-key");
    expect(immediate).toBe("value");

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 1100));

    const expired = await cache.get("expire-key");
    expect(expired).toBeNull();
  });

  test("handles concurrent operations", async () => {
    const operations = Array.from({ length: 100 }, (_, i) =>
      cache.set(`concurrent-${i}`, { value: i })
    );

    await Promise.all(operations);

    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) => cache.get(`concurrent-${i}`))
    );

    results.forEach((result, i) => {
      expect(result).toEqual({ value: i });
    });
  });
});
```

---

## 8. Playwright E2E Tests

### Testing Architecture

Playwright E2E tests run directly against `localhost:4000` where the CapellaQL GraphQL service is running. There is no gateway proxy layer -- tests hit the server directly.

```
┌──────────────────────────────────────────┐
│  Playwright E2E Testing                    │
│                                            │
│  ┌────────────────────┐                   │
│  │  Playwright Test   │                   │
│  └─────────┬──────────┘                   │
│            │                               │
│            │ GraphQL queries               │
│            ▼                               │
│  ┌────────────────────┐                   │
│  │  localhost:4000    │                   │
│  │  (CapellaQL)       │                   │
│  └────────────────────┘                   │
└──────────────────────────────────────────┘
```

### E2E Test Example

```typescript
// tests/playwright/graphql/health.spec.ts
import { test, expect } from "@playwright/test";

const baseUrl = process.env.API_BASE_URL || "http://localhost:4000";

test.describe("CapellaQL Health Checks", () => {
  test("health endpoint returns ok", async ({ request }) => {
    const response = await request.get(`${baseUrl}/health`);

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe("ok");
  });

  test("GraphQL introspection works", async ({ request }) => {
    const response = await request.post(`${baseUrl}/graphql`, {
      data: {
        query: "{ __typename }"
      }
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.data.__typename).toBeDefined();
  });
});
```

---

## 9. Playwright E2E Tests — Configuration

### playwright.config.ts

```typescript
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test/playwright",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  
  reporter: [
    ["html"],
    ["json", { outputFile: "test-results/results.json" }],
    ["junit", { outputFile: "test-results/junit.xml" }]
  ],

  use: {
    baseURL: process.env.API_BASE_URL || "http://localhost:4000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },

  projects: [
    {
      name: "ci-safe",
      testMatch: /ci-safe\.e2e\.ts/,
      use: { 
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:4000" // Always direct mode
      }
    },
    {
      name: "chromium",
      testIgnore: /ci-safe\.e2e\.ts/,
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "firefox",
      testIgnore: /ci-safe\.e2e\.ts/,
      use: { ...devices["Desktop Firefox"] }
    },
    {
      name: "webkit",
      testIgnore: /ci-safe\.e2e\.ts/,
      use: { ...devices["Desktop Safari"] }
    },
    {
      name: "mobile",
      testIgnore: /ci-safe\.e2e\.ts/,
      use: { ...devices["iPhone 12"] }
    }
  ],

  webServer: {
    command: "bun run start",
    url: "http://localhost:4000/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
```

### CI-Safe Tests

```typescript
// tests/playwright/ci-safe.e2e.ts
import { test, expect } from "@playwright/test";

// Tests that run against localhost:4000 directly
test.describe("CI-Safe API Tests", () => {
  test("health endpoint responds", async ({ request }) => {
    const response = await request.get("/health");
    expect(response.ok()).toBeTruthy();
    
    const body = await response.json();
    expect(body.status).toBe("healthy");
  });

  test("metrics endpoint available", async ({ request }) => {
    const response = await request.get("/metrics");
    expect(response.ok()).toBeTruthy();
  });

  test("OpenAPI spec served", async ({ request }) => {
    const response = await request.get("/");
    expect(response.ok()).toBeTruthy();
    
    const body = await response.json();
    expect(body.openapi).toBe("3.0.0");
    expect(body.info.title).toBeDefined();
  });

  test("unknown endpoints return 404", async ({ request }) => {
    const response = await request.get("/non-existent");
    expect(response.status()).toBe(404);
  });

  test("handles OPTIONS preflight", async ({ request }) => {
    const response = await request.fetch("/graphql", {
      method: "OPTIONS"
    });
    expect(response.ok()).toBeTruthy();
  });
});
```

### API Best Practices Tests

```typescript
// tests/playwright/api-best-practices.e2e.ts
import { test, expect } from "@playwright/test";

test.describe("API Best Practices", () => {
  test.describe("Method Validation (RFC 9110)", () => {
    test("returns 405 with Allow header for invalid method", async ({ request }) => {
      const response = await request.fetch("/graphql", { method: "PUT" });

      expect(response.status()).toBe(405);
      expect(response.headers()["allow"]).toContain("POST");
    });
  });

  test.describe("ETag Support (RFC 7232)", () => {
    test("returns ETag header", async ({ request }) => {
      const response = await request.get("/");
      
      expect(response.headers()["etag"]).toBeDefined();
      expect(response.headers()["etag"]).toMatch(/^"[a-f0-9]{64}"$/); // SHA-256
    });

    test("supports conditional requests with If-None-Match", async ({ request }) => {
      const firstResponse = await request.get("/");
      const etag = firstResponse.headers()["etag"];

      const conditionalResponse = await request.get("/", {
        headers: { "If-None-Match": etag }
      });

      expect(conditionalResponse.status()).toBe(304); // Not Modified
    });
  });

  test.describe("Request Size Limits", () => {
    test("rejects requests exceeding 10MB", async ({ request }) => {
      const largePayload = "x".repeat(11 * 1024 * 1024); // 11MB
      
      const response = await request.post("/graphql", {
        data: largePayload,
        headers: { "Content-Type": "application/json" }
      });

      expect(response.status()).toBe(413); // Payload Too Large
    });
  });

  test.describe("Content-Type Validation", () => {
    test("rejects invalid Content-Type", async ({ request }) => {
      const response = await request.post("/graphql", {
        data: "plain text",
        headers: { "Content-Type": "text/plain" }
      });

      expect(response.status()).toBe(415); // Unsupported Media Type
    });
  });
});
```

---

## 10. K6 Performance Tests — Structure

### Test Organization

```
tests/k6/
├── smoke/                              # Quick validation
│   ├── index.ts                        # Multi-scenario entry point
│   ├── health-smoke.ts                 # Health endpoint checks
│   └── graphql-smoke.ts               # GraphQL query validation
├── load/                               # Production simulation
│   ├── index.ts                        # Multi-scenario entry point
│   ├── health-load.ts                  # Health under sustained load
│   ├── graphql-load.ts                 # GraphQL under sustained load
│   ├── complete-graphql-coverage.ts    # Full GraphQL coverage
│   └── graphql-endpoints-modern.ts     # Modern endpoint patterns
├── stress/                             # Breaking point
│   ├── index.ts                        # Multi-scenario entry point
│   └── system-stress.ts               # Find system limits
├── spike/                              # Traffic burst
│   ├── index.ts                        # Multi-scenario entry point
│   └── spike-test.ts                  # Sudden load simulation
├── soak/                               # Extended endurance
│   ├── index.ts                        # Multi-scenario entry point
│   └── soak-test.ts                   # Long-running stability
├── scenarios/                          # Business scenarios
│   ├── fashion-buyer-journey.ts       # End-to-end buyer flow
│   └── database-connection-stress.ts  # Connection pool stress
├── data/                               # Test data
│   └── test-data-loader.ts           # SharedArray data loading
└── utils/                              # Shared utilities
    ├── config.ts                       # Test configuration
    ├── metrics.ts                      # Custom K6 metrics
    └── graphql-helpers.ts             # GraphQL query helpers
```

### Smoke Test Example

```typescript
// tests/k6/smoke/health-smoke.ts
import { check, sleep } from "k6";
import http from "k6/http";
import { getConfig, getHealthEndpoint } from "../utils/config.ts";
import { httpDuration, httpSuccessRate } from "../utils/metrics.ts";

const config = getConfig();

export function healthSmokeTest(): void {
  const startTime = Date.now();

  const params = {
    tags: {
      testType: "smoke-test",
      endpoint: "/health",
      component: "health",
    },
    timeout: config.timeout,
  };

  const response = http.get(getHealthEndpoint(), params);
  const duration = Date.now() - startTime;

  // Record custom metrics
  httpDuration.add(duration, { operation: "health_check" });
  httpSuccessRate.add(response.status === 200);

  const isSuccessful = check(response, {
    "status is 200": (r) => r.status === 200,
    "response time < 50ms": (r) => r.timings.duration < 50,
    "response time < 100ms": (r) => r.timings.duration < 100,
    "response is valid JSON": (r) => {
      try {
        JSON.parse(r.body as string);
        return true;
      } catch {
        return false;
      }
    },
    "response indicates healthy status": (r) => {
      try {
        const body = JSON.parse(r.body as string);
        const validStatuses = ["healthy", "ok", "up"];
        return validStatuses.includes(body.status?.toLowerCase());
      } catch {
        return false;
      }
    },
  });

  if (!isSuccessful) {
    console.error(`Health check failed:`, {
      status: response.status,
      duration: response.timings.duration,
    });
  }

  sleep(1);
}
```

### Load Test Example

```typescript
// tests/k6/load/health-load.ts
import { check, sleep } from "k6";
import http from "k6/http";
import { getConfig, getHealthEndpoint } from "../utils/config.ts";
import { httpDuration, httpSuccessRate } from "../utils/metrics.ts";

const config = getConfig();

export function healthLoadTest(): void {
  const params = {
    tags: {
      testType: "load-test",
      endpoint: "/health",
      component: "health",
    },
    timeout: config.timeout,
  };

  const response = http.get(getHealthEndpoint(), params);

  httpDuration.add(response.timings.duration, { operation: "health_check" });
  httpSuccessRate.add(response.status === 200);

  check(response, {
    "status is 200": (r) => r.status === 200,
    "response time < 200ms": (r) => r.timings.duration < 200,
    "response is valid JSON": (r) => {
      try {
        JSON.parse(r.body as string);
        return true;
      } catch {
        return false;
      }
    },
    "response indicates healthy": (r) => {
      try {
        const body = JSON.parse(r.body as string);
        return body.status !== undefined;
      } catch {
        return false;
      }
    },
  });

  sleep(Math.random() * 2 + 1); // 1-3 second think time
}
```

---

## 11. K6 Performance Tests — Configuration

### Shared Configuration

```typescript
// tests/k6/utils/config.ts
export function getBaseUrl(): string {
  const protocol = __ENV.TARGET_PROTOCOL || "http";
  const host = __ENV.TARGET_HOST || "localhost";
  const port = __ENV.TARGET_PORT || "4000";
  return `${protocol}://${host}:${port}`;
}

export const smokeOptions = {
  vus: Number(__ENV.K6_SMOKE_VUS) || 3,
  duration: __ENV.K6_SMOKE_DURATION || "3m",
  thresholds: {
    http_req_duration: ["p(95)<100", "p(99)<200"],
    http_req_failed: ["rate<0.01"]
  }
};

export const loadOptions = {
  stages: [
    { 
      duration: __ENV.K6_LOAD_RAMP_UP_DURATION || "2m", 
      target: Number(__ENV.K6_LOAD_INITIAL_VUS) || 10 
    },
    { 
      duration: __ENV.K6_LOAD_STEADY_DURATION || "5m", 
      target: Number(__ENV.K6_LOAD_TARGET_VUS) || 20 
    },
    { 
      duration: __ENV.K6_LOAD_RAMP_DOWN_DURATION || "2m", 
      target: 0 
    }
  ],
  thresholds: {
    http_req_duration: ["p(95)<200", "p(99)<500"],
    http_req_failed: ["rate<0.05"]
  }
};

export const stressOptions = {
  stages: [
    { duration: "2m", target: 50 },
    { duration: "5m", target: 100 },
    { duration: "2m", target: 200 },
    { duration: "5m", target: 200 },
    { duration: "2m", target: 0 }
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.10"]
  }
};
```

### Environment Variables

```bash
# .env.k6
# Target Configuration
TARGET_PROTOCOL=http
TARGET_HOST=localhost
TARGET_PORT=4000
K6_TIMEOUT=30s

# Smoke Test Configuration
K6_SMOKE_VUS=3
K6_SMOKE_DURATION=3m

# Load Test Configuration
K6_LOAD_INITIAL_VUS=10
K6_LOAD_TARGET_VUS=20
K6_LOAD_RAMP_UP_DURATION=2m
K6_LOAD_STEADY_DURATION=5m
K6_LOAD_RAMP_DOWN_DURATION=2m

# Stress Test Configuration
K6_STRESS_INITIAL_VUS=50
K6_STRESS_TARGET_VUS=100
K6_STRESS_PEAK_VUS=200
K6_STRESS_DURATION=5m

# Performance Thresholds (milliseconds)
K6_HEALTH_P95_THRESHOLD=50
K6_HEALTH_P99_THRESHOLD=100
K6_GRAPHQL_P95_THRESHOLD=150
K6_GRAPHQL_P99_THRESHOLD=300

# Non-blocking thresholds (CI-friendly)
K6_THRESHOLDS_NON_BLOCKING=false
```

### package.json Scripts

```json
{
  "scripts": {
    "test:k6:smoke:all": "k6 run tests/k6/smoke/index.ts",
    "test:k6:load:all": "k6 run tests/k6/load/index.ts",
    "test:k6:stress:all": "k6 run tests/k6/stress/index.ts",
    "test:k6:spike": "k6 run tests/k6/spike/index.ts",
    "test:k6:soak": "k6 run tests/k6/soak/index.ts",
    "test:k6:scenario:all": "k6 run tests/k6/scenarios/fashion-buyer-journey.ts"
  }
}
```

---

## 12. K6 Performance Tests — Best Practices

### Custom Metrics

```typescript
// tests/k6/utils/metrics.ts
import { Counter, Gauge, Rate, Trend } from "k6/metrics";

// HTTP and general metrics
export const httpErrors = new Counter("http_errors");
export const httpDuration = new Trend("http_duration_custom");
export const httpSuccessRate = new Rate("http_success_rate");

// GraphQL operation metrics
export const graphqlDuration = new Trend("graphql_operation_duration");
export const graphqlErrors = new Counter("graphql_errors");
export const graphqlSuccessRate = new Rate("graphql_success_rate");

// Business-specific metrics
export const businessOperations = new Counter("business_operations_completed");
export const looksRetrieved = new Counter("looks_retrieved");
export const optionsRetrieved = new Counter("options_retrieved");

// Database connection metrics
export const dbConnections = new Gauge("concurrent_db_connections");
export const dbConnectionErrors = new Counter("db_connection_errors");

// Cache performance metrics
export const cacheHits = new Counter("cache_hits");
export const cacheMisses = new Counter("cache_misses");
export const cacheHitRate = new Rate("cache_hit_rate");
```

**Usage:**
```typescript
import { httpDuration, httpSuccessRate } from "../utils/metrics.ts";
import { recordGraphQLOperation } from "../utils/metrics.ts";

export function myTest(): void {
  const response = http.get(getHealthEndpoint(), params);

  httpDuration.add(response.timings.duration, { operation: "health_check" });
  httpSuccessRate.add(response.status === 200);

  // Or for GraphQL operations:
  recordGraphQLOperation({
    operation: "looksSummary",
    duration: response.timings.duration,
    success: response.status === 200,
    complexity: "simple",
  });
}
```

### Realistic User Behavior

```typescript
// tests/k6/scenarios/fashion-buyer-journey.ts (pattern)
import http from "k6/http";
import { check, sleep } from "k6";
import { getConfig, getGraphQLEndpoint, getHealthEndpoint } from "../utils/config.ts";

const config = getConfig();

export default function () {
  // User journey: health check -> browse looks -> view details

  // 1. Health check (warm-up)
  http.get(getHealthEndpoint());

  // 2. Browse looks summary (70% of users)
  if (Math.random() < 0.7) {
    const looksSummary = http.post(getGraphQLEndpoint(), JSON.stringify({
      query: `{ looksSummary { id name status } }`
    }), { headers: { "Content-Type": "application/json" } });

    check(looksSummary, {
      "looks summary returned": (r) => r.status === 200,
    });

    // 3. View details for first look (50% follow-through)
    if (looksSummary.status === 200 && Math.random() < 0.5) {
      http.post(getGraphQLEndpoint(), JSON.stringify({
        query: `{ optionsSummary { id styleNumber colorCode } }`
      }), { headers: { "Content-Type": "application/json" } });
    }
  }

  // 4. Health check monitoring (20% of traffic)
  if (Math.random() < 0.2) {
    http.get(`${config.baseUrl}/health/system`);
  }

  sleep(Math.random() * 5 + 3); // 3-8 second think time
}
```

### Performance Baselines

```typescript
// tests/k6/utils/baselines.ts (pattern)
export const performanceBaselines = {
  health: {
    p95: 30,  // ms
    p99: 50
  },
  graphqlSimple: {
    p95: 150,
    p99: 300
  },
  graphqlComplex: {
    p95: 500,
    p99: 800
  },
  openapi: {
    p95: 10,
    p99: 20
  }
};

export function validateBaseline(
  endpoint: keyof typeof performanceBaselines,
  metric: "p95" | "p99",
  value: number
): boolean {
  const baseline = performanceBaselines[endpoint][metric];
  return value <= baseline;
}
```

---

## 13. Chaos Engineering Tests

### CapellaQL Chaos Tests

The `tests/bun/chaos/` directory contains chaos engineering tests that validate system resilience under failure conditions:

```
tests/bun/chaos/
├── network-partition.test.ts      # Simulates network failures and partition scenarios
├── cache-failure.test.ts          # Tests behavior when the SQLite cache is unavailable or corrupted
├── couchbase-failure.test.ts      # Validates error handling during Couchbase connection loss, timeouts, and auth failures
└── resource-exhaustion.test.ts    # Exercises memory pressure, CPU saturation, and resource limit enforcement
```

Run with: `bun test tests/bun/chaos/`

### Couchbase Failure Scenarios

```typescript
// tests/bun/chaos/couchbase-failure.test.ts
import { describe, test, expect, beforeEach } from "bun:test";
import { getCouchbaseConnection } from "../../../src/lib/couchbase/connection-manager";
import { CouchbaseErrorHandler } from "../../../src/lib/couchbase/errors";

describe("Chaos: Couchbase Failures", () => {
  test("handles connection timeout gracefully", async () => {
    await expect(
      getCouchbaseConnection({
        connectionString: "couchbase://unreachable-host:8091",
        timeout: 1000
      })
    ).rejects.toThrow();
  });

  test("handles bucket not found error", async () => {
    const { cluster } = await getCouchbaseConnection();

    await expect(
      cluster.bucket("nonexistent-bucket").defaultCollection().get("doc")
    ).rejects.toThrow();
  });

  test("classifies errors correctly via CouchbaseErrorHandler", async () => {
    const handler = new CouchbaseErrorHandler();
    const timeoutError = new Error("timeout");
    timeoutError.name = "TimeoutError";

    const classified = handler.classify(timeoutError);
    expect(classified.retryable).toBe(true);
    expect(classified.severity).toBe("warning");
  });

  test("circuit breaker opens after repeated failures", async () => {
    // Force repeated connection failures to trigger circuit breaker
    const attempts: boolean[] = [];

    for (let i = 0; i < 6; i++) {
      try {
        await getCouchbaseConnection({
          connectionString: "couchbase://invalid:9999",
          timeout: 100
        });
        attempts.push(true);
      } catch {
        attempts.push(false);
      }
    }

    // All attempts should have failed
    expect(attempts.every((a) => a === false)).toBe(true);
  });
});
```

### Redis Failure Scenarios

```typescript
// test/chaos/redis-failure.test.ts
import { describe, test, expect, beforeEach } from "bun:test";
import { CacheManager } from "../../src/cache/cache-manager";
import { LocalMemoryCache } from "../../src/cache/local-memory-cache";

describe("Chaos: Redis Failures", () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    cacheManager = new CacheManager({
      redis: { url: "redis://invalid:6379" }, // Force failure
      fallback: new LocalMemoryCache({ maxEntries: 100 })
    });
  });

  test("falls back to local memory when Redis unavailable", async () => {
    // Set should succeed via fallback
    await cacheManager.set("key", { data: "value" });

    // Get should succeed via fallback
    const result = await cacheManager.get("key");
    expect(result).toEqual({ data: "value" });
  });

  test("handles concurrent access during Redis failure", async () => {
    const operations = Array.from({ length: 100 }, (_, i) =>
      cacheManager.set(`key-${i}`, { value: i })
    );

    await Promise.all(operations);

    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) => cacheManager.get(`key-${i}`))
    );

    results.forEach((result, i) => {
      expect(result).toEqual({ value: i });
    });
  });

  test("respects max entries in fallback cache", async () => {
    // Fill beyond max entries (100)
    for (let i = 0; i < 150; i++) {
      await cacheManager.set(`key-${i}`, { value: i });
    }

    // Oldest entries should be evicted
    const firstKey = await cacheManager.get("key-0");
    expect(firstKey).toBeNull(); // Evicted

    const lastKey = await cacheManager.get("key-149");
    expect(lastKey).toEqual({ value: 149 }); // Still present
  });
});
```

### Network Partition Scenarios

```typescript
// test/chaos/network-partition.test.ts
import { describe, test, expect, beforeEach } from "bun:test";
import { getCouchbaseConnection } from "../../src/lib/couchbase/connection-manager";
import { FlakeyNetworkSimulator } from "../shared/flakey-network";

describe("Chaos: Network Partitions", () => {
  let network: FlakeyNetworkSimulator;

  beforeEach(() => {
    network = new FlakeyNetworkSimulator({
      failureRate: 0.3, // 30% packet loss
      latency: { min: 50, max: 200 }
    });
  });

  test("retries succeed despite intermittent failures", async () => {
    network.setFailureRate(0.3); // 30% failure rate

    const { collection } = await getCouchbaseConnection();
    const result = await collection.get("test-doc-001");
    expect(result.content).toBeDefined(); // Eventually succeeds with retry
  });

  test("circuit stays closed for occasional failures", async () => {
    network.setFailureRate(0.2); // 20% failure rate (below threshold)

    const { collection } = await getCouchbaseConnection();

    // Make 50 requests
    for (let i = 0; i < 50; i++) {
      try {
        await collection.get("test-doc-001");
      } catch {}
    }

    // Circuit should still be CLOSED
    const result = await collection.get("test-doc-001");
    expect(result.content).toBeDefined(); // No fast rejection
  });

  test("circuit opens for frequent failures", async () => {
    network.setFailureRate(0.8); // 80% failure rate

    const { collection } = await getCouchbaseConnection();

    // Force circuit to open
    for (let i = 0; i < 10; i++) {
      try {
        await collection.get("test-doc");
      } catch {}
    }

    // Circuit should be OPEN
    const start = Date.now();
    try {
      await collection.get("test-doc");
    } catch (error) {
      expect(Date.now() - start).toBeLessThan(50);
      expect(error.message).toContain("Circuit breaker is OPEN");
    }
  });
});
```

### Resource Exhaustion Scenarios

```typescript
// test/chaos/resource-exhaustion.test.ts
import { describe, test, expect, beforeEach } from "bun:test";
import { MemoryMonitor } from "../../src/utils/memory-monitor";

describe("Chaos: Resource Exhaustion", () => {
  test("handles large payload processing", async () => {
    const payloads = Array.from({ length: 100 }, () => ({
      data: "x".repeat(10_000) // 10KB each = 1MB total
    }));

    const initialMemory = process.memoryUsage().heapUsed;

    for (const payload of payloads) {
      await processPayload(payload);
    }

    // Force garbage collection
    if (global.gc) global.gc();

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;

    // Should not leak - memory increase < 5MB
    expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024);
  });

  test("handles high concurrent connections", async () => {
    const requests = Array.from({ length: 100 }, () =>
      fetch("http://localhost:4000/health")
    );

    const responses = await Promise.all(requests);
    
    const successCount = responses.filter(r => r.ok).length;
    expect(successCount).toBeGreaterThan(95); // >95% success rate
  });

  test("monitors event loop delay", async () => {
    const monitor = new MemoryMonitor();
    
    // Simulate CPU-intensive work
    const start = Date.now();
    let result = 0;
    for (let i = 0; i < 10_000_000; i++) {
      result += Math.sqrt(i);
    }
    const duration = Date.now() - start;

    const delay = monitor.getEventLoopDelay();
    
    // Event loop delay should be reasonable
    expect(delay).toBeLessThan(100); // <100ms delay
  });
});
```

---

## 14. Mutation Testing with StrykerJS

### Configuration

```json
// stryker.config.json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "packageManager": "bun",
  "testRunner": "command",
  "commandRunner": {
    "command": "./scripts/bun-mutation-runner.sh test --reporter=dots ./test/bun"
  },
  "concurrency": 8,
  "timeoutMS": 30000,
  "timeoutFactor": 1.5,
  "coverageAnalysis": "off",
  "incremental": true,
  "incrementalFile": ".stryker-tmp/incremental.json",
  "mutate": [
    "src/handlers/**/*.ts",
    "src/services/**/*.ts",
    "src/utils/response.ts",
    "!src/**/*.test.ts",
    "!src/**/*.spec.ts"
  ],
  "ignorePatterns": [
    "src/telemetry/**/*.ts",
    "src/config/**/*.ts",
    "src/middleware/**/*.ts"
  ],
  "thresholds": {
    "high": 80,
    "low": 60,
    "break": null
  },
  "reporters": ["html", "clear-text", "progress", "json"],
  "htmlReporter": {
    "fileName": ".stryker-tmp/reports/mutation.html"
  }
}
```

### Mutation Runner Script

```bash
#!/usr/bin/env bash
# scripts/bun-mutation-runner.sh

set -e

# Enable bundled Bun workaround (SIO-276)
export BUN_BE_BUN=1

# Silent logging for StrykerJS output parser (SIO-287)
export LOG_LEVEL=silent
export TELEMETRY_MODE=console

# Run Bun tests with dots reporter
exec ./scripts/bundled-runtimes/bun-cli "$@"
```

### Building Bundled Bun

```bash
# scripts/build-bun-bundle.sh
#!/usr/bin/env bash

set -e

echo "Building bundled Bun executable..."

# Create output directory
mkdir -p scripts/bundled-runtimes

# Build standalone Bun executable
bun build --compile --minify --sourcemap \
  --target=bun \
  --outfile scripts/bundled-runtimes/bun-cli \
  $(which bun)

# Verify
chmod +x scripts/bundled-runtimes/bun-cli
BUN_BE_BUN=1 ./scripts/bundled-runtimes/bun-cli --version

echo "✅ Bundled Bun executable ready at scripts/bundled-runtimes/bun-cli"
```

### Mutation-Resistant Test Pattern

```typescript
// tests/bun/unit/couchbase/circuit-breaker.mutation.test.ts
import { beforeEach, describe, expect, test } from "bun:test";
import { CircuitBreaker } from "../../../../src/lib/couchbase/circuit-breaker";

describe("CircuitBreaker Mutation Killers", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
    });
  });

  test("KILL: Failure threshold must be exact", async () => {
    // Mutation: Changing >= to > in threshold check must fail
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => { throw new Error("fail"); });
      } catch { /* expected */ }
    }
    expect(breaker.getState()).toBe("open");
  });

  test("KILL: Open circuit must reject immediately", async () => {
    // Force circuit open
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => { throw new Error("fail"); });
      } catch { /* expected */ }
    }

    // Mutation: Removing open-state check must fail
    await expect(
      breaker.execute(async () => "should not run")
    ).rejects.toThrow();
  });

  test("KILL: Stats must track operations accurately", async () => {
    await breaker.execute(async () => "ok");

    const stats = breaker.getStats();
    // Mutation: Changing increment logic must fail
    expect(stats.totalOperations).toBe(1);
    expect(stats.failures).toBe(0);
    expect(stats.successRate).toBe(100);
  });
});
```

### Running Mutation Tests

```bash
# Fresh run (clears cache, full mutation testing) - 79 minutes
bun run test:mutation:fresh

# Incremental run (uses cache) - 26 seconds
bun run test:mutation

# Dry run (show mutants without running tests)
bun run test:mutation:dry

# Targeted testing
bun run test:mutation:handlers    # Only handlers
bun run test:mutation:services    # Only services
```

### Interpreting Results

```
All files                | 100.00 |  100.00 |       33 |         0 |          0 |
 handlers                | 100.00 |  100.00 |       27 |         0 |          0 |
  tokens.ts              | 100.00 |  100.00 |       27 |         0 |          0 |
```

- **% Mutation score**: Percentage of mutants killed (100% is ideal)
- **# killed**: Mutants caught by tests (should equal total mutants)
- **# survived**: Mutants that tests missed (should be 0)
- **# timeout**: Mutants causing infinite loops (investigate)
- **# no coverage**: Code not executed by tests (add tests)

---

## 15. Test Coverage Strategy

### Coverage Targets

| Category | Line Coverage | Branch Coverage | Function Coverage |
|----------|---------------|-----------------|-------------------|
| **Critical Paths** | 100% | 100% | 100% |
| **Business Logic** | 95%+ | 90%+ | 95%+ |
| **Infrastructure** | 80%+ | 75%+ | 80%+ |
| **Overall** | 80%+ | 75%+ | 80%+ |

### Critical Paths Definition

- GraphQL resolver data fetching
- Couchbase connection management and error handling
- Data persistence operations (KV, N1QL, transactions)
- Circuit breaker implementations
- Cache fallback mechanisms
- Logging DI container initialization

### Coverage Commands

```bash
# Generate coverage report
bun run test:bun:coverage

# Coverage with HTML report
bun run test:bun:coverage && open coverage/index.html

# CI coverage (JSON only)
bun run test:bun:coverage:ci

# Coverage for specific domain
bun test --coverage tests/bun/unit/couchbase/
```

### Coverage Configuration

```json
// package.json
{
  "bun": {
    "test": {
      "coverage": {
        "exclude": [
          "test/**/*",
          "scripts/**/*",
          "**/*.test.ts",
          "**/*.spec.ts",
          "**/types.ts",
          "src/telemetry/instrumentation.ts"
        ],
        "thresholds": {
          "line": 80,
          "function": 80,
          "branch": 75
        }
      }
    }
  }
}
```

### Coverage Gaps Strategy

1. **Identify gaps**: `bun run test:bun:coverage` → review HTML report
2. **Prioritize**: Critical paths first, then business logic
3. **Write tests**: Follow mutation-resistant patterns
4. **Verify**: Run mutation testing to ensure quality
5. **Document**: Add comments for intentionally uncovered code

```typescript
// Example: Intentionally uncovered defensive code
export function processData(data: unknown) {
  // istanbul ignore next - Defensive check, covered by TypeScript
  if (!data) {
    throw new Error("Data required");
  }
  
  // Business logic with 100% coverage
  return transformData(data);
}
```

---

## 16. CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

concurrency:
  group: test-${{ github.ref }}
  cancel-in-progress: true

jobs:
  unit-tests:
    name: Unit & Integration Tests
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.6

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Run unit tests with coverage
        run: bun run test:bun:coverage:ci
        env:
          NODE_ENV: test
          LOG_LEVEL: silent
          REDIS_DB: 10

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/coverage-final.json
          fail_ci_if_error: true

  e2e-tests:
    name: E2E Tests (Playwright)
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: unit-tests

    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Install Playwright
        run: npx playwright install --with-deps chromium

      - name: Start application
        run: |
          bun run start &
          sleep 5
          curl --retry 10 --retry-delay 1 http://localhost:4000/health

      - name: Run E2E tests
        run: bun run test:e2e
        env:
          API_BASE_URL: http://localhost:4000

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/

  performance-tests:
    name: Performance Tests (K6)
    runs-on: ubuntu-latest
    timeout-minutes: 15
    needs: unit-tests

    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Install K6
        run: |
          sudo gpg -k
          sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update
          sudo apt-get install k6

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Start application
        run: |
          bun run start &
          sleep 5

      - name: Run smoke tests
        run: bun run test:k6:quick
        env:
          TARGET_HOST: localhost
          TARGET_PORT: 3000
          K6_THRESHOLDS_NON_BLOCKING: true

      - name: Upload K6 results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: k6-results
          path: test/results/

  mutation-testing:
    name: Mutation Testing
    runs-on: ubuntu-latest
    timeout-minutes: 120
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Build bundled Bun
        run: bun run build:bun-bundle

      - name: Run mutation testing
        env:
          BUN_BE_BUN: 1
          LOG_LEVEL: silent
          TELEMETRY_MODE: console
        run: bun run test:mutation:fresh

      - name: Upload mutation report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: mutation-report
          path: .stryker-tmp/reports/
```

---

## 17. Test Utilities and Helpers

### Test Skip Conditions

```typescript
// tests/bun/shared/test-skip-conditions.ts
import { test } from "bun:test";
import { fetchWithFallback } from "../../src/utils/bun-fetch-fallback";

export async function skipIfServiceUnavailable(
  serviceName: string,
  url: string,
  timeout: number = 5000
) {
  try {
    const response = await fetchWithFallback(url, {
      signal: AbortSignal.timeout(timeout)
    });
    
    if (!response.ok) {
      test.skip(`${serviceName} unavailable at ${url} (HTTP ${response.status})`);
    }
  } catch (error) {
    test.skip(`${serviceName} unavailable at ${url}: ${error.message}`);
  }
}

export async function skipIfRedisUnavailable() {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  await skipIfServiceUnavailable("Redis", redisUrl);
}

export async function skipIfCouchbaseUnavailable() {
  const couchbaseUrl = process.env.COUCHBASE_URL;
  if (!couchbaseUrl) {
    test.skip("COUCHBASE_URL not configured");
  }
  await skipIfServiceUnavailable("Couchbase", couchbaseUrl);
}
```

### Test Consumers

```typescript
// tests/bun/shared/test-consumers.ts
export const TEST_CONSUMERS = [
  {
    id: "test-consumer-001",
    username: "loadtest-user-001",
    custom_id: "user-001"
  },
  {
    id: "test-consumer-002",
    username: "loadtest-user-002",
    custom_id: "user-002"
  },
  {
    id: "test-consumer-003",
    username: "loadtest-user-003",
    custom_id: "user-003"
  }
] as const;

export function getTestConsumer(index: number) {
  return TEST_CONSUMERS[index % TEST_CONSUMERS.length];
}

export function getRandomTestConsumer() {
  return TEST_CONSUMERS[Math.floor(Math.random() * TEST_CONSUMERS.length)];
}
```

### Fetch Polyfill for Tests

```typescript
// tests/bun/shared/fetch-polyfill.ts
import { fetchWithFallback } from "../../src/utils/bun-fetch-fallback";

export function enableFetchPolyfill() {
  // Replace globalThis.fetch with curl fallback version
  const originalFetch = globalThis.fetch;
  
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    
    try {
      return await originalFetch(input, init);
    } catch (error) {
      console.log(`Fetch failed for ${url}, trying curl fallback...`);
      return await fetchWithFallback(url, init);
    }
  };
}
```

### Mock Servers

```typescript
// tests/bun/shared/mock-couchbase-server.ts
import { serve, Server } from "bun";

export class MockCouchbaseServer {
  private server: Server;
  private failureMode: "none" | "timeout" | "error" | "500";

  constructor(options: { failureMode?: "none" | "timeout" | "error" | "500" } = {}) {
    this.failureMode = options.failureMode || "none";

    this.server = serve({
      port: 0, // Random port
      fetch: this.handleRequest.bind(this)
    });
  }

  get url(): string {
    return `http://localhost:${this.server.port}`;
  }

  setMode(mode: "none" | "timeout" | "error" | "500") {
    this.failureMode = mode;
  }

  private async handleRequest(req: Request): Promise<Response> {
    if (this.failureMode === "timeout") {
      await new Promise(resolve => setTimeout(resolve, 10000));
    }

    if (this.failureMode === "error") {
      throw new Error("Simulated connection error");
    }

    if (this.failureMode === "500") {
      return new Response("Internal Server Error", { status: 500 });
    }

    // Success mode - simulate Couchbase REST API
    const url = new URL(req.url);
    if (url.pathname.includes("/pools/default")) {
      return Response.json({
        name: "default",
        nodes: [{ status: "healthy" }]
      });
    }

    return new Response("Not Found", { status: 404 });
  }

  async close() {
    this.server.stop();
  }
}
```

---

## 18. Environment Configuration

### .env.test

```bash
# .env.test
NODE_ENV=test
LOG_LEVEL=silent

# Application
PORT=4000
HOST=localhost

# Couchbase (live integration)
COUCHBASE_URL=couchbase://localhost
COUCHBASE_USERNAME=Administrator
COUCHBASE_PASSWORD=password
COUCHBASE_BUCKET=test-bucket

# Redis (test database)
REDIS_URL=redis://localhost:6379
REDIS_DB=10

# Telemetry (console mode for testing)
TELEMETRY_MODE=console
OTEL_SERVICE_NAME=capellaql-test

# Test Consumers
TEST_CONSUMER_ID_1=test-consumer-001
TEST_CONSUMER_USERNAME_1=loadtest-user-001
TEST_CONSUMER_ID_2=test-consumer-002
TEST_CONSUMER_USERNAME_2=loadtest-user-002
```

### Environment Loading

```typescript
// test/setup.ts
import { loadEnv } from "../src/config/env";

// Load test environment before all tests
loadEnv(".env.test");

// Override specific values for testing
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.REDIS_DB = "10";
```

---

## 19. Performance Baselines

### Expected Performance (Local Development)

| Endpoint | P95 | P99 | Throughput |
|----------|-----|-----|------------|
| `/health` | <30ms | <50ms | >2000 req/s |
| `/graphql` (simple query) | <150ms | <300ms | >1000 req/s |
| `/graphql` (complex query) | <500ms | <800ms | >500 req/s |
| `/health/comprehensive` | <400ms | <500ms | >500 req/s |

### Expected Performance (Production)

| Metric | Value |
|--------|-------|
| **Concurrent Users** | 100+ sustained, 200+ peak |
| **Memory Usage** | <512MB at 100 VUs |
| **Cold Start** | <100ms |
| **Error Rate** | <1% normal, <10% stress |

### Resource Limits

```yaml
# docker-compose.yml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
        reservations:
          cpus: "0.25"
          memory: 256M
```

---

## 20. Troubleshooting Guide

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Tests timeout | External service unavailable | Check service URL in `.env`, verify network connectivity |
| Parallel test failures | Instance equality checks | Use functional equivalence (compare properties, not instances) |
| Redis connection errors | Wrong database | Verify `REDIS_DB=10` in test environment |
| Couchbase connection fails | Wrong URL or credentials | Verify `COUCHBASE_URL`, `COUCHBASE_USERNAME`, `COUCHBASE_PASSWORD` in `.env` |
| Mutation testing ENOEXEC | Missing bundled Bun | Run `bun run build:bun-bundle` |
| StrykerJS parse errors | Wrong test reporter | Use `--reporter=dots` for mutation testing |
| High memory usage in tests | No cleanup | Add `afterEach` to clear caches and close connections |

### Debugging Commands

```bash
# Verbose test output
bun test --verbose tests/bun/specific.test.ts

# Debug single test
bun --inspect test tests/bun/specific.test.ts

# Check service connectivity
curl http://localhost:8091/pools/default  # Couchbase
redis-cli -h localhost -p 6379 ping       # Redis

# Test Couchbase connection
LOG_LEVEL=debug bun test tests/bun/couchbase/
# Look for: connection status and error classification output

# Verify mutation testing setup
BUN_BE_BUN=1 ./scripts/bundled-runtimes/bun-cli --version
```

### Performance Debugging

```bash
# K6 verbose output
K6_LOG_LEVEL=debug k6 run tests/k6/load/index.ts

# Playwright trace
npx playwright test --trace on

# Memory profiling
bun --heap-prof tests/bun/unit/couchbase/circuit-breaker.test.ts
```

---

## 21. Migration from Jest/Vitest

### Syntax Comparison

| Jest/Vitest | Bun Test | Notes |
|-------------|----------|-------|
| `import { describe, it, expect } from 'vitest'` | `import { describe, test, expect } from 'bun:test'` | Use `test` instead of `it` |
| `vi.fn()` | `mock(() => {})` | Bun native mocking |
| `vi.spyOn(obj, 'method')` | `spyOn(obj, 'method')` | Direct import from `bun:test` |
| `beforeAll`, `afterAll` | `beforeAll`, `afterAll` | Same API |
| `beforeEach`, `afterEach` | `beforeEach`, `afterEach` | Same API |
| `.rejects.toThrow()` | `.rejects.toThrow()` | Same API |
| `.resolves.toBe()` | `.resolves.toBe()` | Same API |

### Configuration Migration

```toml
# bunfig.toml (replaces jest.config.js / vitest.config.ts)
[test]
timeout = 5000
bail = 0
reporter = "spec"
coverage = true
coverageReporter = ["text", "json", "html"]
coverageThresholds = { line = 80, function = 80, branch = 80 }
coverageSkipTestFiles = true
preload = ["./test/setup.ts"]
concurrent = true
```

### Mock Migration

```typescript
// ❌ Jest/Vitest
import { vi } from 'vitest';
const mockFetch = vi.fn();

// ✅ Bun Test
import { mock } from 'bun:test';
const mockFetch = mock(() => {});
```

### Snapshot Testing

```typescript
// Bun supports Jest-compatible snapshots
import { expect, test } from "bun:test";

test("matches snapshot", () => {
  const data = { id: 123, name: "Test" };
  expect(data).toMatchSnapshot();
});
```

---

## 22. Checklist for New Projects

### Initial Setup

- [ ] Create test directory structure (Section 3)
- [ ] Configure `bunfig.toml` (Section 4)
- [ ] Create `test/setup.ts` global setup (Section 4)
- [ ] Add test scripts to `package.json` (Section 4)
- [ ] Create `.env.test` (Section 18)
- [ ] Set up test skip conditions utilities (Section 17)

### Unit Testing

- [ ] Organize tests by domain (Section 5)
- [ ] Follow naming conventions (Section 5)
- [ ] Implement parallel-safe patterns (Section 6)
- [ ] Configure Redis test database separation (Section 6)
- [ ] Add timeout configuration for external APIs (Section 6)
- [ ] Set coverage targets (Section 15)

### Integration Testing

- [ ] Implement live backend strategy (Section 2)
- [ ] Add curl fallback for networking issues (Section 2)
- [ ] Create integration test files (Section 7)
- [ ] Configure graceful skipping (Section 2)

### E2E Testing

- [ ] Install Playwright (Section 9)
- [ ] Configure `playwright.config.ts` (Section 9)
- [ ] Implement dual-mode testing (Section 8)
- [ ] Create CI-safe test suite (Section 9)
- [ ] Add API best practices tests (Section 9)

### Performance Testing

- [ ] Install K6 (Section 10)
- [ ] Create test directory structure (Section 10)
- [ ] Configure shared utilities (Section 11)
- [ ] Add smoke tests (Section 10)
- [ ] Add load/stress/spike tests (Section 10)
- [ ] Document performance baselines (Section 19)

### Chaos Testing

- [ ] Create chaos test files (Section 13)
- [ ] Implement failure scenarios (Section 13)
- [ ] Add network partition tests (Section 13)
- [ ] Add resource exhaustion tests (Section 13)

### Mutation Testing

- [ ] Install StrykerJS (Section 14)
- [ ] Create `stryker.config.json` (Section 14)
- [ ] Build bundled Bun executable (Section 14)
- [ ] Create mutation runner script (Section 14)
- [ ] Add mutation-resistant tests (Section 14)

### CI/CD Integration

- [ ] Create GitHub Actions workflow (Section 16)
- [ ] Configure unit test job (Section 16)
- [ ] Configure E2E test job (Section 16)
- [ ] Configure performance test job (Section 16)
- [ ] Configure mutation testing job (optional, Section 16)
- [ ] Set up artifact uploads (Section 16)

### Documentation

- [ ] Create test README (based on source project)
- [ ] Document test organization
- [ ] Document environment variables
- [ ] Document performance baselines
- [ ] Add troubleshooting guide

---

## Quick Reference: Key Commands

```bash
# Unit Tests
bun run test:bun                     # All Bun tests
bun run test:bun:watch               # Watch mode
bun run test:bun:coverage            # With coverage
bun test tests/bun/cache/             # Domain-specific

# Integration Tests
bun run test:integration             # All integration tests

# E2E Tests
bun run test:e2e                     # Playwright E2E
bun run test:e2e:ui                  # Interactive mode
bun run test:e2e:headed              # Visible browser

# Performance Tests
bun run test:k6:quick                # Quick validation
bun run k6:smoke:health              # Health smoke test
bun run k6:load                      # Load testing
bun run k6:stress                    # Stress testing

# Chaos Tests
bun test test/chaos/                 # All chaos tests

# Mutation Testing
bun run test:mutation                # Incremental run
bun run test:mutation:fresh          # Fresh run

# Complete Suite
bun run test:suite                   # Bun + E2E + K6 quick
```

---

---

## 23. Platform QA Components Compliance

This project is fully compliant with the **Platform Engineering QA Components Application Contract**, enabling seamless integration with GitLab CI/CD components for automated testing in pipelines.

### Quick Compliance Check

Run the compliance checker before pushing to GitLab:

```bash
bun run check:platform
```

This validates:
- Health endpoint responds at `/health` with HTTP 200
- K6 entry points exist (`tests/k6/{profile}/index.ts`)
- K6 scripts use `BASE_URL` environment variable
- Playwright config reads `BASE_URL` from environment
- Server binds to `0.0.0.0`

### K6 Directory Structure (Platform-Compatible)

```
tests/k6/
├── smoke/
│   ├── index.ts              # Multi-scenario entry point (health + graphql)
│   ├── health-smoke.ts       # Exports: healthSmokeTest()
│   └── graphql-smoke.ts      # Exports: graphqlSmokeTest()
├── load/
│   ├── index.ts              # Multi-scenario entry point (health + graphql)
│   ├── health-load.ts        # Exports: healthLoadTest()
│   ├── graphql-load.ts       # Exports: runSimpleQueries(), runComplexQueries()
│   ├── complete-graphql-coverage.ts  # Supplementary (standalone)
│   └── graphql-endpoints-modern.ts   # Supplementary (standalone)
├── stress/
│   ├── index.ts              # Re-exports system-stress.ts
│   └── system-stress.ts
├── spike/
│   ├── index.ts              # Re-exports spike-test.ts
│   └── spike-test.ts
├── soak/
│   ├── index.ts              # Re-exports soak-test.ts
│   └── soak-test.ts
├── data/                     # Test data loaders (SharedArray)
├── utils/                    # Shared utilities (config, helpers, metrics)
└── scenarios/                # Business scenario tests
```

### Entry Point Patterns

The platform runs `k6 run tests/k6/{profile}/index.ts`, so each profile directory **must** have an `index.ts`.

**Pattern A — Single re-export** (stress, spike, soak):
```typescript
// tests/k6/stress/index.ts
export { options, default } from "./system-stress.ts";
```

**Pattern B — Multi-scenario** (smoke, load):

When a profile has multiple test files, combine them using K6 scenarios:
```typescript
// tests/k6/smoke/index.ts
import { healthSmokeTest } from "./health-smoke.ts";
import { graphqlSmokeTest } from "./graphql-smoke.ts";

export const options: Options = {
  scenarios: {
    health: { executor: "constant-vus", exec: "healthSmoke", vus: 3, duration: "3m" },
    graphql: { executor: "constant-vus", exec: "graphqlSmoke", vus: 2, duration: "2m" },
  },
  thresholds: { ... },
};

export function healthSmoke() { healthSmokeTest(); }
export function graphqlSmoke() { graphqlSmokeTest(); }
```

Sibling files export named functions (not `export default`) and have no `export const options`.
Supplementary tests (e.g., `complete-graphql-coverage.ts`) remain standalone and can be run
via the platform's `test_script` input or locally with `k6 run tests/k6/load/complete-graphql-coverage.ts`.

### Platform Environment Variables

The K6 configuration supports platform-injected environment variables:

| Variable | Purpose | Default |
|----------|---------|---------|
| `BASE_URL` | Full URL to reach app | Constructed from HOST:PORT |
| `TARGET_URL` | Alias for `BASE_URL` | - |
| `HOST` | Target hostname | `localhost` |
| `PORT` | Target port | `4000` |
| `PEAK_VUS` | Peak virtual users for stress/spike/soak | `200` |
| `RAMP_UP` | Ramp-up duration | `5m` |
| `SUSTAIN` | Sustain duration at peak | `10m` |

### Configuration Utility

The shared config utility (`tests/k6/utils/config.ts`) handles environment variable resolution:

```typescript
import { getConfig, getStressConfig } from "../utils/config";

// Base configuration (BASE_URL, host, port, timeout)
const config = getConfig();
console.log(`Testing: ${config.baseUrl}`);

// Stress test parameters (PEAK_VUS, RAMP_UP, SUSTAIN)
const stressConfig = getStressConfig();
console.log(`Peak VUs: ${stressConfig.peakVUs}`);
```

### Using Dynamic Parameters in Tests

Stress, spike, and soak tests should use dynamic parameters:

```typescript
// tests/k6/stress/system-stress.ts
import { getStressConfig } from "../utils/config";

const stressConfig = getStressConfig();
const peakVUs = stressConfig.peakVUs;
const rampUp = stressConfig.rampUp;
const sustain = stressConfig.sustain;

export const options: Options = {
  stages: [
    { duration: rampUp, target: Math.floor(peakVUs * 0.5) },
    { duration: sustain, target: peakVUs },
    { duration: rampUp, target: 0 },
  ],
};
```

### GitLab CI/CD Integration

Example pipeline configuration using platform components:

```yaml
stages:
  - build
  - test
  - performance

include:
  - component: gitlab.com/platform_engineering/platform-components/docker-factory/docker-factory@1.0.0
    inputs:
      language: bun
      port: "4000"

  - component: gitlab.com/platform_engineering/platform-components/quality-assurance-runner/bun@1.0.0
    inputs:
      coverage_enabled: true
      coverage_threshold: "75"

  - component: gitlab.com/platform_engineering/platform-components/quality-assurance-runner/playwright@1.0.0
    inputs:
      install_command: "bun install --frozen-lockfile"
      service_port: "4000"

  - component: gitlab.com/platform_engineering/platform-components/quality-assurance-runner/k6@1.0.0
    inputs:
      profile: smoke
      service_port: "4000"
```

### Compliance Status

This project maintains full compliance with the Platform QA Components contract:

| Requirement | Status |
|-------------|--------|
| Health endpoint `/health` → 200 | ✅ |
| Server binding `0.0.0.0` | ✅ |
| K6 entry points (all 5 profiles) | ✅ |
| K6 `BASE_URL` support | ✅ |
| K6 dynamic parameters | ✅ |
| Playwright `BASE_URL` | ✅ |
| Directory structure | ✅ |

### Additional Resources

- Full contract documentation: `docs/deployment/platform-qa-contract.md`
- Platform components repository: `gitlab.com/platform_engineering/platform-components/quality-assurance-runner`

---

**Note**: This guide is based on the authentication service implementation. Adapt patterns, thresholds, and configurations to match your application's specific requirements.
