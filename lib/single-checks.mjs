// How a single-file run is judged: whether it passed a test, how type tests
// map to their cases, and the honesty rules a TypeScript practice can set.
// Shared by the app (the compiler's challenge checks and Learn's practice
// checks) and the verifiers (scripts/), so the browser and a verifier always
// agree, the way lib/snippet-harness.mjs keeps snippets in step.
//
// A run is what /api/execute reports for one test: stdout, stderr, the exit
// code, a kill signal, the sandbox's verdict (`TO` timed out, `OL` and `EL`
// too much output, as `status` from the server and `verdict` in the app's
// RunResult), and for a test that names files, each one's contents (null
// when it doesn't exist).

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
 * - `files`: the exact contents of files the program leaves behind,
 *   compared like output,
 * - `absent`: paths that must not exist once it's done.
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
    if (got === null || got === undefined) problems.push(`${file} is missing`);
    else if (normalizeOutput(got) !== normalizeOutput(want)) problems.push(`${file} has the wrong contents`);
  }
  for (const file of test.absent ?? []) {
    if (run.files?.[file] !== null && run.files?.[file] !== undefined) problems.push(`${file} should not exist`);
  }
  return { passed: problems.length === 0, problems };
}

/** The files a run must report on for a test: those it should leave behind
    and those it should not. */
export const filesToCollect = (test) => [...Object.keys(test.files ?? {}), ...(test.absent ?? [])];

// ---------------------------------------------------------------- type tests

/**
 * The files that type-check a practice's type tests (`{ imports, cases }`),
 * one per case: the imports line, then the case's code, so each diagnostic
 * belongs to exactly one case and a case's `declare` lines stay legal. Each
 * file is an ES module, so names never collide between cases. They are
 * compiled with main.ts, never run.
 */
export function typeTestFiles({ imports, cases }) {
  const head = String(imports ?? "").replace(/\n+$/, "");
  const importLines = head ? head.split("\n").length : 0;
  return cases.map((c, i) => ({
    name: `type-test-${i + 1}.ts`,
    case: c.name,
    importLines,
    content: `${head ? `${head}\n` : ""}${c.code.replace(/\n+$/, "")}\nexport {};\n`,
  }));
}

/**
 * The verdict of each type test case from the diagnostics in its file
 * (`{ line, col, code, message }` each). An `ok` case passes with no
 * diagnostics. An `error` case passes when the checker reports something,
 * and the `errorCode` it names when it names one. A diagnostic on the
 * imports line means the practice's exports changed shape, which says so
 * instead of blaming the case.
 */
export function judgeTypeTests(typeTests, results) {
  return typeTests.cases.map((c, i) => {
    const diagnostics = results[i]?.diagnostics ?? [];
    const importLines = typeTestFiles(typeTests)[i]?.importLines ?? 0;
    const onImports = diagnostics.find((d) => d.line <= importLines);
    if (onImports) return { name: c.name, passed: false, problem: `the type tests couldn't import from main.ts: ${onImports.message}` };
    if (c.expect === "ok") {
      return diagnostics.length
        ? { name: c.name, passed: false, problem: `should compile, but: ${diagnostics[0].message}` }
        : { name: c.name, passed: true, problem: null };
    }
    if (!diagnostics.length) return { name: c.name, passed: false, problem: "should be a type error, but it compiles" };
    if (c.errorCode && !diagnostics.some((d) => d.code === c.errorCode)) {
      return { name: c.name, passed: false, problem: `should be ${c.errorCode}, but the checker reports ${diagnostics.map((d) => d.code).join(", ")}` };
    }
    return { name: c.name, passed: true, problem: null };
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

/**
 * TypeScript source with comments and the insides of strings blanked to
 * spaces (line breaks kept, so positions still line up), plus where each
 * comment was. Template literals keep their `${…}` parts, which are code.
 */
function scan(src) {
  const out = src.split("");
  const comments = [];
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  // Brace depth inside each open template literal's ${…}.
  const templates = [];
  let i = 0;
  const template = () => {
    // From just inside a backquote (or a closing brace of ${…}) to the end
    // of the literal or the next ${.
    const start = i;
    while (i < src.length) {
      if (src[i] === "\\") i += 2;
      else if (src[i] === "`") {
        blank(start, i);
        i++;
        return;
      } else if (src[i] === "$" && src[i + 1] === "{") {
        blank(start, i);
        i += 2;
        templates.push(0);
        return;
      } else i++;
    }
    blank(start, src.length);
  };
  while (i < src.length) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      const end = src.indexOf("\n", i) < 0 ? src.length : src.indexOf("\n", i);
      comments.push([i, end]);
      blank(i, end);
      i = end;
    } else if (c === "/" && src[i + 1] === "*") {
      const close = src.indexOf("*/", i + 2);
      const end = close < 0 ? src.length : close + 2;
      comments.push([i, end]);
      blank(i, end);
      i = end;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      blank(i + 1, Math.min(j, src.length));
      i = j + 1;
    } else if (c === "`") {
      i++;
      template();
    } else if (c === "{" && templates.length) {
      templates[templates.length - 1]++;
      i++;
    } else if (c === "}" && templates.length) {
      if (templates[templates.length - 1] === 0) {
        templates.pop();
        i++;
        template();
      } else {
        templates[templates.length - 1]--;
        i++;
      }
    } else i++;
  }
  return { code: out.join(""), comments };
}

const lineOf = (src, at) => src.slice(0, at).split("\n").length;

/**
 * Where the code breaks the practice's `forbid` rules (see FORBID_RULES):
 * `[{ rule, line, text }]`, in order, empty when it keeps them all. Strings
 * and comments never count, except that `ts-comments` reads the comments.
 * Renaming in an import or export (`import { a as b }`) isn't an `as`.
 */
export function forbiddenUses(src, rules) {
  const source = String(src ?? "");
  const { code, comments } = scan(source);
  const lines = source.split("\n");
  const found = [];
  const add = (rule, at) => {
    const line = lineOf(source, at);
    found.push({ rule, line, text: lines[line - 1].trim() });
  };
  const each = (rule, re, text = code) => {
    for (const m of text.matchAll(re)) add(rule, m.index);
  };
  // A word on its own: not part of a longer name, not a property after a
  // dot, and not a key (`{ any: 1 }`).
  if (rules.includes("any")) each("any", /(?<![\w$.])any(?![\w$])(?!\s*\??:)/g);
  if (rules.includes("as")) {
    // Import and export clauses, blanked like comments, where `as` renames.
    const clauses = code.replace(
      /\b(?:import|export)\b(?:[^;"'`=()]*?\bfrom\b|\s*(?:type\s*)?\{[^}]*\}|\s*\*\s*as\s+[\w$]+)/g,
      (m) => m.replace(/[^\n]/g, " ")
    );
    each("as", /(?<![\w$.])as(?![\w$])(?!\s*\??:)(?!\s+const(?![\w$]))/g, clauses);
  }
  // A ! right after a name, a call, or an index, that isn't != or !==.
  if (rules.includes("non-null")) each("non-null", /(?<=[\w$)\]])!(?!=)/g);
  if (rules.includes("ts-comments")) {
    for (const [from, to] of comments) {
      const m = /@ts-(?:ignore|expect-error|nocheck)\b/.exec(source.slice(from, to));
      if (m) add("ts-comments", from + m.index);
    }
  }
  return found.sort((a, b) => a.line - b.line);
}
