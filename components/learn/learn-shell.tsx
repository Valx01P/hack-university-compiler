"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, PanelLeftClose, PanelLeftOpen, SquareTerminal } from "lucide-react";
import { LessonDrawer } from "@/components/learn/lesson-drawer";
import { LessonList } from "@/components/learn/lesson-list";
import { SandboxStatus } from "@/components/chrome/sandbox-status";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { EASE, dur, gsap } from "@/lib/motion";
import type { Course, LessonRef } from "@/lib/learn-types";

// The lesson list's width (0 when folded away), and the width it reopens at.
// Like the compiler's split they last for the session (moving between
// lessons keeps them) but aren't saved, so a reload never shifts. Dragging it
// narrower than `collapseBelow` folds it away completely.
const SIDEBAR = { min: 208, max: 440, initial: 256, collapseBelow: 150 };
const session = { sidebar: SIDEBAR.initial, open: SIDEBAR.initial };

// The sidebar docks from this width up. Narrower screens open the lesson list
// as a drawer instead.
const WIDE = "(min-width: 1280px)";
const subscribeWide = (onChange: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useWide = () =>
  useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => true
  );

const clampWidth = (width: number) =>
  width < SIDEBAR.collapseBelow ? 0 : Math.min(SIDEBAR.max, Math.max(SIDEBAR.min, Math.round(width)));

/**
 * Learn mode's frame: the same bordered panel as the compiler, with the lesson
 * plan beside the lesson. The panel button shows and hides it: on wide screens
 * it folds the docked sidebar, on narrower ones it slides the list in as a
 * drawer. Drag the sidebar's border to widen or narrow it, or all the way
 * left to fold it away. It lives in the learn layout, so it stays put, scroll
 * and all, while you move between lessons.
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
  const wide = useWide();

  const rowRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const panelButtonRef = useRef<HTMLButtonElement>(null);
  const [sidebar, setSidebarWidth] = useState(session.sidebar);
  const collapsed = sidebar === 0;
  // Set just before the width changes, to grow the sidebar from this width
  // in the layout effect below instead of jumping.
  const growFrom = useRef<number | null>(null);
  const folding = useRef(false);

  const commit = (width: number) => {
    session.sidebar = width;
    if (width) session.open = width;
    setSidebarWidth(width);
  };
  // Folds the sidebar away smoothly, then drops it.
  const fold = () => {
    const aside = asideRef.current;
    if (!aside || folding.current) return;
    folding.current = true;
    gsap.to(aside, {
      width: 0,
      duration: dur(0.28),
      ease: EASE.inOut,
      overwrite: true,
      onComplete: () => {
        folding.current = false;
        commit(0);
      },
    });
  };
  // Animates to a new width: folds for 0, otherwise grows or shrinks to it.
  const animateTo = (width: number) => {
    const next = clampWidth(width);
    if (next === 0) return fold();
    growFrom.current = collapsed ? 0 : (asideRef.current?.offsetWidth ?? sidebar);
    commit(next);
  };
  // Dragging follows the pointer exactly, except that folding away animates.
  const dragTo = (width: number) => {
    const next = clampWidth(width);
    if (next === 0) return collapsed ? undefined : fold();
    const aside = asideRef.current;
    if (aside && folding.current) {
      gsap.killTweensOf(aside);
      folding.current = false;
      gsap.set(aside, { width: next });
    }
    commit(next);
  };

  useLayoutEffect(() => {
    const from = growFrom.current;
    growFrom.current = null;
    const aside = asideRef.current;
    if (from === null || !aside || from === sidebar) return;
    gsap.fromTo(aside, { width: from }, { width: sidebar, duration: dur(0.3), ease: EASE.inOut, overwrite: true });
  }, [sidebar]);

  // Below the docking width the list is a drawer, closed on every move.
  const [drawer, setDrawer] = useState(false);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    if (wide) setDrawer(false);
  }, [wide]);

  const shown = wide ? !collapsed : drawer;
  const togglePanel = () => {
    if (window.matchMedia(WIDE).matches) animateTo(collapsed ? session.open : 0);
    else setDrawer((open) => !open);
  };

  // Whether a back/forward history entry exists (Navigation API, Chromium).
  const [hist, setHist] = useState({ back: true, fwd: true });
  useEffect(() => {
    const nav = (window as unknown as { navigation?: { canGoBack: boolean; canGoForward: boolean } }).navigation;
    if (nav) setHist({ back: nav.canGoBack, fwd: nav.canGoForward });
  }, [pathname]);

  const arrow =
    "inline-flex size-7 items-center justify-center rounded-btn text-ink-faint transition-colors hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-faint";
  const listProps = { lang, langLabel, course, currentId, currentPart, courses };

  return (
    <div className="px-3 pt-2 pb-2 lg:h-[calc(100dvh-4rem-1px)] lg:overflow-hidden">
      <section className="flex min-h-0 flex-col rounded-card border border-line bg-surface lg:h-full lg:overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-1.5">
          <span className="flex min-w-0 items-center gap-0.5">
            <button
              ref={panelButtonRef}
              type="button"
              onClick={togglePanel}
              aria-expanded={shown}
              aria-label={shown ? "Hide the lesson list" : "Show the lesson list"}
              title={shown ? "Hide the lesson list" : "Show the lesson list"}
              className={`${arrow} -ml-1`}
            >
              {/* Which icon depends on the screen: the docked sidebar starts
                  open, the drawer starts closed. CSS picks, so the first
                  paint is right on both. */}
              <span className="hidden xl:contents">
                {collapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
              </span>
              <span className="contents xl:hidden">
                {drawer ? <PanelLeftClose className="size-4" aria-hidden /> : <PanelLeftOpen className="size-4" aria-hidden />}
              </span>
            </button>
            <span className="flex items-center">
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
              className="inline-flex items-center gap-1.5 rounded-btn border border-line px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-raised hover:text-ink"
            >
              <SquareTerminal className="size-3.5" aria-hidden />
              Compiler
            </Link>
          </span>
        </div>

        <div ref={rowRef} className="flex min-h-0 flex-1">
          {!collapsed && (
            // The list keeps its width while the sidebar folds, so it slides
            // under the border instead of squeezing.
            <aside ref={asideRef} style={{ width: sidebar }} className="hidden shrink-0 overflow-hidden xl:flex">
              <div style={{ width: sidebar }} className="flex min-h-0 shrink-0 flex-col">
                <LessonList {...listProps} />
              </div>
            </aside>
          )}
          <ResizeHandle
            label="Resize the lesson list"
            value={sidebar}
            min={0}
            max={SIDEBAR.max}
            step={16}
            bigStep={48}
            // From folded away, any step out opens it at its narrowest.
            onChange={(next) => animateTo(collapsed && next > 0 ? SIDEBAR.min : next)}
            onDrag={(x) => dragTo(x - (rowRef.current?.getBoundingClientRect().left ?? 0) - 4)}
            onReset={() => animateTo(SIDEBAR.initial)}
            quiet={collapsed}
            className={`hidden xl:flex ${collapsed ? "-mr-[9px] relative z-10" : ""}`}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
        </div>
      </section>

      <LessonDrawer {...listProps} open={drawer} onClose={closeDrawer} returnFocusTo={panelButtonRef} />
    </div>
  );
}
