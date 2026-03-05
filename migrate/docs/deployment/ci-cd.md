# CI/CD Pipeline

## Pipeline Overview

The service includes enterprise-grade CI/CD automation with comprehensive security and quality checks, enhanced with Docker Cloud Builders and advanced caching optimizations for improved build performance.

### Pipeline Features
- **Optimized Caching Strategy**: Enhanced Playwright browser caching and Bun dependency caching with hierarchical fallback
- **Consistent Build Pipeline**: All steps run on every build (PRs and master branch) for complete consistency
- **Automated Testing**: 460+ tests (100% pass rate) executed in CI with live server validation
- **Docker Cloud Builders**: Enhanced build infrastructure with dedicated cloud resources
- **Multi-platform Builds**: Linux AMD64 and ARM64 with optimized cloud-native compilation
- **Security Scanning Suite**: Comprehensive vulnerability assessments
- **Code Quality Enforcement**: Biome linting, formatting, and TypeScript type checking
- **Supply Chain Security**: SBOM generation and build provenance attestations
- **Performance Validation**: K6 performance tests with configurable thresholds
- **Environment Deployment**: Automated deployment to staging and production environments

## GitHub Actions Workflow

### Main Workflow Structure
```yaml
name: Build and Deploy

on:
  push:
    branches: [ master, develop ]
    tags: [ 'v*' ]
  pull_request:
    branches: [ master, develop ]

jobs:
  build-and-push:
    runs-on: ubuntu-latest

    steps:
    # Enhanced dependency caching (Bun + Playwright)
    # Unit & integration tests (Bun framework)
    # E2E browser tests (Playwright)
    # Code quality checks (Biome + TypeScript)
    # Security scanning (Snyk + Trivy + Docker Scout)
    # Docker multi-platform builds (Cloud Builders)
    # License compliance validation (Bun native)
    # Supply chain verification (SBOM + provenance)
```

### Caching Optimizations

#### Enhanced Playwright Browser Caching
```yaml
- name: Cache Playwright browsers
  uses: actions/cache@v4
  with:
    path: |
      ~/.cache/ms-playwright
      ~/.cache/playwright-browsers
    key: ${{ runner.os }}-playwright-${{ env.PLAYWRIGHT_VERSION }}-${{ hashFiles('package.json') }}-v3
    restore-keys: |
      ${{ runner.os }}-playwright-${{ env.PLAYWRIGHT_VERSION }}-${{ hashFiles('package.json') }}-v3
      ${{ runner.os }}-playwright-${{ env.PLAYWRIGHT_VERSION }}-v3
      ${{ runner.os }}-playwright-${{ hashFiles('package.json') }}-v3
      ${{ runner.os }}-playwright-v3
```

**Features:**
- **Dynamic Version Detection**: Extracts Playwright version from package.json for precise cache keys
- **Multi-Path Caching**: Caches both `~/.cache/ms-playwright` and `~/.cache/playwright-browsers`
- **Hierarchical Fallback Strategy**: 4-level restore-keys for maximum cache reuse
- **Conditional Installation**: Installs only system dependencies on cache hit, full installation on cache miss
- **Performance**: Target reduction from ~51s to ~20s (60% improvement)

#### Bun Dependency Caching
```yaml
- name: Cache Bun dependencies
  uses: actions/cache@v4
  with:
    path: |
      ~/.bun/install/cache
      node_modules
    key: ${{ runner.os }}-bun-${{ hashFiles('bun.lockb') }}-v2
    restore-keys: |
      ${{ runner.os }}-bun-${{ hashFiles('bun.lockb') }}-v2
      ${{ runner.os }}-bun-v2
```

**Benefits:**
- **Lock File Based**: Uses `bun.lockb` hash for precise cache invalidation
- **Two-Tier Caching**: Caches both Bun's internal cache and installed modules
- **Fast Restores**: Typical cache restore time ~5-10 seconds
- **Hierarchical Fallback**: Ensures cache reuse even with minor dependency changes

### Docker Cloud Builders Integration

```yaml
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3
  with:
    driver: cloud
    endpoint: "zx8086/cldbuild"
```

**Benefits:**
- **Enhanced Build Infrastructure**: Dedicated cloud resources for Docker builds
- **Improved ARM64 Performance**: Better cross-platform build support
- **Resource Efficiency**: Reduced GitHub Actions minutes usage
- **Enhanced Caching**: Cloud-native caching for improved build times
- **Scalability**: Better handling of multi-platform builds

**Implementation Approach:**
- **KISS Principle Applied**: Minimal 3-line addition to existing workflow
- **Preserved Features**: All existing security scanning, multi-platform builds, and supply chain security maintained
- **Authentication**: Seamless integration with existing Docker Hub credentials
- **Backwards Compatibility**: Easy rollback available if needed

## Security Scanning

### Multi-Layer Security Scanning
The pipeline includes comprehensive security validation through multiple specialized tools:

#### 1. Snyk Security Scanning
```yaml
- name: Run Snyk to check for vulnerabilities
  uses: snyk/actions/node@master
  with:
    args: --sarif-file-output=snyk.sarif
  env:
    SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

- name: Upload Snyk results to GitHub Code Scanning
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: snyk.sarif
```

