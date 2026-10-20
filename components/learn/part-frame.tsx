"use client";

import Link from "next/link";
import { useEffect, useRef, type RefObject } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { LessonMarkdown, type RunnableContext } from "@/components/learn/lesson-md";
import { CompleteIcon } from "@/components/learn/complete-icon";
import { partHref } from "@/lib/learn-types";
import { writeHash } from "@/lib/url-state";

/**
 * What every kind of part shares (components/learn/part-view.tsx and
 * read-part-view.tsx): its heading and part numbers, the floating Previous
 * and Next, lesson prose, and its place in the address.
 */

/** Where Previous or Next goes: another part of this lesson, or a lesson. */
export interface PartLink {
  href: string;
  title: string;
  lesson: boolean;
}

// Where #example (and #example-2, #example-3), #practice, and #recap land:
// clear of the sticky header when the page scrolls, a little below the top
// of the lesson column.
export const PLACE_MARGIN = "scroll-mt-[calc(4rem+1rem)] lg:scroll-mt-4";
export const CODE_BLOCK =
  "code-dark slim-scroll overflow-x-auto rounded-card border border-code-content-line bg-code-bg p-4 pr-16 font-mono text-[13px] leading-6 text-code-ink";
// Where each example sits in the part: #example, then #example-2 and
// #example-3.
export const exampleId = (i: number) => (i === 0 ? "example" : `example-${i + 1}`);

export const nextLabel = (link: PartLink) => `${link.lesson ? "Next lesson" : "Next"}: ${link.title}`;

/** Lesson markdown with the outer margins trimmed, for use inside cards. */
export function Prose({ md, className = "", runnable }: { md: string; className?: string; runnable?: RunnableContext }) {
  return (
    <div className={`text-[0.95rem] leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 ${className}`}>
      <LessonMarkdown md={md} runnable={runnable} />
    </div>
  );
}

/** The section, the lesson's place in the course, and its complete mark. */
export function LessonEyebrow({
  section,
  position,
  complete,
}: {
  section: string;
  position: { index: number; total: number };
  complete: boolean;
}) {
  return (
    <p className="eyebrow">
      {section} ·{" "}
      {/* The complete mark is always laid out (shown once complete), so it
          never moves the page, and it can't wrap onto a line of its own:
          a long eyebrow wraps before "Lesson". */}
      <span className="whitespace-nowrap">
        Lesson {position.index + 1} of {position.total}
        <span className={`ml-1.5 inline-flex h-4 items-center align-top ${complete ? "" : "invisible"}`}>
          <CompleteIcon className="size-3.5" />
        </span>
      </span>
      {complete && <span className="sr-only"> · Complete</span>}
    </p>
  );
}

/** Every part of the lesson as a numbered circle, the one you're on ringed
    and the done ones checked. Nothing for a lesson of one part. */
