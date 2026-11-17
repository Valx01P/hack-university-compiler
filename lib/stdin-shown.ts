/**
 * Whether stdin is open, kept per page in this browser: Learn opens it by
 * default and the compiler doesn't, and each keeps it as you leave it. It's
 * stored only when it differs from the default, and the bootstrap in
 * app/layout.tsx (STDIN_BOOTSTRAP) marks <html> with it before first paint,
 * which the stdin-open: and stdin-closed: variants read (app/globals.css), so
 * a reload opens it as you left it with nothing shifting.
 * components/code/program-input.ts saves and reads it. Plain data, no React:
 * the server layout imports it.
 */
export const STDIN = {
  // Open by default: <html data-learn-stdin-closed> once you fold it.
  learn: { key: "hu-learn-stdin", attr: "data-learn-stdin-closed", openByDefault: true },
  // Folded by default: <html data-compiler-stdin-open> once you open it.
  compiler: { key: "hu-compiler-stdin", attr: "data-compiler-stdin-open", openByDefault: false },
} as const;

export type StdinPage = keyof typeof STDIN;

/** What's stored when a page's stdin isn't as it is by default. */
export const stdinStored = (page: StdinPage) => (STDIN[page].openByDefault ? "closed" : "open");

/** The bootstrap's part (it runs with `d` as <html>). */
export const STDIN_BOOTSTRAP = (Object.keys(STDIN) as StdinPage[])
  .map((page) => `if(localStorage.getItem("${STDIN[page].key}")==="${stdinStored(page)}")d.setAttribute("${STDIN[page].attr}","")`)
  .join(";");
