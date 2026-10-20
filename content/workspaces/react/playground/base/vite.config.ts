// Vite serves the playground with hot reloading, builds it, and runs its tests (the test block is
// Vitest's). In a workspace, WEB_PORT and API_PORT are leased when the container starts and are
// the same number inside and out, so the address Vite prints is the one that works. The npm
// scripts load this file with --configLoader native (Node runs it as TypeScript), so nothing is
// written into node_modules; every cache lives in .vite/.
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The course's clock. Tests always run at it, so no test depends on today's date.
const COURSE_CLOCK = "2026-10-01T09:00:00Z";

export default defineConfig(({ mode }) => {
  const api = `http://127.0.0.1:${process.env.API_PORT ?? "3001"}`;
  const proxy = { "/v1": api, "/healthz": api, "/_hu": api };

  return {
    plugins: [
      react(),
      // The React Compiler, through Babel, on src/ only (Vite's pre-bundled dependencies in .vite/deps stay untouched).
      babel({ presets: [reactCompilerPreset()], include: /[\\/]src[\\/].*\.[jt]sx?$/ }),
      // Tailwind CSS is installed but off. To use it: import tailwindcss from "@tailwindcss/vite",
      // add tailwindcss() here, and put @import "tailwindcss"; at the top of src/index.css.
    ],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    define: {
      "import.meta.env.VITE_FIXED_NOW": JSON.stringify(process.env.HU_FIXED_TIME ?? (mode === "test" ? COURSE_CLOCK : "")),
    },
    // Vite's dependency cache, out of node_modules.
    cacheDir: ".vite",
    server: { host: true, port: Number(process.env.WEB_PORT) || 5173, strictPort: true, proxy },
    preview: { host: true, port: 4173, strictPort: true, proxy },
    test: {
      // Vitest's transform cache, kept with Vite's instead of in node_modules.
      fsModuleCachePath: ".vite/vitest",
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
    },
  };
});
