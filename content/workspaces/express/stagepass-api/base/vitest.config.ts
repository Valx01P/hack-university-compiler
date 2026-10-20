// Three test projects, fastest first:
//   unit  services, policies, hooks, and helpers, with in-memory fakes. No server, no database.
//   api   the whole Express app through supertest, still on fakes. No port, no database.
//   int   repositories and transactions on a real PostgreSQL (TEST_DATABASE_URL), one file at a
//         time because they share that database.
// npm test runs all three, npm run test:unit (or :api, :int) one of them.
import { defineConfig } from "vitest/config";

// The workspace mounts node_modules read-only, so nothing may be written there: the caches live
// in .vite-cache, and the npm scripts pass --configLoader native, so this file is imported by
// Node itself instead of being bundled into node_modules/.vite-temp first.
export default defineConfig({
  cacheDir: ".vite-cache",
  test: {
    fsModuleCachePath: ".vite-cache/vitest",
    setupFiles: ["test/support/setup.ts"],
    projects: [
      { extends: true, test: { name: "unit", include: ["test/unit/**/*.test.ts"] } },
      { extends: true, test: { name: "api", include: ["test/api/**/*.test.ts"] } },
      {
        extends: true,
        test: {
          name: "int",
          include: ["test/int/**/*.test.ts"],
          globalSetup: ["test/support/int-setup.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
