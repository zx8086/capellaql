/* playwright.config.ts - Playwright E2E Testing Configuration */

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/playwright",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30000,

  use: {
    baseURL: process.env.BASE_URL || "http://localhost:4000",
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

  // In CI, the platform starts the app as a sidecar — no webServer needed
  ...(!process.env.CI && {
    webServer: {
      command: "bun run start",
      url: "http://localhost:4000/health",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  }),
});
