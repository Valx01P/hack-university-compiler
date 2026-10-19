import { notFound } from "next/navigation";
import { LearnShell } from "@/components/learn/learn-shell";
import { getCourseEntry } from "@/lib/courses";
import { getCourse, getLessonRefsByLang } from "@/lib/learn";

export default async function LearnLayout(props: LayoutProps<"/[lang]/learn">) {
  const { lang: slug } = await props.params;
  const entry = getCourseEntry(slug);
  const course = entry?.page ? await getCourse(entry.slug) : null;
  if (!entry || !course) notFound();
  // The course switcher only offers courses that have lessons.
  const courses = await getLessonRefsByLang();

  return (
    <LearnShell lang={entry.slug} langLabel={entry.label} course={course} courses={courses}>
      {props.children}
    </LearnShell>
  );
}
