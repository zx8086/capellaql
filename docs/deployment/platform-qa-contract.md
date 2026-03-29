# Application Contract: Platform QA Components

> **Version:** 1.2
> **Audience:** Developers, tech leads, and platform consumers
> **Last updated:** March 2026

---

## Why This Contract Exists

Building and testing software at PVH means dozens of teams running their own CI/CD pipelines, each with slightly different approaches to building containers, running tests, and measuring performance. The result is inconsistency, duplicated effort, and security gaps that are hard to spot until something breaks in production.

This contract defines the agreement between the **Platform Engineering team** (who build and maintain reusable CI/CD components) and the **application teams** (who consume them). It exists to answer one question: **what does your application need to do so the platform handles everything else?**

The philosophy is simple. You focus on writing your application and tests. The platform handles how those tests are built, executed, reported, and integrated into GitLab. When you follow this contract, your pipeline works with zero additional CI/CD configuration beyond a few `include` lines.

---

## Quick Start: Compliance Checker

Before diving into the details, run the compliance checker to see if your project is ready:

```bash
bun run check:platform
```

This validates:
- Health endpoint responds at `/health` with HTTP 200
- K6 entry points exist (`tests/k6/{profile}/index.ts`)
- K6 scripts use `BASE_URL` environment variable
- Playwright config reads `BASE_URL` from environment
- Server binds to `0.0.0.0`

---

## What Your Application Must Do

These are the non-negotiable requirements. If your application doesn't meet them, the health check will fail and no tests will run.

### 1. Expose a Health Endpoint

**Requirement:** Your application must respond to `GET /health` with HTTP status `200`.

```typescript
// Bun example
Bun.serve({
  port: process.env.PORT || 3000,
  hostname: '0.0.0.0',
  fetch(req) {
    if (new URL(req.url).pathname === '/health') {
      return new Response('OK', { status: 200 });
    }
    // ... your application routes
  },
});
```

### 2. Bind to 0.0.0.0

**Requirement:** Your application must listen on `0.0.0.0`, not `127.0.0.1` or `localhost`.

**Why:** GitLab services communicate over Docker networking. `localhost` only accepts connections from within its own container.

### 3. Listen on Port 3000 (or Configure It)

**Requirement:** Your application must listen on the port specified by the `PORT` environment variable, defaulting to `3000`.

If your app uses a different default (like 4000), configure the component:

```yaml
- component: .../quality-assurance-runner/k6@1.0.0
  inputs:
    service_port: "4000"  # Match your app's port
```

### 4. Declare the Required Stages

```yaml
stages:
  - build          # Required: docker-factory
  - test           # Required if using bun or playwright
  - performance    # Required if using k6
```

---

## Project Structure Requirements

### Directory Naming Convention

The platform **requires `tests/`** (plural) as the test directory:

```
your-project/
├── src/
├── tests/                    # REQUIRED: plural "tests"
│   ├── k6/                   # K6 performance tests
│   ├── playwright/           # Playwright E2E tests
│   └── bun/                  # Bun unit/integration tests
└── playwright.config.ts
```

**Why plural?**
- Semantic correctness (folder contains multiple tests)
- Aligns with Jest (`__tests__/`), Playwright, and Bun conventions
- Consistent across the organization

### K6 Performance Tests

The platform runs `k6 run tests/k6/{profile}/index.ts`. You **must** have entry points:

```
tests/k6/
├── smoke/index.ts           # Required for smoke profile
├── load/index.ts            # Required for load profile
├── stress/index.ts          # Required for stress profile
├── spike/index.ts           # Required for spike profile
└── soak/index.ts            # Required for soak profile
```

**Entry point patterns:**

K6 requires exactly one `default` export and one `options` export per entry point. When a profile directory has multiple test files, use one of two patterns:

**Pattern A — Single re-export** (when one test is the primary test):
```typescript
// tests/k6/stress/index.ts
export { options, default } from "./system-stress.ts";
```

**Pattern B — Multi-scenario** (when all tests should run together):
```typescript
// tests/k6/smoke/index.ts
import { healthSmokeTest } from "./health-smoke.ts";
import { graphqlSmokeTest } from "./graphql-smoke.ts";

export const options = {
  scenarios: {
    health: { executor: "constant-vus", exec: "healthSmoke", vus: 3, duration: "3m" },
    graphql: { executor: "constant-vus", exec: "graphqlSmoke", vus: 2, duration: "2m" },
  },
  thresholds: { http_req_duration: ["p(95)<50"], http_req_failed: ["rate<0.001"] },
};

export function healthSmoke() { healthSmokeTest(); }
export function graphqlSmoke() { graphqlSmokeTest(); }
```

