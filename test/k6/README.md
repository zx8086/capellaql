# K6 Performance Test Suite - CapellaQL

Modern, TypeScript-based performance testing suite for CapellaQL GraphQL API with comprehensive coverage, realistic user scenarios, and production-ready validation.

## 📁 Test Structure

```
test/k6/
├── smoke/                      # Quick validation tests (2-3 VUs, 2-3 minutes)
│   ├── health-smoke.ts        # Health endpoint validation
│   └── graphql-smoke.ts       # GraphQL operations smoke test
├── load/                      # Normal load testing (10-30 VUs, 15-20 minutes)
│   ├── health-load.ts         # Health endpoint load testing
│   ├── graphql-load.ts        # GraphQL operations load testing
│   ├── complete-graphql-coverage.ts # All GraphQL operations coverage
│   └── graphql-endpoints-modern.ts  # Modernized version of original test
├── stress/                    # Breaking point testing (50-200 VUs, 30+ minutes)
│   └── system-stress.ts       # Mixed workload stress testing
├── scenarios/                 # Realistic user journey testing
│   ├── fashion-buyer-journey.ts      # Fashion buyer workflow simulation
│   └── database-connection-stress.ts # Database connection pool testing
├── utils/                     # Shared utilities and helpers
│   ├── config.ts             # Centralized configuration management
│   ├── metrics.ts            # Custom metrics and business KPIs
│   └── graphql-helpers.ts    # GraphQL testing utilities
├── data/                      # Test data and scenarios
│   ├── brands.json           # Brand and division data
│   ├── queries.json          # GraphQL queries with metadata
│   ├── test-scenarios.json   # User journey definitions
│   └── test-data-loader.ts   # SharedArray data loaders
└── legacy/                    # Original JavaScript tests (deprecated)
    ├── smoke-test-health.js   # Legacy smoke test
    ├── stress-test-health.js  # Legacy stress test
    └── graphql-endpoints.js   # Legacy GraphQL test
```

## 🚀 Quick Start

