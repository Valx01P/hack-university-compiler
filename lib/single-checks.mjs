// Checks for single-file practices on the runner (TypeScript, Bash, and the
// stack courses): how one Check's report becomes a verdict. Shared by the app
// (components/learn/part-view.tsx) and the checker (scripts/verify-lessons.mjs),
// so the two always agree. The runner only runs programs. Everything judged
// here comes back in its report:
//
//   { compile: { code, output },                       the type check, once
//     results: [{ stdout, stderr, code, signal,       one per test, in order
//                 status, files }],
//     typeTests: [{ name, diagnostics }],             one per type-test case
//     typeTestImports: [diagnostic] }                 the import line's own
//
// `files` maps each path a test names (in `files` or `absent`) to its
// contents after the run, or null when it doesn't exist. A diagnostic is
// { line, col, code, message }.

import { applyHarness } from "./snippet-harness.mjs";

/** How outputs are compared: trailing spaces on a line and trailing blank
    lines don't count. */
export function normalizeOutput(s) {
  return String(s ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

/** The line a TypeScript program's try-it section starts after. */
export const TRY_IT_LINE = "// --- try it ---";

/**
 * The program one test runs: the code as written, or inside the test's
 * hidden harness, or with the test's hidden calls in place of everything
 * after the code's try-it line. Null when the test needs that line and the
 * code no longer has it.
 */
export function programForTest(code, test) {
  if (test.tryIt != null) {
    const lines = code.split("\n");
    const at = lines.findIndex((l) => l.trim() === TRY_IT_LINE);
    if (at < 0) return null;
    return `${[...lines.slice(0, at + 1), test.tryIt.replace(/\n+$/, "")].join("\n")}\n`;
  }
  if (test.harness != null) return applyHarness(test.harness, code);
  if (test.append != null) return applyHarness(`{{code}}\n${test.append}`, code);
  return code;
}

/** The paths a test needs read back after its run. */
export function pathsToRead(test) {
  return [...Object.keys(test.files ?? {}), ...(test.absent ?? [])];
}

/**
 * One test's verdict from its result. Output is compared as always. The exit
 * status must be the test's `exitCode` (0 when it has none), stderr must
 * contain `stderrIncludes`, every file in `files` must hold exactly its
 * text, and nothing in `absent` may exist.
 */
export function judgeTest(test, result, program = "") {
  if (program === null) {
    return {
      passed: false,
      problem: `Keep the ${TRY_IT_LINE} line: the tests replace everything after it with their own calls.`,
      output: null,
      exit: null,
      stderrIncludes: null,
      files: [],
      absent: [],
      timedOut: false,
    };
  }
  const timedOut = result.status === "TO";
  const outputPassed = !timedOut && normalizeOutput(result.stdout) === normalizeOutput(test.output);
  const expectedCode = test.exitCode ?? 0;
  const exitPassed = !timedOut && !result.signal && result.code === expectedCode;
  const stderrIncludes =
    test.stderrIncludes != null
      ? { text: test.stderrIncludes, passed: String(result.stderr ?? "").includes(test.stderrIncludes) }
      : null;
  const read = result.files ?? {};
  const files = Object.entries(test.files ?? {}).map(([path, expected]) => {
    const actual = read[path] ?? null;
    return { path, expected, actual, passed: actual !== null && normalizeOutput(actual) === normalizeOutput(expected) };
  });
  const absent = (test.absent ?? []).map((path) => ({ path, passed: read[path] == null }));
  const passed =
    outputPassed &&
    exitPassed &&
    (stderrIncludes?.passed ?? true) &&
    files.every((f) => f.passed) &&
    absent.every((a) => a.passed);
  return {
    passed,
    problem: null,
    output: { expected: test.output, actual: result.stdout ?? "", passed: outputPassed },
    exit: { expected: expectedCode, actual: result.code ?? null, signal: result.signal ?? null, passed: exitPassed },
    stderrIncludes,
    files,
    absent,
    timedOut,
  };
}

/**
 * The type-test file: the practice's import line, then each case in a block
 * of its own, so a diagnostic belongs to the case whose lines it falls in.
 */
export function typeTestFile(typeTests) {
  const lines = typeTests.imports.replace(/\n+$/, "").split("\n");
  const imports = { from: 1, to: lines.length };
  const ranges = typeTests.cases.map((c) => {
    const from = lines.length + 1;
    lines.push("{", ...c.code.replace(/\n+$/, "").split("\n").map((l) => `  ${l}`), "}");
    return { name: c.name, from, to: lines.length };
  });
  return { source: `${lines.join("\n")}\n`, imports, ranges };
}

/** Sorts the type-test file's diagnostics into its cases (by line), and the
    ones on the import line, which mean the program broke the contract. */
export function sortTypeTestDiagnostics(file, diagnostics) {
  const inRange = (d, r) => d.line >= r.from && d.line <= r.to;
  return {
    imports: diagnostics.filter((d) => inRange(d, file.imports)),
    cases: file.ranges.map((r) => ({ name: r.name, diagnostics: diagnostics.filter((d) => inRange(d, r)) })),
  };
}

/**
 * Each type-test case's verdict. An `ok` case passes with no diagnostics. An
 * `error` case passes with at least one (one with its `errorCode`, when it
 * has one). A diagnostic on the import line fails them all: the program no
 * longer exports what the cases use.
 */
export function judgeTypeTests(typeTests, report, importDiagnostics = []) {
  const byName = new Map((report ?? []).map((r) => [r.name, r.diagnostics ?? []]));
  return typeTests.cases.map((c) => {
    const verdict = { name: c.name, expect: c.expect, errorCode: c.errorCode ?? null, passed: false, message: "", diagnostics: [] };
    if (importDiagnostics.length) {
      return { ...verdict, message: `The type tests can't import from your program: ${importDiagnostics[0].message}` };
    }
    if (!byName.has(c.name)) return { ...verdict, message: "This case didn't run." };
    const diagnostics = byName.get(c.name);
    if (c.expect === "ok") {
      return diagnostics.length
        ? { ...verdict, diagnostics, message: `This should compile, but: ${diagnostics[0].message}` }
        : { ...verdict, passed: true };
    }
    if (!diagnostics.length) return { ...verdict, message: "This should be a type error, but it compiles." };
    if (c.errorCode && !diagnostics.some((d) => d.code === c.errorCode)) {
      return {
        ...verdict,
        diagnostics,
        message: `This should be a type error ${c.errorCode}, but it's ${diagnostics[0].code}: ${diagnostics[0].message}`,
      };
    }
    return { ...verdict, diagnostics, passed: true };
  });
}

// --- Type checker output ----------------------------------------------------

const DIAGNOSTIC_RE = /^(?:(.+?)\((\d+),(\d+)\): )?(error|warning|message) (TS\d+): (.*)$/;

/**
 * The diagnostics in `tsc --pretty false` output, each with its file, line,
 * column, code, message, and the indented lines that elaborate on it.
 */
export function parseTscOutput(text) {
  const out = [];
  for (const line of String(text ?? "").replace(/\r\n/g, "\n").split("\n")) {
    const m = DIAGNOSTIC_RE.exec(line);
    if (m) {
      out.push({
        file: m[1] ?? null,
        line: m[2] ? Number(m[2]) : null,
        col: m[3] ? Number(m[3]) : null,
        code: m[5],
        message: m[6],
        text: line,
      });
    } else if (out.length && /^\s+\S/.test(line)) {
      out[out.length - 1].text += `\n${line}`;
    }
  }
  return out;
}

// --- Honesty rules ------------------------------------------------------------

// Why each rule matters, said after the code that broke it.
const RULE_MESSAGES = {
  any: "Turns the type checker off. Give it a real type, or unknown and narrow it.",
  as: "Asserts a type. Fix the type instead of asserting it.",
  "non-null": "Asserts the value isn't null or undefined. Check for it instead.",
  "ts-comments": "Hides a type error. Fix the error instead.",
};

// Words after which an expression starts, so a / there begins a regex and a
// ! is a prefix not.
const EXPRESSION_KEYWORDS = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do",
  "else", "yield", "await", "extends", "keyof", "satisfies", "as", "is",
]);

