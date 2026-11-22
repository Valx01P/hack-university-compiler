import { promises as fs } from "fs";
import path from "path";

/**
 * Ready-made folders a lesson can add to the Playground
 * (content/practice/<id>): the practice shop API the React and Next.js
 * courses call, for one. A lesson links to /playground?add=<id>, and the
 * Playground writes the folder's files at its top level, in a folder of the
 * same name, only where nothing is there yet (components/playground,
 * addPractice), so it never writes over a learner's edits.
 */
export const PRACTICE = {
  "trailhead-api": { open: "README.md" },
} as const;

export type PracticeId = keyof typeof PRACTICE;

export interface PracticeFolder {
  /** The folder it goes in, at the Playground's top level. */
  folder: string;
  /** The file to open once it's there. */
  open: string;
  /** Text as is, and pictures (the shop's product photos) in base64. */
  files: ({ path: string; text: string } | { path: string; base64: string })[];
}

const BINARY = /\.(webp|png|jpe?g|gif|ico)$/i;

const ROOT = path.join(process.cwd(), "content", "practice");

export function isPracticeId(id: string): id is PracticeId {
  return Object.hasOwn(PRACTICE, id);
}

/** A practice folder's files, read from content/practice/<id>. */
export async function readPractice(id: PracticeId): Promise<PracticeFolder> {
  const dir = path.join(/*turbopackIgnore: true*/ ROOT, id);
  const files: PracticeFolder["files"] = [];
  async function walk(rel: string) {
    for (const entry of await fs.readdir(path.join(/*turbopackIgnore: true*/ dir, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile()) {
        const bytes = await fs.readFile(path.join(/*turbopackIgnore: true*/ dir, child));
        files.push(BINARY.test(child) ? { path: child, base64: bytes.toString("base64") } : { path: child, text: bytes.toString("utf8") });
      }
    }
  }
  await walk("");
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { folder: id, open: PRACTICE[id].open, files };
}
