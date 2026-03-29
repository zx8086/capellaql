# Zed IDE DevContainer Setup

Containerized infrastructure for local Bun development. Your app runs natively; supporting services run in Docker.

## Architecture

```
Host Machine                              Docker (via .devcontainer/)
+---------------------------+             +---------------------------+
| Bun app (localhost:4000)  |             | OpenTelemetry Collector   |
|   +-- Couchbase Capella --|------------>|   (optional local dev)    |
|   +-- Health: /health     |             | Jaeger (:16686)           |
|   +-- GraphQL: /graphql   |             | Prometheus (:9090)        |
+---------------------------+             | Grafana (:3001)           |
                                          +---------------------------+
```

**Setup:**
- Bun app connects to Couchbase Capella (cloud) and optionally to local observability stack
- Docker Compose provides Jaeger, Prometheus, and Grafana via the `observability` profile

## Quick Start

### Option 1: Zed IDE (Recommended)

1. Open the project folder in Zed
2. Click **"Open in Dev Container"**
3. Infrastructure starts automatically
4. Run your Bun app locally as usual

### Option 2: Command Line

```bash
# Start with optional observability stack
docker compose --profile observability up

# Start app
bun run dev

# Stop infrastructure
docker compose down
```

## Services

| Service | Port | Purpose |
|---------|------|---------|
| CapellaQL | 4000 | GraphQL API and health endpoints |
| Jaeger UI | 16686 | Distributed trace visualization |
| Prometheus | 9090 | Metrics collection |
| Grafana | 3001 | Metrics dashboards |

## Zed Tasks

Access via `Cmd+Shift+P` -> "task: spawn".

For the complete task reference, see **[Zed Tasks Reference](zed-tasks.md)**.

### Quick Reference

### DevContainer Tasks

| Task | What it does |
|------|-------------|
| `devcontainer: up` | Start infrastructure containers |
| `devcontainer: down` | Stop infrastructure containers |
| `devcontainer: down (clean volumes)` | Stop and remove volumes |
| `devcontainer: logs` | Follow all container logs |
| `devcontainer: status` | Show container status |

### Development Tasks

| Task | What it does |
|------|-------------|
| `dev: start (watch mode)` | Start dev server with hot reload |
| `server: health check` | Check if server is healthy |
| `docs: generate OpenAPI` | Generate OpenAPI spec |

### Testing Tasks

| Task | What it does |
|------|-------------|
| `test: bun (all)` | Run all Bun tests |
| `test: bun (watch)` | Run tests in watch mode |
| `test: playwright (direct)` | Run Playwright E2E tests |
| `test: playwright UI` | Interactive Playwright UI |
| `test: k6 smoke (quick)` | Quick K6 smoke tests |

### Quality Tasks

| Task | What it does |
|------|-------------|
| `quality: check (all)` | TypeScript + Biome + YAML |
| `quality: fix` | Auto-fix linting issues |

## Environment Configuration

The project uses a single `.env` file for all development modes:

```bash
# Copy example and configure
cp .env.example .env

# Key settings:
PORT=4000
COUCHBASE_URL=couchbase://your-cluster
COUCHBASE_USERNAME=your-user
COUCHBASE_PASSWORD=your-password
COUCHBASE_BUCKET=your-bucket
```

See [Environment Variables Reference](../configuration/environment.md) for the complete list.

## File Structure

```
project-root/
|-- .devcontainer/
|   |-- devcontainer.json      # Zed-compatible dev container spec
|   +-- docker-compose.yml     # Observability stack
|-- .zed/
|   |-- tasks.json             # IDE management tasks
|   +-- settings.json          # Project settings
|-- docker-compose.yml         # Main compose file with observability profile
+-- .env                       # Environment configuration
```

## Port Conflicts

Check for port conflicts before starting:

```bash
lsof -i :4000    # CapellaQL server
lsof -i :16686   # Jaeger UI
lsof -i :9090    # Prometheus
lsof -i :3001    # Grafana
```

## Troubleshooting

### Config changes to devcontainer.json

Zed doesn't auto-rebuild. Stop the container and reopen:
```bash
docker compose -f .devcontainer/docker-compose.yml down
# Then reopen in Zed
```

### Server won't start

```bash
# Check if port 4000 is in use
lsof -i :4000

# Kill existing process
lsof -ti:4000 | xargs kill -9
```

### Couchbase connection issues

- Verify credentials in `.env`
- Check Capella cluster is running and accessible
- Ensure IP is whitelisted in Capella allowed IP ranges