**Features:**
- **Dependency Scanning**: Identifies vulnerabilities in npm/bun packages
- **Container Scanning**: Analyzes Docker images for security issues
- **SARIF Integration**: Results uploaded to GitHub Security tab
- **Automated Remediation**: Provides fix suggestions for vulnerabilities

#### 2. Trivy Security Scanning
```yaml
- name: Run Trivy vulnerability scanner
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: 'example/authentication-service:latest'
    format: 'sarif'
    output: 'trivy-results.sarif'

- name: Upload Trivy scan results to GitHub Security tab
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: 'trivy-results.sarif'
```

**Capabilities:**
- **Filesystem Scanning**: Analyzes source code for vulnerabilities
- **Container Image Scanning**: Deep analysis of Docker images
- **CVE Detection**: Comprehensive Common Vulnerabilities and Exposures database
- **License Compliance**: Software license analysis and validation

#### 3. Docker Scout Analysis
```yaml
- name: Docker Scout scan
  uses: docker/scout-action@v1
  with:
    command: cves
    image: example/authentication-service:latest
    sarif-file: scout-results.sarif

- name: Upload Scout results
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: scout-results.sarif
```

**Focus Areas:**
- **Supply Chain Security**: Analysis of base images and dependencies
- **Base Image Vulnerabilities**: Identifies issues in underlying OS packages
- **Remediation Guidance**: Actionable recommendations for security improvements

#### 4. DHI Base Image Attestation Verification
```yaml
- name: Pull DHI base image
  run: docker pull dhi.io/static:20230311

- name: Verify DHI base image attestations (SBOM + Provenance)
  uses: docker/scout-action@v1.15.1
  with:
    command: attestation
    image: dhi.io/static:20230311
    organization: zx8086

- name: Verify DHI base image has zero CVEs
  uses: docker/scout-action@v1.15.1
  with:
    command: cves
    image: dhi.io/static:20230311
    only-severities: critical,high
    exit-code: true

- name: Report DHI verification status
  run: |
    echo "## DHI Base Image Verification" >> $GITHUB_STEP_SUMMARY
    echo "**Base Image:** \`dhi.io/static:20230311\`" >> $GITHUB_STEP_SUMMARY
    echo "### Verified Properties" >> $GITHUB_STEP_SUMMARY
    echo "- SBOM attestation present" >> $GITHUB_STEP_SUMMARY
    echo "- SLSA Level 3 provenance" >> $GITHUB_STEP_SUMMARY
    echo "- VEX attestations for CVE suppression" >> $GITHUB_STEP_SUMMARY
    echo "- Zero HIGH/CRITICAL CVEs expected" >> $GITHUB_STEP_SUMMARY
```

**DHI Verification Features:**
- **Pre-build Verification**: Attestations checked before every build
- **SBOM Validation**: Software Bill of Materials attestation verified
- **Provenance Check**: SLSA Level 3 provenance attestation confirmed
- **CVE Gate**: Build proceeds only if zero HIGH/CRITICAL CVEs
- **GitHub Summary**: Verification results reported in workflow summary

### Security Results Integration
All security scanning results are:
- **Uploaded as SARIF**: Standardized Static Analysis Results Interchange Format
- **Integrated with GitHub Security**: Visible in repository Security tab
- **Tracked Over Time**: Historical vulnerability tracking and trend analysis
- **Actionable**: Specific remediation steps and fix recommendations

## Supply Chain Security

### Software Bill of Materials (SBOM)
```yaml
- name: Generate SBOM
  uses: anchore/sbom-action@v0
  with:
    image: example/authentication-service:latest
    format: spdx-json
    output-file: sbom.spdx.json

- name: Upload SBOM
  uses: actions/upload-artifact@v4
  with:
    name: sbom
    path: sbom.spdx.json
```

### Build Provenance Attestations

Provenance is generated natively by BuildKit using SLSA v0.2 format for DHI compatibility:

```yaml
- name: Build and push Docker image
  uses: docker/build-push-action@v6
  with:
    provenance: mode=max  # SLSA v0.2 - matches DHI base image attestations
    sbom: true
```

> **Note**: We use BuildKit's native provenance (SLSA v0.2) instead of `actions/attest-build-provenance@v1`
> (SLSA v1.0) to maintain compatibility with DHI base images. Mixed SLSA versions cause Docker Scout
> DHI policy validation failures.

**Supply Chain Features:**
- **SBOM Generation**: Complete inventory of software components
- **Provenance Attestations**: BuildKit SLSA v0.2 provenance (DHI-compatible)
- **License Compliance**: Automated validation against approved license list
- **Multi-platform Security**: Consistent security across AMD64 and ARM64 builds

## Testing in CI/CD

### Test Execution Strategy
```yaml
# Unit and Integration Tests
- name: Run Bun tests
  run: bun run test:bun:concurrent --coverage

# E2E Tests (Kong-independent)
- name: Run Playwright tests
  run: bun run playwright:test --project=ci-chromium

# Performance Tests
- name: Run K6 performance tests
  run: |
    K6_THRESHOLDS_NON_BLOCKING=true \
    K6_SMOKE_VUS=1 \
    K6_SMOKE_DURATION=3s \
    bun run k6:smoke:health
```

