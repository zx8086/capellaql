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

Configure the service using environment variables:

### Core Settings
- `BASE_URL`: Base URL for the service
- `PORT`: Port number (default: 4000)
- `LOG_LEVEL`: Logging level (debug, info, warn, error)

### Couchbase Configuration
- `COUCHBASE_URL`: Couchbase cluster connection string
- `COUCHBASE_USERNAME`: Database username
- `COUCHBASE_PASSWORD`: Database password
- `COUCHBASE_BUCKET`: Target bucket name
- `COUCHBASE_SCOPE`: Target scope name
- `COUCHBASE_COLLECTION`: Target collection name

### OpenTelemetry Settings
- `ENABLE_OPENTELEMETRY`: Enable telemetry (true/false)
- `SERVICE_NAME`: Service identifier for tracing
- `SERVICE_VERSION`: Service version
- `TRACES_ENDPOINT`: OTLP traces endpoint
- `METRICS_ENDPOINT`: OTLP metrics endpoint
- `LOGS_ENDPOINT`: OTLP logs endpoint

## 📖 API Documentation

### Main Queries

#### `looksSummary`
Retrieve summary information for looks with filtering options.

```graphql
query {
  looksSummary(
    styleSeasonCode: "SS24"
    companyCode: "COMP001"
    limit: 10
  ) {
    id
    name
    description
    imageUrl
  }
}
```

#### `looks`
Get detailed look information including options and assignments.

```graphql
query {
  looks(
    styleSeasonCode: "SS24"
    lookId: "LOOK001"
  ) {
    id
    name
    description
    options {
      id
      name
      price
    }
  }
}
```

#### `getAllSeasonalAssignments`
Retrieve seasonal assignment data with division filtering.

```graphql
query {
  getAllSeasonalAssignments(
    styleSeasonCode: "SS24"
    companyCode: "COMP001"
    isActive: true
  ) {
    id
    divisions {
      id
      name
      isActive
    }
  }
}
```

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
k6 run test/k6/smoke-test-health.js
```
- **Virtual Users**: 3
- **Duration**: 3 minutes
- **Threshold**: 95% of requests < 50ms
- **Use Case**: Pre-deployment validation

#### 🌊 Soak Test
**Purpose**: Extended load endurance testing
```bash
k6 run test/k6/soak-test-health.js
```
- **Virtual Users**: 50 (constant)
- **Duration**: 3 hours
- **Threshold**: 95% of requests < 200ms, < 1% failure rate
- **Use Case**: Memory leak and stability validation

#### Stress Test
**Purpose**: Identify system breaking point
```bash
k6 run test/k6/stress-test-health.js
```
- **Virtual Users**: 100-200 (gradual increase)
- **Duration**: 15 minutes
- **Threshold**: 95% of requests < 500ms, < 10% failure rate
- **Use Case**: Capacity planning

#### Spike Test
**Purpose**: Sudden traffic surge simulation
```bash
k6 run test/k6/spike-test-health.js
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
Client Request → CORS → Rate Limiting → Security Headers → GraphQL → Resolvers → Couchbase
                  ↓         ↓              ↓              ↓         ↓           ↓
              OpenTelemetry Tracing & Metrics Collection Throughout Pipeline
