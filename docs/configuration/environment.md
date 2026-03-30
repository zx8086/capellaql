# Configuration Guide

## 4-Pillar Configuration Architecture

The CapellaQL service implements a robust configuration pattern with comprehensive security validation.

> **Reusable Standard**: For a complete, self-contained guide to implementing this pattern in other applications, see **[4-Pillar Configuration Pattern](./4-pillar-pattern.md)**.

| Pillar | File | Description |
|--------|------|-------------|
| **1. Defaults** | `src/config/defaults.ts` | All baseline values with secure defaults |
| **2. Environment Mapping** | `src/config/envMapping.ts` | Explicit mapping with type safety |
| **3. Loader** | `src/config/loader.ts` | Controlled loading with proper fallbacks |
| **4. Validation** | `src/config/schemas.ts` | Zod v4 schema validation at end |

### Security Features
- **Environment Validation**: Prevents localhost URLs in production
- **Immutability**: Runtime configuration changes prevented
- **Zod Validation**: All configuration validated at startup via schema validation
- **Production Password Enforcement**: Default passwords rejected in production
- **CORS Validation**: Wildcard and localhost origins rejected in production

---

## Environment Variables

### Application Settings

| Variable | Env Var | Type | Default | Description |
|----------|---------|------|---------|-------------|
| `LOG_LEVEL` | `LOG_LEVEL` | string | `"info"` | Logging level (`debug`, `info`, `warn`, `error`) |
| `YOGA_RESPONSE_CACHE_TTL` | `YOGA_RESPONSE_CACHE_TTL` | number | `900000` (15min) | GraphQL Yoga response cache TTL (ms) |
| `PORT` | `PORT` | number | `4000` | Server listening port |
| `ALLOWED_ORIGINS` | `ALLOWED_ORIGINS` | array | `["http://localhost:3000"]` | CORS allowed origins |
| `BASE_URL` | `BASE_URL` | string | `"http://localhost"` | Application base URL |
| `LOGGING_BACKEND` | `LOGGING_BACKEND` | string | `"pino"` | Logging backend (`pino`) |
| `TELEMETRY_MODE` | `TELEMETRY_MODE` | string | `"both"` | Log output mode (`console`, `otlp`, `both`) |

### Couchbase (Capella) Settings

| Variable | Env Var | Type | Default | Description |
|----------|---------|------|---------|-------------|
| `COUCHBASE_URL` | `COUCHBASE_URL` | string | `"couchbase://localhost"` | Cluster connection string |
| `COUCHBASE_USERNAME` | `COUCHBASE_USERNAME` | string | `"Administrator"` | Database username (dev only default) |
| `COUCHBASE_PASSWORD` | `COUCHBASE_PASSWORD` | string | `"password"` | Database password (MUST override in production) |
| `COUCHBASE_BUCKET` | `COUCHBASE_BUCKET` | string | `"default"` | Target bucket |
| `COUCHBASE_SCOPE` | `COUCHBASE_SCOPE` | string | `"_default"` | Target scope |
| `COUCHBASE_COLLECTION` | `COUCHBASE_COLLECTION` | string | `"_default"` | Target collection |
| `COUCHBASE_KV_TIMEOUT` | `COUCHBASE_KV_TIMEOUT` | number | `5000` | KV operation timeout (ms) |
| `COUCHBASE_KV_DURABLE_TIMEOUT` | `COUCHBASE_KV_DURABLE_TIMEOUT` | number | `10000` | Durable KV timeout (ms) |
| `COUCHBASE_QUERY_TIMEOUT` | `COUCHBASE_QUERY_TIMEOUT` | number | `15000` | N1QL query timeout (ms) |
| `COUCHBASE_ANALYTICS_TIMEOUT` | `COUCHBASE_ANALYTICS_TIMEOUT` | number | `30000` | Analytics timeout (ms) |
| `COUCHBASE_SEARCH_TIMEOUT` | `COUCHBASE_SEARCH_TIMEOUT` | number | `15000` | Full-text search timeout (ms) |
| `COUCHBASE_CONNECT_TIMEOUT` | `COUCHBASE_CONNECT_TIMEOUT` | number | `10000` | Connection timeout (ms) |
| `COUCHBASE_BOOTSTRAP_TIMEOUT` | `COUCHBASE_BOOTSTRAP_TIMEOUT` | number | `15000` | Cluster bootstrap timeout (ms) |

