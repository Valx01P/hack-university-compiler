import { notFound } from "next/navigation";
import { LearnShell } from "@/components/learn/learn-shell";
import { getCompilerLang } from "@/lib/compiler";
import { getCourse, getLessonRefsByLang } from "@/lib/learn";

export default async function LearnLayout(props: LayoutProps<"/[lang]/learn">) {
  const { lang: slug } = await props.params;
  const lang = getCompilerLang(slug);
  const course = lang ? await getCourse(lang.slug) : null;
  if (!lang || !course) notFound();
  // The language switcher only offers languages that have a course.
  const courses = await getLessonRefsByLang();

  return (
    <LearnShell lang={lang.slug} langLabel={lang.label} course={course} courses={courses}>
      {props.children}
    </LearnShell>
  );
}
