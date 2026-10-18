import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompilerShell } from "@/components/chrome/compiler-shell";
import { CompilerApp } from "@/components/compiler/compiler-app";
import { COMPILER_SLUGS, getCompilerLang } from "@/lib/compiler";
import { getLessonRefs } from "@/lib/learn";

// Every language page is prerendered. Anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return COMPILER_SLUGS.map((lang) => ({ lang }));
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
      <CompilerApp lang={lang} lessons={lessons} />
    </CompilerShell>
  );
}
