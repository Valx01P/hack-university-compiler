// Tests for the pre-save hooks in src/services/hooks.ts: each hook on its own, and the
// registry's promise that hooks run in order and the first error stops the rest.
import assert from "node:assert/strict";
import { test } from "node:test";
import { err, ok } from "#domain/result.ts";
import { HookRegistry, limitQuantity, normalizeNote, type OrderDraft } from "#services/hooks.ts";
import { aLine, customerId } from "../helpers/builders.ts";

function draft(overrides: Partial<OrderDraft> = {}): OrderDraft {
  return { customerId: customerId("cus_01"), lines: [aLine()], note: null, ...overrides };
}

test("normalizeNote trims and squeezes spaces, and turns a blank note into null", () => {
  assert.deepEqual(normalizeNote(draft({ note: "  hello   world " })), ok(draft({ note: "hello world" })));
  assert.deepEqual(normalizeNote(draft({ note: "   " })), ok(draft({ note: null })));
});

test("normalizeNote refuses a note over 200 characters", () => {
  const result = normalizeNote(draft({ note: "x".repeat(201) }));
  assert.equal(result.ok, false);
});

test("limitQuantity names the line that asks for more than 10", () => {
  const result = limitQuantity(draft({ lines: [aLine({ quantity: 3 }), aLine({ quantity: 12 })] }));
  assert.deepEqual(result, err({ type: "validation", issues: [{ path: "lines[1].quantity", message: "At most 10 of a product per order" }] }));
});

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
