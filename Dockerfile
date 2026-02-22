# syntax=docker/dockerfile:1.4

# =============================================================================
# CapellaQL Production Dockerfile
# Phase 1: SIO-414 - dumb-init + pinned Bun version
# Phase 2: SIO-415 - DHI distroless production stage
# =============================================================================

# -----------------------------------------------------------------------------
# ARG declarations for build-time configuration
# -----------------------------------------------------------------------------
ARG BUN_VERSION=1.3
ARG DHI_IMAGE=gcr.io/distroless/static-debian12:nonroot
ARG BUILD_DATE=unknown
ARG BUILD_VERSION=2.0.0
ARG COMMIT_HASH=unknown

# =============================================================================
# Stage 1: deps-base - Base Alpine with Bun and dumb-init
# =============================================================================
FROM oven/bun:${BUN_VERSION}-alpine AS deps-base

# Install dumb-init and ca-certificates for proper signal handling and TLS
RUN apk add --no-cache dumb-init ca-certificates

# Create nonroot user matching distroless UID 65532
RUN addgroup -g 65532 -S nonroot && \
    adduser -u 65532 -S nonroot -G nonroot

# Set common environment variables optimized for Bun
ENV CN_ROOT=/usr/src/app \
    CN_CXXCBC_CACHE_DIR=/usr/src/app/deps/couchbase-cxx-cache \
    NODE_ENV=production \
    BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS=120 \
    BUN_INSTALL_CACHE_DIR=/usr/src/app/.bun-cache

WORKDIR /usr/src/app

# Create directories with proper permissions for UID 65532
RUN mkdir -p /usr/src/app/logs \
             /usr/src/app/deps/couchbase-cxx-cache \
             /usr/src/app/.sourcemaps \
             /usr/src/app/.bun-cache && \
    chown -R 65532:65532 /usr/src/app

# =============================================================================
# Stage 2: deps-dev - Development dependencies
# =============================================================================
FROM deps-base AS deps-dev

# Copy package files for dependency resolution
COPY --chown=65532:65532 package.json bun.lock* bunfig.toml tsconfig.json ./

# Install ALL dependencies (including devDependencies)
RUN --mount=type=cache,target=/usr/src/app/.bun-cache,sharing=locked \
    --mount=type=cache,target=/root/.bun,sharing=locked \
    bun install --frozen-lockfile && \
    chown -R 65532:65532 node_modules

# =============================================================================
# Stage 3: deps-prod - Production dependencies only
# =============================================================================
FROM deps-base AS deps-prod

# Copy package files for dependency resolution
COPY --chown=65532:65532 package.json bun.lock* bunfig.toml tsconfig.json ./

# Install production dependencies only
RUN --mount=type=cache,target=/usr/src/app/.bun-cache,sharing=locked \
    --mount=type=cache,target=/root/.bun,sharing=locked \
    bun install --frozen-lockfile --production && \
    chown -R 65532:65532 node_modules

# =============================================================================
# Stage 4: development - Full development environment
# =============================================================================
FROM deps-dev AS development
ENV NODE_ENV=development

# Copy source files
COPY --chown=65532:65532 . .

USER 65532:65532

# Use dumb-init + Bun's hot reload in development
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["bun", "run", "dev"]

# =============================================================================
# Stage 5: builder - TypeScript compilation and bundling
# =============================================================================
FROM deps-dev AS builder

# Copy source files for building
COPY --chown=65532:65532 src/ ./src/
COPY --chown=65532:65532 tsconfig.json bunfig.toml ./

# Build with Bun's native bundler and optimizations
RUN --mount=type=cache,target=/usr/src/app/.build \
    mkdir -p dist dist/maps && \
    bun build ./src/index.ts \
    --target=bun \
    --outdir ./dist \
    --sourcemap \
    --minify \
    --splitting \
    --external dns \
    --external bun \
    --root ./src \
    --entry-naming '[dir]/[name].[ext]' \
    --chunk-naming '[name]-[hash].[ext]' \
    --asset-naming '[name]-[hash].[ext]' && \
    find dist -name "*.map" -exec mv {} dist/maps/ \; || true && \
    chown -R 65532:65532 dist && \
    ls -la dist/

