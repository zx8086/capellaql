# Codebase-Guides Alignment Audit

Assessment of CapellaQL codebase alignment with the 15 best-practice guides in `guides/`.

**Date**: 2026-03-29

---

## Alignment Matrix

| Guide | Status | Score | Key Evidence |
|-------|--------|-------|-------------|
| 4-Pillar Configuration | Excellent | 10/10 | Exact 4-pillar pattern: `defaults.ts`, `envMapping.ts`, `loader.ts`, `schemas.ts` |
| Bun Runtime | Strong | 9/10 | `Bun.serve()`, `Bun.nanoseconds()`, `Bun.sleep()`, native test runner |
| Bun OpenTelemetry | Strong | 9/10 | Per-signal circuit breakers, OTLP/HTTP transport, batch exporters |
| Bun Logging | Excellent | 10/10 | 3-layer DI (ports/adapters/container), Pino+ECS, ILogger interface |
| Bun Docker Security | Strong | 9/10 | Multi-stage distroless, UID 65532, dumb-init, SBOM+Cosign in CI/CD |
| Bun Testing | Strong | 8/10 | Three-tier (unit/integration/e2e), K6 performance, Playwright E2E |
| Bun Kubernetes | Partial | 6/10 | K8s patterns in docs, no standalone manifest directory |
| Bun Profiling | Minor gap | 7/10 | Profiling docs exist; no automated archiving scripts |
| AI Engineering | Match | 8/10 | Result types, error handling, structured responses |
| Zed Tasks | Match | 8/10 | `.zed/` directory present with task definitions |
| Zed DevContainer | Match | 8/10 | Docker Compose services with healthchecks |
| MCP Server | N/A | -- | Not applicable (GraphQL API, not MCP) |
| LangGraph Workflow | N/A | -- | Not applicable (no AI agent workflows) |
| Svelte 5 | N/A | -- | Not applicable (backend service only) |
| UI/UX Style | N/A | -- | Not applicable (no frontend) |

---

## Detailed Findings

### Strong Alignment (9 guides)

#### 4-Pillar Configuration -- EXCELLENT

The codebase at `src/config/` implements the exact pattern prescribed by the guide:

- **Pillar 1 (Defaults)**: `src/config/defaults.ts` provides baseline values for all sections (application, capella, runtime, deployment, telemetry)
- **Pillar 2 (Environment Mapping)**: `src/config/envMapping.ts` explicitly maps config paths to env var names with type information
- **Pillar 3 (Loader)**: `src/config/loader.ts` merges defaults with environment overrides, validates with Zod
- **Pillar 4 (Validation)**: `src/config/schemas.ts` applies Zod schemas with production-specific security rules

**Exceeds guide**: Adds modular config sub-modules (`src/config/modules/`), deep freeze for immutability, and health report generation after validation.

#### Bun Runtime -- STRONG

- `Bun.serve()` used in `src/index.ts` for HTTP server
- `Bun.nanoseconds()` for nanosecond-precision timing in connection manager (6 call sites)
- `Bun.sleep()` preferred over `setTimeout` in retry logic (4 call sites)
- `bun:test` used throughout `tests/bun/`
- `bunfig.toml` configured with telemetry preload, DNS caching, frozen lockfile

**Minor gap**: No runtime guard (`if (!isBun()) throw`) at entry point as guide recommends.

#### Bun OpenTelemetry -- STRONG

- Per-signal circuit breakers: `traceCircuitBreaker`, `metricCircuitBreaker`, `logCircuitBreaker` in `src/telemetry/instrumentation.ts`
- OTLP/HTTP transport (guide explicitly recommends HTTP over gRPC for Bun)
- Batch exporters with periodic intervals
- Export stats tracking at `src/telemetry/export-stats-tracker.ts`
- Auto-instrumentation for GraphQL, DataLoader, Redis
- GC metrics collection and SLA monitoring

**Exceeds guide**: Per-signal circuit breakers (guide documents single breaker), SLA violation profiling triggers, memory pressure detection.

#### Bun Logging -- EXCELLENT

- 3-layer Clean Architecture: ports (`src/logging/ports/`), adapters (`src/logging/adapters/`), container (`src/logging/container.ts`)
- `ILogger` interface matches guide specification exactly
- Pino adapter with ECS formatting
- Critical lifecycle logger bypasses log level (guide does not cover this)
- Dual-mode output (console + OTLP)
- 5 test files under `tests/bun/unit/logging/`

**Exceeds guide**: Critical lifecycle logger for startup/shutdown, Winston fallback adapter, dynamic backend selection via env var.

#### Bun Docker Security -- STRONG

- Multi-stage build with 5 stages (deps-base, deps-dev, deps-prod, development, production)
- Distroless production: `gcr.io/distroless/static-debian12:nonroot`
- Nonroot user UID 65532 matching distroless conventions
- `dumb-init` for PID 1 signal handling
- BuildKit cache mounts (`--mount=type=cache`)
- SBOM generation in CI/CD (`.github/workflows/docker-ci-cd.yml`)
- Cosign signing with SPDX attestation
- 6 vulnerability scanners (Trivy, Snyk Container, Docker Scout)

