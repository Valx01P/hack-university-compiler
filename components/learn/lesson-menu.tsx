"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Menu as MenuIcon } from "lucide-react";
import { LessonList } from "@/components/learn/lesson-list";
import type { Course, LessonRef } from "@/lib/learn-types";

/**
 * The lesson plan behind a hamburger, for screens too narrow for the sidebar.
 * Hover opens it like the compiler's language menu; click, Enter, Space and
 * ArrowDown toggle it, and from the keyboard focus moves to the current
 * lesson. The panel comes right after the button in the DOM, so Tab walks
 * into it, and it's fixed under the button so no overflow clips it. It closes
 * on Escape (focus goes back to the button), on a click, focus or page scroll
 * outside it, and on resize or navigation.
 */
export function LessonMenu({
  lang,
  langLabel,
  course,
  currentId,
  currentPart,
  courses,
}: {
  lang: string;
  langLabel: string;
  course: Course;
  currentId: string | null;
  currentPart: number;
  courses: Record<string, LessonRef[]>;
}) {
  const pathname = usePathname();
  const panelId = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // When hover last opened it, so the click of the same gesture does not
  // toggle it straight back closed.
  const openedAt = useRef(0);
  // The keyboard opened it: move focus in once the panel renders.
  const focusOnOpen = useRef(false);

  useEffect(() => setOpen(false), [pathname]);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const openMenu = () => {
    cancelClose();
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: Math.max(8, r.left) });
    if (!open) openedAt.current = Date.now();
    setOpen(true);
  };
  // Unless the pointer closed it, focus inside the panel goes back to the
  // button rather than dropping to the page when the panel unmounts.
  const close = (refocus = true) => {
    cancelClose();
    if (refocus && panelRef.current?.contains(document.activeElement)) btnRef.current?.focus({ preventScroll: true });
    setOpen(false);
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => close(false), 320);
  };

  // Focus the current lesson (or the first link): now if the panel is
  // showing, else as soon as it renders.
  const focusPanel = () => {
    const panel = panelRef.current;
    const target =
      panel?.querySelector<HTMLElement>('a[aria-current="page"]') ?? panel?.querySelector<HTMLElement>("a[href]");
    target?.focus({ preventScroll: true });
  };
  const focusIn = () => {
    if (panelRef.current) focusPanel();
    else focusOnOpen.current = true;
  };
  useEffect(() => {
    if (!open || !focusOnOpen.current) return;
    focusOnOpen.current = false;
    focusPanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Only the button and the panel count as inside: a click in the invisible
    // hover buffer around the panel closes it like any other outside click.
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !panelRef.current?.contains(t)) close(false);
    };
    // The panel stays where the button was, so a page scroll would leave it
    // behind. Scrolling the lesson list inside it is fine.
    const onScroll = (e: Event) => {
      if (!panelRef.current?.contains(e.target as Node)) close();
    };
    const onResize = () => close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    };
    // close only touches refs and state setters, so any render's copy works.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Focus moving to something outside (Tab, or a click on a control) closes
  // it. No relatedTarget means a click on plain content or leaving the
  // window; the pointerdown check above handles clicks outside.
  const onBlur = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (open && next && !wrapRef.current?.contains(next)) close(false);
  };

  return (
    <span ref={wrapRef} onBlur={onBlur} className="contents">
      <button
        ref={btnRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
        onClick={(e) => {
          if (open && Date.now() - openedAt.current > 400) return close(false);
          openMenu();
          // Enter or Space (a click with no pointer) moves focus in too.
          if (e.detail === 0) focusIn();
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown") return;
          e.preventDefault();
          openMenu();
          focusIn();
        }}
        className="flex shrink-0 items-center gap-1.5 rounded-btn text-xs font-medium uppercase tracking-wider text-ink-faint transition-colors hover:text-ink"
      >
        <MenuIcon className="size-3.5" aria-hidden />
        Lessons
        <ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open && pos && (
        // Invisible hover buffer around the panel, like the language menu.
        <div
          style={{ top: pos.top, left: pos.left - 20 }}
          onMouseEnter={openMenu}
          onMouseLeave={scheduleClose}
          className="fixed z-[140] px-5 pb-5"
        >
          <div
            ref={panelRef}
            id={panelId}
            // Focusable, so a click on plain content keeps focus inside.
            tabIndex={-1}
            className="flex h-[min(38rem,calc(100dvh-6rem))] w-[min(20rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-card border border-edge bg-surface shadow-(--shadow-card)"
          >
            <LessonList
              lang={lang}
              langLabel={langLabel}
              course={course}
              currentId={currentId}
              currentPart={currentPart}
              courses={courses}
              onNavigate={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </span>
  );
}
