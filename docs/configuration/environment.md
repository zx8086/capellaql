# Configuration Guide

## 4-Pillar Configuration Architecture

The authentication service implements a robust configuration pattern with comprehensive security validation.

> **Reusable Standard**: For a complete, self-contained guide to implementing this pattern in other applications, see **[4-Pillar Configuration Pattern](./4-pillar-pattern.md)**.

| Pillar | File | Description |
|--------|------|-------------|
| **1. Defaults** | `src/config/defaults.ts` | All baseline values with secure defaults |
| **2. Environment Mapping** | `src/config/envMapping.ts` | Explicit mapping with type safety |
| **3. Loader** | `src/config/loader.ts` | Controlled loading with proper fallbacks |
| **4. Validation** | `src/config/schemas.ts` | Zod v4 schema validation at end |

### Security Features
- **HTTPS Enforcement**: Kong Admin URL must use HTTPS in production
- **Token Validation**: Minimum 32-character requirement in production
- **Environment Validation**: Prevents localhost URLs in production
- **Immutability**: Runtime configuration changes prevented

---

## Required Environment Variables

### Kong Integration

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `KONG_MODE` | Deployment mode | `API_GATEWAY` or `KONNECT` | Yes |
| `KONG_ADMIN_URL` | Kong Admin API endpoint | `http://kong-admin:8001` | Yes |
| `KONG_ADMIN_TOKEN` | Admin API token | `Bearer xyz789...` | KONNECT only |
| `KONG_JWT_AUTHORITY` | JWT token issuer | `https://sts.example.com/` | Yes |
| `KONG_JWT_AUDIENCE` | JWT token audience | `http://api.example.com/` | Yes |
| `KONG_JWT_KEY_CLAIM_NAME` | Claim name for consumer key | `key` | No (default: `key`) |
| `JWT_EXPIRATION_MINUTES` | Token expiration | `15` | No (default: `15`) |

### Application Settings

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | `3000` | No (default: `3000`) |
| `NODE_ENV` | Runtime environment | `development`, `production`, `test` | No |

**Port Notes**: Ports 1-1023 require special permissions. Use port mapping in Docker/K8s.

### OpenTelemetry

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `TELEMETRY_MODE` | Telemetry mode | `console`, `otlp`, `both` | No (default: `both`) |
| `OTEL_SERVICE_NAME` | Service name | `authentication-service` | No |
| `OTEL_SERVICE_VERSION` | Service version override | `1.0.0` | No |

**Version Sourcing:** The service version is automatically read from `package.json` at runtime. The `OTEL_SERVICE_VERSION` environment variable can override this for special deployments. This ensures version consistency between `telemetry.serviceVersion` and `apiInfo.version`.
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Base OTLP endpoint | `http://otel-collector:4318` | No |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Traces endpoint | `https://otel.example.com/v1/traces` | No |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | Metrics endpoint | `https://otel.example.com/v1/metrics` | No |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | Logs endpoint | `https://otel.example.com/v1/logs` | No |
| `OTEL_EXPORTER_OTLP_TIMEOUT` | Export timeout (ms) | `30000` | No |
| `OTEL_BSP_MAX_EXPORT_BATCH_SIZE` | Batch size | `2048` | No |
| `OTEL_BSP_MAX_QUEUE_SIZE` | Queue size | `10000` | No |

### Kong Circuit Breaker

| Variable | Description | Default | Range |
|----------|-------------|---------|-------|
| `CIRCUIT_BREAKER_ENABLED` | Enable circuit breaker | `true` | boolean |
| `CIRCUIT_BREAKER_TIMEOUT` | Request timeout (ms) | `5000` | 100-10000 |
| `CIRCUIT_BREAKER_ERROR_THRESHOLD` | Error threshold (%) | `50` | 1-100 |
| `CIRCUIT_BREAKER_RESET_TIMEOUT` | Reset timeout (ms) | `60000` | 1000-300000 |
| `CIRCUIT_BREAKER_VOLUME_THRESHOLD` | Min requests before tripping | `3` | 1-100 |
| `CIRCUIT_BREAKER_ROLLING_COUNT_TIMEOUT` | Rolling window (ms) | `10000` | 1000-60000 |
| `CIRCUIT_BREAKER_ROLLING_COUNT_BUCKETS` | Rolling window buckets | `10` | 1-20 |
| `STALE_DATA_TOLERANCE_MINUTES` | Stale cache window | `30` | 5-240 |
| `HIGH_AVAILABILITY` | Enable Redis stale cache | `false` | boolean |

