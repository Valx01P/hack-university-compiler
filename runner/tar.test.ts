import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readlinkSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { packTar, unpackTar, type TarEntry } from "./tar.ts";

/** A raw ustar header with any size field, its checksum made to add up. */
function header(type: string, size: number | string, name = "x"): Buffer {
  const b = Buffer.alloc(512);
  b.write(name, 0, 100, "utf8");
  b.write("0000644\0", 100, "ascii");
  b.write("0001750\0", 108, "ascii");
  b.write("0001750\0", 116, "ascii");
  b.write(typeof size === "number" ? `${size.toString(8).padStart(11, "0")}\0` : size, 124, 12, "ascii");
  b.write("15265341020\0", 136, "ascii");
  b.fill(" ", 148, 156);
  b.write(type, 156, 1, "ascii");
  b.write("ustar\0", 257, "ascii");
  b.write("00", 263, "ascii");
  let sum = 0;
  for (const byte of b) sum += byte;
  b.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return b;
}

const padded = (data: Buffer) => Buffer.concat([data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
const end = Buffer.alloc(1024);
/** One entry as packTar writes it, without the two blocks that end an archive. */
const member = (entry: TarEntry) => packTar([entry]).subarray(0, -1024);
const after = member({ path: "after.txt", type: "file", data: Buffer.from("still read\n") });

/**
 * unpackTar on each archive in a child process that is killed after `ms`, so
 * a parser that loops forever fails the test instead of hanging it. Each
 * result is [path, data] per entry.
 */
function unpackEach(archives: Buffer[], ms = 10_000): string[][][] {
  const script = [
    `import { unpackTar } from ${JSON.stringify(path.join(import.meta.dirname, "tar.ts"))};`,
    'import { readFileSync } from "node:fs";',
    'const archives = JSON.parse(readFileSync(0, "utf8")).map((b) => Buffer.from(b, "base64"));',
    'process.stdout.write(JSON.stringify(archives.map((a) => unpackTar(a).map((e) => [e.path, e.data?.toString("latin1") ?? ""]))));',
  ].join("\n");
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    input: JSON.stringify(archives.map((a) => a.toString("base64"))),
    timeout: ms,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.ok(!child.signal && !child.error, `unpackTar didn't finish within ${ms} ms`);
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}

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

describe("tar from untrusted bytes", () => {
  it("skips pax records whose lengths don't add up, and never loops on them", () => {
    const pax = (body: string) => Buffer.concat([header("x", Buffer.byteLength(body)), padded(Buffer.from(body))]);
    const bodies = [
      "-3 3 x",
      "6 path=x\n",
      "99 path=far.txt\n",
      "0 path=x\n",
      "2 \n",
      "1e1 path=x\n",
      "12 path=x\n13 path=y\n",
      "x".repeat(600),
    ];
    const results = unpackEach(bodies.map((b) => Buffer.concat([pax(b), after, end])));
    for (const [i, result] of results.entries()) assert.deepEqual(result, [["after.txt", "still read\n"]], JSON.stringify(bodies[i]));
  });

  it("stops at a header whose size is negative, not a number, or past the end", () => {
    const before = member({ path: "before.txt", type: "file", data: Buffer.from("kept\n") });
    const sizes = ["-1000\0", "-0000001000\0", "12x\0", "\x80\0\0\0\0\0\0\0\0\0\x10\0", 2 ** 33 - 1, 1 << 20];
    const results = unpackEach(sizes.map((s) => Buffer.concat([before, header("0", s, "bad.txt"), after, end])));
    for (const [i, result] of results.entries()) assert.deepEqual(result, [["before.txt", "kept\n"]], JSON.stringify(sizes[i]));
  });

  it("stops at a header whose checksum doesn't add up", () => {
    const bad = header("0", 3, "bad.txt");
    bad[0] ^= 1;
    assert.deepEqual(unpackTar(Buffer.concat([bad, padded(Buffer.from("abc")), after, end])), []);
  });

  it("returns only whole entries from an archive cut anywhere", () => {
    const entries: TarEntry[] = [
      { path: "a.txt", type: "file", data: Buffer.alloc(1300, "a") },
      { path: `${"deep/".repeat(30)}b.txt`, type: "file", data: Buffer.from("b\n") },
      { path: "c", type: "symlink", target: "a.txt" },
      { path: "d.txt", type: "file", data: Buffer.from("d\n") },
    ];
    const whole = new Map(entries.map((e) => [e.path, e.data?.toString("latin1") ?? ""]));
    const archive = packTar(entries);
    const cuts = Array.from({ length: archive.length + 1 }, (_, n) => n).filter((n) => n % 97 === 0 || n % 512 < 2);
    const results = unpackEach(cuts.map((n) => archive.subarray(0, n)));
    for (const [i, result] of results.entries()) {
      for (const [p, data] of result) assert.equal(data, whole.get(p), `cut at ${cuts[i]}: ${p}`);
    }
    assert.equal(results.at(-1)?.length, entries.length);
  });

  it("finishes on corrupted archives without throwing", () => {
    const archive = Buffer.concat([
      header("x", 30),
      padded(Buffer.from("30 path=renamed/by/pax.txt\n\n\n")),
      packTar([
        { path: "a.txt", type: "file", data: Buffer.alloc(700, "a") },
        { path: "dir", type: "dir" },
        { path: "café/naïve.txt", type: "file", data: Buffer.from("ü\n") },
      ]),
    ]);
    // A fixed sequence of corruptions: 400 archives, each with 1 to 8 bytes changed.
    let seed = 7;
    const random = (n: number) => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) % n;
    const corrupted = Array.from({ length: 400 }, () => {
      const copy = Buffer.from(archive);
      for (let k = 1 + random(8); k > 0; k--) copy[random(copy.length)] = random(256);
      return copy;
    });
    assert.equal(unpackEach(corrupted).length, corrupted.length);
  });
});
