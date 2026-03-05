# Docker Documentation

This document describes the Docker configuration for CapellaQL, including build targets, security features, and deployment guidelines.

## Build Targets

The Dockerfile supports multiple build targets for different environments:

| Target | Base Image | Purpose |
|--------|------------|---------|
| `deps-base` | `oven/bun:1.1-alpine` | Base with Bun, dumb-init, UID 65532 |
| `deps-dev` | `deps-base` | All dependencies (dev + prod) |
| `deps-prod` | `deps-base` | Production dependencies only |
| `development` | `deps-dev` | Full development environment with hot reload |
| `builder` | `deps-dev` | TypeScript compilation and bundling |
| `production` | `gcr.io/distroless/static-debian12:nonroot` | Minimal distroless production image |
| `release` | `deps-base` | Alpine-based fallback for production |

### Building for Development

```bash
docker build --target development -t capellaql:dev .
docker run -p 4000:4000 -v ./src:/usr/src/app/src:ro capellaql:dev
```

### Building for Production

```bash
# Production (distroless)
docker build --target production -t capellaql:prod .

# Alternative (Alpine fallback)
docker build --target release -t capellaql:release .
```

## Security Features

### PID 1 Signal Handling (dumb-init)

The container uses `dumb-init` as the ENTRYPOINT for proper signal handling:

- Forwards SIGTERM to the Bun process for graceful shutdown
- Prevents zombie processes
- Ensures clean container termination

Graceful shutdown handlers in `src/server/index.ts:310-372` are triggered when the container receives SIGTERM.

### Non-root User (UID 65532)

The container runs as a non-root user following distroless conventions:

- UID: 65532
- GID: 65532
- Matches Kubernetes PodSecurityPolicy requirements
- Compatible with `runAsNonRoot: true` security contexts

### Distroless Base Image

The production image uses Google's distroless base:

```
gcr.io/distroless/static-debian12:nonroot
```

Benefits:
- Minimal attack surface (no shell, no package manager)
- Smaller image size
- Reduced CVE exposure
- SLSA Level 3 compliance ready

### Supply Chain Security

- Container signing with cosign (keyless OIDC)
- SBOM generation (SPDX, CycloneDX, Syft JSON formats)
- SBOM attestation
- 6-scanner security matrix (Snyk, Trivy, Grype, CodeQL, Semgrep, Secrets)
- Provenance generation enabled

## Local Development with Docker Compose

### Basic Development

```bash
# Start only the application
docker compose up capellaql

# Or with build
docker compose up --build capellaql
```

### With Observability Stack

```bash
# Start with Jaeger, Prometheus, and Grafana
docker compose --profile observability up

# Access points:
# - Application: http://localhost:4000
# - Jaeger UI: http://localhost:16686
# - Prometheus: http://localhost:9090
# - Grafana: http://localhost:3001 (admin/admin)
```

### Useful Commands

```bash
# View logs
docker compose logs -f capellaql

# Rebuild and restart
docker compose up --build -d capellaql

# Stop all services
docker compose down

# Clean up (including volumes)
docker compose down -v
```

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `COUCHBASE_URL` | Couchbase connection string |
| `COUCHBASE_USERNAME` | Couchbase username |
| `COUCHBASE_PASSWORD` | Couchbase password |
| `COUCHBASE_BUCKET` | Couchbase bucket name |
| `COUCHBASE_SCOPE` | Couchbase scope name |
| `COUCHBASE_COLLECTION` | Couchbase collection name |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | Server port |
| `LOG_LEVEL` | `info` | Logging level |
| `NODE_ENV` | `production` | Environment |
| `ENABLE_OPENTELEMETRY` | `true` | Enable telemetry |
| `TRACES_ENDPOINT` | - | OTLP traces endpoint |
| `METRICS_ENDPOINT` | - | OTLP metrics endpoint |
| `LOGS_ENDPOINT` | - | OTLP logs endpoint |

## Health Checks

The container includes a health check that runs every 30 seconds:

```bash
# Check container health manually
docker exec capellaql-test /usr/local/bin/bun run healthcheck

# View health status
docker inspect --format='{{.State.Health.Status}}' capellaql-test
```

Health endpoints:
- `/health` - Basic health check
- `/health/ready` - Readiness probe
- `/health/live` - Liveness probe

## Graceful Shutdown

The container handles graceful shutdown properly:

1. SIGTERM is sent to the container
2. dumb-init forwards the signal to Bun
3. Graceful shutdown handlers execute:
   - Close active connections
   - Drain request queue
   - Flush telemetry
   - Close database connections
4. Container exits with code 0

Timeout: 30 seconds (configurable via `docker stop --time=N`)

## Troubleshooting

### Container fails to start

```bash
# Check logs
docker logs capellaql-test

# Common issues:
# - Missing environment variables
# - Database connection errors
# - Port conflicts
```

### Health check failures

```bash
# Check if database is reachable
docker exec capellaql-test /usr/local/bin/bun run healthcheck

# Verify environment
docker exec capellaql-test printenv | grep COUCHBASE
```

### Image size issues

```bash
# Check image layers
docker history capellaql:prod

# Compare targets
docker images | grep capellaql
```

### Permission denied errors

The container runs as UID 65532. Ensure volumes have correct permissions:

```bash
# Fix permissions on host
chown -R 65532:65532 ./data
```

## CI/CD Integration

### GitHub Actions

The `docker-ci-cd.yml` workflow:

1. **Build Job** - Multi-platform build (amd64, arm64)
2. **Security Scan Job** - 6 parallel scanners
3. **Sign & Attest Job** - cosign signing and SBOM attestation
4. **Integration Test Job** - Health check and graceful shutdown validation
5. **Summary Job** - Build report

### Security Monitoring

Additional workflows:
- `security-audit.yml` - Daily at 6 AM UTC
- `cve-monitoring.yml` - Every 6 hours

## Multi-Architecture Support

The production image supports:
- `linux/amd64`
- `linux/arm64`

Build with:

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t capellaql:multi .
```

## Image Verification

Verify container signatures:

```bash
cosign verify \
  --certificate-identity-regexp=".*" \
  --certificate-oidc-issuer-regexp=".*" \
  docker.io/zx8086/capellaql:latest
```

## Best Practices

1. **Always use tagged versions** in production, not `:latest`
2. **Set resource limits** in Kubernetes/ECS deployments
3. **Enable health checks** in orchestrators
4. **Mount secrets** via environment variables or secret managers
5. **Use read-only root filesystem** when possible
6. **Scan images** before deployment using CI/CD pipeline
7. **Monitor CVEs** via the cve-monitoring workflow
