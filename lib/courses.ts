import registry from "@/content/courses.json";

/**
 * The course registry, content/courses.json: every course in the order of
 * the Learn side panel's icon rows and the compiler rail. It is the list
 * everything iterates: the rail, the icon rows, Learn's routes, the
 * cheatsheet routes, /api/execute's dispatch, /api/lang's allow-list, the
 * homepage redirect in next.config.ts, the snippet harness, and the
 * verifiers (the .mjs ones read the JSON themselves). Pure data, safe for
 * client and server.
 *
 * A course's `page` is what /<slug> shows. A course without one (the
 * project courses: web, React, Next.js, Express, FastAPI, Spring Boot, Go
 * APIs) has no compiler page: it's read lessons in Learn, runs nothing
 * (runtime "none"), and stays out of the redirect and the compiler routes.
 * Learn's course icons show it once it has lessons, and its code is for the
 * playground (/playground), a folder on this computer.
 *
 * A course without a page can still run its lessons, in another course's
 * compiler (`runsIn`): Math's are ordinary lessons with an editor, Run, and
 * Check, every program Python run by /python's runtime, and Learn links out
 * to /python. It's only in Learn, like the project courses: no rail entry,
 * no page, no cheatsheet, challenges, or search.
 */
export type CoursePage = "single" | "page";

export interface CourseEntry {
  /** The route: /<slug> and /<slug>/learn/... */
  slug: string;
  /** The rail's label ("Python 3 compiler"). */
  label: string;
  /** The Learn title. */
  title: string;
  /** The Learn icon row (8 to a row). Array order is the position in it. */
  row: 1 | 2;
  /** A simple-icons export ("siPython"), or one of lang-icon's own glyphs. */
  icon: string;
  /** A small lucide badge on the icon: "server" for Go APIs. */
  badge?: "server";
  /** What /<slug> shows: the single-file compiler. Missing for the project
      courses, which have no compiler page. */
  page?: CoursePage;
  /** piston:<id> (an id in lib/runtimes.json), pglite (SQL, in the
      browser), runner:<recipe> (hu-runner), or none (read lessons only,
      which run nothing). A course that `runsIn` another has that one's. */
  runtime: string;
  /** For a course with no page: the course whose compiler runs its
      lessons ("python" for Math). Its programs run, check, highlight, and
      complete as that course's, its link out goes to that compiler, and
      installing that course is what it needs. Its progress, saved code,
      and routes stay its own. */
  runsIn?: string;
  /** Lesson prose typesets TeX between dollar signs with KaTeX ($x^2$
      inline, $$ blocks for display). Elsewhere a $ is just a dollar. */
  math?: boolean;
  /** The single file's name (main.ts, Main.java). */
  fileName?: string;
  /** An Arguments field next to stdin (Bash). */
  args?: boolean;
  /** Fence language to runtime for this course's snippets (null: shown only). */
  fences?: Record<string, string | null>;
}

export const COURSES: readonly CourseEntry[] = (registry as { courses: CourseEntry[] }).courses;

const BY_SLUG = new Map(COURSES.map((c) => [c.slug, c]));

/** A course by its slug, shipped or not. */
export function getCourseEntry(slug: string): CourseEntry | undefined {
  return BY_SLUG.get(slug);
}

/** Courses whose /<slug> page exists, in registry order. */
export const COMPILER_COURSES: readonly CourseEntry[] = COURSES.filter((c) => c.page);

/** Whether /<slug> is a course's compiler page. */
export const isCompilerCourse = (slug: string) => Boolean(BY_SLUG.get(slug)?.page);

/** The course whose compiler page runs a course's programs, which its
    Learn mode links out to: the course itself when it has a page, the one
    its `runsIn` names when it doesn't (Python for Math), and undefined for
    a read course. */
export function compilerCourseOf(slug: string): CourseEntry | undefined {
  const course = BY_SLUG.get(slug);
  if (course?.page) return course;
  const host = course?.runsIn ? BY_SLUG.get(course.runsIn) : undefined;
  return host?.page ? host : undefined;
}

export type RuntimeKind = "piston" | "pglite" | "runner";

/** A runtime's kind and the id after the colon: piston:python is Piston's
    python, runner:typescript the runner's typescript recipe. */
export function parseRuntime(runtime: string): { kind: RuntimeKind; id: string } | null {
  const [kind, id = ""] = runtime.split(":", 2);
  if (kind === "pglite") return id ? null : { kind, id: "" };
  if ((kind === "piston" || kind === "runner") && /^[a-z0-9-]+$/.test(id)) return { kind, id };
  return null;
}

/** What runs a course's single file: Piston, PGlite, or the runner. */
export function runtimeKindOf(slug: string): RuntimeKind | null {
  const course = BY_SLUG.get(slug);
  return course ? (parseRuntime(course.runtime)?.kind ?? null) : null;
}

/**
 * Courses by Learn row, each row in registry order: row 1, then row 2.
 * Rows with nothing in them are left out, so the result packs to the top.
 */
export function courseRows<T extends Pick<CourseEntry, "row">>(courses: readonly T[]): T[][] {
  const rows: T[][] = [[], []];
  for (const c of courses) rows[c.row - 1]?.push(c);
  return rows.filter((r) => r.length > 0);
}
