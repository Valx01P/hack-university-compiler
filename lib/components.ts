import CATALOG from "@/lib/components.json";

/**
 * The compilers and courses npm run up can leave out (lib/components.json,
 * which npm run add and npm run status read too), for the hints that say how
 * to add one: about how much disk it takes, and the command. npm run add
 * takes a course's or compiler's own slug (react adds the web courses).
 */
type Component = (typeof CATALOG.components)[number];

/** The component that has this compiler or course. */
export function componentFor(slug: string): Component | undefined {
  return CATALOG.components.find((c) => c.id === slug) ?? CATALOG.components.find((c) => c.courses?.includes(slug));
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

/**
 * "Add it in a terminal (about 1.1 GB): npm run add -- python". A course's
 * size is "up to": parts another course already brought aren't downloaded
 * again.
 */
export function addHint(slug: string, { sandbox = false }: { sandbox?: boolean } = {}): string {
  const c = componentFor(slug);
  if (!c) return `Add it in a terminal: npm run add -- ${slug}`;
  return `Add it in a terminal (${c.piston ? "about" : "up to"} ${formatMB(size(c, sandbox))}): npm run add -- ${slug}`;
}
