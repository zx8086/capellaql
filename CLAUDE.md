# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CapellaQL is a high-performance GraphQL service built with Bun that provides a modern API interface for Couchbase Capella databases. It features comprehensive OpenTelemetry observability, response caching, rate limiting, and Docker multi-architecture support.

## Development Commands

### Core Development
- `bun install` - Install dependencies
- `bun run dev` - Start development server with hot reload and verbose debugging
- `bun run start` - Start production server
- `bun run build` - Build production bundle to `./dist`
- `bun run build:dev` - Build with watch mode

### Testing & Performance
- `k6 run test/k6/smoke-test-health.js` - Quick validation (3 VUs, 3 minutes)
- `k6 run test/k6/stress-test-health.js` - Stress testing (100-200 VUs, 15 minutes)
- `k6 run test/k6/soak-test-health.js` - Long-duration testing (50 VUs, 3 hours)
- `k6 run test/k6/spike-test-health.js` - Traffic spike simulation
- `k6 run test/k6/graphql-endpoints.js` - GraphQL endpoint performance testing

## Architecture Overview

### Technology Stack
- **Runtime**: Bun (leverages Bun-specific APIs and performance optimizations)
- **GraphQL**: GraphQL Yoga with Elysia framework
- **Database**: Couchbase SDK v4.4.6 with direct key-value and N1QL query support
- **Observability**: OpenTelemetry with custom OTLP exporters
- **Containerization**: Docker multi-architecture (linux/amd64, linux/arm64)

### Key Architectural Patterns

#### Connection Management
- Single cluster connection shared across all resolvers (`src/lib/couchbaseConnector.ts`)
- Factory pattern for bucket/scope/collection access
- Connection pooling with automatic retry logic

#### GraphQL Resolver Organization
- Modular resolver structure in `src/graphql/resolvers/`
- Each domain has its own resolver file (looks, options, assignments, etc.)
- Resolvers are combined in `src/graphql/resolvers/index.ts`

#### Configuration Management
- Centralized config system in `src/config.ts` with Zod validation
- Environment-based configuration with sensible defaults
- Structured config sections: application, capella, openTelemetry

#### Custom OpenTelemetry Implementation
- Custom OTLP exporters in `src/otlp/` with DNS prefetching and retry logic
- Comprehensive instrumentation including HTTP, GraphQL, and business metrics
- Structured logging with correlation IDs using Winston

## Development Conventions

### File Organization
```
src/
├── config.ts                    # Central configuration with Zod validation
├── index.ts                     # Main server entry point with Elysia
├── instrumentation.ts           # OpenTelemetry setup and metrics
├── graphql/
│   ├── schema.ts               # GraphQL schema assembly
│   ├── typeDefs.ts             # GraphQL type definitions
│   └── resolvers/              # Modular resolver files
├── lib/
│   ├── couchbaseConnector.ts   # Database connection factory
│   └── clusterProvider.ts      # Cluster management utilities
├── models/
│   ├── index.ts                # Model exports
│   └── types.ts                # TypeScript types and Zod schemas
├── otlp/                       # Custom OpenTelemetry exporters
├── utils/
│   ├── logger.ts               # Winston-based structured logging
│   └── simpleLogger.ts         # Fallback logging utilities
```

### Path Aliases (tsconfig.json)
- `$lib/*` → `src/lib/*`
- `$utils/*` → `src/utils/*`  
- `$models/*` → `src/models/*`
- `$config` → `src/config`

### Database Patterns

#### Connection Usage
```typescript
import { clusterConn } from "$lib/couchbaseConnector";

const connection = await clusterConn();
// Use connection.defaultCollection for default collection
// Use connection.collection(bucket, scope, collection) for specific collections
```

#### Query Patterns
1. **Key-Value Operations**: Direct document retrieval with `collection.get(key)`
2. **N1QL Queries**: Complex queries using `cluster.query(statement, options)`
3. **Stored Functions**: Execute server-side functions with parameterized calls
4. **Multi-Collection Search**: Cross-collection document discovery patterns

### Error Handling
- Use structured logging with request correlation IDs
- Implement graceful degradation for non-critical failures
- Handle Couchbase-specific errors (DocumentNotFoundError, CouchbaseError)
- OpenTelemetry span error recording with proper status codes

### Environment Configuration
Copy `.env.example` to `.env` and configure:
- **Couchbase**: Connection string, credentials, bucket/scope/collection
- **OpenTelemetry**: Endpoints for traces, metrics, logs
- **Application**: Port, logging, CORS origins

### Performance Considerations
- Rate limiting: 500 requests/minute per client+path combination
- Response caching available but currently disabled
- Bun DNS cache optimization with configurable TTL
- OpenTelemetry export batching and timeout management

### Docker Development
- Multi-stage builds optimized for layer caching
- Development target available: `docker build --target development`
- Production images support multi-architecture deployment
- Source maps preserved in production for debugging

## Important Notes

- This codebase extensively uses Bun-specific features and APIs
- Always use the existing connection patterns rather than creating new database connections
- Follow the modular resolver pattern when adding new GraphQL endpoints
- Maintain the structured logging approach with correlation IDs
- Test changes with the provided K6 performance test suite
- All configuration should use the centralized config system with proper validation