// Application configuration module
import { z } from "zod";
import type { ApplicationConfig } from "../base";
import { parseEnvVar, getEnvVar } from "../utils/env-parser";

// Environment variable mapping for application section
export const applicationEnvMapping = {
  LOG_LEVEL: "LOG_LEVEL",
  LOG_MAX_SIZE: "LOG_MAX_SIZE",
  LOG_MAX_FILES: "LOG_MAX_FILES",
  YOGA_RESPONSE_CACHE_TTL: "YOGA_RESPONSE_CACHE_TTL",
  PORT: "PORT",
  ENABLE_FILE_LOGGING: "ENABLE_FILE_LOGGING",
  ALLOWED_ORIGINS: "ALLOWED_ORIGINS",
  BASE_URL: "BASE_URL",
} as const;

// Application configuration defaults
export const applicationDefaults: ApplicationConfig = {
  LOG_LEVEL: "info",
  LOG_MAX_SIZE: "20m",
  LOG_MAX_FILES: "14d",
  YOGA_RESPONSE_CACHE_TTL: 900000, // 15 minutes
  PORT: 4000,
  ENABLE_FILE_LOGGING: false,
  ALLOWED_ORIGINS: ["http://localhost:3000"],
  BASE_URL: "http://localhost",
};

// Zod schema for application configuration
export const ApplicationConfigSchema = z.object({
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  LOG_MAX_SIZE: z.string().default("20m"),
  LOG_MAX_FILES: z.string().default("14d"),
  YOGA_RESPONSE_CACHE_TTL: z.coerce
    .number()
    .min(0)
    .max(3600000)
    .default(900000)
    .refine((val) => !Number.isNaN(val), "Cache TTL cannot be NaN"),
  PORT: z.coerce.number().min(1).max(65535).default(4000),
  ENABLE_FILE_LOGGING: z.coerce.boolean().default(false),
  ALLOWED_ORIGINS: z.array(z.string().url()).default(["http://localhost:3000"]),
  BASE_URL: z.string().url("BASE_URL must be a valid URL").default("http://localhost"),
});

// Load application configuration from environment variables
export function loadApplicationConfigFromEnv(): ApplicationConfig {
  return {
    LOG_LEVEL:
      (parseEnvVar(getEnvVar(applicationEnvMapping.LOG_LEVEL), "string", "LOG_LEVEL") as string) ||
      applicationDefaults.LOG_LEVEL,

    LOG_MAX_SIZE:
      (parseEnvVar(getEnvVar(applicationEnvMapping.LOG_MAX_SIZE), "string", "LOG_MAX_SIZE") as string) ||
      applicationDefaults.LOG_MAX_SIZE,

    LOG_MAX_FILES:
      (parseEnvVar(getEnvVar(applicationEnvMapping.LOG_MAX_FILES), "string", "LOG_MAX_FILES") as string) ||
      applicationDefaults.LOG_MAX_FILES,

    YOGA_RESPONSE_CACHE_TTL:
      (parseEnvVar(
        getEnvVar(applicationEnvMapping.YOGA_RESPONSE_CACHE_TTL),
        "number",
        "YOGA_RESPONSE_CACHE_TTL"
      ) as number) || applicationDefaults.YOGA_RESPONSE_CACHE_TTL,

    PORT:
      (parseEnvVar(getEnvVar(applicationEnvMapping.PORT), "number", "PORT") as number) ||
      applicationDefaults.PORT,

    ENABLE_FILE_LOGGING:
      (parseEnvVar(
        getEnvVar(applicationEnvMapping.ENABLE_FILE_LOGGING),
        "boolean",
        "ENABLE_FILE_LOGGING"
      ) as boolean) ?? applicationDefaults.ENABLE_FILE_LOGGING,

    ALLOWED_ORIGINS:
      (parseEnvVar(getEnvVar(applicationEnvMapping.ALLOWED_ORIGINS), "array", "ALLOWED_ORIGINS") as string[]) ||
      applicationDefaults.ALLOWED_ORIGINS,

    BASE_URL:
      (parseEnvVar(getEnvVar(applicationEnvMapping.BASE_URL), "string", "BASE_URL") as string) ||
      applicationDefaults.BASE_URL,
  };
}

// Domain-specific validation
export function validateApplicationConfig(config: ApplicationConfig, isProduction: boolean): string[] {
  const warnings: string[] = [];

  // Check for NaN values that cause runtime issues
  if (Number.isNaN(config.YOGA_RESPONSE_CACHE_TTL)) {
    warnings.push("YOGA_RESPONSE_CACHE_TTL is NaN - will cause runtime errors");
  }

  // Check for reasonable timeout values
  if (config.YOGA_RESPONSE_CACHE_TTL <= 0 || config.YOGA_RESPONSE_CACHE_TTL > 3600000) {
    warnings.push(`YOGA_RESPONSE_CACHE_TTL value is unreasonable: ${config.YOGA_RESPONSE_CACHE_TTL}ms`);
  }

  // Production-specific validations
  if (isProduction) {
    // Validate CORS origins in production
    if (config.ALLOWED_ORIGINS.some((origin) => origin === "*" || origin.includes("localhost"))) {
      warnings.push("Production CORS origins should not include localhost or wildcards");
    }
  }

  // Validate port availability (basic check)
  if (config.PORT < 1024 && !isProduction) {
    console.warn(`Port ${config.PORT} is a privileged port - ensure proper permissions`);
  }

  return warnings;
}

// Environment variable path mapping for error reporting
export function getApplicationEnvVarPath(configPath: string): string | undefined {
  const mapping: Record<string, string> = {
    "application.LOG_LEVEL": "LOG_LEVEL",
    "application.LOG_MAX_SIZE": "LOG_MAX_SIZE",
    "application.LOG_MAX_FILES": "LOG_MAX_FILES",
    "application.YOGA_RESPONSE_CACHE_TTL": "YOGA_RESPONSE_CACHE_TTL",
    "application.PORT": "PORT",
    "application.ENABLE_FILE_LOGGING": "ENABLE_FILE_LOGGING",
    "application.ALLOWED_ORIGINS": "ALLOWED_ORIGINS",
    "application.BASE_URL": "BASE_URL",
  };
  return mapping[configPath];
}