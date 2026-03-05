#!/usr/bin/env bash
# scripts/bun-mutation-runner.sh
# Mutation testing runner with Bun compatibility
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "=== CapellaQL Mutation Testing ==="
echo "Runner: StrykerJS with Bun command runner"
echo "Targets: resolvers, cache, middleware, circuit breaker"
echo ""

# Check if StrykerJS is installed
if ! bunx stryker --version &>/dev/null; then
  echo "Installing @stryker-mutator/core..."
  bun add -d @stryker-mutator/core
fi

# Parse arguments
FRESH=false
for arg in "$@"; do
  case $arg in
    --fresh)
      FRESH=true
      ;;
  esac
done

# Clear incremental cache if --fresh
if [ "$FRESH" = true ]; then
  echo "Clearing incremental cache..."
  rm -rf .stryker-tmp/incremental.json
fi

# Run mutation testing
echo "Starting mutation testing..."
echo ""

bunx stryker run

echo ""
echo "=== Mutation Testing Complete ==="
echo "Report available at: reports/mutation/index.html"
