import * as z from "zod";

/**
 * The bodies the runner accepts, checked before anything runs (architecture
 * §3.2 and §3.5). Content names a recipe and files, never a command line, an
 * image, or a host path, so nothing here can choose what runs or where.
 */

const KiB = 1024;
const MiB = 1024 * KiB;
const utf8Bytes = (s: string) => Buffer.byteLength(s, "utf8");

/** A relative path inside the job: no NUL, no leading "/", no "." or ".."
    segments, at most 4,096 bytes overall and 255 per segment. */
export const RelPath = z
  .string()
  .min(1)
  .refine((p) => utf8Bytes(p) <= 4096, "is longer than 4,096 bytes")
  .refine((p) => !p.includes("\0"), "contains a NUL byte")
  .refine((p) => !p.startsWith("/"), "must be relative")
  .refine(
    (p) => p.split("/").every((s) => s !== "" && s !== "." && s !== ".." && utf8Bytes(s) <= 255),
    'has an empty, ".", "..", or over-long segment'
  );

/** An instant such as 2026-10-19T09:00:00Z. */
export const Instant = z.iso.datetime({ offset: true });

/** A frozen clock for the run, or null for the real time. */
const Clock = Instant.nullable();

const Arg = z.string().max(4 * KiB).refine((s) => !s.includes("\0"), "contains a NUL byte");

export const EnvVars = z
  .record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/, "is not a valid variable name"), Arg)
  .refine((env) => Object.keys(env).length <= 64, "has more than 64 variables");

const SetName = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, "is not a fixture set name");

export const FileEntry = z
  .strictObject({
    name: RelPath,
    content: z.string().max(4 * MiB).default(""),
    encoding: z.enum(["utf8", "base64"]).optional(),
    /** Permission bits, 0644 for files and 0755 for folders when left out. */
    mode: z.number().int().min(0).max(0o7777).optional(),
    type: z.enum(["file", "dir", "symlink"]).optional(),
    /** A symlink's target, kept as written. */
    target: z.string().min(1).max(4096).optional(),
    /** The modification time, for find -mtime and ls -l. The run's clock (or now) when left out. */
    mtime: Instant.optional(),
  })
  .superRefine((f, ctx) => {
    const type = f.type ?? "file";
    if (type === "symlink" && !f.target) ctx.addIssue({ code: "custom", message: "a symlink needs a target" });
    if (type !== "symlink" && f.target) ctx.addIssue({ code: "custom", message: "only a symlink has a target" });
    if (type !== "file" && f.content) ctx.addIssue({ code: "custom", message: `a ${type} has no content` });
  });

export const TestSpec = z.strictObject({
  stdin: z.string().max(MiB).optional(),
  args: z.array(Arg).max(64).optional(),
  env: EnvVars.optional(),
  clock: Clock.optional(),
  /** Another fixture set for this test, so a hardcoded answer fails (Bash). */
  fixtures: SetName.optional(),
  /** A subfolder to run from (Bash). */
  cwd: RelPath.optional(),
  /** A command wrapped around the script, such as ["flock", "job.lock"] (Bash). */
  wrap: z.array(Arg).min(1).max(16).optional(),
  /** Files the program must leave behind: the runner sends back their contents (Bash). */
  files: z.record(RelPath, z.string().max(MiB)).optional(),
  /** Paths that must not exist afterwards: the runner says whether they do (Bash). */
  absent: z.array(RelPath).max(64).optional(),
  /** More paths to send back, without an expectation. */
  collect: z.array(RelPath).max(64).optional(),
  /** Hidden calls that replace everything after the program's `// --- try it ---` line (TypeScript). */
  tryIt: z.string().max(100 * KiB).optional(),
  // Judged by lib/single-checks.mjs, not here. Accepted so a test can be sent as written.
  output: z.string().max(MiB).optional(),
  exitCode: z.number().int().min(0).max(255).optional(),
  stderrIncludes: z.string().max(64 * KiB).optional(),
});

export const TypeTests = z.strictObject({
  /** The line every generated type-test file starts with, such as import { describe } from "./main.ts". */
  imports: z.string().max(4 * KiB),
  cases: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(200),
        expect: z.enum(["ok", "error"]),
        errorCode: z.string().regex(/^TS\d{1,5}$/).optional(),
        code: z.string().min(1).max(20 * KiB),
      })
    )
    .min(1)
    .max(6)
    .refine((cases) => new Set(cases.map((c) => c.name)).size === cases.length, "case names must be unique"),
});

