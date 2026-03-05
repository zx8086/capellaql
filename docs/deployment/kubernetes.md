# Kubernetes Deployment

## Basic Deployment

### Deployment Manifest
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: authentication-service
  labels:
    app: authentication-service
    version: v1.0.0
spec:
  replicas: 3
  selector:
    matchLabels:
      app: authentication-service
  template:
    metadata:
      labels:
        app: authentication-service
        version: v1.0.0
    spec:
      containers:
      - name: authentication-service
        image: example/authentication-service:latest
        ports:
        - containerPort: 3000
          name: http
          protocol: TCP
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "3000"
        - name: KONG_MODE
          value: "KONNECT"
        - name: KONG_ADMIN_URL
          valueFrom:
            secretKeyRef:
              name: kong-config
              key: admin-url
        - name: KONG_ADMIN_TOKEN
          valueFrom:
            secretKeyRef:
              name: kong-config
              key: admin-token
        - name: KONG_JWT_AUTHORITY
          valueFrom:
            configMapKeyRef:
              name: auth-config
              key: jwt-authority
        - name: KONG_JWT_AUDIENCE
          valueFrom:
            configMapKeyRef:
              name: auth-config
              key: jwt-audience
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
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
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
  name: authentication-service
  labels:
    app: authentication-service
spec:
  selector:
    app: authentication-service
  ports:
  - name: http
    port: 80
    targetPort: 3000
    protocol: TCP
  type: ClusterIP
```

## Configuration Management

### ConfigMap
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: auth-config
  labels:
    app: authentication-service
data:
  jwt-authority: "https://sts-api.example.com/"
  jwt-audience: "http://api.example.com/"
  jwt-expiration-minutes: "15"
  cors-origin: "https://app.example.com"
  api-title: "Authentication Service API"
  api-version: "1.0.0"
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: telemetry-config
  labels:
    app: authentication-service
data:
  traces-endpoint: "https://otel.example.com/v1/traces"
  metrics-endpoint: "https://otel.example.com/v1/metrics"
  logs-endpoint: "https://otel.example.com/v1/logs"
  service-name: "authentication-service"
  service-version: "1.0.0"
```

### Secret
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: kong-config
  labels:
    app: authentication-service
type: Opaque
data:
  admin-url: aHR0cHM6Ly91cy5hcGkua29uZ2hxLmNvbS92Mi9jb250cm9sLXBsYW5lcy9hYmMxMjM=  # base64 encoded
  admin-token: QmVhcmVyIHNlY3JldDEyMw==  # base64 encoded
---
apiVersion: v1
kind: Secret
metadata:
  name: redis-config
  labels:
    app: authentication-service
type: Opaque
data:
  url: cmVkaXNzOi8vcmVkaXMuZXhhbXBsZS5jb206NjM4MA==  # base64 encoded
  password: c2VjdXJlLXBhc3N3b3JkLTEyMw==  # base64 encoded
```

## High Availability Setup

### Deployment with Redis
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: authentication-service
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  selector:
    matchLabels:
      app: authentication-service
  template:
    metadata:
      labels:
        app: authentication-service
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
                  - authentication-service
              topologyKey: kubernetes.io/hostname
      containers:
      - name: authentication-service
        image: example/authentication-service:latest
        env:
        - name: HIGH_AVAILABILITY
          value: "true"
        - name: REDIS_ENABLED
          value: "true"
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: redis-config
              key: url
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: redis-config
              key: password
        # ... other configuration
```

### Redis Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        ports:
        - containerPort: 6379
        args:
        - redis-server
        - --requirepass
        - $(REDIS_PASSWORD)
        env:
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: redis-config
              key: password
        resources:
          requests:
            cpu: 50m
            memory: 64Mi
          limits:
            cpu: 200m
            memory: 256Mi
        volumeMounts:
        - name: redis-data
          mountPath: /data
      volumes:
      - name: redis-data
        persistentVolumeClaim:
          claimName: redis-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: redis
spec:
  selector:
    app: redis
  ports:
  - port: 6379
    targetPort: 6379
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: redis-pvc
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
```

## Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: authentication-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: authentication-service
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
  name: authentication-service-pdb
  namespace: authentication
spec:
  maxUnavailable: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: authentication-service
```

