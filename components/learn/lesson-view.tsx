"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { CmEditor } from "@/components/code/cm-editor";
import { EditorSettingsButton } from "@/components/code/editor-settings";
import { CodeThemePicker } from "@/components/code/code-theme";
import { ResetCodeButton } from "@/components/code/reset-code-button";
import { OutputPanel } from "@/components/compiler/output-panel";
import { runSummary, useReturnFocus } from "@/components/compiler/run-feedback";
import { CopyableCodeBlock } from "@/components/ui/copyable-code-block";
import { ScrollPre } from "@/components/ui/scroll-pre";
import { LessonMarkdown } from "@/components/learn/lesson-md";
import { CompleteIcon, PendingIcon } from "@/components/learn/complete-icon";
import { CheckResults, checkSummary, type CheckState } from "@/components/learn/check-results";
import { Highlight } from "@/lib/highlight";
import type { CompilerLang } from "@/lib/compiler";
import { problemId, type Lesson, type LessonMeta } from "@/lib/learn-types";
import { clearCode, loadCode, markSolved, saveCode, setLastLesson, useSolvedState } from "@/lib/learn-progress";
import { normalizeOutput, refreshSandboxStatus, runInSandbox, type RunState } from "@/lib/run-code";

type Tab = { kind: "example" | "practice"; step: number };
type Panel = { mode: "run"; run: RunState } | { mode: "check"; check: CheckState };

const tabKey = (t: Tab) => `${t.kind}-${t.step}`;
const CODE_BLOCK =
  "code-dark slim-scroll overflow-x-auto rounded-card border border-code-edge bg-code-bg p-4 pr-16 font-mono text-[13px] leading-6 text-code-ink";
const PLAIN_BLOCK =
  "slim-scroll mt-1.5 overflow-x-auto rounded-card border border-edge bg-raised px-4 py-3 font-mono text-[13px] leading-6 text-ink";

/** Lesson markdown with the outer margins trimmed, for use inside cards. */
function Prose({ md, className = "" }: { md: string; className?: string }) {
  return (
    <div className={`text-[0.95rem] leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 ${className}`}>
      <LessonMarkdown md={md} />
    </div>
  );
}

/**
 * One lesson in Learn mode: the tutorial on the left (steps, worked examples,
 * practice problems) and the editor on the right, with a tab per example and
 * per practice problem. Examples run and can be edited and reset. Practice
 * problems are checked by running the code against each test.
 */
