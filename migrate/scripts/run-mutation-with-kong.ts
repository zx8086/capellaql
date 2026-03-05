#!/usr/bin/env bun
// scripts/run-mutation-with-kong.ts

import { spawn, spawnSync } from "bun";

const KONG_ADMIN_URL = "http://localhost:8101";
const MAX_RETRIES = 60; // 60 seconds max wait
const RETRY_INTERVAL = 1000; // 1 second between retries

const args = process.argv.slice(2);
const keepRunning = args.includes("--keep-running");
const freshRun = args.includes("--fresh");

function log(message: string): void {
  const timestamp = new Date().toISOString().substring(11, 19);
  console.log(`[${timestamp}] ${message}`);
}

function logError(message: string): void {
  const timestamp = new Date().toISOString().substring(11, 19);
  console.error(`[${timestamp}] ERROR: ${message}`);
}

async function isKongReady(): Promise<boolean> {
  try {
    const response = await fetch(`${KONG_ADMIN_URL}/status`, {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const status = await response.json();
      return status?.database?.reachable === true;
    }
    return false;
  } catch {
    return false;
  }
}

async function waitForKong(): Promise<boolean> {
  log("Waiting for Kong to be ready...");

  for (let i = 0; i < MAX_RETRIES; i++) {
    if (await isKongReady()) {
      log("Kong is ready!");
      return true;
    }
    process.stdout.write(".");
    await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL));
  }

  console.log(); // New line after dots
  logError("Kong did not become ready in time");
  return false;
}

function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string> } = {}
): { success: boolean; output: string } {
  const result = spawnSync([command, ...args], {
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, ...options.env },
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = result.stdout?.toString() || "";
  const stderr = result.stderr?.toString() || "";

  return {
    success: result.exitCode === 0,
    output: stdout + stderr,
  };
}

async function startKong(): Promise<boolean> {
  log("Starting Docker Kong environment...");

  const result = runCommand("docker", ["compose", "-f", "docker-compose.test.yml", "up", "-d"]);

  if (!result.success) {
    logError(`Failed to start Docker Kong: ${result.output}`);
    return false;
  }

  log("Docker containers starting...");
  return true;
}

async function stopKong(): Promise<void> {
  log("Stopping Docker Kong environment...");

  runCommand("docker", ["compose", "-f", "docker-compose.test.yml", "down"]);

  log("Docker Kong stopped");
}

async function seedConsumers(): Promise<boolean> {
  log("Seeding test consumers...");

  // Wait a bit for Kong to be fully ready for seeding
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const result = runCommand("bun", ["scripts/seed-test-consumers.ts"], {
    env: { KONG_ADMIN_URL },
  });

  if (!result.success) {
    logError(`Failed to seed consumers: ${result.output}`);
    return false;
  }

  log("Test consumers seeded successfully");
  return true;
}

async function runMutationTests(): Promise<{ success: boolean; score: string }> {
  log("Running mutation tests with Docker Kong...");

  // Clear incremental cache if fresh run requested
  if (freshRun) {
    log("Clearing incremental mutation cache...");
    runCommand("rm", ["-f", "test/results/mutation/stryker-incremental.json"]);
  }

  // Create results directory
  runCommand("mkdir", ["-p", "test/results/mutation"]);

  // Run Stryker with integration tests enabled
  const strykerProcess = spawn(["bunx", "stryker", "run"], {
    env: {
      ...process.env,
      INTEGRATION_KONG_ADMIN_URL: KONG_ADMIN_URL,
    },
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await strykerProcess.exited;

  // Try to extract score from the JSON report
  let score = "unknown";
  try {
    const reportPath = "test/results/mutation/mutation-report.json";
    const report = await Bun.file(reportPath).json();
    if (report?.thresholds?.high !== undefined) {
      const killed = report.files
        ? Object.values(report.files).reduce(
            (acc: number, f: { mutants?: { status: string }[] }) =>
              acc +
              (f.mutants?.filter((m: { status: string }) => m.status === "Killed").length || 0),
            0
          )
        : 0;
      const total = report.files
        ? Object.values(report.files).reduce(
            (acc: number, f: { mutants?: unknown[] }) => acc + (f.mutants?.length || 0),
            0
          )
        : 0;
      if (total > 0) {
        score = `${((killed / total) * 100).toFixed(2)}%`;
      }
    }
  } catch {
    // Ignore score extraction errors
  }

  return {
    success: exitCode === 0,
    score,
  };
}

async function checkKongAlreadyRunning(): Promise<boolean> {
  return await isKongReady();
}

async function main(): Promise<void> {
  console.log("\n=== Mutation Testing with Docker Kong ===\n");

  const startTime = Date.now();
  let kongWasAlreadyRunning = false;

  try {
    // Check if Kong is already running
    kongWasAlreadyRunning = await checkKongAlreadyRunning();

    if (kongWasAlreadyRunning) {
      log("Kong is already running, using existing instance");
    } else {
      // Start Docker Kong
      const started = await startKong();
      if (!started) {
        process.exit(1);
      }

      // Wait for Kong to be ready
      const ready = await waitForKong();
      if (!ready) {
        await stopKong();
        process.exit(1);
      }

      // Seed test consumers
      const seeded = await seedConsumers();
      if (!seeded) {
        await stopKong();
        process.exit(1);
      }
    }

    // Run mutation tests
    const result = await runMutationTests();

    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    console.log("\n=== Mutation Testing Complete ===\n");
    log(`Duration: ${duration} minutes`);
    log(`Mutation Score: ${result.score}`);
    log(`Exit Code: ${result.success ? 0 : 1}`);
    log(`Report: test/results/mutation/mutation-report.html`);

    // Cleanup unless keepRunning or Kong was already running
    if (!keepRunning && !kongWasAlreadyRunning) {
      await stopKong();
    } else if (keepRunning) {
      log("Kong left running (--keep-running flag)");
    }

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    logError(`Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`);

    // Cleanup on error
    if (!kongWasAlreadyRunning && !keepRunning) {
      await stopKong();
    }

    process.exit(1);
  }
}

main();
