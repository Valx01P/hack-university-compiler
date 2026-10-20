/** Quick open's fuzzy match (components/ide/quick-open.tsx). */

/** A fuzzy score of a path for a query, or -1 when it doesn't match. */
export function fuzzyScore(path: string, query: string): number {
  if (!query) return 0;
  const p = path.toLowerCase();
  const q = query.toLowerCase().replace(/\s+/g, "");
  let score = 0;
  let at = -1;
  for (const ch of q) {
    const next = p.indexOf(ch, at + 1);
    if (next < 0) return -1;
    // Consecutive letters, and letters at the start of a name or word, count more.
    score += next === at + 1 ? 3 : 1;
    if (next === 0 || "/._-".includes(p[next - 1])) score += 4;
    at = next;
  }
  const name = p.slice(p.lastIndexOf("/") + 1);
  if (name.includes(q)) score += 10;
  return score - p.length * 0.01;
}
