import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { TarEntry } from "../tar.ts";

/**
 * Host storage (architecture §4.3): a workspace's files live on the Mac in
 * HU_DATA_DIR/workspaces/<id>/files, bind-mounted at /workspace. Learner code
 * can put symbolic links anywhere in there, pointing anywhere on the Mac
 * (~/.ssh, say), so the runner follows these rules:
 *
 * 1. Reads open with O_RDONLY | O_NOFOLLOW_ANY | O_NONBLOCK and only read a
 *    regular file (fstat). O_NOFOLLOW_ANY fails with ELOOP when any part of
 *    the path is a link, atomically (measured on this Mac, J1), so no race
 *    can swap a folder for a link between a check and the read.
 * 2. Listings use lstat and never follow a link: a link is listed with its
 *    target, and marked outside when it points out of the workspace.
 * 3. Host writes happen only while no learner process runs (the workspace is
 *    stopped), and still refuse any path through a link. While it runs,
 *    storage/container.ts makes every change inside the container.
 * 4. Copies (cp -c -R -P) keep links as links and recreate FIFOs without
 *    reading them.
 */

/** macOS's O_NOFOLLOW_ANY: no symlink anywhere in the path. Node's constants don't list it. */
export const O_NOFOLLOW_ANY = process.platform === "darwin" ? 0x20000000 : 0;

/** The runner is on Windows, where files keep no Unix modes and paths take "\". */
export const WINDOWS = process.platform === "win32";
const { O_RDONLY, O_WRONLY, O_CREAT, O_EXCL, O_NONBLOCK, O_DIRECTORY, O_NOFOLLOW } = fs.constants;

export type PathErrorCode = "bad_path" | "outside" | "not_found" | "not_a_file" | "exists" | "too_large" | "is_dir";

