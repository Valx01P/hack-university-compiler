import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readlinkSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { packTar, unpackTar } from "./tar.ts";

describe("tar", () => {
  const long = `${"deep/".repeat(30)}file.txt`;
  const entries = [
    { path: "main.sh", type: "file" as const, data: Buffer.from("echo hi\n"), mode: 0o755, mtime: 1_792_400_400 },
    { path: "logs", type: "dir" as const, mtime: 1_792_400_400 },
    { path: "logs/app.log", type: "file" as const, data: Buffer.alloc(1300, "x"), mtime: 1_791_000_000 },
    { path: "link", type: "symlink" as const, target: "main.sh" },
    { path: long, type: "file" as const, data: Buffer.from("long\n") },
    { path: "café/naïve.txt", type: "file" as const, data: Buffer.from("ü\n") },
  ];

  it("round-trips files, folders, links, long names, and non-ASCII names", () => {
    const back = unpackTar(packTar(entries));
    assert.deepEqual(
      back.map((e) => [e.path, e.type, e.data?.toString() ?? e.target ?? ""]),
      entries.map((e) => [e.path, e.type, e.data?.toString() ?? e.target ?? ""])
    );
    assert.equal(back[0].mode, 0o755);
    assert.equal(back[2].mtime, 1_791_000_000);
  });

  it("is a tar the system's tar reads, modes and times included", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hu-tar-"));
    const file = path.join(dir, "a.tar");
    writeFileSync(file, packTar(entries));
    execFileSync("tar", ["-xpf", file, "-C", dir]);
    assert.equal(readFileSync(path.join(dir, "main.sh"), "utf8"), "echo hi\n");
    assert.equal(statSync(path.join(dir, "main.sh")).mode & 0o777, 0o755);
    assert.equal(Math.round(statSync(path.join(dir, "logs/app.log")).mtimeMs / 1000), 1_791_000_000);
    assert.equal(readlinkSync(path.join(dir, "link")), "main.sh");
    assert.equal(readFileSync(path.join(dir, long), "utf8"), "long\n");
    assert.equal(readFileSync(path.join(dir, "café/naïve.txt"), "utf8"), "ü\n");
  });

  it("reads what the system's tar writes", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hu-tar-"));
    writeFileSync(path.join(dir, "x.txt"), "hello\n");
    // macOS's tar adds AppleDouble ._ files unless told not to.
    const tarball = execFileSync("tar", ["--format=pax", "-cf", "-", "-C", dir, "x.txt"], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
    const entry = unpackTar(tarball).find((e) => e.path === "x.txt");
    assert.equal(entry?.data?.toString(), "hello\n");
  });
});
