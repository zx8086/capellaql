#!/usr/bin/env bun
/**
 * Platform QA Compliance Checker
 *
 * Validates project structure against the Platform QA Components Application Contract.
 * Run this before pushing to GitLab to catch compliance issues locally.
 *
 * Usage:
 *   bun run scripts/check-platform-compliance.ts
 *   bun run check:platform
 *
 * @see https://gitlab.com/platform_engineering/platform-components/quality-assurance-runner
 */

import { existsSync, readdirSync } from "fs";
import { resolve } from "path";

interface CheckResult {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  fix?: string;
}

const K6_PROFILES = ["smoke", "load", "stress", "spike", "soak"] as const;

// ANSI color codes
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

function printBanner(): void {
  console.log(`
${colors.bold}Platform QA Compliance Check v1.1.0${colors.reset}
${"━".repeat(50)}
`);
}

function printSection(title: string): void {
  console.log(`\n${colors.cyan}${colors.bold}▸ ${title}${colors.reset}`);
}

function printResult(result: CheckResult): void {
  const icon = result.status === "pass" ? "✓" : result.status === "fail" ? "✗" : "⚠";
  const color =
    result.status === "pass"
      ? colors.green
      : result.status === "fail"
        ? colors.red
        : colors.yellow;

  console.log(`  ${color}[${icon}]${colors.reset} ${result.name}: ${result.message}`);
  if (result.fix) {
    console.log(`      → ${result.fix}`);
  }
}

// ============================================================================
// Directory Structure Checks
// ============================================================================

function checkTestsDirectory(): CheckResult {
  const testsDir = resolve(process.cwd(), "tests");
  const legacyDir = resolve(process.cwd(), "test");

  // Check for legacy test/ directory (singular)
  if (!existsSync(testsDir) && existsSync(legacyDir)) {
    return {
      name: "Test directory naming",
      status: "fail",
      message: `Found legacy 'test/' - platform requires 'tests/' (plural)`,
      fix: `mv test tests`,
    };
  }

  if (!existsSync(testsDir)) {
    return {
      name: "Test directory",
      status: "fail",
      message: `Test directory not found at tests/`,
      fix: `mkdir -p tests`,
    };
  }

  return {
    name: "Test directory",
    status: "pass",
    message: `Found at tests/ (plural convention)`,
  };
}

function checkBunTestDirectory(): CheckResult {
  const bunDir = resolve(process.cwd(), "tests/bun");
  const legacyDir = resolve(process.cwd(), "test/bun");

  if (!existsSync(bunDir) && existsSync(legacyDir)) {
    return {
      name: "Bun test directory",
      status: "fail",
      message: `Found legacy 'test/bun/' - move to 'tests/bun/'`,
      fix: `mv test/bun tests/bun`,
    };
  }

  if (!existsSync(bunDir)) {
    return {
      name: "Bun test directory",
      status: "warn",
      message: `tests/bun/ not found (skip if not using Bun tests)`,
    };
  }

  return {
    name: "Bun test directory",
    status: "pass",
    message: `Found at tests/bun/`,
  };
}

function checkPlaywrightTestDirectory(): CheckResult {
  const playwrightDir = resolve(process.cwd(), "tests/playwright");
  const legacyDir = resolve(process.cwd(), "test/playwright");

  if (!existsSync(playwrightDir) && existsSync(legacyDir)) {
    return {
      name: "Playwright test directory",
      status: "fail",
      message: `Found legacy 'test/playwright/' - move to 'tests/playwright/'`,
      fix: `mv test/playwright tests/playwright`,
    };
  }

  if (!existsSync(playwrightDir)) {
    return {
      name: "Playwright test directory",
      status: "warn",
      message: `tests/playwright/ not found (skip if not using Playwright)`,
    };
  }

  return {
    name: "Playwright test directory",
    status: "pass",
    message: `Found at tests/playwright/`,
  };
}

function checkK6TestDirectory(): CheckResult {
  const k6Dir = resolve(process.cwd(), "tests/k6");
  const legacyDir = resolve(process.cwd(), "test/k6");

  if (!existsSync(k6Dir) && existsSync(legacyDir)) {
    return {
      name: "K6 test directory",
      status: "fail",
      message: `Found legacy 'test/k6/' - move to 'tests/k6/'`,
      fix: `mv test/k6 tests/k6`,
    };
  }

  if (!existsSync(k6Dir)) {
    return {
      name: "K6 test directory",
      status: "fail",
      message: `K6 test directory not found at tests/k6/`,
      fix: `mkdir -p tests/k6`,
    };
  }

  return {
    name: "K6 test directory",
    status: "pass",
    message: `Found at tests/k6/`,
  };
}

