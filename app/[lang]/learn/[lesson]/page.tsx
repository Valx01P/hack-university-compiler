import { notFound, redirect } from "next/navigation";
import { getAllLessonParams, getLesson } from "@/lib/learn";
import { partHref } from "@/lib/learn-types";

// Every lesson is prerendered. Anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return getAllLessonParams();
}

/** A lesson's address opens its first part. */
export default async function LessonPage(props: PageProps<"/[lang]/learn/[lesson]">) {
  const { lang, lesson: id } = await props.params;
  if (!(await getLesson(lang, id))) notFound();
  redirect(partHref(lang, id, 1));
}
