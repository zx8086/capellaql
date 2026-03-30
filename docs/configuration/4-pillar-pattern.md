# 4-Pillar Configuration Pattern (v2)

A robust, type-safe configuration architecture for TypeScript/Node.js applications using Zod validation.

> **Note:** This guide is a reusable pattern reference. The examples use a hypothetical JWT authentication service for illustration purposes. CapellaQL itself does not use JWT -- its actual configuration covers Couchbase, OpenTelemetry, and application settings. The pattern applies identically regardless of the domain.

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

#### 1. Every configuration value has a default

Your `defaults.ts` file provides a working value for every single config key. If a developer clones the repo and runs it locally without setting any environment variables at all, the app still starts. Port defaults to 3000, database host defaults to `localhost`, cache is disabled, and so on. You never hit a "missing config" error in local development. Defaults are the safety net that makes onboarding frictionless.

#### 2. Every env var is explicitly mapped

There is no place in your codebase that secretly reads `process.env.SOME_VARIABLE` without you knowing about it. Every environment variable the app cares about is listed in `envMapping.ts`. If a new developer asks "what env vars does this app need?", you point them at one file and they have the complete answer. No grepping through the codebase, no surprises, no hidden dependencies on variables that only exist in one person's `.env` file.

#### 3. Loading is controlled

Config doesn't get loaded as a side effect of importing a module. In many apps, you see `const config = loadConfig()` at the top level of a file — that runs the moment anything imports it, which makes the order of imports matter and makes testing unpredictable. In this pattern, config is only loaded when you first *access* it (lazy initialization via the proxy or `getConfig()`), and you can explicitly reset it in tests with `resetConfigCache()`. You control when it happens.

#### 4. Validation is the final gate

The app refuses to start if the config is invalid. Rather than discovering halfway through a request that your database port is `"banana"`, Zod checks everything at startup. If something is wrong, you get a clear error message like `database.port: Expected number, received string` and the process exits before serving any traffic. Fail fast, fail loud — problems are caught in deployment, not in production at 2am.

#### 5. The env mapping drives the loader

In many config patterns, env var names end up duplicated — listed in documentation *and* hardcoded in the loading logic (`env.PORT`, `env.DB_HOST`, etc.). When these drift out of sync, bugs hide. In this pattern, the loader walks the `envVarMapping` object programmatically. You add a new env var to the mapping, and the loader picks it up automatically. One place to add, one place to update, one source of truth.

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
                         |   (Frozen, Typed)   |
                         +---------------------+
```

### Data Flow

1. **Defaults** provide baseline values for all configuration
2. **Environment Mapping** defines which env vars override which config keys (and their types)
3. **Loader** walks the mapping, reads environment, merges with defaults — no hardcoded env var names
4. **Validation** ensures the merged config is valid before use, then freezes it

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
| **Debugging** | Clear error messages with paths + `describeConfig()` |
| **No Duplication** | Loader walks the mapping — env var names appear once |
| **Immutability** | Config is deep-frozen after validation |

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
  helpers.ts        # Utility functions
```

Additionally, at the project root:

```
.env.example        # Auto-generated from envMapping.ts (see Supporting Components)
```

### Export Structure (`index.ts`)

```typescript
/* src/config/index.ts */

export { config, getConfig, resetConfigCache } from "./config";
export { getServerConfig, getDatabaseConfig, getAuthConfig } from "./config";
export { getTelemetryConfig, getCacheConfig } from "./config";
export { describeConfig } from "./config";
export type { AppConfig, ServerConfig, DatabaseConfig } from "./schemas";
export type { AuthConfig, TelemetryConfig, CacheConfig } from "./schemas";
```

Keep exports explicit. Internal implementation details stay internal.

---

## Pillar 1: Defaults

The defaults file provides baseline values for every configuration option.

### Principles

- **Complete**: Every config key has a default
- **Safe**: Defaults work for local development
- **Documented**: Comments explain non-obvious values
- **Typed**: Uses `as const satisfies` for narrower literal types with structure checking

### Example Implementation

```typescript
/* src/config/defaults.ts */

import pkg from "../../package.json" with { type: "json" };
import type { AppConfig } from "./schemas";

export const defaultConfig = {
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
    jwtSecret: "", // Required in production — empty makes missing secrets obvious
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
} as const satisfies AppConfig;
```

### Why `as const satisfies`?

Using `as const satisfies AppConfig` gives you the best of both worlds:

