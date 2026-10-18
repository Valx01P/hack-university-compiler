import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PartView, type PartLink } from "@/components/learn/part-view";
import { getCompilerLang } from "@/lib/compiler";
import { getAllPartParams, getLesson, getLessonOrder } from "@/lib/learn";
import { partHref } from "@/lib/learn-types";

// Every part page is prerendered. Anything else is a 404.
export const dynamicParams = false;

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

  return (
    <PartView
      key={`${lesson.id}/${part}`}
      lang={lang}
      lesson={{ id: lesson.id, title: lesson.title, section: lesson.section, intro: lesson.intro, recap: lesson.recap, setup: lesson.setup }}
      parts={lesson.steps.map((s) => s.title)}
      part={part}
      step={lesson.steps[part]}
      position={{ index, total: order.length }}
      prev={prev}
      next={next}
    />
  );
}
