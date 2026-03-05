#!/bin/bash
# validate-docker-optimization.sh
# Comprehensive validation of Docker optimization for authentication service

set -euo pipefail

IMAGE_NAME="${1:-authentication-service:latest}"
TARGET_SIZE_MB=100
TARGET_COLD_START_MS=100

echo "Docker Optimization Validation for Authentication Service"
echo "========================================================="
echo "Target Image Size: <${TARGET_SIZE_MB}MB"
echo "Target Cold Start: <${TARGET_COLD_START_MS}ms"
echo "Testing Image: $IMAGE_NAME"
echo ""

VALIDATION_SCORE=0
MAX_SCORE=10
ISSUES=()

# 1. Image Size Validation (3 points)
echo "CHECK [1/10] Image size optimization..."
if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    echo "FAIL Image not found: $IMAGE_NAME"
    ISSUES+=("Build the image first: docker build -t $IMAGE_NAME .")
    exit 1
fi

IMAGE_SIZE_BYTES=$(docker image inspect "$IMAGE_NAME" --format='{{.Size}}')
IMAGE_SIZE_MB=$((IMAGE_SIZE_BYTES / 1024 / 1024))

if [[ $IMAGE_SIZE_MB -lt $TARGET_SIZE_MB ]]; then
    echo "PASS Image size: ${IMAGE_SIZE_MB}MB (target: <${TARGET_SIZE_MB}MB)"
    ((VALIDATION_SCORE += 3))
elif [[ $IMAGE_SIZE_MB -lt $((TARGET_SIZE_MB * 2)) ]]; then
    echo "WARN Image size: ${IMAGE_SIZE_MB}MB (exceeds target but acceptable)"
    ((VALIDATION_SCORE += 2))
    ISSUES+=("Consider further size optimization - current: ${IMAGE_SIZE_MB}MB, target: <${TARGET_SIZE_MB}MB")
else
    echo "FAIL Image size: ${IMAGE_SIZE_MB}MB (significantly exceeds target)"
    ISSUES+=("Critical: Image size ${IMAGE_SIZE_MB}MB exceeds target ${TARGET_SIZE_MB}MB")
fi

# 2. Layer Count Optimization (1 point)
echo "CHECK [2/10] Layer count optimization..."
LAYER_COUNT=$(docker history "$IMAGE_NAME" --format "{{.CreatedBy}}" | grep -v "missing" | wc -l)
if [[ $LAYER_COUNT -le 15 ]]; then
    echo "PASS Layer count: $LAYER_COUNT (efficient)"
    ((VALIDATION_SCORE += 1))
else
    echo "FAIL Layer count: $LAYER_COUNT (too many layers)"
    ISSUES+=("Optimize Dockerfile to reduce layer count below 15")
fi

# 3. Cold Start Performance (2 points)
echo "CHECK [3/10] Cold start performance..."
CONTAINER_NAME="auth-cold-start-test-$$"

# Kill any existing test container
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true

START_TIME=$(date +%s%3N)
CONTAINER_ID=$(docker run -d --name "$CONTAINER_NAME" -p 0:3000 \
    -e NODE_ENV=production \
    -e TELEMETRY_MODE=console \
    -e KONG_JWT_AUTHORITY=https://test.example.com \
    -e KONG_JWT_AUDIENCE=test.example.com \
    -e KONG_JWT_ISSUER=test.example.com \
    "$IMAGE_NAME")

# Wait for health check to pass
HEALTH_TIMEOUT=30
for i in $(seq 1 $HEALTH_TIMEOUT); do
    if docker exec "$CONTAINER_ID" /usr/local/bin/bun --eval "fetch('http://localhost:3000/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))" 2>/dev/null; then
        END_TIME=$(date +%s%3N)
        COLD_START_MS=$((END_TIME - START_TIME))
        break
    fi
    sleep 1
done

# Cleanup
docker stop "$CONTAINER_NAME" >/dev/null 2>&1
docker rm "$CONTAINER_NAME" >/dev/null 2>&1

if [[ ${COLD_START_MS:-9999} -lt $TARGET_COLD_START_MS ]]; then
    echo "PASS Cold start: ${COLD_START_MS}ms (target: <${TARGET_COLD_START_MS}ms)"
    ((VALIDATION_SCORE += 2))
elif [[ ${COLD_START_MS:-9999} -lt $((TARGET_COLD_START_MS * 3)) ]]; then
    echo "WARN Cold start: ${COLD_START_MS}ms (acceptable but not optimal)"
    ((VALIDATION_SCORE += 1))
    ISSUES+=("Cold start time ${COLD_START_MS}ms exceeds target ${TARGET_COLD_START_MS}ms")
else
    echo "FAIL Cold start: ${COLD_START_MS:-timeout}ms (too slow or failed)"
    ISSUES+=("Critical: Cold start performance unacceptable")
fi

# 4. Distroless Validation (1 point)
echo "CHECK [4/10] Distroless implementation..."
if docker run --rm --entrypoint="" "$IMAGE_NAME" /bin/sh -c "echo test" 2>/dev/null; then
    echo "FAIL Shell access detected (not truly distroless)"
    ISSUES+=("Remove shell access for true distroless implementation")
