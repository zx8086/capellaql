/* build.config.ts - Optimized Bun Build Configuration */

import type { BuildConfig } from "bun";
import { existsSync } from "fs";

/**
 * Environment-specific build configuration
 */
interface EnvironmentConfig {
  minify: boolean;
  sourcemap: boolean | "external" | "inline";
  splitting: boolean;
  treeshaking: boolean;
  define: Record<string, string>;
  external: string[];
}

/**
 * Get environment-specific configuration
 */
function getEnvironmentConfig(): EnvironmentConfig {
  const isDevelopment = process.env.NODE_ENV === "development";
  const isProduction = process.env.NODE_ENV === "production";
  const isTest = process.env.NODE_ENV === "test";

  const baseConfig: EnvironmentConfig = {
    minify: false,
    sourcemap: "external",
    splitting: true,
    treeshaking: true,
    define: {
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
      // Remove invalid define key - Bun handles this natively
    },
    external: [
      // OpenTelemetry packages (large, not frequently bundled)
      "@opentelemetry/api",
      "@opentelemetry/sdk-node",
      "@opentelemetry/instrumentation",
      "@opentelemetry/exporter-otlp-http",
      "@opentelemetry/semantic-conventions",

      // Database drivers
      "couchbase",

      // Node.js built-ins that Bun handles natively
      "dns",
      "crypto",
      "fs",
      "path",
      "url",

      // Bun built-ins
      "bun:sqlite",
      "bun:test",
    ],
  };

  if (isProduction) {
    return {
      ...baseConfig,
      minify: true,
      sourcemap: "external", // Keep sourcemaps for production debugging
      define: {
        ...baseConfig.define,
        "process.env.NODE_ENV": '"production"',
        // Remove debug code in production
        __DEV__: "false",
        "console.debug": "(() => {})", // Remove debug logs
      },
    };
  }

  if (isDevelopment) {
    return {
      ...baseConfig,
      minify: false,
      sourcemap: "inline", // Inline sourcemaps for faster development
      splitting: false, // Disable splitting for faster rebuilds
      define: {
        ...baseConfig.define,
        __DEV__: "true",
      },
    };
  }

  if (isTest) {
    return {
      ...baseConfig,
      minify: false,
      sourcemap: "inline",
      splitting: false,
      define: {
        ...baseConfig.define,
        __DEV__: "true",
        "process.env.NODE_ENV": '"test"',
      },
    };
  }

  return baseConfig;
}

/**
 * Enhanced build configuration for Bun
 */
export const bunBuildConfig: BuildConfig = {
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "bun",
  format: "esm",

  // Environment-specific settings
  ...getEnvironmentConfig(),

  // Advanced optimization settings
  naming: {
    // Use content hashes for better caching
    entry: "[dir]/[name]-[hash].[ext]",
    chunk: "[name]-[hash].[ext]",
    asset: "assets/[name]-[hash].[ext]",
  },

  // Advanced code splitting
  experimentalCss: false, // Disable CSS processing for server-side app

  // Bundle analysis (only in development)
  ...(process.env.ANALYZE_BUNDLE && {
    plugins: [
      // Bundle analyzer plugin would go here if available
    ],
  }),
};

/**
 * Development-specific build configuration with hot reload
 */
export const devBuildConfig: BuildConfig = {
  ...bunBuildConfig,
  minify: false,
  sourcemap: "inline",
  splitting: false,
  watch: true,

  // Development-specific optimizations
  define: {
    ...bunBuildConfig.define,
    __DEV__: "true",
    "process.env.NODE_ENV": '"development"',
    // Enable more verbose logging in development
    "console.debug": "console.debug",
  },
};

/**
 * Production build configuration with maximum optimization
 */
export const prodBuildConfig: BuildConfig = {
  ...bunBuildConfig,
  minify: true,
  sourcemap: "external",
  splitting: true,

  // Production-specific optimizations
  define: {
    ...bunBuildConfig.define,
    "process.env.NODE_ENV": '"production"',
    __DEV__: "false",

    // Remove development-only code
    "console.debug": "(() => {})",
    "console.trace": "(() => {})",

    // Optimize feature flags
    "process.env.ENABLE_DEBUG_LOGGING": JSON.stringify(process.env.ENABLE_DEBUG_LOGGING || "false"),
    "process.env.ENABLE_PERFORMANCE_MONITORING": JSON.stringify(process.env.ENABLE_PERFORMANCE_MONITORING || "true"),
  },

  // Production externals (reduce bundle size)
  external: [
    ...bunBuildConfig.external,
    // Additional production externals
    "elysia", // Framework externals for better tree-shaking
  ],
};

