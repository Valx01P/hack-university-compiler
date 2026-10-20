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
  /** More SQL after the lesson's setup, run on this test's fresh database (database lessons). */
  sql: z.string().max(MiB).optional(),
  /** Mongo documents added after the setup ({ "<collection>": [EJSON documents] }), or SQL. */
  seed: z.union([z.string().max(MiB), z.record(z.string(), z.unknown())]).optional(),
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

/**
 * A lesson's database (architecture §6.3): SQL (or `{ postgres }`) that builds
 * the template each test's fresh PostgreSQL database is cloned from, or
 * `{ mongo }` documents (Extended JSON, with `$indexes`) loaded into each
 * test's fresh MongoDB database.
 */
export const Setup = z.union([
  z.string().min(1).max(4 * MiB),
  z.strictObject({ postgres: z.string().min(1).max(4 * MiB) }),
  z.strictObject({ mongo: z.record(z.string(), z.unknown()) }),
]);

/** Recipes whose programs may have a database. The express, fastapi, go, and spring recipes join as they land. */
export const DB_RECIPES: readonly string[] = ["typescript"];

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
    /** The lesson's database: every test gets a fresh one, and DATABASE_URL or MONGODB_URI points at it. */
    setup: Setup.optional(),
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
    if (req.setup !== undefined && !DB_RECIPES.includes(req.recipe)) issue(`the ${req.recipe} recipe has no database`, ["setup"]);
    tests.forEach((t, i) => {
      if ((t.sql !== undefined || t.seed !== undefined) && req.setup === undefined) issue("sql and seed need the lesson's setup", ["tests", i]);
    });
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

// Workspaces (architecture §3.2, §3.5, §6.7). Next sends these after resolving
// content: the browser names a scope, never a command, an image, or a path.

const Course = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/, "is not a course slug");
const TaskName = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/, "is not a task name");
const Command = z.string().min(1).max(4 * KiB).refine((s) => !s.includes("\0"), "contains a NUL byte");

export const TaskDef = z.union([
  Command,
  z.strictObject({ cmd: Command, label: z.string().max(64).optional(), run: z.boolean().optional() }),
]);

export const PortDecl = z.strictObject({
  env: z.string().regex(/^[A-Z][A-Z0-9_]{0,31}$/, "is not a variable name"),
  label: z.string().max(64).optional(),
  readyPath: z.string().max(512).optional(),
  preview: z.boolean().optional(),
});

/** base, checkpoints/<cp>, examples/<id>, or @<a folder under content/>. */
export const LayerName = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (l) =>
      l === "base" ||
      /^(checkpoints|examples)\/[a-z0-9][a-z0-9._-]{0,63}$/.test(l) ||
      (/^@[A-Za-z0-9._/-]+$/.test(l) && l.slice(1).split("/").every((s) => s !== "" && s !== "." && s !== "..")),
    "is not a layer (base, checkpoints/<cp>, examples/<id>, or @<path under content>)"
  );