### Prerequisites
- **K6 installed** (`brew install k6` or [download](https://k6.io/docs/getting-started/installation/))
- **Bun runtime** (this is a Bun project - `curl -fsSL https://bun.sh/install | bash`)
- **CapellaQL server running** on configured port (default: 4000)

### Running Tests

```bash
# Modern TypeScript Tests (Recommended)
bun run k6:smoke:health           # Health endpoint smoke test
bun run k6:smoke:graphql          # GraphQL operations smoke test
bun run k6:load:coverage          # Complete GraphQL operations coverage
bun run k6:scenario:buyer         # Fashion buyer journey simulation
bun run k6:scenario:database      # Database connection stress test

# Quick test suite
bun run k6:all:modern             # Run smoke + coverage + buyer journey

# Legacy JavaScript Tests (Backward Compatibility)
bun run k6:smoke                  # Legacy smoke test
bun run k6:load                   # Legacy load test
bun run k6:graphql                # Legacy GraphQL test
bun run k6:all:legacy             # Run all legacy tests
```

### Environment Configuration

Set environment variables to customize test behavior:

```bash
# Basic Configuration
export HOST=localhost             # Target host (default: localhost)
export PORT=4000                 # Target port (default: 4000)
export TIMEOUT=30s               # Request timeout (default: 30s)

# Run with custom configuration
HOST=staging.example.com PORT=443 k6 run test/k6/smoke/health-smoke.ts
```

## 📊 Test Categories

### 1. Smoke Tests 🚬
**Purpose**: Quick validation of core functionality
- **Duration**: 2-3 minutes
- **VUs**: 2-3
- **Frequency**: Every commit/deployment
- **Thresholds**: P95 < 50ms (health), P95 < 200ms (GraphQL)

### 2. Load Tests ⚡
**Purpose**: Validate performance under expected load
- **Duration**: 15-20 minutes
- **VUs**: 10-40
- **Frequency**: Nightly/weekly
- **Thresholds**: P95 < 100ms (health), P95 < 400ms (GraphQL)

### 3. Stress Tests 💪
**Purpose**: Find breaking points and resource limits
- **Duration**: 30+ minutes
- **VUs**: 50-200
- **Frequency**: Weekly/pre-release
- **Thresholds**: More lenient, focus on stability

### 4. Scenario Tests 🎭
**Purpose**: Realistic user journey simulation
- **Duration**: 15-25 minutes
- **VUs**: 5-25
- **Frequency**: Pre-release/regression testing
- **Focus**: Business workflow validation

## 🎯 GraphQL Operations Coverage

The test suite covers all available GraphQL operations:

| Operation | Complexity | Typical Use Case | Performance Target |
|-----------|------------|------------------|-------------------|
| `looksSummary` | Simple | Fashion overview | P95 < 200ms |
| `looks` | Simple | Browse looks | P95 < 300ms |
| `getAllSeasonalAssignments` | Complex | Data analysis | P95 < 800ms |
| `getImageUrlCheck` | Simple | Image validation | P95 < 250ms |
| `optionsSummary` | Complex | Options analysis | P95 < 600ms |
| `optionsProductView` | Complex | Product details | P95 < 800ms |
| `imageDetails` | Simple | Image metadata | P95 < 200ms |

## 📈 Custom Metrics & Business KPIs

The suite tracks custom metrics beyond standard HTTP metrics:

### Business Metrics
- `business_operations_completed`: Successful business operations
- `looks_retrieved`: Fashion looks accessed
- `options_retrieved`: Product options accessed
- `assignments_retrieved`: Seasonal assignments accessed

### Technical Metrics
- `graphql_operation_duration`: GraphQL-specific response times
- `graphql_success_rate`: GraphQL operation success rate
- `concurrent_db_connections`: Database connection pool usage
- `cache_hit_rate`: Query cache effectiveness
- `performance_budget_violations`: Performance SLA violations

### System Health Metrics
- `db_connection_errors`: Database connectivity issues
- `telemetry_overhead`: Observability system impact
- `http_success_rate`: Overall HTTP success rate

## ⚙️ Configuration Management

### Centralized Configuration (`utils/config.ts`)
```typescript
export interface K6Config {
  host: string;
  port: number;
  baseUrl: string;
  timeout: string;
  userAgent: string;
}

// Standardized performance thresholds
export const performanceThresholds: PerformanceThresholds = {
  health: {
    smoke: ['p(95)<50', 'p(99)<100'],
    load: ['p(95)<100', 'p(99)<200'],
    stress: ['p(95)<200', 'p(99)<500']
  },
  graphql: {
    simple: ['p(95)<200', 'p(99)<500'],
    complex: ['p(95)<1000', 'p(99)<2000']
  }
};
```

### Consistent Environment Handling
All tests use the same configuration pattern:
```typescript
import { getConfig, performanceThresholds } from '../utils/config.js';

const config = getConfig();
// Automatic environment variable support for HOST, PORT, TIMEOUT
```

## 🧪 Test Data Management

### SharedArray for Memory Efficiency
```typescript
import { SharedArray } from 'k6/data';

export const brands = new SharedArray('brands', function() {
  return JSON.parse(open('./brands.json'));
});
```

### Dynamic Variable Generation
```typescript
export const generateLooksSummaryVariables = () => {
  const brand = brandSelector();
  return {
    brand: brand.name,
    division: createRandomSelector(brand.divisions)(),
    season: seasonSelector()
  };
};
```

## 🔍 Advanced Features

### 1. TypeScript Support
- Full TypeScript implementation
- Type-safe configuration
- Enhanced IDE support and error detection

### 2. Modern K6 Patterns
- SharedArray for test data
- Custom metrics with business context
- Scenario-based execution
- Dynamic variable generation

### 3. Realistic User Simulations
- Fashion buyer journey with weighted operations
- Think time between operations
- Session-based testing patterns

### 4. Database Connection Testing
- Connection pool stress testing
- Leak detection patterns
- Resource cleanup validation

### 5. Performance Budget Validation
- Automatic SLA violation tracking
- Operation-specific thresholds
- Business metric correlation

## 📊 Interpreting Results

### Key Metrics to Monitor

1. **Response Time Percentiles**
   - P95 < thresholds for normal operations
   - P99 shows tail latency performance
   - P50 indicates typical user experience

2. **Error Rates**
   - `http_req_failed` should be < 1% for normal load
   - `graphql_errors` should be minimal
   - Connection errors indicate infrastructure issues

3. **Business Metrics**
   - `business_operations_completed` shows functional success
   - Operation-specific counters show usage patterns
   - Success rates indicate user experience quality

4. **Resource Utilization**
   - `concurrent_db_connections` shows database load
   - `cache_hit_rate` indicates caching effectiveness
   - `telemetry_overhead` shows observability cost

### Performance Analysis

```bash
# Run test with detailed metrics
k6 run --out json=results.json test/k6/load/complete-graphql-coverage.ts

# Analyze results
k6 --summary-time-unit=ms results.json
```

## 🔧 Troubleshooting

### Common Issues

1. **Connection Refused**
   ```bash
   # Verify server is running
   curl http://localhost:4000/health
   
   # Check configured port
   echo $PORT
   ```

2. **High Error Rates**
   - Check server logs for errors
   - Verify GraphQL schema compatibility
   - Review database connection pool settings

3. **Performance Degradation**
   - Monitor system resources (CPU, memory)
   - Check database query performance
   - Review OpenTelemetry overhead

### Debug Mode
```bash
# Run with verbose logging
K6_LOG_LEVEL=debug k6 run test/k6/smoke/health-smoke.ts

# Run single VU for debugging
k6 run --vus 1 --iterations 1 test/k6/load/graphql-load.ts
```

## 🚦 CI/CD Integration

### Performance Gates
```yaml
# Example GitHub Actions integration
- name: Run K6 Performance Tests
  run: |
    bun run k6:smoke:health
    bun run k6:smoke:graphql
    
- name: Run Load Tests (Nightly)
  if: github.event.schedule
  run: bun run k6:load:coverage
```

### Performance Regression Detection
- Baseline metrics stored in CI
- Automated comparison with previous runs
- Alert on significant performance degradation

## 📚 Migration from Legacy Tests

### Backwards Compatibility
Legacy JavaScript tests remain available in the `legacy/` directory for gradual migration.

### Migration Benefits
- **Type Safety**: TypeScript catches errors at compile time
- **Modern Patterns**: SharedArray, custom metrics, scenarios
- **Better Organization**: Logical directory structure
- **Enhanced Metrics**: Business KPIs and custom tracking
- **Realistic Testing**: User journey simulations

### Migration Timeline
1. **Phase 1**: Run both legacy and modern tests in parallel
2. **Phase 2**: Migrate CI/CD to use modern tests
3. **Phase 3**: Deprecate legacy tests once confidence is established

## 🤝 Contributing

### Adding New Tests
1. Use TypeScript for new tests
2. Follow the established directory structure
3. Import from shared utilities (`utils/`, `data/`)
4. Include appropriate thresholds and custom metrics
5. Add npm script for easy execution

### Test Naming Convention
- `{category}/{component}-{type}.ts`
- Examples: `smoke/health-smoke.ts`, `load/graphql-load.ts`
- Use descriptive scenario names for user journeys

### Performance Threshold Guidelines
- Smoke tests: Strictest thresholds (P95 < 50ms health)
- Load tests: Production-like thresholds (P95 < 200ms GraphQL)
- Stress tests: Lenient thresholds focusing on stability
- Scenario tests: Business-appropriate thresholds

## 📋 Test Execution Checklist

Before running performance tests:
- [ ] CapellaQL server is running
- [ ] Database connections are available
- [ ] Environment variables are set (if needed)
- [ ] No other load tests are running concurrently

During test execution:
- [ ] Monitor server resources (CPU, memory, connections)
- [ ] Watch for error patterns in logs
- [ ] Check database performance metrics
- [ ] Observe OpenTelemetry overhead

After test completion:
- [ ] Review all threshold violations
- [ ] Analyze custom business metrics
- [ ] Check for resource leaks (connections, memory)
- [ ] Document any performance regressions

---

## 📞 Support

For questions about the performance test suite:
1. Check this README for common patterns
2. Review existing test implementations for examples
3. Check K6 documentation for advanced features
4. Consult CapellaQL architecture documentation for business context

**Happy Performance Testing!** 🚀