Sibling files export named functions (not `default`) and have no `options` export.

**CapellaQL uses:**
- `smoke/` and `load/` — Pattern B (multi-scenario combining health + GraphQL tests)
- `stress/`, `spike/`, `soak/` — Pattern A (single re-export)

### Playwright Tests

```
tests/playwright/
├── specs/
│   └── *.spec.ts
playwright.config.ts          # Must read BASE_URL from environment
```

---

## Migration Guide for Existing Projects

### Directory Naming Migration (CRITICAL)

If your project uses `test/` (singular), rename it to `tests/` (plural):

```bash
# Rename the entire test directory
mv test tests

# Or move individual subdirectories
mv test/bun tests/bun
mv test/k6 tests/k6
mv test/playwright tests/playwright
```

**Update imports and references:**
- `package.json` scripts
- `tsconfig.json` paths
- Import statements in test files
- CI/CD configuration files

### K6 Migration Checklist

#### 1. Create Entry Points (CRITICAL)

**Before (won't work):**
```
tests/k6/
├── smoke/
│   ├── health-test.ts      # Platform can't find this
└── stress/
    └── load-test.ts
```

**After (works):**
```
tests/k6/
├── smoke/
│   ├── index.ts            # Entry point - REQUIRED
│   └── health-test.ts
└── stress/
    └── index.ts            # Entry point - REQUIRED
```

#### 2. Support Platform Environment Variables

**Before (non-portable):**
```typescript
const host = __ENV.HOST || "localhost";
const port = __ENV.PORT || "3000";
const baseUrl = `http://${host}:${port}`;
```

**After (platform-compatible):**
```typescript
const baseUrl = __ENV.BASE_URL ||
                __ENV.TARGET_URL ||
                `http://${__ENV.HOST || 'localhost'}:${__ENV.PORT || '3000'}`;
```

#### 3. Parameterize Stress/Spike Test Stages

**Before (hardcoded):**
```typescript
export const options = {
  stages: [
    { duration: "5m", target: 100 },   // Can't change from CI
    { duration: "10m", target: 200 },
  ],
};
```

**After (parameterized):**
```typescript
const peakVUs = parseInt(__ENV.PEAK_VUS || '200', 10);
const rampUp = __ENV.RAMP_UP || '5m';
const sustain = __ENV.SUSTAIN || '10m';

export const options = {
  stages: [
    { duration: rampUp, target: peakVUs },
    { duration: sustain, target: peakVUs },
    { duration: '5m', target: 0 },  // Always include cooldown
  ],
};
```

#### 4. Organize by Profile

| Profile | Expected Path | What Goes Here |
|---------|---------------|----------------|
| `smoke` | `tests/k6/smoke/index.ts` | Quick sanity checks (1-3 VUs, <1min) |
| `load` | `tests/k6/load/index.ts` | Normal production load simulation |
| `stress` | `tests/k6/stress/index.ts` | Find breaking points |
| `spike` | `tests/k6/spike/index.ts` | Sudden traffic bursts |
| `soak` | `tests/k6/soak/index.ts` | Long-duration stability tests |

**Common mistake:** Putting spike and soak tests in the stress folder. Move them:
```bash
mkdir -p tests/k6/spike tests/k6/soak
mv tests/k6/stress/spike-test.ts tests/k6/spike/
mv tests/k6/stress/soak-test.ts tests/k6/soak/
```

### Playwright Migration Checklist

#### 1. Read BASE_URL from Environment

**Before (hardcoded):**
```typescript
export default defineConfig({
  baseURL: 'http://localhost:4000',  // Won't work in CI
});
```

**After (environment-aware):**
```typescript
export default defineConfig({
  baseURL: process.env.BASE_URL || 'http://localhost:4000',
});
```

#### 2. Remove Custom Reporter Configuration

**Before (conflicts with platform):**
```typescript
export default defineConfig({
  reporter: [
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'results.xml' }],
  ],
});
```

**After (let platform handle it):**
```typescript
export default defineConfig({
  // No reporter config - platform adds --reporter=html,junit
});
```

---

## Common Migration Anti-Patterns

### Anti-Pattern 1: Separate Environment Variable Sets

**Problem:**
```typescript
const baseUrl = process.env.CI
  ? process.env.BASE_URL
  : `http://${process.env.HOST}:${process.env.PORT}`;
