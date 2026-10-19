import { promises as fs } from "fs";
import path from "path";
import { cache } from "react";
import type { Course, Lesson, LessonMeta, LessonRef } from "@/lib/learn-types";
import { COMPILER_COURSES } from "@/lib/courses";

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

// Learn covers the courses whose compiler page exists (content/courses.json),
// so every course's "Back to the compiler" has somewhere to go.
const COURSE_SLUGS = COMPILER_COURSES.map((c) => c.slug);

/** Lessons in course order for every course that has a Learn mode (at
    least one lesson), keyed by course in registry order. */
export async function getLessonRefsByLang(): Promise<Record<string, LessonRef[]>> {
  const all = await Promise.all(COURSE_SLUGS.map(async (lang) => [lang, await getLessonRefs(lang)] as const));
  return Object.fromEntries(all.filter(([, refs]) => refs.length > 0));
}

/** Route params for every lesson's address (it redirects to part 1). */
export async function getAllLessonParams(): Promise<{ lang: string; lesson: string }[]> {
  const all = await Promise.all(
    COURSE_SLUGS.map(async (lang) =>
      (await getLessonOrder(lang)).map((l) => ({ lang, lesson: l.id }))
    )
  );
  return all.flat();
}

/** Route params for every prerendered part page. */
export async function getAllPartParams(): Promise<{ lang: string; lesson: string; part: string }[]> {
  const all = await Promise.all(
    COURSE_SLUGS.map(async (lang) =>
      (await getLessonOrder(lang)).flatMap((l) => l.parts.map((_, i) => ({ lang, lesson: l.id, part: String(i + 1) })))
    )
  );
  return all.flat();
}