- `satisfies AppConfig` — TypeScript verifies the object matches the schema type
- `as const` — preserves narrow literal types (e.g. `3000` instead of `number`)
- Useful when you need to distinguish "was this the default or an override?"

### Best Practices

1. **Import version from package.json** — Single source of truth
2. **Use empty strings for secrets** — Makes missing secrets obvious
3. **Disable features by default** — Opt-in for production features
4. **Group related settings** — Logical organization

---

## Pillar 2: Environment Mapping

The environment mapping creates an explicit, documented relationship between environment variables and configuration keys. **Crucially, this mapping is consumed by the loader** — env var names appear only here, never hardcoded in the loader.

### Principles

- **Explicit**: Every env var is listed
- **Documented**: Serves as env var documentation
- **Typed**: Includes coercion type for each mapping
- **Single Source of Truth**: The loader walks this mapping — no duplication

### Example Implementation

```typescript
/* src/config/envMapping.ts */

/**
 * Type coercion hint for environment variable values.
 * All env vars are strings at runtime; this tells the loader how to convert them.
 */
export type EnvVarType = "string" | "number" | "boolean";

export interface EnvVarEntry {
  envVar: string;
  type: EnvVarType;
}

/**
 * Environment variable mapping.
 *
 * This is the SINGLE SOURCE OF TRUTH for which env vars map to which config keys.
 * The loader walks this structure — env var names are never hardcoded elsewhere.
 */
export const envVarMapping = {
  server: {
    port: { envVar: "PORT", type: "number" },
    nodeEnv: { envVar: "NODE_ENV", type: "string" },
    requestTimeoutMs: { envVar: "REQUEST_TIMEOUT_MS", type: "number" },
  },
  database: {
    host: { envVar: "DB_HOST", type: "string" },
    port: { envVar: "DB_PORT", type: "number" },
    name: { envVar: "DB_NAME", type: "string" },
    poolSize: { envVar: "DB_POOL_SIZE", type: "number" },
    ssl: { envVar: "DB_SSL", type: "boolean" },
  },
  auth: {
    jwtSecret: { envVar: "JWT_SECRET", type: "string" },
    jwtExpirationMinutes: { envVar: "JWT_EXPIRATION_MINUTES", type: "number" },
    issuer: { envVar: "JWT_ISSUER", type: "string" },
  },
  telemetry: {
    serviceName: { envVar: "OTEL_SERVICE_NAME", type: "string" },
    serviceVersion: { envVar: "OTEL_SERVICE_VERSION", type: "string" },
    environment: { envVar: "NODE_ENV", type: "string" },
    enabled: { envVar: "TELEMETRY_ENABLED", type: "boolean" },
  },
  cache: {
    enabled: { envVar: "CACHE_ENABLED", type: "boolean" },
    ttlSeconds: { envVar: "CACHE_TTL_SECONDS", type: "number" },
    maxEntries: { envVar: "CACHE_MAX_ENTRIES", type: "number" },
  },
} as const satisfies Record<string, Record<string, EnvVarEntry>>;

export type EnvVarMapping = typeof envVarMapping;
```

### Note on Secret Env Var Names

Some patterns suggest obfuscating secret env var names (e.g. `["JWT", "SECRET"].join("_")`) to prevent grep exposure. In practice, this provides minimal protection — the concatenated string is still present at runtime, in compiled JS output, and in stack traces. **If an attacker has access to your source code or running process, string concatenation won't stop them.**

Instead, protect secrets at the infrastructure level:

- Use a secrets manager (AWS Secrets Manager, Vault, Doppler, 1Password)
- Never commit secrets to source control
- Use `.env` files only in local development with `.gitignore`
- Rotate secrets regularly via CI/CD

---

## Pillar 3: Loader

The loader orchestrates reading environment variables, merging with defaults, and preparing for validation. **It walks the `envVarMapping` structure** so env var names are never duplicated.

### Principles

- **Controlled**: Explicit initialization, no side effects on import
- **DRY**: Reads env var names from `envVarMapping`, never hardcodes them
- **Single Validation Boundary**: Coerces raw env values, then validates the final merged config once
- **Immutable Output**: Deep-freezes the validated config

### Example Implementation

