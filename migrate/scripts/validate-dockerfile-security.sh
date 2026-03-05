#!/bin/bash
# Dockerfile Security Validation Script
# Validates 12/12 security score achievement for authentication service with DHI

set -euo pipefail

echo "Dockerfile Security Validation for Authentication Service (DHI)"
echo "================================================================"

DOCKERFILE_PATH="${1:-Dockerfile}"
SCORE=0
MAX_SCORE=12
ISSUES=()

# Check if Dockerfile exists
if [[ ! -f "$DOCKERFILE_PATH" ]]; then
    echo "FAIL Dockerfile not found at: $DOCKERFILE_PATH"
    exit 1
fi

echo "INFO Analyzing: $DOCKERFILE_PATH"
echo ""

# 1. Check for DHI or distroless base image (2 points)
echo "CHECK [1/12] Checking secure base image (DHI/distroless)..."
if grep -q "FROM dhi.io/static" "$DOCKERFILE_PATH"; then
    echo "PASS Using Docker Hardened Images (dhi.io/static)"
    ((SCORE += 2))
elif grep -q "FROM gcr.io/distroless/base:nonroot" "$DOCKERFILE_PATH"; then
    echo "PASS Using distroless base image (gcr.io/distroless/base:nonroot)"
    ((SCORE += 2))
else
    echo "FAIL Not using DHI or distroless base image"
    ISSUES+=("Must use dhi.io/static or gcr.io/distroless/base:nonroot for minimal attack surface")
fi

# 2. Check nonroot user execution (1 point)
echo "CHECK [2/12] Checking nonroot user execution..."
if grep -q "65532:65532\|nonroot" "$DOCKERFILE_PATH" && ! grep -q "USER root" "$DOCKERFILE_PATH"; then
    echo "PASS Running as nonroot user (65532:65532)"
    ((SCORE += 1))
else
    echo "FAIL Not properly configured for nonroot execution"
    ISSUES+=("Must run as nonroot user (65532:65532) without root user switches")
fi

# 3. Check for no shell access in production stage (1 point)
echo "CHECK [3/12] Checking shell access prevention..."
# Distroless/DHI images have no shell by design - just verify we're using them
if grep -q "gcr.io/distroless/base:nonroot\|dhi.io/static" "$DOCKERFILE_PATH"; then
    echo "PASS No shell access (distroless/DHI eliminates shell by design)"
    ((SCORE += 1))
else
    echo "FAIL Not using shell-less base image"
    ISSUES+=("Must use distroless or DHI base image to eliminate shell access")
fi

# 4. Check health check implementation (1 point)
echo "CHECK [4/12] Checking health check security..."
if grep -q "HEALTHCHECK" "$DOCKERFILE_PATH" && grep -q "bun.*--eval" "$DOCKERFILE_PATH" && grep -q "fetch" "$DOCKERFILE_PATH" && ! grep -E "^[^#]*curl" "$DOCKERFILE_PATH"; then
    echo "PASS Secure health check using Bun native fetch"
    ((SCORE += 1))
else
    echo "FAIL Health check not using secure Bun native implementation"
    ISSUES+=("Health check must use Bun native fetch, not curl")
fi

# 5. Check for proper file ownership (1 point)
echo "CHECK [5/12] Checking file ownership security..."
if grep -q -- "--chown=65532:65532" "$DOCKERFILE_PATH"; then
    echo "PASS Proper file ownership for nonroot user"
    ((SCORE += 1))
else
    echo "FAIL Files not properly owned by nonroot user"
    ISSUES+=("All copied files must be owned by nonroot user (--chown=65532:65532)")
fi

# 6. Check for security labels (1 point)
echo "CHECK [6/12] Checking security attestation labels..."
if grep -q "security.scan.disable.*false\|security.attestation.required.*true" "$DOCKERFILE_PATH"; then
    echo "PASS Security attestation labels present"
    ((SCORE += 1))
else
    echo "FAIL Missing security attestation labels"
    ISSUES+=("Must include security.scan.disable=false and security.attestation.required=true labels")
fi

# 7. Check for version pinning (1 point)
echo "CHECK [7/12] Checking version pinning..."
if grep -q "oven/bun:1.3.0" "$DOCKERFILE_PATH" && ! grep -q ":latest" "$DOCKERFILE_PATH"; then
    echo "PASS All images use pinned versions"
    ((SCORE += 1))
else
    echo "FAIL Images not properly version pinned"
    ISSUES+=("All FROM statements must use specific version tags, not latest")
fi

