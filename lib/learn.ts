import { promises as fs } from "fs";
import path from "path";
import { cache } from "react";
import { normalizeLesson, type Course, type Lesson, type LessonFile, type LessonMeta, type LessonRef } from "@/lib/learn-types";
import { COMPILER_SLUGS } from "@/lib/compiler";

/**
 * Reads Learn mode content from content/learn at build time. Every lesson page
 * is prerendered, so these only run during `next build` (and per request in
 * dev).
 */
const DIR = path.join(process.cwd(), "content", "learn");
// Drafts outside the repo: a course in LEARN_CONTENT_DIR (the folder
// scripts/verify-lessons.mjs checks) takes the place of the one here, so a
// draft can be read in the app before it joins the course.
const DRAFTS = process.env.LEARN_CONTENT_DIR ? path.resolve(process.env.LEARN_CONTENT_DIR) : null;
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface CourseIndex {
  language: string;
  title: string;
  description: string;
  sections: { title: string; lessons: string[] }[];
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** The folder a course is read from: its draft, when there is one. */
const courseDir = cache(async (lang: string): Promise<string> => {
  if (DRAFTS) {
    const draft = path.join(DRAFTS, lang);
    const found = await fs.access(path.join(draft, "index.json")).then(
      () => true,
      () => false
    );
    if (found) return draft;
  }
  return path.join(DIR, lang);
});

/** A lesson, with every step's examples in `examples` (a lesson file may
    still give a step a single `example`). */
export const getLesson = cache(async (lang: string, id: string): Promise<Lesson | null> => {
  if (!ID_RE.test(lang) || !ID_RE.test(id)) return null;
  const file = await readJson<LessonFile>(path.join(await courseDir(lang), `${id}.json`));
  return file && normalizeLesson(file);
});

/** The course for a language, or null when it has none yet. */
export const getCourse = cache(async (lang: string): Promise<Course | null> => {
  if (!ID_RE.test(lang)) return null;
  const index = await readJson<CourseIndex>(path.join(await courseDir(lang), "index.json"));
  if (!index) return null;
  const sections = await Promise.all(
    index.sections.map(async (section) => ({
      title: section.title,
      lessons: (
        await Promise.all(
          section.lessons.map(async (id): Promise<LessonMeta | null> => {
            const lesson = await getLesson(lang, id);
            if (!lesson) return null;
            return {
              id,
              title: lesson.title,
              section: section.title,
              summary: lesson.summary,
              problems: lesson.steps.length,
              parts: lesson.steps.map((s) => s.title),
            };
          })
        )
      ).filter((l): l is LessonMeta => l !== null),
    }))
  );
  return {
    language: index.language,
    title: index.title,
    description: index.description,
    sections: sections.filter((s) => s.lessons.length > 0),
  };
});

/** Every lesson in course order. */
export async function getLessonOrder(lang: string): Promise<LessonMeta[]> {
  const course = await getCourse(lang);
  return course ? course.sections.flatMap((s) => s.lessons) : [];
}

/** A course's lessons in order, as links need them. */
export async function getLessonRefs(lang: string): Promise<LessonRef[]> {
  return (await getLessonOrder(lang)).map((l) => ({ id: l.id, parts: l.parts.length }));
}

/** Lessons in course order for every language that has a Learn mode (a
    course with at least one lesson), keyed by language in rail order. */
export async function getLessonRefsByLang(): Promise<Record<string, LessonRef[]>> {
  const all = await Promise.all(COMPILER_SLUGS.map(async (lang) => [lang, await getLessonRefs(lang)] as const));
  return Object.fromEntries(all.filter(([, refs]) => refs.length > 0));
}

/** Route params for every lesson's address (it redirects to part 1). */
export async function getAllLessonParams(): Promise<{ lang: string; lesson: string }[]> {
  const all = await Promise.all(
    COMPILER_SLUGS.map(async (lang) =>
      (await getLessonOrder(lang)).map((l) => ({ lang, lesson: l.id }))
    )
  );
  return all.flat();
}

/** Route params for every prerendered part page. */
export async function getAllPartParams(): Promise<{ lang: string; lesson: string; part: string }[]> {
  const all = await Promise.all(
    COMPILER_SLUGS.map(async (lang) =>
      (await getLessonOrder(lang)).flatMap((l) => l.parts.map((_, i) => ({ lang, lesson: l.id, part: String(i + 1) })))
    )
  );
  return all.flat();
}