export class PathError extends Error {
  readonly code: PathErrorCode;
  constructor(code: PathErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** Folders that are listed but never walked into unless asked (§3.3). */
export const HEAVY = new Set(["node_modules", ".git", ".venv", "target", ".next", "dist"]);

/** The most entries one folder lists. */
export const LIST_CAP = 5_000;

const utf8Bytes = (s: string) => Buffer.byteLength(s, "utf8");

/**
 * Checks a workspace path: relative, "/"-separated, no NUL, no "." or ".."
 * segment, at most 4,096 bytes overall and 255 per segment. "" is the root.
 * On Windows it also has no "\" or ":", which the host would read as a
 * separator or a drive, so "..\meta.json" can't leave the workspace.
 */
export function checkRel(rel: string, { root = false } = {}): string {
  if (rel === "" && root) return "";
  if (typeof rel !== "string" || rel === "" || rel.includes("\0") || rel.startsWith("/") || utf8Bytes(rel) > 4096 || (WINDOWS && /[\\:]/.test(rel))) {
    throw new PathError("bad_path", `Not a workspace path: ${JSON.stringify(String(rel).slice(0, 100))}`);
  }
  for (const segment of rel.split("/")) {
    if (segment === "" || segment === "." || segment === ".." || utf8Bytes(segment) > 255) {
      throw new PathError("bad_path", `Not a workspace path: ${JSON.stringify(rel.slice(0, 100))}`);
    }
  }
  return rel;
}

export type EntryType = "file" | "dir" | "symlink" | "fifo" | "socket" | "mount" | "other";

/** One row of the tree (README "entry"), before its state is known. */
export interface Entry {
  name: string;
  path: string;
  type: EntryType;
  size: number;
  mtimeMs: number;
  mode: number;
  target?: string;
  outside?: boolean;
  heavy?: boolean;
}

export function typeOf(st: fs.Stats): EntryType {
  if (st.isFile()) return "file";
  if (st.isDirectory()) return "dir";
  if (st.isSymbolicLink()) return "symlink";
  if (st.isFIFO()) return "fifo";
  if (st.isSocket()) return "socket";
  return "other";
}

/** Whether a link's target leaves the workspace: absolute, or climbing above the root. */
export function pointsOutside(rel: string, target: string): boolean {
  if (target.startsWith("/")) return true;
  const joined = path.posix.normalize(path.posix.join(path.posix.dirname(rel), target));
  return joined === ".." || joined.startsWith("../");
}

export function entryOf(rel: string, st: fs.Stats, target?: string): Entry {
  const type = typeOf(st);
  const entry: Entry = {
    name: path.posix.basename(rel),
    path: rel,
    type,
    size: type === "dir" ? 0 : st.size,
    mtimeMs: Math.round(st.mtimeMs),
    mode: st.mode & 0o7777,
  };
  if (type === "symlink" && target !== undefined) {
    entry.target = target;
    if (pointsOutside(rel, target)) entry.outside = true;
  }
  if (type === "dir" && HEAVY.has(entry.name)) entry.heavy = true;
  return entry;
}

export interface ReadResult {
  data: Buffer;
  size: number;
  mode: number;
  mtimeMs: number;
}

export function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** A folder of files on the Mac that learner code can also change. */
export class HostFs {
  readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  abs(rel: string): string {
    return rel === "" ? this.root : path.join(this.root, checkRel(rel));
  }

  /**
   * Opens a path with no link anywhere in it. A refusal names the reason:
   * outside (a link in the path) or not_found.
   */
  private open(rel: string, flags: number): number {
    try {
      if (O_NOFOLLOW_ANY) return fs.openSync(this.abs(rel), flags | O_NOFOLLOW_ANY);
      // Elsewhere (Linux hosts use volume storage), check each part with lstat.
      this.assertNoLinks(rel, true);
      return fs.openSync(this.abs(rel), flags | O_NOFOLLOW);
    } catch (err) {
      throw fsError(err, rel);
    }
  }

  /** Throws outside when a link sits in the parents of rel (or in rel itself, with `self`). */
  private assertNoLinks(rel: string, self = false) {
    const parts = rel === "" ? [] : rel.split("/");
    const upTo = self ? parts.length : parts.length - 1;
    let at = this.root;
    for (let i = 0; i < upTo; i++) {
      at = path.join(at, parts[i]);
      let st: fs.Stats;
      try {
        st = fs.lstatSync(at);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
        throw err;
      }
      if (st.isSymbolicLink()) throw new PathError("outside", "This path goes through a symbolic link, so the runner won't follow it.");
      if (i < parts.length - 1 && !st.isDirectory()) throw new PathError("not_found", `${parts.slice(0, i + 1).join("/")} isn't a folder.`);
    }
  }

  /** Throws unless every parent of rel is a real folder (or missing). */
  checkParents(rel: string) {
    if (O_NOFOLLOW_ANY) {
      const parent = path.posix.dirname(rel);
      if (parent === "." || parent === "") return;
      let fd = -1;
      try {
        fd = fs.openSync(this.abs(parent), O_RDONLY | O_DIRECTORY | O_NOFOLLOW_ANY);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          // A missing parent may still sit below a link: check the parts that exist.
          this.assertNoLinks(rel);
          return;
        }
        throw fsError(err, parent);
      } finally {
        if (fd >= 0) fs.closeSync(fd);
      }
    } else {
      this.assertNoLinks(rel);
    }
  }

  /** lstat of a path whose parents are real folders, or null when nothing is there. */
  lstat(rel: string): fs.Stats | null {
    if (rel !== "") this.checkParents(rel);
    try {
      return fs.lstatSync(this.abs(rel));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT" || (err as NodeJS.ErrnoException).code === "ENOTDIR") return null;
      throw fsError(err, rel);
    }
  }

  /** The tree row of a path, or null when nothing is there. */
  entry(rel: string): Entry | null {
    const st = this.lstat(rel);
    if (!st) return null;
    let target: string | undefined;
    if (st.isSymbolicLink()) {
      try {
        target = fs.readlinkSync(this.abs(rel));
      } catch {
        target = "";
      }
    }
    return entryOf(rel, st, target);
  }

  /** Reads a regular file, refusing links, FIFOs, and anything over `max` bytes. */
  readFile(rel: string, max: number): ReadResult {
    const fd = this.open(checkRel(rel), O_RDONLY | O_NONBLOCK);
    try {
      const st = fs.fstatSync(fd);
      if (st.isDirectory()) throw new PathError("is_dir", `${rel} is a folder.`);
      if (!st.isFile()) throw new PathError("not_a_file", `${rel} isn't a regular file, so it isn't opened.`);
      if (st.size > max) throw new PathError("too_large", `${rel} is over ${max} bytes.`);
      const data = Buffer.alloc(st.size);
      let off = 0;
      while (off < data.length) {
        const n = fs.readSync(fd, data, off, data.length - off, off);
        if (n === 0) break;
        off += n;
      }
      return { data: data.subarray(0, off), size: st.size, mode: st.mode & 0o7777, mtimeMs: Math.round(st.mtimeMs) };
    } finally {
      fs.closeSync(fd);
    }
  }

  /** SHA-256 of a regular file, read in chunks, or null when it isn't one (or is gone). */
  hashFile(rel: string): string | null {
    let fd: number;
    try {
      fd = this.open(checkRel(rel), O_RDONLY | O_NONBLOCK);
    } catch {
      return null;
    }
    try {
      if (!fs.fstatSync(fd).isFile()) return null;
      const hash = createHash("sha256");
      const buf = Buffer.alloc(1024 * 1024);
      let n: number;
      while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n));
      return hash.digest("hex");
    } catch {
      return null;
    } finally {
      fs.closeSync(fd);
    }
  }

  /**
   * The entries of a folder, `depth` levels down, never following a link and
   * never walking into a heavy folder below the one asked for. Only for a
   * stopped workspace (or a runner-owned folder): while learner code runs,
   * storage/container.ts lists from inside the container.
   */
  list(rel: string, depth: number): { entries: Entry[]; more: Record<string, number> } {
    const entries: Entry[] = [];
    const more: Record<string, number> = {};
    const walk = (dir: string, left: number) => {
      let names: string[];
      try {
        names = fs.readdirSync(this.abs(dir));
      } catch {
        return;
      }
      names.sort();
      if (names.length > LIST_CAP) {
        more[dir] = names.length - LIST_CAP;
        names = names.slice(0, LIST_CAP);
      }
      for (const name of names) {
        const child = dir ? `${dir}/${name}` : name;
        let st: fs.Stats;
        try {
          st = fs.lstatSync(this.abs(child));
        } catch {
          continue;
        }
        let target: string | undefined;
        if (st.isSymbolicLink()) {
          try {
            target = fs.readlinkSync(this.abs(child));
          } catch {
            target = "";
          }
        }
        const entry = entryOf(child, st, target);
        entries.push(entry);
        if (entry.type === "dir" && left > 1 && !entry.heavy) walk(child, left - 1);
      }
    };
    const st = this.lstat(rel);
    if (!st) throw new PathError("not_found", `${rel || "The workspace"} doesn't exist.`);
    if (!st.isDirectory()) throw new PathError("not_a_file", `${rel} isn't a folder.`);
    walk(rel, depth);
    return { entries, more };
  }

  // Writes. Only while no learner process runs (the caller holds the lock).

  /** Writes a file through a temp file and a rename, keeping an existing file's mode. */
  writeFile(rel: string, data: Buffer, mode?: number) {
    checkRel(rel);
    this.mkdirParents(rel);
    const existing = this.lstat(rel);
    if (existing && !existing.isFile()) throw new PathError("not_a_file", `${rel} isn't a regular file.`);
    const dir = path.dirname(this.abs(rel));
    const tmp = path.join(dir, `.hu-write.${randomBytes(6).toString("hex")}`);
    const fd = fs.openSync(tmp, O_CREAT | O_EXCL | O_WRONLY | (O_NOFOLLOW_ANY || O_NOFOLLOW), mode ?? (existing ? existing.mode & 0o7777 : 0o644));
    try {
      let off = 0;
      while (off < data.length) off += fs.writeSync(fd, data, off, data.length - off);
      if (mode !== undefined || existing) fs.fchmodSync(fd, mode ?? existing!.mode & 0o7777);
    } finally {
      fs.closeSync(fd);
    }
    try {
      fs.renameSync(tmp, this.abs(rel));
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      throw fsError(err, rel);
    }
  }

  /** Makes a folder and its parents. */
  mkdir(rel: string) {
    checkRel(rel);
    const parts = rel.split("/");
    let at = "";
    for (const part of parts) {
      at = at ? `${at}/${part}` : part;
      const st = this.lstat(at);
      if (!st) {
        fs.mkdirSync(this.abs(at), { mode: 0o755 });
      } else if (!st.isDirectory()) {
        throw new PathError(st.isSymbolicLink() ? "outside" : "exists", `${at} exists and isn't a folder.`);
      }
    }
  }

  private mkdirParents(rel: string) {
    const parent = path.posix.dirname(rel);
    if (parent !== "." && parent !== "") this.mkdir(parent);
  }

  /** Removes a file, link, or whole folder. Links inside are removed, never followed. */
  remove(rel: string) {
    checkRel(rel);
    if (!this.lstat(rel)) throw new PathError("not_found", `${rel} doesn't exist.`);
    fs.rmSync(this.abs(rel), { recursive: true, force: true });
  }

  rename(from: string, to: string) {
    checkRel(from);
    checkRel(to);
    if (!this.lstat(from)) throw new PathError("not_found", `${from} doesn't exist.`);
    if (this.lstat(to)) throw new PathError("exists", `${to} already exists.`);
    if (to.startsWith(`${from}/`)) throw new PathError("bad_path", "A folder can't move inside itself.");
    this.mkdirParents(to);
    fs.renameSync(this.abs(from), this.abs(to));
  }

  async copy(from: string, to: string) {
    checkRel(from);
    checkRel(to);
    if (!this.lstat(from)) throw new PathError("not_found", `${from} doesn't exist.`);
    if (this.lstat(to)) throw new PathError("exists", `${to} already exists.`);
    if (to.startsWith(`${from}/`)) throw new PathError("bad_path", "A folder can't be copied inside itself.");
    this.mkdirParents(to);
    await cloneTree(this.abs(from), this.abs(to));
  }

  chmod(rel: string, mode: number) {
    const st = this.lstat(checkRel(rel));
    if (!st) throw new PathError("not_found", `${rel} doesn't exist.`);
    if (st.isSymbolicLink()) throw new PathError("not_a_file", `${rel} is a symbolic link.`);
    fs.chmodSync(this.abs(rel), mode & 0o7777);
  }

  /** Makes a symbolic link (restoring a snapshot or the trash). */
  symlink(rel: string, target: string) {
    checkRel(rel);
    this.mkdirParents(rel);
    if (this.lstat(rel)) throw new PathError("exists", `${rel} already exists.`);
    fs.symlinkSync(target, this.abs(rel));
  }

  /**
   * Tar entries for a subtree (or the whole tree with ""), links as links,
   * skipping FIFOs, sockets, and devices, at most `maxBytes` of file data.
   * `skip` leaves out paths (relative to the root) and everything under them.
   */
  pack(rel: string, maxBytes: number, skip: (p: string, e: Entry) => boolean = () => false): TarEntry[] {
    const out: TarEntry[] = [];
    let total = 0;
    const add = (p: string) => {
      const e = this.entry(p);
      if (!e || skip(p, e)) return;
      const mtime = Math.floor(e.mtimeMs / 1000);
      if (e.type === "file") {
        const { data, mode } = this.readFile(p, maxBytes - total);
        total += data.length;
        out.push({ path: p, type: "file", data, mode, mtime });
      } else if (e.type === "symlink") {
        out.push({ path: p, type: "symlink", target: e.target ?? "", mtime });
      } else if (e.type === "dir") {
        if (p) out.push({ path: p, type: "dir", mode: e.mode, mtime });
        let names: string[] = [];
        try {
          names = fs.readdirSync(this.abs(p)).sort();
        } catch {
          names = [];
        }
        for (const name of names) add(p ? `${p}/${name}` : name);
      }
    };
    add(rel);
    return out;
  }
}

