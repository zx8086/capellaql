# Zed Tasks Reference

This document describes the Zed IDE tasks available in `.zed/tasks.json` for managing infrastructure, development, and deployment workflows.

## Overview

The project includes **172 pre-configured Zed tasks** organized by category. Tasks can be run from Zed's command palette (`Cmd+Shift+P` > "task: spawn").

## Task Categories

| Category | Count | Description |
|----------|-------|-------------|
| `redis:` | 16 | Redis cache operations |
| `valkey:` | 16 | Valkey cache operations |
| `github:` | 16 | PRs, issues, workflows, security alerts |
| `kong:` | 14 | API Gateway management |
| `docker:` | 12 | Container and image management |
| `otel:` | 11 | OTEL endpoints and configuration |
| `test:` | 9 | Unit, E2E, performance, and mutation tests |
| `deps:` | 8 | Dependencies and infrastructure (up/down) |
| `git:` | 6 | Version control operations |
| `postgres:` | 5 | Kong database queries |
| `devcontainer:` | 5 | DevContainer management |
| `dev:` | 5 | Dev server and workflow tasks |
| `service:` | 4 | Service info (version, endpoints, metrics) |
| `profile:` | 4 | CPU/memory profiling workflows |
| `server:` | 3 | Health checks, server management |
| `code:` | 3 | TODOs, line count, exports |
| `quality:` | 2 | Linting and formatting |
| `env:` | 2 | Environment diff and validation |
| `infra:` | 1 | Infrastructure status check |
| `docs:` | 1 | OpenAPI generation |
| `config:` | 1 | Configuration validation |

---

## Service / Server Tasks

| Task | Description |
|------|-------------|
| `service: version` | Package name, version, description |
| `service: endpoints` | List API endpoint paths |
| `service: metrics` | Prometheus metrics (first 50 lines) |
| `service: openapi spec` | OpenAPI spec (first 60 lines) |
| `server: health check` | Full health endpoint response |
| `server: health check (Valkey)` | Cache-specific health |
| `server: kill (port 3000)` | Kill process on port 3000 |

---

## Development Tasks

| Task | Description |
|------|-------------|
| `dev: start (watch mode)` | Start with hot reload |
| `dev: start (devcontainer env)` | Start with devcontainer config |
| `dev: start with Valkey` | Start using Valkey cache |
| `dev: clean restart` | Kill port 3000 and restart |
| `dev: quickstart` | Generate OpenAPI, then start |

---

## Infrastructure Tasks

| Task | Description |
|------|-------------|
| `infra: status check` | Check all services (Kong, Redis, Valkey, Postgres) |
| `devcontainer: up` | Start full devcontainer stack |
| `devcontainer: down` | Stop devcontainer |
| `devcontainer: down (clean volumes)` | Stop and remove volumes |
| `devcontainer: status` | Show container status |
| `devcontainer: logs` | Stream all container logs |
| `deps: up (Kong + Redis)` | Start Kong and Redis |
| `deps: up (Kong + Valkey)` | Start Kong and Valkey |
| `deps: up (all)` | Start all dependencies |
| `deps: down` | Stop all dependencies |

**Compose File:** `.devcontainer/docker-compose.yml`

---

## Dependencies (NPM/Bun) Tasks

| Task | Description |
|------|-------------|
| `deps: outdated` | Check for outdated packages |
| `deps: audit` | Run security audit |
| `deps: licenses` | Check package licenses |
| `deps: tree` | Show dependency tree (first 60 lines) |

---

## Kong Tasks

| Task | Description |
|------|-------------|
| `kong: status` | Gateway status (connections, memory) |
| `kong: version` | Kong version, edition, hostname |
| `kong: list services` | All registered services |
| `kong: list routes` | All registered routes |
| `kong: list plugins` | All enabled plugins |
| `kong: list consumers` | All consumers (username, id, custom_id) |
| `kong: list upstreams` | All upstream configurations |
| `kong: jwt secrets (count)` | JWT secrets count and details |
| `kong: sync config (decK)` | Sync `kong/kong.yml` to gateway |
| `kong: dump config (decK)` | Export current config as YAML |
| `kong: diff config (decK)` | Show pending config changes |
| `kong: seed test consumers` | Create test consumers |
| `kong: view logs` | Stream Kong container logs |
| `kong: restart` | Restart Kong container |

**Prerequisites:** Kong running on `localhost:8001`

---

## Redis Tasks