**Timeout Validation Ranges** (enforced by Zod schema):

| Timeout | Minimum | Maximum |
|---------|---------|---------|
| KV | 1,000ms | 30,000ms |
| KV Durable | 5,000ms | 60,000ms |
| Query | 5,000ms | 120,000ms |
| Analytics | 10,000ms | 300,000ms |
| Search | 5,000ms | 120,000ms |
| Connect | 5,000ms | 60,000ms |
| Bootstrap | 10,000ms | 120,000ms |

### Runtime Settings

| Variable | Env Var | Type | Default | Description |
|----------|---------|------|---------|-------------|
| `NODE_ENV` | `NODE_ENV` | string | `"development"` | Runtime environment (`development`, `staging`, `production`, `test`) |
| `CN_ROOT` | `CN_ROOT` | string | `"/usr/src/app"` | Application root path |
| `CN_CXXCBC_CACHE_DIR` | `CN_CXXCBC_CACHE_DIR` | string | undefined | Couchbase C++ SDK cache directory |
| `SOURCE_MAP_SUPPORT` | `SOURCE_MAP_SUPPORT` | boolean | `true` | Enable source map support |
| `PRESERVE_SOURCE_MAPS` | `PRESERVE_SOURCE_MAPS` | boolean | `true` | Preserve source maps in production |
| `BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS` | `BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS` | number | `120` | Bun DNS cache TTL (seconds, max 3600) |

### Deployment Settings

| Variable | Env Var | Type | Default | Description |
|----------|---------|------|---------|-------------|
| `BASE_URL` | `BASE_URL` | string | `"http://localhost"` | Service base URL |
| `HOSTNAME` | `HOSTNAME` | string | `"0.0.0.0"` | Bind hostname |
| `INSTANCE_ID` | `INSTANCE_ID` | string | `"unknown"` | Service instance identifier |
| `CONTAINER_ID` | `CONTAINER_ID` | string | undefined | Container identifier |
| `K8S_POD_NAME` | `K8S_POD_NAME` | string | undefined | Kubernetes pod name |
| `K8S_NAMESPACE` | `K8S_NAMESPACE` | string | undefined | Kubernetes namespace |

### Telemetry Settings

