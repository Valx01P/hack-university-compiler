/**
 * The shape of Learn mode content (content/learn/<lang>/*.json): types, and
 * helpers safe for client and server. content/learn/AUTHORING.md documents
 * the rules behind each field, and scripts/verify-lessons.mjs enforces them.
 */
import { runtimeKindOf } from "@/lib/courses";

/** How a lesson (or one of its steps) is shown and run. Learn shows `single`
    today: one program, its examples, and a practice checked by its tests.
    A `read` lesson (ReadLesson) is the other kind Learn shows: parts to
    read, with code that is shown and never run. */
export type LessonFormat = "single" | "console" | "page" | "workspace";

/** One run of a program: what it gets, and for a test what it must do. */
export interface LessonTest {
  stdin?: string;
  output: string;
  /** Command-line arguments: `$1`, `$2`, ... in Bash. */
  args?: string[];
  /** Environment variables the program runs with. */
  env?: Record<string, string>;
  /** The exit status it must end with (0 when unset). Only programs on the
      runner are held to it. */
  exitCode?: number;
  /** Text stderr must contain. Stderr is never compared otherwise. */
  stderrIncludes?: string;
  /** Files it must leave behind, by path, with their exact contents
      (compared like output). */
  files?: Record<string, string>;
  /** Paths that must not exist once it ends. */
  absent?: string[];
  /** Another fixture set than the practice's, so a hardcoded answer fails. */
  fixtures?: string;
  /** A folder of the fixtures to run from. */
  cwd?: string;
  /** A command wrapped around the run, like `flock job.lock` (as a line,
      split like a shell splits it, or as its words). */
  wrap?: string | string[];
  /** A frozen time, like `2026-10-19T09:00:00Z`. */
  clock?: string;
  /** More SQL on the test's fresh copy of the lesson's database. */
  sql?: string;
  /** Documents added to the lesson's MongoDB data, by collection. */
  seed?: Record<string, unknown[]>;
  /** Hidden code around the program: its line holding just `{{code}}`
      becomes the program. */
  harness?: string;
  /** Hidden code after the program (a harness of `{{code}}` and this). */
  append?: string;
  /** Hidden calls that replace everything after the program's
      `// --- try it ---` line. */
  tryIt?: string;
}

/** What running an example shows: it runs cleanly (`run`), stops at the type
    check with `output` as the checker's text (`type-error`), or prints
    `output` and then crashes with `errorIncludes` on stderr
    (`runtime-error`). */
export type ExampleExpect = "run" | "type-error" | "runtime-error";

export interface LessonExample {
  title: string;
  prompt: string;
  code: string;
  stdin?: string;
  args?: string[];
  env?: Record<string, string>;
  /** `run` when unset. */
  expect?: ExampleExpect;
  output: string;
  /** Text its stderr shows (a `runtime-error`'s message). */
  errorIncludes?: string;
  /** The exit status it ends with, when that isn't 0 (Bash). */
  exitCode?: number;
  /** Another fixture set than the lesson's. */
  fixtures?: string;
  clock?: string;
  explanation: string;
}

/** A type-test case: a line of code compiled against the practice's
    program, never run. `ok` must compile, `error` must not (with
    `errorCode` when it's set). */
export interface TypeTestCase {
  name: string;
  expect: "ok" | "error";
  errorCode?: string;
  code: string;
}

export interface TypeTests {
  /** The line the type tests start with, importing from the program. */
  imports: string;
  cases: TypeTestCase[];
}

/** Honesty rules a practice can set: no `any`, no `as` (except `as const`),
    no non-null `!`, and no `@ts-` comments. */
export type ForbidRule = "any" | "as" | "non-null" | "ts-comments";

export interface LessonPractice {
  title: string;
  prompt: string;
  /** `write` (unset): build what the prompt asks. `fix-types`: the starter
      has type errors on purpose (`starterErrors`) for you to fix. */
  kind?: "write" | "fix-types";
  starterErrors?: string[];
  starter: string;
  solution: string;
  tests: LessonTest[];
  typeTests?: TypeTests;
  forbid?: ForbidRule[];
  /** The fixture set every test starts from, unless a test names another. */
  fixtures?: string;
  clock?: string;
  hints?: string[];
}

export interface LessonStep {
  title: string;
  body: string;
  /** Worked examples, in order (1 to 3). A lesson file may still give a
      single `example`, which reads as the only one. */
  examples: LessonExample[];
  practice: LessonPractice;
  /** Overrides the lesson's format for this part. */
  format?: LessonFormat;
}

/** A database lesson's starting data: SQL for the SQL course (on PGlite),
    or a PostgreSQL script, or MongoDB documents by collection. */
export type LessonSetup = string | { postgres: string } | { mongo: Record<string, unknown> };