```typescript
/* src/config/loader.ts */

import { defaultConfig } from "./defaults";
import { envVarMapping, type EnvVarType } from "./envMapping";
import { toBool } from "./helpers";
import type { AppConfig } from "./schemas";
import { AppConfigSchema } from "./schemas";

/**
 * Coerce a raw string env var value to the target type.
 */
function coerceValue(
  raw: string | undefined,
  type: EnvVarType
): string | number | boolean | undefined {
  if (raw === undefined || raw === "") return undefined;

  switch (type) {
    case "number": {
      const parsed = Number(raw);
      if (Number.isNaN(parsed)) {
        throw new Error(`Cannot convert "${raw}" to number`);
      }
      return parsed;
    }
    case "boolean":
      return toBool(raw);
    case "string":
      return raw;
  }
}

/**
 * Walk the envVarMapping and read values from the environment.
 * Returns a partial config object with only the values that were set.
 */
function readEnvValues(
  env: Record<string, string | undefined>
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};

  for (const [section, fields] of Object.entries(envVarMapping)) {
    const sectionValues: Record<string, unknown> = {};
    let hasValues = false;

    for (const [key, entry] of Object.entries(fields)) {
      const raw = env[entry.envVar];
      const coerced = coerceValue(raw, entry.type);

      if (coerced !== undefined) {
        sectionValues[key] = coerced;
        hasValues = true;
      }
    }

    if (hasValues) {
      result[section] = sectionValues;
    }
  }

  return result;
}

/**
 * Deep freeze an object recursively.
 */
function deepFreeze<T extends object>(obj: T): Readonly<T> {
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return Object.freeze(obj);
}

/**
 * Load config from environment, merge with defaults, validate, and freeze.
 *
 * This is the single entry point for config initialization.
 * Validation happens ONCE here — on the final merged config.
 */
export function initializeConfig(): Readonly<AppConfig> {
  const envSource =
    typeof Bun !== "undefined" ? Bun.env : process.env;

  // Read and coerce env values using the mapping
  const envValues = readEnvValues(
    envSource as Record<string, string | undefined>
  );

  // Merge: defaults <- environment overrides
  const sections = Object.keys(defaultConfig) as (keyof AppConfig)[];
  const merged = {} as Record<string, unknown>;

  for (const section of sections) {
    merged[section] = {
      ...defaultConfig[section],
      ...(envValues[section] || {}),
    };
  }

  // Single validation boundary — validate the final merged config
  const result = AppConfigSchema.safeParse(merged);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "root";
        return `  - ${path}: ${issue.message}`;
      })
      .join("\n");

    throw new Error(
      `Invalid configuration:\n${issues}\n\n` +
        `Help: Check .env.example for required variables and correct formats.`
    );
  }

  // Freeze the config to prevent runtime mutation
  return deepFreeze(result.data);
}
```

### Key Design Decisions

**Why the loader walks `envVarMapping`:** In v1, the loader hardcoded env var names like `env.PORT`, `env.DB_HOST`, etc., duplicating what was already defined in `envVarMapping`. Now the mapping is the single source of truth — add a new env var in `envVarMapping` and the loader picks it up automatically.

**Why single validation:** Previously, env vars were validated with a separate `envSchema` and the merged config was validated again with `AppConfigSchema`, with production security checks duplicated in both. Now coercion happens inline (simple type conversion), and validation happens once on the final merged config. This eliminates redundant checks and keeps production security rules in one place.

**Why deep freeze:** The anti-patterns section warns against mutable config, but v1 didn't enforce it. `deepFreeze` makes the config truly immutable at runtime — any accidental `config.server.port = 9999` throws a TypeError.

### Merge Strategy

```
defaultConfig.server = { port: 3000, nodeEnv: "development" }
envValues.server     = { port: 8080 }  // Only PORT was set in env
                       ↓
merged.server        = { port: 8080, nodeEnv: "development" }
                       ↓ (validated + frozen)
config.server        = { port: 8080, nodeEnv: "development" }  // Immutable
```

---

## Pillar 4: Validation

Zod schemas provide runtime validation and TypeScript type inference.

### Principles

- **Strict**: Use `strictObject` to catch extra keys
- **Descriptive**: Include `.describe()` for documentation
- **Composable**: Build complex schemas from simple ones
- **Secure**: Production-specific rules in one place (the `AppConfigSchema`)

### Example Implementation

