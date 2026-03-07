# TypeScript Error Resolution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate all 142 TypeScript errors so `bun run typecheck` exits with code 0.

**Architecture:** Fix errors in 4 phases ordered by blast radius — mechanical type-only fixes first, then interface alignment, then Couchbase SDK API rewrites, then test file fixes. Each phase is independently verifiable.

**Tech Stack:** TypeScript, Bun, Couchbase Node.js SDK v4.6.1

---

## Phase 1: Mechanical Fixes (zero runtime change)

### Task 1: Create globalThis type declarations

**Files:**
- Create: `src/global.d.ts`

**Step 1: Create the declaration file**

```typescript
/* src/global.d.ts — Global type augmentation for Couchbase SDK and runtime */

declare global {
  var CN_ROOT: string;
  var CN_CXXCBC_CACHE_DIR: string;
  var ENV_TRUE: string[];
}

export {};
```

**Step 2: Verify error count drops**

Run: `bun run typecheck 2>&1 | grep "TS7017" | wc -l`
Expected: 0 (was 7)

---

### Task 2: Fix BunSQLiteCache missing `staleHits`

**Files:**
- Modify: `src/lib/bunSQLiteCache.ts:37` and `src/lib/bunSQLiteCache.ts:271`

**Step 1: Add staleHits to initial stats (line ~37)**

Add `staleHits: 0,` after the `evictions: 0,` line in the private stats initialization.

**Step 2: Add staleHits to clear() reset (line ~271)**

Add `staleHits: 0,` after the `evictions: this.stats.evictions,` line in the clear() method stats reset.

**Step 3: Verify**

Run: `bun run typecheck 2>&1 | grep "bunSQLiteCache" | wc -l`
Expected: 0 (was 2, minus 1 if the third error is something else)

---

### Task 3: Fix couchbase errors.ts override keyword

**Files:**
- Modify: `src/lib/couchbase/errors.ts:502`

**Step 1: Add override keyword**

Change:
```typescript
public readonly cause?: Error;
```
To:
```typescript
public override readonly cause?: Error;
```

**Step 2: Verify**

Run: `bun run typecheck 2>&1 | grep "errors.ts" | wc -l`
Expected: 0 (was 1)

---

### Task 4: Fix systemHealth.ts optional chaining

**Files:**
- Modify: `src/lib/systemHealth.ts:74-77`

**Step 1: Fix three lines of optional chaining**

Line 74 — change:
```typescript
circuitBreaker: dbHealth?.details.circuitBreaker || { state: "unknown", failures: 0, successes: 0 },
```
To:
```typescript
circuitBreaker: dbHealth?.details?.circuitBreaker || { state: "unknown", failures: 0, successes: 0 },
```

Line 75 — change:
```typescript
details: dbHealth?.details.ping,
```
To:
```typescript
details: dbHealth?.details?.ping,
```

Lines 76-77 — change:
```typescript
error:
  dbHealth?.details.error || (databaseHealth.status === "rejected" ? databaseHealth.reason?.message : undefined),
```
To:
```typescript
error:
  dbHealth?.details?.error || (databaseHealth.status === "rejected" ? databaseHealth.reason?.message : undefined),
```

**Step 2: Verify**

Run: `bun run typecheck 2>&1 | grep "systemHealth.ts" | wc -l`
Expected: Count decreases by at least 3

---

### Task 5: Fix logging metadata type casts

**Files:**
- Modify: `src/lib/metricsCardinalityManager.ts:116`
- Modify: `src/lib/configWatcher.ts:100`

**Step 1: Fix metricsCardinalityManager.ts**

Line 116 — change:
```typescript
log(`Cardinality limit set for metric: ${metricName}`, newLimit);
```
To:
```typescript
log(`Cardinality limit set for metric: ${metricName}`, newLimit as Record<string, unknown>);
```

**Step 2: Fix configWatcher.ts**

Line 100 — change:
```typescript
log(`Configuration file changed:`, event);
```
To:
```typescript
log(`Configuration file changed:`, event as Record<string, unknown>);
```

**Step 3: Verify**

Run: `bun run typecheck 2>&1 | grep "metricsCardinalityManager\|configWatcher" | wc -l`
Expected: 0

---

### Task 6: Fix context.ts null vs undefined

**Files:**
- Modify: `src/graphql/context.ts:38`

