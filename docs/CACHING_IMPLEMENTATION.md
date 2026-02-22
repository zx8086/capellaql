# CapellaQL Caching Implementation Guide

This document provides a comprehensive overview of the caching architecture, implementation details, and performance tracking system in CapellaQL.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Two-Tier Cache System](#two-tier-cache-system)
3. [SQLite Cache Implementation](#sqlite-cache-implementation)
4. [Entity-Level Caching](#entity-level-caching)
5. [Cache Key Generation](#cache-key-generation)
6. [Performance Tracking](#performance-tracking)
7. [Monitoring & Health Endpoints](#monitoring--health-endpoints)
8. [Best Practices](#best-practices)

---

## Architecture Overview

CapellaQL implements a sophisticated two-tier caching system designed for high-performance GraphQL operations:

```
┌─────────────────────────────────────────────────────────────────┐
│                    GraphQL Request                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              GraphQL Yoga Response Cache (HTTP Level)           │
│         - ETag-based HTTP caching for identical queries         │
│         - Automatic cache invalidation                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│               withPerformanceTracking Wrapper                   │
│         - Records execution time for every resolver call        │
│         - Emits OpenTelemetry histogram metrics                 │
│         - Stores recent operations for analysis                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│               Entity-Level SQLite Cache                         │
│         - Individual entity caching per resolver                │
│         - Cross-query entity reuse                              │
│         - Fire-and-forget cache population                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Couchbase Database                          │
│         - Primary data source (only on cache miss)              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Two-Tier Cache System

### Tier 1: GraphQL Yoga Response Cache

The first tier operates at the HTTP level using GraphQL Yoga's built-in response cache:

- **ETag-based validation**: Clients can use `If-None-Match` headers
- **Automatic cache invalidation**: Based on mutation operations
- **Response-level caching**: Caches entire GraphQL responses

**Location**: Configured in GraphQL Yoga server setup

### Tier 2: Entity-Level SQLite Cache

The second tier operates at the resolver level using Bun's native SQLite:

- **Entity-level granularity**: Individual records are cached
- **Cross-query reuse**: Entities cached by one query can be reused by others
- **Fire-and-forget**: Cache population doesn't block responses

**Location**: `src/lib/bunSQLiteCache.ts`

---

## SQLite Cache Implementation

### Core Class: `BunSQLiteCache`

The cache uses Bun's native SQLite database for high-performance key-value storage.

**Configuration options:**

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

-- Performance indexes
CREATE INDEX idx_expires_at ON cache(expires_at);
CREATE INDEX idx_last_accessed ON cache(last_accessed);
CREATE INDEX idx_hit_count ON cache(hit_count DESC);
```

### Key Features

1. **Prepared Statements**: All queries use prepared statements for maximum performance
2. **Automatic Cleanup**: Expired entries are cleaned up every minute
3. **LRU Eviction**: When memory limits are reached, least-recently-used entries are evicted
4. **Memory Management**: Automatic eviction when `maxMemoryMB` is exceeded
5. **Hit Tracking**: Each cache entry tracks hit count and last access time

### Usage Pattern

```typescript
import { withSQLiteCache, SQLiteCacheKeys } from "$lib/bunSQLiteCache";

// Basic usage with helper function
const result = await withSQLiteCache(
  SQLiteCacheKeys.looks(brand, season, division),
  async () => {
    // Fetch from database
    return await cluster.query(...);
  },
  5 * 60 * 1000 // 5-minute TTL
);
```

---

## Entity-Level Caching

### Concept

Entity-level caching stores individual records (entities) separately from query results, enabling cache reuse across different queries that access the same data.

### Implementation

**Location**: `src/lib/bunSQLiteCache.ts` - `cacheEntities()` and `getEntity()` functions

```typescript
// Cache entities from a query result
cacheEntities(
  data,                                    // Array or single entity
  (item) => SQLiteCacheKeys.entityLook(item.documentKey),  // Key extractor
  {
    requiredFields: ['documentKey'],       // Fields that must exist
    ttlMs: 10 * 60 * 1000,                // 10-minute TTL
    userScoped: false,                     // User-specific caching
  }
);

// Retrieve a cached entity
const cached = await getEntity<LookType>(
  SQLiteCacheKeys.entityLook(documentKey)
);
```

### Entity Cache Keys

Predefined entity cache key generators:

| Key Generator | Pattern | Usage |
|--------------|---------|-------|
| `entityLook(documentKey)` | `entity:look:{documentKey}` | Individual look records |
| `entityImage(div, season, style)` | `entity:image:{div}:{season}:{style}` | Image details |
| `entityDivisionAssignment(season, company, div)` | `entity:divAssign:{season}:{company}:{div}` | Division assignments |
| `entityDocument(bucket, scope, collection, id)` | `entity:doc:{bucket}:{scope}:{collection}:{id}` | Generic documents |

### Resolver Implementation Example

```typescript
// src/graphql/resolvers/getDivisionalAssignment.ts
const getDivisionAssignmentResolver = withValidation(
  GetDivisionAssignmentArgsSchema,
  async (_: unknown, args: GetDivisionAssignmentArgs, context: GraphQLContext) => {
    const { styleSeasonCode, companyCode, divisionCode } = args;

    // 1. Check entity cache first (may be populated by another query)
    const entityKey = SQLiteCacheKeys.entityDivisionAssignment(
      styleSeasonCode, companyCode, divisionCode
    );
    const cached = await getEntity<any>(entityKey, {
      userScoped: true,
      userId: context.user?.id,
    });
    if (cached) {
      return cached;  // Cache hit - return immediately
    }

    // 2. Cache miss - fetch from database with query-level caching
    return await withSQLiteCache(
      entityKey,
      async () => {
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
      },
      5 * 60 * 1000
    );
  }
);
```

---

## Cache Key Generation

### Query Fingerprinting

**Location**: `src/lib/queryFingerprint.ts`

The `QueryFingerprintBuilder` uses Bun's SIMD-accelerated hashing for fast, collision-resistant cache key generation.

### Fluent API Usage

```typescript
import { QueryFingerprintBuilder } from "$lib/queryFingerprint";

const cacheKey = QueryFingerprintBuilder
  .for("getDivisionAssignment")           // Operation name
  .withVariables({ styleSeasonCode, companyCode, divisionCode })
  .withUser(context.user?.id)             // Optional: user-specific caching
  .withTimeBucket("hour")                 // Optional: time-based invalidation
  .withPrefix("gql")                      // Optional: key prefix
  .build();
```

### Key Generation Functions

| Function | Purpose | Example Output |
|----------|---------|----------------|
| `generateHashedKey(input)` | SIMD-accelerated hashing | `"a7c3f8e2b1d9"` |
| `generateOperationKey(op, vars)` | Operation + variables | `"hash-of-op-and-vars"` |
| `createQueryFingerprint(name, vars, opts)` | Full fingerprint | `"prefix:hash"` |
| `createPersistedQueryId(query)` | Normalized query hash | `"query-hash"` |

### Predefined Cache Keys

The `SQLiteCacheKeys` object provides consistent key generation:

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

**Location**: `src/lib/graphqlPerformanceTracker.ts`

### How It Works

```typescript
// Wrapping a resolver
const wrappedResolver = withPerformanceTracking(
  "Query",                    // Operation type
  "getDivisionAssignment",    // Field name
  getDivisionAssignmentResolver
);
```

### Metrics Collected

| Metric | Type | Description |
|--------|------|-------------|
| `graphql_resolver_duration_ms` | Histogram | Execution time per resolver |
| `graphql_resolver_calls_total` | Counter | Total calls per resolver |
| `graphql_resolver_errors_total` | Counter | Error count per resolver |

### In-Memory Performance Data

Recent operations are stored in memory for analysis:

```typescript
interface GraphQLPerformanceData {
  operationName: string;    // "Query"
  fieldName: string;        // "looks"
  duration: number;         // 373 (milliseconds)
  success: boolean;         // true
  error?: string;           // undefined or error message
  timestamp: number;        // Date.now()
}
```

**Maximum stored operations**: 100 (configurable via `MAX_STORED_OPERATIONS`)

### Source Detection

The performance tracker determines if a response came from cache or database based on timing:

```typescript
// Cache hits are typically < 10ms, DB fetches > 50ms
source: op.duration < 10 ? "cache" : "database"
```

---

## Monitoring & Health Endpoints

### `/health/graphql` Endpoint

Provides comprehensive GraphQL resolver performance metrics.

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
  "recentOperations": [
    {
      "operationName": "Query",
      "fieldName": "looks",
      "duration": 373,
      "success": true,
      "timestamp": 1705315800000,
      "source": "database"
    },
    {
      "operationName": "Query",
      "fieldName": "looks",
      "duration": 2,
      "success": true,
      "timestamp": 1705315802000,
      "source": "cache"
    }
  ],
  "insights": {
    "cacheEffectiveness": 1,
    "slowResolvers": [],
    "fastestResolver": "Query.looks",
    "slowestResolver": "Query.looks"
  }
}
```

### `/health/cache` Endpoint

Provides cache statistics and analytics:

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

---

## Best Practices

### 1. Use Entity Caching for Cross-Query Reuse

```typescript
// Check entity cache before query cache
const entityKey = SQLiteCacheKeys.entityLook(documentKey);
const cached = await getEntity<LookType>(entityKey);
if (cached) return cached;

// Then use query cache with entity population
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
  requiredFields: ['documentKey', 'title'],  // Only cache complete entities
});
```

### 5. Monitor Cache Performance

Use the Zed tasks or curl commands to regularly check:

```bash
# Cache hit rate
curl -sf http://localhost:4000/health/graphql | jq '.resolvers[] | {resolver, cacheHitRate}'

# Recent operations timing
curl -sf http://localhost:4000/health/graphql | jq '.recentOperations[-5:]'
```

### 6. Log Cache Operations

The cache system logs all operations for debugging:

- Cache hits: `"SQLite cache hit"` with key, hit count, age
- Cache sets: `"SQLite cache set"` with key, size, TTL
- Evictions: `"SQLite cache LRU eviction"` with count
- Entity population: `"Entity cache populated"` with count

---

## File Reference

| File | Purpose |
|------|---------|
| `src/lib/bunSQLiteCache.ts` | SQLite cache implementation, entity caching |
| `src/lib/queryFingerprint.ts` | Cache key generation utilities |
| `src/lib/graphqlPerformanceTracker.ts` | Performance tracking wrapper |
| `src/lib/queryCache.ts` | Map-based cache (fallback) |
| `src/server/handlers/health.ts` | Health check endpoints |
| `src/graphql/resolvers/*.ts` | Resolver implementations using caching |

---

## Performance Characteristics

| Operation | Typical Timing |
|-----------|---------------|
| Database fetch | 100-500ms |
| SQLite cache hit | 0-5ms |
| Cache key generation | <1ms |
| Entity cache lookup | 1-3ms |

**Expected cache hit improvement**: 50-200x faster than database fetches

---

*Last updated: 2024*
