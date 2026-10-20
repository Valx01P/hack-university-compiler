import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InlineScript } from "@/components/inline-script";
import { WorkspacePartView } from "@/components/ide/workspace-part-view";
import { PartView, type PartLink } from "@/components/learn/part-view";
import { workspacePartData } from "@/lib/learn-workspace";
import { IDE_GATE } from "@/lib/playgrounds";
import { getCompilerLang } from "@/lib/compiler";
import { getAllPartParams, getLesson, getLessonOrder } from "@/lib/learn";
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

async function load(params: PageProps<"/[lang]/learn/[lesson]/[part]">["params"]) {
  const { lang: slug, lesson: id, part: raw } = await params;
  const lang = getCompilerLang(slug);
  const lesson = await getLesson(slug, id);
  const part = Number(raw) - 1;
  if (!lang || !lesson || !Number.isInteger(part) || part < 0 || part >= lesson.steps.length) return null;
  return { lang, lesson, part };
}

export async function generateMetadata(
  props: PageProps<"/[lang]/learn/[lesson]/[part]">
): Promise<Metadata> {
  const found = await load(props.params);
  if (!found) return { title: "Learn" };
  const { lang, lesson, part } = found;
  return {
    title: `${lesson.steps[part].title} · ${lesson.title} · Learn ${lang.label}`,
    description: lesson.summary,
  };
}

export default async function PartPage(props: PageProps<"/[lang]/learn/[lesson]/[part]">) {
  const found = await load(props.params);
  if (!found) notFound();
  const { lang, lesson, part } = found;

  const order = await getLessonOrder(lang.slug);
  const index = order.findIndex((l) => l.id === lesson.id);
  const before = index > 0 ? order[index - 1] : null;
  const after = index >= 0 && index < order.length - 1 ? order[index + 1] : null;
  const count = lesson.steps.length;
  // Prev and next walk through the parts, then on to the next lesson.
  const prev: PartLink | null =
    part > 0
      ? { href: partHref(lang.slug, lesson.id, part), title: lesson.steps[part - 1].title, lesson: false }
      : before
        ? { href: partHref(lang.slug, before.id, before.parts.length), title: before.title, lesson: true }
        : null;
  const next: PartLink | null =
    part < count - 1
      ? { href: partHref(lang.slug, lesson.id, part + 2), title: lesson.steps[part + 1].title, lesson: false }
      : after
        ? { href: partHref(lang.slug, after.id, 1), title: after.title, lesson: true }
        : null;

  // A part in the workspace format shows the IDE where the editor was.
  const format = lesson.steps[part].format ?? lesson.format ?? "single";
  if (format === "workspace") {
    const data = await workspacePartData(lang.slug, lesson, part);
    return (
      <>
        <InlineScript html={IDE_GATE("data-restore-editor")} />
        <WorkspacePartView
          key={`${lesson.id}/${part}`}
          lang={lang}
          lesson={{ id: lesson.id, title: lesson.title, section: lesson.section, intro: lesson.intro, recap: lesson.recap }}
          parts={lesson.steps.map((s) => s.title)}
          part={part}
          step={{ title: lesson.steps[part].title, body: lesson.steps[part].body }}
          data={data}
          position={{ index, total: order.length }}
          prev={prev}
          next={next}
        />
      </>
    );
  }

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
