#!/usr/bin/env bash
# Script to reorganize test files into logical subfolders
# Run from project root: bash scripts/reorganize-tests.sh

set -e

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

echo "Moving service tests..."
git mv test/bun/api-gateway.service.test.ts test/bun/services/
git mv test/bun/cache-health.service.test.ts test/bun/services/
git mv test/bun/jwt.service.test.ts test/bun/services/
git mv test/bun/jwt-error-path.test.ts test/bun/services/

echo "Moving cache tests..."
git mv test/bun/cache-factory.test.ts test/bun/cache/
git mv test/bun/cache-factory-errors.test.ts test/bun/cache/
git mv test/bun/cache-health-edge-cases.test.ts test/bun/cache/
git mv test/bun/cache-manager.test.ts test/bun/cache/
git mv test/bun/cache-stale-operations.test.ts test/bun/cache/
git mv test/bun/local-memory-cache.test.ts test/bun/cache/
git mv test/bun/local-memory-cache-maxentries.test.ts test/bun/cache/

echo "Moving circuit breaker tests..."
git mv test/bun/circuit-breaker-per-operation.test.ts test/bun/circuit-breaker/
git mv test/bun/circuit-breaker-state-transitions.test.ts test/bun/circuit-breaker/
git mv test/bun/circuit-breaker-thresholds.test.ts test/bun/circuit-breaker/
git mv test/bun/circuit-breaker.mutation.test.ts test/bun/circuit-breaker/
git mv test/bun/telemetry-circuit-breaker.test.ts test/bun/circuit-breaker/

echo "Moving config tests..."
git mv test/bun/config.test.ts test/bun/config/
git mv test/bun/config-getters.test.ts test/bun/config/
git mv test/bun/config-helpers.test.ts test/bun/config/
git mv test/bun/config-schemas.test.ts test/bun/config/
git mv test/bun/defaults.test.ts test/bun/config/

echo "Moving health tests..."
git mv test/bun/health-branches.test.ts test/bun/health/
git mv test/bun/health-fetch-spy.test.ts test/bun/health/
git mv test/bun/health-handlers.test.ts test/bun/health/
git mv test/bun/health-mutation-killers.test.ts test/bun/health/
git mv test/bun/health-telemetry-branches.test.ts test/bun/health/
git mv test/bun/health.mutation.test.ts test/bun/health/

echo "Moving telemetry tests..."
git mv test/bun/instrumentation-coverage.test.ts test/bun/telemetry/
git mv test/bun/instrumentation-operations.test.ts test/bun/telemetry/
git mv test/bun/metrics.test.ts test/bun/telemetry/
git mv test/bun/metrics-attributes.test.ts test/bun/telemetry/
git mv test/bun/metrics-initialized.test.ts test/bun/telemetry/
git mv test/bun/gc-metrics.test.ts test/bun/telemetry/
git mv test/bun/gc-metrics-operations.test.ts test/bun/telemetry/
git mv test/bun/tracer-operations.test.ts test/bun/telemetry/
git mv test/bun/redis-instrumentation-utils.test.ts test/bun/telemetry/

echo "Moving Kong tests..."
git mv test/bun/kong.adapter.test.ts test/bun/kong/
git mv test/bun/kong-adapter-fetch.test.ts test/bun/kong/
git mv test/bun/kong-mode-strategies.test.ts test/bun/kong/
git mv test/bun/kong-utils.test.ts test/bun/kong/

echo "Moving handler tests..."
git mv test/bun/tokens-handler.test.ts test/bun/handlers/
git mv test/bun/tokens.mutation.test.ts test/bun/handlers/
git mv test/bun/openapi-handler.test.ts test/bun/handlers/
git mv test/bun/openapi-generator.test.ts test/bun/handlers/
git mv test/bun/openapi-yaml-converter.test.ts test/bun/handlers/

echo "Moving logging tests..."
git mv test/bun/logger.test.ts test/bun/logging/
git mv test/bun/logger-fallback.test.ts test/bun/logging/
git mv test/bun/logger-output.test.ts test/bun/logging/
git mv test/bun/winston-logger-methods.test.ts test/bun/logging/

echo "Moving utility tests..."
git mv test/bun/retry.test.ts test/bun/utils/
git mv test/bun/error-codes.test.ts test/bun/utils/
git mv test/bun/type-validation.test.ts test/bun/utils/
git mv test/bun/header-validation.test.ts test/bun/utils/
git mv test/bun/cardinality-guard.test.ts test/bun/utils/
git mv test/bun/response.mutation.test.ts test/bun/utils/

echo "Moving integration tests..."
git mv test/bun/api-versioning.test.ts test/bun/integration/
git mv test/bun/shutdown-cleanup.test.ts test/bun/integration/

echo "Moving mutation-specific tests..."
git mv test/bun/mutation-killer.test.ts test/bun/mutation/

echo ""
echo "Test reorganization complete!"
echo ""
echo "Next steps:"
echo "1. Update import paths (../../src -> ../../../src)"
echo "2. Run: bun test"
echo "3. Run: bun run biome:check"
echo "4. Run: bun run quality:check"
echo "5. Update test/README.md with new structure"
echo "6. Commit with: git commit -m 'Reorganize tests into logical subfolders'"
