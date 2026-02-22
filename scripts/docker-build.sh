#!/bin/bash

# =============================================================================
# docker-build.sh - Build Docker image with metadata from package.json
# =============================================================================
# Usage:
#   ./scripts/docker-build.sh                    # Build production image
#   ./scripts/docker-build.sh development        # Build development image
#   BUILD_TARGET=development ./scripts/docker-build.sh
#   MULTI_PLATFORM=true ./scripts/docker-build.sh  # Multi-arch build
# =============================================================================

set -e

# -----------------------------------------------------------------------------
# Extract metadata from package.json using native tools
# -----------------------------------------------------------------------------
SERVICE_NAME=$(grep '"name"' package.json | head -1 | cut -d'"' -f4)
SERVICE_VERSION=$(grep '"version"' package.json | head -1 | cut -d'"' -f4)
SERVICE_DESCRIPTION=$(grep '"description"' package.json | head -1 | cut -d'"' -f4 || echo "GraphQL API for Couchbase Capella")

# Get build metadata
BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
COMMIT_HASH_FULL=$(git rev-parse HEAD 2>/dev/null || echo "unknown")

# Image configuration
REGISTRY=${REGISTRY:-docker.io}
IMAGE_NAME=${IMAGE_NAME:-zx8086/capellaql}
IMAGE_TAG=${1:-${SERVICE_VERSION}}
BUILD_TARGET=${BUILD_TARGET:-production}

# Bun version from Dockerfile default
BUN_VERSION=${BUN_VERSION:-1.3}

echo "=============================================="
echo "CapellaQL Docker Build"
echo "=============================================="
echo "Service:      ${SERVICE_NAME} v${SERVICE_VERSION}"
echo "Description:  ${SERVICE_DESCRIPTION}"
echo "Build Date:   ${BUILD_DATE}"
echo "Git Commit:   ${COMMIT_HASH}"
echo "Build Target: ${BUILD_TARGET}"
echo "Bun Version:  ${BUN_VERSION}"
echo "----------------------------------------------"
echo "Image:        ${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"
echo "=============================================="

# -----------------------------------------------------------------------------
# Detect CI/CD environment and set cache strategy
# Registry cache is used everywhere for consistency and reliability
# -----------------------------------------------------------------------------
CACHE_FROM="--cache-from type=registry,ref=${REGISTRY}/${IMAGE_NAME}:buildcache"

if [ -n "${GITHUB_ACTIONS}" ] || [ -n "${CI}" ]; then
  # CI: Write to registry cache
  CACHE_TO="--cache-to type=registry,ref=${REGISTRY}/${IMAGE_NAME}:buildcache,mode=max"
  echo "Cache: Registry (CI)"
else
  # Local: Read-only cache (don't pollute registry cache with local builds)
  CACHE_TO=""
  echo "Cache: Registry (local, read-only)"
fi

# -----------------------------------------------------------------------------
# Check BuildKit availability
# -----------------------------------------------------------------------------
if docker buildx version >/dev/null 2>&1; then
  echo "BuildKit: Available"
  BUILDER="docker buildx build"
else
  echo "BuildKit: Not available (using legacy builder)"
  BUILDER="docker build"
  CACHE_FROM=""
  CACHE_TO=""
fi

echo "=============================================="

# -----------------------------------------------------------------------------
# Platform selection
# -----------------------------------------------------------------------------
if [ "${MULTI_PLATFORM}" = "true" ]; then
  PLATFORM="--platform linux/amd64,linux/arm64"
  OUTPUT_FLAG="--push"
  echo "Multi-platform build: linux/amd64, linux/arm64"
  echo "Note: Multi-platform builds push to registry"
elif [ "${PUSH}" = "true" ]; then
  PLATFORM="--platform linux/amd64"
  OUTPUT_FLAG="--push"
  echo "Single platform build with push"
else
  PLATFORM="--platform linux/amd64"
  OUTPUT_FLAG="--load"
  echo "Single platform build (local)"
fi

# -----------------------------------------------------------------------------
# Build the Docker image
# -----------------------------------------------------------------------------
DOCKER_BUILDKIT=1 ${BUILDER} \
  --target "${BUILD_TARGET}" \
  ${PLATFORM} \
  --build-arg BUN_VERSION="${BUN_VERSION}" \
  --build-arg BUILD_DATE="${BUILD_DATE}" \
  --build-arg BUILD_VERSION="${SERVICE_VERSION}" \
  --build-arg COMMIT_HASH="${COMMIT_HASH_FULL}" \
  ${CACHE_FROM} \
  ${CACHE_TO} \
  --provenance=false \
  --sbom=false \
  -t "${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}" \
  -t "${REGISTRY}/${IMAGE_NAME}:latest" \
  ${OUTPUT_FLAG} \
  .

echo "=============================================="
echo "Build Complete"
echo "=============================================="
echo "Image: ${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"
echo "Also:  ${REGISTRY}/${IMAGE_NAME}:latest"
echo ""

# -----------------------------------------------------------------------------
# Display image metrics
# -----------------------------------------------------------------------------
if [ "${OUTPUT_FLAG}" = "--load" ]; then
  echo "Image Metrics:"
  docker images "${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}" --format "  Size: {{.Size}}" 2>/dev/null || true
  docker images "${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}" --format "  Created: {{.CreatedAt}}" 2>/dev/null || true
  echo ""
  echo "Quick Commands:"
  echo "  Run:   docker run -p 4000:4000 --env-file .env ${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"
  echo "  Push:  docker push ${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"
  echo "  Scout: docker scout quickview ${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"
fi
