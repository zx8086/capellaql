# Testing Guide

This document consolidates all testing documentation for the authentication service, including unit tests, E2E tests, performance tests, and mutation testing.

## Overview

| Metric | Value |
|--------|-------|
| **Total Test Count** | 3191 tests (100% pass rate) |
| **Bun Unit/Integration Tests** | 3191 tests across 121 files |
| **Chaos Engineering Tests** | 57 tests across 4 suites |
| **Playwright E2E Tests** | 58 tests across 4 files |
| **Mutation Score** | 100% (all mutants killed) |
| **Overall Coverage** | 80%+ line coverage |

### Test Organization

112 Bun test files organized into logical subdirectories by domain (121 total files including chaos and integration when run via `bun test`):

| Directory | Files | Purpose |
|-----------|-------|---------|
| `adapters/` | 4 | Kong adapter integration, mutation killers |
| `cache/` | 15 | Caching functionality, stale data, resilience |
| `circuit-breaker/` | 5 | Circuit breaker patterns, state transitions |
| `config/` | 9 | Configuration validation, 4-pillar pattern |
| `handlers/` | 6 | HTTP request handlers (tokens, OpenAPI) |
| `health/` | 6 | Health check endpoints, telemetry |
| `kong/` | 4 | Kong API Gateway integration |
| `lifecycle/` | 5 | Lifecycle management, graceful shutdown |
| `logging/` | 5 | Winston integration, logging container |
| `middleware/` | 1 | Request validation middleware |
| `mutation/` | 2 | Mutation-resistant test patterns |
| `services/` | 8 | Service layer (JWT, caching, cache health) |
| `shared/` | 2 | Test utilities, consumer secrets |
| `telemetry/` | 20 | Observability, metrics, instrumentation |
| `types/` | 1 | Type definitions and validation |
| `utils/` | 19 | Utility functions (error codes, validation, fetch fallback) |

---

## 1. Bun Unit & Integration Tests

Located in `test/bun/` directory.

### Running Tests

```bash
# Run all tests
bun run test:bun

# Run tests by subdirectory
bun test test/bun/cache/              # All cache tests
bun test test/bun/kong/               # All Kong integration tests
bun test test/bun/circuit-breaker/    # All circuit breaker tests
bun test test/bun/telemetry/          # All telemetry tests

# Run specific test files
bun test test/bun/config/config.test.ts
bun test test/bun/services/jwt.service.test.ts

# Run with coverage
bun run test:bun:coverage

# Watch mode for development
bun run test:bun:watch

# Concurrent execution (faster)
bun run test:bun:concurrent
```

### Parallel Test Execution

The test suite is optimized for parallel execution with proper isolation.

**Timeout Configuration:**
- 5-second timeout for external API calls (Kong Admin API)
- Configured in test utilities: `{ signal: AbortSignal.timeout(5000) }`

**Redis Database Separation:**
- Test suite uses Redis DB 10 (separate from production DB 0)
- Each test can flush DB 10 without affecting other environments

**Best Practices:**
```typescript
// PREFER: Functional equivalence (stable in parallel execution)
expect(cachedObject.id).toBe(originalObject.id);
expect(cachedObject.username).toBe(originalObject.username);

// AVOID: Instance equality (fragile in concurrent tests)
expect(cachedObject).toBe(originalObject);
```

### Debugging Bun Tests

```bash
# Run single test with debug output
bun test --verbose test/bun/specific.test.ts

# Debug with Node.js debugger
bun --inspect test specific.test.ts
```

---

## 2. Integration Tests

### Running Integration Tests

```bash
# Run all integration tests
bun run test:integration

# Kong-specific integration tests
bun run test:integration:kong

# Circuit breaker integration tests
bun run test:integration:circuit

# Full integration with Docker setup
bun run test:integration:full

# Seed test consumers in Kong
bun run test:integration:seed
```

### Network Configuration (Curl Fallback)

The Bun fetch networking bug with remote IPs is automatically handled by the curl fallback workaround.

**The Problem:**
Bun v1.3.x has known issues connecting to private/LAN IP addresses (e.g., `192.168.x.x`), throwing `FailedToOpenSocket: Was there a typo in the url or port?` errors even when curl can reach the same URL. This affects:
- Kong Admin API connections
- OTEL collector health checks
- Any service on private network IPs