With 3 replicas, at least 2 pods will always be available during voluntary disruptions (node drains, upgrades).

**Testing PDB:**
```bash
# Check PDB status
kubectl get pdb -n authentication

# View PDB details
kubectl describe pdb authentication-service-pdb -n authentication

# Simulate node drain (test node)
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data
```

## Network Policies

### Ingress Network Policy
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: authentication-service-ingress
spec:
  podSelector:
    matchLabels:
      app: authentication-service
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: kong-system
    - namespaceSelector:
        matchLabels:
          name: monitoring
    ports:
    - protocol: TCP
      port: 3000
```

### Egress Network Policy
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: authentication-service-egress
spec:
  podSelector:
    matchLabels:
      app: authentication-service
  policyTypes:
  - Egress
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: kong-system
    ports:
    - protocol: TCP
      port: 8001  # Kong Admin API
  - to:
    - podSelector:
        matchLabels:
          app: redis
    ports:
    - protocol: TCP
      port: 6379
  - to: []  # Allow all for OTLP endpoints (external)
    ports:
    - protocol: TCP
      port: 443
```

## Ingress Configuration

### Kong Ingress
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: authentication-service-ingress
  annotations:
    kubernetes.io/ingress.class: kong
    konghq.com/plugins: key-auth,rate-limiting
    konghq.com/protocols: https
    konghq.com/https-redirect-status-code: "301"
spec:
  tls:
  - hosts:
    - auth-api.example.com
    secretName: auth-api-tls
  rules:
  - host: auth-api.example.com
    http:
      paths:
      - path: /tokens
        pathType: Exact
        backend:
          service:
            name: authentication-service
            port:
              number: 80
      - path: /health
        pathType: Exact
        backend:
          service:
            name: authentication-service
            port:
              number: 80
```

### Kong Plugins
```yaml
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: auth-key-auth
plugin: key-auth
config:
  key_names:
  - apikey
  hide_credentials: true
---
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: auth-rate-limiting
plugin: rate-limiting
config:
  minute: 1000
  hour: 10000
  policy: redis
  redis_host: redis.kong-system.svc.cluster.local
  redis_port: 6379
```

## Monitoring and Observability

### ServiceMonitor (Prometheus)
```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: authentication-service
  labels:
    app: authentication-service
spec:
  selector:
    matchLabels:
      app: authentication-service
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
  name: authentication-service-detailed
spec:
  selector:
    matchLabels:
      app: authentication-service
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
  name: authentication-service-psp
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
  name: authentication-service
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: authentication-service
rules:
- apiGroups: [""]
  resources: ["configmaps", "secrets"]
  verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: authentication-service
subjects:
- kind: ServiceAccount
  name: authentication-service
roleRef:
  kind: Role
  name: authentication-service
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
- **Readiness Probe**: `/health/ready` - Control traffic routing (checks Kong connectivity)
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
| `auth-service-resources` | Memory usage >70%/80% of limit |
| `auth-service-event-loop` | Event loop delay >50ms/100ms |
| `auth-service-http-errors` | HTTP 5xx rate >2%/5% |
| `auth-service-kong-latency` | P95 latency >200ms/500ms |
| `auth-service-circuit-breaker` | Circuit breaker opens >1/3 per hour |
| `auth-service-token-errors` | Token error rate >1%/5% |
| `auth-service-response-time` | Endpoint SLA violations |
| `auth-service-availability` | Service down, pods not ready |
| `auth-service-cache` | Cache hit rate, Redis status |

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
kubectl get pods -l app=authentication-service

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
kubectl get configmap auth-config -o yaml

# Check Secrets
kubectl get secret kong-config -o yaml

# Test environment variables
kubectl exec <pod-name> -- env | grep KONG
```

#### Network Connectivity
```bash
# Test service connectivity
kubectl exec <pod-name> -- curl http://authentication-service/health

# Check Kong connectivity
kubectl exec <pod-name> -- curl -v $KONG_ADMIN_URL/status

# Verify DNS resolution
kubectl exec <pod-name> -- nslookup authentication-service
```

#### Performance Issues
```bash
# Check resource usage
kubectl top pod -l app=authentication-service

# View HPA status
kubectl get hpa authentication-service-hpa

# Monitor metrics
kubectl exec <pod-name> -- curl http://localhost:3000/metrics
```