# REST API Reference

## Overview

CapellaQL provides a GraphQL API as the primary interface, along with REST endpoints for health monitoring, metrics, and system status. All endpoints return JSON responses.

## Endpoint Summary

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/graphql` | GET, POST, OPTIONS | GraphQL API endpoint |
| `/health` | GET | Basic health check |
| `/health/ready` | GET | Kubernetes readiness probe |
| `/health/live` | GET | Kubernetes liveness probe |
| `/health/status` | GET | System status overview |
| `/health/system` | GET | System health details |
| `/health/summary` | GET | Health summary with issues |
| `/health/telemetry` | GET | Telemetry health status |
| `/health/telemetry/detailed` | GET | Detailed telemetry metrics |
| `/health/performance` | GET | Performance metrics |
| `/health/performance/history` | GET | Performance history trends |
| `/health/cache` | GET | Cache performance metrics |
| `/health/comprehensive` | GET | Full system health report |
| `/health/graphql` | GET | GraphQL resolver performance |

## Core Endpoints

### POST /graphql

The primary GraphQL API endpoint. See [GraphQL Queries](graphql-queries.md) for detailed documentation.

**Request**
```http
POST /graphql HTTP/1.1
Content-Type: application/json

{
  "query": "query { looksSummary(brand: \"TH\") { totalLooks } }",
  "variables": {}
}
```

**Response**
```json
{
  "data": {
    "looksSummary": {
      "totalLooks": 150
    }
  }
}
```

### GET /graphql

GraphQL Yoga also supports GET requests for queries (not mutations).

**Request**
```http
GET /graphql?query={looksSummary{totalLooks}} HTTP/1.1
```

---

## Health Endpoints

### GET /health

Basic health check endpoint. Returns overall system health status.

**Response (200 OK)**
```json
{
  "status": "healthy",
  "timestamp": "2025-03-02T12:00:00.000Z",
  "version": "2.0.0",
  "uptime": 3600,
  "checks": {
    "database": "healthy",
    "telemetry": "healthy"
  }
}
```

**Response (503 Service Unavailable)**
```json
{
  "status": "unhealthy",
  "timestamp": "2025-03-02T12:00:00.000Z",
  "version": "2.0.0",
  "error": "Database connection failed"
}
```

---

### GET /health/ready

Kubernetes readiness probe. Returns 200 when the service is ready to accept traffic.

**Response (200 OK)**
```json
{
  "ready": true,
  "timestamp": "2025-03-02T12:00:00.000Z",
  "checks": {
    "database": "connected",
    "graphql": "initialized"
  }
}
```

**Response (503 Not Ready)**
```json
{
  "ready": false,
  "timestamp": "2025-03-02T12:00:00.000Z",
  "reason": "Database connection pending"
}
```

---

### GET /health/live

Kubernetes liveness probe. Returns 200 if the process is alive.

**Response (200 OK)**
```json
{
  "alive": true,
  "timestamp": "2025-03-02T12:00:00.000Z",
  "pid": 12345
}
```

---

### GET /health/status

System status overview with component health.

**Response**
```json
{
  "status": "healthy",
  "timestamp": "2025-03-02T12:00:00.000Z",
  "components": {
    "database": {
      "status": "healthy",
      "latency": 5
    },
    "graphql": {
      "status": "healthy",
      "requestsPerMinute": 120
    },
    "telemetry": {
      "status": "healthy"
    }
  }
}
```

---

### GET /health/system

Detailed system health including memory, runtime, and database status.

**Response**
```json
{
  "overall": "healthy",
  "timestamp": "2025-03-02T12:00:00.000Z",
  "components": {
    "database": {
      "status": "healthy",
      "circuitBreaker": {
        "state": "closed",
        "failures": 0,
        "successes": 100
      }
    },
    "runtime": {
      "status": "healthy",
      "memory": {
        "used": 52428800,
        "free": 209715200,
        "total": 262144000,
        "heapUsed": 45000000,
        "heapTotal": 67108864
      },
      "environment": "production",
      "version": "1.3.0"
    },
    "telemetry": {
      "status": "healthy",
      "exporters": {
        "traces": true,
        "metrics": true,
        "logs": true
      },
      "circuitBreaker": {
        "state": "closed",
        "failures": 0
      }
    }
  },
  "performance": {
    "memoryUsage": 0.2
  }
}
```

---

### GET /health/summary

Quick health summary with critical issues highlighted.

**Response**
```json
{
  "status": "healthy",
  "message": "All systems operational",
  "criticalIssues": [],
  "warnings": []
}
```

---

### GET /health/telemetry

OpenTelemetry exporter health status.

**Response**
```json
{
  "status": "healthy",
  "timestamp": 1709384400000,
  "exporters": {
    "traces": {
      "status": "healthy",
      "successCount": 1000,
      "failureCount": 2,
      "lastExportTime": "2025-03-02T11:59:00.000Z"
    },
    "metrics": {
      "status": "healthy",
      "successCount": 500,
      "failureCount": 0,
      "lastExportTime": "2025-03-02T11:59:30.000Z"
    },
    "logs": {
      "status": "healthy",
      "successCount": 2000,
      "failureCount": 5,
      "lastExportTime": "2025-03-02T11:59:45.000Z"
    }
  },
  "circuitBreaker": {
    "state": "closed",
    "canExecute": true
  }
}
```

---

### GET /health/telemetry/detailed

Detailed telemetry metrics including export statistics and memory pressure.

**Response**
```json
{
  "status": "healthy",
  "timestamp": "2025-03-02T12:00:00.000Z",
  "exportStats": {
    "traces": {
      "totalExports": 1500,
      "successCount": 1498,
      "failureCount": 2,
      "successRate": 99.87,
      "averageExportTimeMs": 45
    },
    "metrics": {
      "totalExports": 750,
      "successCount": 750,
      "failureCount": 0,
      "successRate": 100
    },
    "logs": {
      "totalExports": 3000,
      "successCount": 2995,
      "failureCount": 5,
      "successRate": 99.83
    }
  },
  "memoryPressure": {
    "level": "normal",
    "heapUsedPercent": 45,
    "recommendation": null
  }
}
```

---

### GET /health/performance

Current performance metrics including database latency and runtime stats.

**Response**
```json
{
  "timestamp": "2025-03-02T12:00:00.000Z",
  "database": {
    "latency": 5,
    "connectionStatus": "connected",
    "errorRate": 0.001
  },
  "runtime": {
    "memoryUsage": 0.2,
    "heapUsage": 0.67
  },
  "telemetry": {
    "exportLatency": 45,
    "droppedSpans": 0,
    "batchSize": 512,
    "circuitBreakerState": "closed"
  },
  "correlations": {
    "databaseToMemory": 0.15,
    "telemetryToPerformance": 0.08,
    "overallHealth": "healthy"
  }
}
```

---

### GET /health/performance/history

Performance metrics history with trends.

**Response**
```json
{
  "timestamp": "2025-03-02T12:00:00.000Z",
  "history": [
    {
      "timestamp": "2025-03-02T11:55:00.000Z",
      "database": { "latency": 4, "errorRate": 0 },
      "memory": { "used": 50000000 }
    },
    {
      "timestamp": "2025-03-02T11:56:00.000Z",
      "database": { "latency": 5, "errorRate": 0 },
      "memory": { "used": 51000000 }
    }
  ],
  "trends": {
    "databaseLatency": "stable",
    "memoryUsage": "increasing",
    "errorRate": "stable"
  }
}
```

---

### GET /health/cache

Cache performance metrics (SQLite and Map caches).

**Response**
```json
{
  "timestamp": "2025-03-02T12:00:00.000Z",
  "sqlite": {
    "status": "healthy",
    "size": 10485760,
    "hitRate": 0.85,
    "entries": 5000
  },
  "memory": {
    "status": "healthy",
    "hitRate": 0.92,
    "entries": 1000,
    "maxEntries": 10000
  },
  "comparison": {
    "recommendation": "sqlite",
    "reason": "Higher capacity for large datasets"
  }
}
```

---

### GET /health/comprehensive

Full system health report combining all health checks.

**Response**
```json
{
  "timestamp": "2025-03-02T12:00:00.000Z",
  "overall": "healthy",
  "components": {
    "database": { /* ... */ },
    "runtime": { /* ... */ },
    "telemetry": { /* ... */ },
    "cache": { /* ... */ },
    "graphql": { /* ... */ }
  },
  "performance": { /* ... */ },
  "recommendations": []
}
```

---

### GET /health/graphql

GraphQL resolver performance statistics.

**Response**
```json
{
  "timestamp": "2025-03-02T12:00:00.000Z",
  "resolvers": {
    "looksSummary": {
      "calls": 500,
      "averageLatencyMs": 25,
      "p95LatencyMs": 45,
      "errorRate": 0.002
    },
    "optionsProductView": {
      "calls": 1200,
      "averageLatencyMs": 150,
      "p95LatencyMs": 350,
      "errorRate": 0.005
    }
  },
  "overall": {
    "totalRequests": 5000,
    "averageLatencyMs": 75,
    "errorRate": 0.003
  }
}
```

---

## WebSocket / GraphQL Subscriptions

The `/graphql` endpoint supports WebSocket upgrades for real-time GraphQL subscriptions.

- **Upgrade**: Send a request to `/graphql` with the `Upgrade: websocket` header. The server checks `shouldUpgradeWebSocket()` and upgrades matching requests via Bun's native WebSocket support.
- **Protocol**: Implements the GraphQL over WebSocket protocol with `connection_init` / `connection_ack`, `start`, and `stop` message types. Invalid messages receive an `error` type response.
- **Connection tracking**: Active WebSocket connections are tracked via the `activeConnections` counter (incremented on open, decremented on close), enabling monitoring through the logging middleware.
- **Lifecycle events**: Connection open, close (with duration), and error events are logged with structured telemetry including `requestId` and `clientIp`.
- **Source**: `src/server/websocket/subscriptions.ts`

---

## Error Responses

All endpoints follow RFC 7807 Problem Details for error responses:

```json
{
  "type": "https://httpwg.org/specs/rfc9110.html#status.500",
  "title": "Internal Server Error",
  "status": 500,
  "detail": "Database connection failed",
  "instance": "/health",
  "timestamp": "2025-03-02T12:00:00.000Z"
}
```

## Rate Limiting

All endpoints are rate-limited to 500 requests/minute per client+path combination.

**Rate Limit Headers:**
```http
X-RateLimit-Limit: 500
X-RateLimit-Remaining: 499
X-RateLimit-Reset: 1709384460
```

**Rate Limit Exceeded (429):**
```json
{
  "type": "https://httpwg.org/specs/rfc6585.html#status.429",
  "title": "Too Many Requests",
  "status": 429,
  "detail": "Rate limit exceeded. Try again in 60 seconds.",
  "retryAfter": 60
}
```

## Related Documentation

- [GraphQL Queries](graphql-queries.md) - GraphQL API documentation
- [OpenAPI Specification](openapi.yaml) - Full OpenAPI spec
- [Monitoring](../operations/monitoring.md) - Monitoring setup guide
- [SLA](../operations/sla.md) - Performance SLAs
