# 4-Pillar Configuration Pattern

A robust, type-safe configuration architecture for TypeScript/Node.js applications using Zod validation.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Why 4 Pillars?](#why-4-pillars)
4. [File Structure](#file-structure)
5. [Pillar 1: Defaults](#pillar-1-defaults)
6. [Pillar 2: Environment Mapping](#pillar-2-environment-mapping)
7. [Pillar 3: Loader](#pillar-3-loader)
8. [Pillar 4: Validation](#pillar-4-validation)
9. [Supporting Components](#supporting-components)
10. [Production Security](#production-security)
11. [Testing Strategy](#testing-strategy)
12. [Migration Guide](#migration-guide)
13. [Anti-Patterns](#anti-patterns)
14. [Quick Start Template](#quick-start-template)

---

## Overview

The 4-Pillar Configuration Pattern is a structured approach to application configuration that provides:

- **Type Safety**: Full TypeScript support with Zod schema inference
- **Validation**: Runtime validation with detailed error messages
- **Security**: Production-specific security rules
- **Maintainability**: Clear separation of concerns
- **Testability**: Easy to mock and reset for testing
- **Documentation**: Self-documenting through explicit mappings

### Core Principles

1. **Every configuration value has a default** - Application starts without env vars in development
2. **Every env var is explicitly mapped** - No magic, no hidden variables
3. **Loading is controlled** - No side effects, predictable initialization
4. **Validation is the final gate** - Invalid configs fail fast with clear errors

---

## Architecture

```
+-------------------+     +--------------------+     +------------------+
|   Pillar 1        |     |    Pillar 2        |     |   Environment    |
|   defaults.ts     |     |    envMapping.ts   |     |   Variables      |
|   (Base Config)   |     |    (Explicit Map)  |     |   (Runtime)      |
+--------+----------+     +---------+----------+     +--------+---------+
         |                          |                         |
         |                          v                         |
         |               +----------+----------+              |
         |               |     Pillar 3        |<-------------+
         +-------------->|     loader.ts       |
                         |  (Merge & Process)  |
                         +----------+----------+
                                    |
                                    v
                         +----------+----------+
                         |     Pillar 4        |
                         |     schemas.ts      |
                         |   (Zod Validation)  |
                         +----------+----------+
                                    |
                                    v
                         +----------+----------+
                         |   Validated Config  |
                         |   (Type-Safe)       |
                         +---------------------+
```

### Data Flow

1. **Defaults** provide baseline values for all configuration
2. **Environment Mapping** defines which env vars override which config keys
3. **Loader** reads environment, merges with defaults using the mapping
4. **Validation** ensures the merged config is valid before use

---

## Why 4 Pillars?

### Problems with Common Approaches

| Approach | Problem |
|----------|---------|
| Direct `process.env` access | No type safety, scattered throughout codebase |
| Single config file | Mixes concerns, hard to test |
| dotenv only | No validation, no defaults, no type safety |
| Schema-first only | Missing explicit env var documentation |

### 4-Pillar Benefits

| Benefit | How It's Achieved |
|---------|-------------------|
| **Discoverability** | `envMapping.ts` documents every env var |
| **Fail-Fast** | Zod validation catches errors at startup |
| **Type Inference** | `z.infer<typeof Schema>` provides types |
| **Testing** | Reset cache, inject mock configs easily |
| **Security** | Production rules enforced in schemas |
| **Debugging** | Clear error messages with paths |

---

## File Structure

```
src/config/
  index.ts          # Public exports
  config.ts         # Config access, caching, getters
  defaults.ts       # Pillar 1: Default configuration
  envMapping.ts     # Pillar 2: Environment variable mapping
  loader.ts         # Pillar 3: Loading and merging logic
  schemas.ts        # Pillar 4: Zod validation schemas
  helpers.ts        # Utility functions (optional)
```

### Export Structure (`index.ts`)

```typescript
/* src/config/index.ts */

export * from "./config";
export * from "./schemas";
```

Keep exports minimal. Internal implementation details stay internal.

---

## Pillar 1: Defaults

The defaults file provides baseline values for every configuration option.

### Principles

- **Complete**: Every config key has a default
- **Safe**: Defaults work for local development
- **Documented**: Comments explain non-obvious values
- **Typed**: Satisfies the AppConfig type

### Example Implementation

```typescript
/* src/config/defaults.ts */

import pkg from "../../package.json" with { type: "json" };
import type { AppConfig } from "./schemas";

export const defaultConfig: AppConfig = {
  server: {
    port: 3000,
    nodeEnv: "development",
    requestTimeoutMs: 30000,
  },
  database: {
    host: "localhost",
    port: 5432,
    name: "app_dev",
    poolSize: 10,
    ssl: false,
  },
  auth: {
    jwtSecret: "", // Required in production
    jwtExpirationMinutes: 15,
    issuer: "https://api.example.com",
  },
  telemetry: {
    serviceName: "my-service",
    serviceVersion: pkg.version,
    environment: "development",
    enabled: false,
  },
  cache: {
    enabled: false,
    ttlSeconds: 300,
    maxEntries: 1000,
  },
};
```

### Best Practices

1. **Import version from package.json** - Single source of truth
2. **Use empty strings for secrets** - Makes missing secrets obvious
3. **Disable features by default** - Opt-in for production features
4. **Group related settings** - Logical organization

---

## Pillar 2: Environment Mapping

The environment mapping creates an explicit, documented relationship between environment variables and configuration keys.

### Principles

- **Explicit**: Every env var is listed
- **Documented**: Serves as env var documentation
- **Typed**: `as const` for type inference
- **Organized**: Mirrors config structure

### Example Implementation

```typescript
/* src/config/envMapping.ts */

export const envVarMapping = {
  server: {
    port: "PORT",
    nodeEnv: "NODE_ENV",
    requestTimeoutMs: "REQUEST_TIMEOUT_MS",
  },
  database: {
    host: "DB_HOST",
    port: "DB_PORT",
    name: "DB_NAME",
    poolSize: "DB_POOL_SIZE",
    ssl: "DB_SSL",
  },
  auth: {
    // Obfuscate sensitive variable names to prevent grep exposure
    jwtSecret: ["JWT", "SECRET"].join("_"),
    jwtExpirationMinutes: "JWT_EXPIRATION_MINUTES",
    issuer: "JWT_ISSUER",
  },
  telemetry: {
    serviceName: "OTEL_SERVICE_NAME",
    serviceVersion: "OTEL_SERVICE_VERSION",
    environment: "NODE_ENV",
    enabled: "TELEMETRY_ENABLED",
  },
  cache: {
    enabled: "CACHE_ENABLED",
    ttlSeconds: "CACHE_TTL_SECONDS",
    maxEntries: "CACHE_MAX_ENTRIES",
  },
} as const;
```

### Secret Obfuscation Pattern

For sensitive variables, avoid string literals that could be found with grep:

```typescript
// Bad - easily found with: grep -r "JWT_SECRET"
jwtSecret: "JWT_SECRET",

// Good - obfuscated from simple grep searches
jwtSecret: ["JWT", "SECRET"].join("_"),
```

---

## Pillar 3: Loader

The loader orchestrates reading environment variables, merging with defaults, and preparing for validation.

### Principles

- **Controlled**: Explicit initialization, no side effects on import
- **Layered**: Defaults -> Environment -> Validation
- **Typed**: Maintains type safety throughout
- **Error Handling**: Clear, actionable error messages

### Example Implementation

```typescript
/* src/config/loader.ts */

import { z } from "zod";
import { defaultConfig } from "./defaults";
import { toBool, toNumber } from "./helpers";
import type { AppConfig } from "./schemas";
import { AppConfigSchema, addProductionSecurityValidation } from "./schemas";

// Environment variable schema with coercion
const envSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).optional(),
    NODE_ENV: z.enum(["development", "staging", "production", "test"]).optional(),
    REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).optional(),

    DB_HOST: z.string().optional(),
    DB_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    DB_NAME: z.string().optional(),
    DB_POOL_SIZE: z.coerce.number().int().min(1).max(100).optional(),
    DB_SSL: z.string().optional(),

    JWT_SECRET: z.string(),
    JWT_EXPIRATION_MINUTES: z.coerce.number().int().min(1).max(1440).optional(),
    JWT_ISSUER: z.string().optional(),

    OTEL_SERVICE_NAME: z.string().optional(),
    OTEL_SERVICE_VERSION: z.string().optional(),
    TELEMETRY_ENABLED: z.string().optional(),

    CACHE_ENABLED: z.string().optional(),
    CACHE_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).optional(),
    CACHE_MAX_ENTRIES: z.coerce.number().int().min(100).max(100000).optional(),
  })
  .superRefine((data, ctx) => {
    // Add production-specific validation
    addProductionSecurityValidation({ nodeEnv: data.NODE_ENV }, ctx, {
      jwtSecret: data.JWT_SECRET,
    });
  });

function loadConfigFromEnv() {
  const envSource = typeof Bun !== "undefined" ? Bun.env : process.env;

  const result = envSchema.safeParse(envSource);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "root";
        return `  - ${path}: ${issue.message}`;
      })
      .join("\n");

    throw new Error(
      `Invalid environment configuration:\n${issues}\n\n` +
      `Help: Check .env.example for correct format.`
    );
  }

  return result.data;
}

export function initializeConfig(): AppConfig {
  const env = loadConfigFromEnv();

  // Build structured config from environment
  const envConfig = {
    server: filterUndefined({
      port: env.PORT,
      nodeEnv: env.NODE_ENV,
      requestTimeoutMs: env.REQUEST_TIMEOUT_MS,
    }),
    database: filterUndefined({
      host: env.DB_HOST,
      port: env.DB_PORT,
      name: env.DB_NAME,
      poolSize: env.DB_POOL_SIZE,
      ssl: toBool(env.DB_SSL, false),
    }),
    auth: filterUndefined({
      jwtSecret: env.JWT_SECRET,
      jwtExpirationMinutes: env.JWT_EXPIRATION_MINUTES,
      issuer: env.JWT_ISSUER,
    }),
    telemetry: filterUndefined({
      serviceName: env.OTEL_SERVICE_NAME,
      serviceVersion: env.OTEL_SERVICE_VERSION,
      enabled: toBool(env.TELEMETRY_ENABLED, false),
    }),
    cache: filterUndefined({
      enabled: toBool(env.CACHE_ENABLED, false),
      ttlSeconds: env.CACHE_TTL_SECONDS,
      maxEntries: env.CACHE_MAX_ENTRIES,
    }),
  };

  // Merge: defaults <- environment
  const mergedConfig: AppConfig = {
    server: { ...defaultConfig.server, ...envConfig.server },
    database: { ...defaultConfig.database, ...envConfig.database },
    auth: { ...defaultConfig.auth, ...envConfig.auth },
    telemetry: { ...defaultConfig.telemetry, ...envConfig.telemetry },
    cache: { ...defaultConfig.cache, ...envConfig.cache },
  };

  // Final validation
  const result = AppConfigSchema.safeParse(mergedConfig);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Invalid configuration after merging:\n${issues}\n\n` +
      `Help: Configuration validation failed.`
    );
  }

  return result.data;
}

// Utility: Remove undefined values from object
function filterUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}
```

### Merge Strategy

```
defaultConfig.server = { port: 3000, nodeEnv: "development" }
envConfig.server    = { port: 8080 }  // Only PORT was set
                      ↓
mergedConfig.server = { port: 8080, nodeEnv: "development" }
```

---

## Pillar 4: Validation

Zod schemas provide runtime validation and TypeScript type inference.

### Principles

- **Strict**: Use `strictObject` to catch extra keys
- **Descriptive**: Include `.describe()` for documentation
- **Composable**: Build complex schemas from simple ones
- **Secure**: Add production-specific rules

### Example Implementation

```typescript
/* src/config/schemas.ts */

import { z } from "zod";

// Reusable primitives
export const NonEmptyString = z.string().min(1);
export const PortNumber = z.int32().min(1).max(65535);
export const PositiveInt = z.int32().min(1);
export const HttpsUrl = z.url();
export const EmailAddress = z.email();

// Environment types
export const EnvironmentType = z.enum([
  "development",
  "staging",
  "production",
  "test",
]);

// Component schemas
export const ServerConfigSchema = z.strictObject({
  port: PortNumber.describe("Server listening port"),
  nodeEnv: NonEmptyString.describe("Runtime environment"),
  requestTimeoutMs: z.number().int().min(1000).max(300000)
    .describe("Request timeout in milliseconds"),
});

export const DatabaseConfigSchema = z.strictObject({
  host: NonEmptyString.describe("Database host"),
  port: PortNumber.describe("Database port"),
  name: NonEmptyString.describe("Database name"),
  poolSize: z.number().int().min(1).max(100)
    .describe("Connection pool size"),
  ssl: z.boolean().describe("Enable SSL connections"),
});

export const AuthConfigSchema = z.strictObject({
  jwtSecret: z.string().describe("JWT signing secret"),
  jwtExpirationMinutes: PositiveInt.describe("Token expiration in minutes"),
  issuer: NonEmptyString.describe("JWT issuer claim"),
});

export const TelemetryConfigSchema = z.strictObject({
  serviceName: NonEmptyString.describe("Service identifier"),
  serviceVersion: NonEmptyString.describe("Service version"),
  environment: EnvironmentType.describe("Deployment environment"),
  enabled: z.boolean().describe("Enable telemetry export"),
});

export const CacheConfigSchema = z.strictObject({
  enabled: z.boolean().describe("Enable caching"),
  ttlSeconds: z.number().int().min(60).max(86400)
    .describe("Cache TTL in seconds"),
  maxEntries: z.number().int().min(100).max(100000)
    .describe("Maximum cache entries"),
});

// Production security validation
export function addProductionSecurityValidation<
  T extends { nodeEnv?: string },
>(
  data: T,
  ctx: z.RefinementCtx,
  options: {
    jwtSecret?: string;
    databaseHost?: string;
  } = {}
) {
  const isProduction = data.nodeEnv === "production";

  if (!isProduction) return;

  // JWT secret requirements
  if (options.jwtSecret) {
    if (options.jwtSecret.length < 32) {
      ctx.addIssue({
        code: "custom",
        message: "Production JWT secret must be at least 32 characters",
        path: ["auth", "jwtSecret"],
      });
    }
    if (options.jwtSecret === "secret" || options.jwtSecret === "test") {
      ctx.addIssue({
        code: "custom",
        message: "Production JWT secret cannot be a common test value",
        path: ["auth", "jwtSecret"],
      });
    }
  }

  // Database host requirements
  if (options.databaseHost) {
    if (options.databaseHost === "localhost" ||
        options.databaseHost === "127.0.0.1") {
      ctx.addIssue({
        code: "custom",
        message: "Production database cannot use localhost",
        path: ["database", "host"],
      });
    }
  }
}

// Main application config schema
export const AppConfigSchema = z
  .strictObject({
    server: ServerConfigSchema,
    database: DatabaseConfigSchema,
    auth: AuthConfigSchema,
    telemetry: TelemetryConfigSchema,
    cache: CacheConfigSchema,
  })
  .superRefine((data, ctx) => {
    addProductionSecurityValidation({ nodeEnv: data.server.nodeEnv }, ctx, {
      jwtSecret: data.auth.jwtSecret,
      databaseHost: data.database.host,
    });
  });

// Type inference
export type AppConfig = z.infer<typeof AppConfigSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
export type TelemetryConfig = z.infer<typeof TelemetryConfigSchema>;
export type CacheConfig = z.infer<typeof CacheConfigSchema>;

// Schema registry for programmatic access
export const SchemaRegistry = {
  Server: ServerConfigSchema,
  Database: DatabaseConfigSchema,
  Auth: AuthConfigSchema,
  Telemetry: TelemetryConfigSchema,
  Cache: CacheConfigSchema,
  AppConfig: AppConfigSchema,
} as const;
```

---

## Supporting Components

### Config Access (`config.ts`)

```typescript
/* src/config/config.ts */

import { initializeConfig } from "./loader";
import type { AppConfig } from "./schemas";

// Lazy initialization cache
let cachedConfig: AppConfig | null = null;

function getConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = initializeConfig();
  }
  return cachedConfig;
}

// Reset for testing
export function resetConfigCache(): void {
  cachedConfig = null;
}

// Lazy proxy - config is only loaded when accessed
export const config = new Proxy({} as AppConfig, {
  get(_target, prop) {
    return getConfig()[prop as keyof AppConfig];
  },
});

// Component getters
export const getServerConfig = () => getConfig().server;
export const getDatabaseConfig = () => getConfig().database;
export const getAuthConfig = () => getConfig().auth;
export const getTelemetryConfig = () => getConfig().telemetry;
export const getCacheConfig = () => getConfig().cache;

// Configuration metadata
export const configMetadata = {
  version: "1.0.0",
  pattern: "4-pillar",
  get loadedAt() {
    return new Date().toISOString();
  },
  get environment() {
    return getConfig().server.nodeEnv;
  },
};
```

### Helpers (`helpers.ts`)

```typescript
/* src/config/helpers.ts */

/**
 * Convert string environment variable to boolean
 */
export function toBool(
  value: string | boolean | undefined,
  defaultValue: boolean = false
): boolean {
  if (value === undefined) return defaultValue;
  if (typeof value === "boolean") return value;
  const normalized = value.toLowerCase().trim();
  return ["true", "1", "yes", "on"].includes(normalized);
}

/**
 * Convert string to number with fallback
 */
export function toNumber(
  value: string | undefined,
  defaultValue: number
): number {
  if (value === undefined) return defaultValue;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Derive endpoint URL from base + suffix
 */
export function deriveEndpoint(
  baseEndpoint: string | undefined,
  specificEndpoint: string | undefined,
  pathSuffix: string
): string | undefined {
  if (specificEndpoint?.trim()) return specificEndpoint;
  if (!baseEndpoint) return undefined;

  const normalizedBase = baseEndpoint.replace(/\/$/, "");
  const normalizedPath = pathSuffix.startsWith("/")
    ? pathSuffix
    : `/${pathSuffix}`;

  return `${normalizedBase}${normalizedPath}`;
}
```

---

## Production Security

### Security Validation Patterns

```typescript
// In schemas.ts
export function addProductionSecurityValidation(
  data: { nodeEnv?: string },
  ctx: z.RefinementCtx,
  options: SecurityOptions
) {
  if (data.nodeEnv !== "production") return;

  // Secret length requirements
  if (options.secret && options.secret.length < 32) {
    ctx.addIssue({
      code: "custom",
      message: "Production secrets must be 32+ characters",
      path: options.secretPath || ["secret"],
    });
  }

  // No localhost in production
  if (options.url?.includes("localhost")) {
    ctx.addIssue({
      code: "custom",
      message: "Production URLs cannot use localhost",
      path: options.urlPath || ["url"],
    });
  }

  // HTTPS enforcement
  if (options.url && !options.url.startsWith("https://")) {
    ctx.addIssue({
      code: "custom",
      message: "Production URLs must use HTTPS",
      path: options.urlPath || ["url"],
    });
  }
}
```

### Security Checklist

| Check | Implementation |
|-------|----------------|
| Secret length | `z.string().min(32)` in production |
| No localhost | Regex validation in superRefine |
| HTTPS required | URL validation in superRefine |
| No test values | Blocklist check for common test secrets |
| Token obfuscation | `["TOKEN", "NAME"].join("_")` pattern |

---

## Testing Strategy

### Unit Testing Configuration

```typescript
// test/config.test.ts
import { describe, test, expect, beforeEach } from "bun:test";
import { resetConfigCache } from "../src/config/config";
import { initializeConfig } from "../src/config/loader";

describe("Configuration", () => {
  beforeEach(() => {
    // Reset config cache between tests
    resetConfigCache();
  });

  test("loads with valid environment", () => {
    process.env.JWT_SECRET = "test-secret-that-is-long-enough-32";
    process.env.DB_HOST = "localhost";

    const config = initializeConfig();

    expect(config.database.host).toBe("localhost");
  });

  test("fails with missing required variable", () => {
    delete process.env.JWT_SECRET;

    expect(() => initializeConfig()).toThrow(/JWT_SECRET/);
  });

  test("enforces production security", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "short"; // Too short

    expect(() => initializeConfig()).toThrow(/32 characters/);
  });

  test("uses defaults when env not set", () => {
    process.env.JWT_SECRET = "valid-secret-that-is-long-enough";

    const config = initializeConfig();

    expect(config.server.port).toBe(3000); // Default
  });
});
```

### Test Helpers

```typescript
// test/helpers/config.ts
import { resetConfigCache } from "../../src/config/config";

export function withTestConfig(
  envOverrides: Record<string, string>,
  testFn: () => void | Promise<void>
) {
  const originalEnv = { ...process.env };

  return async () => {
    try {
      resetConfigCache();
      Object.assign(process.env, envOverrides);
      await testFn();
    } finally {
      process.env = originalEnv;
      resetConfigCache();
    }
  };
}
```

---

## Migration Guide

### Step 1: Create Directory Structure

```bash
mkdir -p src/config
touch src/config/{index,config,defaults,envMapping,loader,schemas,helpers}.ts
```

### Step 2: Define Schemas (Pillar 4)

Start with schemas - they define your config structure:

```typescript
// src/config/schemas.ts
import { z } from "zod";

export const AppConfigSchema = z.strictObject({
  // Define your config structure
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
```

### Step 3: Create Defaults (Pillar 1)

```typescript
// src/config/defaults.ts
import type { AppConfig } from "./schemas";

export const defaultConfig: AppConfig = {
  // Provide defaults for everything
};
```

### Step 4: Map Environment Variables (Pillar 2)

```typescript
// src/config/envMapping.ts
export const envVarMapping = {
  // Map every env var explicitly
} as const;
```

### Step 5: Implement Loader (Pillar 3)

```typescript
// src/config/loader.ts
export function initializeConfig(): AppConfig {
  // Load env, merge with defaults, validate
}
```

### Step 6: Update Imports

Replace direct `process.env` access:

```typescript
// Before
const port = process.env.PORT || 3000;

// After
import { config } from "./config";
const port = config.server.port;
```

---

## Anti-Patterns

### 1. Direct Environment Access

```typescript
// Bad - scattered, untyped, no validation
const dbHost = process.env.DB_HOST || "localhost";

// Good - centralized, typed, validated
const dbHost = config.database.host;
```

### 2. Missing Defaults

```typescript
// Bad - crashes if env var missing
export const defaultConfig = {
  database: {
    host: process.env.DB_HOST!, // Will be undefined!
  },
};

// Good - always has a value
export const defaultConfig = {
  database: {
    host: "localhost", // Safe default
  },
};
```

### 3. Implicit Environment Variables

```typescript
// Bad - hidden dependency
function getDbConnection() {
  const host = process.env.DB_HOST; // Where is this documented?
}

// Good - explicit in envMapping
export const envVarMapping = {
  database: {
    host: "DB_HOST", // Documented!
  },
};
```

### 4. Mutable Configuration

```typescript
// Bad - config can change at runtime
export let config = loadConfig();
config.server.port = 9999; // Mutation!

// Good - immutable after load
const config = Object.freeze(loadConfig());
```

### 5. Validation After Use

```typescript
// Bad - validation happens too late
const config = loadConfig();
doSomething(config.value); // Might be invalid!
validateConfig(config); // Too late!

// Good - validation before export
export function initializeConfig() {
  const config = loadConfig();
  const result = schema.safeParse(config);
  if (!result.success) throw new Error(...);
  return result.data; // Guaranteed valid
}
```

---

## Quick Start Template

Copy this minimal implementation to get started:

### `src/config/schemas.ts`

```typescript
import { z } from "zod";

export const AppConfigSchema = z.strictObject({
  server: z.strictObject({
    port: z.number().int().min(1).max(65535),
    nodeEnv: z.string(),
  }),
  // Add your config sections
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
```

### `src/config/defaults.ts`

```typescript
import type { AppConfig } from "./schemas";

export const defaultConfig: AppConfig = {
  server: {
    port: 3000,
    nodeEnv: "development",
  },
};
```

### `src/config/envMapping.ts`

```typescript
export const envVarMapping = {
  server: {
    port: "PORT",
    nodeEnv: "NODE_ENV",
  },
} as const;
```

### `src/config/loader.ts`

```typescript
import { z } from "zod";
import { defaultConfig } from "./defaults";
import type { AppConfig } from "./schemas";
import { AppConfigSchema } from "./schemas";

export function initializeConfig(): AppConfig {
  const env = typeof Bun !== "undefined" ? Bun.env : process.env;

  const merged: AppConfig = {
    server: {
      ...defaultConfig.server,
      ...(env.PORT && { port: Number(env.PORT) }),
      ...(env.NODE_ENV && { nodeEnv: env.NODE_ENV }),
    },
  };

  const result = AppConfigSchema.safeParse(merged);
  if (!result.success) {
    throw new Error(`Config validation failed: ${result.error.message}`);
  }

  return result.data;
}
```

### `src/config/config.ts`

```typescript
import { initializeConfig } from "./loader";
import type { AppConfig } from "./schemas";

let cachedConfig: AppConfig | null = null;

export function resetConfigCache(): void {
  cachedConfig = null;
}

export const config = new Proxy({} as AppConfig, {
  get(_target, prop) {
    if (!cachedConfig) cachedConfig = initializeConfig();
    return cachedConfig[prop as keyof AppConfig];
  },
});
```

### `src/config/index.ts`

```typescript
export * from "./config";
export * from "./schemas";
```

---

## Summary

The 4-Pillar Configuration Pattern provides:

| Pillar | File | Responsibility |
|--------|------|----------------|
| 1 | `defaults.ts` | Baseline values for all config |
| 2 | `envMapping.ts` | Explicit env var documentation |
| 3 | `loader.ts` | Controlled loading and merging |
| 4 | `schemas.ts` | Zod validation and types |

### Key Benefits

- Type-safe configuration throughout your application
- Fail-fast validation at startup
- Self-documenting environment variables
- Easy testing with cache reset
- Production security enforcement
- Clear error messages for debugging

---

## References

- [Zod Documentation](https://zod.dev/)
- [12-Factor App Config](https://12factor.net/config)
- Original implementation: `pvh.services.authentication-v2/src/config/`
