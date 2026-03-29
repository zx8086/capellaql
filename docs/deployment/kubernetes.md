# Kubernetes Deployment

## Basic Deployment

### Deployment Manifest
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: capellaql
  labels:
    app: capellaql
    version: v1.0.0
spec:
  replicas: 3
  selector:
    matchLabels:
      app: capellaql
  template:
    metadata:
      labels:
        app: capellaql
        version: v1.0.0
    spec:
      containers:
      - name: capellaql
        image: zx8086/capellaql:latest
        ports:
        - containerPort: 4000
          name: http
          protocol: TCP
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "4000"
        - name: COUCHBASE_URL
          valueFrom:
            secretKeyRef:
              name: couchbase-config
              key: url
        - name: COUCHBASE_USERNAME
          valueFrom:
            secretKeyRef:
              name: couchbase-config
              key: username
        - name: COUCHBASE_PASSWORD
          valueFrom:
            secretKeyRef:
              name: couchbase-config
              key: password
        - name: COUCHBASE_BUCKET
          valueFrom:
            configMapKeyRef:
              name: capellaql-config
              key: bucket
        - name: TELEMETRY_MODE
          value: "otlp"
        - name: OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
          valueFrom:
            configMapKeyRef:
              name: telemetry-config
              key: traces-endpoint
        resources:
          requests:
            cpu: 50m
            memory: 64Mi
          limits:
            cpu: 500m
            memory: 256Mi
        livenessProbe:
          httpGet:
            path: /health
            port: 4000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health
            port: 4000
          initialDelaySeconds: 5
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        securityContext:
          runAsNonRoot: true
          runAsUser: 65532
          runAsGroup: 65532
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          capabilities:
            drop:
            - ALL
        volumeMounts:
        - name: tmp
          mountPath: /tmp
      volumes:
      - name: tmp
        emptyDir: {}
      securityContext:
        fsGroup: 65532
```

### Service Manifest
```yaml
apiVersion: v1
kind: Service
metadata:
  name: capellaql
  labels:
    app: capellaql
spec:
  selector:
    app: capellaql
  ports:
  - name: http
    port: 80
    targetPort: 4000
    protocol: TCP
  type: ClusterIP
```

## Configuration Management

### ConfigMap
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: capellaql-config
  labels:
    app: capellaql
data:
  bucket: "default"
  cors-origin: "https://app.example.com"
  api-title: "CapellaQL GraphQL API"
  api-version: "1.0.0"
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: telemetry-config
  labels:
    app: capellaql
data:
  traces-endpoint: "https://otel.example.com/v1/traces"
  metrics-endpoint: "https://otel.example.com/v1/metrics"
  logs-endpoint: "https://otel.example.com/v1/logs"
  service-name: "capellaql"
  service-version: "1.0.0"
```

### Secret
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: couchbase-config
  labels:
    app: capellaql
type: Opaque
data:
  url: Y291Y2hiYXNlczovL2NiLmV4YW1wbGUuY29t  # base64 encoded
  username: YWRtaW4=  # base64 encoded
  password: c2VjdXJlLXBhc3N3b3JkLTEyMw==  # base64 encoded
```

## High Availability Setup

### HA Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: capellaql
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  selector:
    matchLabels:
      app: capellaql
  template:
    metadata:
      labels:
        app: capellaql
    spec:
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                - key: app
                  operator: In
                  values:
                  - capellaql
              topologyKey: kubernetes.io/hostname
      containers:
      - name: capellaql
        image: zx8086/capellaql:latest
        env:
        - name: HIGH_AVAILABILITY
          value: "true"
        # ... other configuration (Couchbase, telemetry, etc.)
```

## Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: capellaql-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: capellaql
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
```

## Pod Disruption Budget

Ensures service availability during Kubernetes node maintenance, upgrades, and voluntary disruptions.

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: capellaql-pdb
  namespace: capellaql
spec:
  maxUnavailable: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: capellaql
```

With 3 replicas, at least 2 pods will always be available during voluntary disruptions (node drains, upgrades).

**Testing PDB:**
```bash
# Check PDB status
kubectl get pdb -n capellaql

# View PDB details
kubectl describe pdb capellaql-pdb -n capellaql

# Simulate node drain (test node)
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data
```

