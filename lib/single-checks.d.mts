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
  /** Each file the test names, or null when it doesn't exist. */
  files?: Record<string, string | null>;
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

export function typeTestFiles(typeTests: TypeTests): { name: string; case: string; importLines: number; content: string }[];
export function judgeTypeTests(
  typeTests: TypeTests,
  results: { diagnostics: Diagnostic[] }[]
): { name: string; passed: boolean; problem: string | null }[];
export function parseTscOutput(output: string): Required<Diagnostic>[];

export type ForbidRule = "any" | "as" | "non-null" | "ts-comments";
export const FORBID_RULES: Record<ForbidRule, string>;
export function forbiddenUses(src: string, rules: readonly string[]): { rule: ForbidRule; line: number; text: string }[];
