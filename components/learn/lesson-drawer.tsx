"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { LessonList, type LearnCompiler } from "@/components/learn/lesson-list";
import { EASE, dur, gsap } from "@/lib/motion";
import type { Course, LessonRef } from "@/lib/learn-types";
import { PANES } from "@/lib/panes";

const DRAWER_WIDTH = `min(${PANES["learn-list"].max}px, calc(100vw - 3rem))`;

/**
 * The lesson plan as a drawer, for screens too narrow to dock the sidebar
 * (and for full screen, which covers the sidebar: `anyWidth`).
 * The panel button opens it and it slides in from the left over a dimmed
 * page. Focus moves to the lesson you're on and stays inside while it's
 * open. Escape, the close button, a click on the page, or picking a lesson
 * closes it, and focus goes back to the panel button.
 */
export function LessonDrawer({
  open,
  onClose,
  returnFocusTo,
  anyWidth = false,
  ...listProps
}: {
  open: boolean;
  onClose: () => void;
  returnFocusTo: RefObject<HTMLElement | null>;
  /** Shown on wide screens too. */
  anyWidth?: boolean;
  lang: string;
  compiler: LearnCompiler | null;
  course: Course;
  currentId: string | null;
  currentPart: number;
  courses: Record<string, LessonRef[]>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(open);
  if (open && !rendered) setRendered(true);
  const was = useRef(open);

  useLayoutEffect(() => {
    if (was.current === open) return;
    was.current = open;
    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    if (!panel || !backdrop) return;
    if (open) {
      gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: dur(0.2), ease: EASE.out, overwrite: true });
      gsap.fromTo(panel, { xPercent: -100 }, { xPercent: 0, duration: dur(0.32), ease: EASE.slide, overwrite: true });
      const target =
        panel.querySelector<HTMLElement>('a[aria-current="page"]') ?? panel.querySelector<HTMLElement>("a[href], button");
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "center" });
    } else {
      if (panel.contains(document.activeElement)) returnFocusTo.current?.focus({ preventScroll: true });
      gsap.to(backdrop, { opacity: 0, duration: dur(0.18), ease: EASE.in, overwrite: true });
      gsap.to(panel, {
        xPercent: -100,
        duration: dur(0.22),
        ease: EASE.in,
        overwrite: true,
        onComplete: () => setRendered(false),
      });
    }
  }, [open, returnFocusTo]);

  // While it's open: Escape closes it, and the page behind doesn't scroll.
  useEffect(() => {
    if (!open) return;
    // Escape in a popup opened from the drawer (like a confirm) closes just
    // that popup.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target instanceof Element && e.target.closest("[data-editor-overlay]"))) onClose();
    };
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Tab and Shift+Tab wrap around inside the drawer.
  const trapFocus = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !panelRef.current) return;
    const items = [...panelRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")].filter(
      (el) => el.offsetParent !== null
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!open && !rendered) return null;
  return createPortal(
    <div className={`fixed inset-0 z-[130] ${anyWidth ? "" : "xl:hidden"}`} onKeyDown={trapFocus}>
      <div ref={backdropRef} onClick={onClose} className="absolute inset-0 bg-black/40" aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${listProps.course.title} lessons`}
        // As wide as the docked list at its widest (lib/panes.ts), leaving a
        // strip of the page to tap on a phone.
        style={{ width: DRAWER_WIDTH }}
        className="absolute inset-y-0 left-0 flex flex-col border-r border-line bg-surface shadow-(--shadow-card)"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the lesson list"
          title="Close the lesson list"
          className="absolute right-2 top-2 z-10 inline-flex size-7 items-center justify-center rounded-btn text-ink-faint transition-colors hover:bg-raised hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
        <LessonList {...listProps} onNavigate={onClose} closeButton />
      </div>
    </div>,
    document.body
  );
}
