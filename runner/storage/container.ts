import path from "node:path";
import type Docker from "dockerode";
import { ExecFailed, execCollect } from "../exec.ts";
import { HEAVY, LIST_CAP, PathError, checkRel, pointsOutside, type Entry, type EntryType } from "./host.ts";

/**
 * File operations inside a running workspace container (architecture §4.2.5).
 * While learner code runs, every save, rename, and delete happens in there:
 * a learner's symbolic link can then only point at the container's own file
 * system, never at the Mac, and inotify in the container sees each change, so
 * dev servers reload. Each operation is one fixed script run with `sh -c`,
 * taking paths as arguments, as uid 1000. Paths through a link are refused
 * here too, so the API behaves the same running or stopped.
 */

const ROOT = "/workspace";

// Exit codes the scripts use for the errors the routes answer.
const EXIT: Record<number, [PathError["code"], string]> = {
  2: ["not_found", "doesn't exist"],
  3: ["not_a_file", "isn't a regular file"],
  4: ["outside", "goes through a symbolic link, so the runner won't follow it"],
  5: ["exists", "already exists"],
};

/** Shared by every script: refuse a path with a link in it. */
const PRELUDE = [
  "set -u",
  'nolinks() { [ "$(realpath -m -- "$1")" = "$1" ] || exit 4; }',
  'there() { [ -e "$1" ] || [ -L "$1" ]; }',
].join("\n");

const WRITE = `${PRELUDE}
p=$1; mode=$2
d=$(dirname -- "$p")
nolinks "$d"
if [ -L "$p" ] || { [ -e "$p" ] && [ ! -f "$p" ]; }; then exit 3; fi
mkdir -p -- "$d" || exit 1
t=$(mktemp -- "$d/.hu-write.XXXXXX") || exit 1
cat > "$t" || { rm -f -- "$t"; exit 1; }
if [ -n "$mode" ]; then chmod -- "$mode" "$t"
elif [ -f "$p" ]; then chmod --reference="$p" -- "$t"
else chmod 644 -- "$t"; fi
mv -f -- "$t" "$p"`;

const MKDIR = `${PRELUDE}
nolinks "$1"
if there "$1" && [ ! -d "$1" ]; then exit 5; fi
mkdir -p -- "$1"`;

const RENAME = `${PRELUDE}
nolinks "$(dirname -- "$1")"; nolinks "$(dirname -- "$2")"
there "$1" || exit 2
if there "$2"; then exit 5; fi
mkdir -p -- "$(dirname -- "$2")" && mv -n -T -- "$1" "$2"`;

const COPY = `${PRELUDE}
nolinks "$(dirname -- "$1")"; nolinks "$(dirname -- "$2")"
there "$1" || exit 2
if there "$2"; then exit 5; fi
mkdir -p -- "$(dirname -- "$2")" && cp -R -P --preserve=mode,timestamps -T -- "$1" "$2"`;

const REMOVE = `${PRELUDE}
for p; do nolinks "$(dirname -- "$p")"; done
for p; do if there "$p"; then rm -rf --one-file-system -- "$p" || exit 1; fi; done`;

const CHMOD = `${PRELUDE}
nolinks "$(dirname -- "$2")"
there "$2" || exit 2
if [ -L "$2" ]; then exit 3; fi
chmod -- "$1" "$2"`;

/** Lists `$1` (relative to /workspace) `$2` levels down, NUL-separated, never walking into heavy folders. */
const LIST = `${PRELUDE}
cd ${ROOT} || exit 1
if [ -n "$1" ]; then nolinks "${ROOT}/$1"; [ -d "./$1" ] || exit 2; fi
stat -c %d .
printf '\\0'
fmt='%y\\0%s\\0%T@\\0%m\\0%D\\0%P\\0%l\\0'
find "./$1" -mindepth 1 -maxdepth "$2" \\( -type d \\( ${[...HEAVY].map((h) => `-name '${h}'`).join(" -o ")} \\) -prune -printf "$fmt" \\) -o -printf "$fmt" 2>/dev/null
exit 0`;

const TYPES: Record<string, EntryType> = { f: "file", d: "dir", l: "symlink", p: "fifo", s: "socket" };

export class ContainerFs {
  private readonly container: Docker.Container;
  private readonly user: string;

  constructor(container: Docker.Container, user = "learner") {
    this.container = container;
    this.user = user;
  }

  private inside(rel: string): string {
    return path.posix.join(ROOT, checkRel(rel));
  }

