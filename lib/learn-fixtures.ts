import { spawnSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { cache } from "react";

/**
 * Fixture sets: the data files (logs, CSV, configs, a small tree) a lesson's
 * programs start in, from content/fixtures/<course>/<name>/. The runner
 * copies a set into a fresh folder before every run, and Learn lists it in
 * the editor's Files strip, read only. Read at build time with the lesson.
 */
const DIR = process.env.FIXTURES_CONTENT_DIR
  ? path.resolve(process.env.FIXTURES_CONTENT_DIR)
  : path.join(process.cwd(), "content", "fixtures");
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// What the strip shows of each file, enough to read a log's first couple
// of hundred lines. It rides in the part's page, so it stays small. The
// runner always gets the whole file.
const SHOWN_BYTES = 16 * 1024;

export interface FixtureFile {
  /** Relative to the set, with forward slashes. */
  path: string;
  size: number;
  /** The text, cut at SHOWN_BYTES (`clipped`), or null for binary files. */
  content: string | null;
  clipped: boolean;
  executable: boolean;
  /** A symlink's target, as written. */
  link?: string;
}

type GitMode = { exec: true } | { link: string };
let gitModes: Map<string, GitMode> | null | undefined;

/**
 * On Windows a checkout keeps no executable bit and, unless it's set up for
 * links, checks a symbolic link out as a small text file holding its target,
 * so there the fixtures' modes come from git's own record: path from the
 * repository root ("/"-separated) to executable, or to a link's target.
 * Elsewhere (or without git) null, and the files say it themselves.
 */
function windowsGitModes(): Map<string, GitMode> | null {
  if (process.platform !== "win32" || process.env.FIXTURES_CONTENT_DIR) return null;
  if (gitModes !== undefined) return gitModes;
  gitModes = null;
  const git = (args: string[]) => spawnSync("git", args, { cwd: process.cwd(), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const listed = git(["ls-files", "-s", "-z", "--", "content/fixtures"]);
  if (listed.status !== 0 || listed.error) return gitModes;
  const modes = new Map<string, GitMode>();
  for (const record of listed.stdout.split("\0")) {
    const m = /^(\d{6}) ([0-9a-f]+) \d\t(.+)$/.exec(record);
    if (!m) continue;
    if (m[1] === "100755") modes.set(m[3], { exec: true });
    else if (m[1] === "120000") {
      const target = git(["cat-file", "-p", m[2]]);
      if (target.status === 0) modes.set(m[3], { link: target.stdout });
    }
  }
  gitModes = modes;
  return gitModes;
}

/** A fixture's path from the repository root, as git lists it. */
const repoPath = (full: string) => path.relative(process.cwd(), full).split(path.sep).join("/");

async function walk(root: string, rel = ""): Promise<FixtureFile[]> {
  const modes = windowsGitModes();
  const entries = await fs.readdir(path.join(root, rel), { withFileTypes: true });
  const files: FixtureFile[] = [];
  // In code point order, like ls in the C locale, the same on every machine.
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    const full = path.join(root, relPath);
    const git = modes?.get(repoPath(full));
    if (entry.isDirectory()) {
      files.push(...(await walk(root, relPath)));
    } else if (entry.isSymbolicLink() || (git && "link" in git)) {
      const link = git && "link" in git ? git.link : await fs.readlink(full);
      files.push({ path: relPath, size: 0, content: null, clipped: false, executable: false, link });
    } else if (entry.isFile()) {
      const [stat, bytes] = await Promise.all([fs.stat(full), fs.readFile(full)]);
      const binary = bytes.subarray(0, 8000).includes(0);
      const clipped = !binary && stat.size > SHOWN_BYTES;
      // A clipped file shows whole lines.
      const text = binary ? null : bytes.subarray(0, SHOWN_BYTES).toString("utf8");
      files.push({
        path: relPath,
        size: stat.size,
        content: text !== null && clipped ? text.slice(0, text.lastIndexOf("\n") + 1) || text : text,
        clipped,
        executable: git ? "exec" in git : (stat.mode & 0o111) !== 0,
      });
    }
  }
  return files;
}

/** The files of a course's fixture set, in path order, or null when there's
    no such set. */
export const getFixtureSet = cache(async (course: string, name: string): Promise<FixtureFile[] | null> => {
  if (!NAME_RE.test(course) || !NAME_RE.test(name)) return null;
  try {
    return await walk(path.join(DIR, course, name));
  } catch {
    return null;
  }
});
