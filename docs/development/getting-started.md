# Development Guide

## Getting Started

### Prerequisites
- Bun runtime v1.0+ (install from bun.sh)
- Couchbase Capella cluster access (or local Couchbase Server)
- OpenTelemetry Collector (optional, for observability)

### Quick Start
```bash
bun install
cp .env.example .env
# Configure Couchbase credentials in .env
bun run dev
```

Server starts at http://localhost:4000
- GraphQL endpoint: http://localhost:4000/graphql
- Health check: http://localhost:4000/health

## Development Commands

### Server
```bash
bun run dev                    # Start dev server
bun run dev:verbose            # Dev with verbose fetch logging
bun run dev:debug              # Dev with inspector
bun run start                  # Start server
bun run start:prod             # Start with NODE_ENV=production
```

### Build
```bash
bun run build                  # Default build
bun run build:dev              # Development build
bun run build:prod             # Production build (optimized)
bun run build:docker           # Docker-specific build
bun run build:analyze          # Build with bundle analysis
```

### Code Quality
```bash
bun run typecheck              # TypeScript type checking
bun run lint                   # Biome linting
bun run lint:fix               # Auto-fix lint issues
bun run format                 # Biome formatting
bun run quality                # Typecheck + lint combined
bun run quality:fix            # Typecheck + lint:fix + format
```

### Testing
```bash
# Bun tests
bun run test:bun               # All Bun tests
bun run test:bun:unit          # Unit tests only
bun run test:bun:integration   # Integration tests only
bun run test:bun:e2e           # End-to-end tests
bun run test:bun:watch         # Watch mode
bun run test:bun:ci            # CI mode with coverage + JUnit XML

# Playwright E2E
bun run test:playwright        # Headless
bun run test:playwright:ui     # Interactive UI mode
bun run test:playwright:debug  # Debug mode

# K6 Performance
bun run test:k6:smoke:all      # Smoke tests (quick validation)
bun run test:k6:load:all       # Load tests (sustained traffic)
bun run test:k6:stress:all     # Stress tests (high load)
bun run test:k6:spike          # Spike test (traffic bursts)
bun run test:k6:soak           # Soak test (long-duration)
bun run test:k6:scenario:all   # Business scenario tests

# Full suites
bun run test                   # Bun + Playwright
bun run test:all               # Bun + Playwright + K6 smoke

# Mutation testing
bun run test:mutation          # StrykerJS mutation tests
```

### Health Checks
```bash
bun run health:check           # Basic health check
bun run health:all             # Comprehensive health report
```

## Project Structure

```
src/
├── index.ts                    # Main entry point (Bun.serve)
├── config/                     # 4-pillar configuration system
│   ├── defaults.ts            # Default values (5 domains)
│   ├── envMapping.ts          # Env var -> config path mapping
│   ├── loader.ts              # Config loading and validation
│   └── schemas.ts             # Zod validation schemas
├── server/                     # HTTP server layer
│   ├── handlers/
│   │   ├── graphql.ts         # GraphQL Yoga handler
│   │   └── health.ts         # 13 health check handlers
│   ├── middleware/             # 7-stage middleware pipeline
│   │   ├── compose.ts         # Middleware composition
│   │   ├── rateLimit.ts       # Rate limiting
│   │   ├── security.ts        # Security headers
│   │   ├── cors.ts            # CORS handling
│   │   ├── tracing.ts         # OpenTelemetry spans
│   │   ├── logging.ts         # Request logging
│   │   ├── backpressure.ts    # Request queuing
│   │   └── methodValidation.ts # HTTP method validation
│   ├── websocket/
│   │   └── subscriptions.ts   # GraphQL subscriptions
│   └── types.ts               # Server type definitions
├── graphql/                    # GraphQL schema and resolvers
│   ├── schema.ts              # makeExecutableSchema
│   ├── typeDefs.ts            # GraphQL type definitions
│   ├── context.ts             # Request context factory
│   ├── types.ts               # TypeScript types
│   ├── validation/            # Input validation
│   └── resolvers/             # Domain resolvers (12+)
├── lib/                        # Core libraries
│   ├── couchbase/             # Database layer
│   │   ├── connection-manager.ts  # Singleton connection
│   │   ├── circuit-breaker.ts     # Resilience pattern
│   │   ├── data-loader.ts         # Batch operations
│   │   ├── kv-operations.ts       # Key-value operations
│   │   ├── query-executor.ts      # N1QL queries
│   │   ├── repository.ts          # Repository pattern
│   │   ├── transaction-handler.ts # ACID transactions
│   │   ├── errors.ts              # 25+ error types
│   │   └── metrics.ts             # Query metrics
│   ├── queryCache.ts          # Query result caching
│   ├── graphqlResponseCache.ts # Response caching
│   ├── bunSQLiteCache.ts      # SQLite cache layer
│   ├── systemHealth.ts        # Health aggregation
│   ├── memoryGuardian.ts      # Memory monitoring
│   └── performanceMonitor.ts  # Performance profiling
├── telemetry/                  # OpenTelemetry implementation
│   ├── instrumentation.ts     # SDK setup
│   ├── metrics/               # HTTP, GraphQL, Couchbase metrics
│   ├── tracing/               # Distributed tracing
│   ├── health/                # Telemetry health checks
│   └── coordinator/           # Batch coordination
├── logging/                    # Logging infrastructure (3-layer DI)
│   ├── ports/                 # Logger interfaces
│   ├── adapters/              # Pino + Winston adapters
│   └── container.ts           # DI container
├── errors/                     # Error handling
│   ├── problem-details.ts     # RFC 7807 responses
│   ├── error-codes.ts         # Error code constants
│   └── result.ts              # Result<T,E> pattern
├── models/                     # Data models and Zod schemas
├── services/                   # Business logic
│   └── health/                # Health service handlers
└── utils/                      # Utility functions
```

