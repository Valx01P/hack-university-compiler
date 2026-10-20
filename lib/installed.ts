import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The compilers and courses chosen at npm run up (npm run add and npm run
 * remove change the list), or null before a first choice. Server only: it's
 * ~/.hack-university/components.json, read each time so a change in a
 * terminal shows on the next check.
 */
export function chosenComponents(): string[] | null {
  const dir = process.env.HU_DATA_DIR || path.join(os.homedir(), ".hack-university");
  try {
    const saved = JSON.parse(readFileSync(path.join(dir, "components.json"), "utf8")) as { chosen?: unknown };
    return Array.isArray(saved.chosen) ? saved.chosen.filter((id): id is string => typeof id === "string") : null;
  } catch {
    return null;
  }
}
