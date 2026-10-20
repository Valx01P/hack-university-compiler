import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InlineScript } from "@/components/inline-script";
import { PlaygroundView } from "@/components/ide/playground-view";
import { COURSES, getCourseEntry } from "@/lib/courses";
import { getCourse } from "@/lib/learn";
import { IDE_GATE, playgroundCourses, playgroundLinks, playgroundRoute } from "@/lib/playgrounds";
import { workspaceProps } from "@/lib/workspaces";

// Every scratch playground and sandbox is prerendered. Anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return playgroundCourses(COURSES).flatMap((lang) =>
    playgroundLinks(lang)
      .map((l) => l.href.split("/")[3])
      .filter((slot): slot is string => Boolean(slot))
      .map((slot) => ({ lang, slot }))
  );
}

export async function generateMetadata(props: PageProps<"/[lang]/playground/[slot]">): Promise<Metadata> {
  const { lang, slot } = await props.params;
  const route = playgroundRoute(lang, slot);
  return { title: route ? route.title.replace(" · ", " ") : "Playground" };
}

/** /<course>/playground/<n> (scratch 1 to 3) and /<course>/playground/<template> (a sandbox). */
export default async function PlaygroundSlotPage(props: PageProps<"/[lang]/playground/[slot]">) {
  const { lang, slot } = await props.params;
  const route = playgroundRoute(lang, slot);
  const entry = getCourseEntry(lang);
  if (!route || !entry) notFound();
  const workspace = await workspaceProps(route.scope);
  return (
    <>
      <InlineScript html={IDE_GATE("data-restore")} />
      <PlaygroundView props={workspace} title={route.title} langLabel={entry.label} links={playgroundLinks(lang)} current={`/${lang}/playground/${slot}`} learnHref={(await getCourse(lang)) ? `/${lang}/learn` : null} />
    </>
  );
}
