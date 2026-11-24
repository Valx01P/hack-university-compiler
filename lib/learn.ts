import { promises as fs } from "fs";
import path from "path";
import { cache } from "react";
import { normalizeLesson, type AnyLesson, type Course, type LessonFile, type LessonMeta, type LessonRef } from "@/lib/learn-types";
import { COURSES } from "@/lib/courses";
import { diagramNames, parseDiagram, type DiagramData } from "@/lib/diagram.mjs";
import { loadOnce } from "@/lib/load-once";

/**
 * Reads Learn mode content from content/learn at build time. Every lesson page
 * is prerendered, so these only run during `next build` (and per request in
 * dev). Content is read where it lies (next start runs in the repository), so
 * no path here needs tracing into the build output: each fs call says so with
 * turbopackIgnore, or the build traces every file its pattern could match.
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
    return JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** The folder a course is read from: its draft, when there is one. */
const courseDir = cache(async (lang: string): Promise<string> => {
  if (DRAFTS) {
    const draft = path.join(DRAFTS, lang);
    const found = await fs.access(path.join(/*turbopackIgnore: true*/ draft, "index.json")).then(
      () => true,
      () => false
    );
    if (found) return draft;
  }
  return path.join(DIR, lang);
});

/** The folder a course's lessons (and their part folders) are read from. */
export async function getCourseDir(lang: string): Promise<string> {
  return courseDir(lang);
}

/** A lesson, with every step's examples in `examples` (a lesson file may
    still give a step a single `example`). */
export const getLesson = cache(loadOnce(async (lang: string, id: string): Promise<AnyLesson | null> => {
  if (!ID_RE.test(lang) || !ID_RE.test(id)) return null;
  const file = await readJson<LessonFile>(path.join(await courseDir(lang), `${id}.json`));
  return file && normalizeLesson(file);
}));

/** The course for a language, or null when it has none yet. */
export const getCourse = cache(loadOnce(async (lang: string): Promise<Course | null> => {
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
              read: lesson.format === "read",
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
}));

/** Every lesson in course order. */
export async function getLessonOrder(lang: string): Promise<LessonMeta[]> {
  const course = await getCourse(lang);
  return course ? course.sections.flatMap((s) => s.lessons) : [];
}

/** A course's lessons in order, as links need them. */
export async function getLessonRefs(lang: string): Promise<LessonRef[]> {
  return (await getLessonOrder(lang)).map((l) => ({ id: l.id, parts: l.parts.length }));
}

// Learn covers every registered course with lessons (content/courses.json),
// its compiler page shipped or not. A course without one has only read
// lessons, and Learn hides its way back to the compiler, unless its
// lessons run in another course's compiler (Math in Python's).
const COURSE_SLUGS = COURSES.map((c) => c.slug);

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

/**
 * A course's diagram, content/learn/<course>/diagrams/<name>.svg (or its
 * draft's), parsed by lib/diagram.mjs into the tree the page draws. A
 * missing or invalid file throws, so a prerender that shows it fails the
 * build (the prebuild has checked every file already).
 */
export const getDiagram = cache(loadOnce(async (course: string, name: string): Promise<DiagramData> => {
  if (!ID_RE.test(course) || !ID_RE.test(name)) throw new Error(`Bad diagram name "${name}" in ${course} (kebab-case).`);
  const file = path.join(await courseDir(course), "diagrams", `${name}.svg`);
  let text: string;
  try {
    text = await fs.readFile(/*turbopackIgnore: true*/ file, "utf8");
  } catch {
    throw new Error(`There's no diagram ${course}/diagrams/${name}.svg.`);
  }
  const { data, errors } = parseDiagram(text, name);
  if (!data) throw new Error(`${course}/diagrams/${name}.svg:\n  ${errors.join("\n  ")}`);
  return data;
}));

/** The diagrams a part shows, by name: those in its body, its examples'
    prompts and explanations, a practice's prompt and hints, and on part 1
    the intro and on the last part the recap, the places the part draws
    them. Read parts and parts with an editor (Math's graphs) alike. */
export async function getPartDiagrams(course: string, lesson: AnyLesson, part: number): Promise<Record<string, DiagramData>> {
  const step = lesson.steps[part];
  if (!step) return {};
  const fields = [
    part === 0 ? lesson.intro : "",
    step.body,
    ...step.examples.flatMap((e) => [e.prompt, e.explanation]),
    ...("practice" in step ? [step.practice.prompt, ...(step.practice.hints ?? [])] : []),
    part === lesson.steps.length - 1 ? (lesson.recap ?? "") : "",
  ];
  const names = [...new Set(fields.flatMap((md) => diagramNames(md)))];
  const all = await Promise.all(names.map(async (name) => [name, await getDiagram(course, name)] as const));
  return Object.fromEntries(all);
}
