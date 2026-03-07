# CapellaQL Caching Architecture

Comprehensive documentation of all caching layers in CapellaQL, from HTTP-level ETag validation through GraphQL response caching, SQLite entity storage, DataLoader request batching, and the Map-based fallback cache.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Tier 1: GraphQL Yoga Response Cache](#tier-1-graphql-yoga-response-cache)
3. [Tier 2: SQLiteGraphQLCache Adapter](#tier-2-sqlitegraphqlcache-adapter)
4. [Tier 3: Entity-Level SQLite Cache](#tier-3-entity-level-sqlite-cache)
5. [Tier 4: DataLoader Request Batching](#tier-4-dataloader-request-batching)
6. [Fallback: QueryCache Map-based Cache](#fallback-querycache-map-based-cache)
7. [HTTP Caching: ETag Support](#http-caching-etag-support)
8. [Cache Key Generation](#cache-key-generation)
9. [Performance Tracking](#performance-tracking)
10. [Monitoring & Health Endpoints](#monitoring--health-endpoints)
11. [Configuration Reference](#configuration-reference)
12. [Cache Cleanup & Lifecycle](#cache-cleanup--lifecycle)
13. [Debugging & Bypass](#debugging--bypass)
14. [Best Practices](#best-practices)
15. [File Reference](#file-reference)

---

## Architecture Overview

CapellaQL implements a multi-tier caching architecture with four distinct layers plus HTTP-level ETag caching for health endpoints:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Client Request                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴──────────┐
                    │                    │
                    ▼                    ▼
┌──────────────────────────┐ ┌──────────────────────────────────┐
│   HTTP ETag Layer        │ │   GraphQL Endpoint (/graphql)    │
│   (health endpoints)     │ │                                  │
│   304 Not Modified       │ └──────────────────────────────────┘
│   Cache-Control: 5s      │                │
└──────────────────────────┘                ▼
                          ┌──────────────────────────────────────┐
                          │  Tier 1: GraphQL Yoga Response Cache │
                          │  useResponseCache plugin             │
                          │  Per-operation TTLs, session-aware   │
                          │  x-yoga-cache: HIT header            │
                          └──────────────────────────────────────┘
                                            │
                                            ▼
                          ┌──────────────────────────────────────┐
                          │  Tier 2: SQLiteGraphQLCache Adapter  │
                          │  gql_response: key prefix            │
                          │  100MB / 5-min cleanup               │
                          └──────────────────────────────────────┘
                                            │
                                            ▼
                          ┌──────────────────────────────────────┐
                          │  withPerformanceTracking Wrapper     │
                          │  Records duration, emits OTel        │
                          └──────────────────────────────────────┘
                                            │
                                            ▼
                          ┌──────────────────────────────────────┐
                          │  Tier 3: Entity-Level SQLite Cache   │
                          │  Per-resolver entity caching         │
                          │  50MB / 1-min cleanup                │
                          │  Cross-query entity reuse            │
                          └──────────────────────────────────────┘
                                            │
                                            ▼
                          ┌──────────────────────────────────────┐
                          │  Tier 4: DataLoader Request Batching │
                          │  Per-request, collection-grouped     │
                          │  maxBatchSize: 100                   │
                          └──────────────────────────────────────┘
                                            │
                                            ▼
                          ┌──────────────────────────────────────┐
                          │          Couchbase Database           │
                          │  Primary data source (cache miss)    │
                          └──────────────────────────────────────┘
```

### Summary Table

| Tier | Scope | Storage | Typical TTL | Source File |
|------|-------|---------|-------------|-------------|
| HTTP ETag | Health endpoints | Client-side | 5 seconds (`max-age=5`) | `src/utils/etag.ts` |
| Tier 1: Yoga Response Cache | Full GraphQL responses | In-memory (plugin) + SQLite adapter | 2-15 min per operation | `src/server/handlers/graphql.ts` |
| Tier 2: SQLiteGraphQLCache | Response cache backing store | SQLite `:memory:` | Config-driven (default 15 min) | `src/lib/graphqlResponseCache.ts` |
| Tier 3: Entity SQLite Cache | Individual entities per resolver | SQLite `:memory:` | 5-10 min | `src/lib/bunSQLiteCache.ts` |
| Tier 4: DataLoader | Document batching per request | JavaScript Map (per-request) | Request-scoped (no TTL) | `src/lib/couchbase/data-loader.ts` |
| Fallback: QueryCache | Non-Bun environments | JavaScript Map | 5 min (30 min stale) | `src/lib/queryCache.ts` |

---

## Tier 1: GraphQL Yoga Response Cache

**Source**: `src/server/handlers/graphql.ts` (lines 26-131)

The first caching tier operates at the GraphQL Yoga plugin level using `@graphql-yoga/plugin-response-cache`. It caches entire GraphQL responses keyed by operation, variables, and session.

### CACHE_TTL Configuration

Defined at the top of the handler file:

```typescript
const CACHE_TTL = {
  default: config.application.YOGA_RESPONSE_CACHE_TTL, // 15 min from config
  looks: 10 * 60 * 1000,                               // 10 min
  lookDetails: 10 * 60 * 1000,                          // 10 min
  looksSummary: 10 * 60 * 1000,                          // 10 min
  optionsSummary: 5 * 60 * 1000,                         // 5 min
  optionsProductView: 5 * 60 * 1000,                     // 5 min
  getAllSeasonalAssignments: 5 * 60 * 1000,               // 5 min
  getDivisionAssignment: 5 * 60 * 1000,                   // 5 min
  imageDetails: 15 * 60 * 1000,                           // 15 min
  searchDocuments: 2 * 60 * 1000,                         // 2 min
};
```

### Per-Operation TTL Table

| Schema Coordinate | TTL | Rationale |
|-------------------|-----|-----------|
| `Query.looks` | 10 min | Looks data changes infrequently |
| `Query.lookDetails` | 10 min | Looks data changes infrequently |
| `Query.looksSummary` | 10 min | Looks data changes infrequently |
| `Query.optionsSummary` | 5 min | Options change moderately |
| `Query.optionsProductView` | 5 min | Options change moderately |
| `Query.getAllSeasonalAssignments` | 5 min | Assignments change infrequently |
| `Query.getDivisionAssignment` | 5 min | Assignments change infrequently |
| `Query.imageDetails` | 15 min | Static image data |
| `Query.searchDocuments` | 2 min | Dynamic search results |
| `__Schema`, `__Type`, `__Field`, `__InputValue`, `__EnumValue`, `__Directive` | 1 hour | Introspection types (dev tools) |
| All other queries | 15 min | Default from `YOGA_RESPONSE_CACHE_TTL` |

### Plugin Configuration

```typescript
useResponseCache({
  enabled: (request) => {
    const noCache = request.headers.get("x-no-cache");
    const cacheControl = request.headers.get("cache-control");
    if (noCache === "true" || cacheControl?.includes("no-cache")) {
      return false;
    }
    return true;
  },
  session: (request) => {
    const authHeader = request.headers.get("authorization");
    return authHeader || null; // null = global cache
  },
  ttl: CACHE_TTL.default,
  ttlPerSchemaCoordinate: { /* per-operation TTLs */ },
  invalidateViaMutation: true,
  includeExtensionMetadata: config.runtime.NODE_ENV === "development",
})
```

### Key Behaviors

- **Cache bypass**: Send `x-no-cache: true` or `Cache-Control: no-cache` to skip the response cache
- **Session-based caching**: The `Authorization` header value is used as the session key. Authenticated requests are cached separately per user token. Unauthenticated requests share a global cache.
- **Mutation invalidation**: `invalidateViaMutation: true` automatically purges cached responses when mutations return affected entities
- **Response header**: Cached responses include `x-yoga-cache: HIT`
- **Extension metadata**: In development mode, cache metadata is included in the GraphQL response extensions
- **Cache hit logging**: A plugin logs `"Cache HIT"` for each response served from cache

---

## Tier 2: SQLiteGraphQLCache Adapter

**Source**: `src/lib/graphqlResponseCache.ts`

The `SQLiteGraphQLCache` class wraps a dedicated `BunSQLiteCache` instance to serve as the backing store for the Yoga response cache plugin. It implements the `Cache` interface (`get`, `set`, `delete`).

### Configuration

This adapter creates its **own** `BunSQLiteCache` instance, separate from the default entity cache singleton:

| Setting | SQLiteGraphQLCache (Response) | Default `bunSQLiteCache` (Entity) |
|---------|-------------------------------|-----------------------------------|
| `maxMemoryMB` | 100 MB | 50 MB |
| `defaultTtlMs` | `config.application.YOGA_RESPONSE_CACHE_TTL` (default 900,000ms / 15 min) | 300,000ms (5 min) |
| `cleanupIntervalMs` | 300,000ms (5 min) | 60,000ms (1 min) |
| `maxEntries` | 10,000 | 10,000 |
| `compressionThreshold` | 1,024 bytes (1 KB) | 1,024 bytes (1 KB) |
| Key prefix | `gql_response:` | None |

### Helper Functions

| Function | Purpose |
|----------|---------|
| `buildGraphQLCacheKey(data)` | Creates a deterministic string key from `operationName`, `source` (first 200 chars), and sorted `variableValues` |
| `shouldCacheOperation(name, source)` | Returns `false` for mutations and `IntrospectionQuery`/`__schema` queries |
| `getOperationTTL(operationName)` | Returns TTL in **seconds** for known operations (looks: 300s, optionsSummary: 180s, imageDetails: 600s, searchDocuments: 120s, assignments: 300s; default: 300s) |
| `getSessionId()` | Currently returns `null` (global caching); placeholder for future user-specific cache partitioning |

### Singleton

A global instance is exported as `sqliteGraphQLCache`:

```typescript
export const sqliteGraphQLCache = new SQLiteGraphQLCache();
```

---

## Tier 3: Entity-Level SQLite Cache

**Source**: `src/lib/bunSQLiteCache.ts`

The entity-level cache stores individual records (entities) in an in-memory SQLite database using Bun's native `bun:sqlite`. This enables cross-query entity reuse: an entity cached by one resolver can be returned by another without hitting Couchbase.

This tier uses the **default `bunSQLiteCache` singleton** (50 MB, 1-min cleanup, 5-min TTL). See the comparison table in [Tier 2](#configuration) for differences from the response cache instance.

### Core Class: `BunSQLiteCache`

```typescript
interface BunSQLiteCacheConfig {
  maxMemoryMB: number;          // Default: 50MB
  defaultTtlMs: number;         // Default: 5 minutes (300,000ms)
  cleanupIntervalMs: number;    // Default: 1 minute (60,000ms)
  maxEntries: number;           // Default: 10,000
  compressionThreshold: number; // Default: 1KB
}
```

### SQLite Table Schema

```sql
CREATE TABLE cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  hit_count INTEGER DEFAULT 0,
  last_accessed INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT 0,
  size INTEGER DEFAULT 0
) WITHOUT ROWID;

CREATE INDEX idx_expires_at ON cache(expires_at);
CREATE INDEX idx_last_accessed ON cache(last_accessed);
CREATE INDEX idx_hit_count ON cache(hit_count DESC);
```

### Key Features

1. **Prepared Statements**: All queries use prepared statements for maximum performance
2. **Automatic Cleanup**: Expired entries purged on configurable interval
3. **LRU Eviction**: When memory or entry count limits are reached, entries are evicted by `last_accessed ASC, hit_count ASC`
4. **Memory Management**: Automatic eviction when `maxMemoryMB` is exceeded
5. **Hit Tracking**: Each entry tracks `hit_count` and `last_accessed` timestamp

### Usage Pattern

```typescript
import { withSQLiteCache, SQLiteCacheKeys } from "$lib/bunSQLiteCache";

const result = await withSQLiteCache(
  SQLiteCacheKeys.looks(brand, season, division),
  async () => {
    return await cluster.query(...);
  },
  5 * 60 * 1000 // 5-minute TTL
);
```

### Entity Caching Functions

**`cacheEntities(data, keyExtractor, options)`**: Fire-and-forget cache population. Uses `setImmediate` to avoid blocking the response.

```typescript
cacheEntities(data, (item) => SQLiteCacheKeys.entityLook(item.documentKey), {
  requiredFields: ['documentKey'],
  ttlMs: 10 * 60 * 1000,
  userScoped: false,
});
```

**`getEntity<T>(baseKey, options?)`**: Retrieve a cached entity with optional user scoping.

```typescript
const cached = await getEntity<LookType>(SQLiteCacheKeys.entityLook(documentKey));
```

### Entity Cache Key Table

| Key Generator | Pattern | Usage |
|--------------|---------|-------|
| `entityLook(documentKey)` | `entity:look:{documentKey}` | Individual look records |
| `entityImage(div, season, style)` | `entity:image:{div}:{season}:{style}` | Image details |
| `entityDivisionAssignment(season, company, div)` | `entity:divAssign:{season}:{company}:{div}` | Division assignments |
| `entityDocument(bucket, scope, collection, id)` | `entity:doc:{bucket}:{scope}:{collection}:{id}` | Generic documents |

### Resolver Implementation Example

```typescript
const getDivisionAssignmentResolver = withValidation(
  GetDivisionAssignmentArgsSchema,
  async (_: unknown, args: GetDivisionAssignmentArgs, context: GraphQLContext) => {
    const { styleSeasonCode, companyCode, divisionCode } = args;

    // 1. Check entity cache first
    const entityKey = SQLiteCacheKeys.entityDivisionAssignment(
      styleSeasonCode, companyCode, divisionCode
    );
    const cached = await getEntity<any>(entityKey, {
      userScoped: true,
      userId: context.user?.id,
    });
    if (cached) return cached;

    // 2. Cache miss - fetch with query-level caching
    return await withSQLiteCache(entityKey, async () => {
      const result = await cluster.query(...);
      const data = result.rows[0][0];

      // 3. Cache as entity for future reuse
      cacheEntities(data, () => entityKey, {
        requiredFields: ['styleSeasonCode', 'companyCode'],
        ttlMs: 5 * 60 * 1000,
        userScoped: true,
        userId: context.user?.id,
      });

      return data;
    }, 5 * 60 * 1000);
  }
);
```

---

## Tier 4: DataLoader Request Batching

**Source**: `src/lib/couchbase/data-loader.ts`, `src/graphql/context.ts`

DataLoader provides per-request document batching and deduplication. A new `DataLoader` instance is created for each GraphQL request in `contextFactory()`.

### How It Works

1. **Per-request creation**: `contextFactory()` calls `createDocumentDataLoader()` for every incoming request
2. **Key grouping**: Keys are grouped by `{bucket}.{scope}.{collection}` for parallel execution
3. **Batch execution**: All document `get()` calls within the same tick are batched together
4. **Request-scoped caching**: Results are cached within the request's lifetime — no TTL, no eviction, garbage collected after the request completes

### Configuration

```typescript
new DataLoader(batchGetDocuments, {
  cache: true,            // Cache results within this request
  maxBatchSize: 100,      // Maximum keys per batch
  batchScheduleFn: (callback) => process.nextTick(callback), // Immediate batching
});
```

### Context Factory

```typescript
// src/graphql/context.ts
export function contextFactory({ request }: { request: Request }): GraphQLContext {
  const dataLoader = createDocumentDataLoader(); // New instance per request
  return {
    requestId: ulid(),
    dataLoader,
    // ...
  };
}
```

### Key Characteristics

- **No cross-request caching**: Each request gets a fresh DataLoader. Entities fetched in request A are not available to request B via DataLoader.
- **Deduplication**: If the same document key is requested multiple times within a single request, it is fetched only once.
- **Parallel collection execution**: Keys targeting different collections are fetched in parallel via `Promise.all`.
- **Error isolation**: Per-key error handling with specific Couchbase error classification (DocumentNotFoundError, AuthenticationFailureError, AmbiguousTimeoutError, etc.).

---

## Fallback: QueryCache Map-based Cache

**Source**: `src/lib/queryCache.ts`

A `Map`-based LRU cache with stale-while-revalidate semantics. Used as a fallback when `BunSQLiteCache` is unavailable (non-Bun environments).

### Configuration

```typescript
const defaultConfig: CacheConfig = {
  defaultTtl: 5 * 60 * 1000,       // 5 minutes
  maxSize: 1000,                     // 1,000 entries
  maxMemory: 10 * 1024 * 1024,      // 10 MB
  cleanupInterval: 60 * 1000,       // 1 minute
  staleTolerance: 30 * 60 * 1000,   // 30 minutes
};
```

### Stale-While-Revalidate Pattern

When a primary cache entry expires:
1. The expired entry is moved to a **stale cache** via `moveToStale()`
2. The fetcher function is called for fresh data
3. If the fetcher **fails**, `getStale()` returns the stale entry (if within the 30-minute tolerance window)
4. `stats.staleHits` tracks how often stale data is served

### Exports

| Export | Type | Purpose |
|--------|------|---------|
| `defaultQueryCache` | `QueryCache` | Singleton instance |
| `withCache(key, fetcher, ttl?)` | Function | Get-or-set helper |
| `CacheKeys` | Object | Predefined key generators for common operations |

### When Used

The `QueryCache` is the fallback for environments where `BunSQLiteCache` cannot initialize (Bun runtime not detected). In standard Bun deployments, the SQLite cache is preferred. Both caches are instantiated, and the `/health/cache` endpoint reports stats for both.

---

## HTTP Caching: ETag Support

**Source**: `src/utils/etag.ts`, `src/server/handlers/health.ts`

Health endpoints use HTTP ETag caching for efficient conditional requests.

### Functions

| Function | Purpose |
|----------|---------|
| `generateETag(body)` | SHA-256 weak ETag: `W/"<first 16 hex chars>"` using `Bun.CryptoHasher` |
| `isETagMatch(request, etag)` | Checks `If-None-Match` header against current ETag (supports multiple tags and `*`) |
| `jsonResponseWithETag(request, data, maxAge?, status?)` | Returns JSON with `ETag` + `Cache-Control: public, max-age={maxAge}` headers, or `304 Not Modified` if ETag matches |

### Endpoint Coverage

| Endpoint | Caching Strategy |
|----------|-----------------|
| `/health` | `jsonResponseWithETag` (ETag + `max-age=5`) |
| `/health/telemetry` | `jsonResponseWithETag` (ETag + `max-age=5`) |
| `/health/system` | `jsonResponseWithETag` (ETag + `max-age=5`) |
| `/health/performance` | `jsonResponseWithETag` (ETag + `max-age=5`) |
| `/health/cache` | `jsonResponseWithETag` (ETag + `max-age=5`) |
| `/health/comprehensive` | `jsonResponseWithETag` (ETag + `max-age=5`) |
| `/health/status` | `Cache-Control: no-cache, no-store, must-revalidate` (no caching) |
| `/health/ready` | `Cache-Control: no-cache, no-store, must-revalidate` (no caching) |
| `/health/live` | `Cache-Control: no-cache, no-store, must-revalidate` (no caching) |
| `/health/summary` | No cache headers (plain JSON) |
| `/health/performance/history` | No cache headers (plain JSON) |
| `/health/telemetry/detailed` | No cache headers (plain JSON) |

---

## Cache Key Generation

### Query Fingerprinting

**Source**: `src/lib/queryFingerprint.ts`

The `QueryFingerprintBuilder` uses Bun's SIMD-accelerated hashing for fast, collision-resistant cache key generation.

### Fluent API Usage

```typescript
import { QueryFingerprintBuilder } from "$lib/queryFingerprint";

const cacheKey = QueryFingerprintBuilder
  .for("getDivisionAssignment")
  .withVariables({ styleSeasonCode, companyCode, divisionCode })
  .withUser(context.user?.id)
  .withTimeBucket("hour")
  .withPrefix("gql")
  .build();
```

### Key Generation Functions

| Function | Purpose | Example Output |
|----------|---------|----------------|
| `generateHashedKey(input)` | SIMD-accelerated hashing via `Bun.hash()` | `"a7c3f8e2b1d9"` |
| `generateOperationKey(op, vars)` | Operation + variables hash | `"hash-of-op-and-vars"` |
| `createQueryFingerprint(name, vars, opts)` | Full fingerprint | `"prefix:hash"` |
| `createPersistedQueryId(query)` | Normalized query hash | `"query-hash"` |

### Predefined Cache Keys (SQLiteCacheKeys)

```typescript
SQLiteCacheKeys.looks(brand, season, division)
// → "looks:TH:F25:01"

SQLiteCacheKeys.options(lookId, filters)
// → "options:LOOK123:hashOfFilters" (uses Bun.hash for complex filters)

SQLiteCacheKeys.optionsSummary(salesOrg, season, div, active, channels)
// → "hashOfAllParams" (hashed for consistency with arrays)
```

---

## Performance Tracking

### Overview

Every GraphQL resolver is wrapped with `withPerformanceTracking` to capture execution metrics.

**Source**: `src/lib/graphqlPerformanceTracker.ts`

### Metrics Collected

| Metric | Type | Description |
|--------|------|-------------|
| `graphql_resolver_duration_ms` | Histogram | Execution time per resolver |
| `graphql_resolver_calls_total` | Counter | Total calls per resolver |
| `graphql_resolver_errors_total` | Counter | Error count per resolver |

### In-Memory Performance Data

Recent operations are stored in memory (max 100 entries) for analysis:

```typescript
interface GraphQLPerformanceData {
  operationName: string;
  fieldName: string;
  duration: number;      // milliseconds
  success: boolean;
  error?: string;
  timestamp: number;     // Date.now()
}
```

### Source Detection

Cache vs database source is inferred from timing:

```typescript
source: op.duration < 10 ? "cache" : "database"
```

### Performance Characteristics

| Operation | Typical Timing |
|-----------|---------------|
| Database fetch | 100-500ms |
| SQLite cache hit | 0-5ms |
| Cache key generation | <1ms |
| Entity cache lookup | 1-3ms |

---

## Monitoring & Health Endpoints

### `/health/graphql` Endpoint

Provides per-resolver performance metrics with cache hit/miss analysis.

**Example Response:**

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "summary": {
    "totalOperations": 15,
    "averageDuration": 125.3,
    "errorRate": 0,
    "slowOperations": 0
  },
  "resolvers": [
    {
      "resolver": "Query.looks",
      "count": 5,
      "cacheHits": 3,
      "dbFetches": 2,
      "cacheHitRate": "60.0",
      "avgDurationMs": "127.40",
      "minDurationMs": 0,
      "maxDurationMs": 373,
      "p50DurationMs": 2,
      "p95DurationMs": 373
    }
  ],
  "recentOperations": [...],
  "insights": {
    "cacheEffectiveness": 1,
    "slowResolvers": [],
    "fastestResolver": "Query.looks",
    "slowestResolver": "Query.looks"
  }
}
```

### `/health/cache` Endpoint

Reports stats for **both** cache instances (SQLite entity cache and Map-based fallback) with a `preferredCache` indicator:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "sqlite": {
    "size": 42,
    "hits": 156,
    "misses": 23,
    "evictions": 0,
    "memoryUsage": 125000,
    "hitRate": 87.15,
    "avgHitsPerEntry": 3.71,
    "enabled": true,
    "analytics": {
      "topKeys": [...],
      "expirationDistribution": {...},
      "memoryDistribution": {...}
    }
  },
  "mapCache": {
    "hits": 0,
    "misses": 0,
    "size": 0,
    "hitRate": 0
  },
  "comparison": {
    "totalHits": 156,
    "totalMisses": 23,
    "totalMemoryMB": 0.12,
    "preferredCache": "sqlite"
  }
}
```

The `preferredCache` field indicates which cache backend is active: `"sqlite"` when Bun is detected, `"map"` otherwise.

---

## Configuration Reference

All cache-related configuration settings in one place.

### Environment-Configurable Settings

| Setting | Env Var | Zod Validation | Default | Source |
|---------|---------|----------------|---------|--------|
| Yoga Response Cache TTL | `YOGA_RESPONSE_CACHE_TTL` | `number`, min 0, max 3,600,000 | 900,000ms (15 min) | `src/config/defaults.ts` |

### Constructor Defaults: BunSQLiteCache Instances

| Setting | Entity Cache (default singleton) | Response Cache (SQLiteGraphQLCache) |
|---------|----------------------------------|-------------------------------------|
| `maxMemoryMB` | 50 | 100 |
| `defaultTtlMs` | 300,000 (5 min) | `YOGA_RESPONSE_CACHE_TTL` (900,000 / 15 min) |
| `cleanupIntervalMs` | 60,000 (1 min) | 300,000 (5 min) |
| `maxEntries` | 10,000 | 10,000 |
| `compressionThreshold` | 1,024 bytes | 1,024 bytes |
| Source file | `src/lib/bunSQLiteCache.ts:700` | `src/lib/graphqlResponseCache.ts:16-22` |

### Constructor Defaults: QueryCache (Map-based)

| Setting | Default |
|---------|---------|
| `defaultTtl` | 300,000ms (5 min) |
| `maxSize` | 1,000 entries |
| `maxMemory` | 10 MB |
| `cleanupInterval` | 60,000ms (1 min) |
| `staleTolerance` | 1,800,000ms (30 min) |

### Per-Operation TTLs (Yoga Response Cache)

| Operation | `CACHE_TTL` value | `getOperationTTL()` value |
|-----------|-------------------|---------------------------|
| looks / lookDetails / looksSummary | 600,000ms (10 min) | 300s (5 min) |
| optionsSummary / optionsProductView | 300,000ms (5 min) | 180s (3 min) |
| getAllSeasonalAssignments / getDivisionAssignment | 300,000ms (5 min) | 300s (5 min) |
| imageDetails | 900,000ms (15 min) | 600s (10 min) |
| searchDocuments | 120,000ms (2 min) | 120s (2 min) |
| Introspection types (`__Schema` etc.) | 3,600,000ms (1 hr) | N/A |

> **Note**: `CACHE_TTL` (in `graphql.ts`) uses milliseconds for the Yoga plugin. `getOperationTTL()` (in `graphqlResponseCache.ts`) returns seconds for the SQLite adapter layer. Only `YOGA_RESPONSE_CACHE_TTL` is configurable via environment variable; all other TTLs are hardcoded.

---

## Cache Cleanup & Lifecycle

### Cleanup Intervals

| Cache Instance | Cleanup Interval | What It Does |
|----------------|-----------------|--------------|
| Entity cache (`bunSQLiteCache` singleton) | Every 1 minute | Deletes rows where `expires_at <= now` |
| Response cache (`SQLiteGraphQLCache`) | Every 5 minutes | Deletes rows where `expires_at <= now` |
| QueryCache (`defaultQueryCache`) | Every 1 minute | Moves expired entries to stale cache; purges expired stale entries |

### Cleanup Log Format

When entries are cleaned, the entity cache logs:

```
"SQLite cache cleanup completed" { cleaned: <n>, remaining: <n>, cacheOperation: "cleanup" }
```

**Interpreting the logs**: If you see `cleaned: 3972, remaining: 0`, it means 3,972 entries expired and were purged in that cleanup cycle, with zero entries left. This is normal behavior during low-traffic periods or after a TTL window expires — cached entries drain down to zero when no new requests repopulate them.

### Eviction Strategy

When capacity limits are reached during a `set()` operation:

1. **Expired entries first**: `DELETE FROM cache WHERE expires_at <= ?`
2. **LRU eviction**: If still over limit, evict in batches of 10% of `maxEntries`, ordered by `last_accessed ASC, hit_count ASC`
3. **Memory pressure eviction**: If `totalSize + newEntrySize > maxMemoryBytes`, evict LRU entries until enough space is freed (with 10% buffer)

### Shutdown

Calling `destroy()` on either cache:
- **BunSQLiteCache**: Stops the cleanup `setInterval` timer, closes the SQLite database
- **QueryCache**: Stops the cleanup timer, calls `clear()` on all internal Maps

---

## Debugging & Bypass

### Bypass Headers (Request)

| Header | Value | Effect |
|--------|-------|--------|
| `x-no-cache` | `true` | Disables Yoga response cache for this request |
| `Cache-Control` | `no-cache` | Disables Yoga response cache for this request |
| `If-None-Match` | ETag value | Triggers 304 Not Modified for health endpoints (if ETag matches) |

### Response Headers

| Header | Value | Meaning |
|--------|-------|---------|
| `x-yoga-cache` | `HIT` | Response was served from Yoga response cache |
| `ETag` | `W/"<hash>"` | Weak ETag for conditional requests (health endpoints) |
| `Cache-Control` | `public, max-age=5` | Client-side caching for health endpoints |

### Debugging Commands

```bash
# Check GraphQL resolver cache hit rates
curl -sf http://localhost:4000/health/graphql | jq '.resolvers[] | {resolver, cacheHitRate}'

# View cache stats (both SQLite and Map)
curl -sf http://localhost:4000/health/cache | jq '.'

# View top cached keys
curl -sf http://localhost:4000/health/cache | jq '.sqlite.analytics.topKeys'

# Force cache bypass for a GraphQL query
curl -sf http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -H "x-no-cache: true" \
  -d '{"query":"{ looks(brand:\"TH\", season:\"F25\", division:\"01\") { documentKey } }"}'

# Test ETag 304 response on health endpoint
ETAG=$(curl -si http://localhost:4000/health | grep -i etag | awk '{print $2}' | tr -d '\r')
curl -si http://localhost:4000/health -H "If-None-Match: $ETAG" | head -1
# Expected: HTTP/1.1 304 Not Modified

# View recent operations timing
curl -sf http://localhost:4000/health/graphql | jq '.recentOperations[-5:]'
```

---

## Best Practices

### 1. Use Entity Caching for Cross-Query Reuse

```typescript
const entityKey = SQLiteCacheKeys.entityLook(documentKey);
const cached = await getEntity<LookType>(entityKey);
if (cached) return cached;

return await withSQLiteCache(entityKey, async () => {
  const data = await fetchFromDb();
  cacheEntities(data, keyExtractor, options);
  return data;
}, ttl);
```

### 2. Choose Appropriate TTLs

| Data Type | Recommended TTL | Rationale |
|-----------|----------------|-----------|
| Static reference data | 30-60 minutes | Rarely changes |
| User-specific data | 5 minutes | Balance freshness vs performance |
| Frequently updated data | 1-2 minutes | Minimize stale data |
| Session-bound data | 5-10 minutes | User scoped with reasonable freshness |

### 3. Use User-Scoped Caching When Appropriate

```typescript
cacheEntities(data, keyExtractor, {
  userScoped: true,
  userId: context.user?.id,
  // Creates keys like: "user:123:entity:look:LOOK_001"
});
```

### 4. Validate Required Fields

```typescript
cacheEntities(data, keyExtractor, {
  requiredFields: ['documentKey', 'title'],
});
```

### 5. Monitor Cache Performance

```bash
curl -sf http://localhost:4000/health/graphql | jq '.resolvers[] | {resolver, cacheHitRate}'
curl -sf http://localhost:4000/health/graphql | jq '.recentOperations[-5:]'
```

### 6. Log Cache Operations

The cache system logs all operations:
- Cache hits: `"SQLite cache hit"` with key, hit count, age
- Cache sets: `"SQLite cache set"` with key, size, TTL
- Evictions: `"SQLite cache LRU eviction"` with count
- Entity population: `"Entity cache populated"` with count

### 7. Understand the Cache Hierarchy

Don't duplicate caching across tiers. The Yoga response cache (Tier 1) caches entire GraphQL responses. If Tier 1 returns a HIT, Tiers 2-4 are never invoked for that request. Entity caching (Tier 3) is for cross-query reuse at the resolver level. DataLoader (Tier 4) deduplicates within a single request. Each tier serves a different purpose.

### 8. Configure TTLs Per Operation Type

Use `ttlPerSchemaCoordinate` in the Yoga plugin for response-level TTLs and `withSQLiteCache()` TTL parameter for entity-level TTLs. Static data (images) should have longer TTLs; dynamic data (search) should have shorter ones.

### 9. Monitor the Dual-Instance Setup

The `/health/cache` endpoint reports the default entity cache singleton stats. The response cache (Tier 2) is a separate SQLiteGraphQLCache instance. Be aware that the health endpoint's `sqlite` section reflects only the entity cache, not the response cache.

---

## File Reference

| File | Purpose |
|------|---------|
| `src/server/handlers/graphql.ts` | Yoga response cache plugin configuration, CACHE_TTL definitions |
| `src/lib/graphqlResponseCache.ts` | SQLiteGraphQLCache adapter wrapping BunSQLiteCache for Yoga |
| `src/lib/bunSQLiteCache.ts` | SQLite cache implementation, entity caching, key generation |
| `src/lib/queryCache.ts` | Map-based LRU cache with stale-while-revalidate (fallback) |
| `src/lib/couchbase/data-loader.ts` | DataLoader batch function and factory |
| `src/graphql/context.ts` | Per-request DataLoader creation in contextFactory |
| `src/utils/etag.ts` | ETag generation, matching, and jsonResponseWithETag helper |
| `src/server/handlers/health.ts` | Health check endpoints using ETag caching |
| `src/lib/queryFingerprint.ts` | Cache key generation utilities |
| `src/lib/graphqlPerformanceTracker.ts` | Performance tracking wrapper |
| `src/config/defaults.ts` | Default YOGA_RESPONSE_CACHE_TTL value (900,000ms) |
| `src/config/schemas.ts` | Zod validation for YOGA_RESPONSE_CACHE_TTL (0-3,600,000) |
| `src/config/envMapping.ts` | Environment variable mapping for YOGA_RESPONSE_CACHE_TTL |
| `src/graphql/resolvers/*.ts` | Resolver implementations using entity caching |
