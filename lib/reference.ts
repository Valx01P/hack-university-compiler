import { promises as fs } from "fs";
import path from "path";
import { cache } from "react";
import type { Challenge, ReferenceCategory, ReferenceData, ReferenceSection } from "@/lib/reference-types";

/**
 * Reads the compiler's Reference content at build time: the cheatsheet
 * sections in content/reference/<lang>/<category>.md and the challenges in
 * content/challenges/<id>.json (each with code for every language).
 * Authoring guides live next to the content.
 */
const ROOT = path.join(process.cwd(), "content");
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DIFFICULTY_ORDER = ["very-easy", "easy", "medium"];

interface ChallengeFile {
  id: string;
  title: string;
  category: string;
  difficulty: Challenge["difficulty"];
  statement: string;
  tests: { stdin?: string; output: string }[];
  hints?: string[];
  code: Record<string, { starter: string; solution: string }>;
}

export const getCategories = cache(async (): Promise<ReferenceCategory[]> => {
  const raw = JSON.parse(await fs.readFile(path.join(ROOT, "reference", "categories.json"), "utf8"));
  return (raw.categories as ReferenceCategory[]).map(({ id, title }) => ({ id, title }));
});

export const getCheatsheet = cache(async (lang: string): Promise<ReferenceSection[]> => {
  if (!ID_RE.test(lang)) return [];
  const categories = await getCategories();
  const sections = await Promise.all(
    categories.map(async (c): Promise<ReferenceSection | null> => {
      try {
        const text = (await fs.readFile(path.join(ROOT, "reference", lang, `${c.id}.md`), "utf8")).replace(/\r\n/g, "\n");
        const [first, ...rest] = text.split("\n");
        return { id: c.id, title: first.replace(/^#\s+/, "").trim() || c.title, md: rest.join("\n").trim() };
      } catch {
        return null;
      }
    })
  );
  return sections.filter((s): s is ReferenceSection => s !== null);
});

const readChallengeFiles = cache(async (): Promise<ChallengeFile[]> => {
  const dir = path.join(ROOT, "challenges");
  let names: string[] = [];
  try {
    names = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const files = await Promise.all(
    names.map(async (f) => {
      try {
        return JSON.parse(await fs.readFile(path.join(dir, f), "utf8")) as ChallengeFile;
      } catch {
        return null;
      }
    })
  );
  return files.filter((c): c is ChallengeFile => c !== null && ID_RE.test(c.id));
});

/** One language's challenges, in category order, easiest first. */
export const getChallenges = cache(async (lang: string): Promise<Challenge[]> => {
  const order = (await getCategories()).map((c) => c.id);
  return (await readChallengeFiles())
    .filter((c) => c.code?.[lang] && order.includes(c.category))
    .sort(
      (a, b) =>
        order.indexOf(a.category) - order.indexOf(b.category) ||
        DIFFICULTY_ORDER.indexOf(a.difficulty) - DIFFICULTY_ORDER.indexOf(b.difficulty) ||
        a.title.localeCompare(b.title)
    )
    .map((c) => ({
      id: c.id,
      title: c.title,
      category: c.category,
      difficulty: c.difficulty,
      statement: c.statement,
      tests: c.tests,
      hints: c.hints ?? [],
      starter: c.code[lang].starter,
      solution: c.code[lang].solution,
    }));
});

export async function getReferenceData(lang: string): Promise<ReferenceData> {
  const [categories, cheatsheet, challenges] = await Promise.all([getCategories(), getCheatsheet(lang), getChallenges(lang)]);
  return { categories, cheatsheet, challenges };
}
