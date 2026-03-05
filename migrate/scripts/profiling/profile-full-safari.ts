#!/usr/bin/env bun

/* scripts/profiling/profile-full-safari.ts
 *
 * Run full profiling (CPU + Heap markdown) with Safari WebKit JSON heap snapshot.
 * This script captures the heap snapshot from the running server process.
 *
 * Usage:
 *   bun scripts/profiling/profile-full-safari.ts
 *   bun run profile:full:safari
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { generateHeapSnapshot, type Subprocess, spawn } from "bun";

const OUTPUT_DIR = "profiles";
const SERVER_SCRIPT = "src/index.ts";

interface SafariTimelineFormat {
  version: number;
  recording: {
    displayName: string;
    discontinuities: unknown[];
    instrumentTypes: string[];
    records: Array<{
      type: string;
      title: string;
      snapshotStringData: string;
    }>;
    markers: unknown[];
    memoryPressureEvents: unknown[];
    sampleStackTraces: unknown[];
    sampleDurations: unknown[];
  };
  overview: Record<string, unknown>;
}

async function waitForServer(maxAttempts = 30, intervalMs = 1000): Promise<boolean> {
  console.log("Waiting for server to be ready...");
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch("http://localhost:3000/health/ready");
      if (response.ok) {
        console.log("Server is ready!");
        return true;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

async function generateSafariSnapshot(): Promise<string> {
  const timestamp = Date.now();
  const filename = `heap-safari-${timestamp}.json`;
  const outputPath = join(OUTPUT_DIR, filename);

  console.log("Generating Safari WebKit heap snapshot...");
  const snapshot = generateHeapSnapshot();

  const safariFormat: SafariTimelineFormat = {
    version: 1,
    recording: {
      displayName: "Bun Full Profile Heap Snapshot",
      discontinuities: [],
      instrumentTypes: ["timeline-record-type-heap-allocations"],
      records: [
        {
          type: "timeline-record-type-heap-allocations",
          title: `Snapshot ${new Date().toISOString()}`,
          snapshotStringData: JSON.stringify(snapshot),
        },
      ],
      markers: [],
      memoryPressureEvents: [],
      sampleStackTraces: [],
      sampleDurations: [],
    },
    overview: {},
  };

  await Bun.write(outputPath, JSON.stringify(safariFormat, null, 2));
  return outputPath;
}

async function main() {
  console.log(`
=========================================
  Full Profile with Safari Heap Snapshot
=========================================
`);

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Build profiling args
  const args = [
    "--cpu-prof",
    "--cpu-prof-md",
    "--heap-prof-md",
    `--cpu-prof-dir=./${OUTPUT_DIR}`,
    `--heap-prof-dir=./${OUTPUT_DIR}`,
    SERVER_SCRIPT,
  ];

  console.log(`Starting server with profiling: bun ${args.join(" ")}`);

  // Start server with profiling
  const server: Subprocess = spawn({
    cmd: ["bun", ...args],
    stdout: "inherit",
    stderr: "inherit",
  });

  const serverPid = server.pid;
  console.log(`Server started with PID: ${serverPid}`);

  // Wait for server to be ready
  const ready = await waitForServer();
  if (!ready) {
    console.error("Server failed to start within timeout");
    server.kill("SIGTERM");
    process.exit(1);
  }

  // Let server run until user cancels
  console.log("\nProfiled server is running. Press Ctrl+C to stop and generate profiles...\n");

  // Handle Ctrl+C - generate Safari snapshot before shutdown
  process.on("SIGINT", async () => {
    console.log("\n\nCapturing Safari heap snapshot before shutdown...");

    // Generate Safari heap snapshot
    const safariPath = await generateSafariSnapshot();
    console.log(`Safari heap snapshot saved: ${safariPath}`);

    console.log("Shutting down server...");
    server.kill("SIGTERM");
  });

  // Wait for server to exit
  await server.exited;

  // Wait for profile files to be written
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // List generated files
  console.log("\n=========================================");
  console.log("  Profiling Complete!");
  console.log("=========================================\n");

  const { readdirSync } = await import("node:fs");
  const files = readdirSync(OUTPUT_DIR)
    .filter((f) => f.endsWith(".md") || f.endsWith(".cpuprofile") || f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, 10);

  console.log("Generated profiles:");
  for (const file of files) {
    console.log(`  ${OUTPUT_DIR}/${file}`);
  }

  // Find the Safari snapshot
  const safariFile = files.find((f) => f.startsWith("heap-safari-") && f.endsWith(".json"));
  if (safariFile) {
    console.log(`
Safari heap snapshot: ${OUTPUT_DIR}/${safariFile}
To view: Safari Developer Tools -> Timeline -> JavaScript Allocations -> Import
`);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