**Known Bun Issues:** See [Bun Fetch Curl Fallback](profiling.md#bun-fetch-curl-fallback-sio-288) for full list.

**Features:**
- No manual configuration needed - works out of the box
- Transparent fallback - activates when Bun fetch fails
- Zero overhead - only uses curl when native fetch fails
- HEAD requests use `-I` flag for proper handling
- 3-second curl timeout prevents long waits

**Usage:**
```bash
# .env
KONG_ADMIN_URL=http://192.168.178.3:30001
OTEL_EXPORTER_OTLP_ENDPOINT=http://192.168.178.3:4318

# Run integration tests - curl fallback handles networking automatically
bun run test:integration
```

**How It Works:**
```typescript
import { fetchWithFallback } from '../utils/bun-fetch-fallback';

// Tries fetch() first, falls back to curl if needed
const response = await fetchWithFallback(kongAdminUrl);
```

**Test Polyfill:**
The test setup (`test/integration/setup.ts`) provides `enableFetchPolyfill()` which replaces `globalThis.fetch` with the curl fallback version for tests that import modules using native fetch.

### Alternative: Manual Port Forwarding

If you prefer not to use curl fallback:

```bash
# SSH Port Forward
ssh -L 8001:192.168.178.3:30001 user@192.168.178.3 -N -f
KONG_ADMIN_URL=http://localhost:8001

# kubectl Port Forward (if Kong is in Kubernetes)
kubectl port-forward -n kong svc/kong-admin 8001:8001
```

---

## 3. Playwright E2E Tests

Located in `test/playwright/` directory.

### Running E2E Tests

```bash
# Run all E2E tests (direct mode - no Kong required)
bun run test:e2e

# Run via Kong (requires devcontainer)
bun run test:e2e:kong

# Run CI-safe tests only (no Kong dependency)
npx playwright test --project=ci-chromium

# Run full business tests (requires Kong)
npx playwright test --project=chromium

# Interactive test runner
bun run playwright:ui

# Debug mode
npx playwright test --debug
```

### Dual-Mode E2E Testing

Tests support two execution modes for flexibility:

| Mode | Command | Description |
|------|---------|-------------|
| Direct | `bun run test:e2e` | Tests directly against localhost:3000 using X-Consumer-* headers |
| Via Kong | `bun run test:e2e:kong` | Tests via Kong (localhost:8000) using API keys, captures http-log |

**See [Kong Integration Guide](kong-test-setup.md#dual-mode-e2e-testing)** for comprehensive documentation including:
- Mode detection implementation
- Authentication header selection
- Authentication flow diagrams
- Test behavior differences by mode

### Test Projects

| Project | Description |
|---------|-------------|
| `ci-safe` | Kong-independent API validation |
| `chromium/firefox/webkit` | Full business flow tests |
| `mobile` | Mobile browser testing |
| `profiling` | Performance analysis tests |

### CI-Safe Tests

Tests that run without Kong dependencies:
- Health endpoint validation
- Metrics endpoint functionality
- OpenAPI documentation availability
- Error handling consistency
- CORS support validation

### Debugging Playwright Tests

```bash
# Debug mode with browser
npx playwright test --debug

# Headed mode
npx playwright test --headed

# Trace viewer
npx playwright show-trace trace.zip
```

---

## 4. K6 Performance Testing

Located in `test/k6/` directory.

### Running Performance Tests

```bash
# Quick smoke tests
bun run k6:quick               # Health + tokens smoke tests
bun run k6:smoke:health        # Health endpoint only
bun run k6:smoke:tokens        # JWT token generation

# Load testing
bun run k6:load                # Sustained load testing

# Stress testing
bun run k6:stress              # High-load stress testing
```

### Performance Thresholds

```javascript
export const options = {
  thresholds: {
    http_req_duration: ['p(95)<100', 'p(99)<200'],
    http_req_failed: ['rate<0.01'],
    http_reqs: ['rate>1000'],
  },
};
```

### Debugging K6 Tests

```bash
# Verbose output
k6 run --verbose test/k6/specific.ts

# Debug logging
K6_LOG_LEVEL=debug k6 run test/k6/specific.ts
```

### K6 v0.57.0 Features

The project uses K6 v0.57.0 with native TypeScript support:

| Feature | Description |
|---------|-------------|
| **Native TypeScript** | Direct `.ts` execution without bundling (esbuild built-in) |
| **Improved Performance** | Faster test startup and execution |
| **Better Error Messages** | Enhanced stack traces for TypeScript files |
| **Type Checking** | Full TypeScript type support in test files |

**Key Configuration:**
```typescript
// test/k6/shared/config.ts - Centralized threshold configuration
export const smokeOptions = {
  thresholds: {
    http_req_duration: ['p(95)<100', 'p(99)<200'],
    http_req_failed: ['rate<0.01'],
  },
};
```

**Environment Variables:**
```bash
# Non-blocking thresholds (CI-friendly)
K6_THRESHOLDS_NON_BLOCKING=true

# Smoke test configuration
K6_SMOKE_VUS=1
K6_SMOKE_DURATION=3s

# Load test configuration
K6_LOAD_TARGET_VUS=10
K6_LOAD_STEADY_DURATION=30s
```

---

## 5. Mutation Testing with StrykerJS

### Why Mutation Testing?

Code coverage tells you which lines were executed, but not whether tests **verify** anything.

**Example - Weak Test (100% Coverage, 0% Confidence):**
```typescript
test("should calculate price", () => {
  const result = calculateDiscount(100, "premium");
  expect(result).toBeDefined();  // Any value passes!
});
```

**Strong Test (100% Coverage, 100% Mutation Score):**
```typescript
test("premium customers get 20% discount", () => {
  const result = calculateDiscount(100, "premium");
  expect(result).toBe(80);  // Exact value required
});
```

| Metric | What It Tells You |
|--------|-------------------|
| **Code Coverage** | "This code was executed during tests" |
| **Mutation Score** | "Tests would catch real bugs in this code" |

### Commands Reference

```bash
# Fresh run (clears cache, full mutation testing) - 79 minutes
bun run test:mutation:fresh

# Incremental run (uses cache) - 26 seconds
bun run test:mutation

# Dry run (show mutants without running tests)
bun run test:mutation:dry

# Debug mode (verbose output)
bun run test:mutation:dry:debug

# With live Kong (uses curl fallback)
bun run test:mutation:with-kong
```

### Targeted Testing

Run mutation testing on specific directories:

```bash
bun run test:mutation:handlers    # Only handlers
bun run test:mutation:services    # Only services
bun run test:mutation:telemetry   # Only telemetry
bun run test:mutation:config      # Only config
bun run test:mutation:adapters    # Only adapters
bun run test:mutation:cache       # Only cache
bun run test:mutation:utils       # Only utils
```

### Performance Characteristics

| Metric | Fresh Run | Incremental Run |
|--------|-----------|-----------------|
| **Duration** | 79 minutes | 26 seconds |
| **When to Use** | First run, after major changes | Development, quick validation |

### Configuration

Key settings in `stryker.config.json`:

```json
{
  "concurrency": 8,
  "timeoutMS": 30000,
  "timeoutFactor": 1.5,
  "coverageAnalysis": "off",
  "incremental": true,
  "thresholds": {
    "high": 80,
    "low": 60,
    "break": null
  }
}
```

### Files We Mutate vs Exclude

**Mutated (Business Logic):**
- `src/handlers/tokens.ts` - JWT token generation logic
- `src/utils/response.ts` - API response formatting

**Excluded (Infrastructure):**
- `src/telemetry/**/*.ts` - Telemetry mutations don't affect behavior
- `src/config/**/*.ts` - Configuration loading, not logic
- `src/middleware/**/*.ts` - Cross-cutting concerns

### Interpreting Results

```
All files                | 100.00 |  100.00 |       33 |         0 |          0 |
 handlers                | 100.00 |  100.00 |       27 |         0 |          0 |
  tokens.ts              | 100.00 |  100.00 |       27 |         0 |          0 |
```

- **% Mutation score**: Percentage of mutants killed (higher is better)
- **# killed**: Mutants caught by tests
- **# survived**: Mutants that tests missed (should be 0)

### Inline Mutation Disabling

For truly unkillable mutations:

```typescript
// Stryker disable next-line ConditionalExpression: Lazy initialization pattern
if (!this._url) {
  this._url = new URL(this.req.url);
}
```

---

## 6. Mutation Testing Workarounds

Two workarounds are required for StrykerJS + Bun compatibility.

### SIO-276: Bundled Bun Executable

**Problem:** ENOEXEC bug when Stryker (Node.js) spawns Bun processes.

**Solution:** Bundled Bun executable with `BUN_BE_BUN=1`:

```bash
# Build bundled Bun (one-time)
bun run build:bun-bundle

# Verify it works
BUN_BE_BUN=1 ./scripts/bundled-runtimes/bun-cli --version
```

**Implementation:**
- `scripts/bundled-runtimes/bun-cli` - Standalone binary (~90MB)
- `scripts/bun-mutation-runner.sh` - Wrapper script

### SIO-287: Output Parser Incompatibility

**Problem:** StrykerJS cannot parse Bun test runner's default output format.

**Solution:** Dots reporter + silent logging:

```json
{
  "commandRunner": {
    "command": "/path/to/scripts/bun-mutation-runner.sh test --reporter=dots ./test/bun"
  }
}
```

**Environment Variables:**
```bash
export BUN_BE_BUN=1           # Enable bundled Bun workaround
export LOG_LEVEL=silent       # Suppress Winston logs
export TELEMETRY_MODE=console # Valid telemetry config
```

### Workaround Dependency Chain

```
SIO-276 (Bundled Bun Executable)
  -> SIO-287 (Output Parser Fix)
      -> Mutation Testing Operational
```

---

## 7. CI/CD Integration

### GitHub Actions Configuration

```yaml
name: Mutation Testing

jobs:
  mutation-test:
    runs-on: ubuntu-latest
    timeout-minutes: 120

    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: 1.3.6

      - name: Install dependencies
        run: bun install --frozen-lockfile

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
          path: .stryker-tmp/
```

### CI Performance Expectations

| Environment | CPU Cores | Expected Duration |
|-------------|-----------|-------------------|
| GitHub Actions (ubuntu-latest) | 2 | 120-150 min |
| GitHub Actions (ubuntu-latest-4-cores) | 4 | 60-80 min |
| Self-hosted (8 cores) | 8 | 30-40 min |

### Best Practices

1. **Use Fresh Runs in CI** - Incremental cache is not portable
2. **Set Appropriate Timeout** - `timeout-minutes: 120` for 2-core runner
3. **Enable Required Workarounds** - `BUN_BE_BUN=1`, `LOG_LEVEL=silent`
4. **DO NOT cache `.stryker-tmp/`** - Machine-specific, causes false results

---

## 8. Troubleshooting

### Mutation Testing Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Failed tests in initial run" | Missing env vars | Set `LOG_LEVEL=silent`, `TELEMETRY_MODE=console` |
| ENOEXEC error | Missing workaround | Set `BUN_BE_BUN=1` |
| Timeout after 60 minutes | CI timeout too low | Set `timeout-minutes: 120` |
| Out of memory | Insufficient RAM | Reduce `concurrency` to 4 |

### Integration Test Issues

| Issue | Solution |
|-------|----------|
| Tests failing with remote Kong | Curl fallback handles automatically |
| Curl fallback seems slow | Use SSH/kubectl port forwarding |
| Tests skip with "Kong unavailable" | Check `KONG_ADMIN_URL` in `.env` |

### Verification Commands

```bash
# Test bundled Bun
BUN_BE_BUN=1 ./scripts/bundled-runtimes/bun-cli --version

# Test Kong connectivity
curl http://192.168.178.3:30001/status

# Test curl fallback
LOG_LEVEL=debug bun run test:integration
# Look for: "Fetch failed, trying curl fallback"

# Check incremental cache
cat .stryker-tmp/incremental.json
```

---

## 9. Test Data Management

### Test Consumers

The service uses 6 predefined test consumers. See **[Kong Test Setup Guide](kong-test-setup.md)** for comprehensive documentation.

| Consumer | Purpose |
|----------|---------|
| test-consumer-001 | Primary test consumer |
| test-consumer-002 | Multi-user scenarios |
| test-consumer-003 | Multi-user scenarios |
| test-consumer-004 | Load/performance testing |
| test-consumer-005 | Load/performance testing |
| anonymous | Testing rejection scenarios |

### Test Secrets

Secure test secret management:

```typescript
import { TestConsumerSecretFactory } from 'test/shared/test-consumer-secrets';

const secret = TestConsumerSecretFactory.generateTestSecret('test-consumer-001');
```

Key files:
- `test/shared/test-consumers.ts` - Consumer definitions (source of truth)
- `test/shared/test-consumer-secrets.ts` - Secure test secret generation
- `scripts/seed-test-consumers.ts` - Automated Kong seeding script

---

## 10. Best Practices

### Unit Testing
- Mock external dependencies (Kong, Redis)
- Test business logic in isolation
- Validate error scenarios thoroughly

### Integration Testing
- Test service interactions with real dependencies
- Validate circuit breaker behavior
- Test cache implementations and failover

### E2E Testing
- Test complete user flows
- Validate API contracts
- Verify error handling and edge cases

### Performance Testing
- Establish performance baselines
- Test under various load conditions
- Monitor resource utilization

### Test Maintenance
- Keep test execution time <5 minutes for full suite
- Use parallel execution where possible
- Regular cleanup of test artifacts

---

## 11. Chaos Testing

Located in `test/chaos/` directory. **57 chaos engineering tests** across 4 test suites validate system resilience under failure conditions.

### Overview

| Suite | Tests | Purpose |
|-------|-------|---------|
| `kong-failure.test.ts` | 19 | Kong Admin API failure scenarios |
| `redis-failure.test.ts` | 14 | Redis cache failure scenarios |
| `network-partition.test.ts` | 10 | Network connectivity issues |
| `resource-exhaustion.test.ts` | 14 | Memory/CPU pressure scenarios |

### Running Chaos Tests

```bash
# Run all chaos tests
bun test test/chaos/

# Run specific suite
bun test test/chaos/kong-failure.test.ts
bun test test/chaos/redis-failure.test.ts
bun test test/chaos/network-partition.test.ts
bun test test/chaos/resource-exhaustion.test.ts
```

### Kong Failure Scenarios

Tests circuit breaker behavior during Kong outages:
- Kong Admin API timeouts (100ms timeout configuration)
- Kong 500 errors with error threshold tracking
- Connection refused scenarios
- Stale cache fallback behavior
- Circuit breaker state transitions (closed -> open -> half-open -> closed)
- Multiple consumers under Kong failure
- Per-operation circuit breaker isolation

### Redis Failure Scenarios

Tests graceful degradation when Redis is unavailable:
- Redis connection timeout with local memory fallback
- Redis READONLY mode (reads succeed, writes fail)
- Connection drop mid-operation
- Cache miss handling
- TTL expiration in local memory fallback
- Concurrent access during failure
- Memory pressure with max entry limits

### Network Partition Scenarios

Tests resilience under network issues:
- Intermittent connectivity (alternating success/failure)
- Occasional failures (below 50% threshold - circuit stays closed)
- Frequent failures (80% - circuit opens)
- High latency responses at timeout boundary
- Variable latency handling
- Flapping connectivity prevention
- Recovery after extended outage

### Resource Exhaustion Scenarios

Tests behavior under resource pressure:
- Large payload processing (100 payloads, 10KB each)
- Memory tracking and garbage collection
- Rapid allocation/deallocation cycles
- Event loop delay measurement
- CPU-intensive operations
- High concurrent connections (100 simultaneous requests)
- Deep promise chains (100 levels)
- Large JSON serialization (10K+ items)

### What Chaos Tests Validate

| Behavior | Expected Result |
|----------|-----------------|
| Circuit breaker opens | After 50% error rate over rolling window |
| Stale cache fallback | Returns cached data up to 30 minutes old |
| Fast rejection | <50ms when circuit is open |
| Memory fallback | Transparent switch when Redis unavailable |
| Concurrent safety | No data corruption under parallel access |
| Recovery | Circuit half-opens after 60 seconds |

---

## 12. API Best Practices E2E Tests

Located in `test/playwright/api-best-practices.e2e.ts`. Tests validate RFC compliance and API best practices implementation.

### Test Coverage

| Category | Tests | Validates |
|----------|-------|-----------|
| Method Validation | 3 | 405 responses with Allow header (RFC 9110) |
| ETag Support | 3 | SHA-256 ETag, If-None-Match, 304 responses (RFC 7232) |
| Request Size Limits | 2 | 10MB limit, proper error responses |
| Content-Type Validation | 2 | Accepted types, rejection of invalid types |
| CORS Headers | 2 | Preflight handling, required headers |

### Running API Best Practices Tests

```bash
# Run all API best practices tests
npx playwright test api-best-practices.e2e.ts

# Run with UI for debugging
npx playwright test api-best-practices.e2e.ts --ui
```

### Key Assertions

```typescript
// Method validation (405)
expect(response.status()).toBe(405);
expect(response.headers()['allow']).toContain('GET');

// ETag and conditional requests (304)
expect(firstResponse.headers()['etag']).toBeDefined();
expect(conditionalResponse.status()).toBe(304);

// Request size limits
expect(response.status()).toBe(413);  // Payload Too Large

// Content-Type validation
expect(response.status()).toBe(415);  // Unsupported Media Type
```
