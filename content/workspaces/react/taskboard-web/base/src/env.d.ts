// Types for import.meta.env. Vite exposes only VITE_ names to the browser, from .env files and
// the environment, and vite.config.ts defines VITE_FIXED_NOW from HU_FIXED_TIME.
interface ImportMetaEnv {
  readonly VITE_APP_NAME: string;
  /** Where API requests go: /v1 (the mock, through Vite's proxy) unless .env.local says otherwise. */
  readonly VITE_API_BASE?: string;
  /** An RFC 3339 instant that "now" stays at, or "" for the real time. */
  readonly VITE_FIXED_NOW: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
