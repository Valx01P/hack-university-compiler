// Pre-save hooks for new orders. Nothing like an ORM provides hooks here, so the service layer
// owns them: OrderService.createOrder runs them inside its transaction, just before the
// repository writes. A hook gets the draft and returns a new draft or an error, and the
// first error stops the rest. The database's own constraints stay as the last line of
// defense.
import type { DomainError } from "#domain/errors.ts";
import type { CustomerId } from "#domain/ids.ts";
import type { OrderLine } from "#domain/order.ts";
import { ok, type Result } from "#domain/result.ts";

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
    for (const hook of this.#beforeCreateOrder) {
      const result = hook(current);
      if (!result.ok) return result;
      current = result.value;
    }
    return ok(current);
  }
}

// TODO (lesson 39, part 4): normalizeNote (trim, squeeze spaces, at most 200 characters)
// and limitQuantity (at most 10 per line, with the path lines[i].quantity).
