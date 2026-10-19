import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RunRequest } from "../schemas.ts";
import { HOME, baseEnv, bashCommand, bashEnv, collectPaths, homeFiles } from "./bash.ts";

describe("bash recipe commands", () => {
  it("run main.sh with its arguments", () => {
    assert.deepEqual(bashCommand({}), ["bash", "main.sh"]);
    assert.deepEqual(bashCommand({ args: ["logs", "two words"] }), ["bash", "main.sh", "logs", "two words"]);
  });

  it("run from a subfolder the way you'd type it there", () => {
    assert.deepEqual(bashCommand({ cwd: "elsewhere" }), ["bash", "../main.sh"]);
    assert.deepEqual(bashCommand({ cwd: "a/b", args: ["x"] }), ["bash", "../../main.sh", "x"]);
  });

  it("wrap the script, then put faketime around everything when there's a clock", () => {
    assert.deepEqual(bashCommand({ wrap: ["flock", "job.lock"], args: ["x"] }), ["flock", "job.lock", "bash", "main.sh", "x"]);
    assert.deepEqual(bashCommand({ wrap: ["flock", "job.lock"], clock: "2026-10-19T09:00:00Z" }), [
      "faketime",
      "@1792400400",
      "flock",
      "job.lock",
      "bash",
      "main.sh",
    ]);
    assert.deepEqual(bashCommand({ clock: null }), ["bash", "main.sh"]);
  });

  it("keep file times as they are under a frozen clock", () => {
    assert.deepEqual(bashEnv({ GREETING: "hi" }, "2026-10-19T09:00:00Z"), [
      "GREETING=hi",
      "HU_FIXED_TIME=2026-10-19T09:00:00Z",
      "NO_FAKE_STAT=1",
      "FAKETIME_DONT_FAKE_MONOTONIC=1",
    ]);
    assert.deepEqual(bashEnv({ A: "1" }), ["A=1"]);
  });

  it("give every run the same home, user, locale, and time zone", () => {
    const env = baseEnv();
    for (const v of [`HOME=${HOME}`, "USER=learner", "TZ=UTC", "LC_ALL=C.UTF-8", "LANG=C.UTF-8", "TERM=dumb"]) assert.ok(env.includes(v), v);
    assert.equal(HOME, "/home/learner");
  });
});

describe("bash files", () => {
  const req = RunRequest.parse({
    recipe: "bash",
    files: [{ name: "main.sh", content: "echo hi\n" }],
    clock: "2026-10-19T09:00:00Z",
    fixtures: "a",
    fixtureSets: {
      a: [
        { name: "logs/old.log", content: "x\n", mtime: "2026-10-01T00:00:00Z" },
        { name: "deploy.sh", content: "echo deploy\n", mode: 0o755 },
        { name: "link", type: "symlink", target: "deploy.sh" },
        { name: "main.sh", content: "a fixture with the program's name\n" },
      ],
      b: [{ name: "data.csv", content: "id\n1\n" }],
    },
  });

  it("copy the fixture set first and the program last, with times and modes", () => {
    const files = homeFiles(req, "a", req.clock);
    assert.deepEqual(files.map((f) => `${f.type}:${f.path}`), ["file:logs/old.log", "file:deploy.sh", "symlink:link", "file:main.sh", "file:main.sh"]);
    assert.equal(files[0].mtime, Date.parse("2026-10-01T00:00:00Z") / 1000);
    assert.equal(files[1].mtime, Date.parse("2026-10-19T09:00:00Z") / 1000);
    assert.equal(files[1].mode, 0o755);
    assert.equal(files[2].target, "deploy.sh");
    assert.equal(files.at(-1)?.data?.toString(), "echo hi\n");
  });

  it("let a test swap the fixture set", () => {
    assert.deepEqual(homeFiles(req, "b", null).map((f) => f.path), ["data.csv", "main.sh"]);
    assert.deepEqual(homeFiles(req, undefined, null).map((f) => f.path), ["main.sh"]);
  });

  it("collect every path a test names, once", () => {
    assert.deepEqual(collectPaths({ files: { "a.txt": "1", "b.txt": "2" }, absent: ["c", "a.txt"], collect: ["d"] }), ["a.txt", "b.txt", "c", "d"]);
    assert.deepEqual(collectPaths({}), []);
  });
});