**Step 1: Fix userAgent assignment**

Line 29 or where `userAgent` is assigned — change:
```typescript
const userAgent = request.headers.get("user-agent");
```
To:
```typescript
const userAgent = request.headers.get("user-agent") ?? undefined;
```

**Step 2: Verify**

Run: `bun run typecheck 2>&1 | grep "context.ts" | wc -l`
Expected: 0

---

### Task 7: Fix healthcheck.ts fetch timeout

**Files:**
- Modify: `src/healthcheck.ts:14-16`

**Step 1: Replace timeout with AbortSignal**

Change:
```typescript
const response = await fetch(healthUrl, {
  timeout: 5000, // 5 second timeout
});
```
To:
```typescript
const response = await fetch(healthUrl, {
  signal: AbortSignal.timeout(5000),
});
```

**Step 2: Verify**

Run: `bun run typecheck 2>&1 | grep "healthcheck.ts" | wc -l`
Expected: 0

---

### Task 8: Fix envMapping.ts never-type narrowing

**Files:**
- Modify: `src/config/envMapping.ts:133`

**Step 1: Fix the type narrowing**

Read the file around line 130 to understand the exact pattern. The issue is likely that `entry` is narrowed to `never` because the union of section types doesn't intersect cleanly. Fix by adding an explicit type assertion:

```typescript
return (entry as { envVar: string }).envVar;
```

**Step 2: Verify**

Run: `bun run typecheck 2>&1 | grep "envMapping.ts" | wc -l`
Expected: 0

---

### Task 9: Fix documentSearch.ts type flow

**Files:**
- Modify: `src/graphql/resolvers/documentSearch.ts:41,62`

**Step 1: Read the file to understand the exact type flow**

The issue is `SearchResult[]` vs `Record<string, unknown>[]`. Either:
- Add an index signature to SearchResult: `[key: string]: unknown;`
- Or cast at the point of use

**Step 2: Apply fix based on reading**

If `withSQLiteCache` expects `Record<string, unknown>[]`, cast the return. If `deduplicateByFields` expects `Record<string, unknown>[]`, cast the argument.

**Step 3: Verify**

Run: `bun run typecheck 2>&1 | grep "documentSearch.ts" | wc -l`
Expected: 0

---

### Task 10: Fix connection-manager.ts missing property

**Files:**
- Modify: `src/lib/couchbase/connection-manager.ts:69`

**Step 1: Add lastHealthCheck property declaration**

After line 69 (`private isClosing = false;`), add:
```typescript
private lastHealthCheck?: Date;
```

**Step 2: Verify**

Run: `bun run typecheck 2>&1 | grep "connection-manager.ts" | wc -l`
Expected: 0

---

### Task 11: Phase 1 verification

**Step 1: Run full typecheck**

Run: `bun run typecheck 2>&1 | tail -5`
Expected: Error count significantly reduced from 142

**Step 2: Run tests**

Run: `bun test 2>&1 | tail -10`
Expected: 766+ pass, 0 fail

**Step 3: Commit**

```bash
git add src/global.d.ts src/lib/bunSQLiteCache.ts src/lib/couchbase/errors.ts src/lib/systemHealth.ts src/lib/metricsCardinalityManager.ts src/lib/configWatcher.ts src/graphql/context.ts src/healthcheck.ts src/config/envMapping.ts src/graphql/resolvers/documentSearch.ts src/lib/couchbase/connection-manager.ts
git commit -m "fix(types): mechanical type fixes — globalThis declarations, null checks, missing properties"
```

---

## Phase 2: Type Definition Alignment

### Task 12: Fix ResolverContext to use connection-manager types

**Files:**
- Modify: `src/graphql/types.ts:3,8-9`

**Step 1: Replace import and update interface**

Change:
```typescript
import type { capellaConn } from "../lib/couchbaseConnector";

export interface ResolverContext {
  cluster: capellaConn;
```
To:
```typescript
import type { CouchbaseConnection } from "../lib/couchbase/types";

export interface ResolverContext {
  connection: CouchbaseConnection;
```

If `CouchbaseConnection` doesn't exist in `types.ts`, check what `connectionManager.getConnection()` returns and use that type. Alternatively, define inline:
```typescript
export interface ResolverContext {
  connection: {
    cluster: import("couchbase").Cluster;
    bucket: import("couchbase").Bucket;
    scope: import("couchbase").Scope;
    collection: import("couchbase").Collection;
  };
```

