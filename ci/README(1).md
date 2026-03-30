# Docker Factory

A GitLab CI/CD Component that provides automated, opinionated Docker container image building and publishing. Generates multi-stage Dockerfiles following a "golden path" pattern optimized for security and performance using DHI distroless base images.

[![Latest Release](https://gitlab.com/platform_engineering/platform-components/docker-factory/-/badges/release.svg)](https://gitlab.com/platform_engineering/platform-components/docker-factory/-/releases)

## Features

- **Golden Path Dockerfile Generation** - Automatic 6-stage multi-stage builds
- **DHI Distroless Production Images** - Minimal attack surface, no shell in production
- **BuildKit Optimization** - Layer caching, multi-platform builds
- **Security Hardened** - Non-root execution (uid 65532), dumb-init signal handling
- **Automatic Metadata** - Extracts name, version, description from package.json
- **Smart Tagging** - SHA, branch, version, and latest tags automatically computed
- **Debug Mode** - Feature branches get shell access for troubleshooting

## Quick Start

Add this to your `.gitlab-ci.yml`:

```yaml
# Zero-config: Uses your GitLab project's container registry automatically
include:
  - component: gitlab.com/platform_engineering/platform-components/docker-factory/docker-factory@main
    inputs:
      language: bun
```

That's it! If you're running in GitLab CI with Container Registry enabled, no additional configuration is needed. Your image will be published to `registry.gitlab.com/<your-group>/<your-project>`.

For external registries, provide explicit inputs:

```yaml
include:
  - component: gitlab.com/platform_engineering/platform-components/docker-factory/docker-factory@main
    inputs:
      language: bun
      registry: "registry.example.com"
      image_name: "myteam/myapp"
```

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `language` | `bun` | Application runtime (`bun`, `bun-ssr`, `node`, `java`) |
| `builder_image` | `oven/bun:1.3.9-alpine` | Builder image for compilation |
| `runtime_image` | `dhi.io/static:20230311` | Distroless base for production |
| `entrypoint` | `src/index.ts` | Application entry file |
| `port` | `3000` | Application port (EXPOSE, healthcheck) |
| `registry` | _(auto-detected)_ | Container registry URL. Auto-detects from `CI_REGISTRY` in GitLab CI. |
| `image_name` | _(auto-detected)_ | Image path. Auto-detects from `CI_REGISTRY_IMAGE` in GitLab CI. |
| `registry_user` | `""` | Registry username (or use CI_REGISTRY_USER) |
| `registry_password` | `""` | Registry password (or use CI_REGISTRY_PASSWORD) |
| `custom_tags` | `""` | Additional tags (space-separated) |
| `tag_latest` | `true` | Tag as `latest` on default branch |
| `platforms` | `linux/amd64` | Target platforms (comma-separated) |
| `build_args` | `""` | Custom build args (newline-separated KEY=VALUE) |
| `build_cmd` | _(language default)_ | Override build command |
| `artifact_paths` | _(language default)_ | Space-separated directories to copy from builder to production |
| `runtime_env_vars` | `""` | Additional runtime ENV vars as space-separated KEY=VALUE pairs |
| `dep_files` | _(language default)_ | Dependency files to copy before install, space-separated |
| `install_context` | `""` | Extra directories to copy before dependency install (e.g. `patches scripts`) |
| `cache_enabled` | `true` | Enable BuildKit caching |
| `cache_image` | `""` | Custom cache image reference |
| `generate_dockerfile` | `true` | Generate golden path Dockerfile |
| `dockerfile` | `Dockerfile` | Custom Dockerfile path (when generate_dockerfile=false) |
| `context` | `.` | Docker build context path |
| `verify_base_image` | `false` | Pull and verify base images before build |
| `push` | `true` | Push images to registry |
| `allow_failure` | `false` | Allow job to fail |
| `rules_enabled` | `true` | Enable default pipeline rules |
| `stage` | `build` | Pipeline stage |
| `job_name` | `docker-build` | Job name |
| `timeout` | `30 minutes` | Job timeout |

## Input Validation

Before building, the component validates all inputs and reports errors together:

| Input | Validation |
|-------|------------|
| `registry` | Required unless GitLab CI variables (`CI_REGISTRY`, `CI_REGISTRY_IMAGE`) are present |
| `image_name` | Required when `registry` is explicitly set |
| `port` | Must be numeric, range 1-65535 |
| `platforms` | Must start with valid OS (`linux/`, `darwin/`, `windows/`) |
| `context` | Directory must exist |
| `entrypoint` | File must exist (when `generate_dockerfile=true`) |
| `dockerfile` | File must exist (when `generate_dockerfile=false`) |
| `custom_tags` | Each tag must be OCI-compliant (alphanumeric, `.`, `_`, `-`, max 128 chars) |

If validation fails, you'll see a consolidated error report:

```
══════════════════════════════════════════════════════
  INPUT VALIDATION FAILED
══════════════════════════════════════════════════════
Errors:
  - 'port' must be numeric, got: 'abc'
  - 'entrypoint' file does not exist: 'src/main.ts' (in context: .)

Fix the above errors and retry.
```

## Generated Dockerfile Stages

The golden path Dockerfile includes 6 optimized stages:

1. **deps-base** - System packages on builder image
2. **deps-dev** - Full dependencies (dev + prod)
3. **deps-prod** - Production dependencies only
4. **builder** - Application build and cleanup
5. **production** - DHI distroless with runtime + libs only
6. **debug** - Production + busybox/shell (non-main branches)

## Build Targets

| Branch | Target | Shell Access |
|--------|--------|--------------|
| `main` / `master` | `production` | No (distroless) |
| Tags | `production` | No (distroless) |
| Feature branches | `debug` | Yes (busybox) |

## Tag Strategy

Images are automatically tagged with:

| Condition | Tag Example |
|-----------|-------------|
| Always | `abc1234` (commit SHA) |
| Branch builds | `feature-branch-name` |
| Git tags | `v1.0.0` |
| Default branch + version | `1.0.0` (from package.json) |
| Default branch + tag_latest | `latest` |

## Supported Languages

| Language | Builder Image | Runtime Image | Package Manager | Use Case |
|----------|---------------|---------------|-----------------|----------|
| `bun` | `oven/bun:1.3.9-alpine` | `dhi.io/static:20230311` | bun | APIs, services (distroless) |
| `bun-ssr` | `oven/bun:1.3.9-alpine` | `oven/bun:1.3.9-alpine` | bun | SSR apps - SvelteKit, Astro (Alpine) |
| `node` | `node:22-alpine` | `dhi.io/static:20230311` | npm | APIs, services (distroless) |
| `java` | `maven:3.9-eclipse-temurin-21-alpine` | `gcr.io/distroless/java21-debian12` | Maven | Spring Boot, etc. |

## Examples

### Bun (Zero-Config)

The simplest setup - just specify your language:

```yaml
include:
  - component: gitlab.com/platform_engineering/platform-components/docker-factory/docker-factory@main
    inputs:
      language: bun
```

### Node.js (npm)

```yaml
include:
  - component: gitlab.com/platform_engineering/platform-components/docker-factory/docker-factory@main
    inputs:
      language: node
      builder_image: "node:22-alpine"
```

### Java (Maven)

**Note:** Java requires explicit `builder_image` and `runtime_image`. The `entrypoint` input is ignored - JAR path is fixed at `/app/target/app.jar`.

```yaml
include:
  - component: gitlab.com/platform_engineering/platform-components/docker-factory/docker-factory@main
    inputs:
      language: java
      builder_image: "maven:3.9-eclipse-temurin-21-alpine"
      runtime_image: "gcr.io/distroless/java21-debian12"
```

### SvelteKit SSR (Bun)

**Note:** `bun-ssr` uses Alpine Bun as the runtime image instead of distroless. No dumb-init, musl, or binary copies needed.

```yaml
include:
  - component: gitlab.com/platform_engineering/platform-components/docker-factory/docker-factory@main
    inputs:
      language: bun-ssr
      builder_image: "oven/bun:1.3.9-alpine"
      runtime_image: "oven/bun:1.3.9-alpine"
      entrypoint: "build/index.js"
      build_cmd: "bun run build"
```

### Custom Artifacts and Environment

Override which directories are copied to production and add runtime environment variables:

```yaml
include:
  - component: gitlab.com/platform_engineering/platform-components/docker-factory/docker-factory@main
    inputs:
      language: bun
      artifact_paths: "dist src/telemetry"
      runtime_env_vars: "ENABLE_OPENTELEMETRY=true"
      dep_files: "package.json bun.lock bunfig.toml"
```

### Patched Dependencies

Copy extra directories (patches, scripts) before `bun install` for patchedDependencies or postinstall scripts:

```yaml
include:
  - component: gitlab.com/platform_engineering/platform-components/docker-factory/docker-factory@main
    inputs:
      language: bun
      install_context: "patches scripts"
      build_cmd: "bun run generate-docs && bun run build"
```

### External Registry (Docker Hub, ECR, GCR, etc.)

```yaml
include:
  - component: gitlab.com/platform_engineering/platform-components/docker-factory/docker-factory@main
    inputs:
      language: bun
      registry: "docker.io"
      image_name: "mycompany/myapp"
      registry_user: "$DOCKERHUB_USERNAME"
      registry_password: "$DOCKERHUB_TOKEN"
```

### Multi-Platform Build

```yaml
include:
  - component: gitlab.com/platform_engineering/platform-components/docker-factory/docker-factory@main
    inputs:
      registry: "registry.example.com"
      image_name: "myteam/myapp"
      platforms: "linux/amd64,linux/arm64"
```

### Custom Build Command

```yaml
include:
  - component: gitlab.com/platform_engineering/platform-components/docker-factory/docker-factory@main
    inputs:
      registry: "registry.example.com"
      image_name: "myteam/myapp"
      build_cmd: "bun run build && bun run generate"
```

### Custom Dockerfile (Escape Hatch)

```yaml
include:
  - component: gitlab.com/platform_engineering/platform-components/docker-factory/docker-factory@main
    inputs:
      registry: "registry.example.com"
      image_name: "myteam/myapp"
      generate_dockerfile: false
      dockerfile: "docker/Dockerfile.custom"
```

### With Build Arguments

```yaml
include:
  - component: gitlab.com/platform_engineering/platform-components/docker-factory/docker-factory@main
    inputs:
      registry: "registry.example.com"
      image_name: "myteam/myapp"
      build_args: |
        API_URL=https://api.example.com
        FEATURE_FLAG=enabled
```

## Outputs

The job produces a `build.env` artifact with:

| Variable | Description |
|----------|-------------|
| `IMAGE_BASE` | Full image path without tag |
| `IMAGE_TAG` | Full image path with SHA tag |
| `IMAGE_DIGEST` | Image manifest digest |
| `BUILD_LANGUAGE` | Language used for build |
| `BUILD_RUNTIME_IMAGE` | Runtime base image |
| `BUILD_DHI_ENABLED` | Whether DHI distroless was used |

Use in subsequent jobs:

```yaml
deploy:
  needs: [docker-build]
  script:
    - echo "Deploying $IMAGE_TAG"
    - kubectl set image deployment/myapp app=$IMAGE_TAG
```

## Troubleshooting

### Registry Authentication Failed

```
ERROR: Registry authentication failed
```

- Check `registry_user` and `registry_password` inputs
- Or ensure `CI_REGISTRY_USER` and `CI_REGISTRY_PASSWORD` CI variables are set
- Verify credentials have push permissions

### Entrypoint File Not Found

```
ERROR: 'entrypoint' file does not exist
```

- Check the `entrypoint` input matches your file path
- Default is `src/index.ts` - update if your entry point differs

### Port Must Be Numeric

```
ERROR: 'port' must be numeric
```

- The `port` input must be a number between 1-65535
- Example: `COMPONENT_INPUT_port: "8080"`

### Module Not Found During Build

```
HINT: Missing Node.js/Bun module detected
```

- Ensure all dependencies are in `package.json`
- Verify lock file (`bun.lock` or `package-lock.json`) is committed
- Run `bun install` locally to verify dependencies resolve

### TypeScript File Not Found

```
HINT: TypeScript file not found
```

- Check import paths match actual file locations
- Verify file extensions in imports (`.ts`, `.tsx`)
- Ensure all referenced files are committed to git

### File or Directory Not Found

```
HINT: File or directory not found during build
```

- Check that all paths in your code are correct
- Verify files referenced in `package.json` scripts exist
- Ensure static assets are in the correct location

### Permission Error

```
HINT: Permission error detected
```

- Check file permissions on source files
- Verify git hasn't changed file permissions
- Ensure no files are locked by other processes

### Out of Memory

```
HINT: Out of memory error
```

- Increase runner memory allocation
- Consider splitting large builds
- Check for memory leaks in build scripts

### Base Image Not Accessible

```
HINT: Base image not accessible
```

- Verify the runtime image exists and is accessible
- Check registry credentials if using private images
- Try `verify_base_image: true` to diagnose early

### Syntax Error

```
HINT: Syntax error in code
```

- Run `bun check` or `tsc --noEmit` locally
- Check recent changes for typos
- Verify all imports are valid

### Dockerfile Generation Failed

```
ERROR: Dockerfile generation failed - file not created
ERROR: Generated Dockerfile is suspiciously small
ERROR: Generated Dockerfile has only N stages (expected 5-6)
```

- Check that the build context is correct
- Verify language configuration is valid
- Report a bug if the golden path generator has issues

### BuildKit Builder Failed

```
ERROR: Failed to create or use BuildKit builder
ERROR: BuildKit builder failed to bootstrap
```

- Ensure Docker daemon is running
- Check runner has Docker-in-Docker enabled
- Verify sufficient disk space for BuildKit cache

## Security

- **Distroless Production** - No shell, minimal attack surface
- **Non-root Execution** - Runs as uid:gid 65532:65532
- **dumb-init** - Proper signal handling and zombie reaping (Bun/Node.js)
- **JVM Signal Handling** - Native shutdown hooks (Java)
- **Health Checks** - Native fetch (Bun/Node.js) or wget (Java)
- **OCI Labels** - Standard metadata labels on all images
- **DHI Compliance** - SLSA Level 3, VEX, SBOM metadata labels

## Licence

[MIT Licence](./LICENCE)

