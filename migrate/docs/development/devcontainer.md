# Zed IDE DevContainer Setup

Containerized infrastructure for local Bun development. Your app runs natively; Kong, Redis, Valkey, and Postgres run in Docker.

## Architecture

```
Host Machine                              Docker (via .devcontainer/)
+---------------------------+             +---------------------------+
| Bun app (localhost:3000)  |<----------->| Kong 3.9 (:8000, :8001)   |
|   |                       |  proxies    |   |-- http-log plugin     |
|   +-- Kong Admin API -----|------------>|   +-- routes to app       |
|   +-- Redis/Valkey -------|------------>| Redis 7 (:6379)           |
+---------------------------+             | Valkey 8 (:6380)          |
                                          | PostgreSQL 16 (:5432)     |
                                          +---------------------------+
```

**Bidirectional Setup:**
- Bun app connects to Kong Admin API and Redis as clients
- Kong proxies requests back to your app via `host.docker.internal:3000`
- This enables http-log capture for local development requests

See [Kong Integration Guide](kong-test-setup.md) for routing configuration.

## Quick Start

### Option 1: Zed IDE (Recommended)

1. Open the project folder in Zed
2. Click **"Open in Dev Container"**
3. Infrastructure starts automatically (Kong, Postgres, Redis)
4. Run your Bun app locally as usual

### Option 2: Command Line

```bash
# Start infrastructure
bun run devcontainer:up

# Start app with devcontainer environment
bun run dev:devcontainer

# Stop infrastructure
bun run devcontainer:down
```

## Services

| Service | Port | Connect from your app |
|---------|------|-----------------------|
| Kong Admin | 8001 | `http://localhost:8001` |
| Kong Proxy | 8000 | `http://localhost:8000` |
| Kong Manager | 8002 | `http://localhost:8002` |
| Redis | 6379 | `redis://localhost:6379` |
| Valkey | 6380 | `redis://localhost:6380` |
| PostgreSQL | 5432 | `localhost:5432` |

Data persists via Docker named volumes (`kong-db-data`, `redis-data`, `valkey-data`).

**Redis vs Valkey:** Both are compatible cache backends. The service auto-detects the server type at runtime and displays it in the `/health` endpoint. Use Valkey for a fully open-source Redis alternative.

## Kong Configuration with decK

The decK config lives at **`kong/kong.yml`** in your project root - version-controlled alongside your code. Manage it from your host terminal:

```bash
# Sync configuration to Kong
deck gateway sync kong/kong.yml

# Dump current Kong state
deck gateway dump -o kong/kong.yml

# Show configuration drift
deck gateway diff kong/kong.yml
```

Or use the Zed tasks via `Cmd+Shift+P` -> "task: spawn".

## Zed Tasks

Access via `Cmd+Shift+P` -> "task: spawn". **144 tasks** organized by category.

For the complete task reference, see **[Zed Tasks Reference](zed-tasks.md)**.

### Quick Reference

### Kong Tasks

| Task | What it does |
|------|-------------|
| `kong: status` | Check Kong health |
| `kong: list services` | Show configured services |
| `kong: list routes` | Show configured routes |
| `kong: list plugins` | Show active plugins |
| `kong: sync config (decK)` | Apply declarative config |
| `kong: dump config (decK)` | Export current Kong state |
| `kong: diff config (decK)` | Show config drift |
| `kong: view logs` | Tail Kong container logs |
| `kong: restart` | Restart the Kong container |

### Redis Tasks

| Task | What it does |
|------|-------------|
| `redis: ping` | Check Redis connectivity |
| `redis: monitor (live commands)` | Live stream all Redis commands |
| `redis: info stats` | Redis server statistics |
| `redis: keys (all)` | List all Redis keys |
| `redis: flush all` | Clear all Redis data |
| `redis: interactive CLI` | Open redis-cli session |
| `redis: start (standalone)` | Start standalone Redis container |
| `redis: stop` | Stop Redis container |
| `redis: remove` | Remove Redis container |
| `redis: restart (standalone)` | Full restart cycle |
| `redis: logs` | View Redis logs |
| `redis: status` | Container status |
| `redis: bigkeys` | Find largest keys |
| `redis: memkeys` | Memory analysis per key |
| `redis: scan auth keys` | Scan for auth_service keys |

### Valkey Tasks

| Task | What it does |
|------|-------------|
| `valkey: ping` | Check Valkey connectivity |
| `valkey: info` | Valkey server information |
| `valkey: keys (all)` | List all Valkey keys |
| `valkey: flush all` | Clear all Valkey data |
| `valkey: interactive CLI` | Open valkey-cli session |
| `valkey: start` | Start Valkey container |
| `valkey: stop` | Stop Valkey container |
| `valkey: restart` | Restart Valkey container |
| `valkey: logs` | View Valkey logs |
| `valkey: status` | Container status |
| `dev: start with Valkey` | Start dev server with Valkey |
| `server: health check (Valkey)` | Health check using Valkey |

