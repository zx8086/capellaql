# Docker Deployment

## Container Overview

The authentication service uses **Docker Hardened Images (DHI)** - a distroless base image for maximum security and minimal attack surface with enterprise-grade supply chain security.

### Key Characteristics
- **Base Image**: `dhi.io/static:20230311` (Docker Hardened Images - distroless)
- **Security Score**: 12/12 (0 CVEs, SLSA Level 3)
- **User**: Non-root (UID 65532)
- **Signal Handling**: dumb-init for proper PID 1 behavior
- **Supply Chain**: SLSA Level 3 provenance, VEX attestations, SBOM generation
- **CVE SLA**: 7-day remediation for HIGH/CRITICAL vulnerabilities

## Dockerfile

```dockerfile
# Multi-stage optimized Dockerfile for Bun + Authentication Service
# syntax=docker/dockerfile:1
FROM oven/bun:1.3.9-alpine AS deps-base
WORKDIR /app

# Install minimal system dependencies
RUN --mount=type=cache,target=/var/cache/apk,sharing=locked \
    apk update && apk upgrade --no-cache && \
    apk add --no-cache ca-certificates dumb-init

# Dependencies stage - cache layer optimization
FROM deps-base AS deps-prod
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache,sharing=locked \
    bun install --frozen-lockfile --production

# Build stage
FROM deps-base AS builder
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run generate-docs && bun run build

# Docker Hardened Images production stage - SLSA Level 3 + VEX + SBOM
FROM dhi.io/static:20230311 AS production

# Copy Bun runtime
COPY --from=oven/bun:1.3.9-alpine --chown=65532:65532 /usr/local/bin/bun /usr/local/bin/bun
COPY --from=deps-base --chown=65532:65532 /usr/bin/dumb-init /usr/bin/dumb-init

# Copy musl dynamic linker and shared libraries
COPY --from=deps-base --chown=65532:65532 /lib/ld-musl-*.so.1 /lib/
COPY --from=deps-base --chown=65532:65532 /usr/lib/libgcc_s.so.1 /usr/lib/libstdc++.so.6 /usr/lib/

WORKDIR /app

# Copy production dependencies and application
COPY --from=deps-prod --chown=65532:65532 /app/node_modules ./node_modules
COPY --from=deps-prod --chown=65532:65532 /app/package.json ./package.json
COPY --from=builder --chown=65532:65532 /app/src ./src
COPY --from=builder --chown=65532:65532 /app/public ./public

# Explicitly set non-root user (required for Docker Scout "Default Non-Root User" policy)
USER 65532:65532

ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 TELEMETRY_MODE=otlp
EXPOSE 3000

# Health check using Bun native fetch (no curl in distroless)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["/usr/local/bin/bun", "--eval", "fetch('http://localhost:3000/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"]

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/usr/local/bin/bun", "src/index.ts"]

# OCI labels for DHI compliance
LABEL org.opencontainers.image.base.name="dhi.io/static:20230311" \
    security.dhi.enabled="true" \
    security.dhi.slsa.level="3" \
    security.dhi.vex.enabled="true" \
    security.dhi.cve.sla="7-days"
```

## Build Metadata

All Docker image metadata is automatically extracted from `package.json` during build. This ensures a single source of truth for service information.

| Build Argument | Source | Example |
|----------------|--------|---------|
| `SERVICE_NAME` | `package.json` → `name` | `authentication-service` |
| `SERVICE_VERSION` | `package.json` → `version` | `2.6.4` |
| `SERVICE_DESCRIPTION` | `package.json` → `description` | `High-performance JWT...` |
| `SERVICE_AUTHOR` | `package.json` → `author` | `Simon Owusu` |
| `SERVICE_LICENSE` | `package.json` → `license` | `UNLICENSED` |
| `BUILD_DATE` | Generated at build time | `2025-02-21T10:30:00Z` |
| `VCS_REF` | `git rev-parse --short HEAD` | `f5efc39` |

The `scripts/docker-build.sh` script extracts these values and passes them as `--build-arg` to Docker. The Dockerfile has no hardcoded defaults - all metadata flows from `package.json`.

**To update service metadata**: Edit `package.json` and rebuild. No Dockerfile changes needed.

## Build Commands

### Local Development
```bash
# Build Docker image (with metadata and caching)
bun run docker:build

# Build and run locally
bun run docker:local

# Security validation (10-point check)
bun run docker:security:full
```

### Production Build
```bash
# Multi-platform build (AMD64 for production)
docker buildx build --platform linux/amd64 \
  --tag example/authentication-service:latest \
  --push .

# Verify image size (target: <100MB, actual: 58MB)
docker images | grep authentication-service
```

## Container Configuration

