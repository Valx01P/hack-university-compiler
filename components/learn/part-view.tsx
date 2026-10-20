"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { AnswerToggle } from "@/components/code/answer-toggle";
import { CmEditor } from "@/components/code/cm-editor";
import { EditorSettingsButton } from "@/components/code/editor-settings";
import { CodeThemePicker } from "@/components/code/code-theme";
import { ResetCodeButton } from "@/components/code/reset-code-button";
import { ExitBadge, OutputPanel } from "@/components/compiler/output-panel";
import { runSummary, useReturnFocus } from "@/components/compiler/run-feedback";
import { programTypeErrors, TypeCheckStrip } from "@/components/compiler/type-check";
import { CopyableCodeBlock } from "@/components/ui/copyable-code-block";
import { ResizeHandle } from "@/components/ui/resize-handle";
import type { RunnableContext } from "@/components/learn/lesson-md";
import { CompleteIcon, PendingIcon } from "@/components/learn/complete-icon";
import { CompilerButton } from "@/components/learn/compiler-button";
import { CheckResults, checkSummary, type CheckState, type TestResult } from "@/components/learn/check-results";
import { FixtureFiles } from "@/components/learn/fixture-files";
import {
  CODE_BLOCK,
  LessonEyebrow,
  PLACE_MARGIN,
  LearnShade,
  PartNav,
  PartNumbers,
  Prose,
  exampleId,
  nextLabel,
  usePartPlace,
  type PartLink,
} from "@/components/learn/part-frame";
import { Highlight } from "@/lib/highlight";
import { isSql, type CompilerLang } from "@/lib/compiler";
import type { FixtureFile } from "@/lib/learn-fixtures";
import {
  problemId,
  type ForbidRule,
  type Lesson,
  type LessonExample,
  type LessonStep,
  type SingleFileFeatures,
} from "@/lib/learn-types";
import { clearCode, loadCode, markSolved, saveCode, setLastLesson, useSolvedState } from "@/lib/learn-progress";
import { checkInSandbox, normalizeOutput, refreshSandboxStatus, runInSandbox, type RunState } from "@/lib/run-code";
import { joinArgs, splitArgs } from "@/lib/shell-words";
import { forbiddenUses, judgeTest, judgeTypeTests } from "@/lib/single-checks.mjs";
import { useEnter } from "@/lib/motion";
import { FULL_SCREEN_TITLE, useFullScreen } from "@/lib/full-screen";
import { revealWorkspace, urlCount, urlParam, writeUrl } from "@/lib/url-state";

// Each worked example has a tab of its own, then Your code (the practice).
type TabKind = "example" | "example2" | "example3" | "practice";
// What the tab shows below the editor, and the code it ran, for the type
// errors the editor underlines.
type Panel = { mode: "run"; run: RunState; code?: string } | { mode: "check"; check: CheckState; code?: string };

// One tab per example, MAX_EXAMPLES of them at most (lib/learn-types.ts).
const EXAMPLE_TABS: TabKind[] = ["example", "example2", "example3"];
// The address's ?tab for each tab (lib/url-state.ts). Example 1 has none.
const TAB_PARAM: Record<TabKind, string | null> = { example: null, example2: "ex2", example3: "ex3", practice: "code" };
const TIMED_OUT = "Timed out. Your code ran too long (usually an infinite loop). It was stopped.";

// How much of the width the lesson gets next to the editor. Like the
// compiler's split it lasts for the session but isn't saved, so a reload
// never shifts.
const SPLIT = { min: 30, max: 70, initial: 50 };
// How long Next glows once your practice passes (the .next-glow animation).
const NEXT_GLOW_MS = 3600;
const session = { split: SPLIT.initial };

