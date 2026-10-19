import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FORBID_RULES } from "../schemas.ts";
import { scanHonesty, tokenize } from "./honesty.ts";

const hits = (src: string) => scanHonesty(src, FORBID_RULES).map((h) => `${h.rule}@${h.line}:${h.col}`);

describe("honesty rules", () => {
  it("find any in type positions", () => {
    assert.deepEqual(hits("let x: any = 1;"), ["any@1:8"]);
    assert.deepEqual(hits("function f(a: any, b: Array<any>): Promise<any> {}"), ["any@1:15", "any@1:29", "any@1:44"]);
    assert.deepEqual(hits("try {} catch (e: any) {}"), ["any@1:18"]);
    assert.deepEqual(hits("type T<X> = X extends any ? 1 : 2;"), ["any@1:23"]);
  });

  it("leave names called any alone", () => {
    assert.deepEqual(hits("await Promise.any([p]);"), []);
    assert.deepEqual(hits("const o = { any: 1 };"), []);
    assert.deepEqual(hits("type O = { any?: string };"), []);
    assert.deepEqual(hits("function f(any: string) {}"), []);
    assert.deepEqual(hits("x?.any;"), []);
  });

  it("find as, except as const and renames", () => {
    assert.deepEqual(hits("const n = s as unknown as number;"), ["as@1:13", "as@1:24"]);
    assert.deepEqual(hits("const v = f() as Foo;\nconst w = a[0] as Bar;"), ["as@1:15", "as@2:16"]);
    assert.deepEqual(hits('const k = ["a", "b"] as const;'), []);
    assert.deepEqual(hits('import * as z from "zod";'), []);
    assert.deepEqual(hits('import { a as b, type C as D } from "./m.ts";'), []);
    assert.deepEqual(hits("export { a as b };\nconst y = x as T;"), ["as@2:13"]);
    assert.deepEqual(hits('export * as ns from "./m.ts";'), []);
    assert.deepEqual(hits("export type { A as B };"), []);
    assert.deepEqual(hits("const as = 1;\nf(as);\nconst o = { as: 2 };"), []);
  });

  it("find the postfix non-null assertion only", () => {
    assert.deepEqual(hits("const a = m.get(k)!;\nconst b = arr[0]!.x;\nlet c!: number;"), ["non-null@1:19", "non-null@2:17", "non-null@3:6"]);
    assert.deepEqual(hits("if (!x) {}\nconst y = a !== b && c != d;\nreturn !done;"), []);
    assert.deepEqual(hits("const t = typeof !x;\nconst u = await !y;"), []);
    assert.deepEqual(hits("this.#value!.go();"), ["non-null@1:12"]);
    assert.deepEqual(hits("const z = x\n!y;"), []);
  });

  it("find comments that silence the checker", () => {
    assert.deepEqual(hits("// @ts-ignore\nconst a = 1;"), ["ts-comments@1:1"]);
    assert.deepEqual(hits("/* @ts-expect-error */ f();"), ["ts-comments@1:1"]);
    assert.deepEqual(hits("// @ts-nocheck"), ["ts-comments@1:1"]);
    assert.deepEqual(hits("/**\n * @ts-ignore\n */"), ["ts-comments@1:1"]);
    assert.deepEqual(hits("// @ts-check\n// a note about @ts-ignore\n/// <reference types=\"node\" />"), []);
  });

  it("skip strings, template text, regular expressions, and comments", () => {
    assert.deepEqual(hits('const s = "x as any!";\nconst t = \'as any\';'), []);
    assert.deepEqual(hits("const u = `as any ${n} any!`;"), []);
    assert.deepEqual(hits("const re = /as any!/g;\nconst ok = re.test(s);"), []);
    assert.deepEqual(hits("// const x = y as any;\n/* z! */"), []);
  });

  it("check the code inside a template's ${...}", () => {
    assert.deepEqual(hits("const u = `total ${(n as number) + 1} and ${m!}`;"), ["as@1:23", "non-null@1:46"]);
    assert.deepEqual(hits("const u = `a ${`b ${x as T}`}`;"), ["as@1:23"]);
    assert.deepEqual(hits("const u = `${ { a: 1 }.a } then ${y!}`;"), ["non-null@1:36"]);
  });

  it("tell division from a regular expression", () => {
    assert.deepEqual(hits("const half = total / 2 / count;\nconst r = (a as number) / 2;"), ["as@2:14"]);
    assert.deepEqual(hits("return /x!/.test(s);"), []);
  });

  it("report only the rules asked for", () => {
    const src = "// @ts-ignore\nconst a: any = b as C;\nconst d = e!;";
    assert.deepEqual(scanHonesty(src, ["as"]).map((h) => h.rule), ["as"]);
    assert.deepEqual(scanHonesty(src, []), []);
  });

  it("tokenizes across lines with positions", () => {
    const tokens = tokenize("const a = 1;\n  b!");
    const bang = tokens.find((t) => t.value === "!");
    assert.equal(bang?.line, 2);
    assert.equal(bang?.col, 4);
  });
});