### Environment Variables
```bash
# Core Configuration
NODE_ENV=production
PORT=3000

# Kong Integration
KONG_MODE=KONNECT
KONG_ADMIN_URL=https://us.api.konghq.com/v2/control-planes/abc123
KONG_ADMIN_TOKEN=your-production-token
KONG_JWT_AUTHORITY=https://sts-api.example.com/
KONG_JWT_AUDIENCE=http://api.example.com/

# Telemetry
TELEMETRY_MODE=otlp
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://otel.example.com/v1/traces
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=https://otel.example.com/v1/metrics

# High Availability (Optional)
HIGH_AVAILABILITY=true
REDIS_URL=rediss://redis.example.com:6380
```

### Running the Container
```bash
# Basic run (standard port 3000)
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e KONG_MODE=KONNECT \
  -e KONG_ADMIN_URL=https://us.api.konghq.com/v2/control-planes/abc123 \
  -e KONG_ADMIN_TOKEN=secret123 \
  -e KONG_JWT_AUTHORITY=https://sts-api.example.com/ \
  -e KONG_JWT_AUDIENCE=http://api.example.com/ \
  -e TELEMETRY_MODE=otlp \
  authentication-service:latest

# With Redis cache
docker run -p 3000:3000 \
  -e HIGH_AVAILABILITY=true \
  -e REDIS_URL=redis://redis:6379 \
  # ... other env vars
  authentication-service:latest
```

### Privileged Port Configuration (80, 443)

The application now supports all ports 1-65535 (including privileged ports 80, 443). For production deployments requiring standard HTTP/HTTPS ports, use Docker port mapping instead of running on privileged ports directly:

**Recommended Approach**: Port Mapping (No Special Permissions)
```bash
# Map host port 80 to container port 3000 (recommended)
docker run -p 80:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e KONG_MODE=KONNECT \
  # ... other env vars
  authentication-service:latest

# Map host port 443 to container port 3000
docker run -p 443:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e KONG_MODE=KONNECT \
  # ... other env vars
  authentication-service:latest
```

**Alternative**: Container Running on Privileged Port (Requires CAP_NET_BIND_SERVICE)
```bash
# Run container on port 80 (requires NET_BIND_SERVICE capability)
docker run -p 80:80 \
  --cap-add=NET_BIND_SERVICE \
  -e NODE_ENV=production \
  -e PORT=80 \
  -e KONG_MODE=KONNECT \
  # ... other env vars
  authentication-service:latest
```

**Port Configuration Notes**:
- **Recommended**: Use port mapping `-p 80:3000` (maps host port 80 to container port 3000)
- **Container Default**: Runs on port 3000 inside container (non-privileged)
- **Host Access**: External clients connect via port 80/443 through Docker port mapping
- **Security**: Port mapping avoids granting `CAP_NET_BIND_SERVICE` capability
- **Production Pattern**: Let infrastructure handle port 80/443 (load balancers, nginx, HAProxy)
- **Cloud Deployments**: Use load balancer target groups (ALB port 80 → target group port 3000)

## Docker Compose

### Production Setup
```yaml
version: '3.8'

services:
  authentication-service:
    image: ${SERVICE_NAME:-authentication-service}:${VERSION:-latest}
    build:
      context: .
      target: production
      dockerfile: Dockerfile
      platforms:
        - linux/amd64

    # Security hardening for production
    user: "65532:65532"
    read_only: true

    cap_drop:
      - ALL
    cap_add:
      - CHOWN
      - SETGID
      - SETUID

    security_opt:
      - no-new-privileges:true

    # Resource limits optimized for 100k+ req/sec
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '1.0'
        reservations:
          memory: 512M
          cpus: '0.5'

    # Health check using Bun native fetch (distroless compatible)
    healthcheck:
      test: ["/usr/local/bin/bun", "--eval", "fetch('http://localhost:3000/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 40s

    environment:
      - NODE_ENV=production
      - PORT=3000
      - KONG_MODE=${KONG_MODE:-API_GATEWAY}
      - KONG_ADMIN_URL=${KONG_ADMIN_URL}
      - KONG_ADMIN_TOKEN=${KONG_ADMIN_TOKEN}
      - KONG_JWT_AUTHORITY=${KONG_JWT_AUTHORITY}
      - KONG_JWT_AUDIENCE=${KONG_JWT_AUDIENCE}
      - TELEMETRY_MODE=${TELEMETRY_MODE:-otlp}

    ports:
      - "${HOST_PORT:-3000}:3000"  # Port mapping: HOST_PORT=80 maps port 80 → container 3000

    # Temporary filesystem for distroless
    tmpfs:
      - /tmp:noexec,nosuid,nodev,size=100m,mode=1777

    restart: unless-stopped

  # Optional Redis for high availability
  redis:
    image: redis:7.4-alpine
    command: redis-server --appendonly yes --maxmemory 128mb --maxmemory-policy allkeys-lru
    user: "999:999"
    read_only: true
    deploy:
      resources:
        limits:
          memory: 128M
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 3s
      retries: 3
    restart: unless-stopped
```

