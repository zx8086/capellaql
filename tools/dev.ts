#!/usr/bin/env bun

import { spawn } from "bun";
import { sleep } from "$utils/bunUtils";

console.log("🚀 Starting CapellaQL Development Environment...\n");

// Environment validation
const requiredEnvVars = [
  "COUCHBASE_URL",
  "COUCHBASE_USERNAME",
  "COUCHBASE_PASSWORD",
  "COUCHBASE_BUCKET",
  "SERVICE_NAME",
  "SERVICE_VERSION",
];

const missingVars = requiredEnvVars.filter((envVar) => !Bun.env[envVar]);

if (missingVars.length > 0) {
  console.error("❌ Missing required environment variables:");
  for (const envVar of missingVars) {
    console.error(`   • ${envVar}`);
  }
  console.log("\n💡 Copy .env.example to .env and configure your settings");
  console.log("🔗 Check CLAUDE.md for configuration details\n");
  process.exit(1);
}

console.log("✅ Environment variables validated");
console.log(`🌍 Environment: ${Bun.env.NODE_ENV || "development"}`);
console.log(`🔗 Couchbase: ${Bun.env.COUCHBASE_URL}`);
console.log(`📊 Telemetry: ${Bun.env.ENABLE_OPENTELEMETRY === "true" ? "Enabled" : "Disabled"}\n`);

// Start main server with hot reload
console.log("🔄 Starting server with hot reload...");
const server = spawn(["bun", "run", "--hot", "--watch", "src/index.ts"], {
  stdio: ["inherit", "inherit", "inherit"],
  env: {
    ...Bun.env,
    FORCE_COLOR: "1",
    BUN_CONFIG_VERBOSE_FETCH: "true",
    NODE_ENV: "development",
  },
});

// Start test watcher
console.log("🧪 Starting test watcher...");
const testWatcher = spawn(["bun", "test", "--watch"], {
  stdio: ["inherit", "inherit", "inherit"],
  env: { ...Bun.env, FORCE_COLOR: "1" },
});

// Health check monitoring
let healthCheckInterval: Timer;
let serverReady = false;

async function checkHealth() {
  try {
    const response = await fetch("http://localhost:4000/health");
    if (response.ok) {
      if (!serverReady) {
        console.log("\n✅ Server is ready and healthy!");
        displayDashboard();
        serverReady = true;
      }
      return true;
    } else {
      console.warn(`⚠️ Health check failed: ${response.status}`);
      return false;
    }
  } catch (_error) {
    if (serverReady) {
      console.log("⏳ Server restarting...");
      serverReady = false;
    }
    return false;
  }
}

function displayDashboard() {
  console.log(`
┌─────────────────────────────────────────────────────────────┐
│               📡 CapellaQL Development Dashboard             │
├─────────────────────────────────────────────────────────────┤
│ 🌐 GraphQL Playground:  http://localhost:4000/graphql      │
│ 💚 Health Check:        http://localhost:4000/health       │
│ 📊 Telemetry Health:    http://localhost:4000/health/tel.. │
│ 🧪 Tests:              Running in watch mode               │
│ 🔄 Hot Reload:         Enabled                             │
├─────────────────────────────────────────────────────────────┤
│ Commands:                                                   │
│ • Ctrl+C           → Stop development environment          │
│ • bun run quality  → Run typecheck + lint                  │
│ • bun run format   → Format code with Biome                │
└─────────────────────────────────────────────────────────────┘
`);
}

// Start health monitoring after server startup delay
setTimeout(async () => {
  console.log("⏳ Waiting for server to start...");

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
  console.log("\n🛑 Shutting down development environment...");
  console.log("   • Stopping server...");
  console.log("   • Stopping test watcher...");
  console.log("   • Cleaning up resources...");

  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  server.kill();
  testWatcher.kill();

  console.log("✅ Development environment stopped cleanly");
  process.exit(0);
}

// Handle shutdown signals
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

// Handle process exits
server.exited.then((code) => {
  console.error(`⚠️ Server process exited with code ${code}`);
  if (code !== 0) {
    console.error("🔴 Server crashed! Check the error output above.");
  }
  cleanup();
});

testWatcher.exited.then((code) => {
  console.log(`📝 Test watcher exited with code ${code}`);
  if (code !== 0) {
    console.warn("⚠️ Test watcher stopped unexpectedly");
  }
});

// Keep process alive
console.log("🎯 Development environment is starting...");
console.log("   Use Ctrl+C to stop when ready\n");
