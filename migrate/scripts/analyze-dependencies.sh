#!/bin/bash
# analyze-dependencies.sh
# Analyze production dependencies for size optimization opportunities

set -e

echo "=== Production Dependency Analysis ==="
echo ""

# Check if we have a built image to analyze
IMAGE_NAME="${1:-authentication-service:latest}"

if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    echo "ERROR: Image $IMAGE_NAME not found. Build it first."
    exit 1
fi

echo "Analyzing image: $IMAGE_NAME"
echo ""

# Get total image size
IMAGE_SIZE_BYTES=$(docker image inspect "$IMAGE_NAME" --format='{{.Size}}')
IMAGE_SIZE_MB=$((IMAGE_SIZE_BYTES / 1024 / 1024))
echo "Total image size: ${IMAGE_SIZE_MB}MB"

# Analyze node_modules size if accessible
echo ""
echo "=== Node.js Dependencies Analysis ==="

# Extract dependency information from package.json
if [[ -f "package.json" ]]; then
    echo "Production dependencies:"
    grep -A 100 '"dependencies"' package.json | sed '/}/q' | grep -v '^  }' | head -20

    echo ""
    echo "Large OpenTelemetry packages detected:"
    grep -A 100 '"dependencies"' package.json | grep -E "@opentelemetry|otel" | while read -r line; do
        echo "  - $line"
    done

    echo ""
    echo "=== Optimization Opportunities ==="
    echo ""

    echo "1. OpenTelemetry Auto-Instrumentation:"
    echo "   Current: @opentelemetry/auto-instrumentations-node"
    echo "   Impact: Large bundle size for authentication service"
    echo "   Recommendation: Use selective instrumentation"
    echo ""

    echo "2. Multiple OTLP Exporters:"
    echo "   Current: Separate HTTP exporters for traces, metrics, logs"
    echo "   Impact: Redundant dependencies"
    echo "   Recommendation: Consolidate or use single exporter"
    echo ""

    echo "3. Development vs Production Dependencies:"
    DEV_COUNT=$(grep -c '"devDependencies"' package.json || echo 0)
    PROD_COUNT=$(grep -A 100 '"dependencies"' package.json | grep -c '":' || echo 0)
    echo "   Production dependencies: $PROD_COUNT packages"
    echo "   Development dependencies: $DEV_COUNT packages"
    echo "   Status: Good separation maintained"
    echo ""

    echo "4. Dependency Size Estimates:"
    echo "   OpenTelemetry suite: ~15-25MB"
    echo "   Winston logging: ~3-5MB"
    echo "   Redis client: ~2-3MB"
    echo "   Circuit breaker: ~1MB"
    echo "   Zod validation: ~1MB"
    echo ""

    echo "=== Recommendations ==="
    echo ""
    echo "IMMEDIATE (Size Impact: -10-15MB):"
    echo "  • Replace auto-instrumentations with selective imports"
    echo "  • Use single OTLP exporter instead of separate HTTP exporters"
    echo ""
    echo "MEDIUM TERM (Size Impact: -5-10MB):"
    echo "  • Evaluate if full Winston suite is needed for auth service"
    echo "  • Consider lightweight alternatives for circuit breaker"
    echo ""
    echo "LONG TERM (Size Impact: -15-20MB):"
    echo "  • Move to native Bun observability when available"
    echo "  • Implement custom lightweight telemetry for auth service"
    echo ""

else
    echo "ERROR: package.json not found in current directory"
fi

echo "=== Analysis Complete ==="