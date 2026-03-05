# CapellaQL Docker & CI/CD Implementation Guide

## Overview

This guide provides a comprehensive implementation overview of CapellaQL's containerization and CI/CD pipeline, featuring multi-stage Docker builds optimized for Bun runtime and a production-ready GitHub Actions workflow with security scanning and multi-platform support.

## Table of Contents

1. [Docker Implementation](#docker-implementation)
2. [GitHub Actions CI/CD Pipeline](#github-actions-cicd-pipeline)
3. [Security & Compliance](#security--compliance)
4. [Implementation Steps](#implementation-steps)
5. [Configuration Management](#configuration-management)
6. [Troubleshooting](#troubleshooting)

## Docker Implementation

### Multi-Stage Build Architecture

The Dockerfile implements a sophisticated 5-stage build process optimized for production deployment:

#### Stage 1: Base (`base`)
```dockerfile
FROM oven/bun:canary-alpine AS base
```

**Purpose**: Establishes common environment and dependencies
- **Runtime**: Bun canary for latest features and performance optimizations
- **OS**: Alpine Linux for minimal attack surface
- **Optimizations**: 
  - DNS caching with 120-second TTL
  - Dedicated cache directories for build artifacts
  - Pre-configured directory structure with proper permissions

**Key Environment Variables**:
- `BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS=120` - DNS caching optimization
- `BUN_INSTALL_CACHE_DIR` - Bun package cache location
- `CN_CXXCBC_CACHE_DIR` - Couchbase C++ dependencies cache

#### Stage 2: Dependencies (`deps`)
```dockerfile
FROM base AS deps
```

**Purpose**: Production dependency installation with aggressive caching
- **Cache Strategy**: Multi-layer cache mounts for optimal build performance
- **Security**: Frozen lockfile to ensure reproducible builds
- **Performance**: Dedicated .bun-cache for faster subsequent builds

**Cache Mounts**:
- `/usr/src/app/.bun-cache` - Bun internal cache
- `/root/.bun` - Global Bun configuration cache

#### Stage 3: Development (`development`)
```dockerfile
FROM deps AS development
```

**Purpose**: Development-optimized environment
- **Hot Reload**: Bun's native file watching
- **Full Toolchain**: All dev dependencies included
- **Debug Support**: Source maps and verbose logging enabled

**Usage**:
```bash
# Build development image
docker build --target development -t capellaql:dev .

# Run with hot reload
docker run -p 4000:4000 -v $(pwd)/src:/usr/src/app/src capellaql:dev
```

#### Stage 4: Builder (`builder`)
```dockerfile
FROM deps AS builder
```

**Purpose**: Production build optimization
- **Bun Native Bundler**: Leverages Bun's high-performance bundling
- **Tree Shaking**: Eliminates unused code
- **Source Maps**: Preserved for production debugging
- **Code Splitting**: Optimized chunk generation

**Build Configuration**:
```bash
bun build ./src/index.ts \
  --target=bun \
  --outdir ./dist \
  --sourcemap \
  --minify \
  --splitting \
  --external dns \
  --external bun
```

#### Stage 5: Release (`release`)
```dockerfile
FROM base AS release
```

**Purpose**: Production-ready minimal image
- **Size Optimization**: Only production dependencies and built assets
- **Security**: Non-root user execution
- **Monitoring**: Built-in healthcheck with Bun-optimized script
- **Source Maps**: Preserved for production debugging

### Container Metadata & Labels

Comprehensive OCI-compliant metadata for container registries:

```dockerfile
LABEL org.opencontainers.image.title="capellaql" \
      org.opencontainers.image.description="CapellaQL: High-performance GraphQL service built with Bun for Couchbase Capella" \
      org.opencontainers.image.version="${BUILD_VERSION:-2.0.0}"
```

### Health Check Implementation

Production-ready health monitoring:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD bun run healthcheck || exit 1
```

**Health Check Script** (`src/healthcheck.ts`):
- Database connectivity validation
- Memory usage assessment
- OpenTelemetry system health
- GraphQL endpoint verification

## GitHub Actions CI/CD Pipeline

### Workflow Overview

**File**: `.github/workflows/docker-ci-cd.yml`

The pipeline implements enterprise-grade CI/CD with:
- Multi-platform builds (linux/amd64, linux/arm64)
- Security scanning with Snyk
- SBOM generation
- Container attestation
- Automated testing and validation

### Trigger Configuration

```yaml
on:
  push:
    branches: ["master"]
  pull_request:
    branches: ["master"]
  schedule:
    - cron: "0 0 * * 0"  # Weekly security scans
```

### Environment Setup Action

**Custom Action**: `.github/actions/setup-environment/action.yml`

Provides consistent environment setup across all jobs:

```yaml
- name: Setup Environment
  uses: ./.github/actions/setup-environment
```

**Components**:
1. **QEMU Setup**: Multi-platform emulation support
2. **Docker Buildx**: Advanced build features and multi-platform support
3. **Bun Installation**: Latest runtime with optimized configuration
4. **Security Tools**: Cosign, Syft for container signing and SBOM generation

### Multi-Platform Build Strategy

```yaml
platforms: linux/amd64,linux/arm64
```

**Benefits**:
- Native ARM64 support for Apple Silicon and ARM servers
- Optimized performance on both x86_64 and ARM architectures
- Future-proof deployment options

### Registry Caching Strategy

Advanced layer caching for optimal build performance:

```yaml
cache-from: |
  type=registry,ref=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:buildcache
  type=registry,ref=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest
cache-to: |
  type=registry,ref=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:buildcache,mode=max
```

### Container Testing Pipeline

Comprehensive container validation:

1. **Image Availability Check**: Verifies registry push success
2. **Container Health Test**: Validates startup and basic functionality
3. **Runtime Verification**: Confirms application responsiveness

```bash
# Health test example
docker run -d --name capellaql-test -p 4000:4000 --env-file .env "${IMAGE_TAG}"
sleep 15
# Verify container health and responsiveness
```

## Security & Compliance

### Snyk Security Scanning

**Dual-Layer Security Analysis**:

1. **Code Scanning**:
   ```bash
   snyk test --file=package.json --sarif-file-output=snyk.sarif --severity-threshold=high
   ```

2. **Container Scanning**:
   ```bash
   snyk container test "${FULL_IMAGE_TAG}" --file=Dockerfile --severity-threshold=high
   ```

### SBOM Generation

**Software Bill of Materials** for compliance and security:

```bash
syft "${IMAGE_TAG}" \
  -o json=sbom-output/syft-sbom.json \
  -o spdx-json=sbom-output/spdx-sbom.json \
  -o cyclonedx-json=sbom-output/cyclonedx-sbom.json
```

**Formats Supported**:
- SPDX JSON (Industry standard)
- CycloneDX JSON (OWASP format)
- Syft native JSON

### GitHub Advanced Security Integration

```yaml
permissions:
  contents: read
  security-events: write
  packages: write
```

Automated SARIF upload for security findings visualization in GitHub Security tab.

## Implementation Steps

### 1. Repository Setup

**Required Secrets** (GitHub repository settings):
```yaml
secrets:
  DOCKER_HUB_USERNAME: your-dockerhub-username
  DOCKER_HUB_ACCESS_TOKEN: your-dockerhub-token
  SNYK_TOKEN: your-snyk-api-token
  COUCHBASE_URL: your-couchbase-connection-string
  COUCHBASE_USERNAME: your-couchbase-username
  COUCHBASE_PASSWORD: your-couchbase-password
```

**Required Variables**:
```yaml
vars:
  BASE_URL: https://your-api-domain.com
  PORT: "4000"
  LOG_LEVEL: "info"
  COUCHBASE_BUCKET: your-bucket-name
  COUCHBASE_SCOPE: your-scope-name
  COUCHBASE_COLLECTION: your-collection-name
  SERVICE_NAME: "CapellaQL Service"
  DEPLOYMENT_ENVIRONMENT: "production"
```

### 2. Docker Configuration

**Directory Structure**:
```
├── Dockerfile
├── .dockerignore
├── bunfig.toml
└── src/
    └── healthcheck.ts
```

**.dockerignore**:
```gitignore
node_modules
.git
.github
*.md
test/
coverage/
.env*
dist/
logs/
```

### 3. Local Development Commands

```bash
# Development with hot reload
bun run docker:build:dev
bun run docker:run

# Production build testing
bun run docker:build
docker run -p 4000:4000 --env-file .env capellaql

# Multi-platform build (requires buildx)
docker buildx build --platform linux/amd64,linux/arm64 -t capellaql:latest .
```

### 4. CI/CD Pipeline Activation

1. **Push Dockerfile** and workflow files to master branch
2. **Configure secrets** in repository settings
3. **Monitor first build** in Actions tab
4. **Verify image** in Docker Hub registry

## Configuration Management

### Environment Variable Mapping

**Build-time Variables**:
- `BUILD_DATE` - ISO timestamp of build
- `BUILD_VERSION` - Git branch or tag name
- `COMMIT_HASH` - Git commit SHA

**Runtime Configuration** (`.env` file):
```bash
# Application
BASE_URL=https://api.yoursite.com
PORT=4000
NODE_ENV=production

# Couchbase
COUCHBASE_URL=couchbases://your-cluster.cloud.couchbase.com
COUCHBASE_USERNAME=your-username
COUCHBASE_PASSWORD=your-password
COUCHBASE_BUCKET=your-bucket

# OpenTelemetry
ENABLE_OPENTELEMETRY=true
TRACES_ENDPOINT=https://your-otel-collector/v1/traces
METRICS_ENDPOINT=https://your-otel-collector/v1/metrics
LOGS_ENDPOINT=https://your-otel-collector/v1/logs
```

### Production Optimizations

**Bun Runtime Configuration**:
```bash
BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS=120
BUN_CONFIG_VERBOSE_FETCH=false
SOURCE_MAP_SUPPORT=true
PRESERVE_SOURCE_MAPS=true
```

**Container Resource Limits** (docker-compose.yml):
```yaml
services:
  capellaql:
    image: zx8086/capellaql:latest
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
        reservations:
          memory: 256M
          cpus: '0.25'
```

## Troubleshooting

### Common Build Issues

**1. Bun Cache Corruption**
```bash
# Clear all caches
docker system prune -af
docker builder prune -af

# Rebuild without cache
docker build --no-cache -t capellaql .
```

**2. Multi-platform Build Failures**
```bash
# Verify buildx installation
docker buildx version

# Reset buildx builder
docker buildx rm multiplatform-builder
docker buildx create --name multiplatform-builder --use
docker buildx inspect --bootstrap
```

**3. Registry Authentication Issues**
```bash
# Verify Docker Hub login
docker logout
docker login -u your-username

# Check token permissions (must include write access)
```

### Runtime Debugging

**Container Logs**:
```bash
# Follow live logs
docker logs -f capellaql-container

# Export logs for analysis
docker logs capellaql-container > app.log 2>&1
```

**Health Check Debugging**:
```bash
# Manual health check
docker exec -it capellaql-container bun run healthcheck

# Container inspection
docker inspect capellaql-container | jq '.State.Health'
```

### Performance Optimization

**Build Performance**:
- Use `--cache-from` for registry cache utilization
- Implement .dockerignore to reduce build context
- Leverage multi-stage builds for layer optimization

**Runtime Performance**:
- Configure Bun DNS caching appropriately
- Use production NODE_ENV in release builds
- Implement proper resource limits in production

### Security Best Practices

**Container Security**:
- Run as non-root user (implemented)
- Use minimal base images (Alpine Linux)
- Regular security scanning with Snyk
- SBOM generation for supply chain security

**CI/CD Security**:
- Secrets management via GitHub secrets
- SARIF upload for security findings
- Container signing with Cosign (prepared)
- Weekly automated security scans

## Performance Metrics

### Build Performance

**Typical Build Times**:
- Cold build (no cache): ~8-12 minutes
- Warm build (with cache): ~3-5 minutes
- Multi-platform: ~15-20 minutes

**Image Sizes**:
- Development image: ~400MB
- Production image: ~180MB
- Compressed layers: ~60MB

### Runtime Performance

**Container Startup**:
- Cold start: ~2-3 seconds
- Warm start: ~1-2 seconds
- Health check response: ~200-500ms

**Resource Usage** (typical):
- Memory: 150-250MB
- CPU: 0.1-0.3 cores (idle)
- Memory: 300-500MB (under load)

## Conclusion

This implementation provides enterprise-grade containerization and CI/CD capabilities for CapellaQL, featuring:

- **Production-Ready**: Multi-stage builds with security scanning
- **Performance-Optimized**: Bun-native optimizations and caching strategies
- **Security-First**: SBOM generation, vulnerability scanning, and attestation
- **Multi-Platform**: Native support for x86_64 and ARM64 architectures
- **Monitoring-Ready**: Built-in health checks and observability integration

The system is designed for scalability, security, and maintainability in production environments while providing efficient development workflows.