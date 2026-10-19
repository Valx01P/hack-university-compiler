"use client";

import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { AnswerToggle } from "@/components/code/answer-toggle";
import { CmEditor } from "@/components/code/cm-editor";
import { EditorSettingsButton } from "@/components/code/editor-settings";
import { CodeThemePicker } from "@/components/code/code-theme";
import { ResetCodeButton } from "@/components/code/reset-code-button";
import { OutputPanel } from "@/components/compiler/output-panel";
import { runSummary, useReturnFocus } from "@/components/compiler/run-feedback";
import { CopyableCodeBlock } from "@/components/ui/copyable-code-block";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { ScrollPre } from "@/components/ui/scroll-pre";
import { LessonMarkdown, type RunnableContext } from "@/components/learn/lesson-md";
import { CompleteIcon, PendingIcon } from "@/components/learn/complete-icon";
import { CompilerButton } from "@/components/learn/compiler-button";
import { CheckResults, checkSummary, type CheckState } from "@/components/learn/check-results";
import { Highlight } from "@/lib/highlight";
import { isSql, type CompilerLang } from "@/lib/compiler";
import { partHref, problemId, type Lesson, type LessonStep } from "@/lib/learn-types";
import { clearCode, loadCode, markSolved, saveCode, setLastLesson, useSolvedState } from "@/lib/learn-progress";
import { normalizeOutput, refreshSandboxStatus, runInSandbox, type RunState } from "@/lib/run-code";
import { useEnter } from "@/lib/motion";
import { ThemeToggle } from "@/components/theme-toggle";
import { useFullScreen } from "@/lib/full-screen";
import { revealWorkspace, urlCount, urlParam, writeHash, writeUrl } from "@/lib/url-state";

/** Where Previous or Next goes: another part of this lesson, or a lesson. */
export interface PartLink {
  href: string;
  title: string;
  lesson: boolean;
}

type TabKind = "example" | "practice";
type Panel = { mode: "run"; run: RunState } | { mode: "check"; check: CheckState };

const TABS: TabKind[] = ["example", "practice"];
const CODE_BLOCK =
  "code-dark slim-scroll overflow-x-auto rounded-card border border-code-content-line bg-code-bg p-4 pr-16 font-mono text-[13px] leading-6 text-code-ink";
const PLAIN_BLOCK =
  "code-terminal slim-scroll mt-1.5 overflow-x-auto rounded-card border border-content-line bg-raised px-4 py-3 font-mono text-[13px] leading-6 text-ink";

// How much of the width the lesson gets next to the editor. Like the
// compiler's split it lasts for the session but isn't saved, so a reload
// never shifts.
const SPLIT = { min: 30, max: 70, initial: 50 };
// Where #example, #practice, and #recap land: clear of the sticky header
// when the page scrolls, a little below the top of the lesson column.
const PLACE_MARGIN = "scroll-mt-[calc(4rem+1rem)] lg:scroll-mt-4";
const session = { split: SPLIT.initial };

/** Lesson markdown with the outer margins trimmed, for use inside cards. */
function Prose({ md, className = "", runnable }: { md: string; className?: string; runnable?: RunnableContext }) {
  return (
    <div className={`text-[0.95rem] leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 ${className}`}>
      <LessonMarkdown md={md} runnable={runnable} />
    </div>
  );
}

/**
 * One part of a lesson in Learn mode: a single idea with its worked example
 * and practice problem on the left, and the editor on the right with two
 * tabs, the example and your code. Drag the border between them to resize.
 * The example runs and can be edited and reset. The practice is checked by
 * running your code against each test.
 */
