#!/usr/bin/env bun

/* scripts/profiling/heap-snapshot-safari.ts
 *
 * Generate Safari WebKit-compatible JSON heap snapshots using Bun's native API.
 * These snapshots can be imported into Safari Developer Tools:
 *   Developer Tools -> Timeline -> JavaScript Allocations -> Import
 *
 * Usage:
 *   bun scripts/profiling/heap-snapshot-safari.ts [options]
 *
 * Options:
 *   --output-dir <path>   Output directory (default: profiles)
 *   --filename <name>     Custom filename (default: heap-safari-<timestamp>.json)
 *   --scenario <type>     Run scenario before snapshot: tokens, health, validate, mixed
 *   --wait <seconds>      Wait time before taking snapshot (default: 5s)
 *   --help                Show help
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { parseArgs } from "node:util";
import { generateHeapSnapshot } from "bun";
import { ScenarioGenerator, type ScenarioType } from "./lib/scenario-generator";

interface CliOptions {
  outputDir: string;
  filename?: string;
  scenario?: ScenarioType;
  wait: number;
}

/**
 * Validate output path to prevent path traversal attacks (CWE-22)
 */
function validateOutputPath(outputPath: string): string {
  const normalizedPath = normalize(outputPath);
  const resolvedPath = resolve(normalizedPath);

  const scriptDir = dirname(new URL(import.meta.url).pathname);
  const projectRoot = resolve(scriptDir, "../..");

  if (!resolvedPath.startsWith(projectRoot)) {
    throw new Error(
      `Security: Output path must be within project directory.\nAttempted: ${resolvedPath}\nProject root: ${projectRoot}`
    );
  }

  return resolvedPath;
}

function printUsage() {
  console.log(`
Usage: bun scripts/profiling/heap-snapshot-safari.ts [options]

Generate Safari WebKit-compatible JSON heap snapshots.

Options:
  --output-dir <path>   Output directory (default: profiles)
  --filename <name>     Custom filename (default: heap-safari-<timestamp>.json)
  --scenario <type>     Run scenario before snapshot: tokens, health, validate, mixed
  --wait <seconds>      Wait time before taking snapshot (default: 5)
  --help                Show this help message

Output:
  JSON file compatible with Safari Developer Tools
  Import via: Developer Tools -> Timeline -> JavaScript Allocations -> Import

Examples:
  # Basic heap snapshot of current process
  bun scripts/profiling/heap-snapshot-safari.ts

  # Snapshot after running tokens scenario
  bun scripts/profiling/heap-snapshot-safari.ts --scenario=tokens

  # Custom output location
  bun scripts/profiling/heap-snapshot-safari.ts --output-dir=profiles/safari --filename=memory-leak.json
`);
}

/**
 * Safari Timeline requires a specific wrapper format around the raw heap snapshot.
 * Reference: https://github.com/oven-sh/bun/issues/13345
 */
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

async function generateSafariHeapSnapshot(options: CliOptions): Promise<string> {
  // Ensure output directory exists
  const outputDir = validateOutputPath(options.outputDir);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Generate filename with timestamp
  const timestamp = Date.now();
  const filename = options.filename || `heap-safari-${timestamp}.json`;
  const outputPath = join(outputDir, filename);

  console.log("Generating Safari WebKit heap snapshot...");

  // Generate the heap snapshot using Bun's native API
  const snapshot = generateHeapSnapshot();

  // Wrap in Safari Timeline-compatible format
  // Safari's Timeline > JavaScript Allocations requires this specific structure
  const safariFormat: SafariTimelineFormat = {
    version: 1,
    recording: {
      displayName: "Bun Heap Snapshot",
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

  // Write to file with pretty formatting for readability
  await Bun.write(outputPath, JSON.stringify(safariFormat, null, 2));

  return outputPath;
}

async function main() {
  try {
    const { values } = parseArgs({
      options: {
        "output-dir": { type: "string" },
        filename: { type: "string" },
        scenario: { type: "string" },
        wait: { type: "string" },
        help: { type: "boolean" },
      },
      strict: true,
      allowPositionals: false,
    });

    if (values.help) {
      printUsage();
      process.exit(0);
    }

    const options: CliOptions = {
      outputDir: values["output-dir"] || "profiles",
      filename: values.filename,
      scenario: values.scenario as ScenarioType | undefined,
      wait: values.wait ? Number.parseInt(values.wait, 10) : 5,
    };

    // Validate scenario if provided
    if (options.scenario) {
      const validScenarios: ScenarioType[] = ["tokens", "health", "validate", "mixed"];
      if (!validScenarios.includes(options.scenario)) {
        console.error(
          `Error: Invalid scenario "${options.scenario}". Must be one of: ${validScenarios.join(", ")}`
        );
        process.exit(1);
      }
    }

    console.log(`
=========================================
  Safari WebKit Heap Snapshot Generator
=========================================
`);

    // Run scenario if specified
    if (options.scenario) {
      console.log(`Running ${options.scenario} scenario to generate memory activity...`);
      const scenarioGen = new ScenarioGenerator();
      const result = await scenarioGen.runScenario(options.scenario);
      console.log(scenarioGen.formatResult(result));
    }

    // Wait before taking snapshot
    if (options.wait > 0) {
      console.log(`Waiting ${options.wait}s before taking snapshot...`);
      await new Promise((resolve) => setTimeout(resolve, options.wait * 1000));
    }

    // Generate snapshot
    const outputPath = await generateSafariHeapSnapshot(options);

    console.log(`
=========================================
  Heap Snapshot Generated Successfully
=========================================

Output: ${outputPath}
Size: ${((await Bun.file(outputPath).size) / 1024 / 1024).toFixed(2)} MB

To view in Safari:
  1. Open Safari Developer Tools (Cmd + Option + I)
  2. Go to Timeline tab
  3. Click on JavaScript Allocations
  4. Click Import and select the JSON file

Or use the WebKit Inspector standalone app.
`);

    process.exit(0);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.main) {
  main();
}
