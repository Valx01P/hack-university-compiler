import { notFound, redirect } from "next/navigation";
import { COMPILER_SLUGS } from "@/lib/compiler";
import { getCourse, getLessonOrder } from "@/lib/learn";

// Only languages with a course have a Learn mode.
export const dynamicParams = false;

export async function generateStaticParams() {
  const withCourse = await Promise.all(
    COMPILER_SLUGS.map(async (lang) => ((await getCourse(lang)) ? { lang } : null))
  );
  return withCourse.filter((p) => p !== null);
}

/** /<lang>/learn starts the course at its first lesson. */
export default async function LearnIndexPage(props: PageProps<"/[lang]/learn">) {
  const { lang } = await props.params;
  const [first] = await getLessonOrder(lang);
  if (!first) notFound();
  redirect(`/${lang}/learn/${first.id}`);
}
