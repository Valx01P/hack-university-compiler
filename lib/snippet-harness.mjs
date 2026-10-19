// Runnable snippets: how a code block in a lesson or a cheatsheet becomes a
// program the sandbox can run. Shared by the app (components/learn/
// runnable-snippet.tsx) and the checker (scripts/verify-snippets.mjs), so the
// two always agree.
//
// The Markdown, by fence info string:
//
//   ```python            runnable, on the runtime its course gives the fence
//   ```python error      runnable, and meant to fail (it shows an error)
//   ```python norun      shown only (a fragment that can't run on its own)
//   ```typescript dom    shown only for now: it needs a page's DOM, which
//                        page lessons bring later
//   ```python harness    hidden: wraps the next runnable snippet. Its line
//                        holding just {{code}} becomes the snippet, indented
//                        like that line.
//   ```stdin             hidden: the next runnable snippet's input
//
// C++, Java, and Go snippets that aren't whole programs get one
// automatically (includes or imports, the snippet's functions and types at
// the top level, and its statements inside main). That happens after the
// harness is filled in, so a harness can be just the context a snippet
// needs, like a struct or a few variables, or a whole program. Python,
// JavaScript, TypeScript, SQL, and Bash run as written.

import registry from "../content/courses.json" with { type: "json" };

// The courses with a compiler page, and the one whose page runs each runtime
// (piston:python is /python's, runner:typescript is /typescript's).
const COURSES = new Map(registry.courses.filter((c) => c.page).map((c) => [c.slug, c]));
const RUNS = new Map();
for (const c of COURSES.values()) if (!RUNS.has(c.runtime)) RUNS.set(c.runtime, c.slug);

/**
 * Where a fence in a course's lessons and cheatsheet runs: the runtime the
 * course's `fences` in content/courses.json give it, through the course
 * itself when that's its own runtime, or else through the course whose page
 * runs it. So a ```python block runs on Piston in /python, and on the
 * fastapi recipe in /fastapi once that course ships. Null when it's shown
 * only: a fence the course lists as null or doesn't list, or Markdown
 * outside a course.
 */
export function fenceRuntime(language, course) {
  const own = COURSES.get(course);
  const runtime = own && Object.hasOwn(own.fences ?? {}, language) ? own.fences[language] : null;
  if (!runtime) return null;
  return runtime === own.runtime ? own.slug : (RUNS.get(runtime) ?? null);
}

/**
 * Splits a course's Markdown into text and code segments. A code segment has
 * its language (the fence's first word), its runtime (fenceRuntime: null
 * when it doesn't run), whether it's meant to fail, and the hidden harness
 * and stdin written for it. Hidden fences are never segments themselves:
 * each attaches to the next runnable fence.
 */
