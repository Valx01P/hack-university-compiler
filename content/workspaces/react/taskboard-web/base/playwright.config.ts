// npm run e2e: Playwright drives a real browser (Chromium) through the production build, against
// the real mock API. It starts both servers itself: the API on API_PORT, and `vite preview` on
// 4173 after a fresh `vite build`. Every spec runs twice, at a desktop and a phone size. The specs
// share one data file, so they run one at a time, each starting from POST /_hu/reset.
import { defineConfig, devices } from "@playwright/test";

const API_PORT = process.env.API_PORT ?? "3001";
const HU_FIXED_TIME = process.env.HU_FIXED_TIME ?? "2026-10-01T09:00:00Z";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
  webServer: [
    {
      command: "node api/server.ts",
      url: `http://127.0.0.1:${API_PORT}/healthz`,
      env: { API_PORT, HU_FIXED_TIME },
      // An API already answering on API_PORT (npm run dev's, or a check's) is used as it is: the
      // specs reset its data first, so they never depend on what was there.
      reuseExistingServer: true,
    },
    {
      command: "npx vite build --configLoader native && npx vite preview --configLoader native --port 4173 --strictPort",
      url: "http://localhost:4173",
      env: { API_PORT, HU_FIXED_TIME },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
