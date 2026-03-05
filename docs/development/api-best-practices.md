# API Best Practices Implementation

This document describes the API best practices implemented in the authentication service.

## Overview

The authentication service implements modern API best practices following industry standards and RFCs to ensure security, reliability, and developer experience.

## Implemented Best Practices

### 1. HTTP Method Validation (RFC 9110)

**Implementation:** `src/middleware/validation.ts`

Each endpoint enforces allowed HTTP methods, returning `405 Method Not Allowed` for invalid methods.

**Example:**
```http
POST /tokens HTTP/1.1
```

**Response:**
```http
HTTP/1.1 405 Method Not Allowed
Allow: GET, OPTIONS
Content-Type: application/problem+json

{
  "type": "https://httpwg.org/specs/rfc9110.html#status.405",
  "title": "Method Not Allowed",
  "status": 405,
  "detail": "The requested method is not allowed for this endpoint. Allowed methods: GET, OPTIONS",
  "instance": "/tokens",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-02-14T05:30:00.000Z",
  "extensions": {
    "allowedMethods": ["GET", "OPTIONS"]
  }
}
```

**Allowed Methods by Endpoint:**
| Endpoint | Allowed Methods |
|----------|-----------------|
| `/tokens` | GET, OPTIONS |
| `/tokens/validate` | GET, OPTIONS |
| `/health*` | GET, OPTIONS |
| `/debug/metrics/test` | POST, OPTIONS |
| `/debug/profiling/*` | POST/GET, OPTIONS |

### 2. ETag and Conditional Requests (RFC 7232)

**Implementation:** `src/handlers/openapi.ts`, `src/utils/response.ts`

The OpenAPI specification endpoint supports ETags for efficient caching.

**Request with ETag:**
```http
GET / HTTP/1.1
If-None-Match: "a1b2c3d4e5f6"
```

**Response (Not Modified):**
```http
HTTP/1.1 304 Not Modified
ETag: "a1b2c3d4e5f6"
X-Request-Id: 550e8400-e29b-41d4-a716-446655440000
```

**Response (Modified):**
```http
HTTP/1.1 200 OK
ETag: "a1b2c3d4e5f6"
Last-Modified: Thu, 14 Feb 2026 05:30:00 GMT
Cache-Control: public, max-age=300

{
  "openapi": "3.1.1",
  ...
}
```

**Benefits:**
- Reduces bandwidth usage
- Improves client performance
- Supports HTTP caching proxies

### 3. Request Body Size Limits

**Implementation:** `src/middleware/validation.ts`, `src/server.ts`

**Default Limit:** 10MB (`MAX_REQUEST_BODY_SIZE`)

Prevents memory exhaustion and denial-of-service attacks.

**Example Error:**
```http
POST /debug/metrics/test HTTP/1.1
Content-Length: 10485761

HTTP/1.1 400 Bad Request
Content-Type: application/problem+json

{
  "type": "urn:problem-type:auth-service/auth-007",
  "title": "Invalid Request Format",
  "status": 400,
  "detail": "The request format is invalid or malformed",
  "code": "AUTH_007",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-02-14T05:30:00.000Z",
  "extensions": {
    "reason": "Request body exceeds maximum allowed size",
    "size": 10485761,
    "maxSize": 10485760
  }
}
```

### 4. Content-Type Validation

**Implementation:** `src/middleware/validation.ts`

**Accepted Content Types:**
- `application/json`
- `application/x-www-form-urlencoded`

**Example Error:**
```http
POST /debug/metrics/test HTTP/1.1
Content-Type: text/plain

HTTP/1.1 400 Bad Request

{
  "code": "AUTH_007",
  "extensions": {
    "reason": "Invalid or unsupported Content-Type",
    "provided": "text/plain",
    "accepted": ["application/json", "application/x-www-form-urlencoded"]
  }
}
```

### 5. Rate Limit Headers (RFC 6585)

**Implementation:** Kong API Gateway handles rate limiting upstream.

> **Note:** Rate limiting is NOT implemented in this service. It is handled by Kong API Gateway as an external dependency. The service provides utility functions (`src/utils/response.ts`) for generating rate limit error responses if needed in future implementations.