**Step 2: Verify**

Run: `bun run typecheck 2>&1 | grep "types.ts" | wc -l`
Expected: TS2307 error gone

---

### Task 13: Fix index.ts type imports and withMiddleware

**Files:**
- Modify: `src/index.ts:87-96,160-161`

**Step 1: Replace typeof conditional type extraction with direct imports**

Replace lines 87-96:
```typescript
type RequestContext = typeof types.RequestContext extends new (
  ...args: infer _
) => infer R
  ? R
  : typeof types.RequestContext;
type WebSocketData = typeof types.WebSocketData extends new (
  ...args: infer _
) => infer R
  ? R
  : typeof types.WebSocketData;
```

With:
```typescript
type RequestContext = import("./server/types").RequestContext;
type WebSocketData = import("./server/types").WebSocketData;
```

Since these are dynamically imported, use inline import types.

**Step 2: Fix withMiddleware handler type (line 161)**

Change:
```typescript
function withMiddleware(
  handler: (request: Request, context: RequestContext) => Promise<Response>
): (request: Request, context: RequestContext) => Promise<Response> {
```
To:
```typescript
function withMiddleware(
  handler: (request: Request, context: RequestContext) => Response | Promise<Response>
): (request: Request, context: RequestContext) => Promise<Response> {
```

This single change fixes all 13 handler registration errors.

**Step 3: Fix Server generic type (lines 198, 204)**

Line 198 — change `let server: Server | null = null;` to `let server: Server<WebSocketData> | null = null;`

Line 204 — change return type to `Promise<Server<WebSocketData>>`

**Step 4: Verify**

Run: `bun run typecheck 2>&1 | grep "index.ts" | wc -l`
Expected: 0 (was 26)

---

### Task 14: Fix HealthStatus interface for performanceMonitor and systemHealth

**Files:**
- Modify: `src/lib/performanceMonitor.ts:221-222`

**Step 1: Read performanceMonitor.ts to understand what properties it accesses**

The code accesses `pingResult.success` and `pingResult.latency` on a `HealthStatus` object. Looking at the `HealthStatus` from `src/lib/couchbase/types.ts`, it has `status` (not `success`) and `details?.latency` (not top-level `latency`).

Fix the property access:
- `pingResult.success` → `pingResult.status === "healthy" || pingResult.status === "degraded"`
- `pingResult.latency` → `pingResult.details?.latency`

**Step 2: Verify**

Run: `bun run typecheck 2>&1 | grep "performanceMonitor.ts" | wc -l`
Expected: 0 (was 3)

---

### Task 15: Fix server/types.ts import side-effect

**Files:**
- Modify: `src/server/types.ts:4` (if needed)

**Step 1: Check if createProblemDetails import is the issue**

Line 4 has a value import (`import { createProblemDetails, createProblemResponse }`) which means `types` at runtime is a module with values, not just types. This is why `typeof types.RequestContext` fails — `RequestContext` is a type-only export, not a value.

If Task 13's fix resolves this, no additional changes needed here.

**Step 2: Verify**

Run: `bun run typecheck 2>&1 | grep "server/types.ts" | wc -l`
Expected: 0

---

### Task 16: Phase 2 verification

**Step 1: Run full typecheck**

Run: `bun run typecheck 2>&1 | tail -5`
Expected: Error count below 50

**Step 2: Run tests**

Run: `bun test 2>&1 | tail -10`
Expected: 766+ pass, 0 fail

**Step 3: Commit**

```bash
git add src/graphql/types.ts src/index.ts src/lib/performanceMonitor.ts src/server/types.ts
git commit -m "fix(types): align type definitions — ResolverContext, handler types, HealthStatus"
```

---

## Phase 3: Couchbase SDK API Rewrite

### Task 17: Rewrite mutateIn to use MutateInSpec array pattern

**Files:**
- Modify: `src/lib/couchbase/kv-operations.ts:14,224-266`

**Step 1: Update imports**

Change line 14:
```typescript
import type { Collection, DurabilityLevel, GetOptions, GetResult, MutationResult, UpsertOptions } from "couchbase";
```
To:
```typescript
import { DurabilityLevel, LookupInSpec, MutateInSpec, type Collection, type GetOptions, type GetResult, type MutateInOptions, type MutationResult, type UpsertOptions } from "couchbase";
```

