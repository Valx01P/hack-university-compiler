"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { FloatingNav } from "@/components/chrome/floating-nav";
import { HistoryArrows } from "@/components/chrome/history-arrows";
import { SandboxStatus } from "@/components/chrome/sandbox-status";
import { CompilerButton } from "@/components/learn/compiler-button";
import { LessonDrawer } from "@/components/learn/lesson-drawer";
import { LessonList, type LearnCompiler } from "@/components/learn/lesson-list";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { useIsFullScreen } from "@/lib/full-screen";
import { EASE, dur, gsap } from "@/lib/motion";
import { PANES, paneValue } from "@/lib/panes";
import { setPaneSize, usePaneSize } from "@/lib/pane-size";
import type { Course, LessonRef } from "@/lib/learn-types";

// The lesson list's width (0 when folded away), and the width it reopens at,
// both saved and applied before first paint (lib/panes.ts), folded included.
// Dragging it narrower than `collapseBelow` folds it away completely.
const SIDEBAR = { min: 208, max: PANES["learn-list"].max, initial: PANES["learn-list"].initial, collapseBelow: 150 };
// The list's width as CSS: the saved width, which the list and its frame
// follow whenever they aren't sliding.
const LIST_WIDTH = paneValue("learn-list");

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
 * it slides the docked sidebar out from the left edge (and back), on narrower
 * ones it opens the list as a drawer. Drag the sidebar's border to widen or
 * narrow it, or all the way left to fold it away. It lives in the learn
 * layout, so it stays put, scroll and all, while you move between lessons.
 */
