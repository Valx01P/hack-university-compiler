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
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
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
  async redirects() {
    return [{ source: "/", destination: "/python", permanent: false }];
  },
  // Tree-shake the big barrel icon libraries so the rail only pulls the
  // icons it uses into the client bundle.
  experimental: {
    optimizePackageImports: ["lucide-react", "simple-icons"],
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