  private async run(script: string, args: string[], rel: string, stdin?: Buffer, maxBytes?: number): Promise<Buffer> {
    const result = await execCollect(this.container, ["sh", "-c", script, "sh", ...args], {
      user: this.user,
      stdin,
      timeoutMs: 30_000,
      maxBytes,
    });
    if (result.timedOut) throw new Error("The workspace didn't answer in time.");
    if (result.code !== 0) {
      const known = result.code !== null ? EXIT[result.code] : undefined;
      if (known) throw new PathError(known[0], `${rel} ${known[1]}.`);
      throw new ExecFailed(result.stderr.toString("utf8").trim() || `The workspace couldn't change ${rel}.`, result);
    }
    return result.stdout;
  }

  async writeFile(rel: string, data: Buffer, mode?: number) {
    await this.run(WRITE, [this.inside(rel), mode === undefined ? "" : (mode & 0o7777).toString(8)], rel, data);
  }

  async mkdir(rel: string) {
    await this.run(MKDIR, [this.inside(rel)], rel);
  }

  async rename(from: string, to: string) {
    if (to.startsWith(`${from}/`)) throw new PathError("bad_path", "A folder can't move inside itself.");
    await this.run(RENAME, [this.inside(from), this.inside(to)], from);
  }

  async copy(from: string, to: string) {
    if (to.startsWith(`${from}/`)) throw new PathError("bad_path", "A folder can't be copied inside itself.");
    await this.run(COPY, [this.inside(from), this.inside(to)], from);
  }

  async remove(...rels: string[]) {
    if (!rels.length) return;
    await this.run(REMOVE, rels.map((r) => this.inside(r)), rels[0]);
  }

  async chmod(rel: string, mode: number) {
    await this.run(CHMOD, [(mode & 0o7777).toString(8), this.inside(rel)], rel);
  }

  /** Extracts a tar archive into /workspace, keeping modes. */
  async extract(archive: Buffer) {
    const result = await execCollect(this.container, ["tar", "-x", "-p", "--no-same-owner", "-f", "-", "-C", ROOT], {
      user: this.user,
      stdin: archive,
      timeoutMs: 60_000,
    });
    if (result.code !== 0) throw new Error(`Couldn't restore the files: ${result.stderr.toString("utf8").trim()}`);
  }

  /** A tar of /workspace without the excluded paths (relative), for a check's copy. */
  async archive(exclude: string[], maxBytes: number): Promise<Buffer> {
    const args = ["tar", "-c", "-f", "-", "-C", ROOT, "--anchored", "--no-wildcards-match-slash"];
    for (const e of exclude) args.push(`--exclude=./${e}`);
    args.push(".");
    const result = await execCollect(this.container, args, { user: this.user, timeoutMs: 60_000, maxBytes });
    if (result.truncated) throw new Error(`The workspace is over ${Math.round(maxBytes / 2 ** 20)} MB, too big to check.`);
    if (result.code !== 0 && result.code !== 1) throw new Error(`Couldn't copy the files: ${result.stderr.toString("utf8").trim()}`);
    return result.stdout;
  }

  /** Lists a folder from inside the container, in the same shape as HostFs.list. */
  async list(rel: string, depth: number): Promise<{ entries: Entry[]; more: Record<string, number> }> {
    if (rel) checkRel(rel);
    const out = await this.run(LIST, [rel, String(Math.max(1, depth))], rel || "The workspace", undefined, 32 * 1024 * 1024);
    const fields = out.toString("utf8").split("\0");
    const rootDev = fields[0].trim();
    const byParent = new Map<string, Entry[]>();
    const devOf = new Map<string, string>([["", rootDev]]);
    for (let i = 1; i + 7 <= fields.length; i += 7) {
      const [y, size, mtime, mode, dev, rest, link] = fields.slice(i, i + 7);
      if (!rest) continue;
      const p = rel ? `${rel}/${rest}` : rest;
      const parent = path.posix.dirname(p) === "." ? "" : path.posix.dirname(p);
      let type: EntryType = TYPES[y] ?? "other";
      devOf.set(p, dev);
      if (type === "dir" && dev !== (devOf.get(parent) ?? rootDev)) type = "mount";
      const entry: Entry = {
        name: path.posix.basename(p),
        path: p,
        type,
        size: type === "dir" || type === "mount" ? 0 : Number(size),
        mtimeMs: Math.round(Number(mtime) * 1000),
        mode: parseInt(mode, 8) & 0o7777,
      };
      if (type === "symlink") {
        entry.target = link;
        if (pointsOutside(p, link)) entry.outside = true;
      }
      if ((type === "dir" || type === "mount") && HEAVY.has(entry.name)) entry.heavy = true;
      const list = byParent.get(parent) ?? [];
      list.push(entry);
      byParent.set(parent, list);
    }
    const entries: Entry[] = [];
    const more: Record<string, number> = {};
    for (const [parent, list] of byParent) {
      list.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      if (list.length > LIST_CAP) more[parent] = list.length - LIST_CAP;
      entries.push(...list.slice(0, LIST_CAP));
    }
    entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return { entries, more };
  }
}