### Postgres Tasks

| Task | What it does |
|------|-------------|
| `postgres: interactive psql` | Open psql session |
| `postgres: list tables` | List Kong tables |
| `postgres: kong services (SQL)` | Query Kong services table |
| `postgres: kong routes (SQL)` | Query Kong routes table |
| `postgres: db size` | Show database size |

### DevContainer Tasks

| Task | What it does |
|------|-------------|
| `devcontainer: up` | Start infrastructure containers |
| `devcontainer: down` | Stop infrastructure containers |
| `devcontainer: down (clean volumes)` | Stop and remove volumes |
| `devcontainer: logs` | Follow all container logs |
| `devcontainer: status` | Show container status |
| `infra: status check` | Verify Kong + Redis + Postgres health |

### Development Tasks

| Task | What it does |
|------|-------------|
| `dev: start (watch mode)` | Start dev server with hot reload |
| `dev: start (devcontainer env)` | Start with devcontainer environment |
| `dev: clean restart` | Kill port 3000 and restart |
| `dev: quickstart` | Kill, generate docs, start dev |
| `server: kill (port 3000)` | Kill process on port 3000 |
| `server: health check` | Check if server is healthy |
| `docs: generate OpenAPI` | Generate OpenAPI spec |

### Testing Tasks

| Task | What it does |
|------|-------------|
| `test: e2e (direct)` | Run E2E tests directly |
| `test: e2e (via Kong)` | Run E2E tests via Kong |
| `test: e2e UI` | Interactive Playwright UI |
| `test: bun (all)` | Run all Bun tests |
| `test: bun (watch)` | Run tests in watch mode |
| `test: k6 smoke (quick)` | Quick K6 smoke tests |

### Quality Tasks

| Task | What it does |
|------|-------------|
| `quality: check (all)` | TypeScript + Biome + YAML |
| `quality: fix` | Auto-fix linting issues |

## Environment Workflow

The project maintains two development modes:

| Mode | Command | KONG_ADMIN_URL | Use Case |
|------|---------|----------------|----------|
| Live Testing | `bun run dev` | `http://192.168.178.3:30001` | Tests against real Kong |
| DevContainer | `bun run dev:devcontainer` | `http://localhost:8001` | Local Docker development |

### Switching Between Modes

```bash
# Live testing mode (default)
bun run dev

# DevContainer mode
bun run devcontainer:up        # Start Docker infrastructure
bun run dev:devcontainer       # Start with devcontainer env

# Return to live testing
bun run devcontainer:down      # Stop Docker infrastructure
bun run dev                    # Back to live testing
```

## Scripts

| Script | Description |
|--------|-------------|
| `devcontainer:up` | Start infrastructure containers |
| `devcontainer:down` | Stop infrastructure containers |
| `devcontainer:down:clean` | Stop and remove volumes (full reset) |
| `devcontainer:logs` | Follow infrastructure logs |
| `devcontainer:status` | Show running containers |
| `dev:devcontainer` | Copy .env.devcontainer and start dev server |

## File Structure

```
project-root/
|-- .devcontainer/
|   |-- devcontainer.json      # Zed-compatible dev container spec
|   |-- docker-compose.yml     # Kong + Redis + Postgres + toolbox
|   +-- post-create.sh         # Installs decK, httpie, redis-cli
|-- .zed/
|   |-- tasks.json             # Infra management tasks
|   +-- settings.json          # Project settings + env vars
|-- kong/
|   +-- kong.yml               # decK config (version-controlled)
|-- .env.devcontainer          # DevContainer environment variables
+-- ...
```

### Infrastructure Tasks

| Task | What it does |
|------|-------------|
| `deps: up (Kong + Redis)` | Start Kong and Redis only |
| `deps: up (Kong + Valkey)` | Start Kong and Valkey only |
| `deps: up (all)` | Start all infrastructure services |
| `deps: down` | Stop all infrastructure services |
| `docker: ps` | Show running containers |
| `docker: ps (all)` | Show all containers (including stopped) |

## Port Conflicts

DevContainer uses standard ports that may conflict with other services:

| DevContainer | Test Compose | Notes |
|--------------|--------------|-------|
| 8000, 8001 | 8100, 8101 | No conflict |
| 6379 (Redis) | - | DevContainer Redis |
| 6380 (Valkey) | - | DevContainer Valkey |
| 5432 | 5433 | No conflict |

DevContainer and test infrastructure (`docker-compose.test.yml`) can run simultaneously.

## Troubleshooting

### Config changes to devcontainer.json

Zed doesn't auto-rebuild. Stop the container and reopen:
```bash
docker compose -f .devcontainer/docker-compose.yml down
# Then reopen in Zed
```

### Data reset

```bash
# Keep volumes (preserves data)
bun run devcontainer:down

# Destroy volumes (full reset)
bun run devcontainer:down:clean
```

### Redis-only reset

Use the `redis: flush all` Zed task or:
```bash
redis-cli -h localhost flushall
```
