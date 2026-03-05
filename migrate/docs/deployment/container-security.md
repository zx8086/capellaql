# Container Security

This document consolidates DHI (Docker Hardened Images) migration, container hardening, and security validation for the authentication service.

## Overview

The authentication service uses **Docker Hardened Images (DHI)** as the base image, providing:

| Feature | Value |
|---------|-------|
| Base Image | `dhi.io/static:20230311` |
| CVE Count | **0** (down from 3) |
| Security Score | **12/12** |
| SLSA Level | **3** (supply chain security) |
| CVE Remediation SLA | **7 days** (HIGH/CRITICAL) |

---

## Security Features

### Container Hardening

| Feature | Configuration |
|---------|---------------|
| User | Nonroot (65532:65532) |
| Filesystem | Read-only |
| Capabilities | All dropped |
| Privileges | no-new-privileges |
| Base | Distroless (no shell, no package manager) |
| PID 1 | dumb-init signal handling |

### Supply Chain Security

| Feature | Description |
|---------|-------------|
| SLSA Level 3 | Verifiable build process |
| SBOM | Software Bill of Materials (syft-json) |
| VEX | Vulnerability exploitability analysis |
| Provenance | Build attestation |

### Automated Monitoring

- **CVE Scans**: Every 6 hours
- **SARIF Reports**: GitHub Security tab integration
- **Issue Creation**: Automatic for HIGH/CRITICAL CVEs
- **Artifact Retention**: 90 days for compliance

### CI/CD Attestation Verification

The build workflow includes explicit DHI attestation verification before every build:

| Step | Purpose |
|------|---------|
| Pull DHI base image | Downloads `dhi.io/static:20230311` |
| Verify SBOM + Provenance | Docker Scout attestation check |
| Zero CVE verification | Pre-build CVE scan (HIGH/CRITICAL) |
| GitHub Step Summary | Verification report in workflow |

```yaml
# From build-and-deploy.yml
- name: Verify DHI base image attestations (SBOM + Provenance)
  uses: docker/scout-action@v1.15.1
  with:
    command: attestation
    image: dhi.io/static:20230311
    organization: zx8086

- name: Verify DHI base image has zero CVEs
  uses: docker/scout-action@v1.15.1
  with:
    command: cves
    image: dhi.io/static:20230311
    only-severities: critical,high
    exit-code: true
```

---

## Container Deployment

### Docker Deployment

```bash
docker run -d \
  --name auth-service \
  --env-file .env \
  -p 3000:3000 \
  --user 65532:65532 \
  --read-only \
  --tmpfs /tmp:noexec,nosuid,size=100m \
  --tmpfs /app/profiles:noexec,nosuid,size=50m \
  --cap-drop=ALL \
  --security-opt=no-new-privileges:true \
  authentication-service:latest
```

**Required Tmpfs Mounts**:
- `/tmp` - Temporary files (100MB)
- `/app/profiles` - Profiling feature (50MB) - Required for read-only containers

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: authentication-service
spec:
  template:
    spec:
      securityContext:
        runAsUser: 65532
        runAsGroup: 65532
        fsGroup: 65532
        runAsNonRoot: true
        seccompProfile:
          type: RuntimeDefault
      containers:
      - name: authentication-service
        image: authentication-service:latest
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          capabilities:
            drop:
            - ALL
        volumeMounts:
        - name: tmp
          mountPath: /tmp
        - name: profiles
          mountPath: /app/profiles
      volumes:
      - name: tmp
        emptyDir:
          sizeLimit: 100Mi
      - name: profiles
        emptyDir:
          sizeLimit: 50Mi