## Network Policies

### Ingress Network Policy
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: capellaql-ingress
spec:
  podSelector:
    matchLabels:
      app: capellaql
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    - namespaceSelector:
        matchLabels:
          name: monitoring
    ports:
    - protocol: TCP
      port: 4000
```

### Egress Network Policy
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: capellaql-egress
spec:
  podSelector:
    matchLabels:
      app: capellaql
  policyTypes:
  - Egress
  egress:
  - to: []  # Allow Couchbase Capella and OTLP endpoints (external)
    ports:
    - protocol: TCP
      port: 443
    - protocol: TCP
      port: 11210  # Couchbase SDK
    - protocol: TCP
      port: 11207  # Couchbase SDK (TLS)
```

## Ingress Configuration

### Standard Kubernetes Ingress
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: capellaql-ingress
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - graphql-api.example.com
    secretName: graphql-api-tls
  rules:
  - host: graphql-api.example.com
    http:
      paths:
      - path: /graphql
        pathType: Exact
        backend:
          service:
            name: capellaql
            port:
              number: 80
      - path: /health
        pathType: Prefix
        backend:
          service:
            name: capellaql
            port:
              number: 80
```

## Monitoring and Observability

### ServiceMonitor (Prometheus)
```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: capellaql
  labels:
    app: capellaql
spec:
  selector:
    matchLabels:
      app: capellaql
  endpoints:
  - port: http
    path: /metrics
    interval: 30s
    scrapeTimeout: 10s
```

### PodMonitor (Detailed Metrics)
```yaml
apiVersion: monitoring.coreos.com/v1
kind: PodMonitor
metadata:
  name: capellaql-detailed
spec:
  selector:
    matchLabels:
      app: capellaql
  podMetricsEndpoints:
  - port: http
    path: /metrics
    interval: 15s
    params:
      view: ["infrastructure"]
```

## Secret Management Options

The service supports multiple secret management approaches. Choose based on your compliance requirements.

### Option 1: Kubernetes Secrets (Default)

Use native Kubernetes secrets for simple deployments with good RBAC:

```bash
kubectl apply -f k8s/secret.yaml
```

**Recommended when:**
- Simple deployment with limited secret scope
- etcd encryption at rest is enabled
- Strong RBAC policies in place

### Option 2: External Secrets Operator

Use `external-secret.yaml` for centralized secret management with AWS Secrets Manager or HashiCorp Vault:

```bash
# Install External Secrets Operator
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  -n external-secrets --create-namespace

# Apply ExternalSecret (AWS or Vault variant)
kubectl apply -f k8s/external-secret.yaml
```

**Recommended when:**
- SOC2/PCI compliance required
- Automatic secret rotation needed
- Multi-team secret access
- Centralized audit logging required

### Option 3: Sealed Secrets

Use `sealed-secret.yaml` for GitOps-compatible encrypted secrets:

```bash
# Install Sealed Secrets
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
helm install sealed-secrets sealed-secrets/sealed-secrets -n kube-system

# Seal your secrets
kubeseal --format yaml < k8s/secret.yaml > k8s/sealed-secret-generated.yaml

# Apply sealed secret
kubectl apply -f k8s/sealed-secret-generated.yaml
```

**Recommended when:**
- GitOps workflow required
- Simpler than ESO but more secure than plain secrets
- No external secret store available

### Decision Matrix

| Requirement | K8s Secrets | Sealed Secrets | External Secrets |
|-------------|-------------|----------------|------------------|
| Simple setup | Yes | Medium | Complex |
| GitOps compatible | No | Yes | Yes |
| Secret rotation | Manual | Manual | Automatic |
| Audit logging | K8s audit | K8s audit | Backend audit |
| SOC2/PCI | Maybe | Maybe | Yes |
| Multi-cluster | Manual sync | Per-cluster | Centralized |

See `k8s/README.md` for complete implementation details and manifests.

## Security

### Pod Security Policy
```yaml
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: capellaql-psp
spec:
  privileged: false
  allowPrivilegeEscalation: false
  requiredDropCapabilities:
  - ALL
  volumes:
  - 'configMap'
  - 'emptyDir'
  - 'projected'
  - 'secret'
  - 'downwardAPI'
  - 'persistentVolumeClaim'
  runAsUser:
    rule: 'MustRunAsNonRoot'
  runAsGroup:
    rule: 'MustRunAs'
    ranges:
    - min: 1001
      max: 1001
  seLinux:
    rule: 'RunAsAny'
  fsGroup:
    rule: 'MustRunAs'
    ranges:
    - min: 1001
      max: 1001
