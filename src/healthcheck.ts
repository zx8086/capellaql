/* src/healthcheck.ts - Bun-optimized healthcheck script */

import config from "./config";
import { createHealthcheck } from "./utils/bunUtils";

async function main() {
  try {
    const _health = await createHealthcheck();

    // Simple HTTP check to the health endpoint
    const healthUrl = `${config.application.BASE_URL}:${config.application.PORT}/health`;

    try {
      const response = await fetch(healthUrl, {
        timeout: 5000, // 5 second timeout
      });

      if (response.ok) {
        console.log("✅ Health check passed");
        process.exit(0);
      } else {
        console.error(`❌ Health check failed: HTTP ${response.status}`);
        process.exit(1);
      }
    } catch (error) {
      console.error("❌ Health check failed:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Healthcheck script error:", error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
