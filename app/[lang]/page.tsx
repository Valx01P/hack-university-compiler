import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompilerShell } from "@/components/chrome/compiler-shell";
import { CompilerApp } from "@/components/compiler/compiler-app";
import { getCompilerLang } from "@/lib/compiler";
import { COMPILER_COURSES, playgroundHref } from "@/lib/courses";
import { getLessonRefs } from "@/lib/learn";

// Every course's compiler page is prerendered. Anything else is a 404,
// including a course registered ahead of its release.
export const dynamicParams = false;

export function generateStaticParams() {
  return COMPILER_COURSES.filter((c) => getCompilerLang(c.slug)).map((c) => ({ lang: c.slug }));
}

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

  return (
    <CompilerShell lang={lang.slug}>
      {/* Open playground shows once /<course>/playground exists (lib/courses.ts). */}
      <CompilerApp lang={lang} lessons={lessons} playground={playgroundHref(lang.slug)} />
    </CompilerShell>
  );
}