/** Turns an fs error into a PathError the routes can answer with. */
export function fsError(err: unknown, rel: string): Error {
  if (err instanceof PathError) return err;
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code === "ELOOP") return new PathError("outside", "This path goes through a symbolic link, so the runner won't follow it.");
  if (code === "ENOENT" || code === "ENOTDIR") return new PathError("not_found", `${rel || "The path"} doesn't exist.`);
  if (code === "EISDIR") return new PathError("is_dir", `${rel} is a folder.`);
  if (code === "EEXIST" || code === "ENOTEMPTY") return new PathError("exists", `${rel} already exists.`);
  return err as Error;
}

/**
 * Copies a folder's contents (or a file) with copy-on-write clones on APFS:
 * /bin/cp -c -R -P, spawned with an argv array. Links stay links and FIFOs
 * are recreated, never read. Elsewhere it falls back to a plain copy, and on
 * Windows, which has no /bin/cp, to Node's own copy.
 */
export async function cloneTree(src: string, dst: string): Promise<void> {
  if (process.platform === "win32") {
    fs.cpSync(src, dst, { recursive: true, verbatimSymlinks: true, errorOnExist: false, force: true });
    return;
  }
  const isDir = fs.lstatSync(src).isDirectory();
  // "src/." copies a folder's contents into dst, with both BSD and GNU cp.
  const from = isDir ? `${src}/.` : src;
  if (isDir) fs.mkdirSync(dst, { recursive: true });
  if (process.platform === "darwin") {
    if ((await run("/bin/cp", ["-c", "-R", "-P", from, dst])) === 0) return;
  }
  const code = await run("/bin/cp", ["-R", "-P", from, dst]);
  if (code !== 0) throw new Error(`Couldn't copy ${path.basename(src)}.`);
}

