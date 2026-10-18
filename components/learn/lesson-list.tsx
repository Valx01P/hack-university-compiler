"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { LangIcon } from "@/components/compiler/lang-icon";
import { CompleteIcon, PendingIcon } from "@/components/learn/complete-icon";
import { COMPILER_LANGS } from "@/lib/compiler";
import { partHref, problemId, type Course, type LessonRef } from "@/lib/learn-types";
import { useResumeHref, useSolvedState } from "@/lib/learn-progress";

export function isLessonComplete(solved: Set<string>, id: string, problems: number) {
  if (problems === 0) return false;
  for (let i = 0; i < problems; i++) if (!solved.has(problemId(id, i))) return false;
  return true;
}

/**
 * The lesson plan: progress, a language switcher, the way back to the
 * compiler, and every lesson by section with its completion mark. Each
 * lesson's parts fold out under it: collapsed by default so the list stays
 * short, with the lesson you're on opened for you. Shown as the sidebar on
 * wide screens and inside the hamburger menu otherwise.
 */
export function LessonList({
  lang,
  langLabel,
  course,
  currentId,
  currentPart,
  courses,
  onNavigate,
}: {
  lang: string;
  langLabel: string;
  course: Course;
  currentId: string | null;
  /** The part you're on, counting from 0. */
  currentPart: number;
  /** Lessons in course order for every language that has a course. */
  courses: Record<string, LessonRef[]>;
  onNavigate?: () => void;
}) {
  const { solved, loaded } = useSolvedState(lang);
  const lessons = course.sections.flatMap((s) => s.lessons);
  const done = lessons.filter((l) => isLessonComplete(solved, l.id, l.problems)).length;
  const currentRef = useRef<HTMLAnchorElement>(null);
  const uid = useId();
  // Only languages with a course have a Learn mode to switch to.
  const langs = COMPILER_LANGS.filter((l) => courses[l.slug]?.length);

  // Which lessons show their parts. The current one opens by itself (in the
  // server markup too, so nothing moves on load), and stays open until you
  // fold it.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(currentId ? [currentId] : []));
  useEffect(() => {
    if (currentId) setExpanded((all) => (all.has(currentId) ? all : new Set(all).add(currentId)));
  }, [currentId]);
  const toggle = (id: string) =>
    setExpanded((all) => {
      const next = new Set(all);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  // The bar animates progress you make here, but saved progress fills it in
  // without animating, so a reload never replays the fill. Lay out the loaded
  // width before the transition turns on, so the two never apply together.
  const barRef = useRef<HTMLDivElement>(null);
  const [barAnimates, setBarAnimates] = useState(false);
  useEffect(() => {
    if (!loaded || barAnimates) return;
    void barRef.current?.offsetWidth;
    setBarAnimates(true);
  }, [loaded, barAnimates]);

  // Keep where you are in view as you move through the course.
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest" });
  }, [currentId, currentPart]);

  let n = 0;
  return (
    <nav aria-label={`${course.title} lessons`} className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-edge px-3 pb-3 pt-3">
        <p className="eyebrow">{course.title}</p>
        <p className="mt-2 text-xs text-ink-muted">
          {done} of {lessons.length} lessons complete
        </p>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-raised">
          <div
            ref={barRef}
            className={`h-full rounded-full bg-complete ${barAnimates ? "transition-[width] duration-500" : ""}`}
            style={{ width: `${lessons.length ? (done / lessons.length) * 100 : 0}%` }}
          />
        </div>
        {langs.length > 1 && (
          <div role="group" aria-label="Learn another language" className="mt-3 flex items-center gap-0.5">
            {langs.map((l) => (
              <LanguageLink
                key={l.slug}
                slug={l.slug}
                label={l.label}
                lessons={courses[l.slug]}
                here={l.slug === lang && currentId ? partHref(lang, currentId, currentPart + 1) : null}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
        <Link
          href={`/${lang}`}
          onClick={onNavigate}
          className={`${langs.length > 1 ? "mt-2" : "mt-3"} inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink dark:hover:text-gold`}
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to the {langLabel} compiler
        </Link>
      </div>

      <div className="slim-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {course.sections.map((section) => (
          <div key={section.title} className="mt-3">
            <p className="eyebrow px-2 pb-1.5">{section.title}</p>
            {section.lessons.map((l) => {
              n += 1;
              const complete = isLessonComplete(solved, l.id, l.problems);
              const current = l.id === currentId;
              const hasParts = l.parts.length > 1;
              const open = hasParts && expanded.has(l.id);
              const partsId = `${uid}-${l.id}`;
              return (
                <div key={l.id}>
                  <div
                    className={`flex items-start rounded-btn transition-colors ${
                      current ? "bg-raised" : "hover:bg-raised"
                    }`}
                  >
                    <Link
                      ref={current && !open ? currentRef : undefined}
                      href={partHref(lang, l.id, 1)}
                      onClick={onNavigate}
                      title={l.summary}
                      aria-current={current && !hasParts ? "page" : current ? "true" : undefined}
                      className={`flex min-w-0 flex-1 items-start gap-2.5 rounded-btn px-2 py-1.5 text-sm transition-colors ${
                        current ? "font-medium text-ink dark:text-gold" : "text-ink-muted hover:text-ink"
                      }`}
                    >
                      {/* Long titles wrap; the mark and number stay on the first line. */}
                      {complete ? (
                        <CompleteIcon className="mt-0.5 size-4" />
                      ) : (
                        <PendingIcon current={current} className="mt-0.5 size-4" />
                      )}
                      <span className="mt-0.5 w-5 shrink-0 text-right font-mono text-xs text-ink-faint">{n}</span>
                      <span className="min-w-0 wrap-break-word">{l.title}</span>
                      {complete && <span className="sr-only">(complete)</span>}
                    </Link>
                    {hasParts && (
                      <button
                        type="button"
                        onClick={() => toggle(l.id)}
                        aria-expanded={open}
                        aria-controls={open ? partsId : undefined}
                        aria-label={`${open ? "Hide" : "Show"} the ${l.parts.length} parts of ${l.title}`}
                        title={open ? "Hide parts" : "Show parts"}
                        className="mr-0.5 mt-1 inline-flex size-6 shrink-0 items-center justify-center rounded-btn text-ink-faint transition-colors hover:text-ink"
                      >
                        <ChevronRight className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
                      </button>
                    )}
                  </div>
                  {open && (
                    <ol id={partsId} className="mb-1 ml-[1.15rem] mt-0.5 border-l border-edge pl-2">
                      {l.parts.map((title, i) => {
                        const here = current && i === currentPart;
                        const partSolved = solved.has(problemId(l.id, i));
                        return (
                          <li key={i}>
                            <Link
                              ref={here ? currentRef : undefined}
                              href={partHref(lang, l.id, i + 1)}
                              onClick={onNavigate}
                              aria-current={here ? "page" : undefined}
                              className={`flex items-start gap-2 rounded-btn px-2 py-1 text-[13px] leading-5 transition-colors ${
                                here
                                  ? "bg-raised font-medium text-ink dark:text-gold"
                                  : "text-ink-muted hover:bg-raised hover:text-ink"
                              }`}
                            >
                              {partSolved ? (
                                <CompleteIcon className="mt-[3px] size-3.5" />
                              ) : (
                                <PendingIcon current={here} className="mt-[3px] size-3.5" />
                              )}
                              <span className="min-w-0 wrap-break-word">{title}</span>
                              {partSolved && <span className="sr-only">(solved)</span>}
                            </Link>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}

/**
 * One language in the switcher. The current language links to the part
 * you're on; the others reopen where you left off in them, as long as that
 * part is still in their course.
 */
function LanguageLink({
  slug,
  label,
  lessons,
  here,
  onNavigate,
}: {
  slug: string;
  label: string;
  lessons: LessonRef[];
  /** Where you are, when this is the current language. */
  here: string | null;
  onNavigate?: () => void;
}) {
  const resume = useResumeHref(slug, lessons);
  return (
    <Link
      href={here ?? resume ?? `/${slug}/learn`}
      onClick={onNavigate}
      title={`Learn ${label}`}
      aria-label={`Learn ${label}`}
      aria-current={here ? "true" : undefined}
      className={`flex size-8 items-center justify-center rounded-btn transition-colors ${
        here ? "bg-raised text-ink dark:text-gold" : "text-ink-muted hover:bg-raised hover:text-ink"
      }`}
    >
      <LangIcon slug={slug} className="size-4" />
    </Link>
  );
}
