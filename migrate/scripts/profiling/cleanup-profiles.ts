#!/usr/bin/env bun

/* scripts/profiling/cleanup-profiles.ts */

import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

interface CleanupStats {
  filesDeleted: number;
  spaceFreed: number; // bytes
  oldestFileAge: number; // hours
  quotaExceeded: boolean;
}

interface CleanupOptions {
  dryRun: boolean;
  currentMaxAge: number; // hours
  archiveMaxAge: number; // days
  maxQuota: number; // bytes (1GB default)
}

function printUsage() {
  console.log(`
Usage: bun scripts/profiling/cleanup-profiles.ts [options]

Options:
  --dry-run              Show what would be deleted without actually deleting
  --current-max-age <h>  Max age for profiles in current/ (default: 24 hours)
  --archive-max-age <d>  Max age for profiles in archive/ (default: 7 days)
  --max-quota <gb>       Max storage quota in GB (default: 1)
  --help                 Show this help message

Examples:
  bun scripts/profiling/cleanup-profiles.ts --dry-run
  bun scripts/profiling/cleanup-profiles.ts
  bun scripts/profiling/cleanup-profiles.ts --current-max-age=48
`);
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${bytes} B`;
}

function getDirectorySize(dirPath: string): number {
  if (!existsSync(dirPath)) {
    return 0;
  }

  let totalSize = 0;
  try {
    const files = readdirSync(dirPath, { recursive: true, withFileTypes: true });
    for (const file of files) {
      if (file.isFile()) {
        const filePath = join(file.path, file.name);
        try {
          const stats = statSync(filePath);
          totalSize += stats.size;
        } catch {
          // Skip files we can't stat
        }
      }
    }
  } catch {
    // Skip directories we can't read
  }
  return totalSize;
}

function cleanupDirectory(
  dirPath: string,
  maxAgeMs: number,
  options: CleanupOptions
): { deleted: number; freed: number } {
  if (!existsSync(dirPath)) {
    return { deleted: 0, freed: 0 };
  }

  let deletedCount = 0;
  let freedBytes = 0;
  const now = Date.now();

  try {
    const files = readdirSync(dirPath, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile()) continue;
      if (file.name === ".gitkeep") continue;

      const filePath = join(dirPath, file.name);
      try {
        const stats = statSync(filePath);
        const ageMs = now - stats.mtimeMs;

        if (ageMs > maxAgeMs) {
          if (options.dryRun) {
            console.log(
              `  [DRY RUN] Would delete: ${filePath} (age: ${(ageMs / (1000 * 60 * 60)).toFixed(1)}h, size: ${formatBytes(stats.size)})`
            );
          } else {
            console.log(
              `  Deleting: ${filePath} (age: ${(ageMs / (1000 * 60 * 60)).toFixed(1)}h, size: ${formatBytes(stats.size)})`
            );
            rmSync(filePath);
          }
          deletedCount++;
          freedBytes += stats.size;
        }
      } catch (error) {
        console.error(`  Error processing ${filePath}:`, error);
      }
    }
  } catch (error) {
    console.error(`  Error reading directory ${dirPath}:`, error);
  }

  return { deleted: deletedCount, freed: freedBytes };
}

function cleanupArchiveDirectories(
  archiveRoot: string,
  maxAgeMs: number,
  options: CleanupOptions
): { deleted: number; freed: number } {
  if (!existsSync(archiveRoot)) {
    return { deleted: 0, freed: 0 };
  }

  let totalDeleted = 0;
  let totalFreed = 0;
  const now = Date.now();

  try {
    const entries = readdirSync(archiveRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === ".gitkeep") continue;

      const dirPath = join(archiveRoot, entry.name);
      try {
        const stats = statSync(dirPath);
        const ageMs = now - stats.mtimeMs;

        if (ageMs > maxAgeMs) {
          const dirSize = getDirectorySize(dirPath);
          if (options.dryRun) {
            console.log(
              `  [DRY RUN] Would delete directory: ${dirPath} (age: ${(ageMs / (1000 * 60 * 60 * 24)).toFixed(1)}d, size: ${formatBytes(dirSize)})`
            );
          } else {
            console.log(
              `  Deleting directory: ${dirPath} (age: ${(ageMs / (1000 * 60 * 60 * 24)).toFixed(1)}d, size: ${formatBytes(dirSize)})`
            );
            rmSync(dirPath, { recursive: true });
          }
          totalDeleted++;
          totalFreed += dirSize;
        } else {
          // Clean up individual files within the directory
          const result = cleanupDirectory(dirPath, maxAgeMs, options);
          totalDeleted += result.deleted;
          totalFreed += result.freed;
        }
      } catch (error) {
        console.error(`  Error processing ${dirPath}:`, error);
      }
    }
  } catch (error) {
    console.error(`  Error reading archive directory:`, error);
  }

  return { deleted: totalDeleted, freed: totalFreed };
}

async function main() {
  try {
    const { values } = parseArgs({
      options: {
        "dry-run": { type: "boolean" },
        "current-max-age": { type: "string" },
        "archive-max-age": { type: "string" },
        "max-quota": { type: "string" },
        help: { type: "boolean" },
      },
      strict: true,
      allowPositionals: false,
    });

    if (values.help) {
      printUsage();
      process.exit(0);
    }

    const options: CleanupOptions = {
      dryRun: values["dry-run"] || false,
      currentMaxAge: values["current-max-age"]
        ? Number.parseInt(values["current-max-age"], 10)
        : 24,
      archiveMaxAge: values["archive-max-age"] ? Number.parseInt(values["archive-max-age"], 10) : 7,
      maxQuota: values["max-quota"]
        ? Number.parseFloat(values["max-quota"]) * 1024 * 1024 * 1024
        : 1024 * 1024 * 1024, // 1GB default
    };

    console.log("=========================================");
    console.log("  Profile Cleanup");
    console.log("=========================================");
    if (options.dryRun) {
      console.log("  MODE: DRY RUN (no files will be deleted)");
    }
    console.log("");

    // Calculate current storage usage
    const currentSize = getDirectorySize("profiles/current");
    const archiveSize = getDirectorySize("profiles/archive");
    const baselineSize = getDirectorySize("profiles/baselines");
    const totalSize = currentSize + archiveSize + baselineSize;

    console.log("Current Storage Usage:");
    console.log(`  Current:   ${formatBytes(currentSize)}`);
    console.log(`  Archive:   ${formatBytes(archiveSize)}`);
    console.log(`  Baselines: ${formatBytes(baselineSize)}`);
    console.log(`  Total:     ${formatBytes(totalSize)}`);
    console.log(`  Quota:     ${formatBytes(options.maxQuota)}`);
    console.log("");

    const stats: CleanupStats = {
      filesDeleted: 0,
      spaceFreed: 0,
      oldestFileAge: 0,
      quotaExceeded: totalSize > options.maxQuota,
    };

    if (stats.quotaExceeded) {
      console.log(
        `WARNING: Storage quota exceeded by ${formatBytes(totalSize - options.maxQuota)}`
      );
      console.log("");
    }

    // Cleanup current/ directory (24 hours default)
    console.log(`Cleaning profiles/current/ (max age: ${options.currentMaxAge}h)...`);
    const currentResult = cleanupDirectory(
      "profiles/current",
      options.currentMaxAge * 60 * 60 * 1000,
      options
    );
    stats.filesDeleted += currentResult.deleted;
    stats.spaceFreed += currentResult.freed;
    console.log("");

    // Cleanup archive/ directories (7 days default)
    console.log(`Cleaning profiles/archive/ (max age: ${options.archiveMaxAge}d)...`);
    const archiveResult = cleanupArchiveDirectories(
      "profiles/archive",
      options.archiveMaxAge * 24 * 60 * 60 * 1000,
      options
    );
    stats.filesDeleted += archiveResult.deleted;
    stats.spaceFreed += archiveResult.freed;
    console.log("");

    // Summary
    console.log("=========================================");
    console.log("  Cleanup Summary");
    console.log("=========================================");
    console.log(`Files ${options.dryRun ? "would be" : ""} deleted: ${stats.filesDeleted}`);
    console.log(
      `Space ${options.dryRun ? "would be" : ""} freed: ${formatBytes(stats.spaceFreed)}`
    );
    if (!options.dryRun) {
      const newTotal = totalSize - stats.spaceFreed;
      console.log(`New total size: ${formatBytes(newTotal)}`);
      console.log(`Remaining quota: ${formatBytes(options.maxQuota - newTotal)}`);
    }
    console.log("");

    if (options.dryRun) {
      console.log("Run without --dry-run to actually delete files");
    }

    process.exit(0);
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
