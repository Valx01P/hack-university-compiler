// Enter's indentation in every editor language (lib/indent-rules.ts on top of
// each grammar): a finished line keeps its level, `;` or not, an opener goes
// one level in, what's unfinished stays the grammar's, and a YAML key ending
// its line nests the next one, and the line you leave keeps its indentation.
// Through the editors' Enter (insertNewlineKeepIndent, CodeMirror's own Enter
// underneath), on the languages lib/editor-extensions.ts's langExt picks
// (built here directly, since that module pulls in JSX).
//
//   node --import ./tests/ide/register.mjs --test tests/ide/indent.test.mjs

import assert from "node:assert/strict";
import { test } from "node:test";
import { EditorSelection, EditorState } from "@codemirror/state";
import { StreamLanguage, ensureSyntaxTree, indentUnit } from "@codemirror/language";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { go } from "@codemirror/lang-go";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { yaml } from "@codemirror/lang-yaml";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { indentRules, insertNewlineKeepIndent } from "../../lib/indent-rules.ts";

const LANGUAGES = {
  python: () => python(),
  javascript: () => javascript(),
  typescript: () => javascript({ typescript: true }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  jsx: () => javascript({ jsx: true }),
  bash: () => StreamLanguage.define(shell),
  cpp: () => cpp(),
  java: () => java(),
  go: () => go(),
  sql: () => sql({ dialect: PostgreSQL, upperCaseKeywords: true }),
  json: () => json(),
  markdown: () => markdown(),
  yaml: () => yaml(),
  css: () => css(),
  html: () => html(),
  toml: () => StreamLanguage.define(toml),
  dockerfile: () => StreamLanguage.define(dockerFile),
};

/** The document and cursor after Enter at `|`, or at the end. */
function pressEnter(language, source) {
  const at = source.includes("|") ? source.indexOf("|") : source.replace("|", "").length;
  let state = EditorState.create({
    doc: source.replace("|", ""),
    selection: EditorSelection.cursor(at),
    extensions: [LANGUAGES[language](), indentRules(language), indentUnit.of(language === "go" ? "\t" : "    "), EditorState.tabSize.of(4)],
  });
  ensureSyntaxTree(state, state.doc.length, 5000);
  insertNewlineKeepIndent({ state, dispatch: (tr) => (state = tr.state) });
  return state;
}

/** The new line's indentation (in columns, tabs as 4) after Enter at `|`, or
    at the end. */
function enter(language, source) {
  const state = pressEnter(language, source);
  const line = state.doc.lineAt(state.selection.main.head);
  const previous = state.doc.line(line.number - 1).text;
  const columns = (text) => /^[ \t]*/.exec(text)[0].replace(/\t/g, "    ").length;
  return { indent: columns(line.text), previous: columns(previous) };
}

// [language, what, source, the new line's indentation in columns, or "more"
// for further in than the line above]
const CASES = [
  ["java", "a call without its ;", 'class A {\n    void f() {\n        System.out.println(" bruh")', 8],
  ["java", "an assignment without its ;", "class A {\n    void f() {\n        int x = 5", 8],
  ["java", "a call with its ;", 'class A {\n    void f() {\n        System.out.println(" bruh");', 8],
  ["java", "a brace in a string", 'class A {\n    void f() {\n        System.out.println("{")', 8],
  ["java", "a comment line", "class A {\n    void f() {\n        // note", 8],
  ["java", "after a call over two lines", "class A {\n    void f() {\n        foo(1,\n                2);", 8],
  ["java", "an opener", "class A {\n    void f() {\n        if (x) {", 12],
  ["java", "between braces", "class A {\n    void f() {|}", 8],
  ["java", "an unfinished argument list", "class A {\n    void f() {\n        foo(1,", "more"],
  ["java", "an unfinished expression", "class A {\n    void f() {\n        int x = 1 +", "more"],
  ["javascript", "a call without its ;", 'function f() {\n    console.log("x")', 4],
  ["javascript", "a const without its ;", "function f() {\n    const x = 5", 4],
  ["javascript", "an object's last property", "const o = {\n    a: 1", 4],
  ["javascript", "a template literal", "function f() {\n    const s = `a ${b}`", 4],
  ["javascript", "closing a call over two lines", "function f() {\n    foo(1,\n        2)", 4],
  ["javascript", "an arrow before its body", "function f() {\n    const g = () =>", "more"],
  ["typescript", "a call without its ;", 'function f(): void {\n    console.log("x")', 4],
  ["typescript", "a typed let without its ;", "function f(): void {\n    let n: number = 5", 4],
  ["jsx", "a call without its ;", 'function App() {\n    console.log("x")', 4],
  ["tsx", "a call without its ;", 'function App() {\n    console.log("x")', 4],
  ["cpp", "cout without its ;", 'int main() {\n    cout << "hi"', 4],
  ["cpp", "a declaration without its ;", "int main() {\n    int x = 5", 4],
  ["cpp", "an include", "#include <iostream>", 0],
  ["cpp", "an opener", "int main() {\n    for (int i = 0; i < 3; i++) {", 8],
  ["cpp", "between braces", "int main() {|}", 4],
  ["go", "a call", 'func main() {\n\tfmt.Println("x")', 4],
  ["go", "a short declaration", "func main() {\n\tx := 5", 4],
  ["go", "an opener", "func main() {\n\tif x {", 8],
  ["python", "a call", 'def f():\n    print("x")', 4],
  ["python", "an assignment", "def f():\n    x = 5", 4],
  ["python", "a block", "def f():\n    if x:", 8],
  ["python", "an open bracket", "def f():\n    xs = [", 8],
  ["bash", "a command in a block", "if true; then\n    echo hi", 4],
  ["bash", "a top-level command", "echo hi", 0],
  ["sql", "a select line", "SELECT name", 0],
  ["sql", "inside parentheses", "INSERT INTO t (a,", "more"],
  ["css", "a declaration without its ;", "a {\n    color: red", 4],
  ["css", "a declaration with its ;", "a {\n    color: red;", 4],
  ["css", "an opener", "a {", 4],
  ["json", "a member", '{\n    "a": 1', 4],
  ["json", "an opener", '{\n    "a": {', 8],
  ["yaml", "a nested key", "a:\n    b: 1", 4],
  ["yaml", "a key opening a map", "a:", 4],
  ["yaml", "a nested key opening a map", "a:\n    b:", 8],
  ["yaml", "a list item's key", "items:\n  - name:", 8],
  ["yaml", "a colon in a string", 'a: "x:"', 0],
  ["yaml", "a colon in a comment", "a: 1 # note:", 0],
  ["html", "a child element", "<div>\n    <p>hi</p>", 4],
  ["html", "an opener", "<div>", 4],
  ["markdown", "a list item", "- one", 0],
  ["toml", "a key", "[a]\nb = 1", 0],
  ["dockerfile", "an instruction", "FROM node", 0],
];

for (const [language, what, source, want] of CASES) {
  test(`${language}: Enter after ${what}`, () => {
    const { indent, previous } = enter(language, source);
    if (want === "more") assert.ok(indent > previous, `indented ${indent}, not past ${previous}`);
    else assert.equal(indent, want);
  });
}

// The line you leave keeps its indentation (CodeMirror's own Enter takes it
// off a line that's only indentation), so going back up to it finds you at
// its level. [language, what, source with | as the cursor, the document after,
// with | where the cursor ends up]
const KEEPS = [
  ["python", "an empty line in a function keeps its indentation", "def f():\n    x = 1\n    |", "def f():\n    x = 1\n    \n    |"],
  ["java", "an empty line in a method keeps its indentation", "class A {\n    void f() {\n        |\n    }\n}", "class A {\n    void f() {\n        \n        |\n    }\n}"],
  ["go", "an empty line in a function keeps its tabs", "func main() {\n\t|\n}", "func main() {\n\t\n\t|\n}"],
  ["javascript", "the indentation before a line's code stays", "function f() {\n    |return 1\n}", "function f() {\n    \n    |return 1\n}"],
  ["javascript", "between braces opens them as before", "function f() {|}", "function f() {\n    |\n}"],
  ["python", "the end of a line of code works as before", "def f():\n    x = 1|", "def f():\n    x = 1\n    |"],
];

for (const [language, what, source, want] of KEEPS) {
  test(`${language}: Enter, ${what}`, () => {
    const state = pressEnter(language, source);
    const head = state.selection.main.head;
    assert.equal(state.doc.sliceString(0, head) + "|" + state.doc.sliceString(head), want);
  });
}