export interface Lesson {
  id: string;
  title: string;
  section: string;
  summary: string;
  intro: string;
  steps: LessonStep[];
  recap?: string;
  /** SQL lessons: the tables and rows every program in the lesson starts
      from. An example's or test's `stdin` is more setup SQL on top. */
  setup?: LessonSetup;
  /** `single` when unset. */
  format?: LessonFormat;
  /** Overrides the course's runtime for this lesson. */
  runtime?: string;
  /** The fixture set (data files) every program in the lesson starts in:
      content/fixtures/<course>/<name>/. */
  fixtures?: string;
  /** A frozen time for every run in the lesson. */
  clock?: string;
  /** Spring: the smallest profile that runs the lesson, and its mode. */
  profile?: string;
  mode?: string;
  /** Page lessons: options for the page server. */
  preview?: Record<string, unknown>;
  /** Workspace lessons: the template their workspaces start from. */
  template?: string;
}

/** A read part's example: code to look at, shown in its own language and
    never run. */
export interface ReadExample {
  title: string;
  prompt: string;
  /** The fence language it is highlighted as (ts, python, http...). */
  language: string;
  /** The path in the codebase it comes from. */
  file?: string;
  code: string;
  /** Output it printed when it was really run, if it shows any. */
  output?: string;
  explanation: string;
}

/** A codebase a part opens in the IDE: a template in
    content/workspaces/<course>/, at these files. */
export interface StepCodebase {
  template: string;
  files: string[];
}

/** A part to read: no practice, just its examples (1 to 3). */
export interface ReadStep {
  title: string;
  body: string;
  examples: ReadExample[];
  codebase?: StepCodebase;
}

/** A lesson of parts to read (2 or 3), for the short courses that teach
    with code to look at instead of practices. */
export interface ReadLesson {
  id: string;
  title: string;
  section: string;
  summary: string;
  format: "read";
  intro: string;
  steps: ReadStep[];
  recap?: string;
}

/** Any lesson Learn shows. A `read` format tells the two apart. */
export type AnyLesson = Lesson | ReadLesson;

/** A step as a lesson file may write it: a single `example` (what every
    lesson before several examples per part used) or `examples`. */
export type LessonStepFile = Omit<LessonStep, "examples"> & { example?: LessonExample; examples?: LessonExample[] };
export type LessonFile = (Omit<Lesson, "steps"> & { steps: LessonStepFile[] }) | ReadLesson;

/** The most worked examples a part has: the editor's Example 1 to 3 tabs. */
export const MAX_EXAMPLES = 3;

/** A lesson file as Learn reads it: every step's examples in `examples`, at
    most MAX_EXAMPLES of them, so the lesson column and the editor's tabs
    always show the same ones (scripts/verify-lessons.mjs refuses more). */
export function normalizeLesson(file: LessonFile): AnyLesson {
  if (file.format === "read") {
    return { ...file, steps: file.steps.map((step) => ({ ...step, examples: (step.examples ?? []).slice(0, MAX_EXAMPLES) })) };
  }
  return {
    ...file,
    steps: file.steps.map(({ example, examples, ...step }) => ({
      ...step,
      examples: (examples ?? (example ? [example] : [])).slice(0, MAX_EXAMPLES),
    })),
  };
}

/** What a course's single-file parts add to today's editor and checks. */
export interface SingleFileFeatures {
  /** Runs on the runner: a Check is one request for every test, judged by
      lib/single-checks.mjs (exit codes, files, type tests, honesty rules). */
  runner: boolean;
  /** An Arguments field next to stdin (Bash). */
  args: boolean;
  /** The exit status as a badge beside the output's heading (Bash). */
  exitBadge: boolean;
  /** A Type check strip above the output, and type errors underlined in
      the editor (TypeScript). */
  typeCheck: boolean;
}

export function singleFileFeatures(course: string, fileName: string): SingleFileFeatures {
  return {
    runner: runtimeKindOf(course) === "runner",
    args: course === "bash",
    exitBadge: course === "bash",
    typeCheck: /\.tsx?$/.test(fileName),
  };
}

/** A lesson as the lesson list sees it: no bodies, just what it shows. */
export interface LessonMeta {
  id: string;
  title: string;
  section: string;
  summary: string;
  /** Number of practice problems (one per step). A read lesson's parts
      count instead, each done once it's opened. */
  problems: number;
  /** Each step's title: the lesson's parts, in order. */
  parts: string[];
}

/** Just enough of a lesson to link into it: its id and how many parts it has. */
export interface LessonRef {
  id: string;
  parts: number;
}

export interface Course {
  language: string;
  title: string;
  description: string;
  sections: { title: string; lessons: LessonMeta[] }[];
}

/** Stable id of a lesson's practice problem (a read part's, for a read
    lesson), used for progress. */
export const problemId = (lessonId: string, step: number) => `${lessonId}/${step}`;

/** Every step of a lesson is its own page, a part. `part` counts from 1. */
export const partHref = (lang: string, lessonId: string, part: number) => `/${lang}/learn/${lessonId}/${part}`;
