// How a single-file run is judged: whether it passed a test, what the
// runner's type test verdicts say, and the honesty rules a TypeScript
// practice can set. Shared by the app (the compiler's challenge checks and
// Learn's practice checks) and the verifiers (scripts/), so the browser and a
// verifier always agree, the way lib/snippet-harness.mjs keeps snippets in
// step.
//
// A run is what /api/execute reports for one test: stdout, stderr, the exit
// code, a kill signal, the sandbox's verdict (`TO` timed out, `OL` and `EL`
// too much output, as `status` from the server and `verdict` in the app's
// RunResult), and for a test that names paths, what the runner found at each
// one: `files` holds a regular file's contents (null for anything else), and
// `exists` says whether anything at all is there (a file, a folder, or a
// link).

/** How outputs are compared, here and in the app: trailing whitespace on each
    line and trailing blank lines don't count, everything else does. */
export function normalizeOutput(s) {
  return String(s ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

/**
 * Whether a run of a program on the runner passed a test, with what was
 * wrong when it didn't. A test has its expected `output` and may also set:
 *
 * - `exitCode`: the status the program must exit with (0 when it has none),
 * - `stderrIncludes`: text stderr must contain (stderr is never compared
 *   otherwise),
 * - `files`: the exact contents of regular files the program leaves behind,
 *   compared like output,
 * - `absent`: paths where nothing may be left, not a file, a folder, or a
 *   link.
 *
 * The Piston and SQL courses judge output alone, as they always have
 * (normalizeOutput, with a timeout failing the test).
 */
export function judgeTest(test, run) {
  const problems = [];
  const verdict = run.status ?? run.verdict ?? null;
  if (verdict === "TO") problems.push("timed out");
  else if (verdict === "OL" || verdict === "EL") problems.push("printed too much");
  if (normalizeOutput(run.stdout) !== normalizeOutput(test.output)) problems.push("wrong output");
  const wantExit = test.exitCode ?? 0;
  if (run.signal) problems.push(`killed by ${run.signal}`);
  else if (run.code !== wantExit) problems.push(`exited with ${run.code ?? "nothing"}, expected ${wantExit}`);
  if (test.stderrIncludes && !String(run.stderr ?? "").includes(test.stderrIncludes)) {
    problems.push(`stderr doesn't say ${JSON.stringify(test.stderrIncludes)}`);
  }
  for (const [file, want] of Object.entries(test.files ?? {})) {
    const got = run.files?.[file];
    if (got === null || got === undefined) problems.push(run.exists?.[file] === true ? `${file} isn't a regular file` : `${file} is missing`);
    else if (normalizeOutput(got) !== normalizeOutput(want)) problems.push(`${file} has the wrong contents`);
  }
  for (const file of test.absent ?? []) {
    // Only `exists` knows about folders and links. A run that doesn't say
    // can't prove the path is gone.
    const there = run.exists?.[file];
    if (there === true) problems.push(`${file} should not exist`);
    else if (there !== false) problems.push(`the sandbox didn't say whether ${file} exists`);
  }
  return { passed: problems.length === 0, problems };
}

/** The paths a run must report on for a test: files it should leave behind
    and paths that should be gone. */
export const filesToCollect = (test) => [...Object.keys(test.files ?? {}), ...(test.absent ?? [])];

// ---------------------------------------------------------------- type tests

/**
 * Each type test case's verdict, from the runner's report (a Check's
 * `typeTests`). tsc checks main.ts and every case in one pass there, and the
 * runner, which lays the cases out, judges each one by its `expect` and
 * `errorCode` (runner/recipes/typescript.ts): `pass`, and a `message` saying
 * why when it fails, including when the cases couldn't import from main.ts.
 * Its diagnostics count lines from the start of the case's own code. A case
 * it didn't report on fails.
 */
export function judgeTypeTests(typeTests, results) {
  const reported = new Map((Array.isArray(results) ? results : []).map((r) => [r?.name, r]));
  return typeTests.cases.map((c) => {
    const r = reported.get(c.name);
    if (typeof r?.pass !== "boolean") return { name: c.name, passed: false, problem: "the type checker didn't report on this case" };
    if (r.pass) return { name: c.name, passed: true, problem: null };
    return { name: c.name, passed: false, problem: r.message || r.diagnostics?.[0]?.message || "this case didn't do what it should" };
  });
}

/** One `tsc --pretty false` diagnostic line: main.ts(14,11): error TS2322: … */
const DIAGNOSTIC = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

/** tsc's output as diagnostics, each with the indented lines that elaborate
    it folded into its message. */
export function parseTscOutput(output) {
  const out = [];
  for (const line of String(output ?? "").split("\n")) {
    const m = DIAGNOSTIC.exec(line);
    if (m) out.push({ file: m[1], line: Number(m[2]), col: Number(m[3]), code: m[4], message: m[5] });
    else if (out.length && /^\s+\S/.test(line)) out[out.length - 1].message += `\n${line.trim()}`;
  }
  return out;
}

// ---------------------------------------------------------------- honesty rules

/** The honesty rules a TypeScript practice can `forbid`, and why each is
    ruled out. */
export const FORBID_RULES = {
  any: "`any` switches type checking off for a value",
  as: "`as` makes the checker trust you instead of proving it (`as const` is fine)",
  "non-null": "`!` promises a value isn't null or undefined without checking",
  "ts-comments": "`@ts-` comments silence the checker",
};

// The scan below is the runner's (runner/recipes/honesty.ts), token for
// token, so a Check and a verifier find the same hits.

// Words after which a / starts a regular expression and a ! is the prefix not.
const PREFIX_KEYWORDS = new Set([
  "return", "typeof", "void", "delete", "await", "yield", "throw", "case", "in", "of", "instanceof",
  "else", "do", "new", "extends", "keyof", "satisfies", "as", "is",
]);
// Keywords that end an expression, so a ! after them is postfix.
const VALUE_KEYWORDS = new Set(["this", "super", "null", "undefined", "true", "false"]);
const RESERVED = new Set([
  ...PREFIX_KEYWORDS, "break", "catch", "class", "const", "continue", "debugger", "default", "enum", "export",
  "finally", "for", "function", "if", "import", "let", "switch", "try", "var", "while", "with", "static",
]);

const IDENT_START = /[\p{ID_Start}$_]/u;
const IDENT_PART = /[\p{ID_Continue}$\u200c\u200d]/u;

/**
 * TypeScript source as tokens (`{ type, value, line, col, newlineBefore }`),
 * comments included: ident, punct, string, template, regex, number, or
 * comment. Strings, the text of template literals, regular expressions, and
 * comments are tokens of their own, so nothing inside them reads as code,
 * while the code inside a template's ${...} is tokenized like any other. A /
 * starts a regular expression wherever an expression can start, so division
 * stays division.
 */
export function tokenize(src) {
  const tokens = [];
  let i = 0;
  let line = 1;
  let col = 1;
  let newline = false;
  // One entry per open template ${...}: the brace depth it closes at.
  const templates = [];
  let depth = 0;

  const advance = (n) => {
    for (let k = 0; k < n && i < src.length; k++) {
      if (src[i] === "\n") {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  };
  const push = (type, start, startLine, startCol) => {
    tokens.push({ type, value: src.slice(start, i), line: startLine, col: startCol, newlineBefore: newline });
    newline = false;
  };
  const prevSignificant = () => {
    for (let k = tokens.length - 1; k >= 0; k--) if (tokens[k].type !== "comment") return tokens[k];
    return undefined;
  };
  const regexAllowed = () => {
    const prev = prevSignificant();
    if (!prev) return true;
    if (prev.type === "ident") return RESERVED.has(prev.value) && !VALUE_KEYWORDS.has(prev.value);
    if (prev.type === "punct") return !/^[)\]]$/.test(prev.value);
    return false;
  };
  // Scans template characters up to the closing backtick or the next ${.
  const templateRest = (start, startLine, startCol) => {
    while (i < src.length) {
      if (src[i] === "\\") advance(2);
      else if (src[i] === "`") {
        advance(1);
        push("template", start, startLine, startCol);
        return;
      } else if (src[i] === "$" && src[i + 1] === "{") {
        advance(2);
        push("template", start, startLine, startCol);
        templates.push(depth);
        depth++;
        return;
      } else advance(1);
    }
    push("template", start, startLine, startCol);
  };

  while (i < src.length) {
    const ch = src[i];
    const start = i;
    const startLine = line;
    const startCol = col;
    if (ch === "\n") {
      newline = true;
      advance(1);
    } else if (/\s/.test(ch)) {
      advance(1);
    } else if (ch === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") advance(1);
      push("comment", start, startLine, startCol);
    } else if (ch === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      advance((end < 0 ? src.length : end + 2) - i);
      push("comment", start, startLine, startCol);
    } else if (ch === '"' || ch === "'") {
      advance(1);
      while (i < src.length && src[i] !== ch && src[i] !== "\n") advance(src[i] === "\\" ? 2 : 1);
      advance(1);
      push("string", start, startLine, startCol);
    } else if (ch === "`") {
      advance(1);
      templateRest(start, startLine, startCol);
    } else if (ch === "}" && templates.length && templates[templates.length - 1] === depth - 1) {
      // The } that closes a template's ${...}: the template goes on.
      templates.pop();
      depth--;
      advance(1);
      templateRest(start, startLine, startCol);
    } else if (ch === "/" && regexAllowed()) {
      advance(1);
      let inClass = false;
      while (i < src.length && src[i] !== "\n") {
        if (src[i] === "\\") {
          advance(2);
          continue;
        }
        if (src[i] === "[") inClass = true;
        else if (src[i] === "]") inClass = false;
        else if (src[i] === "/" && !inClass) break;
        advance(1);
      }
      advance(1);
      while (i < src.length && IDENT_PART.test(src[i])) advance(1);
      push("regex", start, startLine, startCol);
    } else if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      advance(1);
      while (i < src.length && /[0-9A-Za-z_.]/.test(src[i])) advance(1);
      push("number", start, startLine, startCol);
    } else if (IDENT_START.test(ch) || (ch === "#" && IDENT_START.test(src[i + 1] ?? ""))) {
      advance(1);
      while (i < src.length && IDENT_PART.test(src[i])) advance(1);
      push("ident", start, startLine, startCol);
    } else {
      const three = src.slice(i, i + 3);
      const two = src.slice(i, i + 2);
      const op = three === "..." || three === "!==" ? three : two === "?." && !/[0-9]/.test(src[i + 2] ?? "") ? two : two === "!=" ? two : ch;
      if (op === "{") depth++;
      else if (op === "}") depth = Math.max(0, depth - 1);
      advance(op.length);
      push("punct", start, startLine, startCol);
    }
  }
  return tokens;
}

/** Whether a token can end an expression, so what follows is postfix. */
function endsExpression(t) {
  if (t.type === "ident") return !RESERVED.has(t.value) || VALUE_KEYWORDS.has(t.value);
  if (t.type === "punct") return t.value === ")" || t.value === "]";
  return t.type === "string" || t.type === "number" || t.type === "template" || t.type === "regex";
}

/**
 * Where the code breaks the practice's `forbid` rules (see FORBID_RULES):
 * `[{ rule, line, col, text }]` in source order, with the line's text, empty
 * when it keeps them all. A token scan, not a parser, but a careful one:
 * strings, template text, regular expressions, and comments never count
 * (`"as any"` and `/as!/` are fine), except that `ts-comments` reads the
 * comments, and only a comment that starts with @ts-ignore,
 * @ts-expect-error, or @ts-nocheck silences anything. Names are fine too:
 * `Promise.any`, `{ any: 1 }`, a parameter called `as`, `import * as z`, and
 * `export { a as b }`. Old angle-bracket assertions (`<T>x`) look like
 * generics to a token scan, so they aren't caught.
 */
export function forbiddenUses(src, rules) {
  const source = String(src ?? "");
  const want = new Set(rules);
  const lines = source.split("\n");
  const found = [];
  const all = tokenize(source);
  const code = all.filter((t) => t.type !== "comment");
  const hit = (rule, t) => found.push({ rule, line: t.line, col: t.col, text: lines[t.line - 1].trim() });

  if (want.has("ts-comments")) {
    for (const t of all) {
      if (t.type !== "comment") continue;
      const body = t.value.replace(/^\/[/*]+/, "").replace(/^[\s*]+/, "");
      if (/^@ts-(ignore|expect-error|nocheck)\b/.test(body)) hit("ts-comments", t);
    }
  }

  // Inside an import or export clause, `as` renames instead of asserting.
  let clause = null;
  let clauseDepth = 0;
  for (let k = 0; k < code.length; k++) {
    const t = code[k];
    const prev = code[k - 1];
    const next = code[k + 1];
    const afterNext = code[k + 2];
    const member = prev?.type === "punct" && (prev.value === "." || prev.value === "?.");

    if (clause === "string" && (t.type === "string" || (t.type === "punct" && t.value === ";"))) clause = null;
    else if (clause === "brace" && t.type === "punct") {
      if (t.value === "{") clauseDepth++;
      else if (t.value === "}" && --clauseDepth === 0) clause = "string";
      else if (t.value === ";") clause = null;
    }
    if (t.type === "ident" && !member && !clause) {
      if (t.value === "import" && !(next?.type === "punct" && (next.value === "(" || next.value === "."))) {
        clause = "string";
      } else if (t.value === "export") {
        const opener = next?.type === "ident" && next.value === "type" ? afterNext : next;
        if (opener?.type === "punct" && opener.value === "*") clause = "string";
        if (opener?.type === "punct" && opener.value === "{") {
          clause = "brace";
          clauseDepth = 0;
        }
      }
    }
    if (t.type === "ident" && !member && t.value === "any" && want.has("any")) {
      // A name, not the type: { any: 1 }, (any: string) => ..., { any?: T }.
      const named = next?.type === "punct" && (next.value === ":" || (next.value === "?" && afterNext?.value === ":"));
      if (!named) hit("any", t);
    }
    if (t.type === "ident" && !member && t.value === "as" && want.has("as") && !clause && prev && endsExpression(prev)) {
      // `x as const` is allowed. `as` followed by ), ;, =, and the like is a name.
      const isConst = next?.type === "ident" && next.value === "const";
      const isName = !next || (next.type === "punct" && /^([)\]};,.=:]|\?\.)$/.test(next.value));
      if (!isConst && !isName) hit("as", t);
    }
    // Postfix ! follows an expression on the same line: x!, f()!, a[0]!.
    if (t.type === "punct" && t.value === "!" && want.has("non-null") && prev && !t.newlineBefore) {
      if ((prev.type === "ident" || prev.type === "punct") && endsExpression(prev)) hit("non-null", t);
    }
  }
  return found.sort((a, b) => a.line - b.line || a.col - b.col);
}
