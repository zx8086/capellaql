# OpenTelemetry 3-Tier Smart Sampling Guide

## Overview

This application now implements a streamlined 3-tier smart sampling strategy that simplifies telemetry configuration while maintaining effective cost control and critical observability. Instead of complex per-category sampling, you now have just **3 main signal types** to configure:

- **Traces** - Distributed tracing sampling
- **Metrics** - Metrics collection sampling  
- **Logs** - Log entries sampling

## Quick Start

### Environment Variables

```env
# Simplified 3-tier sampling (NEW - recommended)
SIMPLE_TRACES_SAMPLING_RATE=0.15    # 15% traces - cost-effective distributed tracing
SIMPLE_METRICS_SAMPLING_RATE=0.25   # 25% metrics - higher for performance monitoring
SIMPLE_LOGS_SAMPLING_RATE=0.30      # 30% logs - balance visibility and storage costs
COST_OPTIMIZATION_MODE=true         # Enable cost optimization features
HEALTH_CHECK_SAMPLING_RATE=0.05     # 5% health checks - reduce noise
```

### Programmatic Usage

```typescript
import { 
  SimpleSmartSampler, 
  createCostOptimizedSampler,
  createHighFidelitySampler,
  estimateCostImpact
} from './src/telemetry';

// Create a cost-optimized sampler for production
const productionSampler = createCostOptimizedSampler({
  traces: 0.10,    // 10% - aggressive cost reduction
  metrics: 0.15,   // 15% - moderate reduction
  logs: 0.20,      // 20% - conservative reduction
});

// Create a high-fidelity sampler for debugging
const debugSampler = createHighFidelitySampler();

// Estimate cost impact
const impact = estimateCostImpact({
  traces: 0.15,
  metrics: 0.25,
  logs: 0.30,
  preserveErrors: true,
  costOptimizationMode: true,
  healthCheckSampling: 0.05
});

console.log(`Estimated cost reduction: ${impact.estimatedReduction}%`);
console.log(`Error preservation rate: ${impact.preservationRate}%`);
console.log(`Recommended for: ${impact.recommendedFor.join(', ')}`);
```

## Key Features

### 🎯 Simplified Configuration
- **3 sampling rates** instead of 10+ categories
- Single interface for all telemetry types
- Clear, predictable cost control

### 💰 Cost Optimization
- **Automatic error preservation** - never lose critical debugging data
- **Health check noise reduction** - configurable low sampling for health endpoints
- **Estimated 60-70% cost reduction** while maintaining observability

### 🔧 Smart Features
- **Automatic error detection** - preserves errors regardless of sampling rate
- **Correlation-aware** - related telemetry signals stay together
- **Runtime reconfiguration** - update sampling rates without restart
- **Statistics tracking** - monitor sampling effectiveness

### 📊 Sampling Statistics

```typescript
const sampler = getSimpleSmartSampler();
const stats = sampler?.getStats();

console.log(`Total decisions: ${stats.totalDecisions}`);
console.log(`Overall sampling rate: ${stats.samplingRate * 100}%`);
console.log(`Error preservation rate: ${stats.errorPreservationRate * 100}%`);
console.log(`Estimated cost savings: ${stats.estimatedCostSavings}%`);
console.log(`Configuration rates:`, stats.configRates);
```

## Migration from Complex Sampling

The system maintains backward compatibility with the existing detailed sampling configuration:

### Legacy Configuration (still supported)
```env
# Legacy detailed sampling (automatically averaged into simple rates)
LOG_SAMPLING_DEBUG=0.1               # 10% debug logs
LOG_SAMPLING_INFO=0.5                # 50% info logs  
LOG_SAMPLING_WARN=0.9                # 90% warning logs
LOG_SAMPLING_ERROR=1.0               # 100% error logs
METRIC_SAMPLING_BUSINESS=1.0          # 100% business metrics
METRIC_SAMPLING_TECHNICAL=0.75        # 75% technical metrics
METRIC_SAMPLING_INFRASTRUCTURE=0.5    # 50% infrastructure metrics
METRIC_SAMPLING_DEBUG=0.25            # 25% debug metrics
```

### New Simplified Approach (recommended)
```env
# Simple 3-tier sampling (overrides legacy if present)
SIMPLE_TRACES_SAMPLING_RATE=0.15     # Single rate for all traces
SIMPLE_METRICS_SAMPLING_RATE=0.25    # Single rate for all metrics
SIMPLE_LOGS_SAMPLING_RATE=0.30       # Single rate for all logs
```

## Preset Configurations

### Production Cost-Optimized
```env
SIMPLE_TRACES_SAMPLING_RATE=0.10     # 10% - aggressive cost reduction
SIMPLE_METRICS_SAMPLING_RATE=0.15    # 15% - moderate reduction  
SIMPLE_LOGS_SAMPLING_RATE=0.20       # 20% - conservative reduction
COST_OPTIMIZATION_MODE=true
HEALTH_CHECK_SAMPLING_RATE=0.02      # 2% - minimal health check noise
```
**Expected**: ~75% cost reduction, 100% error preservation

### Development High-Fidelity
```env
SIMPLE_TRACES_SAMPLING_RATE=0.50     # 50% - high trace coverage
SIMPLE_METRICS_SAMPLING_RATE=0.75    # 75% - comprehensive metrics
SIMPLE_LOGS_SAMPLING_RATE=0.60       # 60% - detailed logging
COST_OPTIMIZATION_MODE=false
HEALTH_CHECK_SAMPLING_RATE=0.10      # 10% - more health check visibility
```
**Expected**: ~25% cost reduction, maximum debugging capability

