import { defineConfig } from "vitest/config";

// Every test file connects to its own database on TEST_MONGODB_URI (see test/support/mongo.ts),
// so the files run one at a time: a shared Mongo server handles the load better without the
// parallel connection churn, and nothing leaks between files.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