```typescript
/* src/config/schemas.ts */

import { z } from "zod";

// ─── Reusable Primitives ───

export const NonEmptyString = z.string().min(1);
export const PortNumber = z.number().int().min(1).max(65535);
export const PositiveInt = z.number().int().min(1);

// ─── Environment Type ───

export const EnvironmentType = z.enum([
  "development",
  "staging",
  "production",
  "test",
]);

// ─── Component Schemas ───

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

// ─── Production Security Validation ───

/**
 * Production security rules.
 * These run ONLY in the AppConfigSchema superRefine — the single validation
 * boundary. They are never duplicated in env-level validation.
 */
export function addProductionSecurityValidation(
  data: { nodeEnv?: string },
  ctx: z.RefinementCtx,
  options: {
    jwtSecret?: string;
    databaseHost?: string;
  } = {}
) {
  const isProduction = data.nodeEnv === "production";
  if (!isProduction) return;

  // JWT secret requirements
  if (options.jwtSecret !== undefined) {
    if (options.jwtSecret.length < 32) {
      ctx.addIssue({
        code: "custom",
        message: "Production JWT secret must be at least 32 characters",
        path: ["auth", "jwtSecret"],
      });
    }

    const blocklist = ["secret", "test", "password", "changeme", "default"];
    if (blocklist.includes(options.jwtSecret.toLowerCase())) {
      ctx.addIssue({
        code: "custom",
        message: "Production JWT secret cannot be a common test value",
        path: ["auth", "jwtSecret"],
      });
    }
  }

  // Database host requirements
  if (options.databaseHost) {
    if (
      options.databaseHost === "localhost" ||
      options.databaseHost === "127.0.0.1"
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Production database cannot use localhost",
        path: ["database", "host"],
      });
    }
  }
}

// ─── Main Application Config Schema ───

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

// ─── Type Inference ───

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
export type TelemetryConfig = z.infer<typeof TelemetryConfigSchema>;
export type CacheConfig = z.infer<typeof CacheConfigSchema>;
```

---

## Supporting Components

### Config Access (`config.ts`)

```typescript
/* src/config/config.ts */

import { initializeConfig } from "./loader";
import type { AppConfig } from "./schemas";

// ─── Lazy Initialization Cache ───

let cachedConfig: Readonly<AppConfig> | null = null;

/**
 * Get the validated, frozen config. Initializes on first call.
 *
 * Prefer this over the `config` proxy when you need standard object
 * behavior (spreading, Object.keys, etc.).
 */
export function getConfig(): Readonly<AppConfig> {
  if (!cachedConfig) {
    cachedConfig = initializeConfig();
  }
  return cachedConfig;
}

/**
 * Reset for testing. Call in beforeEach to ensure test isolation.
 */
export function resetConfigCache(): void {
  cachedConfig = null;
}

// ─── Convenience Proxy ───
//
// Provides `config.server.port` syntax.
//
// LIMITATION: This proxy only intercepts top-level property access.
// Object.keys(config), { ...config }, and JSON.stringify(config) will NOT
// work as expected. Use getConfig() for those cases.

export const config = new Proxy({} as Readonly<AppConfig>, {
  get(_target, prop) {
    return getConfig()[prop as keyof AppConfig];
  },
});

// ─── Component Getters ───

export const getServerConfig = () => getConfig().server;
export const getDatabaseConfig = () => getConfig().database;
export const getAuthConfig = () => getConfig().auth;
export const getTelemetryConfig = () => getConfig().telemetry;
export const getCacheConfig = () => getConfig().cache;

// ─── Debug Utility ───

/**
 * Return a redacted copy of the config safe for logging.
 * Secrets are replaced with [REDACTED]. Invaluable for debugging
 * deployment issues without leaking sensitive values.
 */
export function describeConfig(
  cfg?: Readonly<AppConfig>
): Record<string, unknown> {
  const c = cfg ?? getConfig();
  return {
    server: { ...c.server },
    database: { ...c.database },
    auth: {
      ...c.auth,
      jwtSecret: c.auth.jwtSecret ? "[REDACTED]" : "(empty)",
    },
    telemetry: { ...c.telemetry },
    cache: { ...c.cache },
    _meta: {
      pattern: "4-pillar-v2",
      loadedAt: new Date().toISOString(),
      environment: c.server.nodeEnv,
    },
  };
}

// ─── Metadata ───

export const configMetadata = {
  version: "2.0.0",
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

const TRUTHY = new Set(["true", "1", "yes", "on"]);
const FALSY = new Set(["false", "0", "no", "off"]);

/**
 * Convert a string environment variable to boolean.
 *
 * Recognizes explicit truthy/falsy values and throws on unrecognized input
 * to catch typos like "tru" or "fals" early.
 *
 * @throws {Error} if the value is a non-empty string that isn't recognized
 */
export function toBool(value: string | boolean | undefined): boolean | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value === "boolean") return value;

  const normalized = value.toLowerCase().trim();

  if (TRUTHY.has(normalized)) return true;
  if (FALSY.has(normalized)) return false;

  throw new Error(
    `Cannot convert "${value}" to boolean. ` +
    `Expected one of: ${[...TRUTHY, ...FALSY].join(", ")}`
  );
}

/**
 * Derive an endpoint URL from base + suffix.
 * Returns the specific endpoint if set, otherwise appends the suffix to the base.
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

### `.env.example` Generator

Since `envVarMapping` contains all env var names and types, auto-generate `.env.example` from it:

```typescript
/* scripts/generate-env-example.ts */