```

### Middleware Pipeline

#### 1. CORS Configuration
```typescript
cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS']
})
```

#### 2. Rate Limiting
**Implementation**: Token bucket algorithm
- **Limit**: 500 requests per minute per client/path combination
- **Identification**: Client IP + request path
- **Response**: HTTP 429 with retry-after header
- **Bypass**: Health check endpoints excluded

#### 3. Security Headers
- **HSTS**: HTTP Strict Transport Security
- **CSP**: Content Security Policy
- **X-Frame-Options**: Clickjacking protection
- **X-Content-Type-Options**: MIME type sniffing prevention
- **Referrer-Policy**: Referrer information control

#### 4. Request ID Generation
Each request receives a unique correlation ID for distributed tracing:
```typescript
const requestId = crypto.randomUUID()
```

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

## GraphQL Schema Details

CapellaQL implements a comprehensive GraphQL schema designed for fashion retail data management with optimized resolver patterns.

### Core Types

#### Look Type
```graphql
type Look {
  id: ID!
  name: String!
  description: String
  imageUrl: String
  styleSeasonCode: String!
  companyCode: String!
  options: [Option!]!
  assignments: [SeasonalAssignment!]!
  createdAt: DateTime
  updatedAt: DateTime
}
```

#### Option Type
```graphql
type Option {
  id: ID!
  name: String!
  description: String
  price: Float
  currency: String
  availability: AvailabilityStatus!
  images: [ImageDetail!]!
  variants: [OptionVariant!]!
}
```

#### Seasonal Assignment Type
```graphql
type SeasonalAssignment {
  id: ID!
  styleSeasonCode: String!
  companyCode: String!
  divisions: [Division!]!
  isActive: Boolean!
  effectiveDate: DateTime
  expirationDate: DateTime
}
```

### Resolver Organization

#### Query Resolvers
The resolver architecture follows a modular pattern with dedicated files for each domain:

```typescript
const resolvers = {
  Query: {
    ...looks.Query,
    ...looksSummary.Query,
    ...optionsSummary.Query,
    ...getAllSeasonalAssignments.Query,
    ...documentSearch.Query,
    ...imageUrlCheck.Query
  }
}
```

#### Data Flow Patterns

**1. Direct Document Retrieval**
```typescript
const result = await collection.get(documentKey)
```

**2. N1QL Query Execution**
```typescript
const query = `EXECUTE FUNCTION \`default\`.\`new_model\`.getAllSeasonalAssignments($styleSeasonCode, $companyCode)`
const result = await cluster.query(query, { parameters: { styleSeasonCode, companyCode } })
```

**3. Multi-Collection Search**
```typescript
for (const { bucket, scope, collection } of collections) {
  const collectionRef = connection.collection(bucket, scope, collection)
  const result = await collectionRef.get(key)
}
```

### Query Examples

#### Complex Look Query with Filtering
```graphql
query GetLooksWithOptions($styleSeasonCode: String!, $companyCode: String) {
  looks(styleSeasonCode: $styleSeasonCode, companyCode: $companyCode) {
    id
    name
    description
    imageUrl
    options {
      id
      name
      price
      currency
      availability
      images {
        url
        altText
        isPrimary
      }
    }
    assignments {
      divisions {
        id
        name
        isActive
      }
    }
  }
}
```

#### Document Search Across Collections
```graphql
query SearchDocuments($collections: [CollectionInput!]!, $keys: [String!]!) {
  searchDocuments(collections: $collections, keys: $keys) {
    bucket
    scope
    collection
    data
    timeTaken
    error
  }
}
```

### Schema Optimization Features
- **Field-level Caching**: Resolver-level response caching
- **Lazy Loading**: On-demand relationship resolution
- **Batch Loading**: DataLoader pattern for N+1 prevention
- **Input Validation**: Comprehensive argument validation
- **Error Boundaries**: Graceful error handling with partial results

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

#### Connection Factory Pattern
```typescript
interface capellaConn {
  cluster: QueryableCluster
  bucket: (name: string) => Bucket
  scope: (bucket: string, name: string) => Scope
  collection: (bucket: string, scope: string, name: string) => Collection
  defaultBucket: Bucket
  defaultScope: Scope
  defaultCollection: Collection
  errors: {
    DocumentNotFoundError: typeof DocumentNotFoundError
    CouchbaseError: typeof CouchbaseError
  }
}
```

#### Connection Establishment
```typescript
const cluster = await connect(clusterConnStr, {
  username: username,
  password: password
})

const bucket = cluster.bucket(bucketName)
const scope = bucket.scope(scopeName)
const collection = scope.collection(collectionName)
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
curl -I http://localhost:4000/graphql

curl http://localhost:4000/metrics | grep rate_limit
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

**Health Check Implementation**:
```bash
curl http://localhost:4000/health

curl http://localhost:4000/ready

curl http://localhost:4000/metrics
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
- Health check endpoint: `/health`
- Metrics endpoint: `/metrics` (when enabled)
- Ready check: `/ready`

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
