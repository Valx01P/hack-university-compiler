import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, describe, it } from "node:test";
import { ROOT } from "./config.ts";
import { LABEL, connect, resolveEndpoint } from "./docker.ts";
import { Images } from "./images.ts";
import { JobPool } from "./jobs.ts";
import { quietLog } from "./log.ts";
import { runRecipe, type RecipeDeps } from "./recipes/index.ts";
import { RunRequest } from "./schemas.ts";

/**
 * Real jobs in real containers, in the verify namespace (hv-job-*), so a
 * learner's live runner never sees them. Skipped when Docker is off or the
 * images aren't built (npm run images builds them).
 */

const endpoint = resolveEndpoint();
const docker = connect(endpoint);
const images = new Images(ROOT, docker, endpoint.dockerHost);
let skip: string | false = false;
try {
  await docker.ping();
  await images.refresh();
  if (images.state("node") !== "ready" || images.state("bash") !== "ready") skip = "the hu images aren't built (npm run images)";
} catch {
  skip = "Docker isn't running";
}

const owner = { ns: "verify" as const, boot: randomBytes(6).toString("hex"), port: 0 };
const deps: RecipeDeps = { docker, owner, images, pool: new JobPool(4), log: quietLog };
const run = (body: unknown) => runRecipe(deps, RunRequest.parse(body));
const ts = (code: string, extra: object = {}) => run({ recipe: "typescript", files: [{ name: "main.ts", content: code }], ...extra });
const sh = (code: string, extra: object = {}) => run({ recipe: "bash", files: [{ name: "main.sh", content: code }], ...extra });

after(async () => {
  if (skip) return;
  // A job answers first and removes its container right after.
  for (let i = 0; i < 50 && deps.pool.stats.running; i++) await new Promise((r) => setTimeout(r, 100));
  const left = await docker.listContainers({ all: true, filters: { label: [`${LABEL.runner}=${owner.boot}`] } });
  assert.deepEqual(left.map((c) => c.Names[0]), [], "every job container is removed");
});

describe("the typescript recipe", { skip }, () => {
  it("checks, then runs main.ts with stdin, arguments, zod, and the clock", async () => {
    const r = await ts(
      [
        'import * as z from "zod";',
        'import { readFileSync } from "node:fs";',
        "const User = z.object({ name: z.string() });",
        'const u = User.parse({ name: "Ada" });',
        'console.log(`${u.name} ${readFileSync(0, "utf8").trim()} ${process.argv.slice(2).join(",")} ${process.env.HU_FIXED_TIME}`);',
        "await Promise.resolve();",
      ].join("\n"),
      { stdin: "hi\n", args: ["a", "b"], clock: "2026-10-01T09:00:00Z" }
    );
    assert.equal(r.compile?.code, 0);
    assert.equal(r.run?.stdout, "Ada hi a,b 2026-10-01T09:00:00Z\n");
    assert.equal(r.run?.stderr, "");
    assert.equal(r.run?.code, 0);
    assert.equal(r.run?.status, null);
  });

  it("stops at a type error, like a compile error, and Piston's shape repeats it as the run", async () => {
    const r = await ts('const n: number = "x";\nconsole.log(n);\n');
    assert.equal(r.compile?.code, 1);
    assert.equal(r.compile?.output, "main.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.\n");
    assert.deepEqual(r.run, r.compile);
    const enums = await ts("enum Color { Red }\n");
    assert.match(enums.compile?.output ?? "", /TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled/);
  });

  it("shows what Node does without the checker", async () => {
    const r = await ts('// @ts-nocheck\nconst o = undefined;\nconsole.log("before");\nconsole.log(o.x);\n');
    assert.equal(r.run?.stdout, "before\n");
    assert.match(r.run?.stderr ?? "", /TypeError: Cannot read properties of undefined/);
    assert.equal(r.run?.code, 1);
  });

  it("runs every test after one tsc, with type tests, honesty rules, and tryIt", async () => {
    const code = [
      'export type Payment = { kind: "card"; last4: string } | { kind: "cash" };',
      "export function describe(p: Payment): string {",
      '  return p.kind === "card" ? `card ending ${p.last4}` : "cash";',
      "}",
      'const n = JSON.parse("1") as number;',
      "// --- try it ---",
      'console.log(describe({ kind: "card", last4: "4242" }), n);',
    ].join("\n");
    const r = await ts(code, {
      tests: [{}, { tryIt: 'console.log(describe({ kind: "cash" }));' }, { stdin: "x" }],
      typeTests: {
        imports: 'import { describe } from "./main.ts";',
        cases: [
          { name: "accepts a card", expect: "ok", code: 'describe({ kind: "card", last4: "1" });' },
          { name: "rejects a card without last4", expect: "error", errorCode: "TS2345", code: 'describe({ kind: "card" });' },
        ],
      },
      forbid: ["any", "as", "non-null", "ts-comments"],
    });
    assert.equal(r.compile?.code, 0);
    assert.deepEqual(r.results?.map((t) => t.stdout), ["card ending 4242 1\n", "cash\n", "card ending 4242 1\n"]);
    assert.deepEqual(r.typeTests?.map((t) => t.pass), [true, true]);
    assert.deepEqual(r.forbid?.map((h) => `${h.rule}@${h.line}`), ["as@5"]);
    assert.ok((r.timing.totalMs ?? 0) < 1500, `a 3-test check took ${r.timing.totalMs} ms`);
  });

  it("skips the tests when main.ts doesn't compile", async () => {
    const r = await ts("const x: number = 'a';\n", { tests: [{}, {}] });
    assert.deepEqual(r.results?.map((t) => t.skipped), ["compile", "compile"]);
  });

  it("stops a flood of output at 1 MB, and a memory hog at 512 MB", async () => {
    const flood = await ts('const line = "y".repeat(999);\nfor (;;) console.log(line);\n');
    assert.equal(flood.run?.status, "OL");
    assert.equal(flood.run?.limit, "output");
    assert.equal(Buffer.byteLength(flood.run?.stdout ?? ""), 1024 * 1024);
    const hog = await ts("const keep: Buffer[] = [];\nfor (;;) keep.push(Buffer.alloc(16 << 20, 1));\n");
    assert.equal(hog.run?.signal, "SIGKILL");
    assert.equal(hog.run?.limit, "memory");
  });

  it("stops a program that runs too long at 10 s", async () => {
    const r = await ts("while (true) {}\n");
    assert.equal(r.run?.status, "TO");
    assert.equal(r.run?.signal, "SIGKILL");
    assert.equal(r.run?.code, null);
  });
});

