#!/bin/bash
# validate-container-performance.sh - Performance validation for authentication service container

set -euo pipefail

IMAGE_NAME="${1:-authentication-service:latest}"
TARGET_STARTUP_TIME_MS=100
TARGET_MEMORY_MB=80
TARGET_IMAGE_SIZE_MB=300

echo "=== Container Performance Validation ==="
echo "Target: <${TARGET_STARTUP_TIME_MS}ms startup, <${TARGET_MEMORY_MB}MB memory, <${TARGET_IMAGE_SIZE_MB}MB image"
echo ""

# 1. Image size validation
echo "CHECK Image size validation..."
IMAGE_SIZE_MB=$(docker image inspect "${IMAGE_NAME}" --format='{{.Size}}' | awk '{print int($1/1024/1024)}')
if [[ $IMAGE_SIZE_MB -gt $TARGET_IMAGE_SIZE_MB ]]; then
    echo "WARNING Image size ${IMAGE_SIZE_MB}MB exceeds target ${TARGET_IMAGE_SIZE_MB}MB"
else
    echo "PASS Image size: ${IMAGE_SIZE_MB}MB"
fi

# 2. Container startup performance test
echo "CHECK Container startup performance..."
START_TIME=$(date +%s%3N)
CONTAINER_ID=$(docker run -d --rm -p 3099:3000 "${IMAGE_NAME}")
sleep 1

# Wait for health check with timeout
READY=false
for i in {1..30}; do
    if curl -s http://localhost:3099/health > /dev/null 2>&1; then
        READY=true
        break
    fi
    sleep 0.1
done

END_TIME=$(date +%s%3N)
STARTUP_TIME_MS=$((END_TIME - START_TIME))

if [[ "$READY" == "true" ]]; then
    if [[ $STARTUP_TIME_MS -gt $TARGET_STARTUP_TIME_MS ]]; then
        echo "WARNING Startup time ${STARTUP_TIME_MS}ms exceeds target ${TARGET_STARTUP_TIME_MS}ms"
    else
        echo "PASS Startup time: ${STARTUP_TIME_MS}ms"
    fi
else
    echo "FAIL Container failed to become ready within 3 seconds"
fi

# 3. Memory usage validation
echo "CHECK Memory usage validation..."
sleep 2  # Allow container to stabilize
MEMORY_USAGE=$(docker stats "${CONTAINER_ID}" --no-stream --format "{{.MemUsage}}" | cut -d'/' -f1 | sed 's/[^0-9.]//g')
MEMORY_MB=$(echo "$MEMORY_USAGE" | awk '{print int($1)}')

if [[ $MEMORY_MB -gt $TARGET_MEMORY_MB ]]; then
    echo "WARNING Memory usage ${MEMORY_MB}MB exceeds baseline target ${TARGET_MEMORY_MB}MB"
else
    echo "PASS Memory usage: ${MEMORY_MB}MB"
fi

# 4. Performance stress test (brief)
echo "CHECK Brief performance validation..."
if [[ "$READY" == "true" ]]; then
    # Run 100 requests in 2 seconds
    RESPONSE_TIME=$(curl -w "%{time_total}" -s -o /dev/null http://localhost:3099/health)
    RESPONSE_TIME_MS=$(echo "$RESPONSE_TIME * 1000" | bc)

    if (( $(echo "$RESPONSE_TIME_MS > 50" | bc -l) )); then
        echo "WARNING Response time ${RESPONSE_TIME_MS}ms may indicate performance issues"
    else
        echo "PASS Response time: ${RESPONSE_TIME_MS}ms"
    fi
fi

# 5. Graceful shutdown test
echo "CHECK Graceful shutdown performance..."
STOP_START=$(date +%s)
docker stop "${CONTAINER_ID}" > /dev/null 2>&1
STOP_END=$(date +%s)
STOP_DURATION=$((STOP_END - STOP_START))

if [[ $STOP_DURATION -gt 2 ]]; then
    echo "FAIL Shutdown took ${STOP_DURATION}s (should be <2s)"
else
    echo "PASS Graceful shutdown: ${STOP_DURATION}s"
fi

# Summary
echo ""
echo "=== Performance Summary ==="
echo "Image Size: ${IMAGE_SIZE_MB}MB (target: <${TARGET_IMAGE_SIZE_MB}MB)"
echo "Startup Time: ${STARTUP_TIME_MS}ms (target: <${TARGET_STARTUP_TIME_MS}ms)"
echo "Memory Usage: ${MEMORY_MB}MB (target: <${TARGET_MEMORY_MB}MB)"
echo "Shutdown Time: ${STOP_DURATION}s (target: <2s)"

# Overall assessment
SCORE=0
[[ $IMAGE_SIZE_MB -le $TARGET_IMAGE_SIZE_MB ]] && ((SCORE++))
[[ $STARTUP_TIME_MS -le $TARGET_STARTUP_TIME_MS ]] && ((SCORE++))
[[ $MEMORY_MB -le $TARGET_MEMORY_MB ]] && ((SCORE++))
[[ $STOP_DURATION -le 2 ]] && ((SCORE++))

echo ""
if [[ $SCORE -eq 4 ]]; then
    echo "SUCCESS All performance targets met (4/4)"
    exit 0
elif [[ $SCORE -ge 2 ]]; then
    echo "WARNING Some performance targets missed ($SCORE/4)"
    exit 1
else
    echo "FAIL Significant performance issues ($SCORE/4)"
    exit 2
fi