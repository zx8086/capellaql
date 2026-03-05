# CapellaQL 

[![Docker CI/CD with Bun and Snyk](https://github.com/zx8086/capellaql/actions/workflows/docker-ci-cd.yml/badge.svg)](https://github.com/zx8086/capellaql/actions/workflows/docker-ci-cd.yml)

CapellaQL is a high-performance GraphQL service built with Bun that provides a modern API interface for Couchbase Capella databases. It features advanced monitoring, caching, and observability capabilities.

## Features

- **High Performance**: Built with Bun runtime for exceptional speed
- **GraphQL API**: Modern, flexible query interface
- **Couchbase Integration**: Optimized for Couchbase Capella databases
- **OpenTelemetry**: Comprehensive observability and monitoring
- **Rate Limiting**: Built-in protection against abuse
- **Docker Support**: Multi-architecture container support
- **Security**: CORS, security headers, and input validation
- **Caching**: Response caching for improved performance

## Prerequisites

- **Bun** >= 1.0.0
- **Docker** (optional, for containerized deployment)
- **Couchbase Capella** database access

## Installation

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/zx8086/capellaql.git
   cd capellaql
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start the development server**
   ```bash
   bun run dev
   ```

The service will be available at `http://localhost:4000/graphql`

### Docker Deployment

1. **Pull the image**
   ```bash
   docker pull zx8086/capellaql:latest
   ```

2. **Run the container**
   ```bash
   docker run -d \
     --name capellaql \
     -p 4000:4000 \
     --env-file .env \
     zx8086/capellaql:latest
   ```

## ⚙️ Configuration

Configure the service using environment variables. The configuration system uses a 4-pillar pattern (defaults, env mapping, Zod validation, loader) with 44+ variables across 5 categories.

### Core Settings
- `BASE_URL`: Base URL for the service
- `PORT`: Port number (default: 4000)
- `LOG_LEVEL`: Logging level (debug, info, warn, error)
- `ALLOWED_ORIGINS`: Comma-separated CORS origins

### Couchbase Configuration
- `COUCHBASE_URL`: Couchbase cluster connection string
- `COUCHBASE_USERNAME`: Database username
- `COUCHBASE_PASSWORD`: Database password
- `COUCHBASE_BUCKET`: Target bucket name
- `COUCHBASE_SCOPE`: Target scope name
- `COUCHBASE_COLLECTION`: Target collection name
- `COUCHBASE_KV_TIMEOUT`, `COUCHBASE_QUERY_TIMEOUT`, etc.: Operation timeouts

### OpenTelemetry Settings
- `ENABLE_OPENTELEMETRY`: Enable telemetry (true/false)
- `OTEL_SERVICE_NAME`: Service identifier for tracing
- `OTEL_SERVICE_VERSION`: Service version
- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`: OTLP traces endpoint
- `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`: OTLP metrics endpoint
- `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`: OTLP logs endpoint

### Deployment Settings
- `HOSTNAME`: Server hostname
- `K8S_POD_NAME`, `K8S_NAMESPACE`: Kubernetes metadata
- `INSTANCE_ID`, `CONTAINER_ID`: Instance identification

### Runtime Settings
- `NODE_ENV`: Environment mode
- `BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS`: DNS cache TTL

For the full list of 44+ environment variables, see [docs/configuration/environment.md](docs/configuration/environment.md).

## 📖 API Documentation

The GraphQL endpoint is available at `/graphql`. The schema exposes 11 queries across looks, options, images, documents, and seasonal assignments.

### Key Query Examples

#### `looksSummary`
Retrieve summary statistics for looks with optional brand/season/division filtering.

```graphql
query {
  looksSummary(brand: "TH", season: "SS24", division: "DIV01") {
    totalLooks
    hasTitle
    hasTrend
    hasRelatedStyles
    hasDescription
    hasDeliveryName
    hasGender
    hasTag
  }
}
```

#### `looks`
Get look documents with optional brand/season/division filtering.

```graphql
query {
  looks(brand: "TH", season: "SS24", division: "DIV01") {
    documentKey
    divisionCode
    lookType
    assetUrl
    title
    trend
    relatedStyles
    isDeleted
  }
}
```

#### `getAllSeasonalAssignments`
Retrieve seasonal assignment data with division and channel details.

```graphql
query {
  getAllSeasonalAssignments(
    styleSeasonCode: "SS24"
    companyCode: "COMP001"
    isActive: true
  ) {
    name
    brand
    brandName
    styleSeasonCode
    companyCode
    channels
    salesOrganizationCodes
    divisions {
      name
      code
      isActive
    }
    fms {
      year
      season { code name }
    }
    createdOn
    modifiedOn
  }
}
```

For the full query reference (all 11 queries with complete type definitions), see [docs/api/graphql-queries.md](docs/api/graphql-queries.md).

## Performance Testing and Benchmarks

CapellaQL includes a comprehensive K6 testing suite to ensure optimal performance under various load conditions.

### Performance Targets
- **HTTP Error Rate**: < 1% of all requests
- **Response Time**: 95% of requests complete in < 400ms
- **Availability**: 99.9% uptime under normal load

### Test Types

#### Smoke Test
**Purpose**: Quick validation of basic functionality
```bash
k6 run tests/k6/smoke/health-smoke.ts
```
- **Virtual Users**: 3
- **Duration**: 3 minutes
- **Threshold**: 95% of requests < 50ms
- **Use Case**: Pre-deployment validation

#### Soak Test
**Purpose**: Extended load endurance testing
```bash
k6 run tests/k6/soak/soak-test.ts
```
- **Virtual Users**: 50 (constant)
- **Duration**: 3 hours
- **Threshold**: 95% of requests < 200ms, < 1% failure rate
- **Use Case**: Memory leak and stability validation

#### Stress Test
**Purpose**: Identify system breaking point
```bash
k6 run tests/k6/stress/system-stress.ts
```
- **Virtual Users**: 100-200 (gradual increase)
- **Duration**: 15 minutes
- **Threshold**: 95% of requests < 500ms, < 10% failure rate
- **Use Case**: Capacity planning

#### Spike Test
**Purpose**: Sudden traffic surge simulation
```bash
k6 run tests/k6/spike/spike-test.ts
```
- **Virtual Users**: 25-100 (rapid spike)
- **Duration**: 5 minutes
- **Threshold**: 95% of requests < 500ms, < 10% failure rate
- **Use Case**: Traffic spike resilience

### Test Scenarios
The K6 suite includes tests for:
- **GraphQL Endpoints**: Core query performance
- **Health Checks**: System availability monitoring
- **Image URL Validation**: Asset accessibility verification
- **Seasonal Assignments**: Business logic performance

## 🏗️ Architecture Overview

CapellaQL follows a layered architecture with comprehensive middleware integration for security, monitoring, and performance optimization.

### Request Flow

```
Client Request → Method Validation → Backpressure → Rate Limiting → CORS → Security Headers → Tracing → Logging → GraphQL → Resolvers → Couchbase
                       ↓                  ↓              ↓            ↓           ↓              ↓          ↓
                                     OpenTelemetry Tracing & Metrics Collection Throughout Pipeline
```

### Middleware Pipeline (7 layers)

#### 1. Method Validation (`methodValidationMiddleware`)
Validates HTTP method is allowed for the requested endpoint.

#### 2. Backpressure (`backpressureMiddleware`)
RSS-based memory pressure detection. Rejects requests with HTTP 503 (RFC 7231) when memory usage exceeds thresholds.

#### 3. Rate Limiting (`rateLimitMiddleware`)
**Implementation**: Token bucket algorithm
- **Limit**: 500 requests per minute per client/path combination
- **Identification**: Client IP + request path
- **Response**: HTTP 429 with retry-after header
- **Bypass**: Health check endpoints excluded

#### 4. CORS (`corsMiddleware`)
Cross-Origin Resource Sharing headers with configurable allowed origins.

#### 5. Security Headers (`securityMiddleware`)
- **HSTS**: HTTP Strict Transport Security
- **CSP**: Content Security Policy
- **X-Frame-Options**: Clickjacking protection
- **X-Content-Type-Options**: MIME type sniffing prevention
- **Referrer-Policy**: Referrer information control

#### 6. Distributed Tracing (`tracingMiddleware`)
OpenTelemetry span creation and propagation for end-to-end request tracking.

#### 7. Request Logging (`loggingMiddleware`)
Structured request/response logging with ULID-based correlation IDs.

### OpenTelemetry Integration

#### Instrumentation Components
- **Auto-instrumentation**: HTTP, GraphQL, and Node.js runtime
- **Custom Metrics**: Business-specific performance indicators
- **Distributed Tracing**: End-to-end request tracking
- **Resource Monitoring**: CPU, memory, and DNS cache statistics

#### Custom Exporters
**MonitoredOTLPExporter** features:
- **DNS Prefetching**: Bun DNS cache optimization
- **Retry Logic**: Exponential backoff with circuit breaker
- **Resource Monitoring**: System metrics collection
- **Timeout Management**: Configurable export timeouts (5 minutes default)

### Error Handling Strategy
- **Graceful Degradation**: Service continues with reduced functionality
- **Circuit Breaker**: Automatic failure detection and recovery
- **Structured Logging**: Correlation IDs for debugging
- **Health Checks**: Proactive monitoring endpoints

## GraphQL Schema Overview

CapellaQL implements a comprehensive GraphQL schema designed for fashion retail data management with 11 query resolvers organized in a modular pattern.

### Resolver Organization

The resolver architecture follows a modular pattern with dedicated files for each domain in `src/graphql/resolvers/`:

```typescript
const resolvers = {
  Query: {
    ...looks.Query,
    ...looksSummary.Query,
    ...optionsSummary.Query,
    ...optionsProductView.Query,
    ...imageDetails.Query,
    ...lookDetails.Query,
    ...imageUrlCheck.Query,
    ...looksUrlCheck.Query,
    ...documentSearch.Query,
    ...getDivisionAssignment.Query,
    ...getAllSeasonalAssignments.Query,
  }
}
```

### Available Queries

| Query | Description |
|-------|-------------|
| `looksSummary` | Summary statistics for looks (counts by field presence) |
| `looks` | Look documents with brand/season/division filtering |
| `lookDetails` | Detailed look information by document key |
| `optionsSummary` | Option summary statistics with sales channel filtering |
| `optionsProductView` | Product view of options with status flags |
| `imageDetails` | Image URLs for a style (front, back, detail, etc.) |
| `getImageUrlCheck` | Validate image URL suffixes by division and season |
| `getLooksUrlCheck` | Validate look URL suffixes by division and season |
| `searchDocuments` | Cross-collection document search by keys |
| `getAllSeasonalAssignments` | Seasonal assignments with divisions and channels |
| `getDivisionAssignment` | Single division assignment details |

### Data Flow Patterns

**1. Key-Value Operations** - Direct document retrieval by key
**2. Stored Function Execution** - Server-side N1QL functions with parameterized calls
**3. Multi-Collection Search** - Cross-collection document discovery with DataLoader batching

For full type definitions, see `src/graphql/typeDefs.ts`.

## 🐳 Docker Multi-Architecture Support

CapellaQL provides optimized Docker images for multiple architectures with advanced build techniques and CI/CD integration.

### Supported Platforms
- **linux/amd64**: Intel/AMD 64-bit processors
- **linux/arm64**: ARM 64-bit processors (Apple Silicon, ARM servers)

### Multi-Stage Build Process

#### Stage 1: Base Configuration
```dockerfile
FROM oven/bun:canary-alpine AS base
ENV CN_ROOT=/usr/src/app \
    CN_CXXCBC_CACHE_DIR=/usr/src/app/deps/couchbase-cxx-cache \
    NODE_ENV=production
```

#### Stage 2: Dependencies Installation
```dockerfile
FROM base AS deps
COPY package.json bun.lockb tsconfig.json ./
RUN --mount=type=cache,target=/root/.bun,sharing=locked \
    bun install --frozen-lockfile --production
```

#### Stage 3: Build Optimization
```dockerfile
FROM deps AS builder
RUN bun build ./src/index.ts \
    --target=node \
    --outdir ./dist \
    --sourcemap \
    --external dns \
    --external bun \
    --manifest
```

### Build Optimizations

#### Layer Caching Strategy
- **Dependency Caching**: Separate layer for node_modules
- **Source Code Isolation**: Source changes don't invalidate dependency cache
- **Build Cache**: Persistent build artifacts across builds
- **Registry Cache**: Multi-platform cache sharing

#### Platform-Specific Considerations

**ARM64 Optimizations**:
- Native ARM64 Bun runtime
- Optimized Couchbase SDK compilation
- ARM-specific dependency resolution

**AMD64 Optimizations**:
- x86_64 instruction set utilization
- Intel-specific performance tuning
- Legacy compatibility maintenance

### CI/CD Pipeline Integration

#### Build Matrix Strategy
```yaml
strategy:
  matrix:
    include:
      - platform: linux/amd64
        platform-name: amd64
      - platform: linux/arm64
        platform-name: arm64
  fail-fast: false
  max-parallel: 1
```

#### Advanced Caching
- **BuildKit Cache**: Local and registry-based caching
- **GitHub Actions Cache**: Persistent cache across workflow runs
- **Platform-Specific Cache**: Separate cache per architecture
- **Cache Metrics**: Hit ratio monitoring and optimization

#### Security Integration
- **Snyk Scanning**: Vulnerability assessment during build
- **SBOM Generation**: Software Bill of Materials creation
- **Attestation**: Build provenance and integrity verification
- **Multi-platform Manifest**: Unified image reference

### Container Features

#### Security Hardening
- **Non-root User**: Runs as `bun` user (UID 1000)
- **Minimal Base**: Alpine Linux for reduced attack surface
- **Read-only Filesystem**: Immutable container filesystem
- **Health Checks**: Built-in container health monitoring

#### Runtime Optimization
- **Source Maps**: Debug support in production
- **Environment Variables**: Comprehensive configuration support
- **Graceful Shutdown**: SIGTERM handling for clean shutdowns
- **Resource Limits**: Memory and CPU constraints

## 🗄️ Couchbase Integration

CapellaQL implements optimized patterns for Couchbase Capella database integration with advanced connection management and query optimization.

### Connection Architecture

#### ConnectionManager Singleton Pattern

The `CouchbaseConnectionManager` is a singleton that manages a single cluster connection shared across all resolvers, with circuit breaker integration, retry logic, and health monitoring.

```typescript
interface CouchbaseConnection {
  // Core SDK objects
  cluster: Cluster
  bucket: (name?: string) => Bucket
  scope: (bucketName?: string, scopeName?: string) => Scope
  collection: (bucketName?: string, scopeName?: string, collectionName?: string) => Collection

  // Default references (cached)
  defaultBucket: Bucket
  defaultScope: Scope
  defaultCollection: Collection

  // Enhanced methods
  getHealth: () => Promise<HealthStatus>
  executeWithRetry?: <T>(operation: () => Promise<T>, context?: RetryContext) => Promise<T>

  // Error classes (for instanceof checks)
  errors: {
    DocumentNotFoundError: any
    CouchbaseError: any
    TimeoutError: any
    AuthenticationFailureError: any
    CasMismatchError: any
    TemporaryFailureError: any
  }
}
```

#### Usage
```typescript
import { connectionManager } from "./lib/couchbase"

// Initialize once at startup
await connectionManager.initialize()

// Get connection for operations
const connection = await connectionManager.getConnection()
const result = await connection.defaultCollection.get("document-key")
```

### Authentication Patterns

#### Environment-Based Configuration
```typescript
const connectionConfig = {
  url: process.env.COUCHBASE_URL,
  username: process.env.COUCHBASE_USERNAME,
  password: process.env.COUCHBASE_PASSWORD,
  bucket: process.env.COUCHBASE_BUCKET,
  scope: process.env.COUCHBASE_SCOPE,
  collection: process.env.COUCHBASE_COLLECTION
}
```

#### Connection Pooling
- **Cluster Reuse**: Single cluster instance across resolvers
- **Connection Validation**: Health checks before query execution
- **Error Recovery**: Automatic reconnection on connection failures
- **Timeout Management**: Configurable operation timeouts

### Query Optimization Techniques

#### 1. Key-Value Operations
**Use Case**: Single document retrieval by ID
```typescript
const result = await collection.get(documentKey)
```
**Performance**: Sub-millisecond latency for cached documents

#### 2. N1QL Query Execution
**Use Case**: Complex relational queries
```typescript
const query = `
  SELECT l.*, o.options 
  FROM \`fashion-bucket\`.\`retail\`.\`looks\` l 
  JOIN \`fashion-bucket\`.\`retail\`.\`options\` o 
  ON l.id = o.lookId 
  WHERE l.styleSeasonCode = $styleSeasonCode
`
const result = await cluster.query(query, { 
  parameters: { styleSeasonCode } 
})
```

#### 3. Stored Procedure Execution
**Use Case**: Complex business logic with optimized execution
```typescript
const query = `EXECUTE FUNCTION \`default\`.\`new_model\`.getAllSeasonalAssignments($styleSeasonCode, $companyCode)`
const result = await cluster.query(query, { 
  parameters: { styleSeasonCode, companyCode } 
})
```

#### 4. Multi-Collection Search
**Use Case**: Cross-collection document discovery
```typescript
for (const { bucket, scope, collection } of collections) {
  const collectionRef = connection.collection(bucket, scope, collection)
  try {
    const result = await collectionRef.get(key)
    results.push({ bucket, scope, collection, data: result.content })
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      results.push({ bucket, scope, collection, data: null })
    }
  }
}
```

### Database Schema Requirements

#### Collection Structure
```
fashion-bucket/
├── retail/
│   ├── looks/           # Look documents
│   ├── options/         # Option documents
│   ├── assignments/     # Seasonal assignment documents
│   └── images/          # Image metadata documents
└── analytics/
    ├── metrics/         # Performance metrics
    └── logs/           # Application logs
```

#### Document Patterns

**Look Document**:
```json
{
  "id": "LOOK_SS24_001",
  "type": "look",
  "name": "Summer Casual Collection",
  "styleSeasonCode": "SS24",
  "companyCode": "FASHION_CO",
  "description": "Lightweight summer pieces",
  "imageUrl": "https://cdn.example.com/looks/ss24_001.jpg",
  "options": ["OPT_001", "OPT_002"],
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-20T14:30:00Z"
}
```

**Option Document**:
```json
{
  "id": "OPT_001",
  "type": "option",
  "lookId": "LOOK_SS24_001",
  "name": "Cotton T-Shirt",
  "price": 29.99,
  "currency": "USD",
  "availability": "IN_STOCK",
  "variants": [
    { "size": "M", "color": "Blue", "sku": "TSH_M_BLU" }
  ]
}
```

### Performance Optimization

#### Indexing Strategy
```sql
CREATE PRIMARY INDEX ON `fashion-bucket`.`retail`.`looks`

CREATE INDEX idx_style_season ON `fashion-bucket`.`retail`.`looks`(styleSeasonCode)
CREATE INDEX idx_company_code ON `fashion-bucket`.`retail`.`looks`(companyCode)
CREATE INDEX idx_look_options ON `fashion-bucket`.`retail`.`options`(lookId)
```

#### Query Optimization
- **Parameterized Queries**: Prevent injection and enable query plan caching
- **Index Utilization**: Ensure queries use appropriate indexes
- **Result Limiting**: Implement pagination for large result sets
- **Connection Reuse**: Minimize connection overhead

#### Error Handling Patterns
```typescript
try {
  const result = await collection.get(key)
  return result.content
} catch (error) {
  if (error instanceof DocumentNotFoundError) {
    return null
  } else if (error instanceof CouchbaseError) {
    logger.error('Couchbase operation failed', { error: error.message, key })
    throw new Error('Database operation failed')
  } else {
    logger.error('Unexpected error', { error, key })
    throw error
  }
}
```

## Troubleshooting Guide

Common deployment issues, performance optimization tips, and configuration validation guidance for CapellaQL.

### Common Deployment Issues

#### 1. Container Startup Failures

**Symptom**: Container exits immediately or fails health checks
```bash
docker logs capellaql-container
```

**Solutions**:
```bash
# Verify environment variables
docker exec capellaql-container env | grep COUCHBASE

# Check port availability
netstat -tulpn | grep :4000

# Validate Couchbase connectivity
docker exec capellaql-container curl -f $COUCHBASE_URL/pools
```

#### 2. DNS Resolution Issues

**Symptom**: OpenTelemetry export failures or Couchbase connection timeouts

**Solutions**:
```bash
# Configure DNS TTL
export BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS=30

# Verify DNS resolution
docker exec capellaql-container nslookup your-couchbase-host.com

# Check network connectivity
docker exec capellaql-container ping -c 3 your-couchbase-host.com
```

#### 3. Multi-Architecture Build Failures

**Symptom**: Build fails on specific platforms (ARM64/AMD64)

**Solutions**:
```bash
# Clear buildx cache
docker buildx prune -f

# Rebuild with verbose output
docker buildx build --platform linux/arm64,linux/amd64 --progress=plain --no-cache .

# Check platform-specific dependencies
docker run --platform linux/arm64 oven/bun:canary-alpine bun --version
```

### Performance Optimization

#### 1. Memory Management

**Monitoring**:
```typescript
const memoryUsage = process.memoryUsage()
console.log(`Heap Used: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`)
console.log(`RSS: ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`)
```

**Optimization**:
```bash
# Container memory limits
docker run --memory=512m --memory-swap=1g capellaql

# Bun-specific optimizations
export BUN_JSC_useJIT=1
export BUN_JSC_useBBQJIT=1
```

#### 2. Database Query Optimization

**Query Performance Analysis**:
```sql
SET profiling = ON;

SELECT * FROM system:completed_requests 
WHERE duration > 1000 
ORDER BY duration DESC;
```

**Index Optimization**:
```sql
CREATE INDEX idx_looks_covering ON `bucket`.`scope`.`looks`(styleSeasonCode, companyCode, id, name)

SELECT * FROM system:indexes WHERE keyspace_id = 'looks'
```

#### 3. OpenTelemetry Performance

**Export Optimization**:
```typescript
const batchSpanProcessor = new BatchSpanProcessor(traceExporter, {
  maxExportBatchSize: 512,
  scheduledDelayMillis: 5000,
  exportTimeoutMillis: 300000
})
```

### Configuration Validation

#### 1. Environment Variable Validation

**Required Variables Checklist**:
```bash
required_vars=(
  "COUCHBASE_URL"
  "COUCHBASE_USERNAME" 
  "COUCHBASE_PASSWORD"
  "COUCHBASE_BUCKET"
  "COUCHBASE_SCOPE"
  "COUCHBASE_COLLECTION"
)

for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    echo "Missing required variable: $var"
    exit 1
  else
    echo "$var is set"
  fi
done
```

#### 2. Couchbase Connection Validation

**Connection Test**:
```typescript
async function validateCouchbaseConnection() {
  try {
    const cluster = await getCluster()
    const result = await cluster.cluster.query('SELECT 1')
    return { status: 'healthy', latency: result.meta.executionTime }
  } catch (error) {
    return { status: 'unhealthy', error: error.message }
  }
}
```

#### 3. OpenTelemetry Configuration

**Telemetry Validation**:
```bash
curl -f $TRACES_ENDPOINT/health
curl -f $METRICS_ENDPOINT/health
curl -f $LOGS_ENDPOINT/health

echo "Service: $SERVICE_NAME"
echo "Version: $SERVICE_VERSION"
echo "Environment: $DEPLOYMENT_ENVIRONMENT"
```

### Network Connectivity Troubleshooting

#### 1. DNS Cache Optimization

**DNS Cache Monitoring**:
```typescript
const dnsStats = bunDns.getCacheStats()
console.log(`Cache Size: ${dnsStats.size}`)
console.log(`Cache Hits: ${dnsStats.cacheHitsCompleted}`)
console.log(`Cache Misses: ${dnsStats.cacheMisses}`)
console.log(`Hit Rate: ${((dnsStats.cacheHitsCompleted / dnsStats.totalCount) * 100).toFixed(2)}%`)
```

**DNS Prefetching**:
```typescript
bunDns.prefetch(hostname)
const addresses = await dnsPromises.resolve4(hostname, { ttl: true })
```

#### 2. Rate Limiting Issues

**Rate Limit Debugging**:
```bash
# Check rate limit headers on response
curl -I http://localhost:4000/graphql

# Check performance metrics for rate limiting data
curl http://localhost:4000/health/performance
```

**Rate Limit Configuration**:
```typescript
const rateLimitConfig = {
  max: 1000,
  windowMs: 60000,
  skipSuccessfulRequests: true,
  skipFailedRequests: false
}
```

### Monitoring and Alerting

#### 1. Health Check Endpoints

CapellaQL provides 13 health endpoints for comprehensive monitoring:

| Endpoint | Description |
|----------|-------------|
| `/health` | Basic health check |
| `/health/telemetry` | Telemetry health status |
| `/health/system` | System health details |
| `/health/summary` | Health summary |
| `/health/performance` | Performance metrics |
| `/health/performance/history` | Performance history |
| `/health/cache` | Cache analytics |
| `/health/telemetry/detailed` | Detailed telemetry |
| `/health/comprehensive` | Full health report |
| `/health/graphql` | GraphQL resolver performance |
| `/health/status` | Standardized status |
| `/health/ready` | K8s readiness probe |
| `/health/live` | K8s liveness probe |

```bash
# Basic health check
curl http://localhost:4000/health

# K8s readiness probe
curl http://localhost:4000/health/ready

# Full health report
curl http://localhost:4000/health/comprehensive
```

#### 2. Log Analysis

**Structured Logging**:
```bash
docker logs capellaql | grep "requestId:abc-123"

docker logs capellaql | grep "ERROR" | tail -20

docker logs capellaql | grep "duration" | awk '{print $NF}' | sort -n
```

#### 3. Performance Metrics

**Key Performance Indicators**:
- **Response Time**: 95th percentile < 400ms
- **Error Rate**: < 1% of total requests
- **Memory Usage**: < 80% of allocated memory
- **CPU Usage**: < 70% average utilization
- **DNS Cache Hit Rate**: > 90%

## Observability

### OpenTelemetry Integration
- **Traces**: Request tracing across all components
- **Metrics**: Performance and business metrics
- **Logs**: Structured logging with correlation IDs

### Health Monitoring
- Basic health check: `/health`
- K8s readiness probe: `/health/ready`
- K8s liveness probe: `/health/live`
- Full health report: `/health/comprehensive`
- See [Health Check Endpoints](#1-health-check-endpoints) for all 13 endpoints

## Security

- **CORS**: Configurable cross-origin resource sharing
- **Rate Limiting**: 500 requests per minute per client
- **Security Headers**: HSTS, CSP, and other security headers
- **Input Validation**: GraphQL schema validation
- **Authentication**: Ready for auth middleware integration

## CI/CD Pipeline

### GitHub Actions Workflow
- **Multi-architecture builds**: ARM64 and AMD64 support
- **Security scanning**: Snyk vulnerability assessment
- **Container scanning**: Image security analysis
- **Automated testing**: Health checks and integration tests
- **Registry push**: Automated Docker Hub deployment

### Build Optimization
- **Layer caching**: Optimized Docker layer caching
- **Multi-stage builds**: Minimal production images
- **Dependency caching**: Bun dependency optimization

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Add tests for new features
- Update documentation as needed
- Ensure CI/CD pipeline passes

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍Author

**Simon Owusu**
- Email: simonowusupvh@gmail.com
- GitHub: [@zx8086](https://github.com/zx8086)

---

Built with ❤️ using Bun, GraphQL, and Couchbase Capella