describe("the bash recipe", { skip }, () => {
  it("runs main.sh as learner on devbox, with arguments, stdin, fixtures, and a frozen clock", async () => {
    const r = await sh(
      [
        'echo "$# args: $*"',
        'echo "$(whoami)@$(hostname) in $PWD, home $HOME"',
        "read -r line; echo \"stdin: $line\"",
        "date -u +%FT%TZ",
        "find . -name '*.log' -mtime +7 | sort",
        "echo oops >&2",
        "exit 3",
      ].join("\n"),
      {
        args: ["one", "two words"],
        stdin: "hello\n",
        clock: "2026-10-19T09:00:00Z",
        fixtures: "logs",
        fixtureSets: {
          logs: [
            { name: "logs/old.log", content: "x\n", mtime: "2026-10-01T00:00:00Z" },
            { name: "logs/new.log", content: "y\n" },
          ],
        },
      }
    );
    assert.equal(
      r.run?.stdout,
      "2 args: one two words\nlearner@devbox in /home/learner, home /home/learner\nstdin: hello\n2026-10-19T09:00:00Z\n./logs/old.log\n"
    );
    assert.equal(r.run?.stderr, "oops\n");
    assert.equal(r.run?.code, 3);
    assert.equal(r.run?.status, "RE");
  });

  it("starts each test from a fresh copy and reads back the files it leaves", async () => {
    const r = await sh('mkdir -p out\nls | sort > out/list.txt\necho "made by ${1:-nobody}" > out/note.txt\nrm -f gone.txt\n', {
      fixtures: "a",
      fixtureSets: { a: [{ name: "gone.txt", content: "x" }, { name: "keep.txt", content: "k" }], b: [{ name: "other.txt", content: "o" }] },
      tests: [
        { args: ["ada"], files: { "out/note.txt": "" }, absent: ["gone.txt"] },
        { fixtures: "b", collect: ["out/list.txt", "keep.txt", "out"] },
      ],
    });
    const [first, second] = r.results ?? [];
    assert.equal(first.files["out/note.txt"], "made by ada\n");
    assert.equal(first.exists["gone.txt"], false);
    assert.equal(second.files["out/list.txt"], "main.sh\nother.txt\nout\n");
    assert.equal(second.exists["keep.txt"], false);
    assert.equal(second.exists.out, true);
    assert.equal(second.files.out, null);
  });

  it("runs from a subfolder, inside a wrapping command", async () => {
    const r = await run({
      recipe: "bash",
      files: [{ name: "main.sh", content: 'pwd\necho "$0"\n' }, { name: "sub", type: "dir" }],
      tests: [{ cwd: "sub" }, { wrap: ["flock", "job.lock"], collect: ["job.lock"] }],
    });
    assert.equal(r.results?.[0].stdout, "/home/learner/sub\n../main.sh\n");
    assert.equal(r.results?.[1].stdout, "/home/learner\nmain.sh\n");
    assert.equal(r.results?.[1].exists["job.lock"], true);
  });

  it("tells an exit status of 130 from a death by SIGINT", async () => {
    const exited = await sh("exit 130\n");
    assert.equal(exited.run?.code, 130);
    assert.equal(exited.run?.signal, null);
    const killed = await sh("kill -INT $$\n");
    assert.equal(killed.run?.code, null);
    assert.equal(killed.run?.signal, "SIGINT");
  });

  it("ends a step when the script does, and leaves nothing running for the next test", async () => {
    const r = await sh("sleep 5 &\n(sleep 0.5; echo late > late.txt) &\necho started\n", { tests: [{}, { collect: ["late.txt"] }] });
    assert.equal(r.results?.[0].stdout, "started\n");
    assert.ok((r.results?.[0].wall_time ?? 0) < 1000, `the step took ${r.results?.[0].wall_time} ms`);
    assert.equal(r.results?.[1].exists["late.txt"], false);
  });
});