// ============================================================================
// Server Checks
// ============================================================================

async function checkHealthEndpoint(port: number): Promise<CheckResult> {
  try {
    const response = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return {
      name: "Health endpoint",
      status: response.status === 200 ? "pass" : "fail",
      message:
        response.status === 200
          ? `/health returns ${response.status}`
          : `/health returns ${response.status}, expected 200`,
    };
  } catch {
    return {
      name: "Health endpoint",
      status: "warn",
      message: "Server not running - cannot verify health endpoint",
      fix: "Start your server and re-run this check",
    };
  }
}

async function checkServerBinding(): Promise<CheckResult> {
  const configFiles = [
    "src/index.ts",
    "src/server.ts",
    "src/config/modules/deployment.ts",
    "src/config/defaults.ts",
  ];

  for (const file of configFiles) {
    const filePath = resolve(process.cwd(), file);
    if (existsSync(filePath)) {
      try {
        const content = await Bun.file(filePath).text();
        if (
          content.includes('"0.0.0.0"') ||
          content.includes("'0.0.0.0'") ||
          content.includes("HOSTNAME: \"0.0.0.0\"")
        ) {
          return {
            name: "Server binding",
            status: "pass",
            message: `Server configured to bind to 0.0.0.0 (${file})`,
          };
        }
      } catch {
        continue;
      }
    }
  }

  return {
    name: "Server binding",
    status: "warn",
    message: "Could not verify server binding configuration",
    fix: "Ensure server binds to 0.0.0.0, not localhost or 127.0.0.1",
  };
}

// ============================================================================
// K6 Checks
// ============================================================================

function checkK6EntryPoints(): CheckResult[] {
  const results: CheckResult[] = [];
  const baseDir = resolve(process.cwd(), "tests/k6");

  for (const profile of K6_PROFILES) {
    const dirPath = resolve(baseDir, profile);
    const indexPath = resolve(dirPath, "index.ts");
    const indexJsPath = resolve(dirPath, "index.js");

    if (!existsSync(dirPath)) {
      results.push({
        name: `K6 ${profile} profile`,
        status: "fail",
        message: `${profile}/ directory NOT FOUND`,
        fix: `mkdir -p tests/k6/${profile}`,
      });
    } else if (!existsSync(indexPath) && !existsSync(indexJsPath)) {
      results.push({
        name: `K6 ${profile} entry point`,
        status: "fail",
        message: `${profile}/index.ts NOT FOUND`,
        fix: `Create tests/k6/${profile}/index.ts with: export { options, default } from './<your-test>';`,
      });
    } else {
      results.push({
        name: `K6 ${profile} entry point`,
        status: "pass",
        message: `${profile}/index.ts exists`,
      });
    }
  }

  return results;
}

async function checkK6BaseUrlUsage(): Promise<CheckResult> {
  const configPath = resolve(process.cwd(), "tests/k6/utils/config.ts");
  const altConfigPath = resolve(process.cwd(), "tests/k6/utils/config.js");
  const path = existsSync(configPath) ? configPath : existsSync(altConfigPath) ? altConfigPath : null;

  if (!path) {
    return {
      name: "K6 config utility",
      status: "warn",
      message: "No K6 config utility found at tests/k6/utils/config.ts",
      fix: "Create a config utility that reads BASE_URL from __ENV",
    };
  }

  try {
    const content = await Bun.file(path).text();

    if (content.includes("__ENV.BASE_URL") || content.includes("__ENV.TARGET_URL")) {
      return {
        name: "K6 BASE_URL support",
        status: "pass",
        message: "K6 config supports BASE_URL/TARGET_URL environment variables",
      };
    }

    return {
      name: "K6 BASE_URL support",
      status: "warn",
      message: "K6 config may not support platform-injected BASE_URL",
      fix: "Update config to: const baseUrl = __ENV.BASE_URL || __ENV.TARGET_URL || `http://${__ENV.HOST}:${__ENV.PORT}`",
    };
  } catch {
    return {
      name: "K6 config utility",
      status: "warn",
      message: "Could not read K6 config file",
    };
  }
}