| Task | Description |
|------|-------------|
| `redis: ping` | Health check (PONG response) |
| `redis: status` | Container status |
| `redis: info server` | Server information |
| `redis: info stats` | Server statistics |
| `redis: keys (all)` | List all keys |
| `redis: bigkeys` | Find largest keys |
| `redis: memkeys` | Memory usage by key |
| `redis: scan auth keys` | Find auth_service keys |
| `redis: monitor (live commands)` | Stream all commands in real-time |
| `redis: interactive CLI` | Open redis-cli session |
| `redis: logs` | Stream container logs |
| `redis: flush all` | Clear all data |
| `redis: start (standalone)` | Start standalone container (port 6379) |
| `redis: stop` | Stop standalone container |
| `redis: remove` | Remove standalone container |
| `redis: restart (standalone)` | Full restart cycle |

**Standalone Configuration:**
- Container: `auth-redis`
- Port: `6379`
- Memory: 128MB with LRU eviction
- Persistence: AOF enabled

---

## Valkey Tasks

| Task | Description |
|------|-------------|
| `valkey: ping` | Health check (PONG response) |
| `valkey: status` | Container status |
| `valkey: info server` | Server information |
| `valkey: info stats` | Server statistics |
| `valkey: keys (all)` | List all keys |
| `valkey: bigkeys` | Find largest keys |
| `valkey: memkeys` | Memory usage by key |
| `valkey: scan auth keys` | Find auth_service keys |
| `valkey: monitor (live commands)` | Stream all commands in real-time |
| `valkey: interactive CLI` | Open valkey-cli session |
| `valkey: logs` | Stream container logs |
| `valkey: flush all` | Clear all data |
| `valkey: start (standalone)` | Start standalone container (port 6380) |
| `valkey: stop` | Stop standalone container |
| `valkey: remove` | Remove standalone container |
| `valkey: restart (standalone)` | Full restart cycle |

**Standalone Configuration:**
- Container: `auth-valkey`
- Port: `6380`
- Memory: 128MB with LRU eviction
- Persistence: AOF enabled

**Note:** Redis and Valkey have identical task sets for consistency.

---

## Postgres Tasks

| Task | Description |
|------|-------------|
| `postgres: list tables` | Show Kong database tables |
| `postgres: kong services (SQL)` | Query services table |
| `postgres: kong routes (SQL)` | Query routes table |
| `postgres: db size` | Database size |
| `postgres: interactive psql` | Open psql session |

**Connection:** Uses Kong database container (`kong-db`)

---

## Docker Tasks

| Task | Description |
|------|-------------|
| `docker: ps` | List running containers |
| `docker: ps (all)` | List all containers |
| `docker: build (local)` | Build Docker image locally |
| `docker: scout CVEs (pushed image)` | Scan for CRITICAL/HIGH CVEs |
| `docker: scout quickview (pushed image)` | Security overview |
| `docker: scout SBOM (pushed image)` | Software Bill of Materials |
| `docker: scout recommendations` | Base image recommendations |
| `docker: inspect labels (pushed image)` | OCI labels |
| `docker: verify metadata (pushed image)` | Version, created, revision |
| `docker: verify version (registry API)` | Registry tags and platforms |
| `docker: image size (pushed)` | Image manifest and sizes |
| `docker: attestations (SLSA provenance)` | SLSA attestations |

**Image:** `docker.io/zx8086/authentication-v2:latest`

---

## Testing Tasks

| Task | Description |
|------|-------------|
| `test: bun (all)` | Run all Bun tests |
| `test: bun (watch)` | Watch mode for tests |
| `test: coverage report` | Generate test coverage |
| `test: e2e (direct)` | Playwright tests (direct) |
| `test: e2e (via Kong)` | Playwright tests (via gateway) |
| `test: e2e UI` | Playwright UI mode |
| `test: k6 smoke (quick)` | Quick performance smoke tests |
| `test: integration (circuit breaker)` | Circuit breaker integration tests |
| `test: mutation (dry run)` | Mutation testing preview |

---

## Quality Tasks

| Task | Description |
|------|-------------|
| `quality: check (all)` | Run all quality checks |
| `quality: fix` | Auto-fix quality issues |

---

## Profiling Tasks

| Task | Description |
|------|-------------|
| `profile: tokens` | Profile token generation scenario |
| `profile: health` | Profile health endpoint |
| `profile: list` | List profile files |
| `profile: cleanup (dry run)` | Preview profile cleanup |

---

## Git Tasks

