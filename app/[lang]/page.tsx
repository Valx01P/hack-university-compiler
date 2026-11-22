import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompilerShell } from "@/components/chrome/compiler-shell";
import { CompilerApp } from "@/components/compiler/compiler-app";
import { getCompilerLang } from "@/lib/compiler";
import { COMPILER_COURSES } from "@/lib/courses";
import { workspaceProps } from "@/lib/workspaces";
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
  // The page's own folder (Explorer and Terminal): its template's starting
  // tree, so the explorer paints before the runner answers.
  const workspace = await workspaceProps(`compiler/${lang.slug}`);

  return (
    <CompilerShell lang={lang.slug}>
      <CompilerApp lang={lang} lessons={lessons} workspace={workspace} />
    </CompilerShell>
  );
}
