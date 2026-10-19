import { NextResponse } from "next/server";
import { getCompilerLang } from "@/lib/compiler";
import { parseRuntime } from "@/lib/courses";
import { rejectNonLocal } from "@/lib/local-request";
import { runCode, SandboxError } from "@/lib/piston";
import {
  RunnerError,
  readFixtureSet,
  runOnRunner,
  testOnRunner,
  type RunnerFile,
  type RunnerRequest,
  type RunnerTest,
} from "@/lib/runner";

const BODY_MAX_BYTES = 1_000_000;
const CODE_MAX_CHARS = 100_000;
const STDIN_MAX_CHARS = 100_000;
const MAX_ARGS = 64;
const ARG_MAX_CHARS = 4_096;
const MAX_TESTS = 20;
const MAX_TYPE_TESTS = 6;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const isStr = (v: unknown): v is string => typeof v === "string";
const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

// What a run may name besides its code, checked here (the runner checks
// again): short lists of short strings, environment variables, an instant
// for the clock, fixture sets by name, and relative paths inside the
// program's folder.
const short = (v: unknown, max = ARG_MAX_CHARS): v is string => isStr(v) && v.length <= max && !v.includes("\0");
const strings = (v: unknown, max = MAX_ARGS): v is string[] => Array.isArray(v) && v.length <= max && v.every((s) => short(s));
const relPath = (v: unknown): v is string =>
  short(v) && !v.startsWith("/") && v.split("/").every((s) => s !== "" && s !== "." && s !== "..");
const env = (v: unknown): v is Record<string, string> =>
  isObj(v) && Object.keys(v).length <= 64 && Object.entries(v).every(([k, val]) => /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(k) && short(val));
const clock = (v: unknown): v is string | null =>
  v === null || (isStr(v) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v));
const setName = (v: unknown): v is string => isStr(v) && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(v);

