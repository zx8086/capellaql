/* src/config/index.ts */
// 4-Pillar Configuration Pattern - Simple Re-export
// Aligned with migrate reference pattern

// Re-export all from config (includes getters, proxies, metadata, utility functions)
export * from "./config";

// Re-export all from schemas (includes types, Zod schemas, SchemaRegistry)
export * from "./schemas";

// Default export for backward compatibility
import { config } from "./config";
export default config;
