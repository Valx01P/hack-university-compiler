// helmet's security headers and the CORS rules, built from config so they live in one place.
import type { CorsOptions } from "cors";
import type { HelmetOptions } from "helmet";
import type { Config } from "../config.ts";

export function helmetOptions(config: Pick<Config, "isProduction" | "previewParent">): HelmetOptions {
  const frameAncestors = config.previewParent === null ? ["'self'"] : ["'self'", config.previewParent];
  return {
    contentSecurityPolicy: {
      directives: {
        // The pages show posters from this server and the inline placeholder as a data: URL.
        "img-src": ["'self'", "data:"],
        // In development, Hack University's Preview (HU_PREVIEW_PARENT) may frame the pages.
        "frame-ancestors": frameAncestors,
        // On plain-HTTP localhost, Safari would upgrade requests to HTTPS and break the pages.
        "upgrade-insecure-requests": config.isProduction ? [] : null,
      },
    },
    // X-Frame-Options cannot list another origin, so when the Preview may frame, CSP alone decides.
    xFrameOptions: config.previewParent === null ? { action: "sameorigin" } : false,
  };
}

export function corsOptions(config: Pick<Config, "corsOrigins">): CorsOptions {
  return {
    // Exact origins only. A request from any other origin gets no CORS headers, so browsers hide the answer.
    origin: config.corsOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key", "X-Request-Id"],
    exposedHeaders: ["Location", "X-Request-Id", "RateLimit", "RateLimit-Policy"],
    // Browsers may remember a preflight's answer for 10 minutes.
    maxAge: 600,
  };
}
