#!/usr/bin/env bun

import { spawn } from "bun";
import { sleep } from "$utils/bunUtils";

// Get service name from env (same source as config)
const SERVICE_NAME = Bun.env.OTEL_SERVICE_NAME || "capellaql-service";
const SERVICE_VERSION = Bun.env.OTEL_SERVICE_VERSION || "2.0";
const ENVIRONMENT = Bun.env.DEPLOYMENT_ENVIRONMENT || Bun.env.NODE_ENV || "development";

// JSON ECS logger for dev tool - uses same service identity as main app
function logDev(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const logRecord: Record<string, unknown> = {
    "@timestamp": timestamp,
    "log.level": level,
    "ecs.version": "8.10.0",
    "service.name": SERVICE_NAME,
    "service.version": SERVICE_VERSION,
    "service.environment": ENVIRONMENT,
    "event.dataset": SERVICE_NAME,
    message,
    timestamp,
    component: "dev-runner",
  };

  if (meta) {
    for (const [key, value] of Object.entries(meta)) {
      logRecord[key] = value;
    }
  }

  const output = JSON.stringify(logRecord);
  if (level === "error") {
    console.error(output);
  } else if (level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

logDev("info", "Development environment starting");

// Environment validation
const requiredEnvVars = [
  "COUCHBASE_URL",
  "COUCHBASE_USERNAME",
  "COUCHBASE_PASSWORD",
  "COUCHBASE_BUCKET",
  "OTEL_SERVICE_NAME",
  "OTEL_SERVICE_VERSION",
];

const missingVars = requiredEnvVars.filter((envVar) => !Bun.env[envVar]);

if (missingVars.length > 0) {
  logDev("error", "Missing required environment variables", {
    missingVars,
    hint: "Copy .env.example to .env and configure",
  });
  process.exit(1);
}

logDev("info", "Environment validated", {
  environment: ENVIRONMENT,
  couchbaseUrl: Bun.env.COUCHBASE_URL,
  telemetryEnabled: Bun.env.ENABLE_OPENTELEMETRY === "true",
});

// Start main server with hot reload
logDev("info", "Starting server with hot reload");
const server = spawn(["bun", "run", "--hot", "--watch", "src/index.ts"], {
  stdio: ["inherit", "inherit", "inherit"],
  env: {
    ...Bun.env,
    FORCE_COLOR: "1",
    BUN_CONFIG_VERBOSE_FETCH: Bun.env.VERBOSE_HTTP || "false",
    NODE_ENV: "development",
  },
});

// Health check monitoring
let healthCheckInterval: Timer;
let serverReady = false;

async function checkHealth() {
  try {
    const response = await fetch("http://localhost:4000/health");
    if (response.ok) {
      if (!serverReady) {
        logDev("info", "Server ready and healthy", {
          endpoints: {
            graphql: "http://localhost:4000/graphql",
            health: "http://localhost:4000/health",
            telemetry: "http://localhost:4000/health/telemetry",
          },
        });
        serverReady = true;
      }
      return true;
    } else {
      logDev("warn", "Health check failed", { status: response.status });
      return false;
    }
  } catch (_error) {
    if (serverReady) {
      logDev("info", "Server restarting");
      serverReady = false;
    }
    return false;
  }
}

// Start health monitoring after server startup delay
setTimeout(async () => {
  logDev("info", "Waiting for server startup");

  // Wait up to 30 seconds for server to be ready
  for (let i = 0; i < 30; i++) {
    if (await checkHealth()) {
      break;
    }
    await sleep(1000);
  }

  // Set up periodic health checks every 30 seconds
  healthCheckInterval = setInterval(checkHealth, 30000);
}, 2000);

// Graceful shutdown handling
function cleanup() {
  logDev("info", "Shutting down development environment");

  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  server.kill();
  logDev("info", "Development environment stopped");
  process.exit(0);
}

// Handle shutdown signals
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

// Handle process exits
server.exited.then((code) => {
  if (code !== 0) {
    logDev("error", "Server crashed", { exitCode: code });
  }
  cleanup();
});