**Step 2: Rewrite mutateIn method (lines 224-266)**

Replace the entire method body:
```typescript
static async mutateIn(
  collection: Collection,
  id: string,
  operations: SubdocOperation[],
  options: {
    cas?: string;
    durability?: "none" | "majority" | "majorityAndPersistToActive" | "persistToMajority";
    timeout?: number;
  } = {}
): Promise<MutationResult> {
  const specs: MutateInSpec[] = [];

  for (const op of operations) {
    switch (op.type) {
      case "upsert":
        specs.push(MutateInSpec.upsert(op.path, op.value));
        break;
      case "insert":
        specs.push(MutateInSpec.insert(op.path, op.value));
        break;
      case "replace":
        specs.push(MutateInSpec.replace(op.path, op.value));
        break;
      case "remove":
        specs.push(MutateInSpec.remove(op.path));
        break;
      case "arrayAppend":
        specs.push(MutateInSpec.arrayAppend(op.path, op.value));
        break;
      case "arrayPrepend":
        specs.push(MutateInSpec.arrayPrepend(op.path, op.value));
        break;
    }
  }

  const mutateOptions: MutateInOptions = {
    cas: options.cas as any,
    durabilityLevel: options.durability ? DurabilityLevel[options.durability as keyof typeof DurabilityLevel] : undefined,
    timeout: options.timeout || 7500,
  };

  return await collection.mutateIn(id, specs, mutateOptions) as unknown as MutationResult;
}
```

**Step 3: Verify**

Run: `bun run typecheck 2>&1 | grep "kv-operations.ts" | wc -l`
Expected: Significant reduction

---

### Task 18: Rewrite lookupIn to use LookupInSpec array pattern

**Files:**
- Modify: `src/lib/couchbase/kv-operations.ts:271-301`

**Step 1: Rewrite lookupIn method**

```typescript
static async lookupIn<T extends Record<string, any> = Record<string, any>>(
  collection: Collection,
  id: string,
  paths: string[]
): Promise<T | null> {
  try {
    const specs = paths.map((p) => LookupInSpec.get(p));
    const result = await collection.lookupIn(id, specs);
    const data: Record<string, any> = {};

    paths.forEach((path, index) => {
      try {
        data[path] = result.content(index);
      } catch {
        data[path] = undefined;
      }
    });

    return data as T;
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      return null;
    }
    throw error;
  }
}
```

**Step 2: Verify**

Run: `bun run typecheck 2>&1 | grep "kv-operations.ts" | wc -l`
Expected: Further reduction

---

### Task 19: Fix durability level string-to-enum conversion

**Files:**
- Modify: `src/lib/couchbase/kv-operations.ts:102,126,142`

**Step 1: Create a durability mapping helper at top of file (after imports)**

```typescript
const DURABILITY_MAP: Record<string, DurabilityLevel> = {
  none: DurabilityLevel.None,
  majority: DurabilityLevel.Majority,
  majorityAndPersistToActive: DurabilityLevel.MajorityAndPersistOnMaster,
  persistToMajority: DurabilityLevel.PersistToMajority,
};
```

**Step 2: Replace all durability casts**

Lines 102, 126, 142 — change:
```typescript
durabilityLevel: (options.durability as DurabilityLevel) || undefined,
```
To:
```typescript
durabilityLevel: options.durability ? DURABILITY_MAP[options.durability] : undefined,
```

**Step 3: Verify**

Run: `bun run typecheck 2>&1 | grep "kv-operations.ts" | wc -l`
Expected: 0

---

### Task 20: Fix query-executor.ts enum usage

**Files:**
- Modify: `src/lib/couchbase/query-executor.ts:160,164`

**Step 1: Add imports**

Add to imports:
```typescript
import { QueryScanConsistency, QueryProfileMode } from "couchbase";
```

**Step 2: Fix line 160**

Change:
```typescript
scanConsistency: options.scanConsistency || "request_plus",
```
To:
```typescript
scanConsistency: options.scanConsistency || QueryScanConsistency.RequestPlus,
```

**Step 3: Fix line 164**

Change:
```typescript
profile: options.profile ? "timings" : undefined,
```
To:
```typescript
profile: options.profile ? QueryProfileMode.Timings : undefined,
```

**Step 4: Verify**

