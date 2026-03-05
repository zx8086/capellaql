#!/usr/bin/env bash
# Script to reorganize test files into logical subfolders
# Handles both tracked and untracked files
# Run from project root: bash scripts/reorganize-tests-v2.sh

set -e

# Function to move file (uses git mv if tracked, regular mv if not)
move_file() {
    local src=$1
    local dest=$2

    if [ ! -f "$src" ]; then
        echo "  Skipping $src (doesn't exist)"
        return
    fi

    if git ls-files --error-unmatch "$src" >/dev/null 2>&1; then
        echo "  git mv $src -> $dest"
        git mv "$src" "$dest"
    else
        echo "  mv $src -> $dest"
        mv "$src" "$dest"
    fi
}

echo "Creating test subdirectories..."
mkdir -p test/bun/services
mkdir -p test/bun/cache
mkdir -p test/bun/circuit-breaker
mkdir -p test/bun/config
mkdir -p test/bun/health
mkdir -p test/bun/telemetry
mkdir -p test/bun/kong
mkdir -p test/bun/handlers
mkdir -p test/bun/logging
mkdir -p test/bun/utils
mkdir -p test/bun/integration
mkdir -p test/bun/mutation

echo ""
echo "Moving service tests..."
# Note: Some already in services/ directory
move_file test/bun/jwt-error-path.test.ts test/bun/services/

echo ""
echo "Moving cache tests..."
move_file test/bun/cache-factory.test.ts test/bun/cache/
move_file test/bun/cache-factory-errors.test.ts test/bun/cache/
move_file test/bun/cache-health-edge-cases.test.ts test/bun/cache/
move_file test/bun/cache-manager.test.ts test/bun/cache/
move_file test/bun/cache-stale-operations.test.ts test/bun/cache/
move_file test/bun/local-memory-cache.test.ts test/bun/cache/
move_file test/bun/local-memory-cache-maxentries.test.ts test/bun/cache/

echo ""
echo "Moving circuit breaker tests..."
move_file test/bun/circuit-breaker-per-operation.test.ts test/bun/circuit-breaker/
move_file test/bun/circuit-breaker-state-transitions.test.ts test/bun/circuit-breaker/
move_file test/bun/circuit-breaker-thresholds.test.ts test/bun/circuit-breaker/
move_file test/bun/circuit-breaker.mutation.test.ts test/bun/circuit-breaker/
move_file test/bun/telemetry-circuit-breaker.test.ts test/bun/circuit-breaker/

echo ""
echo "Moving config tests..."
move_file test/bun/config.test.ts test/bun/config/
move_file test/bun/config-getters.test.ts test/bun/config/
move_file test/bun/config-helpers.test.ts test/bun/config/
move_file test/bun/config-schemas.test.ts test/bun/config/
move_file test/bun/defaults.test.ts test/bun/config/

echo ""
echo "Moving health tests..."
move_file test/bun/health-branches.test.ts test/bun/health/
move_file test/bun/health-fetch-spy.test.ts test/bun/health/
move_file test/bun/health-handlers.test.ts test/bun/health/
move_file test/bun/health-mutation-killers.test.ts test/bun/health/
move_file test/bun/health-telemetry-branches.test.ts test/bun/health/
move_file test/bun/health.mutation.test.ts test/bun/health/

echo ""
echo "Moving telemetry tests..."
move_file test/bun/instrumentation-coverage.test.ts test/bun/telemetry/
move_file test/bun/instrumentation-operations.test.ts test/bun/telemetry/
move_file test/bun/metrics.test.ts test/bun/telemetry/
move_file test/bun/metrics-attributes.test.ts test/bun/telemetry/
move_file test/bun/metrics-initialized.test.ts test/bun/telemetry/
move_file test/bun/gc-metrics.test.ts test/bun/telemetry/
move_file test/bun/gc-metrics-operations.test.ts test/bun/telemetry/
move_file test/bun/tracer-operations.test.ts test/bun/telemetry/
move_file test/bun/redis-instrumentation-utils.test.ts test/bun/telemetry/

echo ""
echo "Moving Kong tests..."
move_file test/bun/kong.adapter.test.ts test/bun/kong/
move_file test/bun/kong-adapter-fetch.test.ts test/bun/kong/
move_file test/bun/kong-mode-strategies.test.ts test/bun/kong/
move_file test/bun/kong-utils.test.ts test/bun/kong/

echo ""
echo "Moving handler tests..."
move_file test/bun/tokens-handler.test.ts test/bun/handlers/
move_file test/bun/tokens.mutation.test.ts test/bun/handlers/
move_file test/bun/openapi-handler.test.ts test/bun/handlers/
move_file test/bun/openapi-generator.test.ts test/bun/handlers/
move_file test/bun/openapi-yaml-converter.test.ts test/bun/handlers/

echo ""
echo "Moving logging tests..."
move_file test/bun/logger.test.ts test/bun/logging/
move_file test/bun/logger-fallback.test.ts test/bun/logging/
move_file test/bun/logger-output.test.ts test/bun/logging/
move_file test/bun/winston-logger-methods.test.ts test/bun/logging/

echo ""
echo "Moving utility tests..."
move_file test/bun/retry.test.ts test/bun/utils/
move_file test/bun/error-codes.test.ts test/bun/utils/
move_file test/bun/type-validation.test.ts test/bun/utils/
move_file test/bun/header-validation.test.ts test/bun/utils/
move_file test/bun/cardinality-guard.test.ts test/bun/utils/
move_file test/bun/response.mutation.test.ts test/bun/utils/

echo ""
echo "Moving integration tests..."
move_file test/bun/api-versioning.test.ts test/bun/integration/
move_file test/bun/shutdown-cleanup.test.ts test/bun/integration/

echo ""
echo "Moving mutation-specific tests..."
move_file test/bun/mutation-killer.test.ts test/bun/mutation/

echo ""
echo "Moving JWT tests..."
move_file test/bun/jwt.mutation.test.ts test/bun/mutation/

echo ""
echo "========================================="
echo "Test reorganization complete!"
echo "========================================="
echo ""
echo "Files remaining in test/bun/ (should only be disabled tests):"
ls -1 test/bun/*.test.ts 2>/dev/null || echo "  (none - all moved successfully)"
echo ""
