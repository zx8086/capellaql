# Profiling Guide

Complete guide to profiling workflows and network workarounds for the authentication service.

## Quick Start

### Profile Token Generation
```bash
bun run profile:scenario:tokens
```

### Profile During K6 Tests
```bash
ENABLE_PROFILING=true bun run test:k6:smoke:health
```

### View Analysis After Profiling
Enhanced analysis with actionable recommendations is automatically displayed.

---

## Profiling Scenarios

### Available Commands

```bash
# Token generation scenario
bun run profile:scenario:tokens

# Health check endpoint
bun run profile:scenario:health

# Token validation
bun run profile:scenario:validate

# Mixed workload
bun run profile:scenario:mixed

# Profile during K6 smoke tests
ENABLE_PROFILING=true bun run test:k6:smoke:health

# Profile during K6 load tests
ENABLE_PROFILING=true bun run test:k6:load
```

---

## Profile Types

### CPU Profile (`CPU.*.md`)

Shows which functions consume the most CPU time:
- Identifies computational bottlenecks
- Includes "Hot Functions" table sorted by self time
- Best for: Optimization of CPU-intensive operations

### Heap Profile (`Heap.*.md`)

Shows memory allocation patterns:
- Identifies memory leaks
- Tracks heap growth over time
- Best for: Memory optimization and leak detection

---

## Bun Native Profiling

Bun provides built-in profiling capabilities that generate profiles compatible with Chrome DevTools and grep-friendly markdown formats.

### Quick Start (package.json scripts)

```bash
# CPU Profiling
bun run profile:cpu         # .cpuprofile for Chrome DevTools
bun run profile:cpu:md      # Markdown format (LLM/grep-friendly)
bun run profile:cpu:both    # Both formats

# Heap Profiling
bun run profile:heap        # .heapsnapshot for Chrome DevTools
bun run profile:heap:md     # Markdown format

# Combined Profiling
bun run profile:full        # CPU + Heap, all formats

# Profile Tests
bun run profile:test        # CPU profile test suite
bun run profile:test:heap   # Heap profile test suite
```

### CPU Profiling (Manual)

```bash
# Generate .cpuprofile for Chrome DevTools
bun --cpu-prof src/index.ts

# Generate markdown CPU profile (LLM/grep-friendly)
bun --cpu-prof-md src/index.ts

# Generate both formats
bun --cpu-prof --cpu-prof-md src/index.ts

# Custom output location
bun --cpu-prof --cpu-prof-dir ./profiles --cpu-prof-name my-profile.cpuprofile src/index.ts
```

**Viewing CPU Profiles:**
1. **Chrome DevTools**: Open DevTools > Performance tab > Load profile > Select `.cpuprofile`
2. **Markdown**: `cat profiles/*.cpuprofile.md | grep -E "(self|total)"`

### Heap Profiling (Manual)

```bash
# Generate .heapsnapshot for Chrome DevTools
bun --heap-prof src/index.ts

# Generate markdown heap profile
bun --heap-prof-md src/index.ts

# Custom output location
bun --heap-prof --heap-prof-dir ./profiles --heap-prof-name my-heap.heapsnapshot src/index.ts
```

**Viewing Heap Profiles:**
1. **Chrome DevTools**: Open DevTools > Memory tab > Load > Select `.heapsnapshot`
2. **Safari DevTools**: Timeline > JavaScript Allocations > Import

### Safari WebKit Heap Snapshots

Generate JSON heap snapshots compatible with Safari WebKit Developer Tools:

```bash
# Basic heap snapshot of current process
bun run profile:heap:safari

# Snapshot after running tokens scenario
bun run profile:heap:safari:tokens

# Snapshot after running health scenario
bun run profile:heap:safari:health

# With scenario profiling (generates both markdown + Safari JSON)
bun run profile:scenario:tokens:safari

# Custom output and wait time
bun scripts/profiling/heap-snapshot-safari.ts --output-dir=profiles/safari --wait=10
```

