// What a sandbox run sends (lib/source-file.mjs): JavaScript that awaits at
// its top level runs as a module, and Java whose main sits after another type
// gets the hint naming the class to run (scripts/piston-extras/java/run).
//
//   node --import ./tests/ide/register.mjs --test tests/ide/source-file.test.mjs

import assert from "node:assert/strict";
import { test } from "node:test";
import { JAVA_ENTRY_FILE, isEsModule, javaEntry, sourceFiles } from "../../lib/source-file.mjs";

const MAIN = "public static void main(String[] args) {}";

// [what, Java source, the entry it needs, or null for the launcher's own way]
const JAVA = [
  ["main in the only class", `public class Main { ${MAIN} }`, null],
  ["a helper class first", `class Helper { int f() { return 1; } }\npublic class Main { ${MAIN} }`, { run: "Main", file: "Main" }],
  ["an interface, an enum, and a record first", `interface S {}\nenum E { A { void f() {} }, B }\nrecord P(int x) {}\nclass Main { ${MAIN} }`, { run: "Main", file: "Main" }],
  ["a public class that isn't Main", `class H {}\npublic class Solution { public static void main(String... args) {} }`, { run: "Solution", file: "Solution" }],
  ["a package line", `package app;\nclass H {}\npublic class Main { static public void main(String[] a) {} }`, { run: "app.Main", file: "Main" }],
  ["a non-static main first, past a static block", `class A { static {} void main(String[] a) {} }\npublic class Main { ${MAIN} }`, { run: "Main", file: "Main" }],
  ["braces and a main in strings and comments", `class H { String s = "} class X { ${MAIN}"; /* } */ }\npublic class Main { ${MAIN} }`, { run: "Main", file: "Main" }],
  ["a text block", `class H { String t = """\n  } class Z {\n  """; }\npublic class Main { ${MAIN} }`, { run: "Main", file: "Main" }],
  ["main only in a nested class", `class H {}\npublic class Main { static class Inner { ${MAIN} } }`, null],
  ["no main at all", "class A {}\nclass B {}", null],
];

for (const [what, code, want] of JAVA) {
  test(`java: ${what}`, () => assert.deepEqual(javaEntry(code), want));
}

test("java: the hint goes along only when it's needed", () => {
  assert.deepEqual(sourceFiles("java", `public class Main { ${MAIN} }`), [{ name: "Main", content: `public class Main { ${MAIN} }` }]);
  const code = `class H {}\npublic class Main { ${MAIN} }`;
  assert.deepEqual(sourceFiles("java", code), [
    { name: "Main", content: code },
    { name: JAVA_ENTRY_FILE, content: "Main\nMain\n" },
  ]);
});

// [what, JavaScript source, whether it runs as a module]
const JS = [
  ["require", 'const fs = require("fs");', false],
  ["an import", 'import fs from "fs";', true],
  ["an export", "export const x = 1;", true],
  ["a top-level await", "const x = await f();", true],
  ["a top-level for await", "for await (const y of z) {}", true],
  ["an await in an object's value", "const o = { a: await q() };", true],
  ["an await in an async function, with require", 'const fs = require("fs");\nasync function main() { await x(); }\nmain();', false],
  ["an await in an arrow", "const k = async () => await m();", false],
  ["an await in a method", "class C { async r() { await s(); } }\nconst o = { async p() { await q(); } };", false],
  ["await in a string", 'console.log("await me");', false],
];

for (const [what, code, want] of JS) {
  test(`javascript: ${what} ${want ? "runs as a module" : "stays a script"}`, () => assert.equal(isEsModule(code), want));
}
