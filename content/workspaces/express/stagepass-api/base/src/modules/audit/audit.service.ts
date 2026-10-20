// The audit trail, written by after-write hooks. Each row goes in through the same transaction
// as the change it records: if the change rolls back, so does its row, and if it commits, the
// row is always there. So the trail never claims something that did not happen.
import type { DbOrTx } from "../../db/tx.ts";
import type { HookRegistry } from "../../hooks/registry.ts";
import type { AuditRepository, NewAuditEntry } from "./audit.repository.ts";

export class AuditService {
  readonly #audit: AuditRepository;

  constructor(audit: AuditRepository) {
    this.#audit = audit;
  }

  /** Records one entry using the caller's transaction (never a separate connection). */
  record(tx: DbOrTx, entry: NewAuditEntry): Promise<void> {
    return this.#audit.insert(tx, entry);
  }
}

export function registerAuditHooks(hooks: HookRegistry, audit: AuditService): void {
  hooks.after("event.published", ({ event, actor }, tx) =>
    audit.record(tx, {
      actorId: actor.id,
      action: "event.published",
      entity: "event",
      entityId: event.id,
      data: { from: "draft", to: "published" },
    }),
  );

  hooks.after("event.cancelled", ({ event, previousStatus, cancelledOrderIds, actor }, tx) =>
    audit.record(tx, {
      actorId: actor.id,
      action: "event.cancelled",
      entity: "event",
      entityId: event.id,
      data: { from: previousStatus, to: "cancelled", cancelledOrderIds },
    }),
  );

  hooks.after("order.paid", ({ order, actor }, tx) =>
    audit.record(tx, {
      actorId: actor.id,
      action: "order.paid",
      entity: "order",
      entityId: order.id,
      data: { to: "paid", totalCents: order.totalCents },
    }),
  );

  hooks.after("order.cancelled", ({ order, actor }, tx) =>
    audit.record(tx, {
      actorId: actor.id,
      action: "order.cancelled",
      entity: "order",
      entityId: order.id,
      data: { from: "paid", to: "cancelled" },
    }),
  );
}