export function segmentMarkdown(md, course = null) {
  const segments = [];
  const parts = md.split(/^```/m);
  let harness = null;
  let stdin = null;
  parts.forEach((part, i) => {
    if (i % 2 === 0) {
      if (part.trim()) segments.push({ type: "lines", content: part });
      return;
    }
    const nl = part.indexOf("\n");
    const info = (nl < 0 ? part : part.slice(0, nl)).trim();
    const content = nl < 0 ? "" : part.slice(nl + 1).replace(/\n$/, "");
    const [first = "", ...rest] = info.split(/\s+/);
    const language = first.toLowerCase() || "text";
    const flags = new Set(rest.map((f) => f.toLowerCase()));
    if (language === "stdin") {
      stdin = content;
      return;
    }
    if (flags.has("harness")) {
      harness = content;
      return;
    }
    const runtime = flags.has("norun") || flags.has("dom") ? null : fenceRuntime(language, course);
    segments.push({
      type: "fence",
      language,
      content,
      runtime,
      expectError: flags.has("error"),
      harness: runtime ? harness : null,
      stdin: runtime ? stdin : null,
    });
    if (runtime) {
      harness = null;
      stdin = null;
    }
  });
  return segments;
}

/** The program to run for a snippet: its harness filled in, then for C++,
    Java, and Go fragments, wrapped into a whole program. */
export function buildProgram(runtime, code, harness = null) {
  const program = harness ? applyHarness(harness, code) : code;
  if (runtime === "cpp") return wrapCpp(program);
  if (runtime === "java") return wrapJava(program);
  if (runtime === "go") return wrapGo(program);
  return program;
}

/** Puts the snippet where the harness's {{code}} line is, at its indent. */
export function applyHarness(harness, code) {
  const lines = harness.split("\n");
  const at = lines.findIndex((l) => l.trim() === "{{code}}");
  if (at < 0) return harness;
  const indent = lines[at].match(/^\s*/)[0];
  const body = code.split("\n").map((l) => (l.trim() ? indent + l : l));
  return [...lines.slice(0, at), ...body, ...lines.slice(at + 1)].join("\n");
}

// --- Splitting C-family code into top-level items --------------------------

/** Removes strings, chars, and comments (keeping line breaks), so bracket
    counting and keyword checks only see code. */
function codeOnly(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, "")
    .replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`[^`]*`/g, (m) => '""'.padEnd(m.length, " "));
}

/**
 * Top-level items: each starts on a line at bracket depth 0 and runs until
 * its brackets close and it ends a statement, so a multi-line function or
 * call stays one item. A statement ends with ; or a closing brace, or for Go
 * (`newlineEnds`) at any line end that isn't an operator, a comma, or an
 * open bracket. Leading comments and blank lines stay with the item after
 * them.
 */
function topLevelItems(code, newlineEnds = false) {
  const items = [];
  let lines = [];
  let depth = 0;
  for (const line of code.split("\n")) {
    lines.push(line);
    const bare = codeOnly(line);
    for (const ch of bare) {
      if (ch === "{" || ch === "(" || ch === "[") depth++;
      else if (ch === "}" || ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    }
    const trimmed = bare.trim();
    const ends = /[;}]$/.test(trimmed) || /^#/.test(trimmed) || (newlineEnds && !/[-+*/%&|^<>=!,.(\[{:]$/.test(trimmed));
    if (depth === 0 && trimmed && ends) {
      items.push(lines.join("\n"));
      lines = [];
    }
  }
  if (lines.some((l) => l.trim())) items.push(lines.join("\n"));
  return items;
}

const CONTROL = /^(?:if|for|while|switch|return|else|do|try|catch|throw|delete|new|case|default|break|continue|goto|synchronized|assert|yield|defer|go|select)\b/;

/** Whether an item starts with a function or method definition: a return
    type, a name, its parameters, then the body. */
function isFunctionDefinition(item) {
  const bare = codeOnly(item).trim();
  const head = bare.slice(0, bare.indexOf("{") + 1);
  if (!head || CONTROL.test(bare)) return false;
  const m = /^([^=;{}()]*?)\b(operator\s*\S+?|[\w:~]+)\s*\(([^;{}]*)\)\s*(?:const\b\s*|noexcept\b\s*|override\b\s*|throws\s+[\w.,\s]+)*(?:->\s*[^{;]+)?\{$/.exec(head);
  if (!m) return false;
  // A return type (or a qualified name, for constructors) before the name.
  return /\w/.test(m[1]) || m[2].includes("::");
}

// --- C++ -------------------------------------------------------------------

function wrapCpp(code) {
  if (/\bmain\s*\(/.test(codeOnly(code))) return code;
  const prelude = [];
  const declarations = [];
  const statements = [];
  for (const item of topLevelItems(code)) {
    const bare = codeOnly(item).trim();
    if (/^#/.test(bare)) prelude.push(item);
    else if (
      /^(?:using|typedef|namespace|template|struct|class|union|enum)\b/.test(bare) ||
      isFunctionDefinition(item) ||
      // A static member defined outside its class: int Counter::count = 0;
      /^(?:(?:const|constexpr|inline|static)\s+)*[\w:<>,]+[\s*&]+\w+(?:<[^>]*>)?::\w+\s*(?:=|;|\{)/.test(bare)
    ) {
      declarations.push(item);
    } else statements.push(item);
  }
  return [
    "#include <bits/stdc++.h>",
    ...prelude,
    "using namespace std;",
    "",
    ...declarations,
    "int main() {",
    ...statements.map((s) => indent(s)),
    "    return 0;",
    "}",
  ].join("\n");
}

// --- Java ------------------------------------------------------------------

const JAVA_IMPORTS = [
  "import java.util.*;",
  "import java.util.function.*;",
  "import java.util.stream.*;",
  "import java.io.*;",
  "import java.math.*;",
];

/** Adds a word before an item's first line of code (after its indent),
    skipping comment lines above it. */
function prefixCode(item, word) {
  const lines = item.split("\n");
  const at = lines.findIndex((l) => codeOnly(l).trim());
  if (at < 0) return item;
  lines[at] = lines[at].replace(/^(\s*)/, `$1${word} `);
  return lines.join("\n");
}

function wrapJava(code) {
  if (/\bstatic\s+void\s+main\s*\(/.test(codeOnly(code))) return code;
  const imports = [];
  const members = [];
  const statements = [];
  for (const item of topLevelItems(code)) {
    const bare = codeOnly(item).trim().replace(/^(?:@\w+(?:\([^)]*\))?\s+)*/, "");
    const modifiers = /^((?:(?:public|private|protected|static|final|abstract)\s+)*)/.exec(bare)[1];
    const rest = bare.slice(modifiers.length);
    if (/^import\s/.test(bare)) imports.push(item);
    else if (/^(?:class|interface|enum|record)\b/.test(rest)) {
      // Nested in Main: a class must be static to be made from main.
      members.push(/^class\b/.test(rest) && !/\bstatic\b/.test(modifiers) ? prefixCode(item, "static") : item);
    } else if (isFunctionDefinition(item)) {
      members.push(/\bstatic\b/.test(modifiers) ? item : prefixCode(item, "static"));
    } else if (modifiers.trim() && modifiers.trim() !== "final") {
      // A field. (`final` alone is a constant local to main.)
      members.push(item);
    } else statements.push(item);
  }
  return [
    ...JAVA_IMPORTS,
    ...imports,
    "",
    "public class Main {",
    ...members.map((m) => indent(m)),
    "    public static void main(String[] args) throws Exception {",
    ...statements.map((st) => indent(st, 8)),
    "    }",
    "}",
  ].join("\n");
}

// --- Go --------------------------------------------------------------------

const GO_PACKAGES = {
  fmt: "fmt", strings: "strings", strconv: "strconv", sort: "sort", math: "math", os: "os", bufio: "bufio",
  errors: "errors", unicode: "unicode", time: "time", regexp: "regexp", bytes: "bytes", sync: "sync",
  heap: "container/heap", list: "container/list", ring: "container/ring", big: "math/big", rand: "math/rand",
  bits: "math/bits", utf8: "unicode/utf8", json: "encoding/json",
};

function wrapGo(code) {
  if (/^\s*package\s+\w+/m.test(codeOnly(code))) return code;
  const bareAll = codeOnly(code);
  const imports = new Set();
  const declarations = [];
  const statements = [];
  for (const item of topLevelItems(code, true)) {
    const bare = codeOnly(item).trim();
    if (/^import\b/.test(bare)) {
      for (const m of item.matchAll(/"([^"]+)"/g)) imports.add(m[1]);
    } else if (/^(?:func|type)\b/.test(bare)) declarations.push(item);
    else statements.push(item);
  }
  // A var or const that a function uses goes at the package level, where
  // the function can see it.
  const declarationCode = codeOnly(declarations.join("\n"));
  for (let i = statements.length - 1; i >= 0; i--) {
    const bare = codeOnly(statements[i]).trim();
    const block = /^(?:var|const)\s*\(([\s\S]*)\)$/.exec(bare);
    const names = block
      ? [...block[1].matchAll(/^\s*(\w+)/gm)].map((m) => m[1])
      : (/^(?:var|const)\s+(\w+(?:\s*,\s*\w+)*)/.exec(bare)?.[1].split(",").map((n) => n.trim()) ?? []);
    if (names.some((n) => new RegExp(`\\b${n}\\b`).test(declarationCode))) declarations.unshift(...statements.splice(i, 1));
  }
  // Packages the snippet uses but doesn't import (a local variable with the
  // same name, like `list`, doesn't count).
  for (const [name, path] of Object.entries(GO_PACKAGES)) {
    const declaredLocally = new RegExp(`(?:\\b${name}\\s*(?::=|,)|\\bvar\\s+${name}\\b|\\b${name}\\s+\\w+\\s*[,)])`).test(bareAll);
    if (new RegExp(`(?<![\\w.])${name}\\.[A-Z]`).test(bareAll) && !declaredLocally) imports.add(path);
  }
  // Go refuses unused variables: use each one main declares at its top
  // level (not ones scoped to an if, for, or switch header).
  const declared = [];
  for (const st of statements) {
    const first = codeOnly(st).trim();
    const m = /^(\w+(?:\s*,\s*\w+)*)\s*:=/.exec(first) ?? /^var\s+(\w+(?:\s*,\s*\w+)*)\b/.exec(first);
    if (!m || /^(?:if|for|switch|select|go|defer|return|case|else)$/.test(m[1].split(",")[0].trim())) continue;
    for (const name of m[1].split(",").map((n) => n.trim())) if (name !== "_") declared.push(name);
  }
  return [
    "package main",
    "",
    ...(imports.size ? ["import (", ...[...imports].map((p) => `\t"${p}"`), ")", ""] : []),
    ...declarations,
    "func main() {",
    ...statements.map((s) => indent(s, 1, "\t")),
    ...[...new Set(declared)].map((name) => `\t_ = ${name}`),
    "}",
  ].join("\n");
}

function indent(text, n = 4, unit = " ") {
  const pad = unit.repeat(n);
  return text
    .split("\n")
    .map((l) => (l.trim() ? pad + l : l))
    .join("\n");
}
