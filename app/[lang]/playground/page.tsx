import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InlineScript } from "@/components/inline-script";
import { PlaygroundView } from "@/components/ide/playground-view";
import { COURSES, getCourseEntry } from "@/lib/courses";
import { IDE_GATE, playgroundCourses, playgroundLinks, playgroundRoute } from "@/lib/playgrounds";
import { workspaceProps } from "@/lib/workspaces";

// Every course's playground is prerendered, painted from its template's
// starting tree. Anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return playgroundCourses(COURSES).map((lang) => ({ lang }));
}

export async function generateMetadata(props: PageProps<"/[lang]/playground">): Promise<Metadata> {
  const { lang } = await props.params;
  return { title: `${getCourseEntry(lang)?.label ?? "Code"} Playground` };
}

/** /<course>/playground: the course's own playground. */
export default async function PlaygroundPage(props: PageProps<"/[lang]/playground">) {
  const { lang } = await props.params;
  const route = playgroundRoute(lang);
  const entry = getCourseEntry(lang);
  if (!route || !entry) notFound();
  const workspace = await workspaceProps(route.scope);
  return (
    <>
      <InlineScript html={IDE_GATE("data-restore")} />
      <PlaygroundView props={workspace} title={route.title} langLabel={entry.label} links={playgroundLinks(lang)} current={`/${lang}/playground`} />
    </>
  );
}