export function LearnShell({
  lang,
  compiler,
  course,
  courses,
  children,
}: {
  /** The course: its routes and progress. */
  lang: string;
  /** The compiler page its programs run in, which it leads to: its own,
      or for a course whose lessons run in another's (Math), that one
      (lib/courses.ts compilerCourseOf). Null for a course whose lessons
      are all read lessons, which leads to the playground instead. */
  compiler: LearnCompiler | null;
  course: Course;
  /** Lessons in course order for every language that has a course. */
  courses: Record<string, LessonRef[]>;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const segments = pathname.split("/");
  const currentId = segments[3] ?? null;
  // The part you're on, counting from 0.
  const currentPart = Math.max(0, (Number(segments[4]) || 1) - 1);
  const lessons = course.sections.flatMap((s) => s.lessons);
  const index = lessons.findIndex((l) => l.id === currentId);
  const current = index >= 0 ? lessons[index] : null;
  const wide = useWide();
  // Full screen (laid out by the part, components/learn/part-view.tsx)
  // covers this frame, so the lesson list opens as the drawer from a
  // floating button then, on any screen.
  const full = useIsFullScreen();
  const floatingButtonRef = useRef<HTMLButtonElement>(null);

  const rowRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelButtonRef = useRef<HTMLButtonElement>(null);
  const sidebar = usePaneSize("learn-list");
  const reopenAt = usePaneSize("learn-list-open");
  const collapsed = sidebar === 0;

  const commit = (width: number) => {
    setPaneSize("learn-list", width);
    if (width) setPaneSize("learn-list-open", width);
  };
  // Back to following the saved width, once a slide or a drag is done.
  const settle = () => {
    if (asideRef.current) asideRef.current.style.width = LIST_WIDTH;
    if (listRef.current) {
      listRef.current.style.width = LIST_WIDTH;
      listRef.current.style.transform = "";
    }
  };

  // Lays the sidebar out `w` wide on its way from one width to another.
  // Folding and unfolding keep the list at its open width (`open`) and move
  // it with the border, so it slides out from the left edge and back.
  // Between two open widths the list simply matches the sidebar.
  const layOut = (w: number, from: number, to: number, open: number) => {
    const aside = asideRef.current;
    const list = listRef.current;
    if (!aside || !list) return;
    aside.style.width = `${w}px`;
    if (from === 0 || to === 0) {
      list.style.width = `${open}px`;
      list.style.transform = `translateX(${w - open}px)`;
    } else {
      list.style.width = `${w}px`;
      list.style.transform = "";
    }
  };
  const tween = useRef<gsap.core.Tween | null>(null);
  const folding = useRef(false);
  const slide = (from: number, to: number, open: number, done?: () => void) => {
    tween.current?.kill();
    const state = { w: from };
    layOut(from, from, to, open);
    tween.current = gsap.to(state, {
      w: to,
      duration: dur(to === 0 ? 0.28 : 0.32),
      ease: EASE.inOut,
      onUpdate: () => layOut(state.w, from, to, open),
      onComplete: () => {
        tween.current = null;
        settle();
        done?.();
      },
    });
  };

  // Set just before the width changes, so the layout effect below slides
  // from here instead of jumping.
  const slideFrom = useRef<number | null>(null);
  useLayoutEffect(() => {
    const from = slideFrom.current;
    slideFrom.current = null;
    if (from !== null && from !== sidebar) slide(from, sidebar, sidebar);
    // slide only touches refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebar]);

  const fold = () => {
    if (folding.current || !asideRef.current) return;
    folding.current = true;
    slide(asideRef.current.offsetWidth, 0, sidebar, () => {
      folding.current = false;
      commit(0);
    });
  };
  // Animates to a new width: folds away for 0, otherwise slides to it.
  const animateTo = (width: number) => {
    const next = clampWidth(width);
    if (next === 0) return fold();
    if (folding.current) {
      tween.current?.kill();
      folding.current = false;
    }
    slideFrom.current = collapsed ? 0 : (asideRef.current?.offsetWidth ?? sidebar);
    commit(next);
  };
  // Dragging follows the pointer exactly, except that folding away animates.
  const dragTo = (width: number) => {
    const next = clampWidth(width);
    if (next === 0) return collapsed ? undefined : fold();
    if (tween.current) {
      tween.current.kill();
      tween.current = null;
      folding.current = false;
    }
    commit(next);
    settle();
  };

  // Below the docking width (or in full screen) the list is a drawer,
  // closed on every move.
  const [drawer, setDrawer] = useState(false);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    if (wide && !full) setDrawer(false);
  }, [wide, full]);

  const shown = wide ? !collapsed : drawer;
  const togglePanel = () => {
    if (window.matchMedia(WIDE).matches) animateTo(collapsed ? reopenAt : 0);
    else setDrawer((open) => !open);
  };

  const listProps = { lang, compiler, course, currentId, currentPart, courses };

  return (
    <div data-learn-shell className="px-3 pt-2 pb-2 lg:h-[calc(100dvh-4rem-1px)] lg:overflow-hidden">
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
              className="-ml-1 inline-flex size-7 items-center justify-center rounded-btn text-ink-faint transition-colors hover:bg-raised hover:text-ink"
            >
              {/* Which icon depends on the screen: the docked sidebar opens
                  as you left it (folded or not, <html data-learn-list-folded>),
                  the drawer starts closed. CSS picks, so the first paint is
                  right on both. */}
              <span className="hidden xl:contents">
                <PanelLeftOpen className="learn-list-folded-only size-4" aria-hidden />
                <PanelLeftClose className="learn-list-open-only size-4" aria-hidden />
              </span>
              <span className="contents xl:hidden">
                {drawer ? <PanelLeftClose className="size-4" aria-hidden /> : <PanelLeftOpen className="size-4" aria-hidden />}
              </span>
            </button>
            <HistoryArrows />
            {current && (
              <span className="ml-2 hidden min-w-0 truncate text-xs text-ink-faint sm:inline">
                {course.title} · {current.section} · Lesson {index + 1} of {lessons.length}
                {current.parts.length > 1 && ` · Part ${currentPart + 1} of ${current.parts.length}`}
              </span>
            )}
          </span>
          {/* A course without a compiler page leads to the playground
              instead (React, Spring Boot, and the other project courses),
              with no sandbox badge, since its read lessons run nothing. One
              that runs in another's compiler (Math) shows that one's badge,
              so a missing Python says its size and how to add it. */}
          {compiler ? (
            <span className="flex shrink-0 items-center gap-2">
              {/* No room on phones; a run still reports sandbox problems. The
                  badge shows up once the sandbox answers, so it gets a slot as
                  wide as its longest label ("sandbox offline") in the server
                  markup, and nothing moves when it appears. */}
              <span className="hidden min-w-32 justify-end sm:flex">
                <SandboxStatus lang={compiler.slug} />
              </span>
              <CompilerButton lang={compiler.slug} langLabel={compiler.label} own={compiler.slug === lang} />
            </span>
          ) : (
            <CompilerButton lang={lang} langLabel={course.title} to="playground" className="shrink-0" />
          )}
        </div>

        <div ref={rowRef} className="flex min-h-0 flex-1">
          {!collapsed && (
            // Clipped, not scrollable: nothing (like scrolling the current
            // lesson into view) can shift the list sideways while it slides.
            <aside ref={asideRef} style={{ width: LIST_WIDTH }} className="hidden shrink-0 overflow-clip xl:flex">
              <div ref={listRef} style={{ width: LIST_WIDTH }} className="flex min-h-0 shrink-0 flex-col">
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
            className={`learn-list-handle hidden xl:flex ${collapsed ? "-mr-[9px] relative z-10" : ""}`}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
        </div>
      </section>

      <LessonDrawer
        {...listProps}
        open={drawer}
        onClose={closeDrawer}
        returnFocusTo={full ? floatingButtonRef : panelButtonRef}
        anyWidth={full}
      />
      <FloatingNav lessons={{ open: drawer, onToggle: () => setDrawer((open) => !open), buttonRef: floatingButtonRef }} />
    </div>
  );
}
