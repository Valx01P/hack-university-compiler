"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { CopyableCodeBlock } from "@/components/ui/copyable-code-block";
import { CompilerButton } from "@/components/learn/compiler-button";
import {
  CODE_BLOCK,
  LessonEyebrow,
  PLACE_MARGIN,
  LearnShade,
  PartNav,
  PartNumbers,
  Prose,
  exampleId,
  usePartPlace,
  type PartLink,
} from "@/components/learn/part-frame";
import type { DiagramData } from "@/lib/diagram.mjs";
import { Highlight } from "@/lib/highlight";
import { problemId, type ReadExample, type ReadLesson, type ReadStep } from "@/lib/learn-types";
import { markSolved, setLastLesson, useSolvedState } from "@/lib/learn-progress";
import { useEnter } from "@/lib/motion";
import { FULL_SCREEN_TITLE, useFullScreen } from "@/lib/full-screen";
import { revealWorkspace } from "@/lib/url-state";

/**
 * One part of a read lesson: the lesson column alone, centered, with no
 * editor. Its examples are code to look at in their own language, never
 * run, each with the output it really printed when it has one, and its
 * prose draws the diagrams it names (components/learn/diagram.tsx).
 * Opening a part is reading it: it counts as done in your progress, and the
 * lesson is complete once every part has been opened.
 */