import { envVarMapping } from "../src/config/envMapping";

const lines: string[] = [
  "# Auto-generated from envVarMapping.ts",
  "# Do not edit manually — run: npx tsx scripts/generate-env-example.ts",
  "",
];

for (const [section, fields] of Object.entries(envVarMapping)) {
  lines.push(`# ─── ${section.toUpperCase()} ───`);

  for (const [key, entry] of Object.entries(fields)) {
    const typeHint = entry.type === "boolean" ? "true|false"
      : entry.type === "number" ? "<number>"
      : "<string>";

    lines.push(`# ${key} (${entry.type})`);
    lines.push(`# ${entry.envVar}=${typeHint}`);
  }
  lines.push("");
}

// Required vars (uncommented)
lines.push("# ─── REQUIRED ───");
lines.push("JWT_SECRET=");

const output = lines.join("\n");
console.log(output);

// Optionally write to file:
// import { writeFileSync } from "fs";
// writeFileSync(".env.example", output);
```

Add to `package.json`:

```json
{
  "scripts": {
    "generate:env": "tsx scripts/generate-env-example.ts > .env.example"
  }
}
```

---

## Production Security

### Security Validation Rules

All production security validation lives in `addProductionSecurityValidation()` in `schemas.ts` and runs **once** via the `AppConfigSchema.superRefine`. This avoids duplicating rules across multiple validation layers.

The function enforces:

- **Secret length**: JWT secret must be 32+ characters in production
- **No test values**: Blocklist rejects common weak secrets (`secret`, `test`, `password`, `changeme`, `default`)
- **No localhost**: Production database host cannot be `localhost` or `127.0.0.1`

### Extending Security Rules

To add new production rules, extend `addProductionSecurityValidation`:

```typescript
// Example: Enforce HTTPS on issuer URL in production
if (options.issuerUrl && !options.issuerUrl.startsWith("https://")) {
  ctx.addIssue({
    code: "custom",
    message: "Production issuer URL must use HTTPS",
    path: ["auth", "issuer"],
  });
}
```

### Security Checklist

| Check | Implementation |
|-------|----------------|
| Secret length | `superRefine`: min 32 chars in production |
| No localhost | `superRefine`: regex on database host |
| No test values | `superRefine`: blocklist check |
| Immutable config | `deepFreeze()` in loader |
| Secrets redacted in logs | `describeConfig()` replaces secrets with `[REDACTED]` |
| Secrets not in source | Use secrets manager; `.env` only for local dev |

### Protecting Secrets — Do It at the Infrastructure Level

Don't rely on code-level obfuscation. Instead:

- **Secrets Manager**: AWS Secrets Manager, HashiCorp Vault, Doppler, 1Password CLI
- **CI/CD Injection**: Inject secrets as environment variables during deployment
- **`.gitignore`**: Always exclude `.env` from version control
- **Rotation**: Rotate secrets regularly, ideally automated
- **Audit Logging**: Track secret access in your secrets manager

---

## Testing Strategy

### Unit Testing Configuration

```typescript
// test/config.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { resetConfigCache } from "../src/config/config";
import { initializeConfig } from "../src/config/loader";