### Staging Balanced
```env
SIMPLE_TRACES_SAMPLING_RATE=0.20     # 20% - good coverage
SIMPLE_METRICS_SAMPLING_RATE=0.30    # 30% - solid metrics
SIMPLE_LOGS_SAMPLING_RATE=0.40       # 40% - good log visibility
COST_OPTIMIZATION_MODE=true
HEALTH_CHECK_SAMPLING_RATE=0.05      # 5% - standard health checking
```
**Expected**: ~50% cost reduction, good observability coverage

## Error Preservation

The system automatically preserves errors regardless of sampling rates:

- **HTTP 4xx/5xx responses** - always sampled
- **Exception traces** - always captured  
- **Error-level logs** - never dropped
- **Error metrics** - 100% retention
- **Failed operations** - complete visibility

## Runtime Management

```typescript
// Get current sampler
const sampler = getSimpleSmartSampler();

// Update configuration at runtime
sampler?.updateConfig({
  traces: 0.20,      // Increase trace sampling
  costOptimizationMode: false  // Disable cost optimization
});

// Check sampling decision for specific cases
const traceDecision = sampler?.shouldSampleTrace('http.server.request', {
  'http.status_code': 200,
  'http.method': 'GET'
});

const metricDecision = sampler?.shouldSampleMetric('http.requests.duration', {
  'http.method': 'POST'
});

const logDecision = sampler?.shouldSampleLog('info', 'User login successful', {
  'user.id': '12345'
});
```

## Cost Impact Analysis

```typescript
import { estimateCostImpact } from './src/telemetry';

// Analyze different configurations
const configs = [
  { traces: 0.10, metrics: 0.15, logs: 0.20 },  // Aggressive
  { traces: 0.15, metrics: 0.25, logs: 0.30 },  // Balanced  
  { traces: 0.25, metrics: 0.40, logs: 0.50 },  // Conservative
];

configs.forEach((config, index) => {
  const impact = estimateCostImpact({
    ...config,
    preserveErrors: true,
    costOptimizationMode: true,
    healthCheckSampling: 0.05
  });
  
  console.log(`Config ${index + 1}:`);
  console.log(`  Cost reduction: ${impact.estimatedReduction}%`);
  console.log(`  Recommended for: ${impact.recommendedFor.join(', ')}`);
  console.log('');
});
```

## Best Practices

### 1. Start with Defaults
Use the default configuration first, then adjust based on your specific needs:
```env
SIMPLE_TRACES_SAMPLING_RATE=0.15     # Good starting point
SIMPLE_METRICS_SAMPLING_RATE=0.25    # Higher for performance monitoring
SIMPLE_LOGS_SAMPLING_RATE=0.30       # Balance visibility and cost
```

### 2. Monitor Sampling Statistics
Regularly check sampling effectiveness:
```typescript
setInterval(() => {
  const stats = getSimpleSmartSampler()?.getStats();
  if (stats) {
    console.log(`Sampling rate: ${stats.samplingRate * 100}%`);
    console.log(`Cost savings: ${stats.estimatedCostSavings}%`);
  }
}, 300000); // Every 5 minutes
```

### 3. Environment-Specific Tuning
- **Production**: Prioritize cost optimization (10-20% sampling rates)
- **Staging**: Balance cost and visibility (20-40% sampling rates)
- **Development**: Prioritize debugging capability (40-75% sampling rates)
- **Testing**: Minimal sampling for CI/CD efficiency (5-15% sampling rates)

### 4. Error Preservation is Automatic
Never configure error sampling rates - the system automatically preserves all errors regardless of your sampling configuration.

### 5. Health Check Noise Reduction
Keep health check sampling low (2-5%) to reduce noise while maintaining basic monitoring.

## Integration Examples

### Express.js Middleware
```typescript
app.use((req, res, next) => {
  const sampler = getSimpleSmartSampler();
  const decision = sampler?.shouldSampleTrace(`${req.method} ${req.path}`, {
    'http.method': req.method,
    'http.route': req.path,
    'http.status_code': res.statusCode
  });
  
  req.shouldSample = decision?.shouldSample || false;
  req.samplingReason = decision?.reason || 'no_decision';
  next();
});
```

### Custom Metrics
```typescript
function recordCustomMetric(name: string, value: number, attributes: Record<string, any> = {}) {
  const sampler = getSimpleSmartSampler();
  const decision = sampler?.shouldSampleMetric(name, attributes);
  
  if (decision?.shouldSample) {
    // Record the metric
    metrics.getHistogram(name).record(value, {
      ...attributes,
      'sampling.reason': decision.reason,
      'sampling.rate': decision.samplingRate
    });
  }
}
```

### Structured Logging
```typescript
function structuredLog(level: string, message: string, context: Record<string, any> = {}) {
  const sampler = getSimpleSmartSampler();
  const decision = sampler?.shouldSampleLog(level, message, context);
  
  if (decision?.shouldSample) {
    logger.log(level, message, {
      ...context,
      'sampling.reason': decision.reason,
      'sampling.rate': decision.samplingRate,
      'sampling.signal_type': decision.signalType
    });
  }
}
```

This simplified 3-tier approach provides the same observability benefits as complex multi-category sampling while being much easier to understand, configure, and maintain.