```

### AWS Fargate/ECS Deployment

```json
{
  "family": "authentication-service",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "ephemeralStorage": {
    "sizeInGiB": 21
  },
  "containerDefinitions": [{
    "name": "authentication-service",
    "image": "authentication-service:latest",
    "portMappings": [{
      "containerPort": 3000,
      "protocol": "tcp"
    }],
    "user": "65532:65532",
    "readonlyRootFilesystem": true,
    "linuxParameters": {
      "initProcessEnabled": true,
      "capabilities": {
        "drop": ["ALL"]
      }
    },
    "mountPoints": [{
      "sourceVolume": "tmp-storage",
      "containerPath": "/tmp",
      "readOnly": false
    }, {
      "sourceVolume": "profiles-storage",
      "containerPath": "/app/profiles",
      "readOnly": false
    }],
    "healthCheck": {
      "command": ["CMD-SHELL", "wget -q --spider http://localhost:3000/health || exit 1"],
      "interval": 30,
      "timeout": 5,
      "retries": 3,
      "startPeriod": 60
    },
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/authentication-service",
        "awslogs-region": "eu-west-1",
        "awslogs-stream-prefix": "ecs"
      }
    }
  }],
  "volumes": [{
    "name": "tmp-storage"
  }, {
    "name": "profiles-storage"
  }]
}
```

**Fargate Resource Limits**:

| Resource | Value | Notes |
|----------|-------|-------|
| CPU | 256 (.25 vCPU) | Minimum for Fargate, scale to 512/1024 for production |
| Memory | 512 MB | Matches K8s request, scale to 1024 for production |
| Ephemeral Storage | 21 GB | Default 20GB + 1GB for profiles |

**Security Context (Matching Kubernetes)**:

| Setting | Value | Purpose |
|---------|-------|---------|
| `user` | `65532:65532` | Distroless nonroot user |
| `readonlyRootFilesystem` | `true` | Immutable container |
| `capabilities.drop` | `["ALL"]` | Minimal privileges |
| `initProcessEnabled` | `true` | PID 1 signal handling (dumb-init equivalent) |

**Health Check Configuration**:

| Parameter | Value | Description |
|-----------|-------|-------------|
| `interval` | 30s | Time between health checks |
| `timeout` | 5s | Health check timeout |
| `retries` | 3 | Unhealthy threshold |
| `startPeriod` | 60s | Grace period for startup |

**Required IAM Permissions** (Task Execution Role):
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ],
    "Resource": "arn:aws:logs:*:*:log-group:/ecs/authentication-service:*"
  }]
}
```

---

## Security Commands

### DHI Security Validation

```bash
# Verify SLSA Level 3 provenance
bun run docker:dhi:verify-provenance

# Extract SBOM (Software Bill of Materials)
bun run docker:dhi:extract-sbom

# Check VEX attestations
bun run docker:dhi:check-vex

# Scan for CVEs
bun run docker:dhi:cve-scan

# Full security validation (all above)
bun run docker:dhi:security-full
```

### Security Score Validation

```bash
# Validate Dockerfile security (12/12)
./scripts/validate-dockerfile-security.sh Dockerfile

# Docker Scout health score for built images
docker scout quickview authentication-service:latest --org <YOUR_ORG>
```

### DHI Base Image Verification

For DHI base images (like `dhi.io/static:20230311`), use `sbom` instead of `quickview`:

```bash
# Verify DHI base image SBOM attestation
# Note: 'quickview' fails on base images with "image has no base image" error
# because DHI images ARE base images - use 'sbom' to verify attestation
docker scout sbom dhi.io/static:20230311 --org <YOUR_ORG> --output dhi-base-sbom.json

# Verify DHI base image has zero HIGH/CRITICAL CVEs
docker scout cves dhi.io/static:20230311 --org <YOUR_ORG> --only-severity critical,high
```

The CI/CD workflow performs these checks automatically before every build.

---

## Security Policies (Docker Scout)

The image meets all 7 Docker Scout policies:

1. **No critical vulnerabilities**
2. **No high vulnerabilities**
3. **No fixable vulnerabilities**
4. **SBOM attestation present**
5. **Provenance attestation present**
6. **Up-to-date base image**
7. **Approved base image**

### Scout Configuration

Docker Scout requires organization configuration:

```bash
# Set organization
docker scout config organization <YOUR_ORG>

# Verify policies
docker scout quickview <IMAGE>:latest --org <YOUR_ORG>
# Expected: Policy status SUCCESS (7/7 policies met)
```

---

## CVE Remediation

