// Tests for the hook registry in src/services/hooks.ts: hooks run in order, and the first
// error stops the rest.
import assert from "node:assert/strict";
import { test } from "node:test";
import { err, ok } from "#domain/result.ts";
import { HookRegistry, type OrderDraft } from "#services/hooks.ts";
import { aLine, customerId } from "../helpers/builders.ts";

function draft(overrides: Partial<OrderDraft> = {}): OrderDraft {
  return { customerId: customerId("cus_01"), lines: [aLine()], note: null, ...overrides };
}

test("hooks run in the order they were added, and the first error stops the rest", () => {
  const ran: string[] = [];
  const registry = new HookRegistry()
    .beforeCreateOrder((d) => {
      ran.push("first");
      return ok({ ...d, note: "from the first hook" });
    })
    .beforeCreateOrder((d) => {
      ran.push(`second saw ${String(d.note)}`);
      return err({ type: "validation", issues: [{ path: "note", message: "no" }] });
    })
    .beforeCreateOrder((d) => {
      ran.push("third");
      return ok(d);
    });
  assert.equal(registry.runBeforeCreateOrder(draft()).ok, false);
  assert.deepEqual(ran, ["first", "second saw from the first hook"]);
});
