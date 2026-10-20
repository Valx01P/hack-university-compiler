// Pre-save hooks for new orders. Nothing like an ORM provides hooks here, so the service layer
// owns them: OrderService.createOrder runs them inside its transaction, just before the
// repository writes. A hook gets the draft and returns a new draft or an error, and the
// first error stops the rest. The database's own constraints stay as the last line of
// defense.
import { validation, type DomainError } from "#domain/errors.ts";
import type { CustomerId } from "#domain/ids.ts";
import type { OrderLine } from "#domain/order.ts";
import { err, ok, type Result } from "#domain/result.ts";

export type OrderDraft = {
  readonly customerId: CustomerId;
  readonly lines: readonly OrderLine[];
  readonly note: string | null;
};

export type Hook<T> = (draft: T) => Result<T, DomainError>;

export class HookRegistry {
  readonly #beforeCreateOrder: Hook<OrderDraft>[] = [];

  /** Adds a hook. Hooks run in the order they were added. */
  beforeCreateOrder(hook: Hook<OrderDraft>): this {
    this.#beforeCreateOrder.push(hook);
    return this;
  }

  runBeforeCreateOrder(draft: OrderDraft): Result<OrderDraft, DomainError> {
    let current = draft;
    let failed: Result<OrderDraft, DomainError> | null = null;
    for (const hook of this.#beforeCreateOrder) {
      const result = hook(current);
      if (result.ok) current = result.value;
      else failed = result;
    }
    return failed ?? ok(current);
  }
}

/** Trims the note and squeezes each run of spaces to one, and refuses notes over 200 characters. */
export const normalizeNote: Hook<OrderDraft> = (draft) => {
  if (draft.note === null) return ok(draft);
  const note = draft.note.trim().replace(/\s+/g, " ");
  if (note.length > 200) return err(validation("note", "A note can be at most 200 characters"));
  return ok({ ...draft, note: note === "" ? null : note });
};

/** At most 10 of anything per line, so one order cannot empty a shelf. */
export const limitQuantity: Hook<OrderDraft> = (draft) => {
  const index = draft.lines.findIndex((line) => line.quantity > 10);
  return index === -1 ? ok(draft) : err(validation(`lines[${index}].quantity`, "At most 10 of a product per order"));
};
