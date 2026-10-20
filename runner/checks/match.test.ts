import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fill, jsonPath, matchJson } from "./match.ts";
import { tscLocation } from "./run.ts";

describe("check matchers", () => {
  it("match a subset, with placeholders for kinds of values", () => {
    const body = { id: 42, title: "t6", tags: ["a", "b"], owner: { id: "5f0c7a52-6f1e-4a0c-9c1e-0a2b3c4d5e6f" }, at: "2026-10-01T09:00:00Z", done: false };
    assert.equal(matchJson({ id: "$int", title: "t6" }, body), null);
    assert.equal(matchJson({ tags: "$len:2", owner: { id: "$uuid" }, at: "$rfc3339", done: "$bool" }, body), null);
    assert.equal(matchJson({ missing: "$absent", id: "$any" }, body), null);
    assert.equal(matchJson({ title: "$int" }, body), '$.title: expected a whole number, got "t6"');
    assert.equal(matchJson({ tags: ["a"] }, body), "$.tags: expected 1 items, got 2");
    assert.equal(matchJson({ owner: { id: 1 } }, body), '$.owner.id: expected 1, got "5f0c7a52-6f1e-4a0c-9c1e-0a2b3c4d5e6f"');
    assert.equal(matchJson({ id: "$absent" }, body), "$.id: expected nothing, got 42");
  });

  it("refuse extra keys only when exact", () => {
    assert.equal(matchJson({ a: 1 }, { a: 1, b: 2 }), null);
    assert.equal(matchJson({ a: 1 }, { a: 1, b: 2 }, true), "$.b: not expected, got 2");
  });

  it("save values by JSONPath and fill them in later", () => {
    const saved = { id: jsonPath({ items: [{ id: 7 }] }, "$.items[0].id") };
    assert.equal(saved.id, 7);
    assert.deepEqual(fill({ path: "/tasks/{{id}}", json: { parent: "{{id}}", keep: "{{nope}}" } }, saved), {
      path: "/tasks/7",
      json: { parent: "7", keep: "{{nope}}" },
    });
  });

  it("find tsc's first error location", () => {
    assert.deepEqual(tscLocation("src/a.ts(12,7): error TS2322: Type 'string' is not assignable to type 'number'.\n"), { file: "src/a.ts", line: 12, col: 7 });
    assert.equal(tscLocation("all good"), undefined);
  });
});
