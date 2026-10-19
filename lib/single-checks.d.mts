// Types for lib/single-checks.mjs (plain JavaScript so the Node verifiers can use it).
import type { ForbidRule, LessonPractice, LessonTest, TypeTests } from "@/lib/learn-types";

/** A type checker message about one place in a file. */
export interface Diagnostic {
  line: number;
  col: number;
  /** TS2322 and the like. */
  code: string;
  message: string;
}

/** What the runner reports for one test's run. */
export interface RunnerResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: string | null;
  /** "TO" timed out, "OL"/"EL" output too large. */
  status: string | null;
  /** Each path the test names (in `files` or `absent`): its contents after
      the run, or null when it doesn't exist. */
  files?: Record<string, string | null>;
}

/** What /api/execute answers for a Check with `tests`. */
export interface CheckReport {
  compile?: { code: number | null; output: string } | null;
  results: RunnerResult[];
  typeTests?: { name: string; diagnostics: Diagnostic[] }[];
  typeTestImports?: Diagnostic[];
}

export interface TestVerdict {
  passed: boolean;
  /** Why the test couldn't run as written (the try-it line is gone). */
  problem: string | null;
  output: { expected: string; actual: string; passed: boolean } | null;
  exit: { expected: number; actual: number | null; signal: string | null; passed: boolean } | null;
  stderrIncludes: { text: string; passed: boolean } | null;
  files: { path: string; expected: string; actual: string | null; passed: boolean }[];
  absent: { path: string; passed: boolean }[];
  timedOut: boolean;
}

export interface TypeTestVerdict {
  name: string;
  expect: "ok" | "error";
  errorCode: string | null;
  passed: boolean;
  /** Why it failed ("" when it passed). */
  message: string;
  diagnostics: Diagnostic[];
}

export interface ForbiddenHit {
  rule: ForbidRule;
  /** The code that broke it. */
  text: string;
  line: number;
  col: number;
  message: string;
}

export interface CheckVerdict {
  passed: boolean;
  /** The type check failed, so no test ran. */
  compileError: { output: string } | null;
  tests: TestVerdict[];
  typeTests: TypeTestVerdict[];
  forbidden: ForbiddenHit[];
}

export interface TscDiagnostic {
  file: string | null;
  line: number | null;
  col: number | null;
  code: string;
  message: string;
  /** The whole diagnostic as tsc printed it, elaboration included. */
  text: string;
}

export interface TypeTestFile {
  source: string;
  imports: { from: number; to: number };
  ranges: { name: string; from: number; to: number }[];
}

export function normalizeOutput(s: string): string;
export const TRY_IT_LINE: string;
export function programForTest(code: string, test: LessonTest): string | null;
export function pathsToRead(test: LessonTest): string[];
export function judgeTest(test: LessonTest, result: RunnerResult, program?: string | null): TestVerdict;
export function typeTestFile(typeTests: TypeTests): TypeTestFile;
export function sortTypeTestDiagnostics(
  file: TypeTestFile,
  diagnostics: Diagnostic[]
): { imports: Diagnostic[]; cases: { name: string; diagnostics: Diagnostic[] }[] };
export function judgeTypeTests(
  typeTests: TypeTests,
  report: CheckReport["typeTests"],
  importDiagnostics?: Diagnostic[]
): TypeTestVerdict[];
export function parseTscOutput(text: string): TscDiagnostic[];
export function findForbidden(code: string, rules?: ForbidRule[]): ForbiddenHit[];
export function judgeCheck(practice: LessonPractice, code: string, report: CheckReport): CheckVerdict;