export function LessonView({
  lang,
  lesson,
  position,
  prev,
  next,
}: {
  lang: CompilerLang;
  lesson: Lesson;
  position: { index: number; total: number };
  prev: LessonMeta | null;
  next: LessonMeta | null;
}) {
  // Empty in the server markup and the hydration render (the server can't
  // see your progress), so everything that shows progress keeps the same size
  // either way: a reload never shifts. A lesson reached by a client-side
  // navigation renders your progress from its first frame.
  const { solved } = useSolvedState(lang.slug);
  const isSolved = (step: number) => solved.has(problemId(lesson.id, step));
  const complete = lesson.steps.every((_, i) => isSolved(i));
  const tabs: Tab[] = lesson.steps.flatMap((_, step) => [
    { kind: "example" as const, step },
    { kind: "practice" as const, step },
  ]);
  const many = lesson.steps.length > 1;
  const hasNav = Boolean(prev || next);

  const defaultCode = (t: Tab) =>
    t.kind === "example" ? lesson.steps[t.step].example.code : lesson.steps[t.step].practice.starter;
  const defaultStdin = (t: Tab) =>
    t.kind === "example" ? lesson.steps[t.step].example.stdin ?? "" : lesson.steps[t.step].practice.tests[0]?.stdin ?? "";

  const [active, setActive] = useState<Tab>({ kind: "example", step: 0 });
  // Your code per tab, read while initializing (CodeMirror mounts client-side,
  // so the server markup never depends on it).
  const [codes, setCodes] = useState<Record<string, string>>(() =>
    Object.fromEntries(tabs.map((t) => [tabKey(t), loadCode(lang.slug, lesson.id, tabKey(t), defaultCode(t))]))
  );
  const [stdins, setStdins] = useState<Record<string, string>>(() =>
    Object.fromEntries(tabs.map((t) => [tabKey(t), defaultStdin(t)]))
  );
  const [showStdin, setShowStdin] = useState(() => defaultStdin(active) !== "");
  const [panels, setPanels] = useState<Record<string, Panel>>({});
  // The tab whose run or check is in flight. Runs go one at a time, but only
  // that tab's buttons say "Running…" or "Checking…".
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const busy = busyKey !== null;
  // What a screen reader hears when a run or check ends.
  const [announcement, setAnnouncement] = useState("");
  // Hands keyboard focus back to Run or Check once the run is over.
  const rememberRunButton = useReturnFocus(busy);
  const editorRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const uid = useId();
  const tabId = (t: Tab) => `${uid}-tab-${tabKey(t)}`;
  const panelId = `${uid}-panel`;
  const stdinId = `${uid}-stdin`;
  const outputId = `${uid}-output`;

  const key = tabKey(active);
  const code = codes[key];
  const stdin = stdins[key];
  const panel: Panel = panels[key] ?? { mode: "run", run: { status: "idle" } };

  useEffect(() => {
    setLastLesson(lang.slug, lesson.id);
  }, [lang.slug, lesson.id]);

  // Keep the selected tab in view inside the scrolling tab strip (scrollLeft
  // only: scrollIntoView could also scroll the page).
  useEffect(() => {
    const strip = stripRef.current;
    const tab = tabRefs.current[key];
    if (!strip || !tab) return;
    const room = parseFloat(getComputedStyle(strip).paddingLeft) || 0;
    const s = strip.getBoundingClientRect();
    const r = tab.getBoundingClientRect();
    if (r.left < s.left + room) strip.scrollLeft -= s.left + room - r.left;
    else if (r.right > s.right - room) strip.scrollLeft += r.right - (s.right - room);
  }, [key]);

  function openTab(t: Tab, { scroll = true }: { scroll?: boolean } = {}) {
    setActive(t);
    setShowStdin(stdins[tabKey(t)] !== "");
    // On narrow screens the editor sits below the lesson: bring it into view,
    // below the sticky header (the column's scroll margin).
    if (scroll && window.innerWidth < 1024) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      editorRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  }

  // Arrow keys, Home and End move between tabs (and open them), so the strip
  // is a single tab stop.
  function onTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, i: number) {
    const last = tabs.length - 1;
    const to =
      e.key === "ArrowRight" ? (i === last ? 0 : i + 1)
      : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : -1;
    if (to < 0) return;
    e.preventDefault();
    openTab(tabs[to], { scroll: false });
    tabRefs.current[tabKey(tabs[to])]?.focus();
  }

  function updateCode(next: string) {
    setCodes((c) => ({ ...c, [key]: next }));
    // Code that matches the original isn't saved, so a reset (whose new value
    // comes back through here) really clears the tab, and a later fix to the
    // example or starter still reaches you.
    if (next === defaultCode(active)) clearCode(lang.slug, lesson.id, key);
    else saveCode(lang.slug, lesson.id, key, next);
  }

  function resetTab() {
    setCodes((c) => ({ ...c, [key]: defaultCode(active) }));
    setStdins((s) => ({ ...s, [key]: defaultStdin(active) }));
    setPanels((p) => ({ ...p, [key]: { mode: "run", run: { status: "idle" } } }));
    clearCode(lang.slug, lesson.id, key);
  }

  const setPanel = (k: string, p: Panel) => setPanels((all) => ({ ...all, [k]: p }));

  /** Start a run or check from its button. */
  function begin(k: string, e: React.MouseEvent<HTMLButtonElement>) {
    rememberRunButton(e);
    setBusyKey(k);
    setAnnouncement("");
    // Below lg the output can sit under the fold (a phone in landscape, where
    // the editor keeps its minimum height): bring it into view so the run
    // shows up.
    if (window.innerWidth < 1024) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      outputRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
    }
  }

  async function run(e: React.MouseEvent<HTMLButtonElement>) {
    if (busy) return;
    const k = key;
    begin(k, e);
    setPanel(k, { mode: "run", run: { status: "running" } });
    const result = await runInSandbox(lang.slug, code, stdin);
    const done: RunState = result.ok ? { status: "done", ...result.run } : { status: "error", error: result.error };
    setPanel(k, { mode: "run", run: done });
    setAnnouncement(runSummary(done));
    setBusyKey(null);
  }

  async function check(e: React.MouseEvent<HTMLButtonElement>) {
    if (busy) return;
    const k = key;
    const step = active.step;
    const { tests } = lesson.steps[step].practice;
    begin(k, e);
    setPanel(k, { mode: "check", check: { status: "checking", total: tests.length } });
    const outcomes = await Promise.all(
      tests.map((t) => runInSandbox(lang.slug, code, t.stdin ?? "", { refreshStatus: false }))
    );
    refreshSandboxStatus();

    const finish = (result: CheckState) => {
      setPanel(k, { mode: "check", check: result });
      setAnnouncement(checkSummary(result));
      setBusyKey(null);
    };
    const failed = outcomes.find((o) => !o.ok);
    if (failed && !failed.ok) return finish({ status: "error", error: failed.error });
    const runs = outcomes.map((o) => (o.ok ? o.run : null)).filter((r) => r !== null);
    const compileError = runs.find((r) => r.compileCode != null && r.compileCode !== 0);
    if (compileError) {
      return finish({ status: "compile-error", output: compileError.compileOutput || "Compilation failed." });
    }
    const results = runs.map((r, i) => {
      const timedOut = r.verdict === "TO";
      const stderr = timedOut ? "Timed out. Your code ran too long (usually an infinite loop). It was stopped." : r.stderr;
      return {
        stdin: tests[i].stdin ?? "",
        expected: tests[i].output,
        actual: r.stdout,
        stderr,
        passed: !timedOut && normalizeOutput(r.stdout) === normalizeOutput(tests[i].output),
      };
    });
    const allPassed = results.every((r) => r.passed);
    if (allPassed) markSolved(lang.slug, problemId(lesson.id, step));
    const lessonComplete = allPassed && lesson.steps.every((_, i) => i === step || isSolved(i));
    finish({ status: "done", results, lessonComplete });
  }

  const tabLabel = (t: Tab) =>
    `${t.kind === "example" ? "Example" : "Your code"}${many ? ` ${t.step + 1}` : ""}`;
  const iconBtn =
    "inline-flex size-8 items-center justify-center rounded-btn text-ink-muted transition-colors hover:bg-raised hover:text-ink";
  const nextLink = next ? { href: `/${lang.slug}/learn/${next.id}`, title: next.title } : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Left: the lesson. Its scroll padding (and, on narrow screens, the
          focusables' scroll margin) keeps keyboard focus clear of the
          floating lesson nav. */}
      <div
        className={`slim-scroll relative flex min-h-0 flex-col lg:overflow-y-auto lg:border-r lg:border-edge ${
          hasNav ? "lg:scroll-pb-24" : ""
        }`}
      >
        <article
          className={`mx-auto w-full max-w-[46rem] flex-1 px-5 pb-10 pt-6 sm:px-7 ${
            hasNav ? "max-lg:[&_:is(a,button,pre,[tabindex])]:scroll-mb-24" : ""
          }`}
        >
          <p className="eyebrow">
            {lesson.section} ·{" "}
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
          <h1 className="font-display mt-2 text-headline">{lesson.title}</h1>
          <Prose md={lesson.intro} className="mt-3 text-ink-muted" />

          {lesson.steps.map((step, i) => (
            <StepSection
              key={i}
              index={i}
              count={lesson.steps.length}
              step={step}
              language={lang.slug}
              solved={isSolved(i)}
              onOpenExample={() => openTab({ kind: "example", step: i })}
              onOpenPractice={() => openTab({ kind: "practice", step: i })}
            />
          ))}

          {lesson.recap && (
            <section className="mt-12 border-t border-edge pt-6">
              <p className="eyebrow">Recap</p>
              <Prose md={lesson.recap} className="mt-3" />
            </section>
          )}
        </article>

        {/* Floating lesson nav: only Next on the first lesson, only Prev on the
            last, and none at all in a one-lesson course. */}
        {hasNav && (
          <div className="pointer-events-none sticky bottom-0 z-10 flex justify-center bg-gradient-to-t from-surface from-40% to-transparent px-4 pb-4 pt-8">
            <div className="pointer-events-auto flex max-w-full items-center gap-1.5 rounded-card border border-edge bg-surface p-1.5 shadow-(--shadow-card)">
              {prev && (
                <Link
                  href={`/${lang.slug}/learn/${prev.id}`}
                  aria-label={`Previous lesson: ${prev.title}`}
                  title={prev.title}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-btn px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-raised hover:text-ink"
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  Previous
                </Link>
              )}
              {next && (
                <Link
                  href={`/${lang.slug}/learn/${next.id}`}
                  aria-label={`Next lesson: ${next.title}`}
                  title={next.title}
                  className={`inline-flex min-w-0 items-center gap-1.5 rounded-btn border px-3 py-1.5 text-sm font-medium ${
                    complete ? "border-edge-strong btn-grad" : "border-edge-strong text-ink transition-colors hover:bg-raised"
                  }`}
                >
                  <span className="min-w-0 truncate">Next: {next.title}</span>
                  <ArrowRight className="size-4 shrink-0" aria-hidden />
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right: the editor. Below lg it has a floor, so a short screen (a phone
          in landscape) scrolls the page instead of squeezing out the code. */}
      <div
        ref={editorRef}
        className="flex h-[88dvh] min-h-[30rem] min-w-0 scroll-mt-[calc(4rem+1px)] flex-col p-2 lg:h-auto lg:min-h-0"
      >
        {/* The padding (offset by the negative margins) leaves room for focus
            rings inside these scrolling rows, the thicker super-contrast ring
            included. */}
        <div
          ref={stripRef}
          role="tablist"
          aria-label="Editor tabs"
          className="slim-scroll -mx-1.5 -mb-0.5 -mt-1.5 flex shrink-0 items-center gap-1 overflow-x-auto px-1.5 pb-1.5 pt-1.5"
        >
          {tabs.map((t, i) => {
            const k = tabKey(t);
            const selected = k === key;
            return (
              <button
                key={k}
                ref={(el) => {
                  tabRefs.current[k] = el;
                }}
                id={tabId(t)}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                onClick={() => openTab(t)}
                onKeyDown={(e) => onTabKeyDown(e, i)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-btn px-2.5 py-1 text-xs font-medium uppercase tracking-wider transition-colors ${
                  selected ? "bg-raised text-ink dark:text-gold" : "text-ink-faint hover:text-ink dark:hover:text-gold"
                }`}
              >
                {tabLabel(t)}
                {/* Same-size marks either way, so tabs never move when progress loads. */}
                {t.kind === "practice" &&
                  (isSolved(t.step) ? (
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

        <div id={panelId} role="tabpanel" aria-labelledby={tabId(active)} className="flex min-h-0 flex-1 flex-col">
          <div className="slim-scroll -mx-1.5 -mt-0.5 flex shrink-0 items-center gap-2 overflow-x-auto px-1.5 pb-2 pt-1.5">
            <span className="shrink-0 font-mono text-sm font-medium">{lang.fileName}</span>
            <span className="hidden truncate text-xs text-ink-faint sm:inline">
              {active.kind === "example"
                ? lesson.steps[active.step].example.title
                : lesson.steps[active.step].practice.title}
            </span>
            <div className="ms-auto flex shrink-0 items-center gap-1">
              <ResetCodeButton
                label={active.kind === "example" ? "Reset to the original example" : "Reset to the starter code"}
                title={active.kind === "example" ? "Reset this example?" : "Reset to the starter code?"}
                description="This replaces what's in this tab with the original code."
                onReset={resetTab}
                className={iconBtn}
              />
              <EditorSettingsButton
                buttonClassName={`${iconBtn} shrink-0`}
                className="shrink-0"
                tools={<CodeThemePicker className="field w-full rounded-btn px-2 py-1.5 text-xs font-medium text-ink" />}
              />
              {active.kind === "practice" ? (
                <>
                  <button
                    type="button"
                    onClick={run}
                    disabled={busy}
                    className="shrink-0 rounded-btn border border-edge-strong px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-raised disabled:opacity-50"
                  >
                    ▶ Run
                  </button>
                  <button
                    type="button"
                    onClick={check}
                    disabled={busy}
                    className="shrink-0 rounded-btn border border-edge-strong px-4 py-1.5 text-sm font-medium btn-grad disabled:opacity-50"
                  >
                    {busyKey === key && panel.mode === "check" ? "Checking…" : "Check"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={run}
                  disabled={busy}
                  className="shrink-0 rounded-btn border border-edge-strong px-4 py-1.5 text-sm font-medium btn-grad disabled:opacity-50"
                >
                  {busyKey === key ? "Running…" : "▶ Run"}
                </button>
              )}
            </div>
          </div>

          <div className="code-dark flex min-h-[12rem] flex-[3] flex-col overflow-hidden rounded-card border border-code-edge bg-code-bg lg:min-h-0">
            <div className="min-h-0 flex-1">
              <CmEditor
                key={`${lesson.id}:${key}`}
                value={code}
                language={lang.slug}
                onChange={updateCode}
                ariaLabel={`${tabLabel(active)} editor`}
              />
            </div>
            <div className="shrink-0 border-t border-code-edge bg-code-bg">
              {/* The code box clips anything outside it, so this focus ring
                  sits inside the button (rounded like the box's corners when
                  it's the last row), in the code text color. */}
              <button
                type="button"
                onClick={() => setShowStdin((v) => !v)}
                aria-expanded={showStdin}
                aria-controls={showStdin ? stdinId : undefined}
                className={`code-stdin-toggle flex w-full items-center gap-1 px-3 py-1.5 text-left font-mono text-xs font-medium text-code-gutter transition-colors [--ink:var(--code-ink)] focus-visible:outline-offset-[-3px]! ${
                  showStdin ? "" : "rounded-b-[calc(var(--radius-card)-1px)]"
                }`}
              >
                <span aria-hidden>{showStdin ? "▾" : "▸"}</span>
                <span>stdin</span>
                {!showStdin && stdin ? <span className="truncate text-code-gutter">· {stdin.split("\n")[0]}</span> : null}
              </button>
              {showStdin && (
                <textarea
                  id={stdinId}
                  aria-label="Program input (stdin)"
                  value={stdin}
                  onChange={(e) => setStdins((s) => ({ ...s, [key]: e.target.value }))}
                  rows={2}
                  placeholder="Input passed to your program on stdin..."
                  className="code-stdin-input slim-scroll block w-full resize-none border-0 border-t border-code-edge bg-code-bg px-3 py-2 font-mono text-base text-code-ink outline-none placeholder:text-code-gutter focus:outline-none sm:text-sm"
                />
              )}
            </div>
          </div>

          <div ref={outputRef} className="mt-2 flex min-h-[9rem] flex-[2] scroll-mb-2 scroll-mt-[calc(4rem+1px)] flex-col">
            <div className="flex shrink-0 items-center gap-1 pb-2">
              <h2 id={outputId} className="shrink-0 rounded-btn px-2.5 py-1 text-xs font-medium uppercase tracking-wider text-ink dark:text-gold">
                {panel.mode === "check" ? "Results" : "Output"}
              </h2>
              {active.kind === "practice" && panel.mode === "run" && panel.run.status === "idle" && (
                <span className="truncate text-xs text-ink-faint">
                  Run tries your code. Check runs it against {lesson.steps[active.step].practice.tests.length} test
                  {lesson.steps[active.step].practice.tests.length === 1 ? "" : "s"}.
                </span>
              )}
              {((panel.mode === "run" && panel.run.status === "done") || (panel.mode === "check" && panel.check.status === "done")) && (
                <button
                  type="button"
                  onClick={() => setPanel(key, { mode: "run", run: { status: "idle" } })}
                  className="ms-auto rounded-btn px-2.5 py-1 text-xs font-medium text-ink-faint transition-colors hover:text-ink"
                >
                  Clear
                </button>
              )}
            </div>
            {/* Focusable, so long results can be scrolled from the keyboard. */}
            <div
              role="region"
              aria-labelledby={outputId}
              tabIndex={0}
              className="slim-scroll min-h-0 flex-1 overflow-auto rounded-card border border-edge bg-surface"
            >
              {panel.mode === "check" ? <CheckResults check={panel.check} next={nextLink} /> : <OutputPanel run={panel.run} />}
            </div>
          </div>
        </div>
        <p role="status" className="sr-only">
          {announcement}
        </p>
      </div>
    </div>
  );
}

function StepSection({
  index,
  count,
  step,
  language,
  solved,
  onOpenExample,
  onOpenPractice,
}: {
  index: number;
  count: number;
  step: Lesson["steps"][number];
  language: string;
  solved: boolean;
  onOpenExample: () => void;
  onOpenPractice: () => void;
}) {
  const { example, practice } = step;
  const hints = practice.hints ?? [];
  const [hintsShown, setHintsShown] = useState(0);
  // Two clicks to reveal the solution, so it is never shown by accident.
  const [solution, setSolution] = useState<"hidden" | "armed" | "shown">("hidden");
  const hintRef = useRef<HTMLLIElement>(null);
  const solutionRef = useRef<HTMLDivElement>(null);
  // What was just revealed, and whether to scroll to it (a pointer click
  // leaves the page where it is).
  const revealed = useRef<{ target: "hint" | "solution"; scroll: boolean } | null>(null);

  // Focus moves to what you revealed: it is read out, and focus isn't lost
  // when the button that revealed it goes away.
  useEffect(() => {
    const r = revealed.current;
    revealed.current = null;
    if (!r) return;
    const el = r.target === "hint" ? hintRef.current : solutionRef.current;
    el?.focus({ preventScroll: !r.scroll });
  }, [hintsShown, solution]);

  return (
    <section id={`step-${index + 1}`} className="mt-12 scroll-mt-4">
      {count > 1 && <p className="eyebrow">Step {index + 1} of {count}</p>}
      <h2 className="font-display mt-1.5 text-title">{step.title}</h2>
      <Prose md={step.body} className="mt-3" />

      <div className="mt-7 border-l-2 border-edge pl-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="eyebrow">Example</p>
          <button
            type="button"
            onClick={onOpenExample}
            className="text-xs font-medium text-ink-muted transition-colors hover:text-ink dark:hover:text-gold"
          >
            Open in editor →
          </button>
        </div>
        <h3 className="mt-1.5 font-medium text-ink">{example.title}</h3>
        <Prose md={example.prompt} className="mt-1.5 text-ink-muted" />
        <CopyableCodeBlock code={example.code} label="Example code" className="mt-3" preClassName={CODE_BLOCK}>
          <Highlight code={example.code} language={language} />
        </CopyableCodeBlock>
        {example.stdin ? (
          <>
            <p className="mt-4 text-xs font-medium text-ink-faint">Input</p>
            <ScrollPre label="Example input" className={PLAIN_BLOCK}>
              {example.stdin}
            </ScrollPre>
          </>
        ) : null}
        <p className="mt-4 text-xs font-medium text-ink-faint">Output</p>
        <ScrollPre label="Example output" className={PLAIN_BLOCK}>
          {example.output}
        </ScrollPre>
        <p className="mt-4 text-sm font-medium text-ink">How it works</p>
        <Prose md={example.explanation} className="mt-1 text-ink-muted" />
      </div>

      <div className="mt-8 border-l-2 border-edge-strong pl-5">
        <p className="eyebrow">
          Your turn{" "}
          {/* Always laid out, shown once solved, so it never moves the page. */}
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
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenPractice}
            className="inline-grid rounded-btn border border-edge-strong px-3 py-1.5 text-xs font-medium btn-grad"
          >
            {/* Both labels share one cell, so the button is the same width
                solved or not and nothing beside it moves when progress loads. */}
            <span className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 ${solved ? "invisible" : ""}`}>
              Start coding
              <ArrowRight className="size-3.5" aria-hidden />
            </span>
            <span className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 ${solved ? "" : "invisible"}`}>
              Open your code
              <ArrowRight className="size-3.5" aria-hidden />
            </span>
          </button>
          {hints.length > 0 && hintsShown < hints.length && (
            <button
              type="button"
              onClick={(e) => {
                revealed.current = { target: "hint", scroll: e.detail === 0 };
                setHintsShown((n) => n + 1);
              }}
              className="rounded-btn px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-raised hover:text-ink"
            >
              {hintsShown === 0 ? "Show a hint" : `Another hint (${hintsShown}/${hints.length})`}
            </button>
          )}
          {solution !== "shown" && (
            <button
              type="button"
              onClick={(e) => {
                if (solution === "armed") revealed.current = { target: "solution", scroll: e.detail === 0 };
                setSolution(solution === "armed" ? "shown" : "armed");
              }}
              onBlur={() => solution === "armed" && setSolution("hidden")}
              className="rounded-btn px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-raised hover:text-ink"
            >
              {solution === "armed" ? "Click again to show the solution" : "Show solution"}
            </button>
          )}
        </div>
        {hintsShown > 0 && (
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink-muted">
            {hints.slice(0, hintsShown).map((h, i) => (
              <li key={i} ref={i === hintsShown - 1 ? hintRef : undefined} tabIndex={-1} className="rounded-btn">
                <Prose md={h} />
              </li>
            ))}
          </ol>
        )}
        {solution === "shown" && (
          <div ref={solutionRef} tabIndex={-1} className="mt-4 rounded-card">
            <p className="text-xs font-medium text-ink-faint">One solution</p>
            <CopyableCodeBlock code={practice.solution} label="Solution code" className="mt-1.5" preClassName={CODE_BLOCK}>
              <Highlight code={practice.solution} language={language} />
            </CopyableCodeBlock>
          </div>
        )}
      </div>
    </section>
  );
}
