#!/usr/bin/env bun

/**
 * Generate .env.example from envVarMapping
 *
 * Per 4-pillar pattern: Auto-generates .env.example from the mapping,
 * ensuring documentation stays in sync with code.
 *
 * Usage:
 *   bun run scripts/generate-env-example.ts
 *   bun run generate:env
 */

import { defaultConfig } from "../src/config/defaults";
import { type EnvVarEntry, envVarMapping } from "../src/config/envMapping";

// =============================================================================
// CONFIGURATION
// =============================================================================

const OUTPUT_FILE = ".env.example";

// Environment variables that should be uncommented (required or commonly set)
const REQUIRED_VARS = new Set(["COUCHBASE_URL", "COUCHBASE_USERNAME", "COUCHBASE_PASSWORD"]);

// Environment variables that contain secrets (show placeholder instead of default)
const SECRET_VARS = new Set(["COUCHBASE_PASSWORD"]);

// =============================================================================
// HELPERS
// =============================================================================

function getTypeHint(type: EnvVarEntry["type"]): string {
  switch (type) {
    case "boolean":
      return "true|false";
    case "number":
      return "<number>";
    case "array":
      return "<comma,separated,values>";
    case "string":
    default:
      return "<string>";
  }
}

function getDefaultValue(section: string, key: string): string | undefined {
  const sectionDefaults = defaultConfig[section as keyof typeof defaultConfig];
  if (!sectionDefaults) return undefined;

  const value = (sectionDefaults as Record<string, unknown>)[key];
  if (value === undefined) return undefined;

  if (Array.isArray(value)) {
    return value.join(",");
  }

  return String(value);
}

function formatEnvVarName(name: string): string {
  // Pad to align values
  return name.padEnd(40);
}

// =============================================================================
// GENERATOR
// =============================================================================

function generateEnvExample(): string {
  const lines: string[] = [
    "# =============================================================================",
    "# CapellaQL Environment Configuration",
    "# =============================================================================",
    "#",
    "# Auto-generated from src/config/envMapping.ts",
    "# Do not edit manually - run: bun run generate:env",
    "#",
    "# Per 4-pillar pattern: This file is the single source of truth for",
    "# environment variable documentation.",
    "#",
    `# Generated: ${new Date().toISOString()}`,
    "# =============================================================================",
    "",
  ];

  for (const [section, fields] of Object.entries(envVarMapping)) {
    // Section header
    const sectionTitle = section.toUpperCase().replace(/_/g, " ");
    lines.push(`# -----------------------------------------------------------------------------`);
    lines.push(`# ${sectionTitle}`);
    lines.push(`# -----------------------------------------------------------------------------`);
    lines.push("");

    for (const [key, entry] of Object.entries(fields)) {
      const envVar = entry.envVar;
      const typeHint = getTypeHint(entry.type);
      const defaultValue = getDefaultValue(section, key);
      const isRequired = REQUIRED_VARS.has(envVar);
      const isSecret = SECRET_VARS.has(envVar);

      // Comment with key name and type
      lines.push(`# ${key} (${entry.type})`);

      // Build the env var line
      let value: string;
      if (isSecret) {
        value = "<your-secret-here>";
      } else if (defaultValue !== undefined) {
        value = defaultValue;
      } else {
        value = typeHint;
      }

      const envLine = `${formatEnvVarName(envVar)}=${value}`;

      // Required vars are uncommented, others are commented
      if (isRequired) {
        lines.push(envLine);
      } else {
        lines.push(`# ${envLine}`);
      }

      lines.push("");
    }
  }

  // Add footer with usage notes
  lines.push("# =============================================================================");
  lines.push("# USAGE NOTES");
  lines.push("# =============================================================================");
  lines.push("#");
  lines.push("# 1. Copy this file to .env:");
  lines.push("#    cp .env.example .env");
  lines.push("#");
  lines.push("# 2. Fill in required values (uncommented lines above)");
  lines.push("#");
  lines.push("# 3. Uncomment and modify optional values as needed");
  lines.push("#");
  lines.push("# 4. For production, ensure:");
  lines.push("#    - COUCHBASE_PASSWORD is not 'password'");
  lines.push("#    - COUCHBASE_URL points to production cluster");
  lines.push("#    - NODE_ENV=production");
  lines.push("#    - DEPLOYMENT_ENVIRONMENT=production");
  lines.push("#");
  lines.push("# =============================================================================");

  return lines.join("\n");
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const content = generateEnvExample();

  // Write to file
  await Bun.write(OUTPUT_FILE, content);

  // Count stats
  let totalVars = 0;
  let requiredVars = 0;

  for (const fields of Object.values(envVarMapping)) {
    for (const entry of Object.values(fields)) {
      totalVars++;
      if (REQUIRED_VARS.has(entry.envVar)) {
        requiredVars++;
      }
    }
  }

  console.log(`Generated ${OUTPUT_FILE}`);
  console.log(`   Total env vars: ${totalVars}`);
  console.log(`   Required: ${requiredVars}`);
  console.log(`   Optional: ${totalVars - requiredVars}`);
}

main().catch((error) => {
  console.error("Failed to generate .env.example:", error);
  process.exit(1);
});
