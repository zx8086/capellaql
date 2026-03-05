# API Reference

## Endpoints Overview

The Authentication Service provides a RESTful API for JWT token generation and system monitoring. All endpoints return JSON responses with appropriate HTTP status codes.

## HTTP Method Validation (RFC 9110)

All endpoints enforce strict HTTP method validation per [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110). Invalid methods return `405 Method Not Allowed` with an `Allow` header listing valid methods.

### Allowed Methods by Endpoint

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/` | GET, OPTIONS | OpenAPI specification |
| `/tokens` | GET, OPTIONS | JWT token generation |
| `/tokens/validate` | GET, OPTIONS | Token validation |
| `/health` | GET, OPTIONS | Main health check |
| `/health/ready` | GET, OPTIONS | Readiness probe |
| `/health/telemetry` | GET, OPTIONS | Telemetry health |
| `/health/metrics` | GET, OPTIONS | Metrics health |
| `/metrics` | GET, OPTIONS | Operational metrics |
| `/debug/metrics/test` | POST, OPTIONS | Test metrics (debug) |
| `/debug/metrics/export` | POST, OPTIONS | Force export (debug) |
| `/debug/profiling/*` | POST, GET, OPTIONS | Profiling endpoints |

### Method Not Allowed Response (405)

```json
{
  "type": "https://httpwg.org/specs/rfc9110.html#status.405",
  "title": "Method Not Allowed",
  "status": 405,
  "detail": "POST is not allowed on /health. Allowed methods: GET, OPTIONS",
  "instance": "/health",
  "code": "AUTH_007",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-02-14T12:00:00.000Z"
}
```

**Response Headers**:
```http
HTTP/1.1 405 Method Not Allowed
Allow: GET, OPTIONS
Content-Type: application/problem+json
```

## Core Endpoints

### GET /
Returns the OpenAPI specification for the service.

**Features**:
- **ETag Support (RFC 7232)**: Returns SHA-256 based ETag for caching
- **Conditional Requests**: Supports `If-None-Match` header for 304 responses
- **Content Negotiation**: Returns JSON (default) or YAML based on `Accept` header

**Request**
```http
GET / HTTP/1.1
Host: auth-service.example.com
Accept: application/json
```

**Request with Conditional Caching**
```http
GET / HTTP/1.1
Host: auth-service.example.com
Accept: application/json
If-None-Match: "a1b2c3d4e5f6..."
```

**Response - JSON (200 OK)**
```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "Authentication Service API",
    "version": "1.0.0",
    "description": "JWT token generation service for Kong consumers"
  },
  "servers": [...],
  "paths": {...}
}
```

**Response - YAML (200 OK)**
```yaml
openapi: 3.0.0
info:
  title: Authentication Service API
  version: 1.0.0
  description: JWT token generation service for Kong consumers
```

**Response - Not Modified (304)**

When the client sends `If-None-Match` header matching the current ETag:
```http
HTTP/1.1 304 Not Modified
ETag: "a1b2c3d4e5f6..."
Cache-Control: public, max-age=300
```

**Response Headers (All 200 responses)**:
```http
ETag: "a1b2c3d4e5f6..."
Cache-Control: public, max-age=300
Content-Type: application/json
```

### GET /tokens
Issues a new JWT token for authenticated consumers.

**Request**
```http
GET /tokens HTTP/1.1
Host: auth-service.example.com
X-Consumer-ID: 98765432-9876-5432-1098-765432109876
X-Consumer-Username: example-consumer
X-Anonymous-Consumer: false
```

**Required Headers**
| Header | Type | Description |
|--------|------|-------------|
| `X-Consumer-ID` | UUID | Kong consumer identifier |
| `X-Consumer-Username` | String | Kong consumer username |
| `X-Anonymous-Consumer` | Boolean | Must be "false" or absent |

**Header Validation**
- Maximum header length: **256 characters** for `X-Consumer-ID` and `X-Consumer-Username`
- Headers exceeding this limit return `AUTH_007` (Invalid Request Format)
- This is a security measure to prevent injection attacks

**Response - Success (200 OK)**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 900
}
```

**Response Fields**
| Field | Type | Description |
|-------|------|-------------|
| `access_token` | String | JWT token string |
| `expires_in` | Integer | Token lifetime in seconds (default: 900 = 15 minutes) |

**Response - Unauthorized (401)**
```json
{
  "error": "Unauthorized",
  "message": "Missing Kong consumer headers",
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

**Response - Service Unavailable (503)**
```json
{
  "error": "Service Unavailable",
  "message": "Authentication service is temporarily unavailable. Please try again later.",
  "details": "Kong gateway connectivity issues",
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

**Error Responses**
- **401 Unauthorized**: Missing `X-Consumer-ID` header, missing `X-Consumer-Username`, or `X-Anonymous-Consumer` is "true"
- **503 Service Unavailable**: Kong Admin API unreachable or consumer secret lookup failed

### GET /tokens/validate
Validates a JWT token and returns its claims if valid.

**Request**
```http
GET /tokens/validate HTTP/1.1
Host: auth-service.example.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
X-Consumer-ID: 98765432-9876-5432-1098-765432109876
X-Consumer-Username: example-consumer
```

**Required Headers**
| Header | Type | Description |
|--------|------|-------------|
| `Authorization` | String | Bearer token (format: `Bearer <jwt>`) |
| `X-Consumer-ID` | UUID | Kong consumer identifier |
| `X-Consumer-Username` | String | Kong consumer username |

**Response - Valid Token (200 OK)**
```json
{
  "valid": true,
  "tokenId": "jti-550e8400-e29b-41d4-a716-446655440000",
  "subject": "example-consumer",
  "issuer": "authentication-service",
  "audience": "api-gateway",
  "issuedAt": "2025-01-15T12:00:00.000Z",
  "expiresAt": "2025-01-15T12:15:00.000Z",
  "expiresIn": 900,
  "requestId": "req-550e8400-e29b-41d4-a716-446655440001",
  "timestamp": "2025-01-15T12:00:05.000Z"
}
```

**Response Fields**
| Field | Type | Description |
|-------|------|-------------|
| `valid` | Boolean | Token validity status |
| `tokenId` | String | JWT ID (jti claim) |
| `subject` | String | Token subject (sub claim) |
| `issuer` | String | Token issuer (iss claim) |
| `audience` | String | Token audience (aud claim) |
| `issuedAt` | String | ISO-8601 token issue time |
| `expiresAt` | String | ISO-8601 token expiration time |
| `expiresIn` | Integer | Seconds until expiration |
| `requestId` | String | Request correlation ID |
| `timestamp` | String | Response timestamp |

**Response - Token Expired (401)**
```json
{
  "error": "Token Expired",
  "message": "The provided JWT token has expired",
  "errorCode": "AUTH_010",
  "statusCode": 401,
  "expiredAt": "2025-01-15T11:45:00.000Z",
  "requestId": "req-550e8400-e29b-41d4-a716-446655440001",
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

**Response - Invalid Token (400)**
```json
{
  "error": "Invalid Token",
  "message": "The provided JWT token is invalid or malformed",
  "errorCode": "AUTH_011",
  "statusCode": 400,
  "reason": "Invalid signature",
  "requestId": "req-550e8400-e29b-41d4-a716-446655440001",
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

**Response - Missing Authorization (400)**
```json
{
  "error": "Missing Authorization",
  "message": "Authorization header with Bearer token is required",
  "errorCode": "AUTH_012",
  "statusCode": 400,
  "requestId": "req-550e8400-e29b-41d4-a716-446655440001",
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

**Error Responses**
- **400 Bad Request (AUTH_011)**: Token is malformed, empty, or has invalid signature
- **400 Bad Request (AUTH_012)**: Missing or incorrectly formatted Authorization header
- **401 Unauthorized (AUTH_001)**: Missing Kong consumer headers
- **401 Unauthorized (AUTH_002)**: Consumer not found in Kong
- **401 Unauthorized (AUTH_010)**: Token has expired
- **500 Internal Server Error (AUTH_008)**: Unexpected validation error

## Health Check Endpoints

### GET /health
Main health check endpoint with comprehensive dependency status.

**Request**
```http
GET /health HTTP/1.1
Host: auth-service.example.com
```

**Response - Healthy (200 OK)**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T12:00:00.000Z",
  "version": "1.0.0",
  "environment": "production",
  "uptime": "1h",
  "highAvailability": false,
  "circuitBreakerState": "closed",
  "dependencies": {
    "kong": {
      "status": "healthy",
      "responseTime": "45ms",
      "details": {
        "adminUrl": "http://kong:8001",
        "mode": "API_GATEWAY"
      }
    },
    "cache": {
      "type": "memory",
      "connection": {
        "connected": true,
        "responseTime": "0.1ms"
      },
      "entries": {
        "primary": 5,
        "primaryActive": 5,
        "stale": 3,
        "staleCacheAvailable": true
      },
      "performance": {
        "hitRate": "95.00%",
        "avgLatencyMs": 0.1
      },
      "healthMonitor": null
    },
    "telemetry": {
      "traces": {
        "status": "healthy",
        "endpoint": "https://otel.example.com/v1/traces",
        "responseTime": "10ms",
        "exports": {
          "successRate": "100%",
          "total": 50,
          "failures": 0,
          "lastExportTime": "2025-01-15T11:59:50.000Z",
          "lastFailureTime": null,
          "recentErrors": []
        }
      },
      "metrics": {
        "status": "healthy",
        "endpoint": "https://otel.example.com/v1/metrics",
        "responseTime": "8ms",
        "exports": {
          "successRate": "100%",
          "total": 100,
          "failures": 0,
          "lastExportTime": "2025-01-15T11:59:50.000Z",
          "lastFailureTime": null,
          "recentErrors": []
        }
      },
      "logs": {
        "status": "healthy",
        "endpoint": "https://otel.example.com/v1/logs",
        "responseTime": "12ms",
        "exports": {
          "successRate": "100%",
          "total": 200,
          "failures": 0,
          "lastExportTime": "2025-01-15T11:59:50.000Z",
          "lastFailureTime": null,
          "recentErrors": []
        }
      }
    }
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response - Degraded (503)**
```json
{
  "status": "degraded",
  "timestamp": "2025-01-15T12:00:00.000Z",
  "version": "1.0.0",
  "environment": "production",
  "uptime": "1h",
  "highAvailability": true,
  "circuitBreakerState": "open",
  "dependencies": {
    "kong": {
      "status": "unhealthy",
      "responseTime": "5s",
      "details": {
        "adminUrl": "http://kong:8001",
        "mode": "API_GATEWAY",
        "error": "Connection timeout"
      }
    },
    "cache": {
      "type": "redis",
      "connection": {
        "connected": true,
        "responseTime": "0.4ms"
      },
      "entries": {
        "primary": 5,
        "primaryActive": 5,
        "stale": 11,
        "staleCacheAvailable": true
      },
      "performance": {
        "hitRate": "98.16%",
        "avgLatencyMs": 0.54
      },
      "healthMonitor": {
        "status": "healthy",
        "isMonitoring": true,
        "consecutiveSuccesses": 47,
        "consecutiveFailures": 0,
        "lastStatusChange": "2026-02-21T12:00:17.489Z",
        "lastCheck": {
          "success": true,
          "timestamp": "2026-02-21T12:07:47.606Z",
          "responseTimeMs": 1
        }
      }
    },
    "telemetry": {
      "traces": {
        "status": "healthy",
        "endpoint": "https://otel.example.com/v1/traces",
        "responseTime": "10ms",
        "exports": {
          "successRate": "98%",
          "total": 50,
          "failures": 1,
          "lastExportTime": "2025-01-15T11:59:50.000Z",
          "lastFailureTime": "2025-01-15T11:55:00.000Z",
          "recentErrors": ["2025-01-15T11:55:00.000Z: Connection timeout"]
        }
      },
      "metrics": {
        "status": "healthy",
        "endpoint": "https://otel.example.com/v1/metrics",
        "responseTime": "8ms",
        "exports": {
          "successRate": "100%",
          "total": 100,
          "failures": 0,
          "lastExportTime": "2025-01-15T11:59:50.000Z",
          "lastFailureTime": null,
          "recentErrors": []
        }
      },
      "logs": {
        "status": "healthy",
        "endpoint": "https://otel.example.com/v1/logs",
        "responseTime": "12ms",
        "exports": {
          "successRate": "100%",
          "total": 200,
          "failures": 0,
          "lastExportTime": "2025-01-15T11:59:50.000Z",
          "lastFailureTime": null,
          "recentErrors": []
        }
      }
    }
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response Fields**
| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Overall health: "healthy", "degraded", or "unhealthy" |
| `timestamp` | String | ISO-8601 timestamp |
| `version` | String | Service version from package.json |
| `environment` | String | Current NODE_ENV |
| `uptime` | String | Process uptime in human-readable format (e.g., "45s", "2m 5s", "1h 2m", "1d 1h 2m") |
| `highAvailability` | Boolean | Whether HA mode is enabled (Redis/Valkey) |
| `circuitBreakerState` | String | Circuit breaker state: "closed", "open", or "half-open" |
| `dependencies.kong` | Object | Kong gateway health status |
| `dependencies.cache` | Object | Cache system health (memory, redis, or valkey) |
| `dependencies.cache.type` | String | Cache backend: "memory", "redis", or "valkey" |
| `dependencies.cache.connection` | Object | Connection status and response time |
| `dependencies.cache.connection.connected` | Boolean | Whether cache backend is connected |
| `dependencies.cache.connection.responseTime` | String | Ping response time (e.g., "0.4ms") |
| `dependencies.cache.entries` | Object | Cache entry counts by tier |
| `dependencies.cache.entries.primary` | Integer | Total primary cache entries |
| `dependencies.cache.entries.primaryActive` | Integer | Primary entries with TTL > 0 |
| `dependencies.cache.entries.stale` | Integer | Stale entries for circuit breaker fallback |
| `dependencies.cache.entries.staleCacheAvailable` | Boolean | Whether stale fallback is available |
| `dependencies.cache.performance` | Object | Cache performance metrics |
| `dependencies.cache.performance.hitRate` | String | Cache hit rate as percentage (e.g., "95.00%") |
| `dependencies.cache.performance.avgLatencyMs` | Number | Average operation latency in milliseconds |
| `dependencies.cache.healthMonitor` | Object/null | Health monitor status (null for memory cache) |
| `dependencies.telemetry` | Object | OTLP endpoint health per signal type |
| `dependencies.telemetry.*.exports` | Object | Export statistics for this telemetry type |
| `dependencies.telemetry.*.exports.successRate` | String | Export success rate as percentage (e.g., "100%") |
| `dependencies.telemetry.*.exports.total` | Integer | Total export attempts |
| `dependencies.telemetry.*.exports.failures` | Integer | Failed export count |
| `dependencies.telemetry.*.exports.lastExportTime` | String/null | ISO-8601 timestamp of last export attempt |
| `dependencies.telemetry.*.exports.lastFailureTime` | String/null | ISO-8601 timestamp of last failed export |
| `dependencies.telemetry.*.exports.recentErrors` | Array | Recent error messages (max 10 entries) |
| `requestId` | String | UUID for request tracing |

**OTLP Connectivity Validation**

The `/health` endpoint performs active connectivity checks to all configured OTLP endpoints (traces, metrics, logs):

- **Parallel Testing**: All OTLP endpoints tested concurrently
- **5-Second Timeout**: Each endpoint check times out after 5 seconds
- **Status Values**:
  - `healthy`: Endpoint responded within timeout
  - `unhealthy`: Endpoint timeout or connection error
  - `disabled`: Telemetry mode is `console` only
- **Response Time Tracking**: Each endpoint reports its response time in milliseconds

**Performance Impact**:

OTLP validation adds network latency to health check response times:
- **Without OTLP checks**: p95 ~50ms, p99 ~100ms
- **With OTLP checks**: p95 ~400ms, p99 ~500ms

**SLA Thresholds**: Health endpoint thresholds have been adjusted to account for OTLP validation latency. See [sla.md](../operations/sla.md) for updated performance targets.

**Cache Object Location**: For detailed cache statistics including hit rates, tier usage, and operations by backend, use the `/metrics` endpoint. The `/health` endpoint provides basic cache health only.

**Use Cases**:
- **Liveness Probe**: Use `/health/ready` for faster checks without OTLP validation
- **Dependency Monitoring**: Use `/health` for full observability infrastructure validation
- **Troubleshooting**: OTLP endpoint status helps diagnose telemetry export issues

See [monitoring.md](../operations/monitoring.md#otlp-connectivity-validation) for detailed OTLP validation documentation.

### GET /health/ready
Readiness probe verifying the service can handle requests (validates Kong connectivity).

**Request**
```http
GET /health/ready HTTP/1.1
Host: auth-service.example.com
```

**Response - Ready (200 OK)**
```json
{
  "ready": true,
  "timestamp": "2025-01-15T12:00:00.000Z",
  "checks": {
    "kong": {
      "status": "healthy",
      "responseTime": "45ms",
      "details": {
        "adminUrl": "http://kong:8001",
        "mode": "API_GATEWAY"
      }
    }
  },
  "responseTime": "50ms",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response - Not Ready (503)**
```json
{
  "ready": false,
  "timestamp": "2025-01-15T12:00:00.000Z",
  "checks": {
    "kong": {
      "status": "unhealthy",
      "responseTime": "5s",
      "details": {
        "adminUrl": "http://kong:8001",
        "mode": "API_GATEWAY",
        "error": "Connection timeout"
      }
    }
  },
  "responseTime": "5.01s",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response Fields**
| Field | Type | Description |
|-------|------|-------------|
| `ready` | Boolean | Whether service is ready to accept traffic |
| `timestamp` | String | ISO-8601 timestamp |
| `checks.kong` | Object | Kong connectivity check result |
| `responseTime` | String | Total check duration in human-readable format (e.g., "50ms", "1.5s") |
| `requestId` | String | UUID for request tracing |

**Usage**
- Use for readiness probes in any orchestration platform (Kubernetes, Docker Swarm, Nomad, etc.)
- Use with load balancers to determine if instance should receive traffic
- Different from `/health` which checks liveness (service is running)
- Instance should not receive traffic until this returns 200

### GET /health/telemetry
Telemetry system health and configuration details.

**Request**
```http
GET /health/telemetry HTTP/1.1
Host: auth-service.example.com
```

**Response - Success (200 OK)**
```json
{
  "telemetry": {
    "mode": "otlp",
    "status": {
      "initialized": true,
      "metricsExportStats": {
        "totalExports": 100,
        "successfulExports": 98,
        "failedExports": 2
      }
    },
    "simple": {
      "traces": "active",
      "metrics": "active",
      "logs": "active"
    },
    "configuration": {
      "serviceName": "authentication-service",
      "serviceVersion": "1.0.0",
      "environment": "production",
      "endpoints": {
        "traces": "https://otel.example.com/v1/traces",
        "metrics": "https://otel.example.com/v1/metrics",
        "logs": "https://otel.example.com/v1/logs"
      },
      "timeout": 30000,
      "batchSize": 2048,
      "queueSize": 10000
    }
  },
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

**Response Fields**
| Field | Type | Description |
|-------|------|-------------|
| `telemetry.mode` | String | Telemetry mode: "console", "otlp", or "both" |
| `telemetry.status` | Object | Initialization and export statistics |
| `telemetry.simple` | Object | Simple status per signal type |
| `telemetry.configuration` | Object | Current telemetry configuration |
| `timestamp` | String | ISO-8601 timestamp |

### GET /health/metrics
Metrics system health with circuit breaker summary.

**Request**
```http
GET /health/metrics HTTP/1.1
Host: auth-service.example.com
```

**Response - Success (200 OK)**
```json
{
  "metrics": {
    "status": {
      "initialized": true,
      "meterProvider": "active"
    },
    "exports": {
      "totalExports": 100,
      "successfulExports": 98,
      "failedExports": 2,
      "lastExportTime": "2025-01-15T11:59:50.000Z"
    },
    "configuration": {
      "exportInterval": 10000,
      "batchTimeout": 30000,
      "endpoint": "https://otel.example.com/v1/metrics"
    }
  },
  "circuitBreakers": {
    "enabled": true,
    "totalBreakers": 3,
    "states": {
      "closed": 3,
      "open": 0,
      "halfOpen": 0
    }
  },
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

**Response Fields**
| Field | Type | Description |
|-------|------|-------------|
| `metrics.status` | Object | Metrics system initialization status |
| `metrics.exports` | Object | Export statistics |
| `metrics.configuration` | Object | Current metrics configuration |
| `circuitBreakers` | Object | Summary of all circuit breaker states |
| `timestamp` | String | ISO-8601 timestamp |

## Metrics Endpoints

### GET /metrics
Unified metrics endpoint with multiple views for operational, infrastructure, and telemetry data.

**Request**
```http
GET /metrics HTTP/1.1
Host: auth-service.example.com
```

**Query Parameters**
| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `view` | String | Metrics view type | `operational` |

**Available Views**
| View | Description |
|------|-------------|
| `operational` | Runtime metrics, memory, cache, circuit breakers, consumer volume |
| `infrastructure` | Infrastructure-level metrics status |
| `telemetry` | Telemetry system mode and export stats |
| `exports` | Detailed export statistics |
| `config` | Configuration summary (Kong, telemetry endpoints) |
| `full` | All metrics combined |

**Response - Operational View (200 OK)**
```json
{
  "timestamp": "2025-01-15T12:00:00.000Z",
  "uptime": "1h",
  "memory": {
    "used": 64,
    "total": 128,
    "rss": 80,
    "external": 16
  },
  "cache": {
    "strategy": "local-memory",
    "primary": {
      "entries": 5,
      "activeEntries": 5
    },
    "stale": {
      "entries": 3
    },
    "hitRate": "0.90",
    "averageLatencyMs": 1
  },
  "circuitBreakers": {
    "kong_get_consumer_secret": {
      "state": "closed",
      "failures": 0,
      "successes": 500
    },
    "kong_health_check": {
      "state": "closed",
      "failures": 0,
      "successes": 100
    }
  },
  "telemetry": {
    "mode": "both",
    "exportStats": {
      "totalExports": 100,
      "successfulExports": 98,
      "failedExports": 2
    }
  },
  "kong": {
    "adminUrl": "http://kong:8001",
    "mode": "API_GATEWAY"
  },
  "consumers": {
    "volume": {
      "high": 10,
      "medium": 50,
      "low": 200,
      "total": 260
    }
  }
}
```

**Response - Config View (200 OK)**
```json
{
  "timestamp": "2025-01-15T12:00:00.000Z",
  "configuration": {
    "kong": {
      "adminUrl": "http://kong:8001",
      "mode": "API_GATEWAY"
    },
    "telemetry": {
      "mode": "both",
      "initialized": true,
      "serviceName": "authentication-service",
      "serviceVersion": "1.0.0",
      "environment": "production",
      "endpoints": {
        "traces": "https://otel.example.com/v1/traces",
        "metrics": "https://otel.example.com/v1/metrics",
        "logs": "https://otel.example.com/v1/logs"
      },
      "timeout": 30000,
      "batchSize": 2048,
      "queueSize": 10000
    }
  }
}
```

**Response - Invalid View (400)**
```json
{
  "error": "Invalid view parameter",
  "message": "Valid views: operational, infrastructure, telemetry, exports, config, full",
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

## Debug Endpoints

### POST /debug/metrics/test
Record test metrics for verification (development/staging only).

**Request**
```http
POST /debug/metrics/test HTTP/1.1
Host: auth-service.example.com
```

**Response - Success (200 OK)**
```json
{
  "success": true,
  "message": "Test metrics recorded successfully",
  "metricsRecorded": 5,
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

**Response - Error (500)**
```json
{
  "success": false,
  "error": "Failed to record test metrics",
  "message": "Detailed error message",
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

### POST /debug/metrics/export
Force immediate metrics export (development/staging only).

**Request**
```http
POST /debug/metrics/export HTTP/1.1
Host: auth-service.example.com
```

**Response - Success (200 OK)**
```json
{
  "success": true,
  "message": "Metrics exported successfully",
  "exportedMetrics": 10,
  "duration": 150,
  "errors": [],
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

## Profiling Endpoints (Development/Staging Only)

All profiling endpoints require `PROFILING_ENABLED=true` in environment configuration.

### POST /debug/profiling/start
Start a profiling session for performance analysis.

**Request**
```http
POST /debug/profiling/start?type=cpu&manual=true HTTP/1.1
Host: auth-service.example.com
```

**Query Parameters**
| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `type` | String | Profile type: "cpu" or "heap" | `cpu` |
| `manual` | Boolean | Manual toggle mode via SIGUSR2 | `true` |

**Response - Success (200 OK)**
```json
{
  "success": true,
  "message": "Profiling session started successfully",
  "sessionId": "prof-1705320000000-abc123def",
  "type": "cpu",
  "manual": true,
  "instructions": "Send SIGUSR2 signal to toggle profiling or use the stop endpoint",
  "requestId": "req-1705320000000-xyz789"
}
```

**Response - Session Already Running (400)**
```json
{
  "error": "Bad Request",
  "message": "Cannot start profiling session - another session is already running",
  "statusCode": 400,
  "requestId": "req-1705320000000-xyz789"
}
```

**Response - Profiling Disabled (200)**
```json
{
  "success": true,
  "message": "Profiling service is available but disabled via configuration",
  "enabled": false,
  "sessionId": null,
  "instructions": "Enable profiling by setting PROFILING_ENABLED=true in your environment configuration",
  "requestId": "req-1705320000000-xyz789"
}
```

### POST /debug/profiling/stop
Stop the current profiling session.

**Request**
```http
POST /debug/profiling/stop?sessionId=prof-12345 HTTP/1.1
Host: auth-service.example.com
```

**Query Parameters**
| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `sessionId` | String | Optional session identifier | `global` |

**Response - Success (200 OK)**
```json
{
  "success": true,
  "message": "Profiling session stopped successfully",
  "sessionId": "global",
  "instructions": "Profile data is available in Chrome DevTools at chrome://inspect",
  "note": "Use Chrome DevTools to capture and export CPU/Memory profiles",
  "requestId": "req-1705320000000-xyz789"
}
```

### GET /debug/profiling/status
Check profiling system status and available commands.

**Request**
```http
GET /debug/profiling/status HTTP/1.1
Host: auth-service.example.com
```

**Response - Success (200 OK)**
```json
{
  "success": true,
  "enabled": true,
  "sessions": [],
  "environment": "development",
  "integration": "Chrome DevTools Protocol",
  "instructions": "Use Chrome DevTools at chrome://inspect for profiling",
  "availableCommands": {
    "start": "POST /debug/profiling/start?type=cpu&manual=true",
    "stop": "POST /debug/profiling/stop?sessionId=<id>",
    "status": "GET /debug/profiling/status",
    "cleanup": "POST /debug/profiling/cleanup"
  },
  "requestId": "req-1705320000000-xyz789"
}
```

### GET /debug/profiling/reports
List available profiling reports.

**Request**
```http
GET /debug/profiling/reports HTTP/1.1
Host: auth-service.example.com
```

**Response - Success (200 OK)**
```json
{
  "success": true,
  "reports": [
    {
      "path": "/path/to/profiling/profile-12345.html",
      "name": "profile-12345.html",
      "url": "/debug/profiling/report?file=%2Fpath%2Fto%2Fprofiling%2Fprofile-12345.html"
    }
  ],
  "total": 1,
  "instructions": "Open the HTML files in your browser for interactive flamegraph analysis",
  "requestId": "req-1705320000000-xyz789"
}
```

### GET /debug/profiling/report
Retrieve a specific profiling report file.

**Request**
```http
GET /debug/profiling/report?file=/path/to/report.html HTTP/1.1
Host: auth-service.example.com
```

**Query Parameters**
| Parameter | Type | Description | Required |
|-----------|------|-------------|----------|
| `file` | String | Path to the report file | Yes |

**Response - Success (200 OK)**
Returns HTML content of the flamegraph report with `Content-Type: text/html`.

**Response - Missing Parameter (400)**
```json
{
  "error": "Bad Request",
  "message": "File parameter is required",
  "statusCode": 400,
  "requestId": "req-1705320000000-xyz789"
}
```

**Response - Not Found (404)**
```json
{
  "error": "Not Found",
  "message": "Report file not found",
  "statusCode": 404,
  "requestId": "req-1705320000000-xyz789"
}
```

### POST /debug/profiling/cleanup
Clean up profiling artifacts.

**Request**
```http
POST /debug/profiling/cleanup HTTP/1.1
Host: auth-service.example.com
```

**Response - Success (200 OK)**
```json
{
  "success": true,
  "message": "Profiling artifacts cleaned up successfully",
  "cleaned": [
    "*.pb files (pprof binary files)",
    "*.html files (flamegraph reports)",
    "flame-* artifacts",
    "profiling/ directory"
  ],
  "requestId": "req-1705320000000-xyz789"
}
```

## Error Handling

### RFC 7807 Problem Details

All error responses follow the [RFC 7807 Problem Details](https://www.rfc-editor.org/rfc/rfc7807) standard for consistent, machine-readable error responses.

**Content-Type**: `application/problem+json`

### HTTP Status Codes
| Status Code | Scenario | Response Body |
|-------------|----------|---------------|
| 200 OK | Successful operation | JSON response with data |
| 400 Bad Request | Invalid parameters or request | Problem Details |
| 401 Unauthorized | Missing consumer ID or anonymous consumer | Problem Details |
| 404 Not Found | Endpoint or resource not found | Problem Details |
| 500 Internal Server Error | Unexpected errors | Problem Details |
| 503 Service Unavailable | Kong Admin API unreachable | Problem Details |

### Error Response Format (RFC 7807)
```json
{
  "type": "urn:problem-type:auth-service:auth-001",
  "title": "Missing Consumer Headers",
  "status": 401,
  "detail": "Required Kong consumer headers are missing from the request",
  "instance": "/tokens",
  "code": "AUTH_001",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

### RFC 7807 Fields
| Field | Type | Description |
|-------|------|-------------|
| `type` | String | URN identifying the problem type (e.g., `urn:problem-type:auth-service:auth-001`) |
| `title` | String | Short, human-readable summary |
| `status` | Integer | HTTP status code |
| `detail` | String | Human-readable explanation specific to this occurrence |
| `instance` | String | URI reference identifying the specific occurrence (e.g., `/tokens`) |
| `code` | String | Application-specific error code (e.g., `AUTH_001`) |
| `requestId` | String | UUID for request tracing |
| `timestamp` | String | ISO-8601 timestamp |
| `extensions` | Object | Additional context-specific data (optional) |

### Structured Error Codes

The service uses standardized error codes for programmatic error handling:

| Code | HTTP | Title | Description |
|------|------|-------|-------------|
| `AUTH_001` | 401 | Missing Consumer Headers | Required Kong consumer headers not present |
| `AUTH_002` | 401 | Consumer Not Found | Consumer not found or has no JWT credentials |
| `AUTH_003` | 500 | JWT Creation Failed | Internal error during token generation |
| `AUTH_004` | 503 | Kong API Unavailable | Kong gateway temporarily unavailable |
| `AUTH_005` | 503 | Circuit Breaker Open | Service protected by circuit breaker |
| `AUTH_006` | 429 | Rate Limit Exceeded | Request rate limit exceeded |
| `AUTH_007` | 400 | Invalid Request Format | Request format invalid (e.g., header too long) |
| `AUTH_008` | 500 | Internal Server Error | Unexpected internal error |
| `AUTH_009` | 401 | Anonymous Consumer | Anonymous consumers not allowed |
| `AUTH_010` | 401 | Token Expired | JWT token has expired |
| `AUTH_011` | 400 | Invalid Token | JWT token is invalid or malformed |
| `AUTH_012` | 400 | Missing Authorization | Bearer token required but not provided |

For detailed troubleshooting of each error code, see the [Troubleshooting Guide](../operations/troubleshooting.md).

### Common Error Scenarios
```typescript
// Missing Kong headers
if (!request.headers.get("x-consumer-id")) {
  return createUnauthorizedResponse("Missing Kong consumer headers", requestId);
}

// Anonymous consumer
if (request.headers.get("x-anonymous-consumer") === "true") {
  return createUnauthorizedResponse("Anonymous consumers are not allowed", requestId);
}

// Kong API failure
try {
  const secret = await kongService.getConsumerSecret(consumerId);
} catch (error) {
  return new Response("Service Unavailable", { status: 503 });
}

// JWT generation failure
try {
  const token = await NativeBunJWT.createToken(...);
} catch (error) {
  return createInternalErrorResponse("An unexpected error occurred", requestId);
}
```

## CORS Support

The service includes built-in CORS support for browser-based applications:

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Consumer-ID, X-Consumer-Username, X-Anonymous-Consumer
Access-Control-Max-Age: 86400
```

### CORS Configuration
- **Default**: `*` (wildcard - allows all origins)
- **Configurable**: Set `API_CORS` environment variable to specific origins
- **Security**: Use specific origins in production (e.g., `https://app.example.com`)

### Preflight Requests
```http
OPTIONS /tokens HTTP/1.1
Host: auth-service.example.com
Origin: https://example.com
Access-Control-Request-Method: GET
Access-Control-Request-Headers: X-Consumer-ID,X-Consumer-Username

HTTP/1.1 204 No Content
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Consumer-ID, X-Consumer-Username, X-Anonymous-Consumer
Access-Control-Max-Age: 86400
```

## API Deprecation (RFC 8594 Sunset Headers)

The service supports [RFC 8594 Sunset headers](https://www.rfc-editor.org/rfc/rfc8594) for signaling API version deprecation to clients.

### Deprecation Headers

When an API version is deprecated, responses include:

```http
Sunset: Sat, 01 Jan 2028 00:00:00 GMT
Deprecation: true
Link: <https://api.example.com/docs/migration>; rel="sunset"
```

| Header | Description |
|--------|-------------|
| `Sunset` | RFC 7231 HTTP-date when the API will be removed |
| `Deprecation` | Boolean indicating the API is deprecated |
| `Link` | URL to migration documentation (rel="sunset") |

### Configuration

Deprecation is configured per API version:

```typescript
// Environment configuration
API_V1_SUNSET_DATE=2028-01-01T00:00:00Z
API_V1_MIGRATION_URL=https://api.example.com/docs/v2-migration
```

### Client Handling

Clients should:
1. Monitor for `Deprecation: true` header
2. Parse the `Sunset` date to plan migration
3. Follow the `Link` header for migration guidance
4. Complete migration before the sunset date

## Circuit Breaker Protection

Rate limiting is typically handled at the Kong Gateway level, but the service includes circuit breaker protection to prevent overwhelming the Kong Admin API:

### Circuit Breaker Configuration (Actual Defaults)
- **Timeout**: 5000ms (5 seconds) for Kong API calls
- **Error Threshold**: 50% failure rate over rolling window
- **Reset Timeout**: 60000ms (60 seconds) for circuit recovery
- **Rolling Count Timeout**: 10000ms (10 seconds)
- **Rolling Count Buckets**: 10
- **Volume Threshold**: 3 requests minimum before circuit can open
- **Stale Data Tolerance**: 30 minutes (default)

### Circuit Breaker States
- **closed**: Normal operation, requests pass through
- **open**: Circuit breaker active, requests use stale cache fallback
- **half-open**: Testing if service has recovered with limited requests

### Per-Operation Circuit Breakers
The service uses operation-specific circuit breakers:
- `kong_get_consumer_secret` - Consumer secret lookup
- `kong_health_check` - Health check operations
- `kong_list_consumers` - Consumer listing operations
