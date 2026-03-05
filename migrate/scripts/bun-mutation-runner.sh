#!/usr/bin/env bash
# scripts/bun-mutation-runner.sh
# Wrapper to run Bun CLI for mutation testing with SIO-276 workaround

set -euo pipefail

# Activate Bun CLI mode
export BUN_BE_BUN=1

# Use console telemetry mode with silent logging to prevent interfering with StrykerJS output parsing
export TELEMETRY_MODE=console
export LOG_LEVEL=silent

# Use bundled Bun executable
BUNDLED_BUN="${BASH_SOURCE%/*}/bundled-runtimes/bun-cli"

# Verify executable exists
if [[ ! -x "$BUNDLED_BUN" ]]; then
  echo "Error: Bundled Bun executable not found at $BUNDLED_BUN" >&2
  echo "Run: bun build --compile --outfile scripts/bundled-runtimes/bun-cli \$(which bun)" >&2
  exit 1
fi

# Run Bun with all arguments passed through
exec "$BUNDLED_BUN" "$@"