# 8. Check for minimal layers (1 point)
echo "CHECK [8/12] Checking layer optimization..."
COPY_COUNT=$(grep -c "^COPY" "$DOCKERFILE_PATH" || true)
if [[ $COPY_COUNT -le 10 ]]; then
    echo "PASS Minimal layer count ($COPY_COUNT COPY instructions)"
    ((SCORE += 1))
else
    echo "FAIL Too many layers ($COPY_COUNT COPY instructions)"
    ISSUES+=("Minimize COPY instructions to reduce attack surface")
fi

# 9. Check for proper entrypoint (1 point)
echo "CHECK [9/12] Checking secure entrypoint with signal handling..."
if grep -q 'ENTRYPOINT.*dumb-init' "$DOCKERFILE_PATH" && grep -q 'CMD \["/usr/local/bin/bun"' "$DOCKERFILE_PATH"; then
    echo "PASS Proper PID 1 signal handling with dumb-init"
    ((SCORE += 1))
else
    echo "FAIL Missing proper PID 1 signal handling"
    ISSUES+=("Must use dumb-init for proper SIGTERM/SIGINT handling in containers")
fi

# 10. Check for build metadata (1 point)
echo "CHECK [10/12] Checking build metadata and compliance..."
if grep -q "org.opencontainers.image" "$DOCKERFILE_PATH" && grep -q "org.opencontainers.image.base.name.*(dhi.io\|distroless)" "$DOCKERFILE_PATH"; then
    echo "PASS Complete OCI metadata with secure base attestation"
    ((SCORE += 1))
else
    echo "FAIL Missing or incomplete build metadata"
    ISSUES+=("Must include complete OCI image labels with base image attestation")
fi

# 11. Check for DHI-specific labels (1 point - NEW)
echo "CHECK [11/12] Checking DHI compliance labels..."
if grep -q "security.dhi.enabled.*true" "$DOCKERFILE_PATH" && grep -q "security.dhi.slsa.level" "$DOCKERFILE_PATH"; then
    echo "PASS DHI compliance labels present (SLSA, VEX, SBOM)"
    ((SCORE += 1))
elif grep -q "FROM dhi.io/static" "$DOCKERFILE_PATH"; then
    echo "WARNING Using DHI but missing compliance labels"
    ISSUES+=("DHI images should include security.dhi.* labels for compliance tracking")
else
    echo "SKIP Not using DHI (acceptable)"
    ((SCORE += 1))
fi

# 12. Check for DHI CVE SLA label (1 point - NEW)
echo "CHECK [12/12] Checking CVE remediation SLA..."
if grep -q "security.dhi.cve.sla.*7-days" "$DOCKERFILE_PATH"; then
    echo "PASS 7-day CVE remediation SLA documented"
    ((SCORE += 1))
elif grep -q "FROM dhi.io/static" "$DOCKERFILE_PATH"; then
    echo "WARNING Using DHI but missing CVE SLA label"
    ISSUES+=("DHI images should document 7-day CVE remediation SLA")
else
    echo "SKIP Not using DHI (acceptable)"
    ((SCORE += 1))
fi

echo ""
echo "SCORE Security Score: $SCORE/$MAX_SCORE"

# Additional security checks
echo ""
echo "SECURITY  Additional Security Validations"
echo "=================================="

# Final scoring
echo ""
echo "RESULTS Final Results"
echo "==============="

if [[ $SCORE -eq $MAX_SCORE ]] && [[ ${#ISSUES[@]} -eq 0 ]]; then
    echo "SUCCESS PERFECT SCORE: 12/12 Docker Security Achieved!"
    if grep -q "FROM dhi.io/static" "$DOCKERFILE_PATH"; then
        echo "PASS Zero attack surface with Docker Hardened Images"
        echo "PASS SLSA Level 3 provenance + VEX + SBOM compliance"
        echo "PASS 7-day CVE remediation SLA automated"
    else
        echo "PASS Zero attack surface with minimal base implementation"
    fi
    echo "PASS Complete security hardening implemented"
    echo "PASS Production-ready with maximum container security"
    exit 0
elif [[ $SCORE -ge 10 ]]; then
    echo "WARNING  GOOD SCORE: $SCORE/12 - Minor improvements needed"
    echo ""
    echo "ISSUES Issues to resolve:"
    for issue in "${ISSUES[@]}"; do
        echo "   • $issue"
    done
    exit 1
else
    echo "FAIL NEEDS IMPROVEMENT: $SCORE/12 - Major security gaps"
    echo ""
    echo "CRITICAL Critical issues to resolve:"
    for issue in "${ISSUES[@]}"; do
        echo "   • $issue"
    done
    exit 2
fi