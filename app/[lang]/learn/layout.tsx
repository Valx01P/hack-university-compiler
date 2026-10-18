import { notFound } from "next/navigation";
import { LearnShell } from "@/components/learn/learn-shell";
import { getCompilerLang } from "@/lib/compiler";
import { getCourse } from "@/lib/learn";

export default async function LearnLayout(props: LayoutProps<"/[lang]/learn">) {
  const { lang: slug } = await props.params;
  const lang = getCompilerLang(slug);
  const course = lang ? await getCourse(lang.slug) : null;
  if (!lang || !course) notFound();

  return (
    <LearnShell lang={lang.slug} langLabel={lang.label} course={course}>
      {props.children}
    </LearnShell>
  );
}