/** The program's tokens, with strings, templates, regexes, and comments
    kept whole, so rules only ever match real code. */
function lex(code) {
  const tokens = [];
  // Open braces: "code" for ordinary ones, "template" for a ${ in a template.
  const braces = [];
  let i = 0;
  const last = () => {
    for (let k = tokens.length - 1; k >= 0; k--) if (tokens[k].type !== "comment") return tokens[k];
    return null;
  };
  const regexAllowed = () => {
    const t = last();
    if (!t) return true;
    if (t.type === "ident") return EXPRESSION_KEYWORDS.has(t.text);
    if (t.type === "punct") return !/^[)\]}]$/.test(t.text);
    return false;
  };
  // Scans template text from i (just after ` or a closing }) to its end or
  // the next ${.
  const template = (start) => {
    while (i < code.length && code[i] !== "`" && !(code[i] === "$" && code[i + 1] === "{")) i += code[i] === "\\" ? 2 : 1;
    if (code[i] === "`") {
      i++;
      tokens.push({ type: "template", text: code.slice(start, i), start });
    } else if (i < code.length) {
      i += 2;
      braces.push("template");
      tokens.push({ type: "template", text: code.slice(start, i), start });
    } else {
      tokens.push({ type: "template", text: code.slice(start), start });
    }
  };
  while (i < code.length) {
    const c = code[i];
    const start = i;
    if (/\s/.test(c)) {
      i++;
    } else if (c === "/" && code[i + 1] === "/") {
      const end = code.indexOf("\n", i);
      i = end < 0 ? code.length : end;
      tokens.push({ type: "comment", text: code.slice(start, i), start });
    } else if (c === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      i = end < 0 ? code.length : end + 2;
      tokens.push({ type: "comment", text: code.slice(start, i), start });
    } else if (c === '"' || c === "'") {
      i++;
      while (i < code.length && code[i] !== c && code[i] !== "\n") i += code[i] === "\\" ? 2 : 1;
      i++;
      tokens.push({ type: "string", text: code.slice(start, i), start });
    } else if (c === "`") {
      i++;
      template(start);
    } else if (c === "}" && braces[braces.length - 1] === "template") {
      braces.pop();
      i++;
      template(start);
    } else if (c === "/" && regexAllowed()) {
      i++;
      let inClass = false;
      while (i < code.length && code[i] !== "\n" && (inClass || code[i] !== "/")) {
        if (code[i] === "\\") i++;
        else if (code[i] === "[") inClass = true;
        else if (code[i] === "]") inClass = false;
        i++;
      }
      i++;
      while (/[a-z]/i.test(code[i] ?? "")) i++;
      tokens.push({ type: "regex", text: code.slice(start, i), start });
    } else if (/[A-Za-z_$]/.test(c)) {
      while (/[\w$]/.test(code[i] ?? "")) i++;
      tokens.push({ type: "ident", text: code.slice(start, i), start });
    } else if (/\d/.test(c) || (c === "." && /\d/.test(code[i + 1] ?? ""))) {
      while (/[\w.]/.test(code[i] ?? "")) i++;
      tokens.push({ type: "number", text: code.slice(start, i), start });
    } else {
      const two = code.slice(i, i + 2);
      const text =
        code.slice(i, i + 3) === "!==" ? "!=="
        : two === "!=" ? "!="
        : two === "?." && !/\d/.test(code[i + 2] ?? "") ? "?."
        : c;
      i += text.length;
      if (text === "{") braces.push("code");
      else if (text === "}") braces.pop();
      tokens.push({ type: "punct", text, start });
    }
  }
  return tokens;
}

