/* src/lib/configHotReload.ts */

import { configWatcher, readConfigFile, parseEnvContent, getConfigDifferences } from "./configWatcher";
import { log, error as err } from "../telemetry/logger";
import { EventEmitter } from "events";
import path from "path";

export interface ConfigurationValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ConfigurationReloadEvent {
  type: 'reload' | 'validation_failed' | 'rollback';
  timestamp: number;
  changes: {
    added: string[];
    removed: string[];
    changed: string[];
  };
  errors?: string[];
}

class ConfigurationHotReload extends EventEmitter {
  private currentEnvVars: Record<string, string> = {};
  private backupEnvVars: Record<string, string> = {};
  private watchedFiles: string[] = [];
  private enabled = false;

  /**
   * Initialize hot-reload system
   */
  async initialize(configFiles: string[] = ['.env', '.env.local']): Promise<void> {
    try {
      this.watchedFiles = configFiles.map(file => path.resolve(file));
      
      // Load current configuration
      await this.loadCurrentConfiguration();
      
      // Set up file watcher
      configWatcher.onConfigChange(this.handleConfigurationChange.bind(this));
      configWatcher.startWatching(this.watchedFiles);
      
      this.enabled = true;
      log("Configuration hot-reload system initialized", {
        watchedFiles: this.watchedFiles,
        currentEnvCount: Object.keys(this.currentEnvVars).length
      });
    } catch (error) {
      err("Failed to initialize configuration hot-reload:", error);
      throw error;
    }
  }

  /**
   * Disable hot-reload system
   */
  disable(): void {
    configWatcher.stopWatching();
    this.enabled = false;
    this.removeAllListeners();
    log("Configuration hot-reload system disabled");
  }

  /**
   * Load current configuration state
   */
  private async loadCurrentConfiguration(): Promise<void> {
    const envVars: Record<string, string> = {};
    
    for (const configFile of this.watchedFiles) {
      try {
        const content = await readConfigFile(configFile);
        const fileEnvVars = parseEnvContent(content);
        Object.assign(envVars, fileEnvVars);
        log(`Loaded configuration from ${configFile}`, {
          variableCount: Object.keys(fileEnvVars).length
        });
      } catch (error) {
        // File might not exist, which is okay
        if ((error as any)?.code !== 'ENOENT') {
          err(`Error loading config file ${configFile}:`, error);
        }
      }
    }
    
    this.currentEnvVars = envVars;
    this.backupEnvVars = { ...envVars };
  }

  /**
   * Handle configuration file changes
   */
  private async handleConfigurationChange(): Promise<void> {
    if (!this.enabled) return;

    try {
      log("Configuration change detected, reloading...");
      
      // Load new configuration
      const newEnvVars: Record<string, string> = {};
      
      for (const configFile of this.watchedFiles) {
        try {
          const content = await readConfigFile(configFile);
          const fileEnvVars = parseEnvContent(content);
          Object.assign(newEnvVars, fileEnvVars);
        } catch (error) {
          if ((error as any)?.code !== 'ENOENT') {
            throw error;
          }
        }
      }
      
      // Compare with current configuration
      const changes = getConfigDifferences(this.currentEnvVars, newEnvVars);
      
      if (changes.added.length === 0 && changes.removed.length === 0 && changes.changed.length === 0) {
        log("No meaningful configuration changes detected");
        return;
      }
      
      // Validate new configuration
      const validation = await this.validateConfiguration(newEnvVars);
      
      if (!validation.valid) {
        err("Configuration validation failed:", validation.errors);
        
        const event: ConfigurationReloadEvent = {
          type: 'validation_failed',
          timestamp: Date.now(),
          changes,
          errors: validation.errors
        };
        
        this.emit('configurationReloadFailed', event);
        return;
      }
      
      if (validation.warnings.length > 0) {
        log("Configuration validation warnings:", validation.warnings);
      }
      
      // Apply the new configuration
      await this.applyConfiguration(newEnvVars, changes);
      
    } catch (error) {
      err("Error handling configuration change:", error);
      await this.rollbackConfiguration();
    }
  }

  /**
   * Validate new configuration
   */
  private async validateConfiguration(envVars: Record<string, string>): Promise<ConfigurationValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      // Basic validation rules
      const requiredVars = [
        'COUCHBASE_URL',
        'COUCHBASE_USERNAME',
        'COUCHBASE_BUCKET'
      ];
      
      for (const requiredVar of requiredVars) {
        if (!envVars[requiredVar] || envVars[requiredVar].trim() === '') {
          errors.push(`Required environment variable ${requiredVar} is missing or empty`);
        }
      }
      
