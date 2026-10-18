"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { LangIcon } from "@/components/compiler/lang-icon";
import { CompleteIcon, PendingIcon } from "@/components/learn/complete-icon";
import { COMPILER_LANGS } from "@/lib/compiler";
import { problemId, type Course } from "@/lib/learn-types";
import { useResumeLesson, useSolvedState } from "@/lib/learn-progress";

export function isLessonComplete(solved: Set<string>, id: string, problems: number) {
  if (problems === 0) return false;
  for (let i = 0; i < problems; i++) if (!solved.has(problemId(id, i))) return false;
  return true;
}

/**
 * The lesson plan: progress, a language switcher, the way back to the
 * compiler, and every lesson by section with its completion mark. Shown as the
 * sidebar on wide screens and inside the hamburger menu otherwise.
 */
export function LessonList({
  lang,
  langLabel,
  course,
  currentId,
  lessonIds,
  onNavigate,
}: {
  lang: string;
  langLabel: string;
  course: Course;
  currentId: string | null;
  /** Lesson ids in course order for every language that has a course. */
  lessonIds: Record<string, string[]>;
  onNavigate?: () => void;
}) {
  const { solved, loaded } = useSolvedState(lang);
  const lessons = course.sections.flatMap((s) => s.lessons);
  const done = lessons.filter((l) => isLessonComplete(solved, l.id, l.problems)).length;
  const currentRef = useRef<HTMLAnchorElement>(null);
  // Only languages with a course have a Learn mode to switch to.
  const langs = COMPILER_LANGS.filter((l) => lessonIds[l.slug]?.length);

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

  // Keep the current lesson in view as you move through the course.
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest" });
  }, [currentId]);

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
                lessons={lessonIds[l.slug]}
                current={l.slug === lang}
                currentId={currentId}
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
              return (
                <Link
                  key={l.id}
                  ref={current ? currentRef : undefined}
                  href={`/${lang}/learn/${l.id}`}
                  onClick={onNavigate}
                  title={l.summary}
                  aria-current={current ? "page" : undefined}
                  className={`flex items-start gap-2.5 rounded-btn px-2 py-1.5 text-sm transition-colors ${
                    current
                      ? "bg-raised font-medium text-ink dark:text-gold"
                      : "text-ink-muted hover:bg-raised hover:text-ink"
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
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}

/**
 * One language in the switcher. The current language links to the lesson
 * you're on; the others reopen where you left off in them, as long as that
 * lesson is still in their course.
 */
function LanguageLink({
  slug,
  label,
  lessons,
  current,
  currentId,
  onNavigate,
}: {
  slug: string;
  label: string;
  lessons: string[];
  current: boolean;
  currentId: string | null;
  onNavigate?: () => void;
}) {
  const resume = useResumeLesson(slug, lessons);
  const lesson = current && currentId && lessons.includes(currentId) ? currentId : resume;
  return (
    <Link
      href={lesson ? `/${slug}/learn/${lesson}` : `/${slug}/learn`}
      onClick={onNavigate}
      title={`Learn ${label}`}
      aria-label={`Learn ${label}`}
      aria-current={current ? "true" : undefined}
      className={`flex size-8 items-center justify-center rounded-btn transition-colors ${
        current ? "bg-raised text-ink dark:text-gold" : "text-ink-muted hover:bg-raised hover:text-ink"
      }`}
    >
      <LangIcon slug={slug} className="size-4" />
    </Link>
  );
}
