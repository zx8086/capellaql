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

### Development Dashboard
- `http://localhost:4000/dashboard` - **CapellaQL Development Dashboard**
  - Real-time cache analytics with SQLite vs Map performance comparison
  - Telemetry insights with memory pressure analysis and data loss tracking
  - Comprehensive system health monitoring (database, memory, telemetry)
  - Performance overview with key metrics and trends
  - Auto-refresh capability (30-second intervals)
  - Direct links to all health endpoints for detailed analysis

## Architecture Overview

### Technology Stack
- **Runtime**: Bun (leverages Bun-specific APIs and performance optimizations)
- **GraphQL**: GraphQL Yoga with Elysia framework
- **Database**: Couchbase SDK v4.5.0 with comprehensive error handling, retry logic, and performance monitoring
- **Observability**: OpenTelemetry with custom OTLP exporters
- **Containerization**: Docker multi-architecture (linux/amd64, linux/arm64)

### Key Architectural Patterns

#### Connection Management
- Single cluster connection shared across all resolvers (`src/lib/couchbaseConnector.ts`)
- Factory pattern for bucket/scope/collection access
- Production-ready error handling with comprehensive retry logic (`src/lib/couchbaseErrorHandler.ts`)
- Real-time performance metrics and health monitoring (`src/lib/couchbaseMetrics.ts`)
- Advanced transaction error handling (`src/lib/couchbaseTransactionHandler.ts`)

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
├── dashboard/
│   └── index.html              # Development dashboard (served at /dashboard)
├── graphql/
│   ├── schema.ts               # GraphQL schema assembly
│   ├── typeDefs.ts             # GraphQL type definitions
│   ├── types.ts                # TypeScript types for resolvers
│   └── resolvers/              # Modular resolver files
├── lib/
│   ├── couchbaseConnector.ts   # Database connection factory
│   ├── clusterProvider.ts      # Cluster management utilities
│   ├── couchbaseErrorHandler.ts # Production-ready error handling with retry logic
│   ├── couchbaseMetrics.ts     # Performance metrics and monitoring
│   ├── couchbaseTransactionHandler.ts # Advanced transaction error handling
│   ├── dataLoader.ts           # Enhanced DataLoader with comprehensive error handling
│   └── queryCache.ts           # Query result caching layer
├── models/
│   ├── index.ts                # Model exports
│   ├── types.ts                # TypeScript types and Zod schemas
│   └── errors.ts               # Structured error hierarchy
├── otlp/                       # Custom OpenTelemetry exporters
├── utils/
│   ├── logger.ts               # Winston-based structured logging
│   └── simpleLogger.ts         # Fallback logging utilities
tests/                          # Centralized test directory
├── unit/                       # Unit tests
├── integration/                # Integration tests  
└── e2e/                       # End-to-end tests
```

### Path Aliases (tsconfig.json)
- `$lib/*` → `src/lib/*`
- `$utils/*` → `src/utils/*`  
- `$models/*` → `src/models/*`
- `$config` → `src/config`

### Database Patterns

#### Connection Usage
```typescript
import { getCluster } from "$lib/clusterProvider";
import { CouchbaseErrorHandler } from "$lib/couchbaseErrorHandler";

// Production-ready connection with comprehensive error handling
const cluster = await CouchbaseErrorHandler.executeWithRetry(
  async () => await getCluster(),
  CouchbaseErrorHandler.createConnectionOperationContext("getCluster", requestId)
);

// Use cluster.collection(bucket, scope, collection) for specific collections
const collection = cluster.collection("bucket", "scope", "collection");
```

#### Query Patterns
1. **Key-Value Operations**: Document operations with comprehensive error handling and retry logic
2. **N1QL Queries**: Complex queries with performance monitoring and error classification
3. **Stored Functions**: Execute server-side functions with proper context and retry strategies
4. **Multi-Collection Search**: Cross-collection document discovery with DataLoader batching
5. **Transaction Operations**: ACID transactions with ambiguous operation tracking and recovery

### Error Handling
- **Production-Ready**: Comprehensive `CouchbaseErrorHandler` with 25+ error type classifications
- **Retry Logic**: Exponential backoff with circuit breaker patterns for resilient operations
- **Error Classification**: Automatic categorization (retryable/non-retryable, severity levels)
- **Performance Monitoring**: Real-time metrics collection with slow query detection
- **Ambiguous Operation Tracking**: Special handling for operations requiring manual investigation
- **Transaction Safety**: Advanced transaction error handling with rollback strategies
- **Structured Logging**: Correlation IDs with OpenTelemetry span integration

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

## Available Claude Code Specialized Agents

This project has access to comprehensive specialized agents for expert assistance. Each agent follows evidence-based analysis methodologies and requires complete context understanding before providing recommendations.

### Architecture & System Design
- **`architect-reviewer`** - Architecture review specialist for system design validation, scalability analysis, and technical decision-making. **Use PROACTIVELY** for architectural decisions, refactoring strategies, system design improvements, and technology evaluation.
- **`meta-orchestrator`** - Meta-level orchestration expert for complex multi-step tasks with advanced coordination patterns and production-ready workflow management. **Use PROACTIVELY** for breaking down complex problems, multi-agent coordination, task complexity analysis, and comprehensive workflow orchestration.

### Runtime & Backend Development
- **`bun-developer`** - Expert Bun runtime developer with mastery of modern JavaScript/TypeScript and all Bun-specific APIs. **Use PROACTIVELY** for Bun servers, native SQL/Redis/S3 integration, workspaces, streams, ES2023+ features, performance optimization, full-stack TypeScript development, Zod validation, database integration, gRPC services, and monorepo management with catalogs and Biome.
- **`graphql-specialist`** - Expert GraphQL developer specializing in GraphQL Yoga v5.x and Houdini with comprehensive knowledge of modern GraphQL patterns, federation, subscriptions, and performance optimization. **MUST BE USED** for all GraphQL schema design, resolver implementation, client integration, subscription handling, and performance optimization tasks. Specializes in production-ready patterns for scalable GraphQL applications with security, type safety, and developer experience optimization.
- **`couchbase-capella-specialist`** - Expert Couchbase Capella specialist achieving **100/100 production readiness** with comprehensive error handling, performance monitoring, and resilience frameworks. **MUST BE USED** for all Couchbase operations including connection management, error handling, retry logic, transaction processing, and performance optimization. Features production-tested patterns for SDK v4.5.0+ with 25+ error classifications, circuit breaker integration, ambiguous operation tracking, and advanced health monitoring with actionable recommendations.

### Frontend Development
- **`svelte5-developer`** - Expert Svelte 5 and SvelteKit developer specializing in modern reactive patterns, runes system, component architecture, and full-stack TypeScript applications. Has live access to Svelte 5 documentation via MCP server. **Use PROACTIVELY** for all frontend development, reactive state management, component design, and SvelteKit full-stack patterns.

### Configuration & Infrastructure
- **`config-manager`** - Environment variable and configuration expert with universal configuration excellence patterns, production-ready validation frameworks, and cross-system consistency management. **ALWAYS USE** for .env files, ConfigurationManager, configChanged events, health checks, config.ts files, Zod validation, or configuration management. Specializes in type-safe environment variable parsing, default/merge patterns, configuration validation with Zod v4, event-driven config updates, performance metrics, schema migration, "no fallbacks" policies, multi-environment optimization, and configuration health monitoring.
- **`deployment-bun-svelte-specialist`** - Expert Bun + Svelte workflow optimizer for GitHub Actions CI/CD pipelines. **Use immediately** when working with .github/workflows/, Dockerfile, bun.lockb, or svelte.config.js files. Proactively optimizes build times, Docker workflows, security scanning, and developer experience.

### Testing & Performance
- **`k6-performance-specialist`** - Expert K6 performance testing specialist with comprehensive knowledge of load testing patterns, cloud-native testing strategies, and production-ready performance validation frameworks. **MUST BE USED** for all K6 test creation, performance testing strategy, load pattern design, and test result analysis. **Use PROACTIVELY** when implementing performance tests, analyzing bottlenecks, designing test scenarios, or optimizing test execution. Specializes in K6 v1.0+ features, TypeScript support, browser testing, WebSocket/GraphQL testing, distributed testing with K6 Operator, and cloud optimization strategies.

### Observability & Monitoring  
- **`otel-logger`** - OpenTelemetry-native observability specialist implementing pure structured logging, distributed tracing, and metrics collection per 2025 standards. **Use PROACTIVELY** for telemetry configuration, logging implementation, metrics collection, distributed tracing, and cost-optimized sampling strategies. Specializes in telemetry systems that have migrated from hybrid file logging to cloud-native OpenTelemetry-only implementations with advanced memory management and circuit breaker reliability patterns. **Expert in unified sampling strategies** achieving 60-70% cost reduction while maintaining critical observability.

### Code Quality & Maintenance
- **`refactoring-specialist`** - Expert refactoring specialist mastering safe code transformation techniques and design pattern application. Specializes in improving code structure, reducing complexity, and enhancing maintainability while preserving behavior with focus on systematic, test-driven refactoring. **Use PROACTIVELY** for any code quality improvement, complexity reduction, or architectural cleanup. **MUST BE USED** for legacy code modernization, performance refactoring, and safe code transformations.

### Integration & Protocol Development
- **`mcp-developer`** - Expert MCP developer specializing in Model Context Protocol server and client development. Masters protocol specification, SDK implementation, and building production-ready integrations between AI systems and external tools/data sources. **Use PROACTIVELY** for any MCP server/client development, protocol implementation, or AI-tool integration. **MUST BE USED** for JSON-RPC compliance, transport configuration, and production deployment.

### Agent Usage Guidelines

**Proactive Usage Patterns:**
- **MUST BE USED**: Invoke immediately when working in their specialized domain
- **Use PROACTIVELY**: Consider early in planning phases and during active development
- **ALWAYS USE**: Required for specific file types or configuration tasks

**Multi-Agent Coordination:**
- Multiple agents can be combined for complex tasks requiring cross-domain expertise
- The `meta-orchestrator` can coordinate multi-agent workflows when needed
- Always prefer the most specialized agent for the primary task domain

**Key Decision Matrix:**
- **Database/Connection Issues**: `couchbase-capella-specialist`
- **Configuration/Environment**: `config-manager` (ALWAYS USE)
- **Performance/Bun Optimization**: `bun-developer`
- **GraphQL Development**: `graphql-specialist` (MUST BE USED)
- **Telemetry/OpenTelemetry**: `otel-logger`
- **Architecture/Design Decisions**: `architect-reviewer`
- **Code Quality/Refactoring**: `refactoring-specialist`
- **Frontend/Svelte Development**: `svelte5-developer`
- **Performance Testing**: `k6-performance-specialist` (MUST BE USED)
- **CI/CD/Deployment**: `deployment-bun-svelte-specialist`
- **Complex Multi-Step Tasks**: `meta-orchestrator`
- **Protocol/Integration Development**: `mcp-developer`

**Evidence-Based Methodology:**
- All agents follow evidence-based analysis requiring complete context reading
- Agents provide production-ready patterns and real-world validation
- Each agent specializes in specific technology stacks and maintains current best practices
- Agents are designed for proactive assistance rather than reactive troubleshooting

## Testing Structure

### Test Organization
```
tests/
├── unit/                    # Unit tests for individual components
│   ├── config.test.ts      # Configuration validation tests
│   ├── utils/
│   │   └── bunUtils.test.ts # Bun utility function tests
│   └── lib/
│       └── couchbaseConnector.test.ts # Database connection tests
├── integration/            # Integration tests for component interactions
│   └── graphql.test.ts    # GraphQL resolver integration tests
└── e2e/                   # End-to-end tests for full system
    └── server.test.ts     # Server startup, endpoints, performance tests
```

### Test Commands
- `bun test` - Run all tests with watch mode
- `bun test tests/unit` - Run only unit tests
- `bun test tests/integration` - Run only integration tests  
- `bun test tests/e2e` - Run only end-to-end tests
- `bun test --coverage` - Run tests with coverage report

## Critical Rules

### Git Operations - MANDATORY USER APPROVAL
**NEVER commit or push without explicit user approval.**
- Do NOT run `git commit` unless the user explicitly asks to commit
- Do NOT run `git push` unless the user explicitly asks to push
- Always show the user what will be committed and wait for confirmation
- The `/commit-push` command still requires user to initiate it, but Claude must ask for confirmation before executing

## Important Notes

- This codebase extensively uses Bun-specific features and APIs
- **Always use `CouchbaseErrorHandler`** for all database operations - provides production-ready error handling
- **Use existing connection patterns** with comprehensive retry logic rather than creating new connections
- **Follow error classification principles** - never retry ambiguous operations, always log critical errors
- Follow the modular resolver pattern when adding new GraphQL endpoints
- Maintain structured logging with correlation IDs and OpenTelemetry integration
- **Monitor performance metrics** using the built-in `CouchbaseMetrics` system for query optimization
- Test changes with the provided K6 performance test suite
- All configuration should use the centralized config system with proper validation
- **Use specialized agents** for expert assistance - the couchbase-capella-specialist provides 100/100 production patterns

## Development Process Management

### Background Process Management
**CRITICAL**: Always kill background processes after testing/development sessions to prevent resource leaks and port conflicts.

#### ⚠️ NEVER Spawn Multiple Server Instances
**ABSOLUTE RULE**: Before starting ANY dev server, ALWAYS check if one is already running:
```bash
# ALWAYS run this FIRST before starting a server
lsof -i :4000
```

**NEVER do this:**
```bash
# BAD - spawning without checking first
bun run dev &
# ... later ...
bun run start &  # WRONG! Creates multiple instances
```

**ALWAYS do this:**
```bash
# GOOD - check first, then start if clear
lsof -i :4000 || bun run dev
```

**Why this matters:**
- Multiple instances cause requests to go to wrong server (no logs visible)
- Port conflicts and unpredictable behavior
- Memory/CPU waste with zombie processes
- Test results may hit stale server instance

**If user already has a server running in their terminal:**
- DO NOT start another one - use their existing server
- Ask user to confirm their server is running before running tests
- Only start a server if user confirms none is running

#### Claude Code Bash Tool Timeout Requirements
**MANDATORY**: Always specify a timeout when using the Bash tool to prevent runaway processes:

| Command Type | Recommended Timeout | Max Timeout |
|--------------|---------------------|-------------|
| Quick commands (ls, cat, git status) | 30000ms (30s) | 60000ms |
| Build commands (bun build) | 120000ms (2min) | 300000ms |
| Test commands (bun test) | 180000ms (3min) | 600000ms |
| Long-running tests (coverage, e2e) | 300000ms (5min) | 600000ms |

**Never run background processes without timeout** - use `timeout` command wrapper:
```bash
# Wrap long-running commands with timeout
timeout 120 bun test --coverage

# For background processes, always use timeout
timeout 60 bun run start &
```

#### Process Cleanup Commands
```bash
# Kill specific background process by ID
# (Use KillShell tool with shell_id when using Claude Code)

# Manual cleanup if needed
pkill -f "bun run dev"
pkill -f "bun run start"
lsof -ti:4000 | xargs kill -9  # Kill processes on port 4000
```

#### Best Practices
- **Always use timeout parameter** in Bash tool calls (default 120000ms, max 600000ms)
- **Always terminate** background dev servers (`bun run dev`) after testing
- **Check for running processes** before starting new sessions: `lsof -i :4000`
- **Use process monitoring** to track active background tasks
- **Use KillShell tool** to terminate background processes by shell_id
- **Document cleanup steps** for complex testing scenarios

This prevents:
- Port conflicts when restarting servers
- Memory/CPU resource accumulation
- Interference between test sessions
- System performance degradation
- Runaway background processes consuming resources