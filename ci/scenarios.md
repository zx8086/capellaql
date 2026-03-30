# Docker Factory -- Real-World Scenarios

Tested configurations for common application patterns.
Each scenario shows the `.gitlab-ci.yml` inputs and the
Dockerfile that Docker Factory generates.

---

## Scenario 1: GraphQL API (Bun + Distroless)

**Pattern:** API service that builds to `dist/`, needs extra
source dirs at runtime, uses `bunfig.toml`, and requires
custom environment variables.

**Real-world example:** CapellaQL -- GraphQL API with
OpenTelemetry instrumentation.

### Inputs

```yaml
include:
  - component: gitlab.com/.../docker-factory/docker-factory@main
    inputs:
      language: bun
      port: "4000"
      entrypoint: "src/index.ts"
      artifact_paths: "dist src/telemetry"
      runtime_env_vars: "ENABLE_OPENTELEMETRY=true"
      dep_files: "package.json bun.lock bunfig.toml"
```

### What each input does

| Input | Why |
|-------|-----|
| `artifact_paths: "dist src/telemetry"` | Overrides default `src public` -- only `dist/` (compiled output) and `src/telemetry` (runtime instrumentation) are copied to production |
| `runtime_env_vars: "ENABLE_OPENTELEMETRY=true"` | Appended to the default `NODE_ENV=production PORT=4000 HOST=0.0.0.0` |
| `dep_files: "package.json bun.lock bunfig.toml"` | Adds `bunfig.toml` to dependency layer -- it configures registry scopes, install behavior, etc. Treated as optional (glob COPY) so builds work even without it |

### Generated Dockerfile

```dockerfile
# syntax=docker/dockerfile:1

FROM oven/bun:1.3.9-alpine AS deps-base
WORKDIR /app
RUN ... apk add --no-cache ca-certificates dumb-init ...

FROM deps-base AS deps-dev
COPY package.json ./
COPY bun.lock* ./
COPY bunfig.toml* ./
RUN ... bun install --frozen-lockfile

FROM deps-base AS deps-prod
COPY package.json ./
COPY bun.lock* ./
COPY bunfig.toml* ./
RUN ... bun install --frozen-lockfile --production

FROM deps-dev AS builder
COPY . .
RUN ... if grep -q '"build"' package.json; then bun run build; fi
RUN rm -rf .git .github node_modules/.cache test/ tests/ ...
RUN mkdir -p dist src/telemetry

FROM dhi.io/static:20230311 AS production
COPY --from=oven/bun:1.3.9-alpine --chown=65532:65532 /usr/local/bin/bun /usr/local/bin/bun
COPY --from=deps-base --chown=65532:65532 /usr/bin/dumb-init /usr/bin/dumb-init
COPY --from=deps-base --chown=65532:65532 /lib/ld-musl-*.so.1 /lib/
COPY --from=deps-base --chown=65532:65532 /usr/lib/libgcc_s.so.1 /usr/lib/
COPY --from=deps-base --chown=65532:65532 /usr/lib/libstdc++.so.6 /usr/lib/
WORKDIR /app
COPY --from=deps-prod --chown=65532:65532 /app/node_modules ./node_modules
COPY --from=deps-prod --chown=65532:65532 /app/package.json ./package.json
COPY --from=builder --chown=65532:65532 /app/dist ./dist
COPY --from=builder --chown=65532:65532 /app/src/telemetry ./src/telemetry

USER 65532:65532
ENV NODE_ENV=production PORT=4000 HOST=0.0.0.0 ENABLE_OPENTELEMETRY=true
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["/usr/local/bin/bun", "--eval", \
    "fetch(\"http://localhost:4000/health\").then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/usr/local/bin/bun", "src/index.ts"]
```

### Key points

- `bunfig.toml*` uses a glob -- if the file is missing, the
  COPY is a no-op (build does not fail)
- `bun.lock*` also uses a glob for the same reason
- Only `dist` and `src/telemetry` are in production (not the
  full `src/` or `public/`)
- dumb-init wraps Bun for proper signal handling in distroless
- musl + shared libs are copied because distroless has no libc

---

## Scenario 2: API with Patched Dependencies (Bun + Distroless)

**Pattern:** API service that uses `patchedDependencies` in
`package.json` and runs postinstall scripts. Needs extra
directories present before `bun install`.

