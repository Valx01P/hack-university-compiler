import type { Metadata } from "next";
import { existsSync } from "fs";
import path from "path";
import { notFound } from "next/navigation";
import { CompilerShell } from "@/components/chrome/compiler-shell";
import { CompilerApp } from "@/components/compiler/compiler-app";
import { getCompilerLang } from "@/lib/compiler";
import { COMPILER_COURSES, getCourseEntry } from "@/lib/courses";
import { getLessonRefs } from "@/lib/learn";

// Every course's compiler page is prerendered. Anything else is a 404,
// including a course registered ahead of its release.
export const dynamicParams = false;

export function generateStaticParams() {
  return COMPILER_COURSES.filter((c) => getCompilerLang(c.slug)).map((c) => ({ lang: c.slug }));
}

// Open playground leads to /<course>/playground, so it shows once that route
// exists (the IDE phase adds it) for courses that name a playground template.
const PLAYGROUND_ROUTE = existsSync(path.join(process.cwd(), "app", "[lang]", "playground"));

export async function generateMetadata(
  props: PageProps<"/[lang]">
): Promise<Metadata> {
  const { lang: slug } = await props.params;
  const lang = getCompilerLang(slug);
  return { title: lang ? `${lang.label} Compiler` : "Compiler" };
}

export default async function CompilerLangPage(props: PageProps<"/[lang]">) {
  const { lang: slug } = await props.params;
  const lang = getCompilerLang(slug);
  if (!lang) notFound();
  const lessons = await getLessonRefs(lang.slug);
  const playground = PLAYGROUND_ROUTE && getCourseEntry(lang.slug)?.playground ? `/${lang.slug}/playground` : null;

  return (
    <CompilerShell lang={lang.slug}>
      <CompilerApp lang={lang} lessons={lessons} playground={playground} />
    </CompilerShell>
  );
}
