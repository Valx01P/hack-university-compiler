"use client";

import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { CompleteIcon, PendingIcon } from "@/components/learn/complete-icon";
import { CompilerButton } from "@/components/learn/compiler-button";
import { LessonMarkdown } from "@/components/learn/lesson-md";
import type { PartLink } from "@/components/learn/part-frame";
import { CopyableCodeBlock } from "@/components/ui/copyable-code-block";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { storeFor, WorkspaceView } from "@/components/ide/workspace-view";
import { Highlight } from "@/lib/highlight";
import type { CompilerLang } from "@/lib/compiler";
import type { WorkspacePartData, WorkspaceExampleView } from "@/lib/learn-workspace";
import { partHref, problemId, type Lesson } from "@/lib/learn-types";
import { markSolved, setLastLesson, useSolvedState } from "@/lib/learn-progress";
import { useEnter } from "@/lib/motion";
import { useFullScreen } from "@/lib/full-screen";
import { urlCount, urlParam, writeUrl } from "@/lib/url-state";

/**
 * A Learn part in the workspace format (architecture §8.1): the lesson
 * column as in every part, and the IDE where the editor was. The IDE's tabs
 * are the part's run examples and Your workspace, each its own workspace
 * (?tab=ex2, ex3, or code, as for single-file parts). Examples read in the
 * lesson column with no container: a tour's stops show the code they point
 * at, and a run example its commands and the transcript of what they print.
 * Check runs the part's hidden checks and lists each criterion in Results,
 * and the lesson column says how many pass. A pass marks the part solved.
 */

const SPLIT = { min: 25, max: 70, initial: 38 };
const session = { split: SPLIT.initial };
const CODE_BLOCK =
  "code-dark slim-scroll overflow-x-auto rounded-card border border-code-content-line bg-code-bg p-4 pr-16 font-mono text-[13px] leading-6 text-code-ink";
const PLACE_MARGIN = "scroll-mt-[calc(4rem+1rem)] lg:scroll-mt-4";
const NEXT_GLOW_MS = 3600;

function Prose({ md, className = "" }: { md: string; className?: string }) {
  return (
    <div className={`text-[0.95rem] leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 ${className}`}>
      <LessonMarkdown md={md} />
    </div>
  );
}