## Environment Configuration

Copy `.env.example` and configure these key sections:

### Application
| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 4000 | Server port |
| LOG_LEVEL | info | Log level (debug, info, warn, error) |
| LOGGING_BACKEND | pino | Logger backend (pino or winston) |
| YOGA_RESPONSE_CACHE_TTL | 900000 | GraphQL response cache TTL (ms) |
| ALLOWED_ORIGINS | http://localhost:3000 | CORS allowed origins (comma-separated) |

### Couchbase Capella
| Variable | Default | Description |
|----------|---------|-------------|
| COUCHBASE_URL | couchbase://localhost | Connection string |
| COUCHBASE_USERNAME | Administrator | Database username |
| COUCHBASE_PASSWORD | password | Database password |
| COUCHBASE_BUCKET | default | Bucket name |
| COUCHBASE_SCOPE | _default | Scope name |
| COUCHBASE_COLLECTION | _default | Collection name |

### OpenTelemetry
| Variable | Default | Description |
|----------|---------|-------------|
| ENABLE_OPENTELEMETRY | true | Enable/disable telemetry |
| OTEL_EXPORTER_OTLP_TRACES_ENDPOINT | http://localhost:4318/v1/traces | Traces endpoint |
| OTEL_EXPORTER_OTLP_METRICS_ENDPOINT | http://localhost:4318/v1/metrics | Metrics endpoint |
| OTEL_EXPORTER_OTLP_LOGS_ENDPOINT | http://localhost:4318/v1/logs | Logs endpoint |

See [Environment Variables Reference](../configuration/environment.md) for the complete list.

## Path Aliases

Configured in `tsconfig.json`:

| Alias | Maps to |
|-------|---------|
| `$lib/*` | `src/lib/*` |
| `$utils/*` | `src/utils/*` |
| `$models/*` | `src/models/*` |
| `$config` | `src/config` |
| `$telemetry/*` | `src/telemetry/*` |
| `$logging/*` | `src/logging/*` |
| `$graphql/*` | `src/graphql/*` |
| `$types/*` | `src/types/*` |
| `$constants/*` | `src/constants/*` |

## Docker Development

```bash
# Build and run with Docker Compose
docker compose up

# Build specific targets
bun run docker:build           # Production build
bun run docker:build:dev       # Development build
bun run docker:run             # Run container with .env

# Optional observability stack
docker compose --profile observability up
```

Docker Compose provides Jaeger (tracing), Prometheus (metrics), and Grafana (visualization) via the observability profile.

## Troubleshooting

### Server won't start
```bash
# Check if port 4000 is in use
lsof -i :4000

# Kill existing process
lsof -ti:4000 | xargs kill -9
```

### Couchbase connection fails
- Verify credentials in `.env` match your Capella cluster
- Check that `COUCHBASE_URL` uses the correct connection string format
- Ensure network access is configured in Capella (allowed IP ranges)
- Connection manager retries with exponential backoff on startup

### TypeScript errors
```bash
bun run typecheck              # Check for type errors
```

### Test failures
```bash
bun run test:bun:unit          # Run unit tests in isolation
bun run test:bun --bail        # Stop on first failure
```

## Related Documentation

- [Testing Guide](testing.md) - Comprehensive testing strategy
- [Architecture Overview](../architecture/overview.md) - System design
- [Profiling Guide](profiling.md) - Performance profiling
- [API Best Practices](api-best-practices.md) - RFC compliance
