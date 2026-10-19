import { NextResponse } from "next/server";
import { getCompilerLang } from "@/lib/compiler";
import { parseRuntime } from "@/lib/courses";
import { rejectNonLocal } from "@/lib/local-request";
import { runCode, SandboxError } from "@/lib/piston";
import { RunnerError, runOnRunner, testOnRunner, type RunnerRequest, type RunnerTest } from "@/lib/runner";

const BODY_MAX_BYTES = 1_000_000;
const CODE_MAX_CHARS = 100_000;
const STDIN_MAX_CHARS = 100_000;
const MAX_ARGS = 64;
const ARG_MAX_CHARS = 4_096;
const MAX_TESTS = 16;
const MAX_TYPE_TESTS = 6;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const isStr = (v: unknown): v is string => typeof v === "string";

/** Command-line arguments: a short list of strings, or nothing. */
function argsOf(v: unknown): string[] | undefined | null {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > MAX_ARGS || !v.every((a) => isStr(a) && a.length <= ARG_MAX_CHARS && !a.includes("\0"))) return null;
  return v;
}

/** A Check's tests: what each one feeds the program, never what it expects. */
function testsOf(v: unknown): RunnerTest[] | undefined | null {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || !v.length || v.length > MAX_TESTS) return null;
  const tests: RunnerTest[] = [];
  for (const t of v) {
    if (!t || typeof t !== "object") return null;
    const { stdin, args, collect } = t as Record<string, unknown>;
    if (stdin !== undefined && (!isStr(stdin) || stdin.length > STDIN_MAX_CHARS)) return null;
    const testArgs = argsOf(args);
    if (testArgs === null) return null;
    // Files a test looks at afterwards: relative paths inside the program's folder.
    const files = argsOf(collect);
    if (files === null || files?.some((f) => !f || f.startsWith("/") || f.split("/").includes(".."))) return null;
    tests.push({ ...(isStr(stdin) ? { stdin } : {}), ...(testArgs ? { args: testArgs } : {}), ...(files ? { collect: files } : {}) });
  }
  return tests;
}

/** A practice's type tests: an imports line and up to six cases. */
function typeTestsOf(v: unknown): RunnerRequest["typeTests"] | undefined | null {
  if (v === undefined) return undefined;
  const { imports, cases } = (v ?? {}) as Record<string, unknown>;
  if (!isStr(imports) || imports.length > ARG_MAX_CHARS || !Array.isArray(cases) || !cases.length || cases.length > MAX_TYPE_TESTS) return null;
  const valid = cases.every((c) => {
    const { name, expect, errorCode, code } = (c ?? {}) as Record<string, unknown>;
    return (
      isStr(name) && isStr(code) && code.length <= ARG_MAX_CHARS && (expect === "ok" || expect === "error") &&
      (errorCode === undefined || (isStr(errorCode) && /^TS\d{1,5}$/.test(errorCode)))
    );
  });
  return valid ? (v as RunnerRequest["typeTests"]) : null;
}

/**
 * Runs a program for the compiler, Learn, and the code examples. The course
 * registry (content/courses.json) says what runs each course: Piston runs
 * python, javascript, cpp, java, and go exactly as it always has, and the
 * local runner runs TypeScript and Bash (and the stack courses as they
 * ship). SQL never comes here: it runs on PostgreSQL in the browser. A Run
 * answers in Piston's shape whatever ran it, so the output panel reads them
 * all the same way. A Check on the runner sends every test at once and gets
 * each test's run back. No accounts and no rate limits: the server only
 * listens on 127.0.0.1, and the sandboxes' own limits (time, memory,
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
    if (runtime?.kind === "runner") {
      const args = argsOf(body.args);
      const tests = testsOf(body.tests);
      const typeTests = typeTestsOf(body.typeTests);
      if (args === null) return bad("args must be a list of strings.");
      if (tests === null) return bad(`tests must be a list of 1 to ${MAX_TESTS} inputs.`);
      if (typeTests === null) return bad(`typeTests needs an imports line and 1 to ${MAX_TYPE_TESTS} cases.`);
      const job: RunnerRequest = {
        recipe: runtime.id,
        files: [{ name: lang.fileName, content: code }],
        ...(typeTests ? { typeTests } : {}),
      };
      if (tests) return NextResponse.json(await testOnRunner({ ...job, tests }, lang.label));
      const run = await runOnRunner({ ...job, stdin, ...(args ? { args } : {}) }, lang.label);
      return NextResponse.json({ run });
    }
    // PGlite (SQL) and page courses run in the browser.
    return bad(`${lang.label} runs in your browser, not on the server.`);
  } catch (err) {
    if (err instanceof SandboxError || err instanceof RunnerError) {
      return bad(err.message, err.status);
    }
    console.error("sandbox run failed:", err);
    return bad("The sandbox hit an unexpected error. Try again.", 500);
  }
}
