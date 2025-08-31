# syntax=docker/dockerfile:1.4

# Base stage with Bun canary for latest features
FROM oven/bun:canary-alpine AS base

# Set common environment variables optimized for Bun
ENV CN_ROOT=/usr/src/app \
    CN_CXXCBC_CACHE_DIR=/usr/src/app/deps/couchbase-cxx-cache \
    NODE_ENV=production \
    BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS=120 \
    BUN_INSTALL_CACHE_DIR=/usr/src/app/.bun-cache

WORKDIR /usr/src/app

# Create directories with proper permissions
RUN mkdir -p /usr/src/app/logs \
             /usr/src/app/deps/couchbase-cxx-cache \
             /usr/src/app/.sourcemaps \
             /usr/src/app/.bun-cache && \
    chown -R bun:bun /usr/src/app

# Dependencies stage - Enhanced for Bun caching
FROM base AS deps

# Copy package files for dependency resolution
COPY --chown=bun:bun package.json bun.lock* bunfig.toml tsconfig.json ./

# Install dependencies with optimized Bun caching
RUN --mount=type=cache,target=/usr/src/app/.bun-cache,sharing=locked \
    --mount=type=cache,target=/root/.bun,sharing=locked \
    bun install --frozen-lockfile --production --verbose && \
    mkdir -p node_modules && \
    chown -R bun:bun node_modules

# Development stage with full tooling
FROM deps AS development
ENV NODE_ENV=development

# Install all dependencies including dev dependencies
RUN --mount=type=cache,target=/usr/src/app/.bun-cache,sharing=locked \
    bun install --frozen-lockfile --verbose

# Copy source files
COPY --chown=bun:bun . .

# Use Bun's hot reload in development
CMD ["bun", "run", "dev"]

# Build stage optimized for Bun
FROM deps AS builder

# Copy source files for building
COPY --chown=bun:bun src/ ./src/
COPY --chown=bun:bun tsconfig.json bunfig.toml ./

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
    ls -la dist/

# Production release stage
FROM base AS release

# Copy package files and install production dependencies
COPY --chown=bun:bun package.json bun.lock* bunfig.toml ./
RUN --mount=type=cache,target=/usr/src/app/.bun-cache,sharing=locked \
    --mount=type=cache,target=/root/.bun,sharing=locked \
    bun install --frozen-lockfile --production --verbose

# Copy built application from builder stage
COPY --from=builder --chown=bun:bun /usr/src/app/dist ./dist
COPY --chown=bun:bun src/telemetry ./src/telemetry

# Set optimized production environment variables
ENV ENABLE_OPENTELEMETRY=true \
    SOURCE_MAP_SUPPORT=true \
    PRESERVE_SOURCE_MAPS=true \
    NODE_ENV=production \
    BUN_CONFIG_VERBOSE_FETCH=false \
    BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS=120

# Enhanced container metadata
LABEL org.opencontainers.image.title="capellaql" \
      org.opencontainers.image.description="CapellaQL: High-performance GraphQL service built with Bun for Couchbase Capella. Features advanced monitoring, caching, and observability." \
      org.opencontainers.image.created="${BUILD_DATE:-unknown}" \
      org.opencontainers.image.version="${BUILD_VERSION:-2.0.0}" \
      org.opencontainers.image.revision="${COMMIT_HASH:-unknown}" \
      org.opencontainers.image.authors="Simon Owusu <simonowusupvh@gmail.com>" \
      org.opencontainers.image.vendor="Siobytes" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.url="https://github.com/zx8086/capellaql" \
      org.opencontainers.image.source="https://github.com/zx8086/capellaql" \
      org.opencontainers.image.documentation="https://github.com/zx8086/capellaql/README.md" \
      org.opencontainers.image.base.name="oven/bun:canary-alpine" \
      com.capellaql.runtime="bun" \
      com.capellaql.maintainer="Simon Owusu <simonowusupvh@gmail.com>" \
      com.capellaql.release-date="${BUILD_DATE:-unknown}" \
      com.capellaql.version.is-production="true" \
      com.capellaql.build.optimized="true"

# Environment variables for runtime configuration
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

USER bun
EXPOSE 4000/tcp

# Enhanced healthcheck using our Bun-optimized script
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD bun run healthcheck || exit 1

# Use Bun's native runtime for optimal performance
CMD ["bun", "run", "start"]