async function checkK6DynamicParameters(): Promise<CheckResult> {
  const stressDir = resolve(process.cwd(), "tests/k6/stress");

  if (!existsSync(stressDir)) {
    return {
      name: "K6 dynamic parameters",
      status: "warn",
      message: "No stress directory found - skipping dynamic parameter check",
    };
  }

  const files = readdirSync(stressDir).filter((f) => f.endsWith(".ts"));

  for (const file of files) {
    const filePath = resolve(stressDir, file);
    try {
      const content = await Bun.file(filePath).text();

      if (content.includes("__ENV.PEAK_VUS") || content.includes("getStressConfig")) {
        return {
          name: "K6 dynamic parameters",
          status: "pass",
          message: "Stress tests support PEAK_VUS/RAMP_UP/SUSTAIN environment variables",
        };
      }
    } catch {
      continue;
    }
  }

  return {
    name: "K6 dynamic parameters",
    status: "warn",
    message: "Stress tests may have hardcoded VU counts",
    fix: "Use getStressConfig() or read __ENV.PEAK_VUS for dynamic VU configuration",
  };
}

// ============================================================================
// Playwright Checks
// ============================================================================

async function checkPlaywrightConfig(): Promise<CheckResult> {
  const configPath = resolve(process.cwd(), "playwright.config.ts");

  if (!existsSync(configPath)) {
    return {
      name: "Playwright config",
      status: "warn",
      message: "playwright.config.ts not found (skip if not using Playwright)",
    };
  }

  try {
    const content = await Bun.file(configPath).text();

    if (
      content.includes("process.env.BASE_URL") ||
      content.includes("process.env.API_BASE_URL")
    ) {
      return {
        name: "Playwright BASE_URL",
        status: "pass",
        message: "Playwright config reads BASE_URL from environment",
      };
    }

    if (content.includes("baseURL:") && !content.includes("process.env")) {
      return {
        name: "Playwright BASE_URL",
        status: "fail",
        message: "Playwright config has hardcoded baseURL",
        fix: "Update baseURL to: process.env.BASE_URL || 'http://localhost:4000'",
      };
    }

    return {
      name: "Playwright BASE_URL",
      status: "warn",
      message: "Could not determine if Playwright config reads BASE_URL from environment",
    };
  } catch {
    return {
      name: "Playwright config",
      status: "warn",
      message: "Could not read playwright.config.ts",
    };
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  printBanner();

  const results: CheckResult[] = [];
  const port = parseInt(process.env.PORT || "4000", 10);

  console.log(`Checking against port ${port}...`);

  // Directory Structure
  printSection("Directory Structure");
  results.push(checkTestsDirectory());
  results.push(checkBunTestDirectory());
  results.push(checkPlaywrightTestDirectory());
  results.push(checkK6TestDirectory());

  for (const result of results) {
    printResult(result);
  }

  // Server Checks
  printSection("Server Configuration");
  const serverResults: CheckResult[] = [];
  serverResults.push(await checkHealthEndpoint(port));
  serverResults.push(await checkServerBinding());

  for (const result of serverResults) {
    printResult(result);
  }
  results.push(...serverResults);

  // K6 Checks
  printSection("K6 Performance Tests");
  const k6Results: CheckResult[] = [];
  k6Results.push(...checkK6EntryPoints());
  k6Results.push(await checkK6BaseUrlUsage());
  k6Results.push(await checkK6DynamicParameters());

  for (const result of k6Results) {
    printResult(result);
  }
  results.push(...k6Results);

  // Playwright Checks
  printSection("Playwright E2E Tests");
  const playwrightResults: CheckResult[] = [];
  playwrightResults.push(await checkPlaywrightConfig());

  for (const result of playwrightResults) {
    printResult(result);
  }
  results.push(...playwrightResults);

  // Summary
  let passed = 0;
  let failed = 0;
  let warned = 0;

  for (const result of results) {
    if (result.status === "pass") passed++;
    else if (result.status === "fail") failed++;
    else warned++;
  }

  console.log(`
${"─".repeat(50)}
${colors.bold}Summary:${colors.reset} ${colors.green}${passed} passed${colors.reset}, ${colors.red}${failed} failed${colors.reset}, ${colors.yellow}${warned} warnings${colors.reset}
`);

  if (failed > 0) {
    console.log(
      `${colors.red}Compliance check failed.${colors.reset} Fix the issues above before using platform QA components.\n`
    );
    process.exit(1);
  } else if (warned > 0) {
    console.log(
      `${colors.yellow}Compliance check passed with warnings.${colors.reset} Review warnings above.\n`
    );
  } else {
    console.log(
      `${colors.green}All compliance checks passed!${colors.reset} Ready for platform QA components.\n`
    );
  }
}

main();
