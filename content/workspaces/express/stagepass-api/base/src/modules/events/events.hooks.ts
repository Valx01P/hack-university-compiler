// Pre-database hooks for events, registered in the hook registry and run by EventsService
// inside its transaction, just before the insert or update:
// - the title is trimmed,
// - the slug comes from the title, with -2, -3 when it is taken,
// - a draft's slug follows its title, and a published event's slug never changes, because
//   people have shared its /e/<slug> link.
import type { DbOrTx } from "../../db/tx.ts";
import type { HookRegistry } from "../../hooks/registry.ts";
import type { EventsRepository } from "./events.repository.ts";

/** "Hamlet in the Round!" becomes "hamlet-in-the-round". Accents are dropped: "Café" becomes "cafe". */
export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "event" : slug.slice(0, 80).replace(/-+$/, "");
}

/** base, then base-2, base-3, ... until one is free. exceptId lets an event keep its own slug. */
export async function uniqueSlug(
  db: DbOrTx,
  events: Pick<EventsRepository, "slugExists">,
  base: string,
  exceptId: number | null,
): Promise<string> {
  let candidate = base;
  for (let n = 2; await events.slugExists(db, candidate, exceptId); n += 1) {
    candidate = `${base}-${n}`;
  }
  return candidate;
}

export function registerEventHooks(hooks: HookRegistry, deps: { events: Pick<EventsRepository, "slugExists"> }): void {
  hooks.before("event.beforeCreate", async (payload, tx) => {
    const title = payload.draft.title.trim();
    // The same tx as the insert, so the check sees this transaction's own writes.
    const slug = await uniqueSlug(tx, deps.events, slugify(title), null);
    return { ...payload, draft: { ...payload.draft, title, slug } };
  });

  hooks.before("event.beforeUpdate", async (payload, tx) => {
    const { event, changes } = payload;
    if (changes.title === undefined) return payload;
    const title = changes.title.trim();
    if (event.status !== "draft") return { ...payload, changes: { ...changes, title } };
    const slug = await uniqueSlug(tx, deps.events, slugify(title), event.id);
    return { ...payload, changes: { ...changes, title, slug } };
  });
}
