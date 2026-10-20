// Playwright opens the page in headless Chromium and checks it, the way a person
// would look at it. npx playwright test (or npm run test:e2e) runs tests/.
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT) || 5173;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "tests",
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
