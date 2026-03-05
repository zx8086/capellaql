#!/usr/bin/env bun

/* scripts/profiling/archive-profile.ts */

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";

function printUsage() {
  console.log(`
Usage: bun scripts/profiling/archive-profile.ts [options]

Options:
  --profile <path>    Path to profile file to archive (required)
  --label <label>     Label for the archive (e.g., "baseline", "pre-optimization")
  --to-baseline       Move to baselines/ instead of archive/
  --help              Show this help message

Examples:
  # Archive latest CPU profile with label
  bun run profile:archive --profile=profiles/current/CPU.*.md --label="baseline-v1.0"

  # Move to baselines for permanent storage
  bun run profile:archive --profile=profiles/current/CPU.*.md --to-baseline

  # Archive all current profiles
  bun run profile:archive --profile=profiles/current/*.md
`);
}

function getGitCommitHash(): string {
  try {
    const proc = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"]);
    if (proc.exitCode === 0) {
      return proc.stdout.toString().trim();
    }
  } catch {
    // Git not available
  }
  return "unknown";
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function expandGlob(pattern: string): string[] {
  // Simple glob expansion for *.md files
  if (!pattern.includes("*")) {
    return [pattern];
  }

  const dirPath = pattern.substring(0, pattern.lastIndexOf("/"));
  const filePattern = pattern.substring(pattern.lastIndexOf("/") + 1);

  if (!existsSync(dirPath)) {
    return [];
  }

  const files = readdirSync(dirPath);
  const regex = new RegExp(`^${filePattern.replace(/\*/g, ".*")}$`);

  return files.filter((f) => regex.test(f)).map((f) => join(dirPath, f));
}

function archiveProfile(
  sourcePath: string,
  targetDir: string,
  label?: string,
  includeCommit = true
): void {
  if (!existsSync(sourcePath)) {
    console.error(`  Error: Profile not found: ${sourcePath}`);
    return;
  }

  const stats = statSync(sourcePath);
  const fileName = basename(sourcePath);
  const commitHash = includeCommit ? getGitCommitHash() : null;

  // Build archived filename
  let archivedName = fileName;
  if (label) {
    // Insert label before file extension
    const ext = fileName.substring(fileName.lastIndexOf("."));
    const base = fileName.substring(0, fileName.lastIndexOf("."));
    archivedName = `${base}-${label}${ext}`;
  }
  if (commitHash && commitHash !== "unknown") {
    // Insert commit hash before file extension
    const ext = archivedName.substring(archivedName.lastIndexOf("."));
    const base = archivedName.substring(0, archivedName.lastIndexOf("."));
    archivedName = `${base}-${commitHash}${ext}`;
  }

  // Ensure target directory exists
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const targetPath = join(targetDir, archivedName);

  try {
    copyFileSync(sourcePath, targetPath);
    console.log(`  Archived: ${sourcePath}`);
    console.log(`        to: ${targetPath}`);
    console.log(`      size: ${formatBytes(stats.size)}`);
  } catch (error) {
    console.error(`  Error archiving ${sourcePath}:`, error);
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${bytes} B`;
}

async function main() {
  try {
    const { values } = parseArgs({
      options: {
        profile: { type: "string" },
        label: { type: "string" },
        "to-baseline": { type: "boolean" },
        help: { type: "boolean" },
      },
      strict: true,
      allowPositionals: false,
    });

    if (values.help) {
      printUsage();
      process.exit(0);
    }

    if (!values.profile) {
      console.error("Error: --profile is required");
      printUsage();
      process.exit(1);
    }

    const toBaseline = values["to-baseline"] || false;
    const label = values.label;

    console.log("=========================================");
    console.log("  Profile Archiving");
    console.log("=========================================");
    console.log("");

    // Determine target directory
    let targetDir: string;
    if (toBaseline) {
      targetDir = "profiles/baselines";
      console.log("Target: Baselines (permanent storage)");
    } else {
      const today = formatDate(new Date());
      targetDir = join("profiles/archive", today);
      console.log(`Target: Archive (${today})`);
    }

    if (label) {
      console.log(`Label: ${label}`);
    }

    const commitHash = getGitCommitHash();
    if (commitHash !== "unknown") {
      console.log(`Commit: ${commitHash}`);
    }

    console.log("");

    // Expand glob pattern and archive each file
    const profilePaths = expandGlob(values.profile);

    if (profilePaths.length === 0) {
      console.error(`No profiles found matching: ${values.profile}`);
      process.exit(1);
    }

    console.log(`Found ${profilePaths.length} profile(s) to archive:`);
    console.log("");

    for (const profilePath of profilePaths) {
      archiveProfile(profilePath, targetDir, label, !toBaseline);
      console.log("");
    }

    console.log("=========================================");
    console.log("  Archiving Complete");
    console.log("=========================================");

    process.exit(0);
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
