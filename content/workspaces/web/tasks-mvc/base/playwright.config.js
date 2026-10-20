// End-to-end tests drive the real app in headless Chromium, the way a person
// would: typing, clicking, and reloading.
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT) || 5173;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  retries: 0,
  reporter: "list",
  use: { baseURL },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Uses the dev server when it is already running (npm run dev), and starts
  // one for the tests when it is not.
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: true,
  },
});
