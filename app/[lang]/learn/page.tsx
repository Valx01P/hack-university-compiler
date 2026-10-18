import { notFound, redirect } from "next/navigation";
import { getLessonOrder, getLessonRefsByLang } from "@/lib/learn";
import { partHref } from "@/lib/learn-types";

// Only languages with a course have a Learn mode.
export const dynamicParams = false;

export async function generateStaticParams() {
  return Object.keys(await getLessonRefsByLang()).map((lang) => ({ lang }));
}

/** /<lang>/learn starts the course at its first lesson. */
export default async function LearnIndexPage(props: PageProps<"/[lang]/learn">) {
  const { lang } = await props.params;
  const [first] = await getLessonOrder(lang);
  if (!first) notFound();
  redirect(partHref(lang, first.id, 1));
}
