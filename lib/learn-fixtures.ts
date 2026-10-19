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
// What the strip shows of each file. The runner always gets all of it.
const SHOWN_BYTES = 64 * 1024;

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

async function walk(root: string, rel = ""): Promise<FixtureFile[]> {
  const entries = await fs.readdir(path.join(root, rel), { withFileTypes: true });
  const files: FixtureFile[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    const full = path.join(root, relPath);
    if (entry.isDirectory()) {
      files.push(...(await walk(root, relPath)));
    } else if (entry.isSymbolicLink()) {
      files.push({ path: relPath, size: 0, content: null, clipped: false, executable: false, link: await fs.readlink(full) });
    } else if (entry.isFile()) {
      const [stat, bytes] = await Promise.all([fs.stat(full), fs.readFile(full)]);
      const binary = bytes.subarray(0, 8000).includes(0);
      files.push({
        path: relPath,
        size: stat.size,
        content: binary ? null : bytes.subarray(0, SHOWN_BYTES).toString("utf8"),
        clipped: !binary && stat.size > SHOWN_BYTES,
        executable: (stat.mode & 0o111) !== 0,
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