describe("Configuration", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetConfigCache();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetConfigCache();
  });

  test("loads with valid environment", () => {
    process.env.JWT_SECRET = "test-secret-that-is-long-enough-32chars";
    process.env.DB_HOST = "localhost";

    const config = initializeConfig();

    expect(config.database.host).toBe("localhost");
  });

  test("uses defaults when env not set", () => {
    const config = initializeConfig();

    expect(config.server.port).toBe(3000);
    expect(config.server.nodeEnv).toBe("development");
  });

  test("env overrides defaults", () => {
    process.env.PORT = "8080";

    const config = initializeConfig();

    expect(config.server.port).toBe(8080);
  });

  test("config is frozen (immutable)", () => {
    const config = initializeConfig();

    expect(() => {
      (config.server as any).port = 9999;
    }).toThrow(TypeError);
  });

  test("enforces production security — short secret", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "short";
    process.env.DB_HOST = "prod-db.example.com";

    expect(() => initializeConfig()).toThrow(/32 characters/);
  });

  test("enforces production security — localhost database", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "a-valid-production-secret-that-is-long-enough";
    process.env.DB_HOST = "localhost";

    expect(() => initializeConfig()).toThrow(/cannot use localhost/);
  });

  test("rejects invalid boolean env vars", () => {
    process.env.CACHE_ENABLED = "tru"; // Typo

    expect(() => initializeConfig()).toThrow(/Cannot convert "tru" to boolean/);
  });

  test("coerces types correctly", () => {
    process.env.PORT = "8080";
    process.env.DB_SSL = "true";
    process.env.CACHE_ENABLED = "yes";

    const config = initializeConfig();

    expect(config.server.port).toBe(8080);
    expect(typeof config.server.port).toBe("number");
    expect(config.database.ssl).toBe(true);
    expect(config.cache.enabled).toBe(true);
  });
});
```

### Test Helpers

```typescript
// test/helpers/config.ts
import { resetConfigCache } from "../../src/config/config";

/**
 * Run a test with temporary env overrides. Automatically resets afterward.
 */
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
      process.env = { ...originalEnv };
      resetConfigCache();
    }
  };
}
```

---

## Migration Guide

### Step 1: Install Dependencies and Create Directory Structure

```bash
npm install zod
mkdir -p src/config
touch src/config/{index,config,defaults,envMapping,loader,schemas,helpers}.ts
```

### Step 2: Define Schemas (Pillar 4)

Start with schemas — they define your config structure and types:

```typescript
// src/config/schemas.ts
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

### Step 3: Create Defaults (Pillar 1)

```typescript
// src/config/defaults.ts
import type { AppConfig } from "./schemas";

export const defaultConfig = {
  server: { port: 3000, nodeEnv: "development" },
} as const satisfies AppConfig;
```

### Step 4: Map Environment Variables (Pillar 2)

```typescript
// src/config/envMapping.ts
import type { EnvVarEntry } from "./envMapping";

export const envVarMapping = {
  server: {
    port: { envVar: "PORT", type: "number" },
    nodeEnv: { envVar: "NODE_ENV", type: "string" },
  },
} as const;
```

### Step 5: Implement Loader (Pillar 3)

Copy the loader from the example above. It walks `envVarMapping` automatically.

### Step 6: Set Up Config Access and Exports

Copy `config.ts`, `helpers.ts`, and `index.ts` from the examples above.

### Step 7: Update Imports

Replace direct `process.env` access throughout your codebase:

```typescript
// Before — scattered, untyped, no validation
const port = process.env.PORT || 3000;
const dbHost = process.env.DB_HOST || "localhost";

// After — centralized, typed, validated
import { config } from "./config";
const port = config.server.port;
const dbHost = config.database.host;
```

### Step 8: Generate `.env.example`

```bash
npx tsx scripts/generate-env-example.ts > .env.example
```

---

## Anti-Patterns

### 1. Direct Environment Access

```typescript
// ❌ Scattered, untyped, no validation
const dbHost = process.env.DB_HOST || "localhost";

// ✅ Centralized, typed, validated
const dbHost = config.database.host;
```

### 2. Missing Defaults

```typescript
// ❌ Crashes if env var missing
export const defaultConfig = {
  database: {
    host: process.env.DB_HOST!, // Will be undefined!
  },
};

// ✅ Always has a value
export const defaultConfig = {
  database: {
    host: "localhost", // Safe default
  },
};
```

### 3. Duplicated Env Var Names

```typescript
// ❌ Env var name in mapping AND hardcoded in loader
// envMapping.ts
export const envVarMapping = { server: { port: "PORT" } };
// loader.ts
const port = env.PORT; // Duplicated! Can drift out of sync

// ✅ Loader walks the mapping — names appear once
for (const [key, entry] of Object.entries(fields)) {
  const raw = env[entry.envVar]; // Single source of truth
}
```

### 4. Duplicated Validation