/**
 * One part of a lesson in Learn mode: a single idea with its worked examples
 * (one to three) and practice problem on the left, and the editor on the
 * right with a tab for each example and one for your code. Drag the border
 * between them to resize. The examples run and can be edited and reset. The
 * practice is checked by running your code against each test (and, on the
 * runner, its type tests and honesty rules).
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
  features,
  fixtures = {},
}: {
  lang: CompilerLang;
  lesson: Pick<Lesson, "id" | "title" | "section" | "intro" | "recap" | "setup" | "fixtures" | "clock" | "runtime">;
  /** Every part's title, in order. */
  parts: string[];
  /** This part, counting from 0. */
  part: number;
  step: LessonStep;
  position: { index: number; total: number };
  prev: PartLink | null;
  next: PartLink | null;
  /** What this course's editor and checks add (Arguments, Type check...). */
  features: SingleFileFeatures;
  /** The fixture sets the part's programs start in, by name. */
  fixtures?: Record<string, FixtureFile[]>;
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

  const { examples, practice } = step;
  const tabs: TabKind[] = [...EXAMPLE_TABS.slice(0, examples.length), "practice"];
  const exampleOf = (kind: TabKind): LessonExample | null => examples[EXAMPLE_TABS.indexOf(kind)] ?? null;
  const tabKey = (kind: TabKind) => `${kind}-${part}`;
  const defaultCode = (kind: TabKind) => exampleOf(kind)?.code ?? practice.starter;
  // SQL programs start from the lesson's tables (its setup), plus the example's
  // or test's own setup. That is SQL's stdin.
  const sql = isSql(lang.slug);
  const sqlSetup = typeof lesson.setup === "string" ? lesson.setup : undefined;
  const inputFor = (stdin: string | undefined) =>
    sql ? [sqlSetup, stdin].filter((x) => x && x.trim()).join("\n") : stdin ?? "";
  // A tab runs like its example, and Your code like the practice's first
  // test: the same input, arguments, environment, fixture files, and clock.
  const runOf = (kind: TabKind) => {
    const example = exampleOf(kind);
    const test = practice.tests[0];
    return example
      ? { ...example, fixtures: example.fixtures ?? lesson.fixtures, clock: example.clock ?? lesson.clock }
      : {
          stdin: test?.stdin,
          args: test?.args,
          env: test?.env,
          fixtures: test?.fixtures ?? practice.fixtures ?? lesson.fixtures,
          clock: test?.clock ?? practice.clock ?? lesson.clock,
        };
  };
  const defaultStdin = (kind: TabKind) => inputFor(runOf(kind).stdin);
  const defaultArgs = (kind: TabKind) => joinArgs(runOf(kind).args ?? []);
  const perTab = <T,>(value: (kind: TabKind) => T) =>
    Object.fromEntries(tabs.map((kind) => [kind, value(kind)])) as Record<TabKind, T>;

  const [active, setActive] = useState<TabKind>(tabs[0]);
  // Your code per tab, read while initializing (CodeMirror mounts client-side,
  // so the server markup never depends on it).
  const [codes, setCodes] = useState(() => perTab((kind) => loadCode(lang.slug, lesson.id, tabKey(kind), defaultCode(kind))));
  const [stdins, setStdins] = useState(() => perTab(defaultStdin));
  const [showStdin, setShowStdin] = useState(() => defaultStdin(tabs[0]) !== "");
  // The Arguments field (Bash), as a line: split like a shell splits it.
  const [argLines, setArgLines] = useState(() => perTab(defaultArgs));
  const [showFiles, setShowFiles] = useState(false);
  const [panels, setPanels] = useState<Partial<Record<TabKind, Panel>>>({});
  // The tab whose run or check is in flight. Runs go one at a time: every
  // Run and Check is greyed out meanwhile, keeping its label so nothing
  // shifts, and the one at work is marked busy for screen readers.
  const [busyTab, setBusyTab] = useState<TabKind | null>(null);
  const busy = busyTab !== null;
  // What a screen reader hears when a run or check ends.
  const [announcement, setAnnouncement] = useState("");
  // Next glows for a few seconds after your practice passes, like the answer
  // eye, then goes back to normal. Counts the passes, so another one starts
  // the glow over.
  const [nextGlow, setNextGlow] = useState(0);
  useEffect(() => {
    if (!nextGlow) return;
    const timer = window.setTimeout(() => setNextGlow(0), NEXT_GLOW_MS);
    return () => window.clearTimeout(timer);
  }, [nextGlow]);
  // Hands keyboard focus back to Run or Check once the run is over.
  const rememberRunButton = useReturnFocus(busy);
  const editorRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<TabKind, HTMLButtonElement | null>>>({});
  const gridRef = useRef<HTMLDivElement>(null);
  // The lesson's code examples run here (on the lesson's tables, for SQL,
  // and in its fixture set at its clock, on the runner), and keep your edits
  // under the lesson.
  const runnable: RunnableContext = {
    course: lang.slug,
    scope: `learn/${lang.slug}/${lesson.id}`,
    setup: sqlSetup,
    fixtures: lesson.fixtures,
    clock: lesson.clock,
  };
  // Moving to another part fades the new one in (never on first paint).
  const articleRef = useRef<HTMLElement>(null);
  useEnter(articleRef);

  // Full screen, the same one the compiler uses: the header hidden first,
  // then the lesson and the editor over the whole window. It lasts while you
  // move between parts and to the compiler and back, is in the address
  // (?full=semi, ?full=1), and Escape leaves it.
  const [full, stepFull, screenMode] = useFullScreen();

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
  const filesId = `${uid}-files`;
  const outputId = `${uid}-output`;

  // The eye on Your code shows the solution in place of your code, read only,
  // without touching what you wrote. It asks first once per visit.
  const [answer, setAnswer] = useState(false);
  const [answerUnlocked, setAnswerUnlocked] = useState(false);
  const showingAnswer = active === "practice" && answer;

  const code = showingAnswer ? practice.solution : codes[active];
  const stdin = stdins[active];
  const argLine = argLines[active];
  const panel: Panel = panels[active] ?? { mode: "run", run: { status: "idle" } };
  // The fixture files this tab's runs start in (Bash), for the Files strip.
  const fixtureSet = runOf(active).fixtures ?? "";
  const fixtureFiles = fixtures[fixtureSet] ?? [];
  const filesRow = fixtureFiles.length > 0;
  // An Arguments field next to stdin: always for Bash, and for any part
  // whose programs take arguments.
  const takesArgs = features.args || tabs.some((kind) => (runOf(kind).args?.length ?? 0) > 0);
  const typeTestCount = practice.typeTests?.cases.length ?? 0;

  // Type errors from this tab's last run or check, underlined in the editor
  // while it still holds the code that ran. A type error's link puts the
  // cursor on its line.
  const typeErrorOutput =
    panel.mode === "run" && panel.run.status === "done" && panel.run.compileCode
      ? panel.run.compileOutput
      : panel.mode === "check" && panel.check.status === "compile-error"
        ? panel.check.output
        : null;
  const editorDiagnostics = useMemo(
    () =>
      features.typeCheck && typeErrorOutput !== null && panel.code !== undefined
        ? { doc: panel.code, items: programTypeErrors(typeErrorOutput, lang.fileName) }
        : null,
    [features.typeCheck, typeErrorOutput, panel.code, lang.fileName]
  );
  const [cursorAt, setCursorAt] = useState<{ line: number; col: number } | null>(null);
  const goTo = (line: number, col: number) => setCursorAt({ line, col });

  useEffect(() => {
    setLastLesson(lang.slug, lesson.id, part + 1);
  }, [lang.slug, lesson.id, part]);

  // The places in the part the address can point at.
  const places = [...examples.map((_, i) => exampleId(i)), "practice", "recap"];
  const columnRef = useRef<HTMLDivElement>(null);
  const { trackPlace, goToPlace } = usePartPlace(places, columnRef);

  // The address keeps your place (lib/url-state.ts): ?tab=code while you're
  // on Your code, ?tab=ex2 or ex3 on another example, and #example,
  // #example-2, #example-3, #practice, or #recap for where you are in the
  // part, so a reload comes back to it. A reload that restores the tab keeps
  // the page hidden until it has (the hints restore with it).
  useLayoutEffect(() => {
    const restored = tabs.find((kind) => TAB_PARAM[kind] !== null && TAB_PARAM[kind] === urlParam("tab"));
    if (restored) openTab(restored, { scroll: false });
    // Back to the #fragment on the next frame, once the hints restored with
    // it are laid out. Then show the page.
    requestAnimationFrame(() => {
      goToPlace();
      // A frame later, the editor has taken a restored tab's code too.
      const html = document.documentElement;
      if (html.hasAttribute("data-restore") || html.hasAttribute("data-restore-editor")) requestAnimationFrame(revealWorkspace);
    });
    // Once, on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    writeUrl({ tab: TAB_PARAM[active] });
  }, [active]);

  function openTab(kind: TabKind, { scroll = true }: { scroll?: boolean } = {}) {
    setActive(kind);
    setShowStdin(stdins[kind] !== "");
    // The tab's editor opens with its cursor where it starts.
    setCursorAt(null);
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
    tabRefs.current[tabs[to]]?.focus();
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
    setArgLines((a) => ({ ...a, [active]: defaultArgs(active) }));
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
    const ran = code;
    begin(kind, e);
    setPanel(kind, { mode: "run", run: { status: "running" } });
    // On the runner a run also gets its arguments, environment, fixture
    // files, and clock. Piston and PGlite runs send just code and stdin.
    const setup = runOf(kind);
    const args = splitArgs(argLine);
    const result = await runInSandbox(
      lang.slug,
      ran,
      stdin,
      features.runner ? { args: args.length ? args : undefined, env: setup.env, fixtures: setup.fixtures, clock: setup.clock } : {}
    );
    const done: RunState = result.ok ? { status: "done", ...result.run } : { status: "error", error: result.error };
    setPanel(kind, { mode: "run", run: done, code: ran });
    setAnnouncement(runSummary(done, { typeChecked: features.typeCheck }));
    setBusyTab(null);
  }

  async function check(e: React.MouseEvent<HTMLButtonElement>) {
    if (busy) return;
    const { tests } = practice;
    begin("practice", e);
    setPanel("practice", { mode: "check", check: { status: "checking", total: tests.length } });
    if (features.runner) return checkOnRunner(code);
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
      const stderr = timedOut ? TIMED_OUT : r.stderr;
      return {
        stdin: tests[i].stdin ?? "",
        expected: tests[i].output,
        actual: r.stdout,
        stderr,
        passed: !timedOut && normalizeOutput(r.stdout) === normalizeOutput(tests[i].output),
      };
    });
    const allPassed = results.every((r) => r.passed);
    if (allPassed) {
      markSolved(lang.slug, problemId(lesson.id, part));
      setNextGlow((n) => n + 1);
    }
    const lessonComplete = allPassed && parts.every((_, i) => i === part || isSolved(i));
    finish({ status: "done", results, lessonComplete });
  }

  /** A check on the runner: every test in one request, judged by
      lib/single-checks.mjs with everything a test can ask (exit codes,
      stderr, files), then the type tests and the honesty rules. */
  async function checkOnRunner(ran: string) {
    const finish = (result: CheckState) => {
      setPanel("practice", { mode: "check", check: result, code: ran });
      setAnnouncement(checkSummary(result));
      setBusyTab(null);
    };
    const outcome = await checkInSandbox(lang.slug, ran, {
      tests: practice.tests,
      typeTests: practice.typeTests,
      fixtures: practice.fixtures ?? lesson.fixtures,
      clock: practice.clock ?? lesson.clock,
    });
    if (!outcome.ok) return finish({ status: "error", error: outcome.error });
    const compileError = outcome.runs.find((r) => r.compileCode != null && r.compileCode !== 0);
    if (compileError) {
      return finish({
        status: "compile-error",
        output: compileError.compileOutput || (features.typeCheck ? "" : "Compilation failed."),
        typeCheck: features.typeCheck ? { fileName: lang.fileName } : undefined,
      });
    }
    const results: TestResult[] = practice.tests.map((test, i) => {
      const run = outcome.runs[i];
      const { passed, problems } = judgeTest(test, run);
      return {
        stdin: test.stdin ?? "",
        expected: test.output,
        actual: run.stdout,
        stderr: run.verdict === "TO" ? TIMED_OUT : run.stderr,
        passed,
        detail: { test, run, problems },
      };
    });
    const typeTests = practice.typeTests
      ? judgeTypeTests(practice.typeTests, outcome.typeTests).map((t, i) => ({ ...t, code: practice.typeTests!.cases[i].code }))
      : [];
    const forbidden = forbiddenUses(ran, practice.forbid ?? []);
    const allPassed = results.every((r) => r.passed) && typeTests.every((t) => t.passed) && forbidden.length === 0;
    if (allPassed) {
      markSolved(lang.slug, problemId(lesson.id, part));
      setNextGlow((n) => n + 1);
    }
    const lessonComplete = allPassed && parts.every((_, i) => i === part || isSolved(i));
    finish({ status: "done", results, lessonComplete, typeTests, forbidden });
  }

  // The stdin row under the editor. The code box clips anything outside it,
  // so the focus ring sits inside the button (rounded like the box's corners
  // when it's the last row), in the code text color. Beside an Arguments
  // field it takes half the row.
  const stdinToggle = (
    <button
      type="button"
      onClick={() => setShowStdin((v) => !v)}
      aria-expanded={showStdin}
      aria-controls={showStdin ? stdinId : undefined}
      className={`code-stdin-toggle flex ${takesArgs ? "min-w-0 flex-1" : "w-full"} items-center gap-1 px-3 py-1.5 text-left font-mono text-xs font-medium text-code-gutter transition-colors [--ink:var(--code-ink)] focus-visible:outline-offset-[-3px]! ${
        showStdin || filesRow ? "" : takesArgs ? "rounded-bl-[calc(var(--radius-card)-1px)]" : "rounded-b-[calc(var(--radius-card)-1px)]"
      }`}
    >
      <span aria-hidden>{showStdin ? "▾" : "▸"}</span>
      <span>{sql ? "setup (runs first)" : "stdin"}</span>
      {!showStdin && stdin ? <span className="truncate text-code-gutter">· {stdin.split("\n")[0]}</span> : null}
    </button>
  );

  // One example keeps today's "Example". Several are numbered.
  const tabLabel = (kind: TabKind) =>
    kind === "practice" ? "Your code" : examples.length > 1 ? `Example ${EXAMPLE_TABS.indexOf(kind) + 1}` : "Example";
  const iconBtn =
    "inline-flex size-8 items-center justify-center rounded-btn text-ink-muted transition-colors hover:bg-raised hover:text-ink";

  return (
    <div
      ref={gridRef}
      data-workspace
      className={`flex min-h-0 flex-1 flex-col lg:relative lg:grid lg:grid-cols-[var(--learn-split)_9px_minmax(0,1fr)] ${
        // In full screen (laid out by globals.css) below lg the part and the
        // editor stack and the whole thing scrolls, each at its own height
        // (never squeezed to fit).
        "full:max-lg:overflow-y-auto full:max-lg:*:shrink-0"
      }`}
      style={{ "--learn-split": `${split}%` } as React.CSSProperties}
    >
      {hasNav && <LearnShade />}
      {/* Left: the part. Its scroll padding (and, on narrow screens, the
          focusables' scroll margin) keeps keyboard focus clear of the floating
          nav, which sits higher in full screen. */}
      <div
        ref={columnRef}
        onScroll={trackPlace}
        className={`slim-scroll relative flex min-h-0 flex-col lg:overflow-y-auto ${hasNav ? "lg:scroll-pb-24 full:lg:scroll-pb-36" : ""}`}
      >
        <article
          ref={articleRef}
          className={`mx-auto w-full max-w-[46rem] flex-1 px-5 pb-10 pt-6 sm:px-7 ${
            hasNav ? "max-lg:[&_:is(a,button,pre,[tabindex])]:scroll-mb-24 full:max-lg:[&_:is(a,button,pre,[tabindex])]:scroll-mb-36" : ""
          }`}
        >
          <LessonEyebrow section={lesson.section} position={position} complete={complete} />
          <h1 className="font-display mt-2 text-headline">{lesson.title}</h1>

          <PartNumbers lang={lang.slug} lessonId={lesson.id} parts={parts} part={part} isDone={isSolved} />

          {part === 0 && <Prose md={lesson.intro} className="mt-4 text-ink-muted" runnable={runnable} />}

          <PartSection
            step={step}
            runnable={runnable}
            language={lang.slug}
            solved={partSolved}
            onOpenExample={(i) => openTab(EXAMPLE_TABS[i])}
            onOpenPractice={() => openTab("practice")}
          />

          {lastPart && lesson.recap && (
            <section id="recap" className={`mt-12 border-t border-content-line pt-6 ${PLACE_MARGIN}`}>
              <p className="eyebrow">Lesson recap</p>
              <Prose md={lesson.recap} className="mt-3" runnable={runnable} />
            </section>
          )}
        </article>

        <PartNav prev={prev} next={next} glow={nextGlow} />
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
        data-editor-pane
        className="flex h-[88dvh] min-h-[30rem] min-w-0 scroll-mt-(--header-h) flex-col p-2 lg:h-auto lg:min-h-0"
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
            {tabs.map((kind, i) => {
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
          <span className="hidden full:contents">
            <CompilerButton lang={lang.slug} langLabel={lang.label} className="shrink-0" />
          </span>
        </div>

        <div id={panelId} role="tabpanel" aria-labelledby={tabId(active)} className="flex min-h-0 flex-1 flex-col">
          <div className="slim-scroll -mx-1.5 -mt-0.5 flex shrink-0 items-center gap-2 overflow-x-auto px-1.5 pb-2 pt-1.5">
            <span className="shrink-0 font-mono text-sm font-medium">{lang.fileName}</span>
            <span className="hidden truncate text-xs text-ink-faint sm:inline">
              {exampleOf(active)?.title ?? (showingAnswer ? "The answer (read only, your code is kept)" : practice.title)}
            </span>
            <div className="ms-auto flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={stepFull}
                title={FULL_SCREEN_TITLE[screenMode]}
                aria-label="Toggle full screen"
                aria-pressed={screenMode === "full" ? true : screenMode === "semi" ? "mixed" : false}
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
                  label={active === "practice" ? "Reset to the starter code" : "Reset to the original example"}
                  title={active === "practice" ? "Reset to the starter code?" : "Reset this example?"}
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
                    aria-busy={busyTab === "practice" && panel.mode === "run"}
                    className="shrink-0 rounded-btn border border-edge-strong px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-raised disabled:opacity-50"
                  >
                    ▶ Run
                  </button>
                  <button
                    type="button"
                    onClick={check}
                    disabled={busy || showingAnswer}
                    aria-busy={busyTab === "practice" && panel.mode === "check"}
                    title={showingAnswer ? "Close the answer to check your own code" : undefined}
                    className="shrink-0 rounded-btn border border-edge-strong px-4 py-1.5 text-sm font-medium btn-grad disabled:opacity-50"
                  >
                    Check
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={run}
                  disabled={busy}
                  aria-busy={busyTab === active}
                  className="shrink-0 rounded-btn border border-edge-strong px-4 py-1.5 text-sm font-medium btn-grad disabled:opacity-50"
                >
                  ▶ Run
                </button>
              )}
            </div>
          </div>

          <div className="code-dark flex min-h-[12rem] flex-[3] flex-col overflow-hidden rounded-card border border-code-content-line bg-code-bg lg:min-h-0">
            <div className="min-h-0 flex-1">
              <CmEditor
                key={`${lesson.id}:${tabKey(active)}:${showingAnswer ? "answer" : "code"}`}
                value={code}
                language={lang.slug}
                onChange={showingAnswer ? () => {} : updateCode}
                ariaLabel={showingAnswer ? "The answer, read only" : `${tabLabel(active)} editor`}
                readOnly={showingAnswer}
                diagnostics={editorDiagnostics}
                cursorAt={cursorAt}
              />
            </div>
            <div className="shrink-0 border-t border-code-content-line bg-code-bg">
              {takesArgs ? (
                // The Arguments field sits next to stdin, as on the compiler
                // page. With no border of its own, the field shows focus the
                // way the stdin toggle does (.code-args-field in globals.css).
                <div className="flex items-stretch">
                  {stdinToggle}
                  <label
                    className={`code-args-field flex min-w-0 flex-1 items-center gap-2 border-l border-code-content-line ps-3 font-mono text-xs font-medium text-code-gutter ${
                      showStdin || filesRow ? "" : "rounded-br-[calc(var(--radius-card)-1px)]"
                    }`}
                  >
                    <span className="shrink-0">args</span>
                    <input
                      type="text"
                      value={argLine}
                      onChange={(e) => setArgLines((a) => ({ ...a, [active]: e.target.value }))}
                      spellCheck={false}
                      autoComplete="off"
                      autoCapitalize="off"
                      placeholder={features.args ? "arguments for $1, $2..." : "arguments for your program..."}
                      aria-label="Arguments passed to your program"
                      className="code-stdin-input min-w-0 flex-1 self-stretch border-0 bg-transparent pe-3 font-mono text-base font-normal text-code-ink outline-none placeholder:text-code-gutter focus:outline-none sm:text-xs"
                    />
                  </label>
                </div>
              ) : (
                stdinToggle
              )}
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
              {filesRow && (
                // The files the program starts in (Bash), folded until you
                // open them.
                <button
                  type="button"
                  onClick={() => setShowFiles((v) => !v)}
                  aria-expanded={showFiles}
                  aria-controls={showFiles ? filesId : undefined}
                  className={`code-stdin-toggle flex w-full items-center gap-1 border-t border-code-content-line px-3 py-1.5 text-left font-mono text-xs font-medium text-code-gutter transition-colors [--ink:var(--code-ink)] focus-visible:outline-offset-[-3px]! ${
                    showFiles ? "" : "rounded-b-[calc(var(--radius-card)-1px)]"
                  }`}
                >
                  <span aria-hidden>{showFiles ? "▾" : "▸"}</span>
                  <span>files</span>
                  {!showFiles && (
                    <span className="truncate text-code-gutter">
                      · {fixtureFiles.length} in {fixtureSet}, read only
                    </span>
                  )}
                </button>
              )}
              {filesRow && showFiles && <FixtureFiles key={fixtureSet} id={filesId} set={fixtureSet} files={fixtureFiles} />}
            </div>
          </div>

          <div ref={outputRef} className="mt-2 flex min-h-[9rem] flex-[2] scroll-mb-2 scroll-mt-(--header-h) flex-col">
            <div className="flex shrink-0 items-center gap-1 pb-2">
              <h2 id={outputId} className="shrink-0 rounded-btn px-2.5 py-1 text-xs font-medium uppercase tracking-wider text-ink dark:text-gold">
                {panel.mode === "check" ? "Results" : "Output"}
              </h2>
              {features.exitBadge && panel.mode === "run" && <ExitBadge run={panel.run} />}
              {active === "practice" && panel.mode === "run" && panel.run.status === "idle" && (
                <span className="truncate text-xs text-ink-faint">
                  Run tries your code. Check runs it against {practice.tests.length} test
                  {practice.tests.length === 1 ? "" : "s"}
                  {typeTestCount > 0 && ` and ${typeTestCount} type test${typeTestCount === 1 ? "" : "s"}`}.
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
                <CheckResults check={panel.check} next={next ? { href: next.href, label: nextLabel(next) } : null} onGoTo={goTo} />
              ) : (
                <>
                  {features.typeCheck && panel.run.status === "done" && panel.run.compileCode != null && (
                    <TypeCheckStrip
                      output={panel.run.compileOutput}
                      failed={panel.run.compileCode !== 0}
                      fileName={lang.fileName}
                      onGoTo={goTo}
                      className="border-b border-content-line px-4 py-3"
                    />
                  )}
                  <OutputPanel run={panel.run} exitBadge={features.exitBadge} typeChecked={features.typeCheck} />
                </>
              )}
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

// The honesty rules, as the practice names them under its prompt.
const RULES: Record<ForbidRule, React.ReactNode> = {
  any: <Code>any</Code>,
  as: (
    <>
      <Code>as</Code> (except <Code>as const</Code>)
    </>
  ),
  "non-null": (
    <>
      a non-null <Code>!</Code>
    </>
  ),
  "ts-comments": (
    <>
      a <Code>@ts-</Code> comment
    </>
  ),
};

/** Code in a sentence, like the lessons' inline code. */
function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-content-line bg-raised px-1.5 py-0.5 font-mono text-[0.85em] font-medium text-ink">{children}</code>
  );
}

