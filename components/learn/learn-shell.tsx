"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, SquareTerminal } from "lucide-react";
import { LessonList } from "@/components/learn/lesson-list";
import { LessonMenu } from "@/components/learn/lesson-menu";
import { SandboxStatus } from "@/components/chrome/sandbox-status";
import { ResizeHandle } from "@/components/ui/resize-handle";
import type { Course, LessonRef } from "@/lib/learn-types";

// The lesson list's width. Like the compiler's split it lasts for the session
// (moving between lessons keeps it) but isn't saved, so a reload never shifts.
const SIDEBAR = { min: 208, max: 440, initial: 256 };
const session = { sidebar: SIDEBAR.initial };

/**
 * Learn mode's frame: the same bordered panel as the compiler, with the lesson
 * plan as a sidebar when the screen is wide enough (a hamburger menu
 * otherwise). Drag the border to widen or narrow the list. It lives in the
 * learn layout, so it stays put, scroll and all, while you move between
 * lessons.
 */
export function LearnShell({
  lang,
  langLabel,
  course,
  courses,
  children,
}: {
  lang: string;
  langLabel: string;
  course: Course;
  /** Lessons in course order for every language that has a course. */
  courses: Record<string, LessonRef[]>;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const segments = pathname.split("/");
  const currentId = segments[3] ?? null;
  // The part you're on, counting from 0.
  const currentPart = Math.max(0, (Number(segments[4]) || 1) - 1);
  const lessons = course.sections.flatMap((s) => s.lessons);
  const index = lessons.findIndex((l) => l.id === currentId);
  const current = index >= 0 ? lessons[index] : null;

  const rowRef = useRef<HTMLDivElement>(null);
  const [sidebar, setSidebarWidth] = useState(session.sidebar);
  const setSidebar = (width: number) => {
    const clamped = Math.min(SIDEBAR.max, Math.max(SIDEBAR.min, Math.round(width)));
    session.sidebar = clamped;
    setSidebarWidth(clamped);
  };

  // Whether a back/forward history entry exists (Navigation API, Chromium).
  const [hist, setHist] = useState({ back: true, fwd: true });
  useEffect(() => {
    const nav = (window as unknown as { navigation?: { canGoBack: boolean; canGoForward: boolean } }).navigation;
    if (nav) setHist({ back: nav.canGoBack, fwd: nav.canGoForward });
  }, [pathname]);

  const arrow =
    "inline-flex size-7 items-center justify-center rounded-btn text-ink-faint transition-colors hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-faint";

  return (
    <div className="px-3 pt-2 pb-2 lg:h-[calc(100dvh-4rem-1px)] lg:overflow-hidden">
      <section className="flex min-h-0 flex-col rounded-card border border-edge bg-surface lg:h-full lg:overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-edge px-3 py-1.5">
          <span className="flex min-w-0 items-center gap-0.5">
            <span className="xl:hidden">
              <LessonMenu lang={lang} langLabel={langLabel} course={course} currentId={currentId} currentPart={currentPart} courses={courses} />
            </span>
            <span className="flex items-center xl:-ml-1">
              <button type="button" onClick={() => router.back()} disabled={!hist.back} aria-label="Go back" title="Go back" className={arrow}>
                <ArrowLeft className="size-4" aria-hidden />
              </button>
              <button type="button" onClick={() => router.forward()} disabled={!hist.fwd} aria-label="Go forward" title="Go forward" className={arrow}>
                <ArrowRight className="size-4" aria-hidden />
              </button>
            </span>
            {current && (
              <span className="ml-2 hidden min-w-0 truncate text-xs text-ink-faint sm:inline">
                {course.title} · {current.section} · Lesson {index + 1} of {lessons.length}
                {current.parts.length > 1 && ` · Part ${currentPart + 1} of ${current.parts.length}`}
              </span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {/* No room on phones; a run still reports sandbox problems. The
                badge shows up once the sandbox answers, so it gets a slot as
                wide as its longest label ("sandbox offline") in the server
                markup, and nothing moves when it appears. */}
            <span className="hidden min-w-32 justify-end sm:flex">
              <SandboxStatus lang={lang} />
            </span>
            <Link
              href={`/${lang}`}
              title={`Back to the ${langLabel} compiler`}
              className="inline-flex items-center gap-1.5 rounded-btn border border-edge px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-raised hover:text-ink"
            >
              <SquareTerminal className="size-3.5" aria-hidden />
              Compiler
            </Link>
          </span>
        </div>

        <div ref={rowRef} className="flex min-h-0 flex-1">
          <aside style={{ width: sidebar }} className="hidden shrink-0 xl:flex xl:flex-col">
            <LessonList lang={lang} langLabel={langLabel} course={course} currentId={currentId} currentPart={currentPart} courses={courses} />
          </aside>
          <ResizeHandle
            label="Resize the lesson list"
            value={sidebar}
            min={SIDEBAR.min}
            max={SIDEBAR.max}
            step={16}
            bigStep={48}
            onChange={setSidebar}
            onDrag={(x) => setSidebar(x - (rowRef.current?.getBoundingClientRect().left ?? 0) - 4)}
            onReset={() => setSidebar(SIDEBAR.initial)}
            className="hidden xl:flex"
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
        </div>
      </section>
    </div>
  );
}