**Real-world example:** Auth Service -- API with patched
dependencies and OpenAPI doc generation during build.

### Inputs

```yaml
include:
  - component: gitlab.com/.../docker-factory/docker-factory@main
    inputs:
      language: bun
      install_context: "patches scripts"
      build_cmd: "bun run generate-docs && bun run build"
      runtime_env_vars: "TELEMETRY_MODE=otlp"
```

### What each input does

| Input | Why |
|-------|-----|
| `install_context: "patches scripts"` | Copies `patches/` and `scripts/` directories before `bun install` runs, so `patchedDependencies` can apply and `postinstall` scripts can execute |
| `build_cmd: "bun run generate-docs && bun run build"` | Overrides default build -- generates OpenAPI docs first, then builds |
| `runtime_env_vars: "TELEMETRY_MODE=otlp"` | Adds OTLP telemetry mode to runtime environment |

### Generated Dockerfile

```dockerfile
# syntax=docker/dockerfile:1

FROM oven/bun:1.3.9-alpine AS deps-base
WORKDIR /app
RUN ... apk add --no-cache ca-certificates dumb-init ...

FROM deps-base AS deps-dev
COPY package.json ./
COPY bun.lock* ./
COPY patches/ ./patches/
COPY scripts/ ./scripts/
RUN ... bun install --frozen-lockfile

FROM deps-base AS deps-prod
COPY package.json ./
COPY bun.lock* ./
COPY patches/ ./patches/
COPY scripts/ ./scripts/
RUN ... bun install --frozen-lockfile --production

FROM deps-dev AS builder
COPY . .
RUN ... bun run generate-docs && bun run build
RUN rm -rf .git .github node_modules/.cache test/ tests/ ...
RUN mkdir -p src public

FROM dhi.io/static:20230311 AS production
COPY --from=oven/bun:1.3.9-alpine --chown=65532:65532 /usr/local/bin/bun /usr/local/bin/bun
COPY --from=deps-base --chown=65532:65532 /usr/bin/dumb-init /usr/bin/dumb-init
COPY --from=deps-base --chown=65532:65532 /lib/ld-musl-*.so.1 /lib/
COPY --from=deps-base --chown=65532:65532 /usr/lib/libgcc_s.so.1 /usr/lib/
COPY --from=deps-base --chown=65532:65532 /usr/lib/libstdc++.so.6 /usr/lib/
WORKDIR /app
COPY --from=deps-prod --chown=65532:65532 /app/node_modules ./node_modules
COPY --from=deps-prod --chown=65532:65532 /app/package.json ./package.json
COPY --from=builder --chown=65532:65532 /app/src ./src
COPY --from=builder --chown=65532:65532 /app/public ./public

USER 65532:65532
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 TELEMETRY_MODE=otlp
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["/usr/local/bin/bun", "--eval", \
    "fetch(\"http://localhost:3000/health\").then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/usr/local/bin/bun", "src/index.ts"]
```

### Key points

- `patches/` and `scripts/` are copied in both deps-dev and
  deps-prod stages (before `RUN bun install`) so
  `patchedDependencies` and `postinstall` hooks work in both
- If `patches/` or `scripts/` does not exist in the repo, the
  COPY will fail (intentional -- if you declare it, it must
  exist)
- The generated OpenAPI docs from `bun run generate-docs` are
  available during build but not copied to production (only
  `src` and `public` are artifacts)

---

## Scenario 3: SvelteKit SSR (Bun + Alpine Runtime)

**Pattern:** Server-side rendered web application. Uses Alpine
Bun as the runtime image instead of distroless. No dumb-init,
musl, or binary copies needed.

**Real-world example:** SvelteKit SSR app running from
`build/index.js`.

### Inputs

```yaml
include:
  - component: gitlab.com/.../docker-factory/docker-factory@main
    inputs:
      language: bun-ssr
      builder_image: "oven/bun:1.3.9-alpine"
      runtime_image: "oven/bun:1.3.9-alpine"
      entrypoint: "build/index.js"
      build_cmd: >
        cp bunfig.build.toml bunfig.toml &&
        bun run svelte-kit sync &&
        bun run build
```

### What each input does