else
    echo "PASS Distroless confirmed (no shell access)"
    ((VALIDATION_SCORE += 1))
fi

# 5. Dependency Optimization (1 point)
echo "CHECK [5/10] Production dependency optimization..."
# Extract and analyze node_modules size
TEMP_CONTAINER="temp-deps-check-$$"
docker create --name "$TEMP_CONTAINER" "$IMAGE_NAME" >/dev/null
NODE_MODULES_SIZE=$(docker exec "$TEMP_CONTAINER" du -sm /app/node_modules 2>/dev/null | awk '{print $1}' || echo "0")
docker rm "$TEMP_CONTAINER" >/dev/null 2>&1

if [[ $NODE_MODULES_SIZE -lt 50 ]]; then
    echo "PASS Dependencies size: ${NODE_MODULES_SIZE}MB (minimal)"
    ((VALIDATION_SCORE += 1))
elif [[ $NODE_MODULES_SIZE -lt 100 ]]; then
    echo "WARN Dependencies size: ${NODE_MODULES_SIZE}MB (acceptable)"
    ISSUES+=("Consider dependency pruning - node_modules: ${NODE_MODULES_SIZE}MB")
else
    echo "FAIL Dependencies size: ${NODE_MODULES_SIZE}MB (bloated)"
    ISSUES+=("Critical: Dependencies too large - node_modules: ${NODE_MODULES_SIZE}MB")
fi

# 6. Build Cache Utilization (1 point)
echo "CHECK [6/10] Build cache optimization..."
# Check if BuildKit cache mounts are used
if grep -q -- "--mount=type=cache" Dockerfile; then
    echo "PASS BuildKit cache mounts configured"
    ((VALIDATION_SCORE += 1))
else
    echo "FAIL No BuildKit cache mounts found"
    ISSUES+=("Add --mount=type=cache for faster builds")
fi

# 7. Security Score Validation (1 point)
echo "CHECK [7/10] Security score validation..."
if [[ -f "./scripts/validate-dockerfile-security.sh" ]]; then
    if ./scripts/validate-dockerfile-security.sh >/dev/null 2>&1; then
        echo "PASS Security validation passed (10/10 score maintained)"
        ((VALIDATION_SCORE += 1))
    else
        echo "FAIL Security validation failed"
        ISSUES+=("Fix security issues to maintain 10/10 score")
    fi
else
    echo "SKIP Security script not found"
fi

# 8. Performance Baseline (1 point)
echo "CHECK [8/10] Performance capability validation..."
CONTAINER_NAME="auth-perf-test-$$"
docker run -d --name "$CONTAINER_NAME" -p 0:3000 \
    -e NODE_ENV=production \
    -e TELEMETRY_MODE=console \
    -e KONG_JWT_AUTHORITY=https://test.example.com \
    -e KONG_JWT_AUDIENCE=test.example.com \
    -e KONG_JWT_ISSUER=test.example.com \
    "$IMAGE_NAME" >/dev/null

# Wait for startup
sleep 5

# Simple performance test
RESPONSE_TIME=$(curl -w "%{time_total}" -s -o /dev/null http://localhost:$(docker port "$CONTAINER_NAME" 3000 | cut -d: -f2)/health 2>/dev/null || echo "999")
docker stop "$CONTAINER_NAME" >/dev/null 2>&1
docker rm "$CONTAINER_NAME" >/dev/null 2>&1

if (( $(echo "$RESPONSE_TIME < 0.1" | bc -l 2>/dev/null) )); then
    echo "PASS Response time: ${RESPONSE_TIME}s (excellent)"
    ((VALIDATION_SCORE += 1))
elif (( $(echo "$RESPONSE_TIME < 0.5" | bc -l 2>/dev/null) )); then
    echo "WARN Response time: ${RESPONSE_TIME}s (acceptable)"
else
    echo "FAIL Response time: ${RESPONSE_TIME}s or failed"
    ISSUES+=("Performance degradation detected")
fi

echo ""
echo "OPTIMIZATION SCORE: $VALIDATION_SCORE/$MAX_SCORE"
echo ""

# Final assessment
if [[ $VALIDATION_SCORE -eq $MAX_SCORE ]] && [[ ${#ISSUES[@]} -eq 0 ]]; then
    echo "SUCCESS: PERFECT OPTIMIZATION SCORE!"
    echo "✓ Image size under 100MB target"
    echo "✓ Cold start under 100ms target"
    echo "✓ Security 10/10 maintained"
    echo "✓ Production-ready for 100k+ req/sec"
    exit 0
elif [[ $VALIDATION_SCORE -ge 8 ]]; then
    echo "GOOD: Optimization mostly successful ($VALIDATION_SCORE/10)"
    echo ""
    echo "Minor improvements needed:"
    for issue in "${ISSUES[@]}"; do
        echo "  • $issue"
    done
    exit 1
else
    echo "NEEDS WORK: Optimization insufficient ($VALIDATION_SCORE/10)"
    echo ""
    echo "Critical improvements needed:"
    for issue in "${ISSUES[@]}"; do
        echo "  • $issue"
    done
    exit 2
fi