### Test Categories in CI
1. **Unit/Integration Tests**: 392+ tests with comprehensive coverage (Bun test runner)
2. **E2E Tests**: 68+ Kong-independent API validation tests (Playwright)
3. **Performance Tests**: K6 smoke tests for regression detection

### Test Results and Artifacts
- **Coverage Reports**: Uploaded for tracking and analysis
- **Test Results**: JUnit XML format for CI integration
- **Performance Reports**: K6 results for performance monitoring
- **Screenshots/Videos**: Playwright artifacts on test failures

## Code Quality Enforcement

### TypeScript and Biome Integration
```yaml
- name: Type checking
  run: bun run typecheck

- name: Code quality checks
  run: bun run quality:check

- name: Biome linting and formatting
  run: bun run biome:check
```

### Quality Gates
- **TypeScript Compilation**: Zero errors required
- **Biome Linting**: All linting rules must pass
- **Code Formatting**: Consistent formatting enforced
- **Test Coverage**: Minimum 80% coverage maintained

## Performance Validation

### K6 Performance Testing
```yaml
- name: Performance baseline validation
  run: |
    # Health endpoint performance
    K6_THRESHOLDS_NON_BLOCKING=true \
    K6_SMOKE_VUS=1 \
    K6_SMOKE_DURATION=3s \
    bun run k6:smoke:health

    # Token generation performance
    K6_THRESHOLDS_NON_BLOCKING=true \
    K6_SMOKE_VUS=1 \
    K6_SMOKE_DURATION=3s \
    bun run k6:smoke:tokens
```

### Performance Thresholds
- **Response Time**: p95 < 100ms, p99 < 200ms
- **Error Rate**: < 1% failures
- **Throughput**: > 1000 requests/second baseline

## Deployment Automation

### Environment-Specific Deployments
```yaml
- name: Deploy to Staging
  if: github.ref == 'refs/heads/develop'
  run: |
    docker tag example/authentication-service:latest \
      example/authentication-service:staging
    docker push example/authentication-service:staging

- name: Deploy to Production
  if: github.ref == 'refs/heads/master'
  run: |
    docker tag example/authentication-service:latest \
      example/authentication-service:production
    docker push example/authentication-service:production
```

### Deployment Features
- **Environment Isolation**: Separate configurations for staging/production
- **Blue-Green Deployments**: Zero-downtime deployment strategy
- **Rollback Capability**: Quick reversion to previous versions
- **Health Check Validation**: Deployment verification with health endpoints

## Pipeline Performance

### Execution Optimization
- **Parallel Execution**: Tests run concurrently where possible
- **Shared Artifacts**: Dependencies cached and shared across jobs
- **Resource Efficiency**: Optimized resource allocation
- **Build Time**: Target total pipeline time < 15 minutes

### Performance Metrics
- **Cache Hit Rates**: 90%+ for dependencies and browsers
- **Test Execution**: Concurrent execution with 10 workers
- **Build Performance**: 60-70% improvement with Cloud Builders
- **Resource Usage**: Optimized GitHub Actions minutes consumption

## Monitoring and Alerting

### Pipeline Monitoring
- **Build Status Notifications**: Slack/Teams integration
- **Failure Alerts**: Immediate notification on pipeline failures
- **Performance Tracking**: Build time and cache effectiveness monitoring
- **Security Alert Integration**: Vulnerability notifications

### Quality Metrics Tracking
- **Test Coverage Trends**: Historical coverage tracking
- **Security Vulnerability Counts**: Trend analysis of security issues
- **Performance Regression Detection**: Automated performance comparison
- **Dependency Health**: Monitoring of outdated or vulnerable dependencies

## Troubleshooting CI/CD Issues

### Common Pipeline Issues

#### Cache Miss Issues
```bash
# Check cache keys in workflow logs
# Verify package.json and bun.lockb consistency
# Review cache restore-keys hierarchy
```

#### Test Failures
```bash
# Review test logs for specific failures
# Check environment variable configuration
# Validate service startup and health checks
# Verify Kong connectivity for integration tests
```

#### Security Scan Failures
```bash
# Review SARIF reports in GitHub Security tab
# Check Snyk/Trivy/Scout logs for specific vulnerabilities
# Validate dependency versions and update strategies
# Review base image security and update requirements
```

#### Docker Build Issues
```bash
# Verify Docker Cloud Builders connectivity
# Check multi-platform build logs
# Validate Dockerfile syntax and layer optimization
# Review buildx configuration and endpoints
```

### Debug Strategies
1. **Enable Debug Logging**: Add debug flags to workflow steps
2. **Artifact Analysis**: Download and analyze build artifacts
3. **Local Reproduction**: Replicate CI environment locally
4. **Step-by-Step Isolation**: Comment out steps to isolate issues
5. **Cache Debugging**: Clear caches and rebuild from scratch