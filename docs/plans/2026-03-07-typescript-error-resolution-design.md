# Design: Resolve All 142 TypeScript Errors

## Problem

The codebase has 142 pre-existing TypeScript errors across 37 files. These are structural type issues in the Couchbase SDK integration, models, server code, and tests. `bun run typecheck` fails with exit code 1.

## Root Causes

1. **Couchbase SDK v4.6.1 API drift** — Code uses builder patterns, string literals, and deprecated APIs that don't match the installed SDK's type definitions
2. **Missing type declarations** — `globalThis` properties, deleted module imports, incomplete interfaces
3. **Handler/middleware type mismatches** — `withMiddleware` requires `Promise<Response>` but handlers return `Response | Promise<Response>`
4. **Interface drift** — `HealthStatus`, `SystemHealth`, `ResolverContext` interfaces don't match the code that implements them

## Approach: Phased by Risk

Fix errors in 4 phases ordered by blast radius. Each phase is independently verifiable.

## Phase 1: Mechanical Fixes (~21 errors, zero runtime change)

| Fix | Files | Errors |
|-----|-------|--------|
| Add `global.d.ts` declaring `CN_ROOT`, `CN_CXXCBC_CACHE_DIR`, `ENV_TRUE` on `globalThis` | New: `src/global.d.ts` | 7 |
| Add `staleHits: 0` to `BunSQLiteCache` stats init (lines 37, 271) | `src/lib/bunSQLiteCache.ts` | 2 |
| Add `override` keyword to `cause` property | `src/lib/couchbase/errors.ts` | 1 |
| Fix optional chaining: `dbHealth?.details.x` → `dbHealth?.details?.x` | `src/lib/systemHealth.ts` | 3 |
| Cast logging metadata to `Record<string, unknown>` | `src/lib/metricsCardinalityManager.ts`, `src/lib/configWatcher.ts` | 2 |
| Fix `null` vs `undefined`: `userAgent` header `?? undefined` | `src/graphql/context.ts` | 1 |
| Fix `envMapping.ts` never-type narrowing | `src/config/envMapping.ts` | 1 |
| Replace `fetch({ timeout })` with `AbortSignal.timeout()` | `src/healthcheck.ts` | 1 |
| Fix `SearchResult[]` vs `Record<string, unknown>[]` type flow | `src/graphql/resolvers/documentSearch.ts` | 2 |
| Add `lastHealthCheck` to connection manager status return | `src/lib/couchbase/connection-manager.ts` | 1 |

**Verification:** `bun run typecheck` error count drops. `bun test` still passes.

## Phase 2: Type Definition Alignment (~34 errors)

| Fix | Files | Errors |
|-----|-------|--------|
| Replace `couchbaseConnector` import with `connection-manager` types in `ResolverContext` | `src/graphql/types.ts` | 1 |
| Direct type imports for `RequestContext`/`WebSocketData` instead of `typeof` conditional | `src/index.ts` | 4 |
| Add generic parameter `Server<WebSocketData>` | `src/index.ts` | 2 |
| Widen `withMiddleware` to accept `Response \| Promise<Response>` | `src/index.ts` | 13 |
| Add missing properties to `HealthStatus` interface or align code | `src/graphql/types.ts`, `src/lib/performanceMonitor.ts`, `src/lib/systemHealth.ts` | 7 |
| Align `SystemHealth` component status values | `src/lib/systemHealth.ts` | 2 |
| Fix memory usage return type | `src/lib/systemHealth.ts` | 4 |
| Fix `RequestContext` export from `src/server/types.ts` | `src/server/types.ts` | 1 |

**Verification:** `bun run typecheck` + `bun test`.

## Phase 3: Couchbase SDK API Rewrite (~34 errors, runtime changes)

| Fix | Files | Errors |
|-----|-------|--------|
| Rewrite `mutateIn`/`lookupIn` from builder to spec array pattern | `src/lib/couchbase/kv-operations.ts` | ~12 |
| Replace durability string literals with `DurabilityLevel` enum | `src/lib/couchbase/kv-operations.ts` | 4 |
| Replace query consistency strings with SDK enums | `src/lib/couchbase/query-executor.ts` | 2 |
| Remove non-existent config properties, use correct SDK shapes | `src/lib/couchbase/connection-options.ts` | 5 |
| Fix Transaction API — correct type imports and instantiation | `src/lib/couchbase/transaction-handler.ts` | 2 |
| Align `GetResult` return shape with SDK type | `src/lib/couchbase/kv-operations.ts` | 2 |
| Fix health service property access | `src/services/health/couchbaseHealth.ts` | 5 |
| Fix comprehensive health type mismatches | `src/services/health/comprehensiveHealth.ts` | 2 |

**Risk:** Medium — changes runtime behavior of database operations. Verified against installed SDK types in `node_modules/couchbase/dist/`.

**Verification:** `bun run typecheck` + `bun test`.

## Phase 4: Test File Fixes (~17 errors)

| Fix | Files | Errors |
|-----|-------|--------|
| Fix mock `getCollection` return type | `tests/bun/integration/database/connection.test.ts` | 2 |
| Fix `skipIfCouchbaseUnavailable` call signature | `tests/bun/shared/test-skip-conditions.ts` | 2 |
| Fix `CircuitBreaker` constructor overload calls | `tests/bun/unit/cache/queryCache.test.ts` | 3 |
| Add null guards on `Result` unwrap | `tests/bun/unit/errors/result.test.ts` | 2 |
| Add missing `RequestContext` properties in mocks | `tests/bun/unit/middleware/rateLimit.test.ts`, `security.test.ts` | 2 |
| Fix `ExportResult` enum usage | `tests/bun/unit/telemetry/export-stats-tracker.test.ts` | 2 |
| Fix `never` type on `statusCode` narrowing | `tests/bun/unit/telemetry/httpMetrics.test.ts` | 1 |
| Add `freedBytes` to `GCEvent` test objects, fix level comparison | `tests/bun/unit/telemetry/processMetrics.test.ts` | 3 |

**Verification:** `bun run typecheck` → 0 errors. `bun test` → 766+ pass, 0 fail.

## Success Criteria

1. `bun run typecheck` exits with code 0
2. `bun test` — all tests pass (766+), 0 failures
3. `bun run biome:check` — clean
4. No new `@ts-ignore` or `@ts-expect-error` comments added
