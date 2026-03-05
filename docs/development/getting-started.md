# Development Guide

## Getting Started

### Prerequisites
- **Bun Runtime**: v1.1.35+ (recommended: v1.2.23+)
- **Kong Admin API**: Access to Kong instance for integration testing
- **Redis** (optional): For high-availability cache testing

### Quick Start

#### 1. Install Dependencies
```bash
bun install
```

#### 2. Environment Setup
Copy and configure environment variables:
```bash
cp .env.example .env
# Edit .env with your Kong configuration
```

#### 3. Start Development Server
```bash
bun run dev
```

### DevContainer Development (Optional)

For isolated local development with Docker-based Kong, Redis, and PostgreSQL:

1. **Zed IDE**: Open project folder -> Click "Open in Dev Container"
2. **Command Line**:
   ```bash
   bun run devcontainer:up      # Start infrastructure
   bun run dev:devcontainer     # Start with local Docker config
   ```

See [devcontainer.md](devcontainer.md) for detailed instructions.

**Note:** DevContainer mode uses `.env.devcontainer` with `KONG_ADMIN_URL=http://localhost:8001`.
For live endpoint testing, use the standard `.env` with production Kong URLs.

## Development Commands

### Local Development
```bash
# Install dependencies
bun install

# Start development server with hot reload
bun run dev

# Start with specific environments
bun run dev:env:development    # Development environment
bun run dev:env:staging        # Staging environment
bun run dev:env:production     # Production environment

# Clean development restart
bun run dev:clean          # Kill existing processes and start fresh
bun run server:kill        # Kill processes on port 3000

# Run with specific telemetry mode
TELEMETRY_MODE=both bun run dev
```

### Code Quality
```bash
# Type checking
bun run typecheck

# Code quality checks
bun run quality:check      # Full quality check (TypeScript + Biome + YAML)
bun run quality:fix        # Auto-fix quality issues

# Individual checks
bun run biome:check        # Biome linting and formatting
bun run biome:fix          # Auto-fix Biome issues
```

### Testing Commands
```bash
# Unit and integration tests
bun run test:bun           # All Bun tests (unit + integration)
bun run test:bun:watch     # Watch mode

# End-to-end tests
bun run test:e2e           # All Playwright E2E tests (direct mode)
bun run test:e2e:kong      # E2E tests via Kong (captures http-log)
bun run test:e2e:ui        # Playwright UI mode

# Performance tests (K6)
bun run test:k6:smoke:health    # Health endpoint smoke test
bun run test:k6:smoke:tokens    # Token endpoint smoke test
bun run test:k6:smoke:openapi   # OpenAPI endpoint smoke test
bun run test:k6:load            # Load testing suite
bun run test:k6:stress          # Stress testing suite

# Test suites
bun run test:suite         # Run all tests (Bun + Playwright + K6)
bun run test:suite:quick   # Quick test suite (smoke tests only)
```

### Script Organization

The project uses **16 hierarchical script categories**:

| Category | Purpose | Example Commands |
|----------|---------|------------------|
| **dev** | Development servers | `dev`, `dev:clean`, `dev:env:development` |
| **test** | All testing | `test:bun`, `test:e2e`, `test:k6:*` |
| **docker** | Container operations | `docker:build`, `docker:local`, `docker:security:*` |
| **redis** | Redis operations | `redis:start`, `redis:stop`, `redis:restart` |
| **profile** | Performance profiling | `profile:scenario:tokens`, `profile:k6:smoke` |
| **kong** | Kong operations | `kong:simulator`, `kong:test` |
| **quality** | Code quality | `quality:check`, `quality:fix` |
| **biome** | Biome linting | `biome:check`, `biome:check:write` |
| **typecheck** | TypeScript validation | `typecheck` |
| **health** | Service health | `server:health-check` |
| **server** | Process management | `server:kill` |
| **docs** | API documentation | `docs:generate` |
| **mutation** | Mutation testing | `test:mutation`, `test:mutation:fresh` |
| **ci** | CI/CD utilities | `ci:smoke`, `ci:validate` |
| **fix** | Quick fixes | `fix:bun-symlink`, `fix:bun-full` |
| **devcontainer** | DevContainer | `devcontainer:up`, `devcontainer:down` |

**Example Workflows:**
```bash
# Full development workflow
bun install                    # Install dependencies
bun run dev                    # Start development server
bun run test:bun               # Run unit tests
bun run quality:check          # Validate code quality

# Testing workflow
bun run test:suite:quick       # Quick validation
bun run test:k6:smoke:health   # Performance smoke test
bun run test:e2e               # Full E2E tests

# Docker workflow
bun run docker:build           # Build container
bun run docker:security:full   # Security validation
bun run docker:local           # Test locally
```

### Health and Debugging
```bash
# Health checks
bun run health-check       # Quick health check via curl

# Debug endpoints
curl http://localhost:3000/health
curl http://localhost:3000/metrics
curl http://localhost:3000/debug/metrics/test
```

## Development Workflow

