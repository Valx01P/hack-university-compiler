/** A cheatsheet section's own "###" blocks (and the lead before the first
    one), so a search can show just the parts that match. The search API
    numbers blocks the same way, so this is shared by both sides. */
export function cheatsheetBlocks(md: string): string[] {
  return md
    .split(/^(?=### )/m)
    .map((b) => b.trim())
    .filter(Boolean);
}

/** One block a cheatsheet search found: its section, which block (as
    numbered by cheatsheetBlocks), and how well it matched. */
export interface CheatsheetHit {
  section: string;
  block: number;
  score: number;
}
