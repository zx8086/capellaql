// Runtime configuration module
import { z } from "zod";
import type { RuntimeConfig } from "../base";
import { getEnvVar, parseEnvVar } from "../utils/env-parser";

// Environment variable mapping for runtime section
export const runtimeEnvMapping = {
  NODE_ENV: "NODE_ENV",
  CN_ROOT: "CN_ROOT",
  CN_CXXCBC_CACHE_DIR: "CN_CXXCBC_CACHE_DIR",
  SOURCE_MAP_SUPPORT: "SOURCE_MAP_SUPPORT",
  PRESERVE_SOURCE_MAPS: "PRESERVE_SOURCE_MAPS",
  BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS: "BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS",
} as const;

// Runtime configuration defaults
export const runtimeDefaults: RuntimeConfig = {
  NODE_ENV: "development",
  CN_ROOT: "/usr/src/app",
  CN_CXXCBC_CACHE_DIR: undefined,
  SOURCE_MAP_SUPPORT: true,
  PRESERVE_SOURCE_MAPS: true,
  BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS: 120,
};

// Zod schema for runtime configuration
export const RuntimeConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "staging", "production", "test"]).default("development"),
  CN_ROOT: z.string().min(1).default("/usr/src/app"),
  CN_CXXCBC_CACHE_DIR: z.string().optional(),
  SOURCE_MAP_SUPPORT: z.coerce.boolean().default(true),
  PRESERVE_SOURCE_MAPS: z.coerce.boolean().default(true),
  BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS: z.coerce
    .number()
    .min(0)
    .max(3600)
    .default(120)
    .refine((val) => !Number.isNaN(val), "DNS TTL cannot be NaN"),
});

// Load runtime configuration from environment variables
export function loadRuntimeConfigFromEnv(): RuntimeConfig {
  return {
    NODE_ENV:
      (parseEnvVar(getEnvVar(runtimeEnvMapping.NODE_ENV), "string", "NODE_ENV") as string) || runtimeDefaults.NODE_ENV,

    CN_ROOT:
      (parseEnvVar(getEnvVar(runtimeEnvMapping.CN_ROOT), "string", "CN_ROOT") as string) || runtimeDefaults.CN_ROOT,

    CN_CXXCBC_CACHE_DIR:
      (parseEnvVar(getEnvVar(runtimeEnvMapping.CN_CXXCBC_CACHE_DIR), "string", "CN_CXXCBC_CACHE_DIR") as string) ||
      runtimeDefaults.CN_CXXCBC_CACHE_DIR,

    SOURCE_MAP_SUPPORT:
      (parseEnvVar(getEnvVar(runtimeEnvMapping.SOURCE_MAP_SUPPORT), "boolean", "SOURCE_MAP_SUPPORT") as boolean) ??
      runtimeDefaults.SOURCE_MAP_SUPPORT,

    PRESERVE_SOURCE_MAPS:
      (parseEnvVar(getEnvVar(runtimeEnvMapping.PRESERVE_SOURCE_MAPS), "boolean", "PRESERVE_SOURCE_MAPS") as boolean) ??
      runtimeDefaults.PRESERVE_SOURCE_MAPS,

    BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS:
      (parseEnvVar(
        getEnvVar(runtimeEnvMapping.BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS),
        "number",
        "BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS"
      ) as number) || runtimeDefaults.BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS,
  };
}

// Domain-specific validation for runtime configuration
export function validateRuntimeConfig(config: RuntimeConfig, isProduction: boolean): string[] {
  const warnings: string[] = [];

  // Check DNS TTL is reasonable
  if (Number.isNaN(config.BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS)) {
    warnings.push("BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS is NaN - will cause DNS caching issues");
  }

  if (config.BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS > 3600) {
    warnings.push("DNS TTL exceeds 1 hour - may cause stale DNS resolution");
  }

  // Production-specific validations
  if (isProduction) {
    if (config.SOURCE_MAP_SUPPORT === false) {
      warnings.push("Source maps disabled in production - may impact debugging");
    }
  }

  return warnings;
}

// Environment variable path mapping for error reporting
export function getRuntimeEnvVarPath(configPath: string): string | undefined {
  const mapping: Record<string, string> = {
    "runtime.NODE_ENV": "NODE_ENV",
    "runtime.CN_ROOT": "CN_ROOT",
    "runtime.CN_CXXCBC_CACHE_DIR": "CN_CXXCBC_CACHE_DIR",
    "runtime.SOURCE_MAP_SUPPORT": "SOURCE_MAP_SUPPORT",
    "runtime.PRESERVE_SOURCE_MAPS": "PRESERVE_SOURCE_MAPS",
    "runtime.BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS": "BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS",
  };
  return mapping[configPath];
}