/** The tokens whose `as` renames instead of asserting a type: in import
    and export clauses (`{ a as b }`, `* as ns`) and in a mapped type's key
    (`[K in keyof T as X]`). */
function renamingAs(tokens) {
  const inside = new Set();
  // Square brackets, and whether an `in` came inside each.
  const brackets = [];
  tokens.forEach((t, k) => {
    if (t.text === "[") brackets.push(false);
    else if (t.text === "]") brackets.pop();
    else if (t.type === "ident" && t.text === "in" && brackets.length) brackets[brackets.length - 1] = true;
    else if (t.type === "ident" && t.text === "as" && brackets[brackets.length - 1]) inside.add(k);
  });
  tokens.forEach((t, k) => {
    if (t.type !== "ident" || (t.text !== "import" && t.text !== "export")) return;
    let j = k + 1;
    const next = () => tokens[j];
    if (next()?.type === "ident" && next().text === "type") j++;
    // import x, { … } and import x, * as ns
    if (t.text === "import" && next()?.type === "ident" && tokens[j + 1]?.text === ",") j += 2;
    if (next()?.text === "*") {
      inside.add(j + 1);
    } else if (next()?.text === "{") {
      for (j++; j < tokens.length && tokens[j].text !== "}"; j++) inside.add(j);
    }
  });
  return inside;
}