```typescript
// ❌ Validating env vars AND merged config with overlapping rules
const envSchema = z.object({ PORT: ... }).superRefine(prodRules);
const configSchema = z.object({ ... }).superRefine(prodRules); // Same rules!

// ✅ Coerce env values simply, validate once on the final merged config
const coerced = coerceValue(raw, entry.type);  // Simple type conversion
const result = AppConfigSchema.safeParse(merged); // Single validation
```

### 5. Mutable Configuration

```typescript
// ❌ Config can change at runtime
export let config = loadConfig();
config.server.port = 9999; // Mutation!

// ✅ Immutable after load — throws TypeError on write
export const config = deepFreeze(loadConfig());
config.server.port = 9999; // TypeError: Cannot assign to read only property
```

### 6. Validation After Use

```typescript
// ❌ Validation happens too late
const config = loadConfig();
doSomething(config.value); // Might be invalid!
validateConfig(config); // Too late!

// ✅ Validation before export
export function initializeConfig() {
  const config = loadConfig();
  const result = schema.safeParse(config);
  if (!result.success) throw new Error(...);
  return deepFreeze(result.data); // Guaranteed valid AND frozen
}
```

### 7. Silent Boolean Coercion

```typescript
// ❌ Silently treats unrecognized values as false — hides typos
function toBool(value: string): boolean {
  return ["true", "1", "yes"].includes(value.toLowerCase());
}
toBool("tru"); // Returns false — bug hiding in plain sight!

// ✅ Throws on unrecognized values — catches typos immediately
function toBool(value: string): boolean {
  if (TRUTHY.has(normalized)) return true;
  if (FALSY.has(normalized)) return false;
  throw new Error(`Cannot convert "${value}" to boolean`);
}
```

---

## Quick Start Template

Copy this minimal implementation to get started. All 9 improvements from v2 are included.

### `src/config/schemas.ts`

```typescript
import { z } from "zod";

export const AppConfigSchema = z.strictObject({
  server: z.strictObject({
    port: z.number().int().min(1).max(65535),
    nodeEnv: z.string(),
  }),
  // Add your config sections here
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
```

### `src/config/defaults.ts`

```typescript
import type { AppConfig } from "./schemas";

export const defaultConfig = {
  server: {
    port: 3000,
    nodeEnv: "development",
  },
} as const satisfies AppConfig;
```

### `src/config/envMapping.ts`

```typescript
export type EnvVarType = "string" | "number" | "boolean";
export interface EnvVarEntry { envVar: string; type: EnvVarType; }

export const envVarMapping = {
  server: {
    port: { envVar: "PORT", type: "number" },
    nodeEnv: { envVar: "NODE_ENV", type: "string" },
  },
} as const satisfies Record<string, Record<string, EnvVarEntry>>;
```

### `src/config/helpers.ts`

```typescript
const TRUTHY = new Set(["true", "1", "yes", "on"]);
const FALSY = new Set(["false", "0", "no", "off"]);

export function toBool(value: string | boolean | undefined): boolean | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value === "boolean") return value;
  const normalized = value.toLowerCase().trim();
  if (TRUTHY.has(normalized)) return true;
  if (FALSY.has(normalized)) return false;
  throw new Error(
    `Cannot convert "${value}" to boolean. Expected: ${[...TRUTHY, ...FALSY].join(", ")}`
  );
}
```

### `src/config/loader.ts`

```typescript
import { defaultConfig } from "./defaults";
import { envVarMapping, type EnvVarType } from "./envMapping";
import { toBool } from "./helpers";
import type { AppConfig } from "./schemas";
import { AppConfigSchema } from "./schemas";

function coerceValue(raw: string | undefined, type: EnvVarType) {
  if (raw === undefined || raw === "") return undefined;
  switch (type) {
    case "number": {
      const n = Number(raw);
      if (Number.isNaN(n)) throw new Error(`Cannot convert "${raw}" to number`);
      return n;
    }
    case "boolean": return toBool(raw);
    case "string": return raw;
  }
}

function deepFreeze<T extends object>(obj: T): Readonly<T> {
  for (const v of Object.values(obj))
    if (v && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v);
  return Object.freeze(obj);
}

export function initializeConfig(): Readonly<AppConfig> {
  const env = (typeof Bun !== "undefined" ? Bun.env : process.env) as Record<string, string | undefined>;

  // Walk the mapping to read env values
  const envValues: Record<string, Record<string, unknown>> = {};
  for (const [section, fields] of Object.entries(envVarMapping)) {
    const vals: Record<string, unknown> = {};
    let any = false;
    for (const [key, entry] of Object.entries(fields)) {
      const coerced = coerceValue(env[entry.envVar], entry.type);
      if (coerced !== undefined) { vals[key] = coerced; any = true; }
    }
    if (any) envValues[section] = vals;
  }

  // Merge defaults <- env overrides
  const merged = {} as Record<string, unknown>;
  for (const section of Object.keys(defaultConfig) as (keyof AppConfig)[]) {
    merged[section] = { ...defaultConfig[section], ...(envValues[section] || {}) };
  }

  // Single validation boundary
  const result = AppConfigSchema.safeParse(merged);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "root"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${issues}\n\nSee .env.example for reference.`);
  }

  return deepFreeze(result.data);
}
```

### `src/config/config.ts`

```typescript
import { initializeConfig } from "./loader";
import type { AppConfig } from "./schemas";

