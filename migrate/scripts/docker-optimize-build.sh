#!/bin/bash
# docker-optimize-build.sh
# Optimized Docker build script for authentication service targeting <100MB image

set -euo pipefail

# Configuration
IMAGE_NAME="${1:-authentication-service}"
IMAGE_TAG="${2:-latest}"
FULL_IMAGE_NAME="${IMAGE_NAME}:${IMAGE_TAG}"
BUILD_TARGET="${BUILD_TARGET:-production}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Docker Optimization Build for Authentication Service${NC}"
echo "======================================================="
echo "Target: <100MB image size, <100ms cold start"
echo "Image: $FULL_IMAGE_NAME"
echo "Build Target: $BUILD_TARGET"
echo ""

# Pre-build validation
echo -e "${YELLOW}PRE-BUILD VALIDATION${NC}"
echo "-------------------"

# Check Dockerfile lockfile reference
if grep -q "bun.lockb" Dockerfile; then
    echo -e "${RED}WARNING: Dockerfile references 'bun.lockb' but actual file is 'bun.lock'${NC}"
    echo "This may cause build cache invalidation. Consider updating Dockerfile."
    echo ""
fi

# Check for large files in build context
echo "Analyzing build context size..."
BUILD_CONTEXT_SIZE=$(du -sm . 2>/dev/null | awk '{print $1}')
echo "Build context: ${BUILD_CONTEXT_SIZE}MB"

if [[ $BUILD_CONTEXT_SIZE -gt 100 ]]; then
    echo -e "${YELLOW}WARN: Large build context (${BUILD_CONTEXT_SIZE}MB). Consider optimizing .dockerignore${NC}"
fi

# Extract metadata from package.json
SERVICE_NAME=$(grep '"name"' package.json | head -1 | cut -d'"' -f4)
SERVICE_VERSION=$(grep '"version"' package.json | head -1 | cut -d'"' -f4)
BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
VCS_REF=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

echo ""
echo -e "${YELLOW}BUILD EXECUTION${NC}"
echo "----------------"

# Start build timer
BUILD_START=$(date +%s)

# Optimized Docker build with BuildKit
echo "Building with enhanced BuildKit optimization..."
DOCKER_BUILDKIT=1 docker build \
  --target "$BUILD_TARGET" \
  --platform linux/amd64 \
  --build-arg SERVICE_NAME="$SERVICE_NAME" \
  --build-arg SERVICE_VERSION="$SERVICE_VERSION" \
  --build-arg BUILD_DATE="$BUILD_DATE" \
  --build-arg VCS_REF="$VCS_REF" \
  --build-arg VERSION="$SERVICE_VERSION" \
  --cache-from "type=registry,ref=${IMAGE_NAME}:buildcache" \
  --cache-to "type=registry,ref=${IMAGE_NAME}:buildcache,mode=max" \
  --provenance=false \
  --sbom=false \
  -t "$FULL_IMAGE_NAME" \
  -t "${IMAGE_NAME}:latest" \
  .

BUILD_END=$(date +%s)
BUILD_TIME=$((BUILD_END - BUILD_START))

echo ""
echo -e "${YELLOW}BUILD ANALYSIS${NC}"
echo "---------------"

# Image size analysis
IMAGE_SIZE_BYTES=$(docker image inspect "$FULL_IMAGE_NAME" --format='{{.Size}}')
IMAGE_SIZE_MB=$((IMAGE_SIZE_BYTES / 1024 / 1024))

echo "Build time: ${BUILD_TIME}s"
echo "Image size: ${IMAGE_SIZE_MB}MB"

# Size comparison with target
if [[ $IMAGE_SIZE_MB -lt 100 ]]; then
    echo -e "${GREEN}✓ SUCCESS: Image size under 100MB target${NC}"
elif [[ $IMAGE_SIZE_MB -lt 150 ]]; then
    echo -e "${YELLOW}WARNING: Image size acceptable but over target (${IMAGE_SIZE_MB}MB > 100MB)${NC}"
else
    echo -e "${RED}✗ FAIL: Image size significantly over target (${IMAGE_SIZE_MB}MB >> 100MB)${NC}"
fi

# Layer analysis
LAYER_COUNT=$(docker history "$FULL_IMAGE_NAME" --format "{{.CreatedBy}}" | grep -v "missing" | wc -l)
echo "Layer count: $LAYER_COUNT"

# Size breakdown by layer
echo ""
echo "Layer size breakdown:"
docker history "$FULL_IMAGE_NAME" --format "table {{.Size}}\t{{.CreatedBy}}" | head -10

echo ""
echo -e "${YELLOW}OPTIMIZATION RECOMMENDATIONS${NC}"
echo "-----------------------------"

# Provide optimization recommendations
if [[ $IMAGE_SIZE_MB -gt 100 ]]; then
    echo "Image size optimization needed:"
    echo "• Current: ${IMAGE_SIZE_MB}MB, Target: <100MB"
    echo "• Consider removing unnecessary dependencies"
    echo "• Verify .dockerignore excludes all development files"
    echo "• Check if build artifacts are being copied unnecessarily"
fi

if [[ $LAYER_COUNT -gt 15 ]]; then
    echo "Layer optimization needed:"
    echo "• Current: $LAYER_COUNT layers"
    echo "• Combine RUN instructions where possible"
    echo "• Minimize COPY instructions"
fi

if [[ $BUILD_TIME -gt 300 ]]; then
    echo "Build time optimization needed:"
    echo "• Current: ${BUILD_TIME}s"
    echo "• Ensure BuildKit cache mounts are working"
    echo "• Consider dependency caching strategies"
fi

echo ""
echo -e "${YELLOW}POST-BUILD VALIDATION${NC}"
echo "---------------------"

# Quick validation
echo "Running optimization validation..."
if [[ -f "./scripts/validate-docker-optimization.sh" ]]; then
    ./scripts/validate-docker-optimization.sh "$FULL_IMAGE_NAME"
else
    echo "Optimization validation script not found"
    echo "Manual validation recommended:"
    echo "• Test cold start performance"
    echo "• Verify security score maintained"
    echo "• Check runtime functionality"
fi

echo ""
echo -e "${GREEN}BUILD COMPLETE${NC}"
echo "=============="
echo "Image: $FULL_IMAGE_NAME"
echo "Size: ${IMAGE_SIZE_MB}MB"
echo "Build time: ${BUILD_TIME}s"
echo "Layers: $LAYER_COUNT"

if [[ $IMAGE_SIZE_MB -lt 100 ]]; then
    echo -e "${GREEN} Target achieved: Image size under 100MB${NC}"
else
    echo -e "${YELLOW} Optimization opportunity: ${IMAGE_SIZE_MB}MB (target: <100MB)${NC}"
fi

echo ""
echo "Next steps:"
echo "• Run security validation: bun run docker:security:validate"
echo "• Test performance: bun run docker:run:production"
echo "• Deploy to environment: docker-compose up"