**Exceeds guide**: Multi-architecture builds (amd64/arm64), Cosign keyless signing, 6 parallel security scanners.

#### Bun Testing -- STRONG

- Three-tier structure: `tests/bun/unit/` (10 subdirectories), `tests/bun/integration/` (4), `tests/bun/e2e/`
- Bun native test runner
- K6 performance tests (smoke, load, stress, soak, spike)
- Playwright E2E at `tests/playwright/`
- Stryker mutation testing
- Shared test utilities (`tests/bun/shared/test-skip-conditions.ts`)
- Coverage configured in `bunfig.toml` with 75% threshold

**Minor gap**: Transaction rollback for DB test isolation not fully implemented.

#### AI Engineering -- MATCH

- RFC 7807 structured error responses
- Result<T,E> tuples for explicit error handling
- Error code registry with domain-prefixed codes
- Trace correlation in error responses

#### Zed Tasks / DevContainer -- MATCH

- `.zed/` directory present at project root
- Docker Compose services with healthchecks for infrastructure

### Minor Gaps (3 guides)

#### Bun Kubernetes -- PARTIAL (6/10)

**What aligns**: K8s deployment patterns documented in `docs/deployment/kubernetes.md` including HPA, PDB, NetworkPolicy, security context with nonroot/readOnlyRootFilesystem/dropped capabilities.

**Gap**: Guide recommends standalone K8s manifest files in a dedicated directory (`k8s/` or `deploy/`). The codebase only has manifests embedded in markdown documentation.

**Recommendation**: Extract K8s manifests from docs into standalone YAML files. Priority: Low (no active K8s deployment).

#### Bun Profiling -- MINOR GAP (7/10)

**What aligns**: Profiling documentation at `docs/development/profiling.md`, performance monitoring at `src/lib/performanceMonitor.ts`.

**Gap**: Guide recommends profile archiving to dated directories and baseline maintenance scripts. Not implemented as automation.

**Recommendation**: Create a `scripts/profile-archive.sh` script. Priority: Low.

#### Bun Testing -- MINOR GAP (8/10)

**What aligns**: Three-tier structure, Bun test runner, K6, Playwright, mutation testing.

**Gap**: Guide recommends transaction rollback for DB test isolation. Integration tests use config-based isolation instead.

**Recommendation**: Add transaction rollback pattern for Couchbase integration tests. Priority: Medium (improves test reliability).

---

## Codebase Patterns That Supersede Existing Guides

The following production patterns in the codebase are NOT covered by any existing guide and represent extractable best practices:

### 1. Couchbase Capella Connection Management (HIGHEST VALUE)

**Source**: `src/lib/couchbase/` (13 files, ~3,500 lines)

Patterns not covered by any guide:
- Singleton connection manager with promise-based deduplication
- 34-type error classification system (retryable/permanent, severity, category)
- 6-level retry architecture (connection, bucket, operation, repository, query, transaction)
- Intelligent circuit breaker (only trips on connection errors, not application errors)
- Cloud-aware timeout optimization (WAN vs LAN profiles)
- Dual health monitoring (active ping vs passive diagnostics)
- Ambiguous transaction commit handling with investigation workflow
- Performance metrics with circular buffer and peak QPS calculation
- DataLoader batching with collection grouping

**Recommendation**: Create `guides/couchbase-capella-guide.md`. Priority: HIGH.

### 2. RFC 7807 Error Handling (HIGH VALUE)

**Source**: `src/errors/` (3 files, ~400 lines)

Patterns not covered by any guide:
- RFC 7807 Problem Details with OTel trace correlation
- Centralized error code registry (35+ codes, 7 domains)
- Go-style Result<T,E> tuples with combinators (tryCatch, mapResult, chainResult, unwrap)
- Security-aware stack trace handling

**Recommendation**: Create `guides/error-handling-guide.md`. Priority: Medium (future work).

### 3. GraphQL Middleware Pipeline (MEDIUM VALUE)

**Source**: `src/server/middleware/` (9 files)

Patterns:
- 7-stage composed middleware pipeline
- ULID request IDs for distributed tracing
- Backpressure control middleware

**Recommendation**: DEFER. More framework-specific, less universally applicable.

---

## Recommended Actions

### Immediate (this session)
1. Create `guides/couchbase-capella-guide.md` -- fills the largest gap, highest value

### Short-term
2. Add Bun runtime guard to `src/index.ts` entry point
3. Create `guides/error-handling-guide.md` for RFC 7807 patterns

### Medium-term
4. Extract K8s manifests into standalone YAML directory
5. Add transaction rollback pattern for DB integration tests
6. Create profile archiving automation script

---

## Summary

**Overall Alignment Score: 8.5/10**

The codebase demonstrates excellent adherence to the guide collection across configuration, logging, Docker security, and OpenTelemetry. It actively exceeds guide recommendations in several areas (per-signal circuit breakers, critical lifecycle logging, multi-architecture Docker builds, 6-scanner security pipeline).

The primary gap is the absence of a database connection guide -- the Couchbase implementation is production-grade with patterns that should be captured as a reusable guide. Secondary gaps (K8s manifests, profiling automation, DB test isolation) are low-priority infrastructure improvements.
