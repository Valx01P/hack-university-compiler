import { getCourseEntry } from "@/lib/courses";
import { getTemplate, playgroundTemplateOf, sandboxTemplates } from "@/lib/workspaces";

/**
 * The playground routes (architecture §4.2.1, §9): /<course>/playground is
 * the course's playground, /<course>/playground/1 to /3 are scratch
 * playgrounds on the same template, and /<course>/playground/<template> is
 * any of the course's codebases as a sandbox. Template ids are never only
 * digits, so the two forms never collide. Server only (it reads content).
 */

export const SCRATCH_SLOTS = ["1", "2", "3"];

/** Courses with a playground: the course's playground template is on disk. */
export function playgroundCourses(courses: readonly { slug: string }[]): string[] {
  return courses.map((c) => c.slug).filter((slug) => playgroundTemplateOf(slug) !== null);
}

export interface PlaygroundLinkInfo {
  href: string;
  label: string;
  hint: string;
}

/** Every playground of a course, for the menu. */
export function playgroundLinks(course: string): PlaygroundLinkInfo[] {
  const label = getCourseEntry(course)?.label ?? course;
  const own = playgroundTemplateOf(course);
  if (!own) return [];
  return [
    { href: `/${course}/playground`, label: `${label} playground`, hint: "Your own project. It stays as you leave it." },
    ...SCRATCH_SLOTS.map((n) => ({ href: `/${course}/playground/${n}`, label: `Scratch ${n}`, hint: "A spare copy to try things in. Reset it any time." })),
    ...sandboxTemplates(course)
      .filter((t) => t.id !== own)
      .map((t) => ({ href: `/${course}/playground/${t.id}`, label: t.title, hint: "A codebase to explore and change, with no checks." })),
  ];
}

/** The scope and title a /<course>/playground[/<slot>] route opens, or null. */
export function playgroundRoute(course: string, slot?: string): { scope: string; title: string } | null {
  const label = getCourseEntry(course)?.label ?? course;
  const own = playgroundTemplateOf(course);
  if (!own) return null;
  if (slot === undefined) return { scope: `playground/${course}`, title: `${label} playground` };
  if (SCRATCH_SLOTS.includes(slot)) return { scope: `playground/${course}/${slot}`, title: `${label} playground · Scratch ${slot}` };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slot) || /^\d+$/.test(slot) || slot === own) return null;
  const template = getTemplate(course, slot);
  return template ? { scope: `sandbox/${course}/${slot}`, title: `${template.title} · sandbox` } : null;
}

/** Hides the IDE until it has restored (or 1.5 seconds pass), before the
    first paint of a hard load: the page's inline script. */
export const IDE_GATE = (attr: "data-restore" | "data-restore-editor") =>
  `(function(){try{var d=document.documentElement;d.setAttribute("${attr}","");setTimeout(function(){d.removeAttribute("${attr}")},1500)}catch(e){}})()`;
