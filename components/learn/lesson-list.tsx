"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { LangIcon } from "@/components/compiler/lang-icon";
import { CompleteIcon, PendingIcon } from "@/components/learn/complete-icon";
import { COMPILER_LANGS } from "@/lib/compiler";
import { problemId, type Course } from "@/lib/learn-types";
import { lastLesson, useSolved } from "@/lib/learn-progress";

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
  onNavigate,
}: {
  lang: string;
  langLabel: string;
  course: Course;
  currentId: string | null;
  onNavigate?: () => void;
}) {
  const solved = useSolved(lang);
  const lessons = course.sections.flatMap((s) => s.lessons);
  const done = lessons.filter((l) => isLessonComplete(solved, l.id, l.problems)).length;
  const currentRef = useRef<HTMLAnchorElement>(null);

  // Each language opens where you left off in it.
  const [hrefs, setHrefs] = useState<Record<string, string>>({});
  useEffect(() => {
    setHrefs(
      Object.fromEntries(
        COMPILER_LANGS.map((l) => {
          const last = lastLesson(l.slug);
          return [l.slug, last ? `/${l.slug}/learn/${last}` : `/${l.slug}/learn`];
        })
      )
    );
  }, [currentId]);

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
            className="h-full rounded-full bg-complete transition-[width] duration-500"
            style={{ width: `${lessons.length ? (done / lessons.length) * 100 : 0}%` }}
          />
        </div>
        <div className="mt-3 flex items-center gap-0.5" aria-label="Learn another language">
          {COMPILER_LANGS.map((l) => {
            const active = l.slug === lang;
            return (
              <Link
                key={l.slug}
                href={hrefs[l.slug] ?? `/${l.slug}/learn`}
                onClick={onNavigate}
                title={`Learn ${l.label}`}
                aria-label={`Learn ${l.label}`}
                aria-current={active ? "page" : undefined}
                className={`flex size-8 items-center justify-center rounded-btn transition-colors ${
                  active ? "bg-raised text-ink dark:text-gold" : "text-ink-muted hover:bg-raised hover:text-ink"
                }`}
              >
                <LangIcon slug={l.slug} className="size-4" />
              </Link>
            );
          })}
        </div>
        <Link
          href={`/${lang}`}
          onClick={onNavigate}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink dark:hover:text-gold"
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
                  className={`flex items-center gap-2.5 rounded-btn px-2 py-1.5 text-sm transition-colors ${
                    current
                      ? "bg-raised font-medium text-ink dark:text-gold"
                      : "text-ink-muted hover:bg-raised hover:text-ink"
                  }`}
                >
                  {complete ? <CompleteIcon /> : <PendingIcon current={current} />}
                  <span className="w-5 shrink-0 text-right font-mono text-xs text-ink-faint">{n}</span>
                  <span className="min-w-0 truncate">{l.title}</span>
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