**Viewing in Safari:**
1. Open Safari Developer Tools (`Cmd + Option + I`)
2. Go to Timeline tab
3. Click on JavaScript Allocations
4. Click Import and select the `.json` file

Or use the WebKit Inspector standalone app.

### Combined Profiling (Manual)

```bash
# Full profiling (CPU + Heap, both formats)
bun --cpu-prof --cpu-prof-md --heap-prof-md --cpu-prof-dir ./profiles --heap-prof-dir ./profiles src/index.ts
```

### Profiling Flags Reference

| Flag | Description |
|------|-------------|
| `--cpu-prof` | Generate `.cpuprofile` JSON (Chrome DevTools format) |
| `--cpu-prof-md` | Generate markdown CPU profile (grep/LLM-friendly) |
| `--cpu-prof-name <file>` | Set CPU profile output filename |
| `--cpu-prof-dir <dir>` | Set CPU profile output directory |
| `--heap-prof` | Generate V8 `.heapsnapshot` on exit |
| `--heap-prof-md` | Generate markdown heap profile on exit |
| `--heap-prof-name <file>` | Set heap profile output filename |
| `--heap-prof-dir <dir>` | Set heap profile output directory |

### Package.json Scripts Reference

| Script | Description |
|--------|-------------|
| `profile:cpu` | CPU profile to Chrome DevTools format |
| `profile:cpu:md` | CPU profile to markdown |
| `profile:cpu:both` | CPU profile to both formats |
| `profile:heap` | Heap profile to Chrome DevTools format |
| `profile:heap:md` | Heap profile to markdown |
| `profile:heap:safari` | Safari WebKit JSON heap snapshot |
| `profile:heap:safari:tokens` | Safari snapshot after tokens scenario |
| `profile:heap:safari:health` | Safari snapshot after health scenario |
| `profile:full` | Full profiling (CPU + Heap, all formats) |
| `profile:test` | CPU profile the test suite |
| `profile:test:heap` | Heap profile the test suite |
| `profile:scenario:tokens:safari` | Tokens scenario with Safari snapshot |

### Environment Variable Alternative

```bash
# Profile via BUN_OPTIONS environment variable
BUN_OPTIONS="--cpu-prof-md" bun src/index.ts
```

---

## Bun Memory Analysis

### JavaScript Heap Stats

Use the `bun:jsc` module to inspect JavaScript heap usage:

```typescript
import { heapStats } from "bun:jsc";

// Get detailed heap statistics
const stats = heapStats();
console.log(JSON.stringify(stats, null, 2));

// Key metrics:
// - heapSize: Current JS heap size in bytes
// - heapCapacity: Total allocated heap capacity
// - objectCount: Number of JS objects
// - objectTypeCounts: Breakdown by object type
```

### Force Garbage Collection

```typescript
// Synchronous GC (blocks execution)
Bun.gc(true);

// Asynchronous GC (non-blocking)
Bun.gc(false);

// Memory usage before/after GC
console.log("Before:", process.memoryUsage());
Bun.gc(true);
console.log("After:", process.memoryUsage());
```

### Generate Heap Snapshot (Programmatic)

```typescript
import { generateHeapSnapshot } from "bun";

// Generate snapshot for Safari/WebKit DevTools
const snapshot = generateHeapSnapshot();
await Bun.write("heap.json", JSON.stringify(snapshot, null, 2));

// View in Safari: Developer Tools > Timeline > JavaScript Allocations > Import
```

### Native Heap Stats (mimalloc)

Bun uses mimalloc for non-JavaScript memory. To see native heap statistics:

```bash
# Stats print on process exit
MIMALLOC_SHOW_STATS=1 bun src/index.ts
```

Output includes:
- `reserved`: Total reserved memory
- `committed`: Actually committed memory
- `segments`: Number of memory segments
- `pages`: Page allocation stats

---

## Bun Benchmarking

### Time Measurement APIs

