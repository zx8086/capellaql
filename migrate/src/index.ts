/* src/index.ts */

export { KongAdapter } from "./adapters/kong.adapter";
// Export main configuration and services for programmatic usage
export { loadConfig } from "./config/index";
// Standard Bun entry point following conventional patterns
export { default as server } from "./server";
export { NativeBunJWT } from "./services/jwt.service";

// Performance utilities for external usage
export { calculateDuration, getHighResTime, measure, measureSync } from "./utils/performance";

// Security utilities
export { runCommand, sanitize, validateHeaders } from "./utils/security";

// Main server startup (when run directly)
if (import.meta.main) {
  await import("./server");
}