export const FORBID_RULES = ["any", "as", "non-null", "ts-comments"] as const;

export const RunRequest = z
  .strictObject({
    recipe: z.enum(["typescript", "bash"]),
    /** The program: main.ts, or main.sh plus any files it ships with. */
    files: z.array(FileEntry).min(1).max(50),
    // A Run (no tests) uses these. Tests carry their own.
    stdin: z.string().max(MiB).optional(),
    args: z.array(Arg).max(64).optional(),
    env: EnvVars.optional(),
    clock: Clock.optional(),
    /** The fixture set copied in before the program runs (Bash), by name. */
    fixtures: SetName.optional(),
    fixtureSets: z.record(SetName, z.array(FileEntry).max(500)).optional(),
    /** A Check: every test in one job, so tsc runs once. */
    tests: z.array(TestSpec).min(1).max(20).optional(),
    typeTests: TypeTests.optional(),
    // The honesty rules, judged by lib/single-checks.mjs from the source, not
    // here. Accepted so a Check can be sent as written.
    forbid: z.array(z.enum(FORBID_RULES)).max(4).optional(),
  })
  .superRefine((req, ctx) => {
    const issue = (message: string, path: (string | number)[] = []) => ctx.addIssue({ code: "custom", message, path });
    const tests = req.tests ?? [];
    if (req.recipe === "typescript") {
      if (req.files.length !== 1 || req.files[0].name !== "main.ts" || (req.files[0].type ?? "file") !== "file") {
        issue("the typescript recipe takes exactly one file, main.ts", ["files"]);
      }
      if (req.fixtures || req.fixtureSets) issue("fixtures are for the bash recipe", ["fixtures"]);
      tests.forEach((t, i) => {
        for (const key of ["fixtures", "cwd", "wrap", "files", "absent", "collect"] as const) {
          if (t[key] !== undefined) issue(`${key} is for the bash recipe`, ["tests", i, key]);
        }
      });
    } else {
      if (!req.files.some((f) => f.name === "main.sh" && (f.type ?? "file") === "file")) {
        issue("the bash recipe needs main.sh", ["files"]);
      }
      if (req.typeTests) issue("type tests are for the typescript recipe", ["typeTests"]);
      if (req.forbid) issue("honesty rules are for the typescript recipe", ["forbid"]);
      const sets = req.fixtureSets ?? {};
      if (req.fixtures && !sets[req.fixtures]) issue(`no fixture set named ${req.fixtures}`, ["fixtures"]);
      tests.forEach((t, i) => {
        if (t.tryIt !== undefined) issue("tryIt is for the typescript recipe", ["tests", i, "tryIt"]);
        if (t.fixtures && !sets[t.fixtures]) issue(`no fixture set named ${t.fixtures}`, ["tests", i, "fixtures"]);
      });
    }
    const names = req.files.map((f) => f.name);
    if (new Set(names).size !== names.length) issue("two files have the same name", ["files"]);
  });

export type RunRequest = z.infer<typeof RunRequest>;
export type TestSpec = z.infer<typeof TestSpec>;
export type FileEntry = z.infer<typeof FileEntry>;
export type TypeTests = z.infer<typeof TypeTests>;
export type ForbidRule = (typeof FORBID_RULES)[number];

/** A workspace id: "w" and 10 lowercase base32 characters of SHA-256(scope). */
export const WorkspaceId = z.string().regex(/^w[a-z2-7]{10}$/, "is not a workspace id");

export const TicketRequest = z
  .strictObject({
    workspace: WorkspaceId,
    kind: z.enum(["events", "term"]),
    sid: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/, "is not a terminal session id").optional(),
  })
  .refine((t) => (t.kind === "term") === (t.sid !== undefined), "a term ticket needs a sid, and only it does");

export const PrewarmRequest = z.union([
  z.strictObject({ scope: z.string().min(1).max(512) }),
  z.strictObject({ course: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/) }),
]);

/** A short, readable list of what was wrong with a body. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ");
}