function run(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "ignore" });
    child.on("error", () => resolve(-1));
    child.on("close", (code) => resolve(code ?? -1));
  });
}

export interface ManifestEntry {
  type: "file" | "dir" | "symlink";
  mode: number;
  size?: number;
  sha256?: string;
  target?: string;
}

export type Manifest = Record<string, ManifestEntry>;

/**
 * The manifest of a runner-owned tree (a workspace's original/, a snapshot):
 * every path with its type, mode, and hash. `skip` leaves a path (and what's
 * under it) out.
 */
export function buildManifest(root: string, skip: (rel: string) => boolean = () => false): Manifest {
  const fsys = new HostFs(root);
  const manifest: Manifest = {};
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(fsys.abs(dir)).sort()) {
      const rel = dir ? `${dir}/${name}` : name;
      if (skip(rel)) continue;
      const st = fs.lstatSync(fsys.abs(rel));
      if (st.isDirectory()) {
        manifest[rel] = { type: "dir", mode: st.mode & 0o7777 };
        walk(rel);
      } else if (st.isFile()) {
        manifest[rel] = { type: "file", mode: st.mode & 0o7777, size: st.size, sha256: fsys.hashFile(rel) ?? "" };
      } else if (st.isSymbolicLink()) {
        manifest[rel] = { type: "symlink", mode: 0o777, target: fs.readlinkSync(fsys.abs(rel)) };
      }
    }
  };
  walk("");
  return manifest;
}

/** 12 hex characters over the manifest's lines, sorted by path (README "The manifest"). */
export function manifestHash(manifest: Manifest): string {
  const hash = createHash("sha256");
  for (const p of Object.keys(manifest).sort()) {
    const e = manifest[p];
    hash.update(`${p}\0${e.type}\0${e.mode.toString(8)}\0${e.sha256 ?? e.target ?? ""}\n`);
  }
  return hash.digest("hex").slice(0, 12);
}
