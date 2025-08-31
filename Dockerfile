# syntax=docker/dockerfile:1.4

# Base stage
FROM oven/bun:canary-alpine AS base

# Set common environment variables
ENV CN_ROOT=/usr/src/app \
    CN_CXXCBC_CACHE_DIR=/usr/src/app/deps/couchbase-cxx-cache \
    NODE_ENV=production

WORKDIR /usr/src/app

# Create directories (move to respective stages where needed)
RUN mkdir -p /usr/src/app/logs /usr/src/app/deps/couchbase-cxx-cache /usr/src/app/.sourcemaps && \
    chown -R bun:bun /usr/src/app

# Dependencies stage - Optimized for caching
FROM base AS deps

# Copy only package files needed for installation
COPY --chown=bun:bun package.json bun.lock tsconfig.json ./

# Single RUN command for better caching
RUN --mount=type=cache,target=/root/.bun,sharing=locked \
    bun install --frozen-lockfile --production && \
    mkdir -p node_modules && \
    chown -R bun:bun node_modules

# Development stage
FROM deps AS development
ENV NODE_ENV=development

# Install development dependencies
RUN bun install --frozen-lockfile

# Copy source files after dependencies
COPY --chown=bun:bun . .
CMD ["bun", "run", "dev"]

# Build stage
FROM deps AS builder

# Copy source files all at once
COPY --chown=bun:bun src/ ./src/
COPY --chown=bun:bun tsconfig.json ./

# Combine mkdir and build operations
RUN --mount=type=cache,target=/usr/src/app/.build \
    mkdir -p dist dist/maps && \
    bun build ./src/index.ts \
    --target=node \
    --outdir ./dist \
    --sourcemap \
    --external dns \
    --external bun \
    --manifest && \
    find dist -name "*.map" -exec mv {} dist/maps/ \; || true

# Final release stage
FROM base AS release

# Copy package files and install dependencies in one layer
COPY --chown=bun:bun package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun,sharing=locked \
    bun install --frozen-lockfile

# Copy source files
COPY --chown=bun:bun . .

# Combine build operations into a single layer
RUN set -e && \
    bun build ./src/index.ts \
    --target=node \
    --outdir ./dist \
    --sourcemap \
    --external dns \
    --external bun \
    --manifest && \
    mkdir -p /usr/src/app/dist/maps && \
    find /usr/src/app/dist -name "*.map" -exec mv {} /usr/src/app/dist/maps/ \; || true && \
    bun install --frozen-lockfile --production && \
    chown -R bun:bun .

# Set production variables
ENV ENABLE_OPENTELEMETRY=true \
    SOURCE_MAP_SUPPORT=true \
    PRESERVE_SOURCE_MAPS=true \
    NODE_ENV=production

# Consolidate all labels in the final stage
LABEL org.opencontainers.image.title="capellaql" \
    org.opencontainers.image.description="CapellaQL is a high-performance GraphQL service built with Bun that provides a modern API interface for Couchbase Capella databases. It features advanced monitoring, caching, and observability capabilities." \
    org.opencontainers.image.created="${BUILD_DATE}" \
    org.opencontainers.image.version="${BUILD_VERSION}" \
    org.opencontainers.image.revision="${COMMIT_HASH}" \
    org.opencontainers.image.authors="Simon Owusu <simonowusupvh@gmail.com>" \
    org.opencontainers.image.vendor="Siobytes" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.url="https://github.com/zx8086/capellaql" \
    org.opencontainers.image.source="https://github.com/zx8086/capellaql" \
    org.opencontainers.image.documentation="https://github.com/zx8086/capellaql/README.md" \
    org.opencontainers.image.base.name="oven/bun:canary-alpine" \
    org.opencontainers.image.source.repository="github.com/zx8086/capellaql" \
    org.opencontainers.image.source.branch="${GITHUB_REF_NAME:-master}" \
    org.opencontainers.image.source.commit="${COMMIT_HASH}" \
    com.capellaql.maintainer="Simon Owusu <simonowusupvh@gmail.com>" \
    com.capellaql.release-date="${BUILD_DATE}" \
    com.capellaql.version.is-production="true" \
    org.opencontainers.image.ref.name="${GITHUB_REF_NAME:-master}" \
    org.opencontainers.image.version.semver="${BUILD_VERSION}" \
    org.opencontainers.image.version.major="2" \
    org.opencontainers.image.version.minor="0" \
    org.opencontainers.image.version.patch="0"

# Set runtime environment variables
ENV BASE_URL="" \
    PORT="" \
    LOG_LEVEL="" \
    LOG_MAX_SIZE="" \
    LOG_MAX_FILES="" \
    YOGA_RESPONSE_CACHE_TTL="" \
    COUCHBASE_URL="" \
    COUCHBASE_USERNAME="" \
    COUCHBASE_BUCKET="" \
    COUCHBASE_SCOPE="" \
    COUCHBASE_COLLECTION="" \
    SERVICE_NAME="" \
    SERVICE_VERSION="" \
    DEPLOYMENT_ENVIRONMENT="" \
    TRACES_ENDPOINT="" \
    METRICS_ENDPOINT="" \
    LOGS_ENDPOINT="" \
    METRIC_READER_INTERVAL="" \
    CONSOLE_METRIC_READER_INTERVAL="" \
    BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS="" \
    ENABLE_FILE_LOGGING="" \
    SUMMARY_LOG_INTERVAL="" \
    ALLOWED_ORIGINS=""

USER bun
EXPOSE 4000/tcp

# Modify healthcheck to use the correct script
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD bun run healthcheck || exit 1

CMD ["bun", "run", "start"]
