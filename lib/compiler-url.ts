"use client";

/**
 * The compiler's place in its address, so a reload (or a copied link) opens
 * the same thing: ?panel=cheatsheet|challenges, &challenge=<id> for the open
 * challenge, and for the cheatsheet &q=<search> and &at=<section> (the one at
 * the top of the view). Written with history.replaceState, so moving around
 * never piles up history entries.
 *
 * A reload that carries a panel is restored before you see it: the bootstrap
 * in app/layout.tsx marks <html data-restore>, which keeps the workspace
 * hidden (globals.css) until CompilerApp calls revealWorkspace() with
 * everything in place.
 */
export type PanelTab = "cheatsheet" | "challenges";

export interface CompilerPlace {
  panel: PanelTab | null;
  challenge: string | null;
  q: string;
  at: string;
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** What the address says, cleaned up. */
export function readCompilerUrl(): CompilerPlace {
  const p = new URLSearchParams(window.location.search);
  const panel = p.get("panel");
  const challenge = p.get("challenge") ?? "";
  const at = p.get("at") ?? "";
  return {
    panel: panel === "cheatsheet" || panel === "challenges" ? panel : null,
    challenge: ID.test(challenge) ? challenge : null,
    q: (p.get("q") ?? "").slice(0, 200),
    at: ID.test(at) ? at : "",
  };
}

// The cheatsheet's search and section, kept for the visit so they carry over
// when you switch languages (the sections have the same ids everywhere).
export const cheatsheetPlace = { q: "", at: "" };

let pending: Partial<CompilerPlace> = {};
let timer = 0;

/** Puts the place in the address (merged into what's there; empty values
    leave it). Bursts, like scrolling, are written once they settle. */
export function writeCompilerUrl(patch: Partial<CompilerPlace>, { now = false } = {}) {
  pending = { ...pending, ...patch };
  window.clearTimeout(timer);
  const write = () => {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(pending)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    pending = {};
    // Panel first, then the rest, for a readable address.
    const order = ["panel", "challenge", "q", "at"];
    const sorted = new URLSearchParams(
      [...url.searchParams].sort(([a], [b]) => (order.indexOf(a) + 9) % 9 - (order.indexOf(b) + 9) % 9)
    );
    const next = `${url.pathname}${sorted.size ? `?${sorted}` : ""}${url.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(null, "", next);
    }
  };
  if (now) write();
  else timer = window.setTimeout(write, 250);
}

/** Shows the workspace a restoring reload kept hidden. */
export function revealWorkspace() {
  document.documentElement.removeAttribute("data-restore");
}
