import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Static Content-Security-Policy. The browser only ever talks to this server
 * (never to Piston directly), so everything is same-origin. `script-src`
 * keeps `'unsafe-inline'` for the pre-paint theme bootstrap. `'unsafe-eval'`
 * and websockets are dev-only (React debugging and hot reload).
 */
const csp = [
  "default-src 'self'",
  // wasm-unsafe-eval lets the browser compile PostgreSQL's WebAssembly (the
  // SQL compiler), without allowing eval.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isProd ? "" : " ws:"}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // The compiler is the whole app: the homepage drops you into Python, and
  // every other language is just a route change (/javascript, /cpp, /java, /go).
  // The homepage opens the compiler you used last: each compiler page sets
  // the hu-lang cookie (components/compiler/compiler-app.tsx), and this
  // redirect reads it, so it costs nothing more than the plain redirect.
  // Without it (or with anything else in it), Python.
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "cookie", key: "hu-lang", value: "(?<lang>python|javascript|cpp|java|go|sql)" }],
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
    // Turbopack's production scope hoisting renames a helper inside PGlite
    // but not every use of it, so SQL failed to start in a production build
    // ("p.instantiateWasm is not a function"). Keep each module in its own
    // scope instead.
    turbopackScopeHoisting: false,
  },
  // The floating dev badge sits on top of the language rail.
  devIndicators: false,
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