### Kong Settings

| Variable | Description | Default | Range |
|----------|-------------|---------|-------|
| `KONG_SECRET_CREATION_MAX_RETRIES` | Secret creation retry attempts | `3` | 1-10 |
| `KONG_MAX_HEADER_LENGTH` | Maximum header length | `256` | 64-8192 |

### Telemetry Circuit Breaker

| Variable | Description | Default | Range |
|----------|-------------|---------|-------|
| `TELEMETRY_CB_FAILURE_THRESHOLD` | Failures before opening | `5` | 1-100 |
| `TELEMETRY_CB_RECOVERY_TIMEOUT` | Recovery timeout (ms) | `60000` | 1000-600000 |
| `TELEMETRY_CB_SUCCESS_THRESHOLD` | Successes to close | `3` | 1-20 |
| `TELEMETRY_CB_MONITORING_INTERVAL` | Monitoring interval (ms) | `10000` | 1000-60000 |

### Telemetry Performance Optimization

| Variable | Description | Default | Range |
|----------|-------------|---------|-------|
| `OTEL_RUNTIME_METRICS_ENABLED` | Enable runtime metrics (event loop, memory) | `false` | boolean |
| `MEMORY_GUARDIAN_HEAP_LIMIT_MB` | Heap limit for memory pressure calculations | `512` | 64-32768 |

**Performance Notes:**
- **Runtime Metrics**: Disabled by default to save ~10% CPU overhead. Enable if you need event loop delay or detailed memory metrics.
- **Memory Guardian**: Monitors telemetry backpressure and heap usage. The heap limit is used for percentage calculations since Bun doesn't expose v8's `heap_size_limit`. Override this value to match your container's memory limit for accurate pressure detection.

#### Per-Operation Overrides

Circuit breaker supports operation-specific settings:

```typescript
// Example: config.ts
operations: {
  getConsumerSecret: {
    timeout: 3000,                // 3s for secret retrieval
    errorThresholdPercentage: 40  // 40% threshold
  },
  healthCheck: {
    timeout: 2000,                // 2s for health checks
    errorThresholdPercentage: 60  // 60% threshold (tolerant)
  }
}
```

### Redis/Valkey Cache (High-Availability Mode)

The service supports both Redis and Valkey as cache backends. Server type is automatically detected at runtime using the `INFO server` command.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `HIGH_AVAILABILITY` | Enable Redis/Valkey stale cache | `false` | No |
| `REDIS_URL` | Connection URL | `redis://localhost:6379` | No |
| `REDIS_PASSWORD` | Authentication password | - | No |
| `REDIS_DB` | Database number | `0` | No |
| `REDIS_MAX_RETRIES` | Retry attempts | `3` | No |
| `REDIS_CONNECTION_TIMEOUT` | Connection timeout (ms) | `5000` | No |
| `CACHE_HEALTH_TTL_MS` | Health check cache TTL (ms) | `2000` | No |
| `CACHE_MAX_MEMORY_ENTRIES` | Max in-memory stale cache entries | `1000` | No |

**Redis vs Valkey:**
- Both use the `redis://` protocol scheme
- Valkey is a Redis-compatible alternative (fork)
- The service auto-detects the server type and displays it in health endpoints
- DevContainer provides both: Redis on port 6379, Valkey on port 6380

### Cache Resilience Configuration

The cache layer includes comprehensive resilience features to handle connection issues gracefully.

> **Note**: The cache resilience settings below use hardcoded defaults from `src/config/defaults.ts`. Environment variable overrides are mapped in `envMapping.ts` but not yet wired in `loader.ts`. These values are planned for future configurability.

#### Cache Circuit Breaker (Defaults Only)