```

**Solution:**
```typescript
const baseUrl = process.env.BASE_URL ||
                `http://${process.env.HOST || 'localhost'}:${process.env.PORT || '3000'}`;
```

### Anti-Pattern 2: Test-Specific npm Scripts

**Problem:** Teams create many npm scripts like `test:k6:smoke:health`, `test:k6:smoke:api`.

**Impact:** The platform runs `k6 run tests/k6/smoke/index.ts` — it doesn't know about your scripts.

**Solution:** Keep your scripts for local development, but ensure `index.ts` entry points exist:

```json
{
  "scripts": {
    "test:k6:smoke:health": "k6 run tests/k6/smoke/health-test.ts",
    "test:k6:smoke": "k6 run tests/k6/smoke/index.ts"
  }
}
```

### Anti-Pattern 3: Complex Test Orchestration in Scripts

**Problem:**
```json
{
  "scripts": {
    "test:k6:all": "k6 run tests/smoke.ts && k6 run tests/load.ts"
  }
}
```

**Solution:** Use separate pipeline jobs:

```yaml
include:
  - component: .../quality-assurance-runner/k6@1.0.0
    inputs:
      profile: smoke

  - component: .../quality-assurance-runner/k6@1.0.0
    inputs:
      profile: load
```

---

## Environment Variables

### Automatically Managed (Platform Injects)

| Variable | Purpose |
|----------|---------|
| `IMAGE_TAG` | Full image reference for the service container |
| `PORT` | Port your app should bind to |
| `BASE_URL` | Full URL to reach the app (`http://app:4000`) |
| `TARGET_URL` | Alias for `BASE_URL` in K6 |
| `PEAK_VUS` | Peak virtual users for stress/spike |
| `RAMP_UP` | Ramp-up duration |
| `SUSTAIN` | Sustain duration at peak |

### Service Container Environment Variables

GitLab CI components cannot pass arbitrary environment variables to service containers. Set them as **project-level CI/CD variables** in GitLab Settings → CI/CD → Variables.

---

## The Canonical Pipeline

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

---

## What Not To Do

| Mistake | Why It Fails | What To Do Instead |
|---------|-------------|-------------------|
| Bind to `localhost` | Docker networking requires `0.0.0.0` | Bind to `0.0.0.0` |
| Skip the health endpoint | Test runners wait 120s then fail | Implement `GET /health → 200` |
| Define K6 thresholds via CLI | K6 doesn't support `--threshold` | Define in `options.thresholds` |
| Hardcode `localhost:4000` in tests | In CI, app is at `http://app:4000` | Use `process.env.BASE_URL` |
| Configure Playwright reporters | Platform adds `--reporter=html,junit` | Remove reporter config |
| Use `@latest` in production | Platform updates could break you | Pin to `@1.0.0` |

---

## Troubleshooting

### Health Check Timeout

```
HEALTH CHECK FAILED after 120s
```

1. **Is the app binding to `0.0.0.0`?** Most common cause.
2. **Is the port correct?** Verify `service_port` matches your app.
3. **Does the endpoint exist?** Confirm `GET /health` works.
4. **Is the app crashing?** Check GitLab job log for container stdout.
5. **Slow startup?** Increase `health_timeout` (default 120s).

### IMAGE_TAG Not Set

```
VALIDATION FAILED
  - IMAGE_TAG not set
```

1. Ensure docker-factory component is included and passing.
2. Check `needs` input matches docker-factory job name.

---

## CapellaQL Compliance Status

This project (CapellaQL) is **fully compliant** with the Platform QA Components contract:

| Requirement | Status |
|-------------|--------|
| Health endpoint `/health` → 200 | ✓ |
| Server binding `0.0.0.0` | ✓ |
| K6 entry points | ✓ |
| K6 `BASE_URL` support | ✓ |
| K6 dynamic parameters | ✓ |
| Playwright `BASE_URL` | ✓ |
| Directory structure | ✓ |

Run `bun run check:platform` to verify compliance at any time.