export function PartNumbers({
  lang,
  lessonId,
  parts,
  part,
  isDone,
  doneLabel = "solved",
}: {
  lang: string;
  lessonId: string;
  parts: string[];
  part: number;
  isDone: (i: number) => boolean;
  /** What a done part is called for screen readers. */
  doneLabel?: string;
}) {
  if (parts.length < 2) return null;
  return (
    <nav aria-label="Parts of this lesson" className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-xs font-medium uppercase tracking-wider text-ink-faint">
        Part {part + 1} of {parts.length}
      </span>
      <ol className="flex flex-wrap items-center gap-1.5">
        {parts.map((title, i) => {
          const here = i === part;
          const done = isDone(i);
          return (
            <li key={i}>
              <Link
                href={partHref(lang, lessonId, i + 1)}
                aria-current={here ? "page" : undefined}
                aria-label={`Part ${i + 1}: ${title}${done ? ` (${doneLabel})` : ""}`}
                title={title}
                className={`inline-flex size-7 items-center justify-center rounded-full border text-xs font-medium transition-colors ${
                  here
                    ? "border-ink text-ink dark:border-gold dark:text-gold"
                    : "border-edge-strong/60 text-ink-muted hover:border-ink hover:text-ink"
                }`}
              >
                {/* Same size solved or not, so nothing moves when progress loads. */}
                {done ? <CompleteIcon className="size-5" /> : i + 1}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * The shade along the bottom of a part, under its floating Previous and Next:
 * the whole width of the workspace on wide screens (the lesson, the editor,
 * and the output), so the nav reads over whatever scrolls under it. Phones
 * scroll the page instead, so there the nav's own bar carries it. The theme
 * menu's Bottom shade switch turns both off (globals.css). Place it inside a
 * part's [data-workspace].
 */
export function LearnShade() {
  return (
    <div
      aria-hidden
      className="learn-shade pointer-events-none absolute inset-x-0 bottom-0 z-[5] hidden h-28 bg-gradient-to-t from-surface from-25% to-transparent lg:block"
    />
  );
}

/**
 * Floating nav through the parts, then on to the next lesson: only Next at
 * the very start of the course, only Previous at its end. In full screen it
 * sits above the floating buttons in the corners. Next glows for a while
 * each time `glow` counts up (a passing Check).
 */
export function PartNav({ prev, next, glow = 0 }: { prev: PartLink | null; next: PartLink | null; glow?: number }) {
  if (!prev && !next) return null;
  return (
    <div className="learn-shade-nav pointer-events-none sticky bottom-0 z-10 flex justify-center px-4 pt-8 pb-4 max-lg:bg-gradient-to-t max-lg:from-surface max-lg:from-40% max-lg:to-transparent full:pb-16">
      <div className="pointer-events-auto flex max-w-full items-center gap-1.5 rounded-card border border-line bg-surface p-1.5 shadow-(--shadow-card)">
        {prev && (
          <Link
            href={prev.href}
            aria-label={`${prev.lesson ? "Previous lesson" : "Previous part"}: ${prev.title}`}
            title={prev.title}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-btn px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-highlight hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Previous
          </Link>
        )}
        {next && (
          <Link
            href={next.href}
            aria-label={nextLabel(next)}
            title={next.title}
            className="relative inline-flex min-w-0 items-center gap-1.5 rounded-btn border border-line-strong px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-highlight"
          >
            {glow > 0 && <span key={glow} aria-hidden className="next-glow pointer-events-none absolute -inset-px rounded-btn" />}
            <span className="min-w-0 truncate">{nextLabel(next)}</span>
            <ArrowRight className="size-4 shrink-0" aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * Where you are in the part, kept in the address as its #fragment
 * (lib/url-state.ts): the block of `places` at the top of the view (the
 * lesson column scrolls on wide screens, the page below that). `trackPlace`
 * follows your scrolling (the page's scroll is followed for you, the
 * column's needs its onScroll). `goToPlace` goes back there after a reload,
 * which doesn't scroll the column to the #fragment (the browser restores its
 * old scroll instead).
 */
export function usePartPlace(places: string[], columnRef: RefObject<HTMLDivElement | null>) {
  const placeFrame = useRef(0);
  const lastPlace = useRef<string | null>(null);

  function trackPlace() {
    if (placeFrame.current) return;
    placeFrame.current = requestAnimationFrame(() => {
      placeFrame.current = 0;
      const column = columnRef.current;
      const inColumn = column !== null && getComputedStyle(column).overflowY === "auto";
      const top = inColumn ? column.getBoundingClientRect().top : 64;
      const bottom = inColumn ? column.getBoundingClientRect().bottom : window.innerHeight;
      // Scrolled all the way down, the last block that shows is the place,
      // even when it can't reach the top.
      const atEnd = inColumn
        ? column.scrollTop > 0 && column.scrollTop + column.clientHeight >= column.scrollHeight - 2
        : window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      let at = "";
      for (const id of places) {
        const el = document.getElementById(id);
        if (!el) continue;
        const elTop = el.getBoundingClientRect().top;
        if (elTop - 32 <= top || (atEnd && elTop < bottom)) at = id;
      }
      if (lastPlace.current === null) lastPlace.current = window.location.hash.slice(1);
      if (at === lastPlace.current) return;
      lastPlace.current = at;
      writeHash(at);
    });
  }
  useEffect(() => {
    window.addEventListener("scroll", trackPlace, { passive: true });
    return () => {
      window.removeEventListener("scroll", trackPlace);
      cancelAnimationFrame(placeFrame.current);
      placeFrame.current = 0;
    };
    // trackPlace only reads refs and the DOM.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goToPlace() {
    const place = window.location.hash.slice(1);
    const target = places.includes(place) ? document.getElementById(place) : null;
    const column = columnRef.current;
    if (target && column && getComputedStyle(column).overflowY === "auto") {
      column.scrollTop += target.getBoundingClientRect().top - column.getBoundingClientRect().top - 16;
    } else if (target) {
      window.scrollTo(0, window.scrollY + target.getBoundingClientRect().top - 80);
    }
  }

  return { trackPlace, goToPlace };
}