/** A worked example in the lesson: what it does, its code, what it runs
    with, what it prints (or the error it stops with), and why. */
function ExampleBlock({
  example,
  index,
  count,
  language,
  runnable,
  onOpen,
}: {
  example: LessonExample;
  index: number;
  count: number;
  language: string;
  runnable: RunnableContext;
  onOpen: () => void;
}) {
  const expect = example.expect ?? "run";
  // A crash that printed nothing shows just its errors.
  const showOutput = expect !== "runtime-error" || Boolean(example.output);
  // The exit status rides on the first of those labels.
  const exit =
    (example.exitCode ?? 0) !== 0 ? (
      <span className="ml-2 inline-block rounded-btn border border-line-strong px-1.5 font-mono text-[11px] leading-4 text-ink">
        exit {example.exitCode}
      </span>
    ) : null;
  return (
    <div id={exampleId(index)} className={`${index === 0 ? "mt-7" : "mt-8"} border-l-2 border-content-line pl-5 ${PLACE_MARGIN}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="eyebrow">{count > 1 ? `Example ${index + 1}` : "Example"}</p>
        <button
          type="button"
          onClick={onOpen}
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
      {example.args && example.args.length > 0 ? (
        <>
          <p className="mt-4 text-xs font-medium text-ink-faint">Arguments</p>
          <CopyableCodeBlock code={joinArgs(example.args)} label="Example arguments" className="mt-1.5" preClassName={CODE_BLOCK} />
        </>
      ) : null}
      {example.env && Object.keys(example.env).length > 0 ? (
        <>
          <p className="mt-4 text-xs font-medium text-ink-faint">Environment</p>
          <CopyableCodeBlock
            code={Object.entries(example.env)
              .map(([k, v]) => `${k}=${v}`)
              .join("\n")}
            label="Example environment"
            className="mt-1.5"
            preClassName={CODE_BLOCK}
          />
        </>
      ) : null}
      {example.stdin ? (
        <>
          <p className="mt-4 text-xs font-medium text-ink-faint">Input</p>
          <CopyableCodeBlock code={example.stdin} label="Example input" className="mt-1.5" preClassName={CODE_BLOCK} />
        </>
      ) : null}
      {/* Shown like the expected output in a practice prompt: a terminal
          block you can copy. A type error shows the checker's words instead,
          and a crash what it printed first, then its error. */}
      {showOutput ? (
        <>
          <p className="mt-4 text-xs font-medium text-ink-faint">
            {expect === "type-error" ? "Type errors" : "Output"}
            {exit}
          </p>
          <CopyableCodeBlock
            code={example.output}
            label={expect === "type-error" ? "Example type errors" : "Example output"}
            className="mt-1.5"
            preClassName={CODE_BLOCK}
          />
        </>
      ) : null}
      {example.errorIncludes ? (
        <>
          <p className="mt-4 text-xs font-medium text-ink-faint">
            Errors
            {!showOutput && exit}
          </p>
          <CopyableCodeBlock code={example.errorIncludes} label="Example errors" className="mt-1.5" preClassName={`${CODE_BLOCK} text-danger!`} />
        </>
      ) : null}
      <p className="mt-4 text-sm font-medium text-ink">How it works</p>
      <Prose md={example.explanation} className="mt-1 text-ink-muted" runnable={runnable} />
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
  /** Opens an example's tab (counting from 0). */
  onOpenExample: (index: number) => void;
  onOpenPractice: () => void;
}) {
  const { examples, practice } = step;
  const hints = practice.hints ?? [];
  const rules = practice.forbid ?? [];
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

      {examples.map((example, i) => (
        <ExampleBlock
          key={i}
          example={example}
          index={i}
          count={examples.length}
          language={language}
          runnable={runnable}
          onOpen={() => onOpenExample(i)}
        />
      ))}

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
        {/* The honesty rules a TypeScript practice is checked against. */}
        {rules.length > 0 && (
          <p className="mt-3 text-sm text-ink-muted">
            Check also fails code that uses{" "}
            {rules.map((rule, i) => (
              <span key={rule}>
                {i > 0 && (i < rules.length - 1 ? ", " : rules.length > 2 ? ", or " : " or ")}
                {RULES[rule]}
              </span>
            ))}
            .
          </p>
        )}
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