| Setting | Description | Default | Range |
|---------|-------------|---------|-------|
| Circuit breaker enabled | Enable cache circuit breaker | `true` | boolean |
| Failure threshold | Failures before opening | `5` | 1-100 |
| Reset timeout | Time before half-open (ms) | `30000` | 1000-300000 |
| Success threshold | Successes to close | `2` | 1-20 |

#### Reconnection Manager (Defaults Only)

| Setting | Description | Default | Range |
|---------|-------------|---------|-------|
| Max attempts | Max reconnection attempts | `5` | 1-20 |
| Base delay | Base backoff delay (ms) | `100` | 10-1000 |
| Max delay | Max backoff delay cap (ms) | `5000` | 100-60000 |
| Cooldown | Cooldown before retry (ms) | `60000` | 1000-300000 |

#### Health Monitor (Defaults Only)

| Setting | Description | Default | Range |
|---------|-------------|---------|-------|
| Monitoring enabled | Enable background monitoring | `true` | boolean |
| Check interval | Check interval (ms) | `10000` | 1000-60000 |
| Unhealthy threshold | Failures to mark unhealthy | `3` | 1-20 |
| Healthy threshold | Successes to mark healthy | `2` | 1-20 |
| Ping timeout | PING timeout (ms) | `500` | 100-5000 |

#### Operation Timeouts (Defaults Only)

| Setting | Description | Default | Range |
|---------|-------------|---------|-------|
| GET timeout | GET operation timeout (ms) | `1000` | 100-10000 |
| SET timeout | SET operation timeout (ms) | `2000` | 100-10000 |
| DELETE timeout | DELETE operation timeout (ms) | `1000` | 100-10000 |
| SCAN timeout | SCAN operation timeout (ms) | `5000` | 1000-30000 |
| PING timeout | PING operation timeout (ms) | `500` | 100-5000 |
| Connect timeout | Connection timeout (ms) | `5000` | 1000-30000 |

**Resilience Features:**
- **3-Layer Protection**: Error detection, circuit breaker, health monitoring
- **Exponential Backoff**: Delays increase: 100ms, 200ms, 400ms, 800ms, 1600ms...
- **Mutex Reconnection**: Prevents concurrent reconnection storms
- **Per-Operation Timeouts**: Different timeouts for different operation types
- **15+ Error Patterns**: Extended detection for connection_closed, reset, timeout, etc.
- **Graceful Degradation**: Falls back to Kong circuit breaker when cache fails

**Fallback Chain:**

| Mode | Fallback Chain |
|------|----------------|
| **Non-HA** | Local Memory Cache -> In-Memory Stale Cache -> Return null |
| **HA** | Redis Primary -> Redis Stale -> In-Memory Stale (last resort) -> Return null |

In HA mode, each service instance lazily populates an in-memory cache on successful Redis reads. When Redis is completely unavailable, this in-memory cache serves as a last-resort fallback. Each instance only has data for consumers it has previously served.

### API Documentation

| Variable | Description | Required |
|----------|-------------|----------|
| `API_CORS` | CORS origin | No (default: `*`) |
| `API_TITLE` | OpenAPI title | No |
| `API_DESCRIPTION` | API description | No |
| `API_VERSION` | API version | No |
| `API_CONTACT_NAME` | Contact name | No |
| `API_CONTACT_EMAIL` | Contact email | No |

### Request Validation (API Best Practices)

| Variable | Description | Default | Range |
|----------|-------------|---------|-------|
| `MAX_REQUEST_BODY_SIZE` | Maximum request body size (bytes) | `10485760` (10MB) | 1KB-100MB |
| `REQUEST_TIMEOUT_MS` | Request processing timeout (ms) | `30000` (30s) | 1000-120000 |

These settings are part of the API best practices implementation. See [api-best-practices.md](../development/api-best-practices.md) for details.

### Continuous Profiling

