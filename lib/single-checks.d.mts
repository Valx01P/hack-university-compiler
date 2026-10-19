// Types for lib/single-checks.mjs (plain JavaScript so the Node verifiers can use it).

/** One run of a program, as /api/execute or a verifier reports it. */
export interface JudgedRun {
  stdout: string;
  stderr?: string;
  code: number | null;
  signal?: string | null;
  /** The sandbox's verdict ("TO", "OL", "EL"), as the server names it. */
  status?: string | null;
  /** The same verdict, as the app's RunResult names it. */
  verdict?: string | null;
  /** Each path the test names: a regular file's contents, or null for
      anything else (nothing, a folder, a link). */
  files?: Record<string, string | null>;
  /** Whether anything at all (a file, a folder, a link) is at each path. */
  exists?: Record<string, boolean>;
  /** Paths whose contents the sandbox cut off at its size cap. */
  truncated?: string[];
}

export interface JudgedTest {
  output: string;
  exitCode?: number;
  stderrIncludes?: string;
  files?: Record<string, string>;
  absent?: string[];
}

export function normalizeOutput(s: string | null | undefined): string;
export function judgeTest(test: JudgedTest, run: JudgedRun): { passed: boolean; problems: string[] };
export function filesToCollect(test: Pick<JudgedTest, "files" | "absent">): string[];

export interface TypeTestCase {
  name: string;
  expect: "ok" | "error";
  errorCode?: string;
  code: string;
}
export interface TypeTests {
  imports: string;
  cases: TypeTestCase[];
}
export interface Diagnostic {
  file?: string;
  line: number;
  col: number;
  code: string;
  message: string;
}
/** One case of a Check's `typeTests`, as the runner reports it. */
export interface TypeTestReport {
  name: string;
  expect?: "ok" | "error";
  /** Whether the case did what its `expect` (and `errorCode`) says. */
  pass: boolean;
  /** Lines and columns count from the start of the case's own code. */
  diagnostics: Diagnostic[];
  /** Why it failed. */
  message?: string;
}

export function judgeTypeTests(
  typeTests: TypeTests,
  results: readonly TypeTestReport[] | null | undefined
): { name: string; passed: boolean; problem: string | null }[];
export function parseTscOutput(output: string): Required<Diagnostic>[];

export type ForbidRule = "any" | "as" | "non-null" | "ts-comments";
export const FORBID_RULES: Record<ForbidRule, string>;

export interface Token {
  type: "ident" | "punct" | "string" | "template" | "regex" | "number" | "comment";
  value: string;
  /** 1-based. */
  line: number;
  col: number;
  /** A line break comes between this token and the one before it. */
  newlineBefore: boolean;
}
export function tokenize(src: string): Token[];
export function forbiddenUses(src: string, rules: readonly string[]): { rule: ForbidRule; line: number; col: number; text: string }[];