      // Validate URL format
      if (envVars.COUCHBASE_URL && !envVars.COUCHBASE_URL.startsWith('couchbase://') && !envVars.COUCHBASE_URL.startsWith('couchbases://')) {
        errors.push('COUCHBASE_URL must start with couchbase:// or couchbases://');
      }
      
      // Validate numeric values
      const numericVars = [
        'COUCHBASE_KV_TIMEOUT',
        'COUCHBASE_QUERY_TIMEOUT',
        'APPLICATION_PORT'
      ];
      
      for (const numericVar of numericVars) {
        if (envVars[numericVar] && isNaN(Number(envVars[numericVar]))) {
          errors.push(`${numericVar} must be a valid number`);
        }
      }
      
      // Production-specific validations
      if (envVars.NODE_ENV === 'production' || envVars.DEPLOYMENT_ENVIRONMENT === 'production') {
        if (envVars.COUCHBASE_PASSWORD === 'password') {
          errors.push('Default password not allowed in production');
        }
        
        if (envVars.ALLOWED_ORIGINS === '*') {
          warnings.push('Wildcard CORS origins not recommended in production');
        }
      }
      
      // Validate OpenTelemetry configuration
      if (envVars.ENABLE_OPENTELEMETRY === 'true') {
        const requiredOtelVars = ['SERVICE_NAME', 'SERVICE_VERSION'];
        for (const otelVar of requiredOtelVars) {
          if (!envVars[otelVar]) {
            warnings.push(`OpenTelemetry enabled but ${otelVar} is missing`);
          }
        }
      }
      
    } catch (validationError) {
      errors.push(`Configuration validation error: ${validationError}`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Apply new configuration
   */
  private async applyConfiguration(
    newEnvVars: Record<string, string>,
    changes: { added: string[]; removed: string[]; changed: string[] }
  ): Promise<void> {
    // Store backup before applying changes
    this.backupEnvVars = { ...this.currentEnvVars };
    
    // Apply changes to process environment (if using Node.js compatibility)
    if (typeof process !== 'undefined' && process.env) {
      // Update process.env
      for (const [key, value] of Object.entries(newEnvVars)) {
        process.env[key] = value;
      }
      
      // Remove deleted variables
      for (const removedKey of changes.removed) {
        delete process.env[removedKey];
      }
    }
    
    // Update Bun.env if available
    if (typeof Bun !== "undefined" && Bun.env) {
      for (const [key, value] of Object.entries(newEnvVars)) {
        (Bun.env as any)[key] = value;
      }
    }
    
    // Update internal state
    this.currentEnvVars = newEnvVars;
    
    const event: ConfigurationReloadEvent = {
      type: 'reload',
      timestamp: Date.now(),
      changes
    };
    
    log("Configuration successfully reloaded", {
      added: changes.added.length,
      removed: changes.removed.length,
      changed: changes.changed.length
    });
    
    this.emit('configurationReloaded', event);
  }

  /**
   * Rollback to previous configuration
   */
  private async rollbackConfiguration(): Promise<void> {
    try {
      log("Rolling back configuration changes...");
      
      // Restore process.env
      if (typeof process !== 'undefined' && process.env) {
        for (const [key, value] of Object.entries(this.backupEnvVars)) {
          process.env[key] = value;
        }
      }
      
      // Restore Bun.env
      if (typeof Bun !== "undefined" && Bun.env) {
        for (const [key, value] of Object.entries(this.backupEnvVars)) {
          (Bun.env as any)[key] = value;
        }
      }
      
      // Restore internal state
      this.currentEnvVars = { ...this.backupEnvVars };
      
      const event: ConfigurationReloadEvent = {
        type: 'rollback',
        timestamp: Date.now(),
        changes: { added: [], removed: [], changed: [] }
      };
      
      log("Configuration rollback completed");
      this.emit('configurationRolledBack', event);
      
    } catch (error) {
      err("Error during configuration rollback:", error);
    }
  }

  /**
   * Get current configuration state
   */
  getStatus() {
    return {
      enabled: this.enabled,
      watchedFiles: this.watchedFiles,
      currentEnvCount: Object.keys(this.currentEnvVars).length,
      watcherStatus: configWatcher.getStatus()
    };
  }

  /**
   * Manually trigger configuration reload
   */
  async reloadConfiguration(): Promise<void> {
    await this.handleConfigurationChange();
  }
}

// Create singleton instance
export const configHotReload = new ConfigurationHotReload();