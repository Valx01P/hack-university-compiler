"use client";

import type { RefObject } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { HistoryArrows } from "@/components/chrome/history-arrows";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Full screen covers the top bar, so its controls float in the bottom
 * corners: back and forward beside the theme button at the right, and in
 * Learn the lesson list at the left (it opens as the drawer, over the full
 * screen workspace). Its first step only hides the header, where the theme
 * button lives, so then the theme button floats alone: the page's own bar
 * still has back and forward, and Learn's lesson list stays where it is.
 * Pages render it all the time, and globals.css shows it only with <html
 * data-full> (all of it) or <html data-semi> (the theme button), so it's
 * there from the first paint.
 */
export function FloatingNav({
  lessons,
}: {
  lessons?: { open: boolean; onToggle: () => void; buttonRef: RefObject<HTMLButtonElement | null> };
}) {
  return (
    <>
      {lessons && (
        <button
          ref={lessons.buttonRef}
          data-floating-nav="full"
          type="button"
          onClick={lessons.onToggle}
          aria-expanded={lessons.open}
          aria-label={lessons.open ? "Hide the lesson list" : "Show the lesson list"}
          title={lessons.open ? "Hide the lesson list" : "Show the lesson list"}
          className="fixed bottom-4 left-4 z-[120] inline-flex size-10 items-center justify-center rounded-full border border-line bg-surface text-ink-muted shadow-(--shadow-card) transition-colors hover:text-ink"
        >
          {lessons.open ? <PanelLeftClose className="size-4" aria-hidden /> : <PanelLeftOpen className="size-4" aria-hidden />}
        </button>
      )}
      <div data-floating-nav className="fixed bottom-4 right-4 z-[120] flex items-center gap-2">
        <div
          data-floating-nav="full"
          className="flex h-10 items-center gap-0.5 rounded-full border border-line bg-surface px-1 shadow-(--shadow-card)"
        >
          <HistoryArrows round />
        </div>
        <ThemeToggle floating />
      </div>
    </>
  );
}
