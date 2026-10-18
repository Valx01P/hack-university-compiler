import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonView } from "@/components/learn/lesson-view";
import { getCompilerLang } from "@/lib/compiler";
import { getAllLessonParams, getLesson, getLessonOrder } from "@/lib/learn";

// Every lesson page is prerendered. Anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return getAllLessonParams();
}

export async function generateMetadata(
  props: PageProps<"/[lang]/learn/[lesson]">
): Promise<Metadata> {
  const { lang: slug, lesson: id } = await props.params;
  const lang = getCompilerLang(slug);
  const lesson = await getLesson(slug, id);
  return {
    title: lang && lesson ? `${lesson.title} · Learn ${lang.label}` : "Learn",
    description: lesson?.summary,
  };
}

export default async function LessonPage(props: PageProps<"/[lang]/learn/[lesson]">) {
  const { lang: slug, lesson: id } = await props.params;
  const lang = getCompilerLang(slug);
  const lesson = await getLesson(slug, id);
  if (!lang || !lesson) notFound();

  const order = await getLessonOrder(slug);
  const index = order.findIndex((l) => l.id === id);
  return (
    <LessonView
      lang={lang}
      lesson={lesson}
      position={{ index, total: order.length }}
      prev={index > 0 ? order[index - 1] : null}
      next={index >= 0 && index < order.length - 1 ? order[index + 1] : null}
    />
  );
}
