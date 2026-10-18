import { notFound, redirect } from "next/navigation";
import { getLessonIdsByLang, getLessonOrder } from "@/lib/learn";

// Only languages with a course have a Learn mode.
export const dynamicParams = false;

export async function generateStaticParams() {
  return Object.keys(await getLessonIdsByLang()).map((lang) => ({ lang }));
}

/** /<lang>/learn starts the course at its first lesson. */
export default async function LearnIndexPage(props: PageProps<"/[lang]/learn">) {
  const { lang } = await props.params;
  const [first] = await getLessonOrder(lang);
  if (!first) notFound();
  redirect(`/${lang}/learn/${first.id}`);
}