/**
 * Test build configuration
 */
export const testBuildConfig: BuildConfig = {
  ...bunBuildConfig,
  minify: false,
  sourcemap: "inline",
  splitting: false,

  define: {
    ...bunBuildConfig.define,
    "process.env.NODE_ENV": '"test"',
    __DEV__: "true",
  },

  // Test-specific externals
  external: [
    ...bunBuildConfig.external.filter((ext) => ext !== "bun:test"), // Don't external bun:test
  ],
};

/**
 * Docker build configuration (optimized for containers)
 */
export const dockerBuildConfig: BuildConfig = {
  ...prodBuildConfig,

  // Container-specific optimizations
  define: {
    ...prodBuildConfig.define,

    // Container environment defaults
    "process.env.PORT": JSON.stringify(process.env.PORT || "4000"),
    "process.env.LOG_LEVEL": JSON.stringify(process.env.LOG_LEVEL || "info"),

    // Optimize for container runtime
    "process.env.UV_THREADPOOL_SIZE": JSON.stringify(process.env.UV_THREADPOOL_SIZE || "16"),
  },

  // Container-friendly paths
  naming: {
    entry: "[dir]/[name].[ext]", // Simpler naming for containers
    chunk: "[name].[ext]",
    asset: "assets/[name].[ext]",
  },
};

/**
 * Lambda/serverless build configuration
 */
export const serverlessBuildConfig: BuildConfig = {
  ...prodBuildConfig,

  // Serverless optimizations
  splitting: false, // Single bundle for serverless

  define: {
    ...prodBuildConfig.define,

    // Serverless environment optimizations
    "process.env.AWS_NODEJS_CONNECTION_REUSE_ENABLED": "1",
  },

  // Minimize bundle size for serverless
  external: [
    // Only external truly external dependencies in serverless
    "couchbase",
    "@opentelemetry/api",
  ],
};

/**
 * Get build configuration based on environment and target
 */
export function getBuildConfig(
  target: "development" | "production" | "test" | "docker" | "serverless" = "development"
): BuildConfig {
  switch (target) {
    case "development":
      return devBuildConfig;
    case "production":
      return prodBuildConfig;
    case "test":
      return testBuildConfig;
    case "docker":
      return dockerBuildConfig;
    case "serverless":
      return serverlessBuildConfig;
    default:
      return bunBuildConfig;
  }
}

/**
 * Build performance analysis
 */
export interface BuildMetrics {
  startTime: number;
  endTime: number;
  duration: number;
  bundleSize: number;
  chunkCount: number;
  assetCount: number;
}

/**
 * Enhanced build function with metrics
 */
export async function buildWithMetrics(config: BuildConfig = bunBuildConfig): Promise<BuildMetrics> {
  const startTime = Date.now();

  console.log("🔨 Starting optimized build with Bun...");
  console.log(`Target: ${config.target}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`Output: ${config.outdir}`);

  try {
    // Perform the build
    const result = await Bun.build(config);

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Calculate metrics
    let totalSize = 0;
    let chunkCount = 0;
    let assetCount = 0;

    for (const output of result.outputs) {
      if (output.kind === "entry-point" || output.kind === "chunk") {
        chunkCount++;
        totalSize += output.size || 0;
      } else if (output.kind === "asset") {
        assetCount++;
      }
    }

    const metrics: BuildMetrics = {
      startTime,
      endTime,
      duration,
      bundleSize: totalSize,
      chunkCount,
      assetCount,
    };

    // Log build results
    console.log("Build completed successfully!");
    console.log(` Duration: ${duration}ms`);
    console.log(`Bundle size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Chunks: ${chunkCount}`);
    console.log(`🎨 Assets: ${assetCount}`);

    if (result.logs.length > 0) {
      console.log("Build logs:");
      result.logs.forEach((log) => console.log(`  ${log.message}`));
    }

    return metrics;
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;

    console.error("Build failed:");
    console.error(error);

    throw error;
  }
}

/**
 * Build with environment detection
 */
export async function autoBuild(): Promise<BuildMetrics> {
  const target =
    (process.env.BUILD_TARGET as any) || (process.env.NODE_ENV === "production" ? "production" : "development");

  const config = getBuildConfig(target);
  return buildWithMetrics(config);
}

// Export default configuration
export default bunBuildConfig;

// Main execution when run directly
if (import.meta.main) {
  console.log("CapellaQL Build System");

  try {
    const metrics = await autoBuild();

    // Exit with success
    process.exit(0);
  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}