| Variable | Description | Default | Notes |
|----------|-------------|---------|-------|
| `PROFILING_ENABLED` | Enable Chrome DevTools profiling | `false` | Development only |
| `CONTINUOUS_PROFILING_ENABLED` | Enable automatic SLA-triggered profiling | `false` | |
| `CONTINUOUS_PROFILING_AUTO_TRIGGER_ON_SLA` | Auto-trigger on SLA violations | `true` | |
| `CONTINUOUS_PROFILING_THROTTLE_MINUTES` | Min minutes between triggers | `60` | 1-1440 |
| `CONTINUOUS_PROFILING_OUTPUT_DIR` | Profile output directory | Auto-detected | See below |
| `CONTINUOUS_PROFILING_MAX_CONCURRENT` | Max concurrent sessions | `1` | 1-5 |
| `CONTINUOUS_PROFILING_BUFFER_SIZE` | Rolling buffer for P95/P99 | `100` | 10-1000 |

**Container-Aware Output Directory**:

The `outputDir` is automatically derived based on the deployment environment:

| Environment | Detection | Default Path |
|-------------|-----------|--------------|
| Local/Dev | No container env vars | `profiles/auto` |
| AWS Fargate | `ECS_CONTAINER_METADATA_URI_V4` present | `/tmp/profiles` |
| Kubernetes | `KUBERNETES_SERVICE_HOST` present | `/tmp/profiles` |

This handles read-only filesystem containers (DHI distroless with `readOnlyRootFilesystem: true`).

See [profiling.md](../development/profiling.md) for complete profiling guide.

---

## Example Configuration

### Development
```bash
# .env
PORT=3000
NODE_ENV=development
TELEMETRY_MODE=console

KONG_MODE=API_GATEWAY
KONG_ADMIN_URL=http://192.168.178.3:30001
KONG_JWT_AUTHORITY=http://sts.example.com/
KONG_JWT_AUDIENCE=http://api.example.com/
```

### Production
```bash
# .env.production
PORT=3000
NODE_ENV=production
TELEMETRY_MODE=otlp

KONG_MODE=KONNECT
KONG_ADMIN_URL=https://us.api.konghq.com/v2/control-planes/abc123
KONG_ADMIN_TOKEN=kpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
KONG_JWT_AUTHORITY=https://sts.example.com/
KONG_JWT_AUDIENCE=https://api.example.com/

# High Availability (Redis or Valkey)
HIGH_AVAILABILITY=true
REDIS_URL=rediss://redis.example.com:6380
STALE_DATA_TOLERANCE_MINUTES=120

# OpenTelemetry
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.example.com
```

---

## CORS Configuration

CORS headers are configurable via `API_CORS`:

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": config.apiInfo.cors,  // API_CORS value
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Consumer-ID, X-Consumer-Username",
  "Access-Control-Max-Age": "86400"
};
```

- **Default**: `*` (allows all origins)
- **Production**: Use specific origins (e.g., `https://app.example.com`)

---

## Dependencies

### Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@opentelemetry/*` | Various | Observability stack (traces, metrics, logs) |
| `opossum` | ^9.0.0 | Circuit breaker for Kong API protection |
| `redis` | ^5.8.3 | Cache backend for HA mode |
| `winston` | ^3.18.3 | Structured logging with ECS format |
| `zod` | ^4.1.12 | Schema validation |

### Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@biomejs/biome` | ^2.2.5 | Linting and formatting |
| `@playwright/test` | ^1.56.0 | E2E testing |
| `@types/bun` | 1.2.23 | Bun runtime types |
| `typescript` | ^5.9.3 | TypeScript compiler |

### Minimum Requirements

| Requirement | Value |
|-------------|-------|
| Bun Runtime | >= 1.1.35 (recommended 1.3.9+) |
| Memory | 512MB min, 1GB recommended |
| CPU | Single core sufficient |
| Container Size | 58MB (distroless base) |

---

## Core Configuration Files

| File | Purpose |
|------|---------|
| `src/config/defaults.ts` | Pillar 1: Default configuration values |
| `src/config/envMapping.ts` | Pillar 2: Environment variable mappings |
| `src/config/loader.ts` | Pillar 3: Configuration loading and merging |
| `src/config/schemas.ts` | Pillar 4: Zod schema validation |
| `src/config/config.ts` | Configuration getters and cache |
| `src/config/index.ts` | Module exports |

## Type Definitions

| File | Purpose |
|------|---------|
| `src/types/circuit-breaker.types.ts` | Circuit breaker types (opossum + telemetry) |
