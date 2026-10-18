import { promises as fs } from "fs";
import path from "path";
import { cache } from "react";
import type { Course, Lesson, LessonMeta } from "@/lib/learn-types";
import { COMPILER_SLUGS } from "@/lib/compiler";

/**
 * Reads Learn mode content from content/learn at build time. Every lesson page
 * is prerendered, so these only run during `next build` (and per request in
 * dev).
 */
const DIR = path.join(process.cwd(), "content", "learn");
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

export const getLesson = cache(async (lang: string, id: string): Promise<Lesson | null> => {
  if (!ID_RE.test(lang) || !ID_RE.test(id)) return null;
  return readJson<Lesson>(path.join(DIR, lang, `${id}.json`));
});

/** The course for a language, or null when it has none yet. */
export const getCourse = cache(async (lang: string): Promise<Course | null> => {
  if (!ID_RE.test(lang)) return null;
  const index = await readJson<CourseIndex>(path.join(DIR, lang, "index.json"));
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

/** Lesson ids in course order for every language that has a Learn mode (a
    course with at least one lesson), keyed by language in rail order. */
export async function getLessonIdsByLang(): Promise<Record<string, string[]>> {
  const all = await Promise.all(
    COMPILER_SLUGS.map(async (lang) => [lang, (await getLessonOrder(lang)).map((l) => l.id)] as const)
  );
  return Object.fromEntries(all.filter(([, ids]) => ids.length > 0));
}

/** Route params for every prerendered lesson page. */
export async function getAllLessonParams(): Promise<{ lang: string; lesson: string }[]> {
  const all = await Promise.all(
    COMPILER_SLUGS.map(async (lang) =>
      (await getLessonOrder(lang)).map((l) => ({ lang, lesson: l.id }))
    )
  );
  return all.flat();
}
