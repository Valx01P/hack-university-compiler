// Vite serves the app with hot reloading, builds it for production, and runs the tests (the
// test block is Vitest's). In a workspace, WEB_PORT and API_PORT are leased when the container
// starts and are the same number inside and out, so the address Vite prints is the one that works.
// The npm scripts load this file with --configLoader native (Node runs it as TypeScript, like the
// API) because the default loader writes a bundled copy into node_modules, which a workspace
// shares read-only. Nothing here writes into node_modules either: every cache lives in .vite/.
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The Taskboard contract's clock. Tests always run at it, so no test depends on today's date.
const CONTRACT_CLOCK = "2026-10-01T09:00:00Z";

export default defineConfig(({ mode }) => {
  const api = `http://127.0.0.1:${process.env.API_PORT ?? "3001"}`;
  const proxy = { "/v1": api, "/healthz": api, "/_hu": api };
  const fixedNow = process.env.HU_FIXED_TIME ?? (mode === "test" ? CONTRACT_CLOCK : "");

  return {
    plugins: [
      react(),
      // The React Compiler, through Babel, on the app's own code only. The default exclude covers
      // node_modules, but with cacheDir moved, Vite's pre-bundled dependencies live in .vite/deps.
      babel({ presets: [reactCompilerPreset()], include: /[\\/]src[\\/].*\.[jt]sx?$/ }),
    ],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    define: {
      "import.meta.env.VITE_FIXED_NOW": JSON.stringify(fixedNow),
    },
    // Vite's dependency cache, out of node_modules, which a workspace mounts read-only.
    cacheDir: ".vite",
    server: {
      host: true,
      port: Number(process.env.WEB_PORT) || 5173,
      strictPort: true,
      proxy,
    },
    preview: {
      host: true,
      port: 4173,
      strictPort: true,
      proxy,
    },
    test: {
      // Vitest's transform cache, kept with Vite's instead of in node_modules.
      fsModuleCachePath: ".vite/vitest",
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
    },
  };
});
