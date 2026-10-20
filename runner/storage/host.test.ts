import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { HostFs, PathError, buildManifest, checkRel, cloneTree, manifestHash, pointsOutside } from "./host.ts";

/**
 * Host storage on the Mac's own file system (architecture §4.3): paths that
 * climb out are refused, a symbolic link is listed and never followed, and
 * clones keep links as links.
 */

function sandbox() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), "hv-host-")));
  const root = path.join(base, "files");
  const outside = path.join(base, "outside");
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(root, "src", "a.ts"), "export const a = 1;\n");
  fs.writeFileSync(path.join(outside, "secret.txt"), "top secret\n");
  fs.symlinkSync(outside, path.join(root, "leak"));
  fs.symlinkSync(path.join(outside, "secret.txt"), path.join(root, "leakfile"));
  return { base, root, outside, fsys: new HostFs(root) };
}

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return err instanceof PathError ? err.code : (err as Error).message;
  }
  return "ok";
};

describe("host storage", () => {
  it("refuses paths that climb out, start at the root, or hold NUL", () => {
    for (const bad of ["../x", "a/../../x", "/etc/passwd", "a//b", "./a", "a/./b", "a\0b", "", "x".repeat(256)]) {
      assert.equal(code(() => checkRel(bad)), "bad_path", JSON.stringify(bad));
    }
    assert.equal(checkRel("src/a.ts"), "src/a.ts");
  });

  it("never reads or writes through a symbolic link", () => {
    const { fsys, outside } = sandbox();
    assert.equal(fsys.readFile("src/a.ts", 1024).data.toString(), "export const a = 1;\n");
    assert.equal(code(() => fsys.readFile("leak/secret.txt", 1024)), "outside");
    assert.equal(code(() => fsys.readFile("leakfile", 1024)), "outside");
    assert.equal(code(() => fsys.writeFile("leak/new.txt", Buffer.from("x"))), "outside");
    assert.equal(code(() => fsys.mkdir("leak/dir")), "outside");
    assert.equal(code(() => fsys.remove("leak/secret.txt")), "outside");
    assert.equal(code(() => fsys.rename("src/a.ts", "leak/a.ts")), "outside");
    assert.equal(code(() => fsys.chmod("leakfile", 0o777)), "not_a_file");
    assert.equal(fsys.hashFile("leakfile"), null);
    assert.deepEqual(fs.readdirSync(outside), ["secret.txt"], "nothing was written outside");
    assert.equal(fs.readFileSync(path.join(outside, "secret.txt"), "utf8"), "top secret\n");
  });

  it("lists links with their targets, marked outside, without following them", () => {
    const { fsys, outside } = sandbox();
    const { entries } = fsys.list("", 8);
    const leak = entries.find((e) => e.path === "leak");
    assert.equal(leak?.type, "symlink");
    assert.equal(leak?.target, outside);
    assert.equal(leak?.outside, true);
    assert.ok(!entries.some((e) => e.path.startsWith("leak/")), "never walks into a link");
    assert.equal(pointsOutside("src/x", "../a.ts"), false);
    assert.equal(pointsOutside("src/x", "../../a.ts"), true);
  });

  it("refuses to read a FIFO, and never blocks on one", () => {
    const { root, fsys } = sandbox();
    const fifo = path.join(root, "pipe");
    try {
      // mkfifo is a shell tool here; the runner itself never makes one.
      execFileSync("mkfifo", [fifo]);
    } catch {
      return;
    }
    assert.equal(code(() => fsys.readFile("pipe", 1024)), "not_a_file");
    assert.equal(fsys.entry("pipe")?.type, "fifo");
  });

  it("writes through a temp file, keeping the mode, and makes missing folders", () => {
    const { root, fsys } = sandbox();
    fs.chmodSync(path.join(root, "src", "a.ts"), 0o755);
    fsys.writeFile("src/a.ts", Buffer.from("changed\n"));
    assert.equal(fs.statSync(path.join(root, "src", "a.ts")).mode & 0o777, 0o755);
    fsys.writeFile("deep/er/b.ts", Buffer.from("new\n"));
    assert.equal(fs.readFileSync(path.join(root, "deep", "er", "b.ts"), "utf8"), "new\n");
    assert.ok(!fs.readdirSync(path.join(root, "src")).some((n) => n.startsWith(".hu-write.")), "no temp file left");
  });

  it("clones a tree with links kept as links, to the same manifest hash", async () => {
    const { base, root } = sandbox();
    const copy = path.join(base, "copy");
    await cloneTree(root, copy);
    assert.equal(fs.lstatSync(path.join(copy, "leak")).isSymbolicLink(), true);
    assert.equal(manifestHash(buildManifest(copy)), manifestHash(buildManifest(root)));
    fs.writeFileSync(path.join(copy, "src", "a.ts"), "other\n");
    assert.notEqual(manifestHash(buildManifest(copy)), manifestHash(buildManifest(root)));
  });
});