/** Each field a test can carry (runner/schemas.ts TestSpec), and its check. */
const TEST_FIELDS: Record<string, (v: unknown) => boolean> = {
  stdin: (v) => isStr(v) && v.length <= STDIN_MAX_CHARS,
  args: (v) => strings(v),
  env,
  clock,
  fixtures: setName,
  cwd: relPath,
  wrap: (v) => strings(v, 16) && (v as string[]).length > 0,
  files: (v) => isObj(v) && Object.keys(v).length <= 64 && Object.entries(v).every(([k, val]) => relPath(k) && isStr(val) && val.length <= STDIN_MAX_CHARS),
  absent: (v) => strings(v) && (v as string[]).every(relPath),
  collect: (v) => strings(v) && (v as string[]).every(relPath),
  tryIt: (v) => isStr(v) && v.length <= CODE_MAX_CHARS,
  output: (v) => isStr(v) && v.length <= STDIN_MAX_CHARS,
  exitCode: (v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 255,
  stderrIncludes: (v) => short(v, STDIN_MAX_CHARS),
};

/** A Check's tests, or what's wrong with them. */
function testsOf(v: unknown): RunnerTest[] | string {
  if (!Array.isArray(v) || !v.length || v.length > MAX_TESTS) return `tests must be a list of 1 to ${MAX_TESTS} tests.`;
  for (const [i, t] of v.entries()) {
    if (!isObj(t)) return `tests[${i}] must be an object.`;
    for (const [key, value] of Object.entries(t)) {
      if (!Object.hasOwn(TEST_FIELDS, key)) return `tests[${i}].${key} isn't something a test can set.`;
      if (!TEST_FIELDS[key](value)) return `tests[${i}].${key} isn't valid.`;
    }
  }
  return v as RunnerTest[];
}

/** A practice's type tests: an imports line and up to six cases. */
function typeTestsOf(v: unknown): RunnerRequest["typeTests"] | null {
  if (!isObj(v) || !short(v.imports) || !Array.isArray(v.cases) || !v.cases.length || v.cases.length > MAX_TYPE_TESTS) return null;
  const valid = v.cases.every(
    (c) =>
      isObj(c) && short(c.name, 200) && isStr(c.code) && c.code.length <= 20_000 && (c.expect === "ok" || c.expect === "error") &&
      (c.errorCode === undefined || (isStr(c.errorCode) && /^TS\d{1,5}$/.test(c.errorCode)))
  );
  return valid ? (v as RunnerRequest["typeTests"]) : null;
}

/**
 * Runs a program for the compiler, Learn, and the code examples. The course
 * registry (content/courses.json) says what runs each course: Piston runs
 * python, javascript, cpp, java, and go exactly as it always has, and the
 * local runner runs TypeScript and Bash (and the stack courses as they
 * ship). SQL never comes here: it runs on PostgreSQL in the browser. A Run
 * answers `{run}` in Piston's shape whatever ran it, so the output panel
 * reads them all the same way. A Check on the runner sends every test at
 * once (`tests`) and answers the runner's report, a run per test, for
 * lib/single-checks.mjs to judge. Fixture sets are named, and read here from
 * content/fixtures/<course>/. No accounts and no rate limits: the server
 * only listens on 127.0.0.1, and the sandboxes' own limits (time, memory,
 * processes, output, no network) bound every run.
 */
export async function POST(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  if (Number(request.headers.get("content-length") ?? 0) > BODY_MAX_BYTES) return bad("The request is too large.", 413);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return bad("Expected a JSON body.");
  }
  const language = typeof body?.language === "string" ? body.language : "";
  const code = typeof body?.code === "string" ? body.code : "";
  const stdin = typeof body?.stdin === "string" ? body.stdin : "";

  const lang = getCompilerLang(language);
  if (!lang || !code) return bad("language and code are required");
  if (code.length > CODE_MAX_CHARS) return bad("Code is too long.", 413);
  if (stdin.length > STDIN_MAX_CHARS) return bad("stdin is too long.", 413);

  const runtime = parseRuntime(lang.runtime);
  try {
    if (runtime?.kind === "piston") {
      const run = await runCode({ language: runtime.id, code, stdin });
      return NextResponse.json({ run });
    }
    if (runtime?.kind !== "runner") {
      // PGlite (SQL) and page courses run in the browser.
      return bad(`${lang.label} runs in your browser, not on the server.`);
    }

    const job: RunnerRequest = { recipe: runtime.id, files: [{ name: lang.fileName, content: code }] };
    if (body.args !== undefined && !strings(body.args)) return bad("args must be a list of strings.");
    if (body.env !== undefined && !env(body.env)) return bad("env must map variable names to strings.");
    if (body.clock !== undefined && !clock(body.clock)) return bad("clock must be an instant like 2026-10-19T09:00:00Z.");
    if (body.fixtures !== undefined && !setName(body.fixtures)) return bad("fixtures must name a fixture set.");
    if (body.env !== undefined) job.env = body.env as Record<string, string>;
    if (body.clock !== undefined) job.clock = body.clock as string | null;
    if (body.typeTests !== undefined) {
      const typeTests = typeTestsOf(body.typeTests);
      if (!typeTests) return bad(`typeTests needs an imports line and 1 to ${MAX_TYPE_TESTS} cases.`);
      job.typeTests = typeTests;
    }
    // A practice's honesty rules (forbid) need no sandbox: the browser and
    // the verifiers read them off the source with lib/single-checks.mjs.
    const tests = body.tests === undefined ? null : testsOf(body.tests);
    if (typeof tests === "string") return bad(tests);

    // Fixture sets go along by name, each read once.
    const sets = new Set([body.fixtures, ...(tests ?? []).map((t) => t.fixtures)].filter(setName));
    if (sets.size) {
      const fixtureSets: Record<string, RunnerFile[]> = {};
      for (const name of sets) {
        const files = await readFixtureSet(lang.slug, name);
        if (!files) return bad(`There's no ${lang.label} fixture set named ${name}.`);
        fixtureSets[name] = files;
      }
      job.fixtureSets = fixtureSets;
    }

    // The set a Run starts in, and a Check's tests unless they name their own.
    if (isStr(body.fixtures)) job.fixtures = body.fixtures;
    if (tests) return NextResponse.json(await testOnRunner({ ...job, tests }, lang.label));
    const run = await runOnRunner({ ...job, stdin, ...(body.args ? { args: body.args as string[] } : {}) }, lang.label);
    return NextResponse.json({ run });
  } catch (err) {
    if (err instanceof SandboxError || err instanceof RunnerError) {
      return bad(err.message, err.status);
    }
    console.error("sandbox run failed:", err);
    return bad("The sandbox hit an unexpected error. Try again.", 500);
  }
}
