/**
 * What a course that isn't installed says to do: npm run add with the
 * course's slug, and about how much disk that takes (lib/components.json,
 * which npm run add reads too).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./config.ts";

interface Catalog {
  parts: Record<string, { mb: number }>;
  components: { id: string; mb: number; parts: string[]; courses?: string[] }[];
}

let catalog: Catalog | null = null;

/** "npm run add -- spring (up to 1.5 GB)". Parts another course already
    brought aren't downloaded again, so it's "up to". */
export function addCourse(course: string): string {
  try {
    catalog ??= JSON.parse(readFileSync(path.join(ROOT, "lib", "components.json"), "utf8")) as Catalog;
    const c = catalog.components.find((x) => x.id === course) ?? catalog.components.find((x) => x.courses?.includes(course));
    if (c) {
      const mb = c.mb + c.parts.reduce((n, p) => n + (catalog?.parts[p]?.mb ?? 0), 0);
      return `npm run add -- ${course} (up to ${mb >= 950 ? `${(mb / 1000).toFixed(1)} GB` : `${mb} MB`})`;
    }
  } catch {
    /* no catalog: the command alone */
  }
  return `npm run add -- ${course}`;
}
