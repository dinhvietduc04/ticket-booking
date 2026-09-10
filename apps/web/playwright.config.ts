import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 120000,
  expect: { timeout: 15000 },
  workers: 1,
  use: {
    actionTimeout: 15000,
    baseURL: "http://localhost:3000",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node ../api/dist/main.js",
      url: "http://localhost:4000/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command: "node node_modules/next/dist/bin/next dev --port 3000",
      url: "http://localhost:3000/login",
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
});
