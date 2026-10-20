// Types for import.meta.env. vite.config.ts defines VITE_FIXED_NOW from HU_FIXED_TIME, and only
// VITE_ names reach the browser.
interface ImportMetaEnv {
  /** An RFC 3339 instant that "now" stays at, or "" for the real time. */
  readonly VITE_FIXED_NOW: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