export const OpenWorkspace = z.strictObject({
  scope: z.string().min(1).max(256),
  template: z.string().regex(/^[a-z][a-z0-9-]{0,31}\/[a-z0-9][a-z0-9._-]{0,63}$/, "is not <course>/<template>"),
  layers: z.array(LayerName).min(1).max(32),
  course: Course.optional(),
  image: z.enum(["node", "bash", "web", "check-web", "python", "java", "go"]).optional(),
  storage: z.enum(["host", "volume"]).optional(),
  profile: z.enum(["standard", "sysadmin"]).optional(),
  start: z.enum(["run", "open"]).optional(),
  examples: z.enum(["own", "shared"]).optional(),
  ports: z.array(PortDecl).max(8).optional(),
  tasks: z
    .record(TaskName, TaskDef)
    .refine((t) => Object.keys(t).length <= 16, "has more than 16 tasks")
    .optional(),
  env: EnvVars.optional(),
  limits: z
    .strictObject({
      memoryMb: z.number().int().min(64).max(16384).optional(),
      cpus: z.number().min(0.25).max(16).optional(),
      pids: z.number().int().min(16).max(4096).optional(),
    })
    .optional(),
  build: z.array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, "is not a folder name")).max(8).optional(),
  hidden: z.array(RelPath).max(64).optional(),
  readonly: z.array(RelPath).max(256).optional(),
  restartOnReset: z.boolean().optional(),
  // Kept for later phases (dependencies and databases arrive in P2, diagnostics with the IDE).
  deps: z.record(z.string(), z.unknown()).optional(),
  services: z.record(z.string(), z.unknown()).optional(),
  diagnostics: z.array(z.unknown()).max(8).optional(),
  volumes: z.array(z.string().max(256)).max(8).optional(),
  seed: z.unknown().optional(),
  // template.json fields the runner doesn't use, accepted so it can be spread in.
  id: z.string().max(128).optional(),
  title: z.string().max(256).optional(),
  layout: z.string().max(32).optional(),
  open: z.array(z.unknown()).max(64).optional(),
  requests: z.string().max(512).optional(),
  panels: z.array(z.string().max(32)).max(16).optional(),
  autosave: z.boolean().optional(),
});

export type OpenWorkspace = z.infer<typeof OpenWorkspace>;

const Mode = z.number().int().min(0).max(0o7777);
const UndoToken = z.string().regex(/^[a-z0-9]{8,40}$/, "is not an undo token");

export const FsOp = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("mkdir"), path: RelPath }),
  z.strictObject({ op: z.literal("rename"), path: RelPath, to: RelPath }),
  z.strictObject({ op: z.literal("copy"), path: RelPath, to: RelPath }),
  z.strictObject({ op: z.literal("delete"), path: RelPath }),
  z.strictObject({ op: z.literal("chmod"), path: RelPath, mode: Mode }),
  z.strictObject({ op: z.literal("restore"), undo: UndoToken }),
]);
export type FsOp = z.infer<typeof FsOp>;

export const ResetRequest = z
  .strictObject({
    scope: z.enum(["file", "dir", "all", "db", "everything"]),
    path: RelPath.optional(),
    dryRun: z.boolean().optional(),
  })
  .refine((r) => (r.scope === "file" || r.scope === "dir") === (r.path !== undefined), "file and dir resets need a path, and only they do");

export const SnapshotRequest = z.strictObject({ label: z.string().min(1).max(80).optional() });

export const TerminalRequest = z.strictObject({
  cols: z.number().int().min(2).max(1000),
  rows: z.number().int().min(1).max(500),
  cwd: RelPath.optional(),
});

export const PortRequest = z.strictObject({ port: z.number().int().min(1).max(65535) });

export const SignalRequest = z.strictObject({ sig: z.enum(["INT", "TERM", "HUP", "KILL", "QUIT", "USR1", "USR2"]) });

export const HttpPanelRequest = z.strictObject({
  port: z.number().int().min(1).max(65535),
  method: z.string().regex(/^[A-Z]{1,16}$/, "is not an HTTP method"),
  path: z
    .string()
    .min(1)
    .max(8 * KiB)
    .refine((p) => p.startsWith("/") && !/[\r\n\0 ]/.test(p), "must start with / and hold no spaces or line breaks"),
  headers: z
    .record(z.string().regex(/^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,128}$/, "is not a header name"), z.string().max(8 * KiB).refine((v) => !/[\r\n\0]/.test(v), "holds a line break"))
    .refine((h) => Object.keys(h).length <= 64, "has more than 64 headers")
    .optional(),
  body: z.string().max(1.5 * MiB).optional(),
  bodyEncoding: z.enum(["utf8", "base64"]).optional(),
  jar: z.boolean().optional(),
  timeoutMs: z.number().int().min(100).max(120_000).optional(),
});
export type HttpPanelRequest = z.infer<typeof HttpPanelRequest>;

export const CarryRequest = z.strictObject({ from: z.string().min(1).max(256) });

export const CheckRequest = z.strictObject({
  suite: RelPath,
  target: z.record(z.string().max(32), z.union([z.string().max(256), z.number()])).optional(),
});
