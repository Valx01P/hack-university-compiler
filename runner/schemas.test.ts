import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RelPath, RunRequest, TicketRequest, describeIssues } from "./schemas.ts";

const ts = (extra: object = {}) => ({ recipe: "typescript", files: [{ name: "main.ts", content: "console.log(1);" }], ...extra });
const sh = (extra: object = {}) => ({ recipe: "bash", files: [{ name: "main.sh", content: "echo 1" }], ...extra });
const errors = (body: unknown) => {
  const r = RunRequest.safeParse(body);
  return r.success ? "" : describeIssues(r.error);
};

describe("paths", () => {
  it("stay relative and inside the job", () => {
    for (const ok of ["main.sh", "logs/app.log", "a b/c.txt", ".hidden", "deep/er/path"]) assert.equal(RelPath.safeParse(ok).success, true, ok);
    for (const bad of ["/etc/passwd", "../x", "a/../b", "a//b", "./a", "a/.", "", "a\0b", "x/".repeat(2049), `${"y".repeat(256)}/z`]) {
      assert.equal(RelPath.safeParse(bad).success, false, bad.slice(0, 20));
    }
  });
});

describe("run requests", () => {
  it("accept the architecture's example shapes", () => {
    assert.equal(errors(ts()), "");
    assert.equal(
      errors(
        ts({
          tests: [{ stdin: "", args: [], env: {} }],
          typeTests: {
            imports: 'import { describe, type Payment } from "./main.ts";',
            cases: [{ name: "accepts a card", expect: "ok", code: "describe();" }],
          },
          forbid: ["any", "as", "non-null", "ts-comments"],
        })
      ),
      ""
    );
    assert.equal(
      errors(
        sh({
          fixtures: "logs-a",
          fixtureSets: { "logs-a": [{ name: "logs/a.log", content: "x" }], "logs-b": [] },
          clock: "2026-10-19T09:00:00Z",
          tests: [
            { args: ["logs"], output: "archived 3 files", files: { "archive/index.txt": "a" }, absent: ["logs/a.log"] },
            { fixtures: "logs-b", args: ["logs"], exitCode: 4, stderrIncludes: "none", cwd: "logs", wrap: ["flock", "job.lock"] },
          ],
        })
      ),
      ""
    );
  });

  it("refuse anything that names a command, an image, or a host path", () => {
    assert.match(errors(ts({ image: "alpine" })), /Unrecognized key/);
    assert.match(errors(ts({ cmd: ["sh"] })), /Unrecognized key/);
    assert.match(errors({ recipe: "python", files: [] }), /recipe/);
    assert.match(errors(sh({ files: [{ name: "/etc/main.sh", content: "" }] })), /must be relative/);
  });

  it("keep each recipe's fields to that recipe", () => {
    assert.match(errors({ recipe: "typescript", files: [{ name: "app.ts", content: "" }] }), /exactly one file, main.ts/);
    assert.match(errors(ts({ fixtures: "a", fixtureSets: { a: [] } })), /fixtures are for the bash recipe/);
    assert.match(errors(ts({ tests: [{ cwd: "x" }] })), /cwd is for the bash recipe/);
    assert.match(errors(sh({ typeTests: { imports: "", cases: [{ name: "a", expect: "ok", code: "x" }] } })), /type tests are for the typescript recipe/);
    assert.match(errors(sh({ forbid: ["any"] })), /honesty rules are for the typescript recipe/);
    assert.match(errors(sh({ tests: [{ tryIt: "x" }] })), /tryIt is for the typescript recipe/);
    assert.match(errors({ recipe: "bash", files: [{ name: "run.sh", content: "" }] }), /needs main.sh/);
  });

  it("check fixture names, clocks, variables, and type test cases", () => {
    assert.match(errors(sh({ fixtures: "missing" })), /no fixture set named missing/);
    assert.match(errors(sh({ tests: [{ fixtures: "nope" }], fixtureSets: {} })), /no fixture set named nope/);
    assert.match(errors(sh({ clock: "yesterday" })), /clock/);
    assert.equal(errors(sh({ clock: null })), "");
    assert.match(errors(sh({ env: { "BAD-NAME": "x" } })), /env.BAD-NAME: Invalid key/);
    assert.match(errors(sh({ tests: [{ exitCode: 300 }] })), /exitCode/);
    const cases = Array.from({ length: 7 }, (_, i) => ({ name: `c${i}`, expect: "ok", code: "x" }));
    assert.match(errors(ts({ typeTests: { imports: "", cases } })), /typeTests.cases/);
    assert.match(errors(ts({ typeTests: { imports: "", cases: [cases[0], cases[0]] } })), /unique/);
    assert.match(errors(sh({ files: [{ name: "main.sh", content: "" }, { name: "main.sh", content: "" }] })), /same name/);
    assert.match(errors(sh({ fixtureSets: { a: [{ name: "l", type: "symlink" }] } })), /needs a target/);
  });
});

describe("ticket requests", () => {
  it("need a workspace id, a kind, and a session only for terminals", () => {
    assert.equal(TicketRequest.safeParse({ workspace: "wk3j6q2m7xa", kind: "events" }).success, true);
    assert.equal(TicketRequest.safeParse({ workspace: "wk3j6q2m7xa", kind: "term", sid: "s1abcdef" }).success, true);
    assert.equal(TicketRequest.safeParse({ workspace: "wk3j6q2m7xa", kind: "term" }).success, false);
    assert.equal(TicketRequest.safeParse({ workspace: "wk3j6q2m7xa", kind: "events", sid: "s1abcdef" }).success, false);
    assert.equal(TicketRequest.safeParse({ workspace: "WK3J6Q2M7XA", kind: "events" }).success, false);
    assert.equal(TicketRequest.safeParse({ workspace: "wk3j6q2m7x", kind: "events" }).success, false);
  });
});
