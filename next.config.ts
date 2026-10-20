import type { NextConfig } from "next";
import { readFileSync } from "fs";
import path from "path";

const isProd = process.env.NODE_ENV === "production";

// The local runner (hu-runner) that TypeScript, Bash, and the IDE's
// terminals talk to. The browser opens WebSockets to it directly, always at
// 127.0.0.1 so the localhost cookies lesson previews set never ride along.
// Its port is fixed when the app builds, since the CSP below names it.
const RUNNER_PORT = /^\d{1,5}$/.test(process.env.HU_RUNNER_PORT ?? "") ? process.env.HU_RUNNER_PORT : "3100";

// The course registry. Every course whose /<slug> page exists can be the
// compiler the homepage reopens.
const { courses } = JSON.parse(readFileSync(path.join(process.cwd(), "content", "courses.json"), "utf8")) as {
  courses: { slug: string; page?: string }[];
};
const COMPILER_SLUGS = courses.filter((c) => c.page && /^[a-z0-9-]+$/.test(c.slug)).map((c) => c.slug);

/**
 * Static Content-Security-Policy. The browser talks to this server, which
 * runs code on Piston and the runner for it, so pages are same-origin, plus
 * the runner's WebSockets. `script-src` keeps `'unsafe-inline'` for the
 * pre-paint theme bootstrap. `'unsafe-eval'` and other websockets are
 * dev-only (React debugging and hot reload).
 */
const csp = [
  "default-src 'self'",
  // wasm-unsafe-eval lets the browser compile PostgreSQL's WebAssembly (the
  // SQL compiler), without allowing eval.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ws://127.0.0.1:${RUNNER_PORT} ws://localhost:${RUNNER_PORT}${isProd ? "" : " ws:"}`,
  // The IDE's preview frames a workspace's server on its own localhost port
  // (another origin, the same site, architecture §11.4).
  "frame-src 'self' http://localhost:* http://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // The compiler is the whole app: the homepage drops you into Python, and
  // every other course is just a route change (/javascript, /typescript,
  // /bash…). The homepage opens the compiler you used last: each compiler
  // page asks POST /api/lang to set the hu-lang cookie (an HttpOnly one, see
  // app/api/lang/route.ts), and this redirect reads it, so it costs nothing
  // more than the plain redirect. Without it (or with anything else in it),
  // Python.
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "cookie", key: "hu-lang", value: `(?<lang>${COMPILER_SLUGS.join("|")})` }],
        destination: "/:lang",
        permanent: false,
      },
      { source: "/", destination: "/python", permanent: false },
    ];
  },
  // Tree-shake the big barrel icon libraries so the rail only pulls the
  // icons it uses into the client bundle.
  experimental: {
    optimizePackageImports: ["lucide-react", "simple-icons"],
    // Next asks npm for security advisories every time the dev server starts,
    // and under a coding agent it stops the dev server or fails the build
    // once an advisory names this version, to push an upgrade. The app stays
    // offline, and its upgrades are done on purpose.
    agentUpgrade: false,
  },
  // The floating dev badge sits on top of the language rail.
  devIndicators: false,
  // Under a coding agent, next dev would write an AGENTS.md into the project.
  agentRules: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