| Input | Why |
|-------|-----|
| `language: bun-ssr` | Uses SSR-optimized config: no dumb-init, no musl, no binary copies. Default artifacts include `build/` |
| `runtime_image: "oven/bun:1.3.9-alpine"` | Alpine Bun has everything needed -- no distroless binary surgery required |
| `entrypoint: "build/index.js"` | SvelteKit adapter-node outputs to `build/` |
| `build_cmd` | Swaps in build-time bunfig, syncs SvelteKit types, then builds |

### Generated Dockerfile

```dockerfile
# syntax=docker/dockerfile:1

FROM oven/bun:1.3.9-alpine AS deps-base
WORKDIR /app
RUN ... apk add --no-cache ca-certificates ...

FROM deps-base AS deps-dev
COPY package.json ./
COPY bun.lock* ./
RUN ... bun install --frozen-lockfile

FROM deps-base AS deps-prod
COPY package.json ./
COPY bun.lock* ./
RUN ... bun install --frozen-lockfile --production

FROM deps-dev AS builder
COPY . .
RUN ... cp bunfig.build.toml bunfig.toml && bun run svelte-kit sync && bun run build
RUN rm -rf .git .github node_modules/.cache test/ tests/ ...
RUN mkdir -p build src public

FROM oven/bun:1.3.9-alpine AS production
WORKDIR /app
COPY --from=deps-prod --chown=65532:65532 /app/node_modules ./node_modules
COPY --from=deps-prod --chown=65532:65532 /app/package.json ./package.json
COPY --from=builder --chown=65532:65532 /app/build ./build
COPY --from=builder --chown=65532:65532 /app/src ./src
COPY --from=builder --chown=65532:65532 /app/public ./public

USER 65532:65532
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["/usr/local/bin/bun", "--eval", \
    "fetch(\"http://localhost:3000/health\").then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["/usr/local/bin/bun", "build/index.js"]
```

### Key points

- **No binary copies** -- `RUNTIME_BINARY` is empty, so no
  `COPY --from=... /usr/local/bin/bun` line. Alpine Bun
  already has Bun installed.
- **No dumb-init** -- `NEEDS_DUMB_INIT: false` and
  `SYSTEM_PACKAGES` does not include it. Bun on Alpine
  handles signals natively.
- **No musl/shared lib copies** -- `NEEDS_MUSL: false` and
  `SHARED_LIBS` is empty. Alpine Bun has everything.
- **Direct ENTRYPOINT** -- No `dumb-init` wrapper, just
  `["/usr/local/bin/bun", "build/index.js"]`
- Production stage is clean: just the app files on a full
  Alpine Bun image

---

## Scenario 4: Node.js API (npm + Distroless)

**Pattern:** Standard Node.js API using npm. Demonstrates that
the same new inputs work with the `node` language config.

### Inputs

```yaml
include:
  - component: gitlab.com/.../docker-factory/docker-factory@main
    inputs:
      language: node
      builder_image: "node:22-alpine"
      entrypoint: "dist/server.js"
      build_cmd: "npm run build"
      artifact_paths: "dist"
      runtime_env_vars: "LOG_LEVEL=info"
      dep_files: "package.json package-lock.json .npmrc"
```

### What each input does

| Input | Why |
|-------|-----|
| `artifact_paths: "dist"` | Overrides default `src public` -- only the compiled `dist/` directory goes to production |
| `runtime_env_vars: "LOG_LEVEL=info"` | Appended to `NODE_ENV=production PORT=3000 HOST=0.0.0.0` |
| `dep_files: "package.json package-lock.json .npmrc"` | Adds `.npmrc` for private registry configuration. `.npmrc` is treated as optional (glob COPY) |

### Generated Dockerfile

```dockerfile
# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps-base
WORKDIR /app
RUN ... apk add --no-cache ca-certificates dumb-init ...

FROM deps-base AS deps-dev
COPY package.json ./
COPY package-lock.json* ./
COPY .npmrc* ./
RUN ... npm ci

FROM deps-base AS deps-prod
COPY package.json ./
COPY package-lock.json* ./
COPY .npmrc* ./
RUN ... npm ci --omit=dev

FROM deps-dev AS builder
COPY . .
RUN ... npm run build
RUN rm -rf .git .github node_modules/.cache test/ tests/ ...
RUN mkdir -p dist

FROM dhi.io/static:20230311 AS production
COPY --from=node:22-alpine --chown=65532:65532 /usr/local/bin/node /usr/local/bin/node
COPY --from=deps-base --chown=65532:65532 /usr/bin/dumb-init /usr/bin/dumb-init
COPY --from=deps-base --chown=65532:65532 /lib/ld-musl-*.so.1 /lib/
COPY --from=deps-base --chown=65532:65532 /usr/lib/libgcc_s.so.1 /usr/lib/
COPY --from=deps-base --chown=65532:65532 /usr/lib/libstdc++.so.6 /usr/lib/
WORKDIR /app
COPY --from=deps-prod --chown=65532:65532 /app/node_modules ./node_modules
COPY --from=deps-prod --chown=65532:65532 /app/package.json ./package.json
COPY --from=builder --chown=65532:65532 /app/dist ./dist

USER 65532:65532
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 LOG_LEVEL=info
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["/usr/local/bin/node", "-e", \
    "fetch('http://localhost:3000/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/usr/local/bin/node", "dist/server.js"]
```

