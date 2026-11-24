import CATALOG from "@/lib/components.json";
import { getCourseEntry } from "@/lib/courses";

/**
 * The compilers npm run up can leave out (lib/components.json, which npm run
 * add and npm run status read too), for the hints that say how to add one:
 * about how much disk it takes, and the command. npm run add takes the
 * compiler's own slug. The project courses are read lessons, so they're never
 * missing, and a course whose lessons run in another's compiler (Math, in
 * Python's) needs that one, so its hint is that one's.
 */
type Component = (typeof CATALOG.components)[number];

/** The component that has this compiler, or the one a course runs in. */
export function componentFor(slug: string): Component | undefined {
  const id = getCourseEntry(slug)?.runsIn ?? slug;
  return CATALOG.components.find((c) => c.id === id);
}

function formatMB(mb: number): string {
  return mb >= 950 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

/** Its disk with every part it needs. With `sandbox`, the compiler sandbox
    is here already, so a compiler takes just its language. */
function size(c: Component, sandbox: boolean): number {
  const parts = c.parts.filter((p) => !(sandbox && p === "sandbox"));
  return c.mb + parts.reduce((n, p) => n + (CATALOG.parts[p as keyof typeof CATALOG.parts]?.mb ?? 0), 0);
}

/** "Add it in a terminal (about 1.1 GB): npm run add -- python". */
export function addHint(slug: string, { sandbox = false }: { sandbox?: boolean } = {}): string {
  const c = componentFor(slug);
  if (!c) return `Add it in a terminal: npm run add -- ${slug}`;
  return `Add it in a terminal (about ${formatMB(size(c, sandbox))}): npm run add -- ${c.id}`;
}
