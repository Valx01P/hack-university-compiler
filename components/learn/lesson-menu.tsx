"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Menu as MenuIcon } from "lucide-react";
import { LessonList } from "@/components/learn/lesson-list";
import type { Course } from "@/lib/learn-types";

/**
 * The lesson plan behind a hamburger, for screens too narrow for the sidebar.
 * Opens on hover (or click/focus) like the compiler's language menu, portaled
 * and fixed under the trigger so the panel's overflow never clips it.
 */
export function LessonMenu({
  lang,
  langLabel,
  course,
  currentId,
}: {
  lang: string;
  langLabel: string;
  course: Course;
  currentId: string | null;
}) {
  const pathname = usePathname();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // When hover/focus last opened it, so the click of the same gesture does
  // not toggle it straight back closed.
  const openedAt = useRef(0);

  useEffect(() => setOpen(false), [pathname]);

  const openMenu = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: Math.max(8, r.left) });
    if (!open) openedAt.current = Date.now();
    setOpen(true);
  };
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 320);
  };

  useEffect(() => {
    if (!open) return;
    const onResize = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
        onFocus={openMenu}
        onBlur={scheduleClose}
        onClick={() => (open && Date.now() - openedAt.current > 400 ? setOpen(false) : openMenu())}
        className="flex shrink-0 items-center gap-1.5 rounded-btn text-xs font-medium uppercase tracking-wider text-ink-faint transition-colors hover:text-ink"
      >
        <MenuIcon className="size-3.5" aria-hidden />
        Lessons
        <ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open && pos && typeof document !== "undefined"
        ? createPortal(
            // Invisible hover buffer around the panel, like the language menu.
            <div
              style={{ top: pos.top, left: pos.left - 20 }}
              onMouseEnter={openMenu}
              onMouseLeave={scheduleClose}
              className="fixed z-[140] px-5 pb-5"
            >
              <div className="flex h-[min(38rem,calc(100dvh-6rem))] w-[min(20rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-card border border-edge bg-surface shadow-(--shadow-card)">
                <LessonList
                  lang={lang}
                  langLabel={langLabel}
                  course={course}
                  currentId={currentId}
                  onNavigate={() => setOpen(false)}
                />
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
