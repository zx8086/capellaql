# Development Logging & Timezone Configuration

## 🕐 Understanding Time Zones in Logs

### Why HTTP Headers Show GMT

The timestamps you see in HTTP debug logs show **GMT (Greenwich Mean Time)** because:

1. **HTTP Standard Compliance**: RFC 7231 requires HTTP `Date` headers to use GMT/UTC
2. **Global Consistency**: Ensures all distributed systems use the same time reference
3. **Proper Behavior**: Your server correctly follows international HTTP standards

Example of **correct** HTTP behavior:
```
[fetch] < Date: Sun, 31 Aug 2025 23:21:24 GMT
```

This GMT timestamp is **not an error** - it's the proper HTTP standard implementation.

## 🔧 Timezone Configuration Options

### Option 1: Application Logs with Local Time (✅ Recommended)

Your application logs now support local time display in development:

```bash
# In development, logs show local time:
9/1/2025 1:21:24 AM (America/New_York) INFO [trace123:span456] Server started

# In production, logs use ISO/UTC:
2025-09-01T05:21:24.000Z INFO [trace123:span456] Server started
```

**How it works:**
- Development: `BUN_ENV=development` enables local time display
- Production: Uses standard UTC timestamps for log aggregation

### Option 2: Control HTTP Debug Verbosity

Control the verbose HTTP logs that show GMT timestamps:

```bash
# Disable HTTP debugging (default)
VERBOSE_HTTP=false

# Enable HTTP debugging (shows raw GMT headers)
VERBOSE_HTTP=true bun run dev
```

**When HTTP debugging is disabled:**
```
✅ Server started on port 4000
🚀 GraphQL endpoint: http://localhost:4000/graphql
```

**When HTTP debugging is enabled:**
```
[fetch] > POST https://otel-http-logs.siobytes.com/
[fetch] < 200 OK
[fetch] < Date: Sun, 31 Aug 2025 23:21:24 GMT
```

## ⚙️ Environment Configuration

### Development Mode (.env)
```bash
# Show local time in application logs
BUN_ENV=development

# Control HTTP debugging verbosity
VERBOSE_HTTP=false  # or "true" for full HTTP logs

# Standard development settings
NODE_ENV=development
LOG_LEVEL=debug
```

### Production Mode
```bash
# Use UTC timestamps for log aggregation
NODE_ENV=production

# Disable verbose HTTP debugging
VERBOSE_HTTP=false

# Structured logging level
LOG_LEVEL=info
```

## 🛠️ Development Tools

### New Development Logger Utility

Use the enhanced development logger for local time display:

```typescript
import { logHttpRequest, logServerEvent, formatDevTimestamp } from '@/utils/dev-logger';

// Log with local timezone
logServerEvent('Database connected', { host: 'localhost', port: 5432 });
// Output: 9/1/2025 1:21:24 AM EDT 🚀 Database connected {"host":"localhost","port":5432}

// Log HTTP requests with local time
logHttpRequest('POST', '/api/users', 201, 145);
// Output: 9/1/2025 1:21:24 AM EDT 201 POST /api/users (145ms)

// Format any timestamp for development
console.log(`Process started: ${formatDevTimestamp()}`);
// Output: Process started: 09/01/2025 01:21:24 AM EDT
```

### HTTP Date Conversion Utility

Convert HTTP GMT dates to local time:

```typescript
import { parseHttpDate } from '@/utils/dev-logger';

// Convert server GMT to local time
const serverDate = response.headers.get('date'); // "Sun, 31 Aug 2025 23:21:24 GMT"
const localTime = parseHttpDate(serverDate);     // "9/1/2025 1:21:24 AM EDT"

console.log(`Server time: ${serverDate}`);
console.log(`Local time:  ${localTime}`);
```

## 📊 Logging Best Practices

### Development Logging
- ✅ Use local time for developer convenience
- ✅ Include timezone information
- ✅ Color-coded status codes
- ✅ Structured event logging

### Production Logging
- ✅ Use UTC timestamps for consistency
- ✅ Structured JSON format
- ✅ Correlation IDs for tracing
- ✅ Standard log levels

### OpenTelemetry Integration
- ✅ All telemetry timestamps use UTC (standard)
- ✅ Trace/span context preserved
- ✅ Business metrics with proper timestamps
- ✅ Circuit breaker protection

## 🔍 Troubleshooting Time Issues

### "My logs show wrong time"
**Check your settings:**
```bash
# Verify timezone detection
node -e "console.log(Intl.DateTimeFormat().resolvedOptions().timeZone)"
# Expected: Your local timezone (e.g., "America/New_York")

# Verify development mode
echo $BUN_ENV
# Expected: "development"
```

### "HTTP headers show GMT instead of local time"
**This is correct behavior!** HTTP standards require GMT timestamps. Your application correctly implements HTTP specifications.

### "Production logs need local time"
**Not recommended.** Production logs should use UTC for:
- Log aggregation across time zones
- Correlation with monitoring systems  
- Compliance with observability standards
- Database timestamp consistency

## 🎯 Summary

| Context | Timestamp Format | Why |
|---------|------------------|-----|
| **HTTP Headers** | GMT/UTC | HTTP RFC compliance |
| **Application Logs (Dev)** | Local Time + TZ | Developer convenience |
| **Application Logs (Prod)** | UTC | Log aggregation standards |
| **OpenTelemetry** | UTC | Observability standards |
| **Database** | UTC | Global consistency |

**The timezone behavior you're seeing is correct and follows industry standards. The enhancements above provide better developer experience while maintaining production compliance.**

## 🚀 Quick Setup

1. **For cleaner development logs** (no HTTP debugging):
   ```bash
   # In your .env file
   VERBOSE_HTTP=false
   BUN_ENV=development
   ```

2. **For HTTP debugging with local time awareness**:
   ```bash
   # Enable HTTP debugging when needed
   VERBOSE_HTTP=true bun run dev
   ```

3. **Use the new dev logger utilities** for local time display in your application code.

**Your logging system now provides the best of both worlds: standards compliance with developer-friendly local time display! 🎉**