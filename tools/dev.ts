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
console.log(`📊 Telemetry: ${Bun.env.ENABLE_OPENTELEMETRY === "true" ? "Enabled" : "Disabled"}`);
console.log(`🔍 Health Monitoring: System, Performance & Correlation Analysis`);
console.log(`⏱️  Timeout Configuration: Production-ready SDK timeouts active\n`);

// Start main server with hot reload
console.log("🔄 Starting server with hot reload...");
const server = spawn(["bun", "run", "--hot", "--watch", "src/index.ts"], {
  stdio: ["inherit", "inherit", "inherit"],
  env: {
    ...Bun.env,
    FORCE_COLOR: "1",
    BUN_CONFIG_VERBOSE_FETCH: Bun.env.VERBOSE_HTTP || "false", // Set to "true" for HTTP debugging
    NODE_ENV: "development",
  },
});

// Tests run on demand only - not automatically in dev mode
// Use: bun run test:watch for test watching
console.log("🧪 Tests available on demand:");

// Health check monitoring
let healthCheckInterval: Timer;
let serverReady = false;

async function checkHealth() {
  try {
    const response = await fetch("http://localhost:4000/health");
    if (response.ok) {
      if (!serverReady) {
        console.log("\n✅ Server is ready and healthy!");
        console.log("🎯 All monitoring endpoints active: Health, Performance & Telemetry");

        // Quick verification that new endpoints are working
        try {
          const systemHealthResponse = await fetch("http://localhost:4000/health/system");
          const performanceResponse = await fetch("http://localhost:4000/health/performance");

          if (systemHealthResponse.ok && performanceResponse.ok) {
            console.log("🔍 Enhanced monitoring: System Health & Performance Analytics ready");
          } else {
            console.log("⚠️ Some enhanced monitoring endpoints may not be ready yet");
          }
        } catch (_monitoringError) {
          console.log("ℹ️ Enhanced monitoring endpoints initializing...");
        }

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
┌───────────────────────────────────────────────────────────────────────────────┐
│                       📡 CapellaQL Development Dashboard                       │
├───────────────────────────────────────────────────────────────────────────────┤
│ 🌐 GraphQL Playground:  http://localhost:4000/graphql                        │
│ 🖥️  Development UI:     http://localhost:4000/dashboard                       │
│ 💚 Health Check:        http://localhost:4000/health                         │
│ 📊 Telemetry Health:    http://localhost:4000/health/telemetry               │
│ 🔍 System Health:       http://localhost:4000/health/system                  │
│ 📈 Health Summary:      http://localhost:4000/health/summary                 │
│ ⚡ Performance:         http://localhost:4000/health/performance              │
│ 📊 Perf History:        http://localhost:4000/health/performance/history     │
│ 🧪 Tests:              bun run test (on demand)                             │
│ 🔄 Hot Reload:         Enabled                                              │
├───────────────────────────────────────────────────────────────────────────────┤
│ Cache & Analytics:                                                           │
│ • /health/cache               → SQLite vs Map cache performance comparison  │
│ • /health/telemetry/detailed  → Memory pressure analysis & data tracking    │
│ • /health/comprehensive       → All-in-one system health dashboard          │
├───────────────────────────────────────────────────────────────────────────────┤
│ Health & Performance Monitoring:                                             │
│ • /health/system              → Unified health across all domains           │
│ • /health/summary             → Critical issues & status overview           │
│ • /health/performance         → Real-time metrics & correlations            │
│ • /health/performance/history → Performance trends & historical data        │
├───────────────────────────────────────────────────────────────────────────────┤
│ Commands:                                                                    │
│ • Ctrl+C              → Stop development environment                        │
│ • bun run test        → Run tests on demand                                 │
│ • bun run test:watch  → Run tests in watch mode                             │
│ • bun run quality     → Run typecheck + lint                                │
│ • bun run format      → Format code with Biome                              │
└───────────────────────────────────────────────────────────────────────────────┘
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
  // No test watcher to kill

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

// Test watcher removed - tests run on demand only

// Keep process alive
console.log("🎯 Development environment is starting...");
console.log("   Use Ctrl+C to stop when ready\n");