### SLA Targets

| Severity | Remediation Time |
|----------|------------------|
| CRITICAL | 7 days |
| HIGH | 7 days |
| MEDIUM | 30 days |
| LOW | 90 days |

### Monitoring Workflow

The `dhi-cve-monitor.yml` workflow runs every 6 hours:

1. Scans DHI base image for CVEs
2. Uploads SARIF to GitHub Security tab
3. Creates GitHub issues for HIGH/CRITICAL CVEs
4. Validates VEX attestations

---

## Rollback Procedures

### Docker Rollback (< 30 seconds)

```bash
# Stop current container
docker stop auth-service
docker rm auth-service

# Restore baseline
docker run -d \
  --name auth-service \
  --env-file .env \
  -p 3000:3000 \
  --user 65532:65532 \
  --read-only \
  --tmpfs /tmp:noexec,nosuid,size=100m \
  --tmpfs /app/profiles:noexec,nosuid,size=50m \
  --cap-drop=ALL \
  --security-opt=no-new-privileges:true \
  authentication-service:baseline

# Verify health
curl -s http://localhost:3000/health | jq '.status'
```

### Kubernetes Rollback (< 60 seconds)

```bash
# Rollback to previous deployment
kubectl rollout undo deployment/authentication-service -n production

# Monitor rollback
kubectl rollout status deployment/authentication-service -n production
```

### Rollback Triggers

Execute immediate rollback if ANY occur:
1. Health check failure rate > 10% for 5 minutes
2. Error rate > 2% for 5 minutes
3. P99 latency > 500ms for 5 minutes
4. Memory usage > 150MB
5. Container crashes (> 3 restarts in 10 minutes)
6. CRITICAL CVE discovered in DHI base image

---

## Troubleshooting

### Docker Scout Health Score Shows 0/7

**Cause**: Missing organization configuration

**Solution**:
```bash
docker scout config organization <YOUR_ORG>
```

### "image has no base image" Error

**Cause**: DHI base images aren't in Scout's public database

**Solution**: Remove `recommendations` from Scout commands - only use `cves` and `sbom`

### Read-Only Filesystem Errors

**Symptom**: `EROFS: read-only file system, mkdir 'profiles'`

**Solution**: Add tmpfs mount for profiles directory:
```bash
--tmpfs /app/profiles:noexec,nosuid,size=50m
```

---

## Compliance Artifacts

### Available Artifacts

| Artifact | Format | Location | Retention |
|----------|--------|----------|-----------|
| SBOM | syft-json | CI/CD artifacts | 90 days |
| VEX | SARIF | GitHub Security tab | 90 days |
| Provenance | SLSA | Container registry | Permanent |
| CVE Scans | SARIF | GitHub Security tab | 90 days |

### Audit Commands

```bash
# Generate SBOM
docker sbom authentication-service:latest --output sbom.json

# Verify provenance
docker scout attestation authentication-service:latest

# Export VEX
docker scout cves authentication-service:latest --format sarif > cves.sarif
```

---

## Performance Validation

### DHI Production Image Results

| Metric | Value | SLA Target | Status |
|--------|-------|------------|--------|
| P95 Latency | 71.8ms | <100ms | PASS (28% better) |
| P99 Latency | <200ms | <200ms | PASS |
| Memory | 92MB | 50-150MB | PASS |
| HTTP Failures | 0% | <1% | PASS |

### Resource Usage

| Resource | Value |
|----------|-------|
| CPU (idle) | 2.29% |
| Memory | 92MB |
| Image Size | 330MB |

---

## Migration History

**Completed**: 2026-02-11 (SIO-304)

### Before (Distroless)
- Base: `gcr.io/distroless/base:nonroot`
- CVEs: 3 (HIGH)
- Security Score: 10/12

### After (DHI)
- Base: `dhi.io/static:20230311`
- CVEs: 0
- Security Score: 12/12

**Improvements**:
- 100% CVE reduction
- SLSA Level 3 provenance
- VEX attestations
- 7-day CVE remediation SLA
- Automated 6-hour CVE monitoring
