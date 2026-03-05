# Kong Integration and Testing Guide

This guide documents the Kong integration for local development and testing, including dual-mode E2E testing that supports both direct service access and Kong-routed requests.

## Table of Contents

- [Local Development Kong Routing](#local-development-kong-routing)
- [Dual-Mode E2E Testing](#dual-mode-e2e-testing)
- [Kong HTTP Log Integration](#kong-http-log-integration)
- [Test Consumers](#test-consumers)
- [Setting Up Consumers in Kong](#setting-up-consumers-in-kong)
- [CI/CD Integration](#cicd-integration)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)
- [Best Practices: Consumer Rotation Strategy](#best-practices-consumer-rotation-strategy)

---

## Local Development Kong Routing

The devcontainer runs Kong in Docker while the Bun application runs natively on your host machine. To enable Kong to route requests to your local service (and capture them in http-log), Kong is configured with a local development route.

### Architecture

```
Host Machine                         Docker (devcontainer)
+------------------+                 +----------------------+
| Bun App          |<----------------|  Kong Gateway        |
| localhost:3000   |  routes via     |  localhost:8000      |
+------------------+  host.docker.   +----------------------+
                      internal              |
                                           |
                                    +------v------+
                                    | http-log    |
                                    | plugin      |
                                    +------+------+
                                           |
                                    +------v------+
                                    | Elasticsearch|
                                    +--------------+
```

### Kong Route Configuration

Two routes are configured in `kong/kong.yml` for local development:

#### 1. Path-Based Route

Access the auth service via: `http://localhost:8000/auth/...`

```yaml
services:
  - name: auth-service-local
    host: host.docker.internal
    port: 3000
    protocol: http
    routes:
      - name: auth-service-local-route
        paths:
          - /auth
        strip_path: true  # /auth/tokens -> /tokens
```

#### 2. Host-Based Route (Recommended for E2E Tests)

Access the auth service via: `http://localhost:8000/...` with `Host: auth.local` header

```yaml
routes:
  - name: auth-service-local-host-route
    hosts:
      - auth.local
    paths:
      - /
    strip_path: false  # /tokens -> /tokens
```

**Why Host-Based Routing for Tests?**
- Path-based routing (`/auth/tokens`) requires URL manipulation in tests
- Host-based routing preserves original paths (`/tokens`)
- Playwright's URL resolution replaces paths rather than appending them
- Host header approach is transparent to test code

### Syncing Configuration

After modifying `kong/kong.yml`:

```bash
# From host machine
deck gateway sync kong/kong.yml

# Verify the route
curl -H "Host: auth.local" http://localhost:8000/health
```

---

## Dual-Mode E2E Testing

Playwright E2E tests support two execution modes:

| Mode | Command | Base URL | Auth Method | Use Case |
|------|---------|----------|-------------|----------|
| **Direct** | `bun run test:e2e` | `localhost:3000` | X-Consumer-* headers | CI/CD, quick testing |
| **Via Kong** | `bun run test:e2e:kong` | `localhost:8000` | X-API-Key header | Full integration, http-log capture |

### How It Works

#### Mode Detection

Tests detect whether they're running via Kong using the `E2E_HOST_HEADER` environment variable:

```typescript
// test/playwright/consolidated-business.e2e.ts
const VIA_KONG = !!process.env.E2E_HOST_HEADER;
```

#### Authentication Header Selection

```typescript
function getConsumerHeaders(consumer: { id: string; username: string; apiKey?: string }) {
  if (VIA_KONG && consumer.apiKey) {
    // Via Kong: Use API key, Kong validates and sets X-Consumer-* headers
    return { "X-API-Key": consumer.apiKey };
  }
  // Direct: Set X-Consumer-* headers directly
  return {
    "X-Consumer-Id": consumer.id,
    "X-Consumer-Username": consumer.username,
  };
}
```

#### Authentication Flow Comparison

**Direct Mode (Default):**
```
Test -> localhost:3000/tokens
        Headers: X-Consumer-Id, X-Consumer-Username
        |
        v
     Bun Service (validates headers directly)
```

**Kong Mode:**
```
Test -> localhost:8000/tokens
        Headers: X-API-Key, Host: auth.local
        |
        v
     Kong (validates API key, sets X-Consumer-* headers)
        |
        v
     Bun Service (receives validated consumer headers)
        |
        v
     http-log plugin (logs request to Elasticsearch)
```

### Playwright Configuration

The `playwright.config.ts` is configured to support both modes:

```typescript
use: {
  baseURL: process.env.API_BASE_URL || "http://localhost:3000",
  extraHTTPHeaders: {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "Playwright-AuthService-E2E/1.0",
    // Host header only added when E2E_HOST_HEADER is set
    ...(process.env.E2E_HOST_HEADER && { Host: process.env.E2E_HOST_HEADER }),
  },
},
```

### NPM Scripts

```json
{
  "test:e2e": "playwright test",
  "test:e2e:kong": "API_BASE_URL=http://localhost:8000 E2E_HOST_HEADER=auth.local playwright test"
}
```

### Running Tests

```bash
# Direct mode (default, no Kong required)
bun run test:e2e

# Via Kong (requires devcontainer running)
bun run devcontainer:up
bun run test:e2e:kong
```

### Test Behavior Differences

Some tests behave differently based on mode:

```typescript
test("Rejects anonymous consumers", async ({ request }) => {
  if (VIA_KONG) {
    // Via Kong: unauthenticated request -> anonymous consumer -> AUTH_009
    const response = await request.get("/tokens");
    expect(response.status()).toBe(401);
    const data = await response.json();
    expect(data.code).toBe("AUTH_009");
  } else {
    // Direct: explicit anonymous headers -> AUTH_009
    const response = await request.get("/tokens", {
      headers: {
        "X-Consumer-Id": ANONYMOUS_CONSUMER.id,
        "X-Consumer-Username": ANONYMOUS_CONSUMER.username,
        "X-Anonymous-Consumer": "true",
      },
    });
    expect(response.status()).toBe(401);
    expect(data.code).toBe("AUTH_009");
  }
});
```

---

## Kong HTTP Log Integration

The Kong http-log plugin captures all proxied requests to Elasticsearch for monitoring and debugging.

### Configuration

```yaml
plugins:
  - name: http-log
    enabled: true
    config:
      http_endpoint: "https://kong_http_logs:<password>@elasticsearch.siobytes.com/logs-kong.prd-siobytes/_doc?pipeline=add-timestamp-kong-http-log"
      method: POST
      timeout: 10000
      keepalive: 60000
      retry_count: 10
      content_type: "application/json"
```

### Key Settings

| Setting | Value | Purpose |
|---------|-------|---------|
| `http_endpoint` | Elasticsearch data stream | Log destination |
| `pipeline` | `add-timestamp-kong-http-log` | Ingest pipeline for @timestamp |
| `retry_count` | 10 | Reliability for transient failures |
| `timeout` | 10000ms | Maximum wait for ES response |

### Elasticsearch Requirements

The `kong_http_logs` user requires write permissions:

```json
PUT /_security/role/kong_logs_writer
{
  "indices": [{
    "names": ["logs-kong.*"],
    "privileges": ["create_doc", "create", "index", "write"]
  }]
}

POST /_security/user/kong_http_logs/_roles
{
  "roles": ["kong_logs_writer"]
}
```

### Verifying Logs

```bash
# Check recent Kong logs in Elasticsearch
curl -s "https://elasticsearch.siobytes.com/logs-kong.prd-siobytes/_search?size=1" \
  -u "user:password" | jq '.hits.hits[0]._source'
```

---

## Test Consumers

This section documents the test consumers used for testing the authentication service.

### Consumer Overview

The authentication service uses 6 predefined test consumers for consistent testing across unit tests, E2E tests, and integration tests.

#### Consumer Definitions

All consumers are defined in `test/shared/test-consumers.ts`:

| Username | UUID | Purpose |
|----------|------|---------|
| `test-consumer-001` | `f48534e1-4caf-4106-9103-edf38eae7ebc` | Primary test consumer for basic authentication tests |
| `test-consumer-002` | `1ff7d425-917a-4858-9e99-c2a911ba1b05` | Secondary consumer for multi-user scenarios |
| `test-consumer-003` | `73881280-13b4-40b3-aecf-84d981d6ac35` | Third consumer for multi-user scenarios |
| `test-consumer-004` | `10f37f4d-99b2-4b93-8e10-4f9090d62ee0` | Load testing consumer for performance tests |
| `test-consumer-005` | `2df241f5-11db-49a3-b9fb-c797135db9c3` | Load testing consumer for performance tests |
| `anonymous` | `56456a01-65ec-4415-aec8-49fec6403c9c` | Anonymous consumer for testing rejection scenarios |

#### API Key Mappings

Each consumer has a corresponding API key for authentication:

| API Key | Consumer |
|---------|----------|
| `test-api-key-consumer-001` | test-consumer-001 |
| `test-api-key-consumer-002` | test-consumer-002 |
| `test-api-key-consumer-003` | test-consumer-003 |
| `test-api-key-consumer-004` | test-consumer-004 |
| `test-api-key-consumer-005` | test-consumer-005 |
| `anonymous-key` | anonymous |

#### JWT Credentials

Each consumer has JWT credentials for token validation:

| Consumer | JWT Key | Algorithm |
|----------|---------|-----------|
| test-consumer-001 | `test-jwt-key-001` | HS256 |
| test-consumer-002 | `test-jwt-key-002` | HS256 |
| test-consumer-003 | `test-jwt-key-003` | HS256 |
| test-consumer-004 | `test-jwt-key-004` | HS256 |
| test-consumer-005 | `test-jwt-key-005` | HS256 |
| anonymous | `anonymous-jwt-key` | HS256 |

JWT secrets follow the pattern: `test-jwt-secret-{number}-minimum-32-characters-long`

---

## Setting Up Consumers in Kong

This section covers how to configure test consumers in Kong.

### Option 1: Automated Seeding Script (Recommended)

The project includes a seeding script that automatically configures Kong with all test consumers:

```bash
# Set Kong Admin URL and run the script
KONG_ADMIN_URL=http://localhost:8001 bun scripts/seed-test-consumers.ts
```

#### What the Script Does

1. **Waits for Kong** - Polls `/status` endpoint until Kong is ready (up to 30 retries)
2. **Enables key-auth plugin** - Configures API key authentication globally
   - Accepts keys via `X-API-Key` or `apikey` headers
   - Hides credentials from upstream services
3. **Enables jwt plugin** - Configures JWT validation globally
   - Verifies `exp` (expiration) claim
4. **Creates consumers** - Creates all 6 test consumers with tags
5. **Creates API keys** - Associates API keys with each consumer
6. **Creates JWT credentials** - Sets up JWT signing credentials for each consumer

#### Script Output Example

```
=== Kong Test Consumer Seeding Script ===
Kong Admin URL: http://localhost:8001

Waiting for Kong at http://localhost:8001...
Kong is ready!

--- Enabling Plugins ---
Enabled key-auth plugin globally
Enabled jwt plugin globally

--- Creating Test Consumers ---
Created consumer: test-consumer-001 (f48534e1-4caf-4106-9103-edf38eae7ebc)
Created consumer: test-consumer-002 (1ff7d425-917a-4858-9e99-c2a911ba1b05)
...

--- Creating API Keys ---
Created API key for consumer: f48534e1-4caf-4106-9103-edf38eae7ebc
...

--- Creating JWT Credentials ---
Created JWT credential for consumer: f48534e1-4caf-4106-9103-edf38eae7ebc
...

=== Seeding Complete ===
Created 6 consumers
Created 6 API keys
Created 6 JWT credentials
```

### Option 2: Manual Kong Admin API Setup

If you prefer manual setup or need to understand the individual API calls:

#### Step 1: Enable Plugins

```bash
# Enable key-auth plugin globally
curl -X POST http://localhost:8001/plugins \
  -H "Content-Type: application/json" \
  -d '{
    "name": "key-auth",
    "config": {
      "key_names": ["X-API-Key", "apikey"],
      "hide_credentials": true
    }
  }'

# Enable jwt plugin globally
curl -X POST http://localhost:8001/plugins \
  -H "Content-Type: application/json" \
  -d '{
    "name": "jwt",
    "config": {
      "claims_to_verify": ["exp"]
    }
  }'
```

#### Step 2: Create Consumers

```bash
# Create test-consumer-001
curl -X POST http://localhost:8001/consumers \
  -H "Content-Type: application/json" \
  -d '{
    "id": "f48534e1-4caf-4106-9103-edf38eae7ebc",
    "username": "test-consumer-001",
    "custom_id": "test-consumer-001",
    "tags": ["test", "integration"]
  }'

# Create test-consumer-002
curl -X POST http://localhost:8001/consumers \
  -H "Content-Type: application/json" \
  -d '{
    "id": "1ff7d425-917a-4858-9e99-c2a911ba1b05",
    "username": "test-consumer-002",
    "custom_id": "test-consumer-002",
    "tags": ["test", "integration"]
  }'

# Create test-consumer-003
curl -X POST http://localhost:8001/consumers \
  -H "Content-Type: application/json" \
  -d '{
    "id": "73881280-13b4-40b3-aecf-84d981d6ac35",
    "username": "test-consumer-003",
    "custom_id": "test-consumer-003",
    "tags": ["test", "integration"]
  }'

# Create test-consumer-004
curl -X POST http://localhost:8001/consumers \
  -H "Content-Type: application/json" \
  -d '{
    "id": "10f37f4d-99b2-4b93-8e10-4f9090d62ee0",
    "username": "test-consumer-004",
    "custom_id": "test-consumer-004",
    "tags": ["test", "integration"]
  }'

# Create test-consumer-005
curl -X POST http://localhost:8001/consumers \
  -H "Content-Type: application/json" \
  -d '{
    "id": "2df241f5-11db-49a3-b9fb-c797135db9c3",
    "username": "test-consumer-005",
    "custom_id": "test-consumer-005",
    "tags": ["test", "integration"]
  }'

# Create anonymous consumer
curl -X POST http://localhost:8001/consumers \
  -H "Content-Type: application/json" \
  -d '{
    "id": "56456a01-65ec-4415-aec8-49fec6403c9c",
    "username": "anonymous",
    "custom_id": "anonymous",
    "tags": ["test", "integration"]
  }'
```

#### Step 3: Create API Keys

```bash
# API key for test-consumer-001
curl -X POST http://localhost:8001/consumers/test-consumer-001/key-auth \
  -H "Content-Type: application/json" \
  -d '{"key": "test-api-key-consumer-001"}'

# API key for test-consumer-002
curl -X POST http://localhost:8001/consumers/test-consumer-002/key-auth \
  -H "Content-Type: application/json" \
  -d '{"key": "test-api-key-consumer-002"}'

# API key for test-consumer-003
curl -X POST http://localhost:8001/consumers/test-consumer-003/key-auth \
  -H "Content-Type: application/json" \
  -d '{"key": "test-api-key-consumer-003"}'

# API key for test-consumer-004
curl -X POST http://localhost:8001/consumers/test-consumer-004/key-auth \
  -H "Content-Type: application/json" \
  -d '{"key": "test-api-key-consumer-004"}'

# API key for test-consumer-005
curl -X POST http://localhost:8001/consumers/test-consumer-005/key-auth \
  -H "Content-Type: application/json" \
  -d '{"key": "test-api-key-consumer-005"}'

# API key for anonymous consumer
curl -X POST http://localhost:8001/consumers/anonymous/key-auth \
  -H "Content-Type: application/json" \
  -d '{"key": "anonymous-key"}'
```

#### Step 4: Create JWT Credentials

```bash
# JWT credential for test-consumer-001
curl -X POST http://localhost:8001/consumers/test-consumer-001/jwt \
  -H "Content-Type: application/json" \
  -d '{
    "key": "test-jwt-key-001",
    "secret": "test-jwt-secret-001-minimum-32-characters-long",
    "algorithm": "HS256"
  }'

# JWT credential for test-consumer-002
curl -X POST http://localhost:8001/consumers/test-consumer-002/jwt \
  -H "Content-Type: application/json" \
  -d '{
    "key": "test-jwt-key-002",
    "secret": "test-jwt-secret-002-minimum-32-characters-long",
    "algorithm": "HS256"
  }'

# JWT credential for test-consumer-003
curl -X POST http://localhost:8001/consumers/test-consumer-003/jwt \
  -H "Content-Type: application/json" \
  -d '{
    "key": "test-jwt-key-003",
    "secret": "test-jwt-secret-003-minimum-32-characters-long",
    "algorithm": "HS256"
  }'

# JWT credential for test-consumer-004
curl -X POST http://localhost:8001/consumers/test-consumer-004/jwt \
  -H "Content-Type: application/json" \
  -d '{
    "key": "test-jwt-key-004",
    "secret": "test-jwt-secret-004-minimum-32-characters-long",
    "algorithm": "HS256"
  }'

# JWT credential for test-consumer-005
curl -X POST http://localhost:8001/consumers/test-consumer-005/jwt \
  -H "Content-Type: application/json" \
  -d '{
    "key": "test-jwt-key-005",
    "secret": "test-jwt-secret-005-minimum-32-characters-long",
    "algorithm": "HS256"
  }'

# JWT credential for anonymous consumer
curl -X POST http://localhost:8001/consumers/anonymous/jwt \
  -H "Content-Type: application/json" \
  -d '{
    "key": "anonymous-jwt-key",
    "secret": "anonymous-jwt-secret-minimum-32-characters-long",
    "algorithm": "HS256"
  }'
```

### Option 3: Kong Simulator (Local Development)

For local development without a real Kong instance, the project includes simulators that mock Kong behavior:

#### Starting the Simulators

```bash
# Terminal 1: Start Kong Admin API simulator (port 8001)
bun test/kong-simulator/kong-admin.ts

# Terminal 2: Start Kong Proxy simulator (port 8000)
bun test/kong-simulator/kong-proxy.ts
```

#### What the Simulators Provide

**Kong Admin Simulator** (`test/kong-simulator/kong-admin.ts`):
- `/status` - Returns Kong status information
- `/consumers/{id}` - Returns consumer details
- `/consumers/{id}/jwt` - Generates mock JWT secrets

**Kong Proxy Simulator** (`test/kong-simulator/kong-proxy.ts`):
- Validates API keys against the predefined mappings
- Adds consumer headers (`X-Consumer-ID`, `X-Consumer-Username`, `X-Consumer-Custom-ID`)
- Proxies requests to the authentication service

---

## CI/CD Integration

### Parallel Job Isolation

For CI/CD workflows running tests in parallel, the consumer module provides job-specific consumer generation to prevent conflicts:

```typescript
import {
  generateJobSpecificConsumers,
  JOB_PREFIXES
} from "test/shared/test-consumers";

// Generate isolated consumers for E2E tests
const e2eConsumers = generateJobSpecificConsumers(JOB_PREFIXES.E2E_TESTS);
// Results in: e2e-test-consumer-001, e2e-test-consumer-002, etc.

// Generate isolated consumers for performance tests
const perfConsumers = generateJobSpecificConsumers(JOB_PREFIXES.PERFORMANCE_TESTS);
// Results in: perf-test-consumer-001, perf-test-consumer-002, etc.
```

### Available Job Prefixes

| Prefix | Use Case |
|--------|----------|
| `unit` | Unit tests |
| `e2e` | End-to-end tests |
| `perf` | Performance tests |
| `local` | Local development |

---

## Verification

### Verify Consumer Setup

```bash
# List all consumers
curl http://localhost:8001/consumers

# Get specific consumer
curl http://localhost:8001/consumers/test-consumer-001

# List consumer's API keys
curl http://localhost:8001/consumers/test-consumer-001/key-auth

# List consumer's JWT credentials
curl http://localhost:8001/consumers/test-consumer-001/jwt
```

### Test Authentication Flow

```bash
# Test with valid API key
curl -H "X-API-Key: test-api-key-consumer-001" http://localhost:8000/tokens

# Test with invalid API key (should return 401)
curl -H "X-API-Key: invalid-key" http://localhost:8000/tokens

# Test without API key (should return 401)
curl http://localhost:8000/tokens
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `test/shared/test-consumers.ts` | Consumer definitions (source of truth) |
| `test/shared/test-consumer-secrets.ts` | Secure test secret generation |
| `scripts/seed-test-consumers.ts` | Automated Kong seeding script |
| `test/kong-simulator/kong-admin.ts` | Kong Admin API simulator |
| `test/kong-simulator/kong-proxy.ts` | Kong Proxy simulator |
| `test/k6/kong-gateway/kong-tokens-test.ts` | K6 performance tests for Kong |

---

## Troubleshooting

### Consumer Already Exists

The seeding script handles "already exists" errors gracefully. To force recreation:

```bash
# Delete existing consumer
curl -X DELETE http://localhost:8001/consumers/test-consumer-001

# Re-run seeding script
KONG_ADMIN_URL=http://localhost:8001 bun scripts/seed-test-consumers.ts
```

### Kong Not Ready

If the seeding script times out waiting for Kong:

```bash
# Check Kong status manually
curl http://localhost:8001/status

# Check Kong logs
docker logs kong-gateway

# Increase retry attempts (edit script or wait longer)
```

### API Key Not Working

```bash
# Verify key-auth plugin is enabled
curl http://localhost:8001/plugins | jq '.data[] | select(.name=="key-auth")'

# Verify API key exists for consumer
curl http://localhost:8001/consumers/test-consumer-001/key-auth

# Check if key is correct (case-sensitive)
curl -v -H "X-API-Key: test-api-key-consumer-001" http://localhost:8000/tokens
```

---

## Best Practices: Consumer Rotation Strategy

### Kong JWT Credential Limit (100 per Consumer)

Kong enforces a **maximum of 100 JWT credentials per consumer**. For tests that repeatedly create credentials (like integration tests), you'll eventually hit this limit causing test failures.

**Symptom**:
```
Error: expect(received).toBeGreaterThan(expected)
Expected: > 100
Received: 100
```

### Solution: Rotate Test Consumers

Instead of creating all credentials on a single consumer, **rotate through multiple test consumers** to distribute credential creation:

#### Example: Integration Test Pattern

```typescript
import { TEST_CONSUMERS } from "../shared/test-consumers";

describe("Kong Integration Tests", () => {
  test("should create JWT credential - test 1", async () => {
    // Use consumer 001 for first credential test
    const consumer = TEST_CONSUMERS[0]; // test-consumer-001
    const credential = await kongAdapter.createConsumerSecret(consumer.id);
    expect(credential).toBeDefined();
  });

  test("should create JWT credential - test 2", async () => {
    // Use consumer 002 for second credential test
    const consumer = TEST_CONSUMERS[1]; // test-consumer-002
    const credential = await kongAdapter.createConsumerSecret(consumer.id);
    expect(credential).toBeDefined();
  });

  test("should create JWT credential - test 3", async () => {
    // Use consumer 003 for third credential test
    const consumer = TEST_CONSUMERS[2]; // test-consumer-003
    const credential = await kongAdapter.createConsumerSecret(consumer.id);
    expect(credential).toBeDefined();
  });
});
```

#### Benefits of Consumer Rotation

| Benefit | Description |
|---------|-------------|
| **Avoids Credential Limit** | Distributes credentials across multiple consumers (5 consumers × 100 credentials = 500 total capacity) |
| **Test Stability** | Tests remain stable even after hundreds of runs without manual cleanup |
| **No Cleanup Required** | Tests don't need to delete credentials between runs |
| **Parallel Test Safety** | Different tests use different consumers, reducing conflicts |
| **Long-Term Sustainability** | Can run tests thousands of times before hitting limits |

#### Consumer Allocation Strategy

| Consumer | Allocation | Usage |
|----------|------------|-------|
| `test-consumer-001` | Integration tests (test 1, 4, 7, ...) | Primary credential creation tests |
| `test-consumer-002` | Integration tests (test 2, 5, 8, ...) | Secondary credential creation tests |
| `test-consumer-003` | Integration tests (test 3, 6, 9, ...) | Tertiary credential creation tests |
| `test-consumer-004` | Performance/load tests | K6 load testing |
| `test-consumer-005` | Performance/load tests | K6 stress testing |
| `anonymous` | Rejection scenarios | Anonymous consumer tests |

#### Credential Cleanup (Optional)

For CI/CD environments where you want to clean up between runs:

```bash
# Delete all JWT credentials for a consumer
curl -X GET http://localhost:8001/consumers/test-consumer-001/jwt | \
  jq -r '.data[].id' | \
  xargs -I {} curl -X DELETE http://localhost:8001/consumers/test-consumer-001/jwt/{}

# Delete all consumers with "test" tag (nuclear option)
curl -X GET http://localhost:8001/consumers?tags=test | \
  jq -r '.data[].id' | \
  xargs -I {} curl -X DELETE http://localhost:8001/consumers/{}
```

#### Monitoring Credential Usage

```bash
# Check how many JWT credentials a consumer has
curl http://localhost:8001/consumers/test-consumer-001/jwt | jq '.data | length'

# Check all consumers and their credential counts
for consumer in test-consumer-{001..005}; do
  count=$(curl -s http://localhost:8001/consumers/$consumer/jwt | jq '.data | length')
  echo "$consumer: $count credentials"
done
```

**Example Output**:
```
test-consumer-001: 87 credentials
test-consumer-002: 45 credentials
test-consumer-003: 23 credentials
test-consumer-004: 12 credentials
test-consumer-005: 8 credentials
```