let cachedConfig: Readonly<AppConfig> | null = null;

export function getConfig(): Readonly<AppConfig> {
  if (!cachedConfig) cachedConfig = initializeConfig();
  return cachedConfig;
}

export function resetConfigCache(): void { cachedConfig = null; }

// Proxy for convenient `config.server.port` syntax.
// Limitation: Object.keys, spreading, JSON.stringify won't work. Use getConfig() for those.
export const config = new Proxy({} as Readonly<AppConfig>, {
  get(_, prop) { return getConfig()[prop as keyof AppConfig]; },
});

export const getServerConfig = () => getConfig().server;
export const getDatabaseConfig = () => getConfig().database;
export const getAuthConfig = () => getConfig().auth;

export function describeConfig(cfg?: Readonly<AppConfig>): Record<string, unknown> {
  const c = cfg ?? getConfig();
  return {
    ...c,
    auth: { ...c.auth, jwtSecret: c.auth.jwtSecret ? "[REDACTED]" : "(empty)" },
    _meta: { pattern: "4-pillar-v2", loadedAt: new Date().toISOString(), env: c.server.nodeEnv },
  };
}
```

### `src/config/index.ts`

```typescript
export { config, getConfig, resetConfigCache, describeConfig } from "./config";
export type { AppConfig } from "./schemas";
```

---

## Changelog: v1 → v2

| # | Improvement | What Changed |
|---|-------------|--------------|
| 1 | **Loader walks `envVarMapping`** | Env var names appear once — the mapping drives the loader instead of being unused documentation |
| 2 | **Single validation boundary** | Removed duplicate `envSchema`; coercion is simple, validation happens once on the merged config |
| 3 | **Removed secret obfuscation theater** | Dropped `["JWT", "SECRET"].join("_")` pattern; replaced with guidance on secrets managers |
| 4 | **Documented proxy limitations** | Added JSDoc noting `Object.keys`/spreading won't work; recommended `getConfig()` as alternative |
| 5 | **Config is deep-frozen** | `deepFreeze()` enforces immutability at runtime — accidental mutations throw TypeError |
| 6 | **`as const satisfies` on defaults** | Narrower literal types while preserving structure checking |
| 7 | **`.env.example` auto-generation** | Script generates `.env.example` from `envVarMapping` — always in sync |
| 8 | **`describeConfig()` utility** | Redacted config dump for debugging deployments without leaking secrets |
| 9 | **Strict `toBool` with error on unrecognized** | Catches typos like `"tru"` instead of silently treating them as `false` |

---

## Summary

| Pillar | File | Responsibility |
|--------|------|----------------|
| 1 | `defaults.ts` | Baseline values for all config (`as const satisfies`) |
| 2 | `envMapping.ts` | Single source of truth for env var names and types |
| 3 | `loader.ts` | Walks mapping, merges, validates once, freezes |
| 4 | `schemas.ts` | Zod validation, type inference, production security |

### Key Benefits

- **Type-safe** configuration throughout your application
- **Fail-fast** validation at startup with clear error messages
- **Self-documenting** environment variables via the mapping
- **No duplication** — env var names and validation rules each live in one place
- **Immutable** config after validation prevents runtime surprises
- **Easy testing** with cache reset and env override helpers
- **Production security** enforcement with extensible rules
- **Debug-friendly** with `describeConfig()` for redacted logging
- **`.env.example` stays in sync** via auto-generation from the mapping

---

## References

- [Zod Documentation](https://zod.dev/)
- [12-Factor App Config](https://12factor.net/config)