| Variable | Env Var | Type | Default | Description |
|----------|---------|------|---------|-------------|
| `ENABLE_OPENTELEMETRY` | `ENABLE_OPENTELEMETRY` | boolean | `true` | Enable OpenTelemetry |
| `SERVICE_NAME` | `OTEL_SERVICE_NAME` | string | `"capellaql-service"` | Service identifier for telemetry |
| `SERVICE_VERSION` | `OTEL_SERVICE_VERSION` | string | `"2.0"` | Service version |
| `DEPLOYMENT_ENVIRONMENT` | `DEPLOYMENT_ENVIRONMENT` | string | `"development"` | Deployment environment |
| `OTLP_ENDPOINT` | `OTEL_EXPORTER_OTLP_ENDPOINT` | string | - | Base OTLP endpoint (fallback) |
| `TRACES_ENDPOINT` | `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | string | `"http://localhost:4318/v1/traces"` | Traces endpoint |
| `METRICS_ENDPOINT` | `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | string | `"http://localhost:4318/v1/metrics"` | Metrics endpoint |
| `LOGS_ENDPOINT` | `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | string | `"http://localhost:4318/v1/logs"` | Logs endpoint |
| `METRIC_READER_INTERVAL` | `METRIC_READER_INTERVAL` | number | `60000` | Metrics export interval (ms) |
| `SUMMARY_LOG_INTERVAL` | `SUMMARY_LOG_INTERVAL` | number | `300000` | Summary logging interval (ms) |
| `EXPORT_TIMEOUT_MS` | `EXPORT_TIMEOUT_MS` | number | `30000` | OTLP export timeout (ms) |
| `BATCH_SIZE` | `BATCH_SIZE` | number | `2048` | Telemetry batch size |
| `MAX_QUEUE_SIZE` | `MAX_QUEUE_SIZE` | number | `10000` | Max queue before dropping |
| `CIRCUIT_BREAKER_THRESHOLD` | `CIRCUIT_BREAKER_THRESHOLD` | number | `5` | Failure threshold before circuit opens |
| `CIRCUIT_BREAKER_TIMEOUT_MS` | `CIRCUIT_BREAKER_TIMEOUT_MS` | number | `60000` | Recovery timeout (ms) |
| `LOG_RETENTION_DEBUG_DAYS` | `LOG_RETENTION_DEBUG_DAYS` | number | `1` | Debug log retention (days) |
| `LOG_RETENTION_INFO_DAYS` | `LOG_RETENTION_INFO_DAYS` | number | `7` | Info log retention (days) |
| `LOG_RETENTION_WARN_DAYS` | `LOG_RETENTION_WARN_DAYS` | number | `30` | Warning log retention (days) |
| `LOG_RETENTION_ERROR_DAYS` | `LOG_RETENTION_ERROR_DAYS` | number | `90` | Error log retention (days) |

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

## Configuration Hot-Reload

The service supports hot-reloading of environment configuration without restarting (`src/lib/configHotReload.ts`).

- **File watching**: Monitors `.env` and `.env.local` (configurable) for changes using `configWatcher`. When a file change is detected, the new configuration is parsed and diffed against the current state.
- **Validation before apply**: New configuration is validated (required variables, URL formats, numeric ranges, production security rules) before being applied. If validation fails, the change is rejected and a `configurationReloadFailed` event is emitted.
- **Rollback on error**: If an error occurs during application of a validated config, the system automatically rolls back to the previous configuration from a backup snapshot.
- **Events**: Emits `configurationReloaded`, `configurationReloadFailed`, and `configurationRolledBack` events for integration with other subsystems.

---

## Example Configuration

### Development
```bash
# .env
PORT=4000
NODE_ENV=development
COUCHBASE_URL=couchbase://localhost
COUCHBASE_USERNAME=Administrator
COUCHBASE_PASSWORD=password
COUCHBASE_BUCKET=default
ENABLE_OPENTELEMETRY=true
```

### Production
```bash
# .env.production
PORT=4000
NODE_ENV=production
COUCHBASE_URL=couchbases://your-cluster.cloud.couchbase.com
COUCHBASE_USERNAME=app_user
COUCHBASE_PASSWORD=secure_password
COUCHBASE_BUCKET=fashion-bucket
COUCHBASE_SCOPE=retail
COUCHBASE_COLLECTION=looks
ENABLE_OPENTELEMETRY=true
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://otel.example.com/v1/traces
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=https://otel.example.com/v1/metrics
OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=https://otel.example.com/v1/logs
```

---

## Production Security Validation

The following checks are enforced automatically when `NODE_ENV=production` or `DEPLOYMENT_ENVIRONMENT=production`:

| Check | Rule |
|-------|------|
| **Default Password** | `COUCHBASE_PASSWORD` cannot be `"password"` |
| **Password Length** | `COUCHBASE_PASSWORD` must be at least 12 characters |
| **Default Username** | Warning if `COUCHBASE_USERNAME` is `"Administrator"` |
| **Database Host** | `COUCHBASE_URL` cannot use `localhost` or `127.0.0.1` |
| **CORS Origins** | `ALLOWED_ORIGINS` cannot include wildcards or localhost |
| **Service Name** | Cannot contain `localhost`, `test`, or `local` |
| **Service Version** | Cannot be `dev`, `latest`, or `0.0.0` |

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