```typescript
// High-resolution timing
const startNano = Bun.nanoseconds();
await someOperation();
const elapsedNano = Bun.nanoseconds() - startNano;
console.log(`Elapsed: ${elapsedNano / 1e6}ms`);

// Web-standard performance API
const startPerf = performance.now();
await someOperation();
const elapsedPerf = performance.now() - startPerf;
console.log(`Elapsed: ${elapsedPerf}ms`);

// Convert nanoseconds to Unix timestamp
const unixMs = performance.timeOrigin + (Bun.nanoseconds() / 1e6);
```

### Recommended Benchmarking Tools

**For HTTP Load Testing:**

Bun's `Bun.serve()` is extremely fast (100k+ req/sec). Use tools that can keep up:

| Tool | Install | Usage |
|------|---------|-------|
| [bombardier](https://github.com/codesenberg/bombardier) | `brew install bombardier` | `bombardier -c 100 -n 10000 http://localhost:3000/health` |
| [oha](https://github.com/hatoo/oha) | `brew install oha` | `oha -c 100 -n 10000 http://localhost:3000/health` |
| [k6](https://k6.io/) | `brew install k6` | `k6 run test/k6/smoke/health-smoke.ts` |

**Avoid** Node.js-based tools like `autocannon` - they're not fast enough to properly benchmark Bun.

**For Script/CLI Benchmarking:**

| Tool | Install | Usage |
|------|---------|-------|
| [hyperfine](https://github.com/sharkdp/hyperfine) | `brew install hyperfine` | `hyperfine --warmup 3 'bun src/index.ts --help'` |

**For Microbenchmarks:**

Use [mitata](https://github.com/evanwashere/mitata) for precise function-level benchmarking:

```typescript
import { bench, run } from "mitata";

bench("JSON.parse", () => {
  JSON.parse('{"hello": "world"}');
});

bench("Bun.hash", () => {
  Bun.hash("hello world");
});

await run();
```

### Load Testing Workflow

```bash
# 1. Start server
bun run dev &

# 2. Warm up
curl http://localhost:3000/health

# 3. Run load test with bombardier
bombardier -c 100 -d 30s http://localhost:3000/health

# 4. Run with profiling enabled
bun --cpu-prof-md --cpu-prof-dir ./profiles src/index.ts &
bombardier -c 100 -d 30s http://localhost:3000/health
kill %1  # Stop server, profile saved

# 5. Analyze profile
cat profiles/*.cpuprofile.md
```

---

## Zed IDE Tasks

The following Zed tasks are available for profiling (press `Cmd+Shift+P` > "task: spawn"):

### Bun Native Profiling (via package.json)

| Task | Description | Script |
|------|-------------|--------|
| `bun-prof: cpu (Chrome DevTools)` | Generate `.cpuprofile` for Chrome DevTools | `profile:cpu` |
| `bun-prof: cpu-md (Markdown/LLM)` | Generate markdown CPU profile | `profile:cpu:md` |
| `bun-prof: cpu-both (JSON + Markdown)` | Generate both formats | `profile:cpu:both` |
| `bun-prof: heap (Chrome DevTools)` | Generate `.heapsnapshot` for Chrome DevTools | `profile:heap` |
| `bun-prof: heap-md (Markdown/LLM)` | Generate markdown heap profile | `profile:heap:md` |
| `bun-prof: full (CPU + Heap)` | Combined CPU + heap profiling | `profile:full` |
| `bun-prof: test with cpu profile` | Run tests with CPU profiling | `profile:test` |
| `bun-prof: test with heap profile` | Run tests with heap profiling | `profile:test:heap` |

### Bun Memory Analysis (observation tasks)

| Task | Description |
|------|-------------|
| `bun-mem: heap stats (runtime)` | Show JS heap stats via `bun:jsc` |
| `bun-mem: gc (force sync)` | Force garbage collection |
| `bun-mem: native heap stats (mimalloc)` | Show native heap stats on exit |
| `bun-mem: snapshot (generate heap.json)` | Generate heap snapshot for Safari DevTools |
| `bun-mem: object type counts` | Show top 20 object types by count |

### Benchmarking (observation tasks)

| Task | Description |
|------|-------------|
| `bench: time precision test` | Test `Bun.nanoseconds()` and `performance.now()` |
| `bench: server with bombardier` | HTTP load test with bombardier |
| `bench: server with oha` | HTTP load test with oha |
| `bench: script with hyperfine` | Benchmark CLI with hyperfine |
| `bench: bun version info` | Show Bun version and revision |

### Existing Service Profiling

| Task | Description |
|------|-------------|
| `profile: tokens` | Profile token generation scenario |
| `profile: health` | Profile health endpoint |
| `profile: list` | List profile files |
| `profile: cleanup (dry run)` | Preview profile cleanup |

### Profile Management Tasks

| Task | Description |
|------|-------------|
| `bun-prof: list root profiles` | List all `.cpuprofile`, `.md`, `.json` files in root `profiles/` |
| `bun-prof: archive all (to dated folder)` | Move root profiles to `profiles/archive/YYYYMMDD_HHMMSS/` |
| `bun-prof: clear root profiles` | Delete all root-level profile files (no backup) |
| `bun-prof: clean start (archive + ready)` | Archive existing profiles, ready for new clean run |
| `bun-prof: show archive folders` | List the 10 most recent archive folders |

**Clean Start Workflow:**
1. Run `bun-prof: clean start (archive + ready)` to archive existing profiles
2. Run your profiling task (e.g., `bun-prof: cpu-md` or `bun-prof: full`)
3. Your new profiles will be the only ones in `profiles/`

---

## Profile Directory Structure

The `profiles/` directory has a structured layout for organizing different types of profile data:

```
profiles/
├── *.cpuprofile           # Root: Raw Bun CPU profiles (Chrome DevTools format)
├── *.md                   # Root: Bun markdown profiles (CPU/Heap)
├── heap-safari-*.json     # Root: Safari WebKit heap snapshots (JSON format)
├── current/               # Active profiles from scenario scripts
│   └── tokens-*.md
├── archive/               # Date-organized archived profiles
│   ├── 20260226_143022/   # Archived batch (YYYYMMDD_HHMMSS)
│   │   ├── CPU.*.cpuprofile
│   │   └── Heap.*.md
│   └── 20260225_091500/
├── baselines/             # Permanent baseline profiles for comparison
│   └── v1.0-baseline.md
└── auto/                  # Auto-triggered profiles from SLA violations
    └── tokens-sla-violation-*.md
```

| Directory | Purpose | Retention |
|-----------|---------|-----------|
| `profiles/` (root) | Raw Bun profiler output | Manual cleanup via tasks |
| `profiles/current/` | Active scenario profiles | 24 hours |
| `profiles/archive/` | Archived profiles | 7 days |
| `profiles/baselines/` | Permanent baselines | Never deleted |
| `profiles/auto/` | SLA violation auto-profiles | 7 days |

**Configuration:**
- Auto-profile output directory: `CONTINUOUS_PROFILING_OUTPUT_DIR` (default: `profiles/auto`)
- See `src/config/defaults.ts` for SLA thresholds that trigger auto-profiling

---

## Analysis Reports

After profiling, you'll see an enhanced analysis report with:

1. **Performance Summary**: SLA compliance status
2. **Top CPU Consumers**: Table of hottest functions
3. **Memory Usage**: Heap statistics and growth
4. **Optimization Opportunities**: Severity-ranked recommendations

Example recommendation:
```markdown
### HIGH: Kong Cache
**Issue**: Kong consumer lookups consuming 23.1% CPU time (target: <15%)
**Expected Impact**: -10-15ms P95 latency, -20% Kong API calls
**Action Items**:
1. Increase CACHING_TTL_SECONDS from 300 to 600 in .env
2. Review cache invalidation logic in src/services/kong/consumer.service.ts
3. Monitor metric: kong_cache_hits_total / kong_operations_total
```

---

## Common Workflows

### Workflow 1: Optimizing Token Generation

**Goal**: Reduce token generation latency from P95 100ms to <80ms

```bash
# Step 1: Create baseline profile
bun run profile:scenario:tokens

# Step 2: Review analysis and identify bottlenecks

# Step 3: Implement optimization

# Step 4: Profile after optimization
bun run profile:scenario:tokens

# Step 5: Compare results

# Step 6: Archive baseline
bun scripts/profiling/archive-profile.ts \
  --profile=profiles/current/tokens-old.cpu-prof.md \
  --label="baseline-v1.0"
```

### Workflow 2: Investigating Production Slowness

**Scenario**: Production experiencing elevated P95 latency

```bash
# Step 1: Enable continuous profiling (in production .env)
CONTINUOUS_PROFILING_ENABLED=true
CONTINUOUS_PROFILING_AUTO_TRIGGER_ON_SLA=true
CONTINUOUS_PROFILING_THROTTLE_MINUTES=60

# Step 2: Wait for automatic SLA violation trigger
# System will automatically profile when thresholds exceeded

# Step 3: Review auto-generated profiles
ls -lh profiles/auto/

# Step 4: Analyze the profile
cat profiles/auto/tokens-*.cpu-prof.md
```

### Workflow 3: K6 Performance Testing with Profiling

```bash
# Step 1: Run K6 test with profiling enabled
ENABLE_PROFILING=true K6_SMOKE_VUS=10 K6_SMOKE_DURATION=30s \
  bun run test:k6:smoke:health

# Step 2: Review profile in test/results/profiling/

# Step 3: Optimize based on recommendations

# Step 4: Re-run to validate improvement
```

### Workflow 4: Memory Leak Investigation

```bash
# Step 1: Profile with longer duration for heap analysis
bun run profile:scenario:mixed --duration=300  # 5 minutes

# Step 2: Check for heap growth in analysis

# Step 3: If leak detected, run detailed heap profiling
bun --heap-prof-md --heap-prof-dir=profiles/heap src/server.ts &
SERVER_PID=$!

# Generate load for 10 minutes
sleep 600

# Stop server to capture heap profile
kill -SIGTERM $SERVER_PID

# Step 4: Analyze heap profile
ls -lh profiles/heap/Heap.*.md
```

---

## Configuration

### Environment Variables

```bash
# Continuous Profiling (SLA Monitor)
CONTINUOUS_PROFILING_ENABLED=false              # Enable automatic profiling
CONTINUOUS_PROFILING_AUTO_TRIGGER_ON_SLA=true   # Trigger on SLA violations
CONTINUOUS_PROFILING_THROTTLE_MINUTES=60        # Min minutes between triggers
CONTINUOUS_PROFILING_OUTPUT_DIR=profiles/auto   # Output directory
CONTINUOUS_PROFILING_MAX_CONCURRENT=1           # Max concurrent sessions

# SLA Thresholds (configured in src/config/defaults.ts)
# /tokens: P95 100ms, P99 200ms
# /tokens/validate: P95 50ms, P99 100ms
# /health: P95 400ms, P99 500ms
```

### Production Safety Controls

1. **CPU Overhead Monitoring**: Max 2% overhead from profiling
2. **Concurrent Session Limit**: Max 1 profiling session at a time
3. **Storage Quota**: Max 1GB of profile data
4. **Automatic Throttling**: Min 60 minutes between auto-triggered profiles
5. **Graceful Degradation**: Profiling disabled if overhead exceeds limits

### Container Deployment (Fargate/Kubernetes)

Container environments with read-only filesystems require special configuration for profiling output.

**Problem**: DHI distroless containers have `readOnlyRootFilesystem: true`, causing:
```
EROFS: read-only file system, mkdir 'profiles'
```

**Automatic Detection**: The configuration loader auto-detects container environments and adjusts the output directory:

| Environment | Detection Method | Default Output Dir |
|-------------|-----------------|-------------------|
| Local/Dev | No container env vars | `profiles/auto` |
| AWS Fargate | `ECS_CONTAINER_METADATA_URI_V4` | `/tmp/profiles` |
| Kubernetes | `KUBERNETES_SERVICE_HOST` | `/tmp/profiles` |

**Configuration Priority** (4-Pillar Pattern):
1. `CONTINUOUS_PROFILING_OUTPUT_DIR` env var (highest priority)
2. Auto-detected container path (`/tmp/profiles`)
3. Default from `defaults.ts` (`profiles/auto`)

**AWS Fargate Setup**:

Add a bind mount volume in your ECS Task Definition:

```json
{
  "containerDefinitions": [{
    "name": "authentication-service",
    "mountPoints": [{
      "sourceVolume": "tmp-storage",
      "containerPath": "/tmp",
      "readOnly": false
    }]
  }],
  "volumes": [{
    "name": "tmp-storage"
  }],
  "ephemeralStorage": {
    "sizeInGiB": 21
  }
}
```

**Kubernetes Setup**:

The existing `k8s/deployment.yaml` already mounts `/tmp` as an emptyDir volume. Add to ConfigMap:

```yaml
# k8s/configmap.yaml
data:
  CONTINUOUS_PROFILING_OUTPUT_DIR: "/tmp/profiles"
```

**Storage Considerations**:
- Fargate ephemeral storage: 20GB default (expandable to 200GB)
- Kubernetes emptyDir: 100Mi limit (configurable in deployment.yaml)
- Profiles are ephemeral and lost on pod restart
- For persistent profiles, consider mounting an EFS/PVC volume

---

## Performance Targets

### SLA Thresholds

| Endpoint | P95 Target | P99 Target |
|----------|-----------|------------|
| GET /tokens | <100ms | <200ms |
| GET /tokens/validate | <50ms | <100ms |
| GET /health | <400ms | <500ms |

### CPU Budget

| Operation | Target |
|-----------|--------|
| JWT signing | <40% CPU time |
| Kong operations | <15% CPU time |
| JSON serialization | <8% CPU time |
| HTTP overhead | <12% CPU time |

### Memory Budget

| Metric | Target |
|--------|--------|
| Heap usage | <200MB steady state |
| Heap growth | <50MB per hour |
| Peak heap | <300MB under load |

---

## Profiling API Endpoints

All profiling endpoints are restricted to development and staging environments only.

### POST /debug/profiling/start

Start a profiling session.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Profiling session started",
  "sessionId": "prof-12345",
  "devToolsUrl": "chrome-devtools://devtools/bundled/inspector.html?ws=localhost:9229/12345"
}
```

### POST /debug/profiling/stop

Stop the current profiling session.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Profiling session stopped",
  "sessionId": "prof-12345",
  "duration": "45.2s",
  "artifacts": [
    "profiling/profile-12345.cpuprofile",
    "profiling/heap-12345.heapsnapshot"
  ]
}
```

### GET /debug/profiling/status

Check profiling system status.

### GET /debug/profiling/reports

List available profiling reports.

### DELETE /debug/profiling/cleanup

Clean up profiling artifacts and sessions.

---

## Storage Management

```bash
# Check current storage usage
du -sh profiles/

# Dry run cleanup (see what would be deleted)
bun scripts/profiling/cleanup-profiles.ts --dry-run

# Clean profiles (24h current, 7d archive)
bun scripts/profiling/cleanup-profiles.ts

# Clean with custom retention
bun scripts/profiling/cleanup-profiles.ts \
  --current-retention-hours=12 \
  --archive-retention-days=3

# Enforce storage quota
bun scripts/profiling/cleanup-profiles.ts --max-storage-gb=0.5
```

---

## Bun Fetch Curl Fallback (SIO-288)

### Problem

Bun v1.3.x has known networking bugs that cause `fetch()` to fail when connecting to services on local/private IP addresses (e.g., `192.168.x.x`, `10.x.x.x`), even when the service is reachable via curl.

**Symptoms:**
- `fetch()` throws `FailedToOpenSocket: Was there a typo in the url or port?` errors
- `fetch()` throws `ConnectionRefused` errors
- Same URL works perfectly with `curl` command
- Affects Kong Admin API and OTEL collector connections on private IPs
- Error occurs almost immediately (~12ms) rather than timing out

**Known Bun Issues:**
- https://github.com/oven-sh/bun/issues/3327 - Socket pooling bug (CLOSE_WAIT accumulation)
- https://github.com/oven-sh/bun/issues/10731 - DNS/IPv4 vs IPv6 issues (fixed in v1.1.9)
- https://github.com/oven-sh/bun/issues/9917 - Windows/Docker FailedToOpenSocket
- https://github.com/oven-sh/bun/issues/24001 - Proxy/Unix socket options bug
- https://github.com/oven-sh/bun/issues/1425 - ConnectionRefused on localhost
- https://github.com/oven-sh/bun/issues/6885 - Bun doesn't understand "localhost"

### Solution: fetchWithFallback()

We've implemented automatic curl fallback when Bun's native fetch fails.

```typescript
import { fetchWithFallback } from './utils/bun-fetch-fallback';

// Use exactly like native fetch
const response = await fetchWithFallback('http://192.168.178.3:30001/status');
const data = await response.json();
```

**Behavior:**
1. Try native `fetch()` first (preferred for performance)
2. If fetch fails, automatically retry via `curl` subprocess
3. Return standard Response object in both cases
4. Check AbortSignal before and after curl execution (proper abort handling)

### AbortSignal Support

The curl fallback properly supports `AbortSignal` for request cancellation:

```typescript
// Abortable request with timeout
const response = await fetchWithFallback(url, {
  signal: AbortSignal.timeout(5000)
});
```

**Features:**
- Pre-check: Throws `AbortError` immediately if already aborted before curl starts
- Post-check: Throws `AbortError` if aborted during curl execution
- Prevents unnecessary curl subprocess when request is already cancelled
- Uses curl's own timeout (`-m 3`, `--connect-timeout 2`) instead of passing signal to subprocess

**Reference:** Commit e42d824 (2026-02-14) - Fix fetch polyfill recursive call and add AbortSignal support

### HEAD Request Handling

The curl fallback uses `-I` flag for HEAD requests instead of `-X HEAD`:

```bash
# Correct (returns exit code 0)
curl -s -I -m 3 http://192.168.178.3:4318/v1/traces

# Incorrect (returns exit code 28 timeout even with valid response)
curl -s -i -X HEAD -m 3 http://192.168.178.3:4318/v1/traces
```

**Why this matters:**
- `-X HEAD` waits for connection to fully close, causing timeouts
- `-I` properly handles HEAD semantics and exits immediately
- Health checks to OTEL endpoints return 405 (Method Not Allowed) which is < 500, so treated as healthy

**Implementation Details:**
```typescript
// In fetchViaCurl()
if (method === "HEAD") {
  args.push("-I");  // Use -I for HEAD requests
} else {
  args.push("-i", "-X", method);  // Use -X for other methods
}
```

**Reference:** 2026-02-20 - Fix HEAD request handling and signal timeout issues

### Performance Impact

| Scenario | Latency | Notes |
|----------|---------|-------|
| Successful fetch | ~5-10ms | No fallback needed |
| Failed fetch + curl success | ~40-60ms | Acceptable for fallback |
| Failed fetch + curl timeout | ~3000ms | Curl timeout limit |
| Both fail | ~3050ms | Operation fails with original error |

**Key Points:**
- Zero overhead when native fetch succeeds (happy path)
- Curl fallback only activates on fetch failure
- Curl uses its own 3-second timeout, not the AbortSignal (prevents 5s+ waits)
- Health handler tests: 81s reduced to 2.3s after fixes

### When to Use

**Use `fetchWithFallback()` for:**
- Kong Admin API requests (already integrated)
- External service calls to local IPs
- Integration tests connecting to remote services

**Use native `fetch()` for:**
- Public internet URLs
- Localhost URLs
- Performance-critical paths

### Verification

```bash
# Test curl fallback is working
LOG_LEVEL=debug bun run dev

# Make request to Kong on local IP
curl -X POST http://localhost:3000/tokens \
  -H "X-Consumer-ID: test-consumer" \
  -H "X-Consumer-Username: test-consumer"

# Look for logs showing:
# - "Fetch failed, trying curl fallback"
# - "Curl fallback successful"
```

---

## Troubleshooting

### Profile Not Generated

**Symptom**: No .md files in profiles/ after running profile command

**Solutions**:
1. Check server started successfully: `curl http://localhost:3000/health`
2. Verify Bun version: `bun --version` (requires 1.3+)
3. Check for permission errors: `ls -la profiles/`
4. Increase profile duration: `bun run profile:scenario:tokens --duration=60`

### EROFS: Read-Only File System Error

**Symptom**: `EROFS: read-only file system, mkdir 'profiles'` in container logs

**Cause**: Container running with `readOnlyRootFilesystem: true` (DHI distroless)

**Solutions**:

1. **AWS Fargate**: Add bind mount for `/tmp` in ECS Task Definition:
   ```json
   {
     "volumes": [{ "name": "tmp-storage" }],
     "containerDefinitions": [{
       "mountPoints": [{
         "sourceVolume": "tmp-storage",
         "containerPath": "/tmp"
       }]
     }]
   }
   ```

2. **Kubernetes**: Verify `/tmp` emptyDir is mounted (already in `k8s/deployment.yaml`)

3. **Verify auto-detection**:
   ```bash
   # Check environment variables in container
   env | grep -E "(ECS_CONTAINER|KUBERNETES_SERVICE)"

   # Should see one of:
   # ECS_CONTAINER_METADATA_URI_V4=... (Fargate)
   # KUBERNETES_SERVICE_HOST=... (K8s)
   ```

4. **Manual override**: Set `CONTINUOUS_PROFILING_OUTPUT_DIR=/tmp/profiles`

### Empty or Incomplete Profile

**Solutions**:
1. Ensure load was generated during profiling window
2. Check server didn't crash
3. Verify SIGTERM was sent correctly (not SIGKILL)

### Storage Quota Exceeded

```bash
# Check current usage
du -sh profiles/

# Clean old profiles
bun scripts/profiling/cleanup-profiles.ts

# Increase quota
CONTINUOUS_PROFILING_MAX_STORAGE_GB=2
```

### SLA Monitor Not Triggering

1. Verify configuration: `curl http://localhost:3000/health | jq .slaMonitor`
2. Check latency actually exceeds thresholds
3. Verify throttling hasn't blocked trigger

### Curl Fallback Issues

**Tests still failing with local IP:**
```bash
# Verify curl is available
which curl

# Test curl directly
curl -I http://192.168.178.3:30001/status

# Check .env has correct Kong URL
grep KONG_ADMIN_URL .env
```

**Fallback seems slow:**
- Expected: 50-100ms latency (acceptable for error recovery)
- Consider SSH tunnel for faster localhost access

---

## Best Practices

1. **Always baseline before optimizing**: Create a baseline profile before making changes
2. **Profile production-like load**: Use realistic request rates and patterns
3. **Profile for sufficient duration**: Minimum 30 seconds for meaningful data
4. **Review full reports**: Check recommendations, not just top functions
5. **Archive important profiles**: Keep baselines and key optimization milestones
6. **Monitor overhead**: Check that profiling itself doesn't impact performance
7. **Clean up regularly**: Run cleanup script weekly to manage storage
8. **Use SLA monitoring**: Enable continuous profiling for automatic detection
9. **Compare before/after**: Always validate optimizations with new profiles
10. **Document findings**: Note what you changed and why in commit messages

---

## Related Documentation

- [Getting Started](./getting-started.md) - Development setup
- [Testing Guide](./testing.md) - Test execution
- [Monitoring](../operations/monitoring.md) - OpenTelemetry observability
- [SLA Guide](../operations/sla.md) - Performance targets
- [Troubleshooting](../operations/troubleshooting.md) - Runbook