## Container Security

### Security Features (12/12 Score)
- **DHI Base Image**: Docker Hardened Images (0 CVEs, SLSA Level 3)
- **Non-root user**: Runs as UID 65532 (distroless nonroot)
- **Read-only filesystem**: Immutable container with tmpfs for /tmp and /app/profiles
- **Dropped capabilities**: All capabilities dropped, minimal additions
- **No privilege escalation**: `no-new-privileges:true`
- **OWASP headers**: All responses include security headers (HSTS, CSP, X-Frame-Options)
- **Health checks**: Built-in health monitoring via Bun native fetch
- **TLS/SSL**: Supports secure Redis connections (REDISS)
- **SLSA Level 3**: Cryptographic provenance attestations
- **VEX Attestations**: Vulnerability exploitability analysis (~30% false positive reduction)
- **SBOM Generation**: Complete software inventory
- **7-Day CVE SLA**: Automated patching for HIGH/CRITICAL vulnerabilities

### Security Validation
```bash
# Run full security validation
bun run docker:security:full

# DHI-specific commands
bun run docker:dhi:verify-provenance    # Verify SLSA Level 3
bun run docker:dhi:extract-sbom         # Extract SBOM
bun run docker:dhi:check-vex            # Check VEX attestations
bun run docker:dhi:cve-scan             # Scan for CVEs

# Expected output: 12/12 security score
```

### CI/CD Attestation Verification

The build workflow automatically verifies DHI attestations before every build:

```bash
# Local verification (same as CI/CD)
docker scout attestation dhi.io/static:20230311
docker scout cves dhi.io/static:20230311 --only-severity critical,high
```

| Verification Step | Command | Expected Result |
|-------------------|---------|-----------------|
| SBOM attestation | `docker scout attestation` | Present |
| Provenance | `docker scout attestation` | SLSA Level 3 |
| CVE scan | `docker scout cves` | 0 HIGH/CRITICAL |

## Performance Characteristics

| Metric | Value |
|--------|-------|
| Image Size | 58MB |
| Memory Baseline | ~50-80MB |
| Memory Limit (Production) | 1G |
| CPU Overhead | <2% with full observability |
| Cold Start | <100ms |
| Throughput | 100k+ req/sec |

## Health Endpoints

| Endpoint | Purpose | Usage |
|----------|---------|-------|
| `/health` | Liveness probe | Full dependency check |
| `/health/ready` | Readiness probe | Kong connectivity check |
| `/metrics` | Operational metrics | Performance monitoring |

## Monitoring and Debugging

### Container Logs
```bash
# View logs
docker logs auth-service

# Follow logs (JSON structured)
docker logs -f auth-service

# View specific lines
docker logs --tail 100 auth-service
```

### Health Monitoring
```bash
# Check health status
docker inspect --format='{{.State.Health.Status}}' auth-service

# Health check logs
docker inspect --format='{{range .State.Health.Log}}{{.Output}}{{end}}' auth-service
```

### Container Stats
```bash
# Resource usage
docker stats --no-stream auth-service

# Detailed inspection
docker inspect auth-service
```

## Troubleshooting

### Common Issues

#### Container Won't Start
```bash
# Check logs for errors
docker logs auth-service

# Verify environment variables are set
docker inspect auth-service --format='{{range .Config.Env}}{{println .}}{{end}}' | grep KONG
```

#### Health Check Failing
```bash
# Test health endpoint directly
docker run --rm --network container:auth-service \
  curlimages/curl:latest curl -f http://localhost:3000/health

# Check readiness
docker run --rm --network container:auth-service \
  curlimages/curl:latest curl -f http://localhost:3000/health/ready
```

#### High Memory Usage
```bash
# Monitor memory usage
docker stats auth-service

# Check metrics endpoint
docker run --rm --network container:auth-service \
  curlimages/curl:latest curl http://localhost:3000/metrics
```

> **Note**: Distroless containers have no shell. Use sidecar containers or external tools for debugging.

## Container Registry

### Tagging Strategy
```bash
# Version tags
docker tag authentication-service:latest example/authentication-service:v2.4.0
docker tag authentication-service:latest example/authentication-service:latest

# Environment tags
docker tag authentication-service:latest example/authentication-service:production
```

### Registry Push
```bash
# Push to registry
docker push example/authentication-service:v2.4.0
docker push example/authentication-service:latest
```
