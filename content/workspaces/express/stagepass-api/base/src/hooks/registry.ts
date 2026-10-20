// The service layer's pre and post database hooks. Drizzle has no model hooks (nothing like
// Mongoose's pre("save")), so services announce what they are about to write, or just wrote,
// and other modules attach behavior without the service knowing about it:
//
//   hooks.before("event.beforeCreate", fn)   may return a changed payload: fill in a slug
//   hooks.after("order.paid", fn)            reacts to a write: record an audit row
//
// A service calls hooks.run(name, payload, tx) inside its transaction and every hook gets that
// same tx, so whatever a hook writes commits or rolls back together with the change itself.
import type { Tx } from "../db/tx.ts";
import type { AuthUser } from "../http/auth.ts";
import type { Event, EventChanges, NewEventDraft } from "../modules/events/events.repository.ts";
import type { Order, OrderItem } from "../modules/orders/orders.repository.ts";

/** Every hook name and the payload its hooks receive. */
export interface HookPayloads {
  "event.beforeCreate": { draft: NewEventDraft; actor: AuthUser };
  "event.beforeUpdate": { event: Event; changes: EventChanges; actor: AuthUser };
  "event.published": { event: Event; actor: AuthUser };
  "event.cancelled": { event: Event; previousStatus: Event["status"]; cancelledOrderIds: number[]; actor: AuthUser };
  "order.paid": { order: Order; items: OrderItem[]; actor: AuthUser };
  "order.cancelled": { order: Order; items: OrderItem[]; actor: AuthUser };
}

export type HookName = keyof HookPayloads;

export type BeforeHook<N extends HookName> = (
  payload: HookPayloads[N],
  tx: Tx,
) => HookPayloads[N] | void | Promise<HookPayloads[N] | void>;

export type AfterHook<N extends HookName> = (payload: HookPayloads[N], tx: Tx) => void | Promise<void>;

type BeforeHooks = { [N in HookName]?: BeforeHook<N>[] };
type AfterHooks = { [N in HookName]?: AfterHook<N>[] };

export class HookRegistry {
  readonly #before: BeforeHooks = {};
  readonly #after: AfterHooks = {};

  /** Runs before the write. Returning a payload replaces it for later hooks and the service. */
  before<N extends HookName>(name: N, hook: BeforeHook<N>): this {
    const hooks: BeforeHook<N>[] = this.#before[name] ?? [];
    hooks.push(hook);
    this.#before[name] = hooks as BeforeHooks[N];
    return this;
  }

  /** Runs after the before hooks, with the final payload. Throwing rolls the transaction back. */
  after<N extends HookName>(name: N, hook: AfterHook<N>): this {
    const hooks: AfterHook<N>[] = this.#after[name] ?? [];
    hooks.push(hook);
    this.#after[name] = hooks as AfterHooks[N];
    return this;
  }

  /** Runs every hook registered for name, in the order they were added, and returns the final payload. */
  async run<N extends HookName>(name: N, payload: HookPayloads[N], tx: Tx): Promise<HookPayloads[N]> {
    let current = payload;
    for (const hook of (this.#before[name] ?? []) as BeforeHook<N>[]) {
      const changed = await hook(current, tx);
      if (changed !== undefined) current = changed;
    }
    for (const hook of (this.#after[name] ?? []) as AfterHook<N>[]) {
      await hook(current, tx);
    }
    return current;
  }

  /** How many hooks are registered for name, which tests and the startup log use. */
  count(name: HookName): number {
    return (this.#before[name]?.length ?? 0) + (this.#after[name]?.length ?? 0);
  }
}
