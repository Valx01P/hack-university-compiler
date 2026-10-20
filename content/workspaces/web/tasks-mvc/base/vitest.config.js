// Unit tests run in Node, not in a browser: the store and the persistence code
// never touch the DOM, which is what makes them quick to test.
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vitest keeps its caches beside Vite's, out of the read-only node_modules.
  cacheDir: ".vite-cache",
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.js"],
    fsModuleCachePath: ".vite-cache/vitest-modules",
  },
});
