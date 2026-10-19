"use client";

import { urlParam } from "@/lib/url-state";

export { revealWorkspace, urlCount, urlParam, writeUrl } from "@/lib/url-state";

/**
 * The compiler's place in its address (lib/url-state.ts): ?panel=cheatsheet
 * or challenges, &challenge=<id> for the open challenge with &hints for the
 * hints you've seen, the challenge list's &difficulty and &status filters,
 * the cheatsheet's &q (its search) and &at (the section at the top), and on
 * SQL, &view=database.
 */
export type PanelTab = "cheatsheet" | "challenges";

export interface CompilerPlace {
  panel: PanelTab | null;
  challenge: string | null;
  q: string;
  at: string;
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** What the address says about the panel, cleaned up. */
export function readCompilerUrl(): CompilerPlace {
  const panel = urlParam("panel");
  const challenge = urlParam("challenge");
  const at = urlParam("at");
  return {
    panel: panel === "cheatsheet" || panel === "challenges" ? panel : null,
    challenge: ID.test(challenge) ? challenge : null,
    q: urlParam("q").slice(0, 200),
    at: ID.test(at) ? at : "",
  };
}

// The cheatsheet's search and section, kept for the visit so they carry over
// when you switch languages (the sections have the same ids everywhere).
export const cheatsheetPlace = { q: "", at: "" };

// The challenge list's filters, for the visit too ("all" is no filter).
export const challengeListPlace = { difficulty: "all", status: "all" };