/**
 * The places a program breaks a practice's honesty rules: `any` as a type,
 * an `as` assertion (`as const` is fine), a non-null `!`, and `@ts-`
 * comments that silence the checker. Each with its line, column, and why.
 */
export function findForbidden(code, rules = []) {
  if (!rules.length) return [];
  const on = new Set(rules);
  const tokens = lex(code);
  const renames = renamingAs(tokens);
  const hits = [];
  const at = (start) => {
    const before = code.slice(0, start);
    const line = before.split("\n").length;
    return { line, col: start - before.lastIndexOf("\n") };
  };
  const hit = (rule, t) => hits.push({ rule, text: t.text.split("\n")[0], ...at(t.start), message: RULE_MESSAGES[rule] });
  const significant = tokens.map((t, k) => ({ t, k })).filter(({ t }) => t.type !== "comment");
  significant.forEach(({ t, k }, s) => {
    const prev = significant[s - 1]?.t;
    const next = significant[s + 1]?.t;
    const afterDot = prev?.type === "punct" && (prev.text === "." || prev.text === "?.");
    if (t.type === "ident" && t.text === "any" && on.has("any") && !afterDot) hit("any", t);
    if (t.type === "ident" && t.text === "as" && on.has("as") && !afterDot && !renames.has(k)) {
      if (!(next?.type === "ident" && next.text === "const")) hit("as", t);
    }
    if (t.type === "punct" && t.text === "!" && on.has("non-null") && prev) {
      const operand =
        (prev.type === "ident" && !EXPRESSION_KEYWORDS.has(prev.text)) ||
        (prev.type === "punct" && (prev.text === ")" || prev.text === "]"));
      const sameLine = !code.slice(prev.start + prev.text.length, t.start).includes("\n");
      if (operand && sameLine) hit("non-null", t);
    }
  });
  if (on.has("ts-comments")) {
    for (const t of tokens) {
      if (t.type === "comment" && /^\/[/*][\s/*]*@ts-(?:ignore|expect-error|nocheck)\b/.test(t.text)) hit("ts-comments", t);
    }
  }
  return hits.sort((a, b) => a.line - b.line || a.col - b.col);
}

/**
 * A whole Check's verdict: the type check (a program with type errors runs
 * no tests), every test, every type-test case, and the honesty rules. It
 * passes when everything in it does.
 */
export function judgeCheck(practice, code, report) {
  const compile = report.compile ?? null;
  if (compile && compile.code != null && compile.code !== 0) {
    return { passed: false, compileError: { output: compile.output ?? "" }, tests: [], typeTests: [], forbidden: [] };
  }
  const results = report.results ?? [];
  const tests = practice.tests.map((test, i) =>
    judgeTest(test, results[i] ?? { stdout: "", stderr: "This test didn't run.", code: null, signal: null, status: null }, programForTest(code, test))
  );
  const typeTests = practice.typeTests ? judgeTypeTests(practice.typeTests, report.typeTests, report.typeTestImports ?? []) : [];
  const forbidden = findForbidden(code, practice.forbid ?? []);
  const passed = tests.every((t) => t.passed) && typeTests.every((t) => t.passed) && forbidden.length === 0;
  return { passed, compileError: null, tests, typeTests, forbidden };
}