### Key points

- `.npmrc*` uses a glob -- private registry config is optional
- `package-lock.json*` also uses a glob (matches the
  `*-lock.*` pattern)
- Only `dist/` goes to production (not source code)
- Same distroless pattern as Bun: node binary, dumb-init,
  musl, shared libs all copied

---

## Scenario 5: Node.js with Patched Dependencies (npm + Distroless)

**Pattern:** Node.js API with `patch-package` patches and a
prepare script.

### Inputs

```yaml
include:
  - component: gitlab.com/.../docker-factory/docker-factory@main
    inputs:
      language: node
      builder_image: "node:22-alpine"
      install_context: "patches"
      build_cmd: "npm run build"
      artifact_paths: "dist"
```

### Generated Dockerfile (key sections)

```dockerfile
FROM deps-base AS deps-dev
COPY package.json ./
COPY package-lock.json* ./
COPY patches/ ./patches/
RUN ... npm ci

FROM deps-base AS deps-prod
COPY package.json ./
COPY package-lock.json* ./
COPY patches/ ./patches/
RUN ... npm ci --omit=dev
```

### Key points

- `patches/` is available before `npm ci` so `patch-package`
  postinstall scripts work
- Same pattern as the Bun patched dependencies scenario
- Works with any package manager that supports patch files

---

## Default Bun (Zero-Config) -- Regression Check

To confirm existing users are unaffected, the default Bun
config with no new inputs produces identical output to before.

### Inputs

```yaml
include:
  - component: gitlab.com/.../docker-factory/docker-factory@main
    inputs:
      language: bun
```

### Variable resolution

All new inputs default to empty string:

| Input | Value | Effect |
|-------|-------|--------|
| `artifact_paths` | `""` | Falls through to `bun.yml` default: `src public` |
| `runtime_env_vars` | `""` | No append, ENV stays: `NODE_ENV=production PORT=3000 HOST=0.0.0.0` |
| `dep_files` | `""` | Falls through to `bun.yml` default: `package.json bun.lock` |
| `install_context` | `""` | No extra COPY lines before install |

The only difference from pre-change output: optional dep
files (`bun.lock`) are now emitted as individual COPY lines
with globs (`COPY bun.lock* ./`) instead of a single batched
COPY. This is functionally identical.

---

## Input Reference (New Inputs)

| Input | Type | Default | Override Behavior |
|-------|------|---------|-------------------|
| `artifact_paths` | string | `""` (use language default) | Replaces `APP_ARTIFACT_PATHS` from language config |
| `runtime_env_vars` | string | `""` | Appends to `ENV_VARS` from language config (space-separated KEY=VALUE, no spaces in values) |
| `dep_files` | string | `""` (use language default) | Replaces `DEP_FILES` from language config |
| `install_context` | string | `""` | Adds COPY lines for directories before `bun install`/`npm ci` |

### How dep_files classification works

Files listed in `dep_files` are classified as required or
optional based on their name:

| Pattern | Classification | COPY style |
|---------|---------------|------------|
| `package.json` | Required | `COPY package.json ./` (fails if missing) |
| `*.lock`, `*-lock.*`, `*.lockb` | Optional | `COPY bun.lock* ./` (no-op if missing) |
| `bunfig.toml` | Optional | `COPY bunfig.toml* ./` (no-op if missing) |
| `.npmrc` | Optional | `COPY .npmrc* ./` (no-op if missing) |
| `.yarnrc*` | Optional | `COPY .yarnrc* ./` (no-op if missing) |
| Everything else | Required | `COPY <file> ./` (fails if missing) |
