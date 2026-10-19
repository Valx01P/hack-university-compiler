import { promises as fs } from "fs";
import path from "path";
import { cache } from "react";
import type { Challenge, ReferenceCategory, ReferenceData, ReferenceSection } from "@/lib/reference-types";

/**
 * Reads the compiler's cheatsheet and challenges at build time: the cheatsheet
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
  tests: { stdin?: string; args?: string[]; output: string }[];
  hints?: string[];
  setup?: string;
  code: Record<string, { starter: string; solution: string }>;
}

/** The topics, in order: a language's own list when it has one (SQL does),
    else the shared one. */
export const getCategories = cache(async (lang: string): Promise<ReferenceCategory[]> => {
  const own = path.join(ROOT, "reference", ID_RE.test(lang) ? lang : "_", "categories.json");
  const file = await fs
    .access(own)
    .then(() => own)
    .catch(() => path.join(ROOT, "reference", "categories.json"));
  const raw = JSON.parse(await fs.readFile(file, "utf8"));
  return (raw.categories as ReferenceCategory[]).map(({ id, title }) => ({ id, title }));
});

export const getCheatsheet = cache(async (lang: string): Promise<ReferenceSection[]> => {
  if (!ID_RE.test(lang)) return [];
  const categories = await getCategories(lang);
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

/** The topics a language's challenges are grouped by: its own list when
    every challenge it has fits it (SQL's are its own), else the shared one
    (TypeScript has its own cheatsheet topics and the short challenges every
    language has). */
export const getChallengeCategories = cache(async (lang: string): Promise<ReferenceCategory[]> => {
  const own = await getCategories(lang);
  const ids = new Set(own.map((c) => c.id));
  const mine = (await readChallengeFiles()).filter((c) => c.code?.[lang]);
  if (mine.every((c) => ids.has(c.category))) return own;
  const raw = JSON.parse(await fs.readFile(path.join(ROOT, "reference", "categories.json"), "utf8"));
  return (raw.categories as ReferenceCategory[]).map(({ id, title }) => ({ id, title }));
});

/** One language's challenges, in category order, easiest first. */
export const getChallenges = cache(async (lang: string): Promise<Challenge[]> => {
  const order = (await getChallengeCategories(lang)).map((c) => c.id);
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
      setup: c.setup ?? "",
      starter: c.code[lang].starter,
      solution: c.code[lang].solution,
    }));
});

export async function getReferenceData(lang: string): Promise<ReferenceData> {
  const [categories, cheatsheet, challenges, challengeCategories] = await Promise.all([
    getCategories(lang),
    getCheatsheet(lang),
    getChallenges(lang),
    getChallengeCategories(lang),
  ]);
  return { categories, cheatsheet, challenges, challengeCategories };
}
