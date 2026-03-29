# CapellaQL Documentation

High-performance GraphQL service for Couchbase Capella databases.

## Quick Navigation

| Need to... | Go to... |
|------------|----------|
| Start developing | [Getting Started](development/getting-started.md) |
| Use GraphQL API | [GraphQL Queries](api/graphql-queries.md) |
| Check health endpoints | [REST Endpoints](api/endpoints.md) |
| Configure the service | [Environment Variables](configuration/environment.md) |
| Run tests | [Testing Guide](development/testing.md) |
| Deploy to production | [Container Security](deployment/container-security.md) |
| Debug issues | [Troubleshooting](operations/troubleshooting.md) |
| Monitor the service | [Monitoring](operations/monitoring.md) |

---

## Documentation Index

### API Reference

| Document | Description |
|----------|-------------|
| [graphql-queries.md](api/graphql-queries.md) | GraphQL API queries and types |
| [endpoints.md](api/endpoints.md) | REST health and monitoring endpoints |
| [openapi.yaml](api/openapi.yaml) | OpenAPI 3.1.1 specification |

### Architecture

| Document | Description |
|----------|-------------|
| [overview.md](architecture/overview.md) | System design and technology stack |
| [couchbase.md](architecture/couchbase.md) | Couchbase connection management |
| [caching.md](architecture/caching.md) | Caching implementation details |

### Configuration

| Document | Description |
|----------|-------------|
| [4-pillar-pattern.md](configuration/4-pillar-pattern.md) | Configuration architecture pattern |
| [environment.md](configuration/environment.md) | Environment variables reference |

### Deployment

| Document | Description |
|----------|-------------|
| [docker.md](deployment/docker.md) | Docker container builds |
| [kubernetes.md](deployment/kubernetes.md) | Kubernetes deployment |
| [ci-cd.md](deployment/ci-cd.md) | GitHub Actions CI/CD pipeline |
| [container-security.md](deployment/container-security.md) | Security hardening and CVE remediation |

### Development

| Document | Description |
|----------|-------------|
| [getting-started.md](development/getting-started.md) | Development setup guide |
| [testing.md](development/testing.md) | Testing strategy (unit, E2E, K6) |
| [api-best-practices.md](development/api-best-practices.md) | RFC compliance and best practices |
| [logging.md](development/logging.md) | Logging architecture and patterns |
| [profiling.md](development/profiling.md) | Performance profiling |
| [devcontainer.md](development/devcontainer.md) | DevContainer setup |
| [zed-tasks.md](development/zed-tasks.md) | Zed IDE task reference |

### Operations

| Document | Description |
|----------|-------------|
| [monitoring.md](operations/monitoring.md) | Health endpoints and alerting |
| [opentelemetry.md](operations/opentelemetry.md) | OpenTelemetry implementation guide |
| [sla.md](operations/sla.md) | Performance SLAs and targets |
| [troubleshooting.md](operations/troubleshooting.md) | Runbook-style troubleshooting |

### Security

| Document | Description |
|----------|-------------|
| [security-scanning.md](security/security-scanning.md) | CI/CD security scanning |

---

## Key Capabilities

| Capability | Description |
|------------|-------------|
| **Performance** | 100,000+ requests/second with Bun runtime |
| **GraphQL** | Full GraphQL Yoga implementation with caching |
| **Observability** | OpenTelemetry traces, metrics, and logs |
| **Security** | RFC 7807 errors, rate limiting, CORS |
| **Configuration** | 4-pillar pattern with Zod validation |

## Technology Stack

| Category | Technology |
|----------|------------|
| Runtime | Bun v1.3+ |
| GraphQL | GraphQL Yoga |
| Database | Couchbase Capella |
| Telemetry | OpenTelemetry |
| Container | Docker (multi-arch) |
