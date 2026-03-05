#!/usr/bin/env bun

/* scripts/profiling/analyze-profile.ts */

import { existsSync } from "node:fs";
import { dirname, normalize, resolve } from "node:path";
import { MarkdownProfileParser } from "./lib/markdown-parser";

function printUsage() {
  console.log(`
Usage: bun scripts/profiling/analyze-profile.ts <profile-file>

Arguments:
  <profile-file>  Path to CPU.*.md or Heap.*.md file

Examples:
  bun scripts/profiling/analyze-profile.ts profiles/current/CPU.*.md
  bun run profile:analyze profiles/current/CPU.230377903347.73079.md
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const profilePath = args[0];

  // Security: Validate and normalize path to prevent directory traversal attacks (CWE-22)
  const normalizedPath = normalize(profilePath);
  const resolvedPath = resolve(normalizedPath);

  // Security: Ensure path stays within project directory
  const scriptDir = dirname(new URL(import.meta.url).pathname);
  const projectRoot = resolve(scriptDir, "../..");

  if (!resolvedPath.startsWith(projectRoot)) {
    console.error("Error: Profile path must be within project directory");
    console.error(`Attempted path: ${resolvedPath}`);
    console.error(`Project root: ${projectRoot}`);
    process.exit(1);
  }

  // Security: Validate file exists within allowed directory
  if (!existsSync(resolvedPath)) {
    console.error(`Error: Profile file not found: ${resolvedPath}`);
    process.exit(1);
  }

  console.log(`\nAnalyzing profile: ${resolvedPath}\n`);

  const parser = new MarkdownProfileParser();

  try {
    // Bun generates CPU.*.md and Heap.*.md files
    if (resolvedPath.includes("CPU.") && resolvedPath.endsWith(".md")) {
      // Parse CPU profile
      const metrics = parser.parseCPUProfile(resolvedPath);
      console.log(parser.generateSummary(metrics));

      // Additional detailed output
      console.log("\nDetailed CPU Profile:");
      console.log("====================\n");
      console.log("Rank | Function | CPU % | Self Time | Total Time | Samples");
      console.log("-----|----------|-------|-----------|------------|--------");

      metrics.topFunctions.slice(0, 15).forEach((fn, index) => {
        console.log(
          `${String(index + 1).padStart(4)} | ${fn.name.padEnd(30).substring(0, 30)} | ${fn.cpuPercent.toFixed(1).padStart(5)}% | ${fn.selfTime.toFixed(2).padStart(9)}s | ${fn.totalTime.toFixed(2).padStart(10)}s | ${String(fn.samples).padStart(7)}`
        );
      });
    } else if (resolvedPath.includes("Heap.") && resolvedPath.endsWith(".md")) {
      // Parse heap profile
      const metrics = parser.parseHeapProfile(resolvedPath);
      console.log(parser.generateSummary(metrics));
    } else {
      console.error("Error: Unknown profile format. Expected CPU.*.md or Heap.*.md");
      process.exit(1);
    }

    console.log("\nAnalysis complete!\n");
    process.exit(0);
  } catch (error) {
    console.error("Error analyzing profile:", error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.main) {
  main();
}