# =============================================================================
# Stage 6: production - DHI Distroless final image
# =============================================================================
FROM ${DHI_IMAGE} AS production

# Re-declare ARGs needed in this stage
ARG BUILD_DATE
ARG BUILD_VERSION
ARG COMMIT_HASH

WORKDIR /app

# Copy Bun runtime from official image
COPY --from=oven/bun:1.1-alpine /usr/local/bin/bun /usr/local/bin/bun

# Copy dumb-init for proper PID 1 signal handling
COPY --from=deps-base /usr/bin/dumb-init /usr/bin/dumb-init

# Copy musl libc and required libraries for Bun (Alpine-built)
COPY --from=deps-base /lib/ld-musl-*.so.1 /lib/
COPY --from=deps-base /usr/lib/libstdc++.so* /usr/lib/
COPY --from=deps-base /usr/lib/libgcc_s.so* /usr/lib/

# Copy CA certificates for TLS
COPY --from=deps-base /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy production dependencies from deps-prod stage
COPY --from=deps-prod --chown=65532:65532 /usr/src/app/node_modules ./node_modules
COPY --from=deps-prod --chown=65532:65532 /usr/src/app/package.json ./package.json

# Copy built application from builder stage
COPY --from=builder --chown=65532:65532 /usr/src/app/dist ./dist

# Copy telemetry source (needed at runtime)
COPY --chown=65532:65532 src/telemetry ./src/telemetry

# Set optimized production environment variables
ENV ENABLE_OPENTELEMETRY=true \
    SOURCE_MAP_SUPPORT=true \
    PRESERVE_SOURCE_MAPS=true \
    NODE_ENV=production \
    BUN_CONFIG_VERBOSE_FETCH=false \
    BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS=120

# Runtime configuration environment variables
ENV BASE_URL="" \
    PORT="4000" \
    LOG_LEVEL="info" \
    LOG_MAX_SIZE="20m" \
    LOG_MAX_FILES="14d" \
    YOGA_RESPONSE_CACHE_TTL="900000" \
    COUCHBASE_URL="" \
    COUCHBASE_USERNAME="" \
    COUCHBASE_BUCKET="" \
    COUCHBASE_SCOPE="" \
    COUCHBASE_COLLECTION="" \
    SERVICE_NAME="CapellaQL Service" \
    SERVICE_VERSION="2.0" \
    DEPLOYMENT_ENVIRONMENT="production" \
    TRACES_ENDPOINT="" \
    METRICS_ENDPOINT="" \
    LOGS_ENDPOINT="" \
    METRIC_READER_INTERVAL="60000" \
    SUMMARY_LOG_INTERVAL="300000" \
    ENABLE_FILE_LOGGING="false" \
    ALLOWED_ORIGINS=""

# Enhanced container metadata with SLSA compliance labels
LABEL org.opencontainers.image.title="capellaql" \
      org.opencontainers.image.description="CapellaQL: High-performance GraphQL service built with Bun for Couchbase Capella. Features advanced monitoring, caching, and observability." \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.revision="${COMMIT_HASH}" \
      org.opencontainers.image.authors="Simon Owusu <simonowusupvh@gmail.com>" \
      org.opencontainers.image.vendor="Siobytes" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.url="https://github.com/zx8086/capellaql" \
      org.opencontainers.image.source="https://github.com/zx8086/capellaql" \
      org.opencontainers.image.documentation="https://github.com/zx8086/capellaql/README.md" \
      org.opencontainers.image.base.name="gcr.io/distroless/static-debian12:nonroot" \
      com.capellaql.runtime="bun" \
      com.capellaql.maintainer="Simon Owusu <simonowusupvh@gmail.com>" \
      com.capellaql.release-date="${BUILD_DATE}" \
      com.capellaql.version.is-production="true" \
      com.capellaql.build.optimized="true" \
      com.capellaql.pid1-handler="dumb-init" \
      com.capellaql.user="nonroot:65532" \
      com.capellaql.slsa-level="3"

