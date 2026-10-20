"use client";

/**
 * Small pieces of page state kept in the address, so a reload (or a copied
 * link) comes back to the same place. Written with history.replaceState, so
 * they never pile up history entries.
 *
 * - The compiler (lib/compiler-url.ts): ?panel, &challenge, &hints,
 *   &difficulty, &status, the cheatsheet's &q and &at, and SQL's &view.
 * - Learn: ?tab=code (the Your code tab) or ?tab=ex2 and ex3 (the second
 *   and third examples), &hints, and #example, #example-2, #example-3,
 *   #practice, or #recap for where you are in the part.
 * - Both: &full=1 in full screen (lib/full-screen.ts).
 *
 * A reload that restores something you'd see change is restored before you
 * see it: the bootstrap in app/layout.tsx marks <html data-restore>, which
 * keeps the page's [data-workspace] hidden (globals.css) until the page calls
 * revealWorkspace() with everything in place (or 3 seconds pass). When only
 * Learn's editor tab comes back, it marks <html data-restore-editor>
 * instead, which hides just the editor ([data-editor-pane]).
 */

// The order params are written in, for a readable address.
const ORDER = ["panel", "challenge", "hints", "difficulty", "status", "q", "at", "view", "tab", "full"];
const rank = (key: string) => {
  const i = ORDER.indexOf(key);
  return i < 0 ? ORDER.length : i;
};

/** A param of the address, or "" when it isn't there. */
export function urlParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

/** A count from the address (hints seen, say), within 0 to max. */
export function urlCount(name: string, max: number): number {
  const n = Number.parseInt(urlParam(name), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
}

let pending: Record<string, string | null> = {};
let pendingHash: string | null = null;
let timer = 0;

function flush() {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(pending)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  if (pendingHash !== null) url.hash = pendingHash ? `#${pendingHash}` : "";
  pending = {};
  pendingHash = null;
  const params = new URLSearchParams([...url.searchParams].sort(([a], [b]) => rank(a) - rank(b)));
  const query = params.toString();
  const next = `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(null, "", next);
  }
}

function schedule(now: boolean) {
  if (now) {
    window.clearTimeout(timer);
    timer = 0;
    flush();
    return;
  }
  // A burst (scrolling, typing, a panel opening) is written together, at
  // most 250ms after it starts, since browsers limit how often an address
  // may be replaced.
  if (timer) return;
  timer = window.setTimeout(() => {
    timer = 0;
    flush();
  }, 250);
}

/** Sets params in the address, merged into what's there: null or ""
    removes one, and undefined leaves it as it is. */
export function writeUrl(patch: Record<string, string | null | undefined>, { now = false } = {}) {
  for (const [key, value] of Object.entries(patch)) if (value !== undefined) pending[key] = value;
  schedule(now);
}

/** Sets the address's #fragment ("" removes it). */
export function writeHash(id: string, { now = false } = {}) {
  pendingHash = id;
  schedule(now);
}

/** Shows the workspace (or just Learn's editor) a restoring reload kept
    hidden. */
export function revealWorkspace() {
  document.documentElement.removeAttribute("data-restore");
  document.documentElement.removeAttribute("data-restore-editor");
}
