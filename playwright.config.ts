import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  reporter: [["list"]],
  webServer: {
    command: "npm run build && npx vite preview --port 4321 --strictPort",
    port: 4321,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    baseURL: "http://localhost:4321",
    headless: true,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
