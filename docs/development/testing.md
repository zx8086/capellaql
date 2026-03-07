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
- [8. Playwright E2E Tests — Dual-Mode Pattern](#8-playwright-e2e-tests--dual-mode-pattern)
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
// ❌ AVOID: Traditional mocking approach
const mockKongAdapter = {
  getConsumer: vi.fn().mockResolvedValue({ id: "123" })
};

// ✅ PREFER: Live backend testing
const kongAdapter = new KongAdapter(process.env.KONG_ADMIN_URL);
const consumer = await kongAdapter.getConsumer("test-consumer-001");
expect(consumer.id).toBeDefined();
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

test("Kong adapter with remote IP", async () => {
  const response = await fetchWithFallback(
    "http://192.168.178.3:30001/consumers/test-consumer-001"
  );
  expect(response.ok).toBe(true);
});
```

### Graceful Skipping

```typescript
// test/shared/test-skip-conditions.ts
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

describe("Kong integration", () => {
  beforeAll(async () => {
    await skipIfServiceUnavailable("Kong", process.env.KONG_ADMIN_URL!);
  });

  test("get consumer", async () => {
    // Test runs only if Kong is available
  });
});
```

---

## 3. Test Directory Structure

### Standard Layout

```
test/
├── bun/                    # Unit tests (114 files)
│   ├── adapters/           # External service adapters (5 files)
│   ├── cache/              # Caching functionality (15 files)
│   ├── circuit-breaker/    # Circuit breaker patterns (5 files)
│   ├── config/             # Configuration management (9 files)
│   ├── handlers/           # HTTP request handlers (6 files)
│   ├── health/             # Health check endpoints (6 files)
│   ├── kong/               # Kong API Gateway integration (4 files)
│   ├── logging/            # Logging functionality (4 files)
│   ├── middleware/         # Request middleware (1 file)
│   ├── mutation/           # Mutation-resistant tests (2 files)
│   ├── services/           # Service layer (8 files)
│   ├── shared/             # Shared utilities (2 files)
│   ├── telemetry/          # Observability (18 files)
│   ├── types/              # Type definitions (1 file)
│   └── utils/              # Utility functions (19 files)
├── chaos/                  # Chaos engineering (4 files, 57 tests)
│   ├── kong-failure.test.ts
│   ├── redis-failure.test.ts
│   ├── network-partition.test.ts
│   └── resource-exhaustion.test.ts
├── integration/            # Integration tests (6 files)
│   ├── kong-adapter.integration.test.ts
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
| **Discoverability** | Find tests by domain: `test/bun/cache/` |
| **Selective Testing** | Run domain tests: `bun test test/bun/cache/` |
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
    "test:bun": "bun test test/bun/",
    "test:bun:watch": "bun test --watch test/bun/",
    "test:bun:coverage": "bun test --coverage test/bun/",
    "test:bun:coverage:ci": "bun test --coverage --coverage-reporter=json test/bun/",
    "test:bun:concurrent": "bun test --concurrent test/bun/",
    
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
test/bun/cache/
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
bun test test/bun/cache/                        # All cache tests
bun test test/bun/cache/cache-factory.test.ts  # Specific file
bun test --watch test/bun/cache/                # Watch mode
```

### Example: Service Layer Tests

```
test/bun/services/
├── jwt.service.test.ts                 # JWT generation/validation
├── jwt-error-path.test.ts              # JWT error scenarios
├── api-gateway.service.test.ts         # Live Kong integration
├── cache-health.service.test.ts        # Cache health service
├── kong-service-integration.test.ts    # Kong integration
├── circuit-breaker-service.test.ts     # Circuit breaker patterns
└── token-service-integration.test.ts   # Token service integration
```

### Naming Conventions

| Suffix | Purpose | Example |
|--------|---------|---------|
| `.test.ts` | Standard unit test | `jwt.service.test.ts` |
| `.integration.test.ts` | Integration with live deps | `kong-service.integration.test.ts` |
| `.mutation.test.ts` | Mutation-resistant tests | `jwt.mutation.test.ts` |
| `-errors.test.ts` | Error path coverage | `cache-factory-errors.test.ts` |
| `-edge-cases.test.ts` | Edge case scenarios | `cache-health-edge-cases.test.ts` |

---

## 6. Bun Unit Tests — Best Practices

### Test Structure Pattern

```typescript
// test/bun/services/jwt.service.test.ts
import { describe, test, expect, beforeAll } from "bun:test";
import { JwtService } from "../../../src/services/jwt.service";
import { skipIfServiceUnavailable } from "../../shared/test-skip-conditions";

describe("JwtService", () => {
  let jwtService: JwtService;

  beforeAll(async () => {
    // Skip tests if dependencies unavailable
    await skipIfServiceUnavailable("Redis", process.env.REDIS_URL!);
    
    jwtService = new JwtService({
      secret: process.env.JWT_SECRET!,
      issuer: "https://sts.example.com/",
      audience: "http://api.example.com/"
    });
  });

  describe("Token Generation", () => {
    test("generates valid JWT token", async () => {
      const token = await jwtService.generateToken({
        sub: "test-user-001",
        username: "testuser"
      });

      expect(token).toBeString();
      expect(token.split(".")).toHaveLength(3); // JWT format
    });

    test("token contains correct claims", async () => {
      const token = await jwtService.generateToken({
        sub: "test-user-001",
        username: "testuser"
      });

      const claims = await jwtService.verifyToken(token);
      expect(claims.sub).toBe("test-user-001");
      expect(claims.username).toBe("testuser");
      expect(claims.iss).toBe("https://sts.example.com/");
    });

    test("token expires after configured duration", async () => {
      const token = await jwtService.generateToken({
        sub: "test-user-001"
      }, { expiresIn: "1s" });

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      await expect(jwtService.verifyToken(token)).rejects.toThrow("expired");
    });
  });

  describe("Token Validation", () => {
    test("rejects invalid signature", async () => {
      const tamperedToken = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.invalid.signature";
      
      await expect(jwtService.verifyToken(tamperedToken))
        .rejects.toThrow("invalid signature");
    });

    test("rejects malformed tokens", async () => {
      await expect(jwtService.verifyToken("not-a-jwt"))
        .rejects.toThrow("malformed");
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
// For tests with external API calls
test("Kong adapter fetches consumer", async () => {
  const adapter = new KongAdapter(process.env.KONG_ADMIN_URL!);
  
  const consumer = await adapter.getConsumer("test-consumer-001", {
    signal: AbortSignal.timeout(5000) // 5-second timeout
  });

  expect(consumer.id).toBeDefined();
}, { timeout: 6000 }); // Test timeout slightly higher than fetch timeout
```

---

## 7. Integration Tests — Real Dependencies

### Kong Integration Test

```typescript
// test/integration/kong-adapter.integration.test.ts
import { describe, test, expect, beforeAll } from "bun:test";
import { KongAdapter } from "../../src/adapters/kong.adapter";
import { skipIfServiceUnavailable } from "../shared/test-skip-conditions";

describe("Kong Adapter Integration", () => {
  let adapter: KongAdapter;

  beforeAll(async () => {
    const kongUrl = process.env.KONG_ADMIN_URL;
    if (!kongUrl) {
      throw new Error("KONG_ADMIN_URL not configured");
    }

    await skipIfServiceUnavailable("Kong Admin API", kongUrl);
    adapter = new KongAdapter(kongUrl);
  });

  describe("Consumer Operations", () => {
    test("fetches existing consumer", async () => {
      const consumer = await adapter.getConsumer("test-consumer-001");

      expect(consumer).toBeDefined();
      expect(consumer.id).toBeString();
      expect(consumer.username).toBe("test-consumer-001");
    });

    test("returns null for non-existent consumer", async () => {
      const consumer = await adapter.getConsumer("non-existent-consumer");
      expect(consumer).toBeNull();
    });

    test("handles network errors gracefully", async () => {
      const badAdapter = new KongAdapter("http://invalid-url:9999");
      
      await expect(badAdapter.getConsumer("test"))
        .rejects.toThrow();
    });
  });

  describe("Circuit Breaker Integration", () => {
    test("circuit opens after threshold errors", async () => {
      const circuitBreakerAdapter = new KongAdapter(
        "http://invalid-url:9999",
        { circuitBreaker: { threshold: 0.5, windowSize: 10 } }
      );

      // Force errors to open circuit
      for (let i = 0; i < 6; i++) {
        try {
          await circuitBreakerAdapter.getConsumer("test");
        } catch {}
      }

      // Circuit should be open now - fast rejection
      const start = Date.now();
      try {
        await circuitBreakerAdapter.getConsumer("test");
      } catch (error) {
        const duration = Date.now() - start;
        expect(duration).toBeLessThan(50); // Fast rejection
        expect(error.message).toContain("Circuit breaker is OPEN");
      }
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

## 8. Playwright E2E Tests — Dual-Mode Pattern

### Dual-Mode Testing Architecture

Tests support two execution modes for flexibility:

```
┌─────────────────────────────────────────────────────────────┐
│  Dual-Mode E2E Testing                                       │
│                                                              │
│  Mode 1: Direct (CI-Safe)          Mode 2: Via Kong         │
│  ┌────────────────────┐            ┌────────────────────┐  │
│  │  Playwright Test   │            │  Playwright Test   │  │
│  └─────────┬──────────┘            └─────────┬──────────┘  │
│            │                                  │             │
│            │ X-Consumer-* headers             │ API Key     │
│            ▼                                  ▼             │
│  ┌────────────────────┐            ┌────────────────────┐  │
│  │  localhost:3000    │            │  localhost:8000    │  │
│  │  (Direct)          │            │  (Kong Proxy)      │  │
│  └────────────────────┘            └─────────┬──────────┘  │
│                                               │             │
│                                               ▼             │
│                                     ┌────────────────────┐  │
│                                     │  localhost:3000    │  │
│                                     │  (Backend)         │  │
│                                     └────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Mode Detection Implementation

```typescript
// test/playwright/shared/test-mode.ts
export type TestMode = "direct" | "via-kong";

export function detectTestMode(): TestMode {
  return process.env.TEST_MODE === "via-kong" ? "via-kong" : "direct";
}

export function getBaseUrl(mode: TestMode): string {
  if (mode === "via-kong") {
    return process.env.KONG_PROXY_URL || "http://localhost:8000";
  }
  return process.env.API_BASE_URL || "http://localhost:3000";
}

export function getAuthHeaders(mode: TestMode, consumerId: string) {
  if (mode === "via-kong") {
    // Kong mode: Use API key authentication
    return {
      "apikey": process.env[`TEST_CONSUMER_${consumerId}_API_KEY`]!
    };
  }
  
  // Direct mode: Use X-Consumer-* headers
  return {
    "X-Consumer-Id": `test-consumer-${consumerId}`,
    "X-Consumer-Username": `loadtest-user-${consumerId}`,
    "X-Anonymous-Consumer": "false"
  };
}
```

### Dual-Mode Test Example

```typescript
// test/playwright/consolidated-business.e2e.ts
import { test, expect } from "@playwright/test";
import { detectTestMode, getBaseUrl, getAuthHeaders } from "./shared/test-mode";

const testMode = detectTestMode();
const baseUrl = getBaseUrl(testMode);

test.describe(`JWT Token Generation (${testMode})`, () => {
  test("generates valid JWT token", async ({ request }) => {
    const headers = getAuthHeaders(testMode, "001");

    const response = await request.post(`${baseUrl}/tokens`, { headers });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    
    expect(body.access_token).toBeDefined();
    expect(body.access_token.split(".")).toHaveLength(3); // JWT format
    expect(body.expires_in).toBe(900); // 15 minutes
  });

  test("rejects anonymous consumers", async ({ request }) => {
    const headers = testMode === "via-kong" 
      ? {} // No auth header
      : {
          "X-Consumer-Id": "anonymous",
          "X-Anonymous-Consumer": "true"
        };

    const response = await request.post(`${baseUrl}/tokens`, { headers });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Anonymous consumers are not allowed");
  });

  test("multiple users get unique tokens", async ({ request }) => {
    const headers1 = getAuthHeaders(testMode, "001");
    const headers2 = getAuthHeaders(testMode, "002");

    const [response1, response2] = await Promise.all([
      request.post(`${baseUrl}/tokens`, { headers: headers1 }),
      request.post(`${baseUrl}/tokens`, { headers: headers2 })
    ]);

    const token1 = (await response1.json()).access_token;
    const token2 = (await response2.json()).access_token;

    expect(token1).not.toBe(token2); // Unique tokens
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
    baseURL: process.env.API_BASE_URL || "http://localhost:3000",
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
        baseURL: "http://localhost:3000" // Always direct mode
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
    url: "http://localhost:3000/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
```

### CI-Safe Tests

```typescript
// test/playwright/ci-safe.e2e.ts
import { test, expect } from "@playwright/test";

// Tests that run WITHOUT Kong dependencies
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
    const response = await request.fetch("/tokens", {
      method: "OPTIONS"
    });
    expect(response.ok()).toBeTruthy();
  });
});
```

### API Best Practices Tests

```typescript
// test/playwright/api-best-practices.e2e.ts
import { test, expect } from "@playwright/test";

test.describe("API Best Practices", () => {
  test.describe("Method Validation (RFC 9110)", () => {
    test("returns 405 with Allow header for invalid method", async ({ request }) => {
      const response = await request.fetch("/tokens", { method: "PUT" });
      
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
      
      const response = await request.post("/tokens", {
        data: largePayload,
        headers: { "Content-Type": "application/json" }
      });

      expect(response.status()).toBe(413); // Payload Too Large
    });
  });

  test.describe("Content-Type Validation", () => {
    test("rejects invalid Content-Type", async ({ request }) => {
      const response = await request.post("/tokens", {
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
test/k6/
├── smoke/                          # Quick validation (3min each)
│   ├── health-smoke.ts             # Health endpoint
│   ├── tokens-smoke.ts             # JWT generation
│   ├── metrics-smoke.ts            # Metrics endpoint
│   ├── openapi-smoke.ts            # OpenAPI spec
│   ├── profiling-smoke.ts          # Profiling endpoints
│   └── all-endpoints-smoke.ts      # Comprehensive
├── load/                           # Production simulation
│   ├── auth-load.ts                # Authentication flow
│   ├── mixed-traffic-load.ts       # Realistic patterns
│   └── sustained-load.ts           # Extended test
├── stress/                         # Breaking point
│   ├── system-stress.ts            # Find limits
│   ├── high-concurrency-stress.ts  # Max users
│   └── resource-exhaustion.ts      # Memory/CPU
├── spike/                          # Traffic burst
│   ├── traffic-spike.ts            # Sudden load
│   └── recovery-spike.ts           # Recovery testing
├── soak/                           # Extended endurance
│   ├── endurance-soak.ts           # Long-running
│   └── memory-leak-detection.ts    # Resource leaks
└── shared/                         # Utilities
    ├── config.ts                   # Test configuration
    ├── thresholds.ts               # Performance thresholds
    └── scenarios.ts                # Reusable scenarios
```

### Smoke Test Example

```typescript
// test/k6/smoke/tokens-smoke.ts
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";
import { smokeOptions, getBaseUrl } from "../shared/config";

// Custom metrics
const errorRate = new Rate("errors");

export const options = {
  ...smokeOptions,
  thresholds: {
    http_req_duration: ["p(95)<50", "p(99)<100"],
    http_req_failed: ["rate<0.01"],
    errors: ["rate<0.01"]
  }
};

const BASE_URL = getBaseUrl();

export default function () {
  // JWT token generation
  const headers = {
    "X-Consumer-Id": "test-consumer-001",
    "X-Consumer-Username": "loadtest-user-001",
    "X-Anonymous-Consumer": "false"
  };

  const response = http.post(`${BASE_URL}/tokens`, null, { headers });

  const success = check(response, {
    "status is 200": (r) => r.status === 200,
    "has access_token": (r) => r.json("access_token") !== undefined,
    "token is JWT format": (r) => {
      const token = r.json("access_token");
      return token && token.split(".").length === 3;
    },
    "expires_in is 900": (r) => r.json("expires_in") === 900
  });

  errorRate.add(!success);
  sleep(1);
}
```

### Load Test Example

```typescript
// test/k6/load/auth-load.ts
import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import { loadOptions, getBaseUrl } from "../shared/config";

export const options = {
  ...loadOptions,
  stages: [
    { duration: "2m", target: 10 },  // Ramp up
    { duration: "5m", target: 20 },  // Steady state
    { duration: "2m", target: 0 }    // Ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<200", "p(99)<500"],
    http_req_failed: ["rate<0.05"],
    http_reqs: ["rate>100"]
  }
};

const BASE_URL = getBaseUrl();

// Load test consumers from shared data
const consumers = new SharedArray("consumers", function () {
  return [
    { id: "test-consumer-001", username: "loadtest-user-001" },
    { id: "test-consumer-002", username: "loadtest-user-002" },
    { id: "test-consumer-003", username: "loadtest-user-003" }
  ];
});

export default function () {
  // Select random consumer
  const consumer = consumers[Math.floor(Math.random() * consumers.length)];

  // Generate token
  const tokenResponse = http.post(`${BASE_URL}/tokens`, null, {
    headers: {
      "X-Consumer-Id": consumer.id,
      "X-Consumer-Username": consumer.username,
      "X-Anonymous-Consumer": "false"
    }
  });

  check(tokenResponse, {
    "token generated": (r) => r.status === 200
  });

  if (tokenResponse.status === 200) {
    const token = tokenResponse.json("access_token");

    // Validate token
    const validateResponse = http.post(
      `${BASE_URL}/tokens/validate`,
      null,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "X-Consumer-Id": consumer.id,
          "X-Consumer-Username": consumer.username
        }
      }
    );

    check(validateResponse, {
      "token valid": (r) => r.status === 200 && r.json("valid") === true
    });
  }

  sleep(Math.random() * 2 + 1); // 1-3 second think time
}
```

---

## 11. K6 Performance Tests — Configuration

### Shared Configuration

```typescript
// test/k6/shared/config.ts
export function getBaseUrl(): string {
  const protocol = __ENV.TARGET_PROTOCOL || "http";
  const host = __ENV.TARGET_HOST || "localhost";
  const port = __ENV.TARGET_PORT || "3000";
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
TARGET_PORT=3000
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
K6_TOKENS_P95_THRESHOLD=50
K6_TOKENS_P99_THRESHOLD=100

# Non-blocking thresholds (CI-friendly)
K6_THRESHOLDS_NON_BLOCKING=false
```

### package.json Scripts

```json
{
  "scripts": {
    "k6:smoke:health": "k6 run test/k6/smoke/health-smoke.ts",
    "k6:smoke:tokens": "k6 run test/k6/smoke/tokens-smoke.ts",
    "k6:smoke:all-endpoints": "k6 run test/k6/smoke/all-endpoints-smoke.ts",
    
    "k6:load": "k6 run test/k6/load/auth-load.ts",
    "k6:stress": "k6 run test/k6/stress/system-stress.ts",
    "k6:spike": "k6 run test/k6/spike/traffic-spike.ts",
    "k6:soak": "k6 run test/k6/soak/endurance-soak.ts",
    
    "test:k6:quick": "bun run k6:smoke:health && bun run k6:smoke:tokens"
  }
}
```

---

## 12. K6 Performance Tests — Best Practices

### Custom Metrics

```typescript
// test/k6/shared/metrics.ts
import { Counter, Gauge, Rate, Trend } from "k6/metrics";

export const errorRate = new Rate("errors");
export const tokenGenTime = new Trend("token_generation_time");
export const activeUsers = new Gauge("active_users");
export const totalRequests = new Counter("total_requests");

export function trackTokenGeneration(duration: number) {
  tokenGenTime.add(duration);
}

export function trackError() {
  errorRate.add(1);
}

export function trackSuccess() {
  errorRate.add(0);
}
```

**Usage:**
```typescript
import { trackTokenGeneration, trackError, trackSuccess } from "../shared/metrics";

export default function () {
  const start = Date.now();
  const response = http.post(`${BASE_URL}/tokens`, null, { headers });
  const duration = Date.now() - start;

  if (response.status === 200) {
    trackTokenGeneration(duration);
    trackSuccess();
  } else {
    trackError();
  }
}
```

### Realistic User Behavior

```typescript
// test/k6/load/realistic-behavior.ts
import http from "k6/http";
import { sleep } from "k6";

export default function () {
  // User journey: authenticate → use API → logout pattern
  
  // 1. Generate token (70% of users)
  if (Math.random() < 0.7) {
    const tokenResponse = http.post(`${BASE_URL}/tokens`, null, { headers });
    
    if (tokenResponse.status === 200) {
      const token = tokenResponse.json("access_token");
      
      // 2. Make authenticated API calls (2-5 calls)
      const callCount = Math.floor(Math.random() * 4) + 2;
      for (let i = 0; i < callCount; i++) {
        http.get(`${BASE_URL}/api/resource`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        sleep(Math.random() * 2); // Think time between calls
      }
    }
  }
  
  // 3. Health check monitoring (20% of traffic)
  if (Math.random() < 0.2) {
    http.get(`${BASE_URL}/health`);
  }
  
  // 4. Metrics polling (10% of traffic)
  if (Math.random() < 0.1) {
    http.get(`${BASE_URL}/metrics`);
  }

  sleep(Math.random() * 5 + 3); // 3-8 second think time
}
```

### Performance Baselines

```typescript
// test/k6/shared/baselines.ts
export const performanceBaselines = {
  health: {
    p95: 30,  // ms
    p99: 50
  },
  tokens: {
    p95: 50,
    p99: 100
  },
  metrics: {
    p95: 20,
    p99: 50
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

### Legacy Chaos Test Categories

```
test/chaos/
├── kong-failure.test.ts           # Kong Admin API failures (19 tests)
├── redis-failure.test.ts          # Redis cache failures (14 tests)
├── network-partition.test.ts      # Network issues (10 tests)
└── resource-exhaustion.test.ts    # Memory/CPU pressure (14 tests)
```

### Kong Failure Scenarios

```typescript
// test/chaos/kong-failure.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { KongAdapter } from "../../src/adapters/kong.adapter";
import { MockKongServer } from "../shared/mock-kong-server";

describe("Chaos: Kong Failures", () => {
  let mockServer: MockKongServer;
  let adapter: KongAdapter;

  beforeEach(() => {
    mockServer = new MockKongServer({ failureMode: "timeout" });
    adapter = new KongAdapter(mockServer.url, {
      circuitBreaker: { 
        threshold: 0.5, 
        windowSize: 10,
        timeout: 100 // Fast timeout for chaos testing
      }
    });
  });

  afterEach(async () => {
    await mockServer.close();
  });

  test("circuit opens after 50% error rate", async () => {
    // Force 6 failures out of 10 requests
    for (let i = 0; i < 6; i++) {
      try {
        await adapter.getConsumer("test");
      } catch {}
    }

    // Circuit should be OPEN now
    const start = Date.now();
    try {
      await adapter.getConsumer("test");
    } catch (error) {
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(50); // Fast rejection
      expect(error.message).toContain("Circuit breaker is OPEN");
    }
  });

  test("falls back to stale cache during Kong outage", async () => {
    // Pre-populate cache
    mockServer.setMode("success");
    const consumer = await adapter.getConsumer("test-consumer-001");
    
    // Simulate Kong outage
    mockServer.setMode("failure");
    
    // Should return stale cached data
    const staleConsumer = await adapter.getConsumer("test-consumer-001");
    expect(staleConsumer).toEqual(consumer);
    expect(staleConsumer._stale).toBe(true);
  });

  test("circuit half-opens after timeout", async () => {
    // Open circuit
    for (let i = 0; i < 6; i++) {
      try { await adapter.getConsumer("test"); } catch {}
    }

    // Wait for half-open timeout (60 seconds in config)
    await new Promise(resolve => setTimeout(resolve, 60_100));

    // Circuit should attempt recovery
    mockServer.setMode("success");
    const consumer = await adapter.getConsumer("test-consumer-001");
    expect(consumer).toBeDefined();
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
import { ApiGatewayService } from "../../src/services/api-gateway.service";
import { FlakeyNetworkSimulator } from "../shared/flakey-network";

describe("Chaos: Network Partitions", () => {
  let service: ApiGatewayService;
  let network: FlakeyNetworkSimulator;

  beforeEach(() => {
    network = new FlakeyNetworkSimulator({ 
      failureRate: 0.3, // 30% packet loss
      latency: { min: 50, max: 200 }
    });
    
    service = new ApiGatewayService({
      baseUrl: network.url,
      retry: { maxAttempts: 3, backoff: "exponential" }
    });
  });

  test("retries succeed despite intermittent failures", async () => {
    network.setFailureRate(0.3); // 30% failure rate

    const consumer = await service.getConsumer("test-consumer-001");
    expect(consumer).toBeDefined(); // Eventually succeeds
  });

  test("circuit stays closed for occasional failures", async () => {
    network.setFailureRate(0.2); // 20% failure rate (below threshold)

    // Make 50 requests
    for (let i = 0; i < 50; i++) {
      try {
        await service.getConsumer("test-consumer-001");
      } catch {}
    }

    // Circuit should still be CLOSED
    const consumer = await service.getConsumer("test-consumer-001");
    expect(consumer).toBeDefined(); // No fast rejection
  });

  test("circuit opens for frequent failures", async () => {
    network.setFailureRate(0.8); // 80% failure rate

    // Force circuit to open
    for (let i = 0; i < 10; i++) {
      try {
        await service.getConsumer("test");
      } catch {}
    }

    // Circuit should be OPEN
    const start = Date.now();
    try {
      await service.getConsumer("test");
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
      fetch("http://localhost:3000/health")
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
// test/bun/mutation/jwt.mutation.test.ts
import { describe, test, expect } from "bun:test";
import { JwtService } from "../../../src/services/jwt.service";

describe("JWT Mutation Killers", () => {
  const jwtService = new JwtService({
    secret: "test-secret-key-for-mutation-testing",
    issuer: "https://sts.example.com/",
    audience: "http://api.example.com/"
  });

  test("KILL: Token must contain exactly 3 parts", async () => {
    const token = await jwtService.generateToken({ sub: "user-001" });
    
    // Mutation: Changing split(".") to split("-") must fail
    expect(token.split(".")).toHaveLength(3);
  });

  test("KILL: Expiration must be enforced", async () => {
    const token = await jwtService.generateToken(
      { sub: "user-001" },
      { expiresIn: "1s" }
    );

    await new Promise(resolve => setTimeout(resolve, 1100));

    // Mutation: Removing expiration check must fail
    await expect(jwtService.verifyToken(token))
      .rejects.toThrow("expired");
  });

  test("KILL: Invalid signature must be rejected", async () => {
    const validToken = await jwtService.generateToken({ sub: "user-001" });
    const [header, payload] = validToken.split(".");
    const tamperedToken = `${header}.${payload}.invalidsignature`;

    // Mutation: Removing signature verification must fail
    await expect(jwtService.verifyToken(tamperedToken))
      .rejects.toThrow("invalid signature");
  });

  test("KILL: Claims must match exactly", async () => {
    const token = await jwtService.generateToken({
      sub: "user-001",
      username: "testuser"
    });

    const claims = await jwtService.verifyToken(token);

    // Mutation: Changing claim values must fail
    expect(claims.sub).toBe("user-001");
    expect(claims.username).toBe("testuser");
    expect(claims.iss).toBe("https://sts.example.com/");
    expect(claims.aud).toBe("http://api.example.com/");
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

- JWT token generation and validation
- Authentication/authorization logic
- Data persistence operations
- External API integrations
- Circuit breaker implementations
- Cache fallback mechanisms

### Coverage Commands

```bash
# Generate coverage report
bun run test:bun:coverage

# Coverage with HTML report
bun run test:bun:coverage && open coverage/index.html

# CI coverage (JSON only)
bun run test:bun:coverage:ci

# Coverage for specific domain
bun test --coverage test/bun/services/
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
          curl --retry 10 --retry-delay 1 http://localhost:3000/health

      - name: Run E2E tests
        run: bun run test:e2e
        env:
          API_BASE_URL: http://localhost:3000

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
// test/shared/test-skip-conditions.ts
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

export async function skipIfKongUnavailable() {
  const kongUrl = process.env.KONG_ADMIN_URL;
  if (!kongUrl) {
    test.skip("KONG_ADMIN_URL not configured");
  }
  await skipIfServiceUnavailable("Kong Admin API", kongUrl);
}
```

### Test Consumers

```typescript
// test/shared/test-consumers.ts
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
// test/shared/fetch-polyfill.ts
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
// test/shared/mock-kong-server.ts
import { serve, Server } from "bun";

export class MockKongServer {
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
      throw new Error("Simulated network error");
    }

    if (this.failureMode === "500") {
      return new Response("Internal Server Error", { status: 500 });
    }

    // Success mode
    const url = new URL(req.url);
    if (url.pathname.includes("/consumers/")) {
      const consumerId = url.pathname.split("/").pop();
      return Response.json({
        id: consumerId,
        username: consumerId,
        custom_id: `custom-${consumerId}`
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
PORT=3000
HOST=localhost

# JWT
JWT_SECRET=test-secret-key-for-testing-only
JWT_ISSUER=https://sts.example.com/
JWT_AUDIENCE=http://api.example.com/
JWT_EXPIRATION=900

# Kong Admin API (live integration)
KONG_ADMIN_URL=http://192.168.178.3:30001

# Redis (test database)
REDIS_URL=redis://localhost:6379
REDIS_DB=10

# Telemetry (console mode for testing)
TELEMETRY_MODE=console
OTEL_SERVICE_NAME=authentication-service-test

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
| `/tokens` (generation) | <50ms | <100ms | >1000 req/s |
| `/tokens/validate` | <50ms | <100ms | >1500 req/s |
| `/metrics` | <20ms | <50ms | >3000 req/s |
| `/` (OpenAPI) | <10ms | <20ms | >5000 req/s |

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
| Kong integration fails | Bun fetch networking bug | `fetchWithFallback()` handles automatically via curl |
| Mutation testing ENOEXEC | Missing bundled Bun | Run `bun run build:bun-bundle` |
| StrykerJS parse errors | Wrong test reporter | Use `--reporter=dots` for mutation testing |
| High memory usage in tests | No cleanup | Add `afterEach` to clear caches and close connections |

### Debugging Commands

```bash
# Verbose test output
bun test --verbose test/bun/specific.test.ts

# Debug single test
bun --inspect test test/bun/specific.test.ts

# Check service connectivity
curl http://192.168.178.3:30001/status  # Kong
redis-cli -h localhost -p 6379 ping     # Redis

# Test curl fallback
LOG_LEVEL=debug bun test test/bun/kong/
# Look for: "Fetch failed, trying curl fallback"

# Verify mutation testing setup
BUN_BE_BUN=1 ./scripts/bundled-runtimes/bun-cli --version
```

### Performance Debugging

```bash
# K6 verbose output
K6_LOG_LEVEL=debug k6 run test/k6/load/auth-load.ts

# Playwright trace
npx playwright test --trace on

# Memory profiling
bun --heap-prof test/bun/services/jwt.service.test.ts
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
bun test test/bun/cache/             # Domain-specific

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
