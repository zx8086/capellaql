/* src/lib/configWatcher.ts */

import { type FSWatcher, watch } from "fs";
import { error as err, log } from "../telemetry/logger";

export interface ConfigChangeEvent {
  type: "change" | "rename";
  filename: string;
  timestamp: number;
}

export type ConfigChangeHandler = (event: ConfigChangeEvent) => Promise<void>;

class ConfigurationWatcher {
  private watchers: Map<string, FSWatcher> = new Map();
  private handlers: Set<ConfigChangeHandler> = new Set();
  private debounceTimeout?: Timer;
  private readonly debounceMs = 1000; // 1 second debounce

  /**
   * Start watching configuration files
   */
  startWatching(files: string[]): void {
    for (const file of files) {
      this.watchFile(file);
    }
    log(`Configuration watcher started for ${files.length} files`, { files });
  }

  /**
   * Stop all file watchers
   */
  stopWatching(): void {
    this.watchers.forEach((watcher, file) => {
      watcher.close();
      log(`Stopped watching configuration file: ${file}`);
    });
    this.watchers.clear();

    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    log("Configuration watcher stopped");
  }

  /**
   * Add a handler for configuration changes
   */
  onConfigChange(handler: ConfigChangeHandler): () => void {
    this.handlers.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * Watch a single configuration file
   */
  private watchFile(filepath: string): void {
    if (this.watchers.has(filepath)) {
      return; // Already watching this file
    }

    try {
      const watcher = watch(filepath, { persistent: false }, (eventType, filename) => {
        this.handleFileChange(eventType, filename || filepath);
      });

      watcher.on("error", (error) => {
        err(`Error watching configuration file ${filepath}:`, error);
      });

      this.watchers.set(filepath, watcher);
      log(`Started watching configuration file: ${filepath}`);
    } catch (error) {
      err(`Failed to start watching ${filepath}:`, error);
    }
  }

  /**
   * Handle file change events with debouncing
   */
  private handleFileChange(eventType: string, filename: string): void {
    // Clear existing debounce timeout
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    // Debounce the change event
    this.debounceTimeout = setTimeout(async () => {
      const event: ConfigChangeEvent = {
        type: eventType as "change" | "rename",
        filename,
        timestamp: Date.now(),
      };

      log(`Configuration file changed:`, event);

      // Notify all handlers
      for (const handler of this.handlers) {
        try {
          await handler(event);
        } catch (error) {
          err(`Error in configuration change handler:`, error);
        }
      }
    }, this.debounceMs);
  }

  /**
   * Get current watcher status
   */
  getStatus() {
    return {
      watchedFiles: Array.from(this.watchers.keys()),
      handlerCount: this.handlers.size,
      active: this.watchers.size > 0,
    };
  }
}

// Create singleton instance
export const configWatcher = new ConfigurationWatcher();

/**
 * Bun-optimized file reading utility
 */
export async function readConfigFile(filepath: string): Promise<string> {
  if (typeof Bun !== "undefined") {
    try {
      const file = Bun.file(filepath);
      return await file.text();
    } catch (error) {
      err(`Error reading config file with Bun: ${filepath}`, error);
      throw error;
    }
  } else {
    // Fallback to Node.js fs
    const fs = await import("fs/promises");
    return await fs.readFile(filepath, "utf-8");
  }
}

/**
 * Parse environment variables from .env content
 */
export function parseEnvContent(content: string): Record<string, string> {
  const envVars: Record<string, string> = {};

  content.split("\n").forEach((line) => {
    line = line.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith("#")) {
      return;
    }

    // Find the first = sign
    const equalIndex = line.indexOf("=");
    if (equalIndex === -1) {
      return;
    }

    const key = line.substring(0, equalIndex).trim();
    let value = line.substring(equalIndex + 1).trim();

    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    envVars[key] = value;
  });

  return envVars;
}

/**
 * Utility to compare two configuration objects
 */
export function getConfigDifferences<T extends Record<string, any>>(
  oldConfig: T,
  newConfig: T
): { added: string[]; removed: string[]; changed: string[] } {
  const oldKeys = new Set(Object.keys(oldConfig));
  const newKeys = new Set(Object.keys(newConfig));

  const added = Array.from(newKeys).filter((key) => !oldKeys.has(key));
  const removed = Array.from(oldKeys).filter((key) => !newKeys.has(key));
  const changed: string[] = [];

  // Check for changed values
  for (const key of oldKeys) {
    if (newKeys.has(key) && oldConfig[key] !== newConfig[key]) {
      changed.push(key);
    }
  }

  return { added, removed, changed };
}
