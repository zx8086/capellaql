/* playwright.config.ts - Playwright E2E Testing Configuration */

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/playwright",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html"], ["list"]],
  timeout: 30000,

  use: {
    baseURL: process.env.API_BASE_URL || "http://localhost:4000",
    extraHTTPHeaders: {
      "Content-Type": "application/json",
    },
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "graphql-api",
      testMatch: /.*\.spec\.ts/,
    },
  ],

  webServer: {
    command: "bun run start",
    url: "http://localhost:4000/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
