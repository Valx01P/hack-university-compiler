import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { PartLink } from "@/components/learn/part-frame";
import { PartView } from "@/components/learn/part-view";
import { ReadPartView } from "@/components/learn/read-part-view";
import { getCompilerLang } from "@/lib/compiler";
import { getCourseEntry, isCompilerCourse } from "@/lib/courses";
import { codebaseHref, getAllPartParams, getLesson, getLessonOrder } from "@/lib/learn";
import { getFixtureSet, type FixtureFile } from "@/lib/learn-fixtures";
import { partHref, singleFileFeatures, type Lesson } from "@/lib/learn-types";

// Every part page is prerendered. Anything else is a 404.
export const dynamicParams = false;

/** The fixture sets a part's programs start in (its examples' and its
    practice's, for the editor's Files strip), by name. */
async function partFixtures(course: string, lesson: Lesson, part: number): Promise<Record<string, FixtureFile[]>> {
  const { examples, practice } = lesson.steps[part];
  const names = new Set(
    [...examples.map((e) => e.fixtures), practice.tests[0]?.fixtures, practice.fixtures, lesson.fixtures].filter(
      (name): name is string => Boolean(name)
    )
  );
  const sets = await Promise.all([...names].map(async (name) => [name, await getFixtureSet(course, name)] as const));
  return Object.fromEntries(sets.filter((entry): entry is [string, FixtureFile[]] => entry[1] !== null));
}

export function generateStaticParams() {
  return getAllPartParams();
}

// A read lesson needs only its course. Every other kind runs in the
// course's compiler, so its course needs a compiler page.
async function load(params: PageProps<"/[lang]/learn/[lesson]/[part]">["params"]) {
  const { lang: slug, lesson: id, part: raw } = await params;
  const course = getCourseEntry(slug);
  const lesson = await getLesson(slug, id);
  const part = Number(raw) - 1;
  if (!course || !lesson || !Number.isInteger(part) || part < 0 || part >= lesson.steps.length) return null;
  if (lesson.format === "read") return { course, lang: null, lesson, part };
  const lang = getCompilerLang(slug);
  return lang ? { course, lang, lesson, part } : null;
}

export async function generateMetadata(
  props: PageProps<"/[lang]/learn/[lesson]/[part]">
): Promise<Metadata> {
  const found = await load(props.params);
  if (!found) return { title: "Learn" };
  const { course, lesson, part } = found;
  return {
    title: `${lesson.steps[part].title} · ${lesson.title} · Learn ${course.label}`,
    description: lesson.summary,
  };
}

export default async function PartPage(props: PageProps<"/[lang]/learn/[lesson]/[part]">) {
  const found = await load(props.params);
  if (!found) notFound();
  const { course, lang, lesson, part } = found;

  const order = await getLessonOrder(course.slug);
  const index = order.findIndex((l) => l.id === lesson.id);
  const before = index > 0 ? order[index - 1] : null;
  const after = index >= 0 && index < order.length - 1 ? order[index + 1] : null;
  const count = lesson.steps.length;
  // Prev and next walk through the parts, then on to the next lesson.
  const prev: PartLink | null =
    part > 0
      ? { href: partHref(course.slug, lesson.id, part), title: lesson.steps[part - 1].title, lesson: false }
      : before
        ? { href: partHref(course.slug, before.id, before.parts.length), title: before.title, lesson: true }
        : null;
  const next: PartLink | null =
    part < count - 1
      ? { href: partHref(course.slug, lesson.id, part + 2), title: lesson.steps[part + 1].title, lesson: false }
      : after
        ? { href: partHref(course.slug, after.id, 1), title: after.title, lesson: true }
        : null;

  if (lesson.format === "read") {
    return (
      <ReadPartView
        key={`${lesson.id}/${part}`}
        course={{ slug: course.slug, label: course.label }}
        compiler={isCompilerCourse(course.slug)}
        lesson={{ id: lesson.id, title: lesson.title, section: lesson.section, intro: lesson.intro, recap: lesson.recap }}
        parts={lesson.steps.map((s) => s.title)}
        part={part}
        step={lesson.steps[part]}
        position={{ index, total: order.length }}
        prev={prev}
        next={next}
        ide={await codebaseHref(course.slug, lesson.steps[part].codebase)}
      />
    );
  }
  // load found the compiler for every other kind of lesson.
  if (!lang) notFound();

  const fixtures = await partFixtures(lang.slug, lesson, part);

  return (
    <PartView
      key={`${lesson.id}/${part}`}
      lang={lang}
      lesson={{
        id: lesson.id,
        title: lesson.title,
        section: lesson.section,
        intro: lesson.intro,
        recap: lesson.recap,
        setup: lesson.setup,
        fixtures: lesson.fixtures,
        clock: lesson.clock,
        runtime: lesson.runtime,
      }}
      parts={lesson.steps.map((s) => s.title)}
      part={part}
      step={lesson.steps[part]}
      position={{ index, total: order.length }}
      prev={prev}
      next={next}
      features={singleFileFeatures(lang.slug, lang.fileName)}
      fixtures={fixtures}
    />
  );
}