```

### RBAC
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: capellaql
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: capellaql
rules:
- apiGroups: [""]
  resources: ["configmaps", "secrets"]
  verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: capellaql
subjects:
- kind: ServiceAccount
  name: capellaql
roleRef:
  kind: Role
  name: capellaql
  apiGroup: rbac.authorization.k8s.io
```

## Deployment Best Practices

### Resource Management
- **CPU Requests**: 100m (guaranteed baseline)
- **CPU Limits**: 1.0 (burst capacity)
- **Memory Requests**: 512Mi (baseline usage)
- **Memory Limits**: 1Gi (production capacity)

### Health Checks
- **Liveness Probe**: `/health` - Detect crashed containers
- **Readiness Probe**: `/health/ready` - Control traffic routing (checks Couchbase connectivity)
- **Startup Probe**: Handle slow startup scenarios

### Security Hardening
- **Non-root user**: UID/GID 65532 (distroless nonroot)
- **Read-only filesystem**: Security enhancement
- **Dropped capabilities**: Minimal privileges
- **Network policies**: Restrict traffic flow
- **Distroless base image**: No shell, no package manager

### High Availability
- **Pod anti-affinity**: Spread across nodes
- **Rolling updates**: Zero-downtime deployments
- **HPA scaling**: Handle traffic spikes
- **Circuit breakers**: Resilience patterns
- **Pod Disruption Budget**: Minimum 2 pods during maintenance

## Prometheus AlertManager Rules

The project includes 22 AlertManager rules based on SLA thresholds (see `k8s/prometheus-rules.yaml`):

| Alert Group | Description |
|-------------|-------------|
| `capellaql-resources` | Memory usage >70%/80% of limit |
| `capellaql-event-loop` | Event loop delay >50ms/100ms |
| `capellaql-http-errors` | HTTP 5xx rate >2%/5% |
| `capellaql-couchbase-latency` | P95 latency >200ms/500ms |
| `capellaql-circuit-breaker` | Circuit breaker opens >1/3 per hour |
| `capellaql-graphql-errors` | GraphQL error rate >1%/5% |
| `capellaql-response-time` | Endpoint SLA violations |
| `capellaql-availability` | Service down, pods not ready |
| `capellaql-cache` | Cache hit rate |

**Prerequisites:** Requires kube-prometheus-stack:
```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install kube-prometheus prometheus-community/kube-prometheus-stack -n monitoring
```

## Troubleshooting

### Common Issues

#### Pod Startup Issues
```bash
# Check pod status
kubectl get pods -l app=capellaql

# View pod events
kubectl describe pod <pod-name>

# Check logs
kubectl logs <pod-name> -f

# Debug container
kubectl exec -it <pod-name> -- sh
```

#### Configuration Issues
```bash
# Verify ConfigMaps
kubectl get configmap capellaql-config -o yaml

# Check Secrets
kubectl get secret couchbase-config -o yaml

# Test environment variables
kubectl exec <pod-name> -- env | grep COUCHBASE
```

#### Network Connectivity
```bash
# Test service connectivity
kubectl exec <pod-name> -- curl http://capellaql-service/health

# Check Couchbase connectivity
kubectl exec <pod-name> -- curl http://capellaql-service/health/comprehensive | jq '.checks.database'

# Verify DNS resolution
kubectl exec <pod-name> -- nslookup capellaql-service
```

#### Performance Issues
```bash
# Check resource usage
kubectl top pod -l app=capellaql

# View HPA status
kubectl get hpa capellaql-hpa

# Monitor metrics
kubectl exec <pod-name> -- curl http://localhost:4000/health/performance
```