export function WorkspacePartView({
  lang,
  lesson,
  parts,
  part,
  step,
  data,
  position,
  prev,
  next,
  carryFrom = null,
}: {
  lang: CompilerLang;
  lesson: Pick<Lesson, "id" | "title" | "section" | "intro" | "recap">;
  parts: string[];
  part: number;
  step: { title: string; body: string };
  data: WorkspacePartData;
  position: { index: number; total: number };
  prev: PartLink | null;
  next: PartLink | null;
  /** The previous part's practice, when Continue with my code can bring it over. */
  carryFrom?: { scope: string; part: number } | null;
}) {
  const { solved } = useSolvedState(lang.slug);
  const isSolved = (i: number) => solved.has(problemId(lesson.id, i));
  const partSolved = isSolved(part);
  const complete = parts.every((_, i) => isSolved(i));
  const lastPart = part === parts.length - 1;
  const hasNav = Boolean(prev || next);
  // The tab shown: Your workspace unless the address picks an example.
  const firstTab = data.tabs[0]?.tab ?? "code";
  const [tab, setTab] = useState(firstTab === "" ? "" : "code");
  const active = data.tabs.find((t) => t.tab === tab) ?? data.tabs[data.tabs.length - 1];
  const [split, setSplitPct] = useState(session.split);
  const gridRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const [full] = useFullScreen();
  const [criteria, setCriteria] = useState<string | null>(null);
  const [nextGlow, setNextGlow] = useState(0);
  useEnter(articleRef);
  const uid = useId();

  // The address's tab, on load (the IDE is still hidden while it restores).
  useLayoutEffect(() => {
    const want = urlParam("tab");
    const found = data.tabs.find((t) => t.tab === want);
    if (found) setTab(found.tab);
    else if (!want && data.tabs.some((t) => t.tab === "")) setTab("");
    // Once, on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    writeUrl({ tab: tab || null });
  }, [tab]);
  useEffect(() => {
    setLastLesson(lang.slug, lesson.id, part + 1);
  }, [lang.slug, lesson.id, part]);
  useEffect(() => {
    if (!nextGlow) return;
    const timer = window.setTimeout(() => setNextGlow(0), NEXT_GLOW_MS);
    return () => window.clearTimeout(timer);
  }, [nextGlow]);

  const setSplit = (pct: number) => {
    const clamped = Math.min(SPLIT.max, Math.max(SPLIT.min, Math.round(pct)));
    session.split = clamped;
    setSplitPct(clamped);
  };

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const last = data.tabs.length - 1;
    const to = e.key === "ArrowRight" ? (i === last ? 0 : i + 1) : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (to < 0) return;
    e.preventDefault();
    setTab(data.tabs[to].tab);
    tabRefs.current.get(data.tabs[to].tab)?.focus();
  };

  const nextLabel = (link: PartLink) => `${link.lesson ? "Next lesson" : "Next"}: ${link.title}`;
  const tabs = (
    <div role="tablist" aria-label="Workspaces" className="flex shrink-0 items-center gap-1">
      {data.tabs.map((t, i) => {
        const selected = t.tab === active.tab;
        return (
          <button
            key={t.tab || "ex1"}
            ref={(el) => {
              if (el) tabRefs.current.set(t.tab, el);
            }}
            id={`${uid}-tab-${t.tab || "ex1"}`}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => setTab(t.tab)}
            onKeyDown={(e) => onTabKey(e, i)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-btn px-2.5 py-1 text-xs font-medium uppercase tracking-wider transition-colors ${
              selected ? "bg-highlight text-ink dark:text-gold" : "text-ink-faint hover:text-ink dark:hover:text-gold"
            }`}
          >
            {t.label}
            {t.tab === "code" &&
              (partSolved ? (
                <>
                  <CompleteIcon className="size-3" />
                  <span className="sr-only">(solved)</span>
                </>
              ) : (
                <PendingIcon className="size-3" current={selected} />
              ))}
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      ref={gridRef}
      data-workspace
      className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[var(--learn-split)_9px_minmax(0,1fr)] full:max-lg:overflow-y-auto full:max-lg:*:shrink-0"
      style={{ "--learn-split": `${split}%` } as React.CSSProperties}
    >
      <div className={`slim-scroll relative flex min-h-0 flex-col lg:overflow-y-auto ${hasNav ? "lg:scroll-pb-24 full:lg:scroll-pb-36" : ""}`}>
        <article ref={articleRef} className="mx-auto w-full max-w-[46rem] flex-1 px-5 pb-10 pt-6 sm:px-7">
          <p className="eyebrow">
            {lesson.section} ·{" "}
            <span className="whitespace-nowrap">
              Lesson {position.index + 1} of {position.total}
              <span className={`ml-1.5 inline-flex h-4 items-center align-top ${complete ? "" : "invisible"}`}>
                <CompleteIcon className="size-3.5" />
              </span>
            </span>
          </p>
          <h1 className="font-display mt-2 text-headline">{lesson.title}</h1>
          {parts.length > 1 && (
            <nav aria-label="Parts of this lesson" className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-faint">
                Part {part + 1} of {parts.length}
              </span>
              <ol className="flex flex-wrap items-center gap-1.5">
                {parts.map((title, i) => (
                  <li key={i}>
                    <Link
                      href={partHref(lang.slug, lesson.id, i + 1)}
                      aria-current={i === part ? "page" : undefined}
                      aria-label={`Part ${i + 1}: ${title}${isSolved(i) ? " (solved)" : ""}`}
                      title={title}
                      className={`inline-flex size-7 items-center justify-center rounded-full border text-xs font-medium transition-colors ${
                        i === part ? "border-ink text-ink dark:border-gold dark:text-gold" : "border-edge-strong/60 text-ink-muted hover:border-ink hover:text-ink"
                      }`}
                    >
                      {isSolved(i) ? <CompleteIcon className="size-5" /> : i + 1}
                    </Link>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          {part === 0 && <Prose md={lesson.intro} className="mt-4 text-ink-muted" />}
          <section className="mt-9">
            <h2 className="font-display text-title">{step.title}</h2>
            <Prose md={step.body} className="mt-3" />
            {data.examples.map((ex, i) => (
              <ExampleView key={i} example={ex} index={i} count={data.examples.length} onOpen={(t) => setTab(t)} />
            ))}
            <Practice
              data={data}
              solved={partSolved}
              criteria={criteria}
              onStart={() => setTab("code")}
              carry={
                carryFrom
                  ? {
                      part: carryFrom.part,
                      run: async () => {
                        const practice = data.tabs.find((t) => t.tab === "code");
                        if (!practice) return false;
                        setTab("code");
                        return (await storeFor(practice.props).carry(carryFrom.scope)) !== null;
                      },
                    }
                  : null
              }
            />
          </section>
          {lastPart && lesson.recap && (
            <section id="recap" className={`mt-12 border-t border-content-line pt-6 ${PLACE_MARGIN}`}>
              <p className="eyebrow">Lesson recap</p>
              <Prose md={lesson.recap} className="mt-3" />
            </section>
          )}
        </article>
        {hasNav && (
          <div className="pointer-events-none sticky bottom-0 z-10 flex justify-center bg-gradient-to-t from-surface from-40% to-transparent px-4 pt-8 pb-4 full:pb-16">
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
                  {nextGlow > 0 && <span key={nextGlow} aria-hidden className="next-glow pointer-events-none absolute -inset-px rounded-btn" />}
                  <span className="min-w-0 truncate">{nextLabel(next)}</span>
                  <ArrowRight className="size-4 shrink-0" aria-hidden />
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      <ResizeHandle
        label="Resize the lesson and the workspace"
        value={split}
        min={SPLIT.min}
        max={SPLIT.max}
        step={5}
        bigStep={10}
        onChange={setSplit}
        onDrag={(x) => {
          const r = gridRef.current?.getBoundingClientRect();
          if (r && r.width > 0) setSplit(((x - r.left) / r.width) * 100);
        }}
        onReset={() => setSplit(SPLIT.initial)}
        className="hidden lg:flex"
      />

      <div data-editor-pane className="flex h-[88dvh] min-h-[30rem] min-w-0 flex-col border-line lg:h-auto lg:min-h-0 lg:border-l-0" role="tabpanel" aria-labelledby={`${uid}-tab-${active.tab || "ex1"}`}>
        <WorkspaceView
          key={active.props.id}
          props={active.props}
          toolbarStart={tabs}
          toolbarEnd={full ? <CompilerButton lang={lang.slug} langLabel={lang.label} className="shrink-0" /> : null}
          next={next ? { href: next.href, label: nextLabel(next) } : null}
          onCheckDone={(passed, summary) => {
            setCriteria(summary);
            if (passed && active.tab === "code") {
              markSolved(lang.slug, problemId(lesson.id, part));
              setNextGlow((n) => n + 1);
            }
          }}
        />
      </div>
    </div>
  );
}

function ExampleView({ example, index, count, onOpen }: { example: WorkspaceExampleView; index: number; count: number; onOpen: (tab: string) => void }) {
  const id = index === 0 ? "example" : `example-${index + 1}`;
  return (
    <div id={id} className={`${index === 0 ? "mt-7" : "mt-8"} border-l-2 border-content-line pl-5 ${PLACE_MARGIN}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="eyebrow">
          {count > 1 ? `Example ${index + 1}` : "Example"}
          {example.kind === "tour" ? " · a code tour" : ""}
        </p>
        {example.kind === "run" && (
          <button type="button" onClick={() => onOpen(example.tab)} className="text-xs font-medium text-ink-muted transition-colors hover:text-ink dark:hover:text-gold">
            Open in its workspace →
          </button>
        )}
      </div>
      <h3 className="mt-1.5 font-medium text-ink">{example.title}</h3>
      {example.prompt && <Prose md={example.prompt} className="mt-1.5 text-ink-muted" />}
      {example.kind === "tour" ? (
        <ol className="mt-3 space-y-4">
          {example.stops.map((stop, i) => (
            <li key={i}>
              <p className="text-xs font-medium text-ink-faint">
                {i + 1}. <span className="font-mono">{stop.file}</span>
                {stop.line > 0 && <span className="font-mono">:{stop.line}</span>}
              </p>
              {stop.code && (
                <CopyableCodeBlock code={stop.code} language={stop.language} label={`Tour stop ${i + 1}`} className="mt-1.5" preClassName={CODE_BLOCK}>
                  <Highlight code={stop.code} language={stop.language} />
                </CopyableCodeBlock>
              )}
              <Prose md={stop.note} className="mt-1.5 text-sm text-ink-muted" />
            </li>
          ))}
        </ol>
      ) : (
        <>
          {example.run.length > 0 && (
            <>
              <p className="mt-4 text-xs font-medium text-ink-faint">It runs</p>
              <CopyableCodeBlock
                code={example.run.map((r) => (r.cmd ? `$ ${r.cmd}` : `# ${r.http}`)).join("\n")}
                label="What the example runs"
                className="mt-1.5"
                preClassName={CODE_BLOCK}
              />
            </>
          )}
          {example.transcript && example.transcript.length > 0 && (
            <>
              <p className="mt-4 text-xs font-medium text-ink-faint">What it prints</p>
              <CopyableCodeBlock
                code={example.transcript
                  .map((s) => (s.cmd ? `$ ${s.cmd}\n${s.output ?? ""}` : `${s.request ?? s.http ?? ""}\n\n${s.response ?? ""}`))
                  .join("\n")}
                label="The example's transcript"
                className="mt-1.5"
                preClassName={CODE_BLOCK}
              />
            </>
          )}
        </>
      )}
      {example.explanation && (
        <>
          <p className="mt-4 text-sm font-medium text-ink">How it works</p>
          <Prose md={example.explanation} className="mt-1 text-ink-muted" />
        </>
      )}
    </div>
  );
}

function Practice({
  data,
  solved,
  criteria,
  onStart,
  carry,
}: {
  data: WorkspacePartData;
  solved: boolean;
  criteria: string | null;
  onStart: () => void;
  carry: { part: number; run: () => Promise<boolean> } | null;
}) {
  const { practice } = data;
  const [hintsShown, setHintsShown] = useState(0);
  const [carried, setCarried] = useState<"idle" | "armed" | "busy" | "done">("idle");
  useLayoutEffect(() => {
    setHintsShown(urlCount("hints", practice.hints.length));
    // Once, on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    writeUrl({ hints: hintsShown ? String(hintsShown) : null });
  }, [hintsShown]);
  return (
    <div id="practice" className={`mt-8 border-l-2 border-content-line-strong pl-5 ${PLACE_MARGIN}`}>
      <p className="eyebrow">
        Your turn{" "}
        <span className={`whitespace-nowrap ${solved ? "" : "invisible"}`}>
          ·{" "}
          <span className="inline-flex items-center gap-1.5 align-top">
            <CompleteIcon className="size-3.5" />
            Solved
          </span>
        </span>
      </p>
      <h3 className="mt-1.5 font-medium text-ink">{practice.title}</h3>
      <Prose md={practice.prompt} className="mt-1.5" />
      {practice.contract.length > 0 && (
        <>
          <p className="mt-3 text-sm font-medium text-ink">The checks rely on</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-muted">
            {practice.contract.map((c, i) => (
              <li key={i}>
                <LessonMarkdown md={c} />
              </li>
            ))}
          </ul>
        </>
      )}
      {practice.acceptance.length > 0 && (
        <>
          <p className="mt-3 text-sm font-medium text-ink">Check looks for</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-muted">
            {practice.acceptance.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </>
      )}
      {/* Always laid out, so it never moves the page when a check lands. */}
      <p className={`mt-3 text-sm text-ink ${criteria ? "" : "invisible"}`} role="status">
        {criteria ?? "0 of 0 criteria pass"}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onStart} className="inline-grid rounded-btn border border-edge-strong px-3 py-1.5 text-xs font-medium btn-grad">
          <span className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 ${solved ? "invisible" : ""}`}>
            Open your workspace
            <ArrowRight className="size-3.5" aria-hidden />
          </span>
          <span className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 ${solved ? "" : "invisible"}`}>
            Back to your workspace
            <ArrowRight className="size-3.5" aria-hidden />
          </span>
        </button>
        {carry && carried !== "done" && (
          <button
            type="button"
            disabled={carried === "busy"}
            onClick={async () => {
              // Two clicks, like Show solution: it replaces this part's files.
              if (carried !== "armed") return setCarried("armed");
              setCarried("busy");
              setCarried((await carry.run()) ? "done" : "idle");
            }}
            onBlur={() => carried === "armed" && setCarried("idle")}
            className="rounded-btn px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-highlight hover:text-ink disabled:opacity-50"
          >
            {carried === "armed" ? "Click again: your part " + carry.part + " files replace these" : `Continue with my code from part ${carry.part}`}
          </button>
        )}
        {practice.hints.length > 0 && hintsShown < practice.hints.length && (
          <button
            type="button"
            onClick={() => setHintsShown((n) => n + 1)}
            className="rounded-btn px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-highlight hover:text-ink"
          >
            {hintsShown === 0 ? "Show a hint" : `Another hint (${hintsShown}/${practice.hints.length})`}
          </button>
        )}
      </div>
      {carried === "done" && (
        <p className="mt-3 text-sm text-ink-muted" role="status">
          Your code from part {carry?.part} is in your workspace (Undo is under the reset menu&apos;s save points). Check still expects what this part
          asks, from where it starts.
        </p>
      )}
      {hintsShown > 0 && (
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink-muted">
          {practice.hints.slice(0, hintsShown).map((h, i) => (
            <li key={i}>
              <Prose md={h} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