### 1. Code Changes
1. Make your changes in the `src/` directory
2. The development server will automatically reload
3. Check the console for any TypeScript errors

### 2. Testing Changes
```bash
# Quick validation
curl http://localhost:3000/health

# Run tests
bun run test:bun           # Unit tests
bun run test:e2e           # E2E tests (requires Kong)
```

### 3. Quality Checks
```bash
# Before committing
bun run quality:check      # Ensures code quality
bun run typecheck          # Validates TypeScript
```

## Project Structure

```
src/
├── adapters/              # External service adapters
│   └── kong.adapter.ts    # Kong Admin API integration
├── config/                # Configuration management
│   ├── config.ts          # 4-pillar configuration
│   └── schemas.ts         # Zod validation schemas
├── handlers/              # HTTP request handlers
│   ├── health.ts          # Health check endpoints
│   ├── metrics.ts         # Metrics and monitoring
│   ├── openapi.ts         # API documentation
│   ├── profiling.ts       # Performance profiling
│   └── tokens.ts          # JWT token generation
├── middleware/            # HTTP middleware
│   ├── cors.ts            # CORS handling
│   └── error-handler.ts   # Error handling
├── routes/                # HTTP routing
│   └── router.ts          # Bun Routes API integration
├── services/              # Business logic services
│   ├── cache/             # Caching implementations
│   ├── circuit-breaker/   # Circuit breaker services
│   ├── jwt/               # JWT generation
│   ├── legacy/            # Legacy Kong services
│   └── telemetry/         # OpenTelemetry services
└── index.ts               # Application entry point
```

## Development Best Practices

### Code Style
- Follow TypeScript strict mode
- Use Biome for consistent formatting
- Prefer explicit return types for public APIs
- Use descriptive variable and function names

### Testing Approach
- Write unit tests for business logic
- Use integration tests for service interactions
- E2E tests for complete user flows
- Performance tests for critical paths

### Error Handling
- Use structured error responses
- Include request IDs for tracing
- Log errors with appropriate context
- Handle circuit breaker states gracefully

### Performance Considerations
- Leverage Bun's native APIs (`Bun.serve()`, `crypto.subtle`)
- Use caching for expensive operations
- Implement circuit breakers for external dependencies
- Monitor memory usage and response times

## Environment Configuration

### Development (.env)
```bash
NODE_ENV=development
PORT=3000
TELEMETRY_MODE=console

# Kong Configuration
KONG_MODE=API_GATEWAY
KONG_ADMIN_URL=http://kong-admin:8001
KONG_ADMIN_TOKEN=your-dev-token

# JWT Configuration
KONG_JWT_AUTHORITY=https://sts-api.dev.example.com/
KONG_JWT_AUDIENCE=http://api.dev.example.com/
JWT_EXPIRATION_MINUTES=15
```

### Debugging Configuration
```bash
# Enable debug logging
LOG_LEVEL=debug

# Enable profiling (development only)
PROFILING_ENABLED=true

# Circuit breaker tuning
CIRCUIT_BREAKER_TIMEOUT=1000
CIRCUIT_BREAKER_ERROR_THRESHOLD=25
```

## Common Development Tasks

### Adding New Endpoints
1. Create handler in `src/handlers/`
2. Add route to `src/routes/router.ts`
3. Update OpenAPI spec in `src/handlers/openapi.ts`
4. Add tests in `test/bun/` and `test/playwright/`

### Modifying Configuration
1. Update schema in `src/config/schemas.ts`
2. Add environment variable mapping in `src/config/config.ts`
3. Update documentation
4. Add validation tests

### Integrating External Services
1. Create adapter in `src/adapters/`
2. Add circuit breaker protection
3. Implement caching if appropriate
4. Add comprehensive error handling
5. Write integration tests

## Troubleshooting

For comprehensive troubleshooting including error codes, diagnostics, and runbook procedures, see the [Troubleshooting Guide](../operations/troubleshooting.md).

### Common Issues

#### Port Already in Use
```bash
# Kill existing processes
bun run server:kill
# Or manually
lsof -ti:3000 | xargs kill -9
```

#### TypeScript Errors
```bash
# Check for type errors
bun run typecheck
# Fix auto-fixable issues
bun run quality:fix
```

#### Kong Connection Issues
```bash
# Verify Kong is accessible
curl http://kong-admin:8001/status
# Check configuration
echo $KONG_ADMIN_URL
```

#### Cache Issues
```bash
# Clear Redis cache (if using Redis)
redis-cli FLUSHALL
# Restart service to clear in-memory cache
bun run dev:clean
```

### Debug Logging
Enable debug logging for detailed troubleshooting:
```bash
LOG_LEVEL=debug bun run dev
```

### Performance Issues
Use profiling tools for performance analysis:
```bash
# Start with profiling enabled
PROFILING_ENABLED=true bun run dev

# In another terminal
curl -X POST http://localhost:3000/debug/profiling/start
# Run your operations
curl -X POST http://localhost:3000/debug/profiling/stop
```