# Run as nonroot user (UID 65532 - distroless standard)
USER 65532:65532

EXPOSE 4000/tcp

# Healthcheck - runs inside distroless, uses Bun
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD ["/usr/local/bin/bun", "run", "healthcheck"]

# Use dumb-init as ENTRYPOINT for proper PID 1 signal forwarding
# This ensures SIGTERM reaches the Bun process for graceful shutdown
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/usr/local/bin/bun", "run", "start"]

# =============================================================================
# Stage 7: release (Alpine fallback) - For compatibility if distroless fails
# =============================================================================
FROM deps-base AS release

# Re-declare ARGs needed in this stage
ARG BUILD_DATE
ARG BUILD_VERSION
ARG COMMIT_HASH

# Copy production dependencies
COPY --from=deps-prod --chown=65532:65532 /usr/src/app/node_modules ./node_modules
COPY --from=deps-prod --chown=65532:65532 /usr/src/app/package.json ./package.json

# Copy built application from builder stage
COPY --from=builder --chown=65532:65532 /usr/src/app/dist ./dist

# Copy telemetry source (needed at runtime)
COPY --chown=65532:65532 src/telemetry ./src/telemetry

# Set optimized production environment variables
ENV ENABLE_OPENTELEMETRY=true \
    SOURCE_MAP_SUPPORT=true \
    PRESERVE_SOURCE_MAPS=true \
    NODE_ENV=production \
    BUN_CONFIG_VERBOSE_FETCH=false \
    BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS=120

# Runtime configuration environment variables
ENV BASE_URL="" \
    PORT="4000" \
    LOG_LEVEL="info" \
    LOG_MAX_SIZE="20m" \
    LOG_MAX_FILES="14d" \
    YOGA_RESPONSE_CACHE_TTL="900000" \
    COUCHBASE_URL="" \
    COUCHBASE_USERNAME="" \
    COUCHBASE_BUCKET="" \
    COUCHBASE_SCOPE="" \
    COUCHBASE_COLLECTION="" \
    SERVICE_NAME="CapellaQL Service" \
    SERVICE_VERSION="2.0" \
    DEPLOYMENT_ENVIRONMENT="production" \
    TRACES_ENDPOINT="" \
    METRICS_ENDPOINT="" \
    LOGS_ENDPOINT="" \
    METRIC_READER_INTERVAL="60000" \
    SUMMARY_LOG_INTERVAL="300000" \
    ENABLE_FILE_LOGGING="false" \
    ALLOWED_ORIGINS=""

# Enhanced container metadata with SLSA compliance labels
LABEL org.opencontainers.image.title="capellaql" \
      org.opencontainers.image.description="CapellaQL: High-performance GraphQL service built with Bun for Couchbase Capella. Features advanced monitoring, caching, and observability." \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.revision="${COMMIT_HASH}" \
      org.opencontainers.image.authors="Simon Owusu <simonowusupvh@gmail.com>" \
      org.opencontainers.image.vendor="Siobytes" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.url="https://github.com/zx8086/capellaql" \
      org.opencontainers.image.source="https://github.com/zx8086/capellaql" \
      org.opencontainers.image.documentation="https://github.com/zx8086/capellaql/README.md" \
      org.opencontainers.image.base.name="oven/bun:1.1-alpine" \
      com.capellaql.runtime="bun" \
      com.capellaql.maintainer="Simon Owusu <simonowusupvh@gmail.com>" \
      com.capellaql.release-date="${BUILD_DATE}" \
      com.capellaql.version.is-production="true" \
      com.capellaql.build.optimized="true" \
      com.capellaql.pid1-handler="dumb-init" \
      com.capellaql.user="nonroot:65532"

# Run as nonroot user (UID 65532)
USER 65532:65532

EXPOSE 4000/tcp

# Enhanced healthcheck with proper timeout handling
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD bun run healthcheck

# Use dumb-init as ENTRYPOINT for proper PID 1 signal forwarding
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["bun", "run", "start"]