**Kong Rate Limiting:** Configured via Kong's `rate-limiting` plugin at the gateway level, providing:
- Per-consumer rate limiting
- Per-route rate limiting
- Response headers (`X-RateLimit-*`)

**Service Support (Error Responses Only):**

The service includes an `AUTH_006` error code for rate limit scenarios, used when Kong's rate limiting triggers:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 30

{
  "type": "urn:problem-type:auth-service/auth-006",
  "title": "Rate Limit Exceeded",
  "status": 429,
  "code": "AUTH_006",
  "extensions": {
    "limit": 100,
    "resetAt": "2026-02-14T05:43:18.000Z"
  }
}
```

### 6. Validation Error Responses

**Implementation:** `src/utils/response.ts`

Provides field-level validation errors for better debugging.

**Example:**
```typescript
createValidationErrorResponse(
  ErrorCodes.AUTH_007,
  requestId,
  [
    {
      field: "email",
      message: "Invalid email format",
      expected: "user@example.com",
      actual: "invalid-email"
    },
    {
      field: "password",
      message: "Password too short",
      expected: "minimum 8 characters"
    }
  ],
  "/tokens"
);
```

**Response:**
```json
{
  "code": "AUTH_007",
  "extensions": {
    "validationErrors": [
      {
        "field": "email",
        "message": "Invalid email format",
        "expected": "user@example.com",
        "actual": "invalid-email"
      },
      {
        "field": "password",
        "message": "Password too short",
        "expected": "minimum 8 characters"
      }
    ],
    "count": 2
  }
}
```

### 7. Request Timeout Configuration

**Implementation:** `src/middleware/validation.ts`

**Default:** 30 seconds (`REQUEST_TIMEOUT_MS`)

Prevents resource exhaustion from hanging requests.

## Usage

### Validation Middleware

The validation middleware is automatically applied to all requests through the router:

```typescript
// src/routes/router.ts
import { validateRequest } from "../middleware/validation";

const fallbackFetch = async (req: Request): Promise<Response> => {
  // Validate request (method, content-type, body size)
  const validationError = await validateRequest(req);
  if (validationError) {
    return validationError;
  }
  
  // Continue with request handling...
};
```

### Response Utilities

```typescript
// Method not allowed
return createMethodNotAllowedResponse(requestId, ["GET", "OPTIONS"], "/tokens");

// Rate limit exceeded
return createRateLimitErrorResponse(
  ErrorCodes.AUTH_006,
  requestId,
  { limit: 100, remaining: 0, reset: Date.now() / 1000 + 3600 },
  30,
  "/tokens"
);

// Validation errors
return createValidationErrorResponse(
  ErrorCodes.AUTH_007,
  requestId,
  [{ field: "username", message: "Required field missing" }],
  "/tokens"
);

// ETag generation
const etag = await generateETag(content);

// Conditional request check
if (hasMatchingETag(request, etag)) {
  return createNotModifiedResponse(requestId, etag);
}
```

## Testing

Comprehensive tests ensure validation works correctly:

```bash
# Run validation middleware tests
bun test test/bun/middleware/validation.test.ts

# Run response utility tests
bun test test/bun/utils/response.mutation.test.ts
```

**Test Coverage:**
- 11 validation middleware tests
- 73 response utility tests
- All tests passing

## Benefits

1. **Security**: Request size limits, method validation, content-type checking
2. **Performance**: ETag support, efficient caching, reduced bandwidth
3. **Developer Experience**: Clear error messages, field-level validation, standard headers
4. **Standards Compliance**: RFC 7232, RFC 6585, RFC 9110, RFC 7807
5. **Observability**: Request IDs, structured logging, detailed error context

## Future Enhancements

See main PR description for Priority 2-5 improvements planned.

## References

- [RFC 7232 - Conditional Requests](https://www.rfc-editor.org/rfc/rfc7232)
- [RFC 6585 - HTTP Status Code 429](https://www.rfc-editor.org/rfc/rfc6585)
- [RFC 9110 - HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110)
- [RFC 7807 - Problem Details](https://www.rfc-editor.org/rfc/rfc7807)