| Task | Description |
|------|-------------|
| `git: recent commits` | Last 15 commits (oneline) |
| `git: branch list` | All branches (local and remote) |
| `git: status` | Working directory status |
| `git: diff stats` | Uncommitted change statistics |
| `git: stash list` | All stashes |
| `git: hard reset (from remote)` | Reset to remote branch (destructive) |

**Warning:** `git: hard reset` discards all local changes.

---

## GitHub Tasks

| Task | Description |
|------|-------------|
| `github: PR list (open)` | Open pull requests |
| `github: PR checks` | PR check status |
| `github: issues (open)` | Open issues (limit 15) |
| `github: security alerts (open only)` | Open code scanning alerts |
| `github: security alerts (all)` | All code scanning alerts |
| `github: security alerts (Dependabot)` | Open Dependabot alerts |
| `github: docker security (Trivy)` | CVEs from latest build |
| `github: latest workflow run (Build and Deploy)` | Recent build runs |
| `github: latest workflow run (DHI CVE Monitor)` | Recent CVE monitor runs |
| `github: latest workflow run (Security Audit)` | Recent security audit runs |
| `github: latest workflow run (all)` | All recent workflow runs |
| `github: workflow artifacts (Build and Deploy)` | Build artifacts |
| `github: workflow artifacts (DHI CVE Monitor)` | CVE monitor artifacts |
| `github: workflow artifacts (Security Audit)` | Security audit artifacts |
| `github: trigger security audit` | Run security audit workflow |
| `github: trigger DHI CVE Monitor` | Run CVE monitor workflow |

**Prerequisites:** GitHub CLI (`gh`) authenticated

---

## OpenTelemetry Tasks

| Task | Description |
|------|-------------|
| `otel: status (all endpoints)` | Check all OTLP endpoints |
| `otel: show config` | Display OTEL configuration |
| `otel: ping collector` | Test collector connectivity |
| `otel: traces endpoint check` | Test traces endpoint |
| `otel: metrics endpoint check` | Test metrics endpoint |
| `otel: logs endpoint check` | Test logs endpoint |
| `otel: network connectivity test` | TCP connectivity test |
| `otel: service telemetry health` | Service telemetry status |
| `otel: ssh tunnel start` | Start SSH tunnel to collector |
| `otel: ssh tunnel stop` | Stop SSH tunnel |
| `otel: ssh tunnel status` | Check tunnel status |

**Configuration:** Loaded from `.env` file

---

## Code Analysis Tasks

| Task | Description |
|------|-------------|
| `code: find TODOs` | Find TODOs and FIXMEs in src/ |
| `code: line count` | Source code line count |
| `code: exports count` | Count of exports in src/ |

---

## Environment Tasks

| Task | Description |
|------|-------------|
| `env: show (safe)` | Show non-sensitive env vars |
| `env: diff (.env vs .env.example)` | Compare env files |
| `config: validate` | Validate configuration loading |

---

## Documentation Tasks

| Task | Description |
|------|-------------|
| `docs: generate OpenAPI` | Generate OpenAPI spec |

---

## Task Properties

Tasks use the following Zed task properties:

| Property | Values | Description |
|----------|--------|-------------|
| `use_new_terminal` | `true/false` | Open in new terminal tab |
| `allow_concurrent_runs` | `true/false` | Allow multiple instances |
| `reveal` | `always` | Show output panel |

- **Interactive tasks** (logs, CLI sessions) use `use_new_terminal: true`
- **One-shot tasks** (status, queries) use `reveal: always`

---

## Command Patterns

Tasks follow established patterns for reliability:

### curl + jq with fallback
```bash
(set -o pipefail; curl -s URL | jq .) || echo "Status: Not responding"
```

### Docker table format
```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

### Header format
```bash
echo "=== Task Name ===" && command
```

**Note:** Avoid `curl -f` when response body is needed (it fails silently on HTTP errors).

---

## Adding New Tasks

Edit `.zed/tasks.json` to add tasks:

```json
{
  "label": "category: task name",
  "command": "echo \"=== Task Header ===\" && (set -o pipefail; your-command | jq .) || echo \"Status: Not available\"",
  "use_new_terminal": false,
  "reveal": "always",
}
```

**Conventions:**
- Use `category: name` format for labels
- Include `=== Header ===` echo for identification
- Use `(set -o pipefail; ... | jq .) || echo "fallback"` for curl+jq
- Group tasks by category with JSONC comments (`// === CATEGORY ===`)