Run: `bun run typecheck 2>&1 | grep "query-executor.ts" | wc -l`
Expected: 0

---

### Task 21: Fix connection-options.ts SDK config shapes

**Files:**
- Modify: `src/lib/couchbase/connection-options.ts:52-57,78-86,94-105,147,157`

**Step 1: Add DurabilityLevel import**

```typescript
import { DurabilityLevel, type ConnectOptions } from "couchbase";
```

**Step 2: Remove non-existent `compression` block (lines 52-57)**

The SDK's `ConnectOptions` does NOT have a `compression` property. Remove or comment out:
```typescript
// compression is handled internally by SDK — not configurable via ConnectOptions
```

**Step 3: Fix transactions config (lines 78-86)**

Change:
```typescript
transactions: {
  cleanupConfig: {
    cleanupWindow: 60000,
    cleanupLostAttempts: true,
  },
  durabilityLevel: "majority",
  timeout: 15000,
},
```
To:
```typescript
transactions: {
  cleanupConfig: {
    cleanupWindow: 60000,
    disableLostAttemptCleanup: false,
  },
  durabilityLevel: DurabilityLevel.Majority,
  timeout: 15000,
},
```

**Step 4: Fix security config (lines 94-105)**

The SDK's `SecurityConfig` only has `trustStorePath`. Remove non-existent properties:
```typescript
if (meta.isTls) {
  options.security = {
    trustStorePath: config.trustStorePath,
  };
}
```

**Step 5: Fix validateConnectionOptions (lines 147, 157)**