export function PartView({
  lang,
  lesson,
  parts,
  part,
  step,
  position,
  prev,
  next,
}: {
  lang: CompilerLang;
  lesson: Pick<Lesson, "id" | "title" | "section" | "intro" | "recap" | "setup">;
  /** Every part's title, in order. */
  parts: string[];
  /** This part, counting from 0. */
  part: number;
  step: LessonStep;
  position: { index: number; total: number };
  prev: PartLink | null;
  next: PartLink | null;
}) {
  // Empty in the server markup and the hydration render (the server can't
  // see your progress), so everything that shows progress keeps the same size
  // either way: a reload never shifts. A part reached by a client-side
  // navigation renders your progress from its first frame.
  const { solved } = useSolvedState(lang.slug);
  const isSolved = (i: number) => solved.has(problemId(lesson.id, i));
  const complete = parts.every((_, i) => isSolved(i));
  const partSolved = isSolved(part);
  const lastPart = part === parts.length - 1;
  const hasNav = Boolean(prev || next);

  const tabKey = (kind: TabKind) => `${kind}-${part}`;
  const defaultCode = (kind: TabKind) => (kind === "example" ? step.example.code : step.practice.starter);
  // SQL programs start from the lesson's tables (its setup), plus the example's
  // or test's own setup. That is SQL's stdin.
  const sql = isSql(lang.slug);
  const inputFor = (stdin: string | undefined) =>
    sql ? [lesson.setup, stdin].filter((x) => x && x.trim()).join("\n") : stdin ?? "";
  const defaultStdin = (kind: TabKind) =>
    inputFor(kind === "example" ? step.example.stdin : step.practice.tests[0]?.stdin);

  const [active, setActive] = useState<TabKind>("example");
  // Your code per tab, read while initializing (CodeMirror mounts client-side,
  // so the server markup never depends on it).
  const [codes, setCodes] = useState<Record<TabKind, string>>(() => ({
    example: loadCode(lang.slug, lesson.id, tabKey("example"), defaultCode("example")),
    practice: loadCode(lang.slug, lesson.id, tabKey("practice"), defaultCode("practice")),
  }));
  const [stdins, setStdins] = useState<Record<TabKind, string>>(() => ({
    example: defaultStdin("example"),
    practice: defaultStdin("practice"),
  }));
  const [showStdin, setShowStdin] = useState(() => defaultStdin("example") !== "");
  const [panels, setPanels] = useState<Partial<Record<TabKind, Panel>>>({});
  // The tab whose run or check is in flight. Runs go one at a time, but only
  // that tab's buttons say "Running…" or "Checking…".
  const [busyTab, setBusyTab] = useState<TabKind | null>(null);
  const busy = busyTab !== null;
  // What a screen reader hears when a run or check ends.
  const [announcement, setAnnouncement] = useState("");
  // Hands keyboard focus back to Run or Check once the run is over.
  const rememberRunButton = useReturnFocus(busy);
  const editorRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<TabKind, HTMLButtonElement | null>>>({});
  const gridRef = useRef<HTMLDivElement>(null);
  // The lesson's code examples run here (on the lesson's tables, for SQL),
  // and keep your edits under the lesson.
  const runnable: RunnableContext = { scope: `learn/${lang.slug}/${lesson.id}`, setup: lesson.setup };
  // Moving to another part fades the new one in (never on first paint).
  const articleRef = useRef<HTMLElement>(null);
  useEnter(articleRef);

  // Full screen, the same one the compiler uses: the lesson and the editor
  // over the whole window. It lasts while you move between parts and to the
  // compiler and back, is in the address (?full=1), and Escape leaves it.
  const [full, setFull] = useFullScreen();
  const toggleFull = () => setFull((was) => !was);

  const [split, setSplitPct] = useState(session.split);
  const setSplit = (pct: number) => {
    const clamped = Math.min(SPLIT.max, Math.max(SPLIT.min, Math.round(pct)));
    session.split = clamped;
    setSplitPct(clamped);
  };

  const uid = useId();
  const tabId = (kind: TabKind) => `${uid}-tab-${kind}`;
  const panelId = `${uid}-panel`;
  const stdinId = `${uid}-stdin`;
  const outputId = `${uid}-output`;

  // The eye on Your code shows the solution in place of your code, read only,
  // without touching what you wrote. It asks first once per visit.
  const [answer, setAnswer] = useState(false);
  const [answerUnlocked, setAnswerUnlocked] = useState(false);
  const showingAnswer = active === "practice" && answer;

  const code = showingAnswer ? step.practice.solution : codes[active];
  const stdin = stdins[active];
  const panel: Panel = panels[active] ?? { mode: "run", run: { status: "idle" } };

  useEffect(() => {
    setLastLesson(lang.slug, lesson.id, part + 1);
  }, [lang.slug, lesson.id, part]);

  // The address keeps your place (lib/url-state.ts): ?tab=code while you're
  // on Your code, and #example, #practice, or #recap for where you are in
  // the part, so a reload comes back to it. A reload that restores the tab
  // keeps the page hidden until it has (the hints restore with it).
  useLayoutEffect(() => {
    if (urlParam("tab") === "code") openTab("practice", { scroll: false });
    // A reload doesn't scroll the lesson column to the #fragment (the browser
    // restores its old scroll instead), so go there by hand, on the next
    // frame, once the hints restored with it are laid out: the column on
    // wide screens, the page below that. Then show the page.
    requestAnimationFrame(() => {
      const place = window.location.hash.slice(1);
      const target = ["example", "practice", "recap"].includes(place) ? document.getElementById(place) : null;
      const column = columnRef.current;
      if (target && column && getComputedStyle(column).overflowY === "auto") {
        column.scrollTop += target.getBoundingClientRect().top - column.getBoundingClientRect().top - 16;
      } else if (target) {
        window.scrollTo(0, window.scrollY + target.getBoundingClientRect().top - 80);
      }
      // A frame later, the editor has taken a restored tab's code too.
      if (document.documentElement.hasAttribute("data-restore")) requestAnimationFrame(revealWorkspace);
    });
    // Once, on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    writeUrl({ tab: active === "practice" ? "code" : null });
  }, [active]);
  const columnRef = useRef<HTMLDivElement>(null);
  const placeFrame = useRef(0);
  const lastPlace = useRef<string | null>(null);
  // The block at the top of the view (the lesson column scrolls on wide
  // screens, the page below that) becomes the #fragment.
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
      for (const id of ["example", "practice", "recap"]) {
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

  function openTab(kind: TabKind, { scroll = true }: { scroll?: boolean } = {}) {
    setActive(kind);
    setShowStdin(stdins[kind] !== "");
    // On narrow screens the editor sits below the lesson: bring it into view,
    // below the sticky header (the column's scroll margin).
    if (scroll && window.innerWidth < 1024) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      editorRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  }

  // Arrow keys, Home and End move between the tabs (and open them), so the
  // strip is a single tab stop.
  function onTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, i: number) {
    const last = TABS.length - 1;
    const to =
      e.key === "ArrowRight" ? (i === last ? 0 : i + 1)
      : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : -1;
    if (to < 0) return;
    e.preventDefault();
    openTab(TABS[to], { scroll: false });
    tabRefs.current[TABS[to]]?.focus();
  }

  function updateCode(nextCode: string) {
    setCodes((c) => ({ ...c, [active]: nextCode }));
    // Code that matches the original isn't saved, so a reset (whose new value
    // comes back through here) really clears the tab, and a later fix to the
    // example or starter still reaches you.
    if (nextCode === defaultCode(active)) clearCode(lang.slug, lesson.id, tabKey(active));
    else saveCode(lang.slug, lesson.id, tabKey(active), nextCode);
  }

  function resetTab() {
    setCodes((c) => ({ ...c, [active]: defaultCode(active) }));
    setStdins((s) => ({ ...s, [active]: defaultStdin(active) }));
    setPanels((p) => ({ ...p, [active]: { mode: "run", run: { status: "idle" } } }));
    clearCode(lang.slug, lesson.id, tabKey(active));
  }

  const setPanel = (kind: TabKind, p: Panel) => setPanels((all) => ({ ...all, [kind]: p }));

  /** Start a run or check from its button. */
  function begin(kind: TabKind, e: React.MouseEvent<HTMLButtonElement>) {
    rememberRunButton(e);
    setBusyTab(kind);
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
    const kind = active;
    begin(kind, e);
    setPanel(kind, { mode: "run", run: { status: "running" } });
    const result = await runInSandbox(lang.slug, code, stdin);
    const done: RunState = result.ok ? { status: "done", ...result.run } : { status: "error", error: result.error };
    setPanel(kind, { mode: "run", run: done });
    setAnnouncement(runSummary(done));
    setBusyTab(null);
  }

  async function check(e: React.MouseEvent<HTMLButtonElement>) {
    if (busy) return;
    const { tests } = step.practice;
    begin("practice", e);
    setPanel("practice", { mode: "check", check: { status: "checking", total: tests.length } });
    const outcomes = await Promise.all(
      tests.map((t) => runInSandbox(lang.slug, code, inputFor(t.stdin), { refreshStatus: false }))
    );
    refreshSandboxStatus();

    const finish = (result: CheckState) => {
      setPanel("practice", { mode: "check", check: result });
      setAnnouncement(checkSummary(result));
      setBusyTab(null);
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
    if (allPassed) markSolved(lang.slug, problemId(lesson.id, part));
    const lessonComplete = allPassed && parts.every((_, i) => i === part || isSolved(i));
    finish({ status: "done", results, lessonComplete });
  }

  const tabLabel = (kind: TabKind) => (kind === "example" ? "Example" : "Your code");
  const nextLabel = (link: PartLink) => `${link.lesson ? "Next lesson" : "Next"}: ${link.title}`;
  const iconBtn =
    "inline-flex size-8 items-center justify-center rounded-btn text-ink-muted transition-colors hover:bg-raised hover:text-ink";

  return (
    <div
      ref={gridRef}
      data-workspace
      className={`flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[var(--learn-split)_9px_minmax(0,1fr)] ${
        // Below lg the part and the editor stack and the whole thing
        // scrolls, each at its own height (never squeezed to fit).
        full ? "fixed inset-0 z-[100] bg-canvas max-lg:overflow-y-auto max-lg:*:shrink-0" : ""
      }`}
      style={{ "--learn-split": `${split}%` } as React.CSSProperties}
    >
      {/* Left: the part. Its scroll padding (and, on narrow screens, the
          focusables' scroll margin) keeps keyboard focus clear of the floating
          nav. */}
      <div ref={columnRef} onScroll={trackPlace} className={`slim-scroll relative flex min-h-0 flex-col lg:overflow-y-auto ${hasNav ? "lg:scroll-pb-24" : ""}`}>
        <article
          ref={articleRef}
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

          {parts.length > 1 && (
            <nav aria-label="Parts of this lesson" className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-faint">
                Part {part + 1} of {parts.length}
              </span>
              <ol className="flex flex-wrap items-center gap-1.5">
                {parts.map((title, i) => {
                  const here = i === part;
                  const done = isSolved(i);
                  return (
                    <li key={i}>
                      <Link
                        href={partHref(lang.slug, lesson.id, i + 1)}
                        aria-current={here ? "page" : undefined}
                        aria-label={`Part ${i + 1}: ${title}${done ? " (solved)" : ""}`}
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
          )}

          {part === 0 && <Prose md={lesson.intro} className="mt-4 text-ink-muted" runnable={runnable} />}

          <PartSection
            step={step}
            runnable={runnable}
            language={lang.slug}
            solved={partSolved}
            onOpenExample={() => openTab("example")}
            onOpenPractice={() => openTab("practice")}
          />

          {lastPart && lesson.recap && (
            <section id="recap" className={`mt-12 border-t border-content-line pt-6 ${PLACE_MARGIN}`}>
              <p className="eyebrow">Lesson recap</p>
              <Prose md={lesson.recap} className="mt-3" runnable={runnable} />
            </section>
          )}
        </article>

        {/* Floating nav through the parts, then on to the next lesson: only
            Next at the very start of the course, only Previous at its end. */}
        {hasNav && (
          <div className="pointer-events-none sticky bottom-0 z-10 flex justify-center bg-gradient-to-t from-surface from-40% to-transparent px-4 pb-4 pt-8">
            <div className="pointer-events-auto flex max-w-full items-center gap-1.5 rounded-card border border-line bg-surface p-1.5 shadow-(--shadow-card)">
              {prev && (
                <Link
                  href={prev.href}
                  aria-label={`${prev.lesson ? "Previous lesson" : "Previous part"}: ${prev.title}`}
                  title={prev.title}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-btn px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-raised hover:text-ink"
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
                  className={`inline-flex min-w-0 items-center gap-1.5 rounded-btn border px-3 py-1.5 text-sm font-medium ${
                    partSolved ? "border-edge-strong btn-grad" : "border-line-strong text-ink transition-colors hover:bg-raised"
                  }`}
                >
                  <span className="min-w-0 truncate">{nextLabel(next)}</span>
                  <ArrowRight className="size-4 shrink-0" aria-hidden />
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      <ResizeHandle
        label="Resize the lesson and the editor"
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

      {/* Right: the editor. Below lg it has a floor, so a short screen (a phone
          in landscape) scrolls the page instead of squeezing out the code. */}
      <div
        ref={editorRef}
        className="flex h-[88dvh] min-h-[30rem] min-w-0 scroll-mt-[calc(4rem+1px)] flex-col p-2 lg:h-auto lg:min-h-0"
      >
        {/* The padding (offset by the negative margins) leaves room for focus
            rings inside these scrolling rows, the thicker super-contrast ring
            included. */}
        <div className="-mb-0.5 -mt-1.5 flex shrink-0 items-center gap-2">
          <div
            role="tablist"
            aria-label="Editor tabs"
            className="slim-scroll -mx-1.5 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1.5 pb-1.5 pt-1.5"
          >
            {TABS.map((kind, i) => {
              const selected = kind === active;
              return (
                <button
                  key={kind}
                  ref={(el) => {
                    tabRefs.current[kind] = el;
                  }}
                  id={tabId(kind)}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={panelId}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => openTab(kind)}
                  onKeyDown={(e) => onTabKeyDown(e, i)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-btn px-2.5 py-1 text-xs font-medium uppercase tracking-wider transition-colors ${
                    selected ? "bg-raised text-ink dark:text-gold" : "text-ink-faint hover:text-ink dark:hover:text-gold"
                  }`}
                >
                  {tabLabel(kind)}
                  {/* Same-size marks either way, so tabs never move when progress loads. */}
                  {kind === "practice" &&
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
          {/* Full screen covers the top bar and its Compiler button, so the
              way to the compiler moves here. */}
          {full && <CompilerButton lang={lang.slug} langLabel={lang.label} className="shrink-0" />}
        </div>

        <div id={panelId} role="tabpanel" aria-labelledby={tabId(active)} className="flex min-h-0 flex-1 flex-col">
          <div className="slim-scroll -mx-1.5 -mt-0.5 flex shrink-0 items-center gap-2 overflow-x-auto px-1.5 pb-2 pt-1.5">
            <span className="shrink-0 font-mono text-sm font-medium">{lang.fileName}</span>
            <span className="hidden truncate text-xs text-ink-faint sm:inline">
              {active === "example" ? step.example.title : showingAnswer ? "The answer (read only, your code is kept)" : step.practice.title}
            </span>
            <div className="ms-auto flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={toggleFull}
                title={full ? "Exit full screen" : "Full screen"}
                aria-label="Toggle full screen"
                aria-pressed={full}
                className={`${iconBtn} hidden lg:inline-flex`}
              >
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                </svg>
              </button>
              {active === "practice" && (
                <AnswerToggle
                  shown={answer}
                  unlocked={answerUnlocked}
                  onShow={() => {
                    setAnswer(true);
                    setAnswerUnlocked(true);
                  }}
                  onHide={() => setAnswer(false)}
                  className={iconBtn}
                />
              )}
              {!showingAnswer && (
                <ResetCodeButton
                  label={active === "example" ? "Reset to the original example" : "Reset to the starter code"}
                  title={active === "example" ? "Reset this example?" : "Reset to the starter code?"}
                  description="This replaces what's in this tab with the original code."
                  onReset={resetTab}
                  className={iconBtn}
                />
              )}
              <EditorSettingsButton
                buttonClassName={`${iconBtn} shrink-0`}
                className="shrink-0"
                tools={<CodeThemePicker className="field w-full rounded-btn px-2 py-1.5 text-xs font-medium text-ink" />}
              />
              {active === "practice" ? (
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
                    disabled={busy || showingAnswer}
                    title={showingAnswer ? "Close the answer to check your own code" : undefined}
                    className="shrink-0 rounded-btn border border-edge-strong px-4 py-1.5 text-sm font-medium btn-grad disabled:opacity-50"
                  >
                    {busyTab === "practice" && panel.mode === "check" ? "Checking…" : "Check"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={run}
                  disabled={busy}
                  className="shrink-0 rounded-btn border border-edge-strong px-4 py-1.5 text-sm font-medium btn-grad disabled:opacity-50"
                >
                  {busyTab === "example" ? "Running…" : "▶ Run"}
                </button>
              )}
            </div>
          </div>

          <div className="code-dark flex min-h-[12rem] flex-[3] flex-col overflow-hidden rounded-card border border-code-line bg-code-bg lg:min-h-0">
            <div className="min-h-0 flex-1">
              <CmEditor
                key={`${lesson.id}:${tabKey(active)}:${showingAnswer ? "answer" : "code"}`}
                value={code}
                language={lang.slug}
                onChange={showingAnswer ? () => {} : updateCode}
                ariaLabel={showingAnswer ? "The answer, read only" : `${tabLabel(active)} editor`}
                readOnly={showingAnswer}
              />
            </div>
            <div className="shrink-0 border-t border-code-content-line bg-code-bg">
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
                <span>{sql ? "setup (runs first)" : "stdin"}</span>
                {!showStdin && stdin ? <span className="truncate text-code-gutter">· {stdin.split("\n")[0]}</span> : null}
              </button>
              {showStdin && (
                <textarea
                  id={stdinId}
                  aria-label="Program input (stdin)"
                  value={stdin}
                  onChange={(e) => setStdins((s) => ({ ...s, [active]: e.target.value }))}
                  rows={2}
                  placeholder="Input passed to your program on stdin..."
                  className="code-stdin-input slim-scroll block w-full resize-none border-0 border-t border-code-content-line bg-code-bg px-3 py-2 font-mono text-base text-code-ink outline-none placeholder:text-code-gutter focus:outline-none sm:text-sm"
                />
              )}
            </div>
          </div>

          <div ref={outputRef} className="mt-2 flex min-h-[9rem] flex-[2] scroll-mb-2 scroll-mt-[calc(4rem+1px)] flex-col">
            <div className="flex shrink-0 items-center gap-1 pb-2">
              <h2 id={outputId} className="shrink-0 rounded-btn px-2.5 py-1 text-xs font-medium uppercase tracking-wider text-ink dark:text-gold">
                {panel.mode === "check" ? "Results" : "Output"}
              </h2>
              {active === "practice" && panel.mode === "run" && panel.run.status === "idle" && (
                <span className="truncate text-xs text-ink-faint">
                  Run tries your code. Check runs it against {step.practice.tests.length} test
                  {step.practice.tests.length === 1 ? "" : "s"}.
                </span>
              )}
              {((panel.mode === "run" && panel.run.status === "done") || (panel.mode === "check" && panel.check.status === "done")) && (
                <button
                  type="button"
                  onClick={() => setPanel(active, { mode: "run", run: { status: "idle" } })}
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
              className="code-terminal slim-scroll min-h-0 flex-1 overflow-auto rounded-card border border-line bg-surface"
            >
              {panel.mode === "check" ? (
                <CheckResults check={panel.check} next={next ? { href: next.href, label: nextLabel(next) } : null} />
              ) : (
                <OutputPanel run={panel.run} />
              )}
            </div>
          </div>
        </div>
        <p role="status" className="sr-only">
          {announcement}
        </p>
      </div>
      {/* In full screen the header is covered, so the theme picker floats. */}
      {full && <ThemeToggle floating />}
    </div>
  );
}

function PartSection({
  step,
  language,
  runnable,
  solved,
  onOpenExample,
  onOpenPractice,
}: {
  step: LessonStep;
  language: string;
  /** The lesson's code examples run (and keep your edits) here. */
  runnable: RunnableContext;
  solved: boolean;
  onOpenExample: () => void;
  onOpenPractice: () => void;
}) {
  const { example, practice } = step;
  const hints = practice.hints ?? [];
  const [hintsShown, setHintsShown] = useState(0);
  // The hints you've seen are kept in the address (&hints), so a reload
  // shows them again. Read after hydration: the server can't see it.
  useLayoutEffect(() => {
    setHintsShown(urlCount("hints", hints.length));
    // Once, on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    writeUrl({ hints: hintsShown ? String(hintsShown) : null });
  }, [hintsShown]);
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
    <section className="mt-9">
      <h2 className="font-display text-title">{step.title}</h2>
      <Prose md={step.body} className="mt-3" runnable={runnable} />

      <div id="example" className={`mt-7 border-l-2 border-content-line pl-5 ${PLACE_MARGIN}`}>
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
        <CopyableCodeBlock code={example.code} language={language} label="Example code" className="mt-3" preClassName={CODE_BLOCK}>
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
        <Prose md={example.explanation} className="mt-1 text-ink-muted" runnable={runnable} />
      </div>

      <div id="practice" className={`mt-8 border-l-2 border-content-line-strong pl-5 ${PLACE_MARGIN}`}>
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
            <CopyableCodeBlock code={practice.solution} language={language} label="Solution code" className="mt-1.5" preClassName={CODE_BLOCK}>
              <Highlight code={practice.solution} language={language} />
            </CopyableCodeBlock>
          </div>
        )}
      </div>
    </section>
  );
}
