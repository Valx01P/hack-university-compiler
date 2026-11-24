import { notFound } from "next/navigation";
// KaTeX's styles and fonts, for the courses whose prose has math (Math's):
// bundled with the app's build, never fetched, and on the page from its
// first paint, so typeset math never reflows when it loads.
import "katex/dist/katex.min.css";
import { LearnShell } from "@/components/learn/learn-shell";
import { compilerCourseOf, getCourseEntry } from "@/lib/courses";
import { getCourse, getLessonRefsByLang } from "@/lib/learn";

export default async function LearnLayout(props: LayoutProps<"/[lang]/learn">) {
  const { lang: slug } = await props.params;
  const entry = getCourseEntry(slug);
  const course = entry ? await getCourse(entry.slug) : null;
  if (!entry || !course) notFound();
  // The course switcher only offers courses that have lessons.
  const courses = await getLessonRefsByLang();
  // The compiler it leads to: its own, or the one its lessons run in.
  const compiler = compilerCourseOf(entry.slug);

  return (
    <LearnShell lang={entry.slug} compiler={compiler ? { slug: compiler.slug, label: compiler.label } : null} course={course} courses={courses}>
      {props.children}
    </LearnShell>
  );
}