Line 147 — remove `options.security?.disableCertificateVerification` check (property doesn't exist).
Line 157 — remove `options.compression?.enabled` check (property doesn't exist).

Replace with warnings based on config values instead of options:
```typescript
export function validateConnectionOptions(_options: ConnectOptions, meta: ConnectionStringMeta): string[] {
  const warnings: string[] = [];

  if (meta.isCapella && !meta.isTls) {
    warnings.push("Capella Cloud requires secure connection (couchbases://)");
  }

  return warnings;
}
```

**Step 6: Verify**

Run: `bun run typecheck 2>&1 | grep "connection-options.ts" | wc -l`
Expected: 0

---

### Task 22: Fix transaction-handler.ts API

**Files:**
- Modify: `src/lib/couchbase/transaction-handler.ts:14-22,105-108`

**Step 1: Fix imports (lines 14-22)**

Change `TransactionAttempt` to `TransactionAttemptContext` (SDK uses `TransactionAttemptContext`, not `TransactionAttempt`):
```typescript
import {
  CasMismatchError,
  DocumentExistsError,
  DocumentNotFoundError,
  type TransactionAttemptContext,
  TransactionCommitAmbiguousError,
  type TransactionGetResult,
  Transactions,
} from "couchbase";
```

**Step 2: Fix Transactions.create() (line 105)**

`Transactions` constructor requires a `Cluster` instance. The transaction should be run via the cluster:

Change:
```typescript
const transactions = Transactions.create();
```
To:
```typescript
const { connectionManager } = await import("$lib/couchbase");
const { cluster } = await connectionManager.getConnection();
const transactions = new Transactions(cluster);
```

Or if there's a better pattern using `cluster.transactions()`, check the SDK.

**Step 3: Fix ctx type (line 108)**

Change `TransactionAttempt` to `TransactionAttemptContext`:
```typescript
async (ctx: TransactionAttemptContext) => {
```

**Step 4: Verify**

Run: `bun run typecheck 2>&1 | grep "transaction-handler.ts" | wc -l`
Expected: 0

---

### Task 23: Fix health service files

**Files:**
- Modify: `src/services/health/couchbaseHealth.ts`
- Modify: `src/services/health/comprehensiveHealth.ts`

**Step 1: Read both files and identify exact errors**

Run: `bun run typecheck 2>&1 | grep "couchbaseHealth.ts\|comprehensiveHealth.ts"`

**Step 2: Fix property access patterns**

These files likely access properties that don't exist on the types returned by connection-manager health methods. Align property access with the `HealthStatus` interface from `src/lib/couchbase/types.ts`.

**Step 3: Verify**

Run: `bun run typecheck 2>&1 | grep "couchbaseHealth.ts\|comprehensiveHealth.ts" | wc -l`
Expected: 0

---

### Task 24: Fix remaining source file errors

**Files:**
- Check: `src/models/errors.ts`, `src/models/types.ts`, `src/server/handlers/graphql.ts`, `src/telemetry/instrumentation.ts`, `src/telemetry/coordinator/BatchCoordinator.ts`, `src/telemetry/health/comprehensiveHealth.ts`, `src/utils/bunUtils.ts`, `src/utils/bunUtils.test.ts`

**Step 1: Run typecheck and list remaining source errors**

Run: `bun run typecheck 2>&1 | grep "^src/" | sort -u`

**Step 2: Fix each remaining error**

These are likely cascading errors that resolve once earlier fixes are in place. Fix any remaining ones.

**Step 3: Verify**

Run: `bun run typecheck 2>&1 | grep "^src/" | wc -l`
Expected: 0

---

### Task 25: Phase 3 verification

**Step 1: Run full typecheck**

Run: `bun run typecheck 2>&1 | tail -5`
Expected: Only test file errors remaining

**Step 2: Run tests**

Run: `bun test 2>&1 | tail -10`
Expected: 766+ pass, 0 fail

**Step 3: Commit**

```bash
git add src/lib/couchbase/kv-operations.ts src/lib/couchbase/query-executor.ts src/lib/couchbase/connection-options.ts src/lib/couchbase/transaction-handler.ts src/services/health/couchbaseHealth.ts src/services/health/comprehensiveHealth.ts
git commit -m "fix(couchbase): rewrite SDK operations to match v4.6.1 API — specs, enums, config"
```

---

## Phase 4: Test File Fixes

### Task 26: Fix test-skip-conditions.ts

**Files:**
- Modify: `tests/bun/shared/test-skip-conditions.ts:20,24`

**Step 1: Fix test.skip() calls**

`test.skip()` in Bun requires a test name AND function. Change the skip pattern to use `describe.skip` or throw a skip signal. Read the file to understand the actual pattern and fix accordingly.

Likely fix — use `console.warn` + `return` instead of `test.skip()`:
```typescript
if (!response.ok) {
  console.warn(`Skipping: ${serviceName} unavailable (HTTP ${response.status})`);
  return;
}
```

Or use `test.skip` with proper signature if the calling context supports it.

**Step 2: Verify**

Run: `bun run typecheck 2>&1 | grep "test-skip-conditions.ts" | wc -l`
Expected: 0

---

### Task 27: Fix connection.test.ts mock types

**Files:**
- Modify: `tests/bun/integration/database/connection.test.ts:55-56`

**Step 1: Fix collection access**

The issue is `conn.collection` is a function, not a Collection. Change:
```typescript
expect(typeof conn.collection.get).toBe("function");
expect(typeof conn.collection.upsert).toBe("function");
```
To:
```typescript
const coll = conn.collection();
expect(typeof coll.get).toBe("function");
expect(typeof coll.upsert).toBe("function");
```

Or if `conn.collection` is already the default collection object (not a function), check the actual `getConnection()` return type and adjust.

**Step 2: Verify**

Run: `bun run typecheck 2>&1 | grep "connection.test.ts" | wc -l`
Expected: 0

---

### Task 28: Fix queryCache.test.ts CircuitBreaker types

**Files:**
- Modify: `tests/bun/unit/cache/queryCache.test.ts:535,540,546`

**Step 1: Read the exact error context**

The issue is `cache.get()` returns a type that doesn't match `expect().toEqual()`. This is likely because the generic type parameter isn't specified.

Fix by asserting the return:
```typescript
expect(cache.get("complex-key") as unknown).toEqual(complexObj);
```

Or by properly typing the cache instance with generics.

**Step 2: Verify**

Run: `bun run typecheck 2>&1 | grep "queryCache.test.ts" | wc -l`
Expected: 0

---

### Task 29: Fix result.test.ts null guards

**Files:**
- Modify: `tests/bun/unit/errors/result.test.ts:316,351`

**Step 1: Add non-null assertion or guard**

Line 316 — change:
```typescript
const mapped = mapResult(result, (n) => n * 2);
```
To:
```typescript
const mapped = mapResult(result, (n) => n! * 2);
```

Line 351 — change:
```typescript
return [n * 2, undefined];
```
To:
```typescript
return [n! * 2, undefined];
```

**Step 2: Verify**

Run: `bun run typecheck 2>&1 | grep "result.test.ts" | wc -l`
Expected: 0

---

### Task 30: Fix middleware test mock contexts

**Files:**
- Modify: `tests/bun/unit/middleware/rateLimit.test.ts:8`
- Modify: `tests/bun/unit/middleware/security.test.ts:8`

**Step 1: Add missing required properties to mock context**

In both files, add `headers` and `method` to the mock:
```typescript
function createMockContext(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    requestId: `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    startTime: Date.now(),
    url: new URL("http://localhost:4000/graphql"),
    clientIp: "127.0.0.1",
    headers: new Headers(),
    method: "GET",
    ...overrides,
  };
}
```

**Step 2: Verify**

Run: `bun run typecheck 2>&1 | grep "rateLimit.test.ts\|security.test.ts" | wc -l`
Expected: 0

---

### Task 31: Fix telemetry test types

**Files:**
- Modify: `tests/bun/unit/telemetry/export-stats-tracker.test.ts:275,414`
- Modify: `tests/bun/unit/telemetry/httpMetrics.test.ts:180`
- Modify: `tests/bun/unit/telemetry/processMetrics.test.ts:183,197,359`

**Step 1: Fix export-stats-tracker.test.ts line 275**

The variable `receivedResult` is typed as `ExportResult | null` and initialized to `null`. TypeScript narrows `expect(receivedResult)` to `null`. Add assertion:
```typescript
expect(receivedResult!).toEqual(expectedResult);
```

**Step 2: Fix export-stats-tracker.test.ts line 414**

Change `0` to the proper enum:
```typescript
import { InstrumentType } from "@opentelemetry/sdk-metrics";
// ...
wrapped.selectAggregationTemporality?.(InstrumentType.COUNTER);
```

**Step 3: Fix httpMetrics.test.ts line 180**

The test assigns `undefined` then checks inside `if (statusCode)` — TypeScript knows this is unreachable. Fix the test logic:
```typescript
test("handles undefined status code", () => {
  const statusCode: number | undefined = undefined;
  const labels: Record<string, string> = {};

  if (statusCode !== undefined) {
    labels.status_code = statusCode.toString();
  }

  expect(labels.status_code).toBeUndefined();
});
```

**Step 4: Fix processMetrics.test.ts lines 183,197 — add freedBytes**

Add `freedBytes` to test events:
```typescript
const event = {
  type: "minor" as const,
  durationMs: 5,
  heapBefore: 100000000,
  heapAfter: 80000000,
  freedBytes: 20000000,
  timestamp: Date.now(),
};
```

Same for the "major" event (line 197):
```typescript
freedBytes: 100000000,
```

**Step 5: Fix processMetrics.test.ts line 359 — level comparison**

Change the string literal types to use a typed variable:
```typescript
const previousLevel: string = "normal";
const newLevel: string = "medium";
```

**Step 6: Verify**

Run: `bun run typecheck 2>&1 | grep "tests/" | wc -l`
Expected: 0

---

### Task 32: Final verification

**Step 1: Run full typecheck**

Run: `bun run typecheck 2>&1`
Expected: Exit code 0, no errors

**Step 2: Run full test suite**

Run: `bun test 2>&1 | tail -10`
Expected: 766+ pass, 0 fail

**Step 3: Run biome check**

Run: `bun run biome:check 2>&1`
Expected: No issues

**Step 4: Commit**

```bash
git add tests/
git commit -m "fix(tests): align test types with corrected source interfaces"
```

---

## Critical Files Reference

| File | Phase | Error Count | Key Fix |
|------|-------|------------|---------|
| `src/index.ts` | 1,2 | 26 | globalThis decl, type imports, withMiddleware signature |
| `src/lib/couchbase/kv-operations.ts` | 3 | 17 | mutateIn/lookupIn spec arrays, durability enums |
| `src/lib/systemHealth.ts` | 1 | 11 | Optional chaining on details |
| `src/lib/couchbase/connection-options.ts` | 3 | 5 | Remove non-existent SDK config properties |
| `src/services/health/couchbaseHealth.ts` | 3 | 5 | Property access alignment |
| `src/graphql/types.ts` | 2 | 1+ | Replace couchbaseConnector import |
| `src/lib/couchbase/query-executor.ts` | 3 | 2 | SDK enum values |
| `src/lib/couchbase/transaction-handler.ts` | 3 | 2 | TransactionAttemptContext, Transactions constructor |
