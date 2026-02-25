import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "frontend/test/e2e",
  timeout: 30_000,
  workers: 1,
  expect: {
    timeout: 5_000
  },
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://localhost:8765",
    headless: true,
    browserName: "chromium"
  },
  webServer: {
    command: "python3 -m http.server 8765 --directory frontend",
    url: "http://localhost:8765",
    reuseExistingServer: true,
    timeout: 15_000
  }
});