export function ReadPartView({
  course,
  compiler,
  lesson,
  parts,
  part,
  step,
  position,
  prev,
  next,
  diagrams,
}: {
  course: { slug: string; label: string };
  /** Whether the course has a compiler page to go back to. */
  compiler: boolean;
  lesson: Pick<ReadLesson, "id" | "title" | "section" | "intro" | "recap">;
  /** Every part's title, in order. */
  parts: string[];
  /** This part, counting from 0. */
  part: number;
  step: ReadStep;
  position: { index: number; total: number };
  prev: PartLink | null;
  next: PartLink | null;
  /** The diagrams this part shows, by name (lib/learn.ts getPartDiagrams). */
  diagrams: Record<string, DiagramData>;
}) {
  // Saved progress is empty in the server markup and the hydration render,
  // like on other parts. This part counts as read from the first paint,
  // since opening it is what reads it.
  const { solved } = useSolvedState(course.slug);
  const isDone = (i: number) => i === part || solved.has(problemId(lesson.id, i));
  const complete = parts.every((_, i) => isDone(i));
  const lastPart = part === parts.length - 1;
  const hasNav = Boolean(prev || next);
  const { examples } = step;

  useEffect(() => {
    markSolved(course.slug, problemId(lesson.id, part));
    setLastLesson(course.slug, lesson.id, part + 1);
  }, [course.slug, lesson.id, part]);

  // Moving to another part fades the new one in (never on first paint).
  const articleRef = useRef<HTMLElement>(null);
  useEnter(articleRef);

  // Full screen, the same one every other part and the compiler use.
  const [full, stepFull, screenMode] = useFullScreen();

  // The address keeps your place (lib/url-state.ts): #example, #example-2,
  // #example-3, or #recap. A reload goes back to it on the next frame, then
  // shows the page the bootstrap in app/layout.tsx kept hidden meanwhile.
  const places = [...examples.map((_, i) => exampleId(i)), "recap"];
  const columnRef = useRef<HTMLDivElement>(null);
  const { trackPlace, goToPlace } = usePartPlace(places, columnRef);
  useLayoutEffect(() => {
    requestAnimationFrame(() => {
      goToPlace();
      const html = document.documentElement;
      if (html.hasAttribute("data-restore") || html.hasAttribute("data-restore-editor")) revealWorkspace();
    });
    // Once, on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div data-workspace className="flex min-h-0 flex-1 flex-col lg:relative full:max-lg:overflow-y-auto full:max-lg:*:shrink-0">
      {hasNav && <LearnShade />}
      {/* The column fills the panel and scrolls on wide screens, and the page
          scrolls below that, as on other parts. */}
      <div
        ref={columnRef}
        onScroll={trackPlace}
        className={`slim-scroll relative flex min-h-0 flex-col lg:flex-1 lg:overflow-y-auto ${hasNav ? "lg:scroll-pb-24 full:lg:scroll-pb-36" : ""}`}
      >
        <article
          ref={articleRef}
          className={`mx-auto w-full max-w-[46rem] flex-1 px-5 pb-10 pt-6 sm:px-7 ${
            hasNav ? "max-lg:[&_:is(a,button,pre,[tabindex])]:scroll-mb-24 full:max-lg:[&_:is(a,button,pre,[tabindex])]:scroll-mb-36" : ""
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <LessonEyebrow section={lesson.section} position={position} complete={complete} />
            {/* Full screen's corner icon, which other parts keep in the
                editor's toolbar. Full screen covers the top bar, so the way
                to the compiler (or the playground, for a course without
                one) joins it then. */}
            <span className="-my-2 -mr-2 hidden shrink-0 items-center gap-1 lg:flex">
              <span className="hidden full:contents">
                <CompilerButton lang={course.slug} langLabel={course.label} to={compiler ? "compiler" : "playground"} className="shrink-0" />
              </span>
              <button
                type="button"
                onClick={stepFull}
                title={FULL_SCREEN_TITLE[screenMode]}
                aria-label="Toggle full screen"
                aria-pressed={screenMode === "full" ? true : screenMode === "semi" ? "mixed" : false}
                className="inline-flex size-8 items-center justify-center rounded-btn text-ink-muted transition-colors hover:bg-raised hover:text-ink"
              >
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                </svg>
              </button>
            </span>
          </div>
          <h1 className="font-display mt-2 text-headline">{lesson.title}</h1>

          <PartNumbers lang={course.slug} lessonId={lesson.id} parts={parts} part={part} isDone={isDone} doneLabel="read" />

          {part === 0 && <Prose md={lesson.intro} diagrams={diagrams} className="mt-4 text-ink-muted" />}

          <section className="mt-9">
            <h2 className="font-display text-title">{step.title}</h2>
            <Prose md={step.body} diagrams={diagrams} className="mt-3" />
            {examples.map((example, i) => (
              <ReadExampleBlock key={i} example={example} index={i} count={examples.length} diagrams={diagrams} />
            ))}
          </section>

          {lastPart && lesson.recap && (
            <section id="recap" className={`mt-12 border-t border-content-line pt-6 ${PLACE_MARGIN}`}>
              <p className="eyebrow">Lesson recap</p>
              <Prose md={lesson.recap} diagrams={diagrams} className="mt-3" />
            </section>
          )}
        </article>

        <PartNav prev={prev} next={next} />
      </div>
    </div>
  );
}

/** A read part's example: what to look at (and where the file lives, in
    its prompt), its code, what it printed (when it was run), and why it's
    written that way. */
function ReadExampleBlock({
  example,
  index,
  count,
  diagrams,
}: {
  example: ReadExample;
  index: number;
  count: number;
  diagrams: Record<string, DiagramData>;
}) {
  return (
    <div id={exampleId(index)} className={`${index === 0 ? "mt-7" : "mt-8"} border-l-2 border-content-line pl-5 ${PLACE_MARGIN}`}>
      <p className="eyebrow">{count > 1 ? `Example ${index + 1}` : "Example"}</p>
      <h3 className="mt-1.5 font-medium text-ink">{example.title}</h3>
      <Prose md={example.prompt} diagrams={diagrams} className="mt-1.5 text-ink-muted" />
      <CopyableCodeBlock
        code={example.code}
        language={example.language}
        label="Example code"
        className="mt-3"
        preClassName={CODE_BLOCK}
      >
        <Highlight code={example.code} language={example.language} />
      </CopyableCodeBlock>
      {/* Shown like an example's output on other parts: a terminal block you
          can copy. */}
      {example.output ? (
        <>
          <p className="mt-4 text-xs font-medium text-ink-faint">Output</p>
          <CopyableCodeBlock code={example.output} label="Example output" className="mt-1.5" preClassName={CODE_BLOCK} />
        </>
      ) : null}
      <p className="mt-4 text-sm font-medium text-ink">How it works</p>
      <Prose md={example.explanation} diagrams={diagrams} className="mt-1 text-ink-muted" />
    </div>
  );
}
