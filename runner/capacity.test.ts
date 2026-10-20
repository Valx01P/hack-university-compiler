import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Capacity, type CapacityFacts } from "./capacity.ts";

/** The memory budget (architecture §4.7): admission, LRU stops of hidden workspaces, and the queue. */

const GiB = 1024 ** 3;
const facts = (memTotal: number, piston = true): (() => CapacityFacts) => () => ({ memTotal, piston, postgres: false, mongo: false, checkSlot: 1 * GiB });

describe("capacity", () => {
  it("takes headroom, Piston, and the check slot off Docker's memory", () => {
    const cap = new Capacity(facts(7.75 * GiB), null);
    assert.equal(cap.budget(), 7.75 * GiB - 0.5 * GiB - 2 * GiB - 1 * GiB);
    assert.equal(new Capacity(facts(7.75 * GiB, false), null).budget(), 7.75 * GiB - 0.5 * GiB - 1 * GiB);
    assert.equal(new Capacity(facts(7.75 * GiB), 3000).budget(), 3000 * 1024 * 1024);
  });

  it("fits four 1 GiB TypeScript workspaces on the 7.75 GiB floor, stops a hidden one for a fifth, and queues when none is hidden", async () => {
    const cap = new Capacity(facts(7.75 * GiB), null);
    const running = new Map<string, { lastActive: number; hidden: boolean }>();
    const stopped: string[] = [];
    const deps = (hidden: string[]) => ({
      candidates: () => [...running].filter(([id]) => hidden.includes(id)).map(([id, w]) => ({ id, lastActive: w.lastActive })),
      stop: async (id: string) => {
        stopped.push(id);
        running.delete(id);
        cap.release(id);
      },
      waiting: () => {},
    });
    for (const [i, id] of ["a", "b", "c", "d"].entries()) {
      await cap.admit(id, 1 * GiB, deps([]));
      running.set(id, { lastActive: i, hidden: false });
    }
    assert.equal(cap.reserved(), 4 * GiB);
    // A fifth: b and c are hidden, b least recently active, so b stops.
    await cap.admit("e", 1 * GiB, deps(["c", "b"]));
    assert.deepEqual(stopped, ["b"]);
    running.set("e", { lastActive: 9, hidden: false });
    // A sixth with nothing hidden waits, then goes when memory frees.
    let waited = "";
    let admitted = false;
    const sixth = cap.admit("f", 1 * GiB, { ...deps([]), waiting: (d) => (waited = d) }).then(() => (admitted = true));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(admitted, false);
    assert.match(waited, /^Waiting for memory: 4 workspaces you have open use 4 of 4\.25 GiB$/);
    assert.equal(cap.queued, 1);
    cap.release("a");
    await sixth;
    assert.equal(admitted, true);
  });

  it("runs one check in the reserved slot, and a second only with room", async () => {
    const cap = new Capacity(facts(7.75 * GiB), null);
    await cap.admit("a", 4 * GiB, { candidates: () => [], stop: async () => {}, waiting: () => {} });
    const one = await cap.admitCheck(1 * GiB);
    let second = false;
    const two = cap.admitCheck(1 * GiB).then((release) => {
      second = true;
      return release;
    });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(second, false, "no room beyond the slot");
    one();
    (await two)();
    assert.equal(second, true);
  });
});
