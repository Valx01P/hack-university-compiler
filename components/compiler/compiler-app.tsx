"use client";

import Link from "next/link";
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { BookOpenText, FolderCode, GraduationCap, ListChecks, RotateCcw } from "lucide-react";
import { AnswerToggle } from "@/components/code/answer-toggle";
import { CmEditor } from "@/components/code/cm-editor";
import { EditorSettingsButton } from "@/components/code/editor-settings";
import { CodeThemePicker } from "@/components/code/code-theme";
import { ResetCodeButton } from "@/components/code/reset-code-button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { LangIcon } from "@/components/compiler/lang-icon";
import { OutputPanel } from "@/components/compiler/output-panel";
import { ReferencePanel, useReferenceData, type ReferenceTab } from "@/components/compiler/reference-panel";
import { FloatingNav } from "@/components/chrome/floating-nav";
import { useFullScreen } from "@/lib/full-screen";
import { cheatsheetPlace, readCompilerUrl, revealWorkspace, urlParam, writeUrl } from "@/lib/compiler-url";
import { runSummary, useReturnFocus } from "@/components/compiler/run-feedback";
import { SqlDatabase } from "@/components/compiler/sql-database";
import { SqlResults } from "@/components/compiler/sql-results";
import { CheckResults, checkSummary, type CheckState } from "@/components/learn/check-results";
import { isSql, onRunner, type CompilerLang } from "@/lib/compiler";
import { COMPILER_COURSES, courseRows } from "@/lib/courses";
import { judgeTest } from "@/lib/single-checks.mjs";
import type { SqlRun } from "@/lib/sql/core.mjs";
import {
  loadChallengeCode,
  markChallengeSolved,
  markChallengeViewed,
  saveChallengeCode,
  useChallengeProgress,
} from "@/lib/challenge-progress";
import { useResumeHref } from "@/lib/learn-progress";
import type { LessonRef } from "@/lib/learn-types";
import { normalizeOutput, runInSandbox, runTests, type RunState } from "@/lib/run-code";
import { joinArgs, splitArgs } from "@/lib/shell-words";
import { EASE, dur, gsap } from "@/lib/motion";

type Orient = "horizontal" | "vertical";

// The split is never saved, so every reload renders the default one with
// nothing to shift. It lives for this page load, which keeps it in place
// while you switch languages, along with the cheatsheet or challenges panel
// and the challenge you're on (every challenge exists in every language).
// Those are also kept in the address (lib/compiler-url.ts), so a reload
// opens them again.
const sessionLayout: {
  orient: Orient;
  splitPct: number;
  refOpen: boolean;
  refTab: ReferenceTab;
  refPct: number;
  challengeId: string | null;
} = {
  orient: "horizontal",
  splitPct: 55,
  refOpen: false,
  refTab: "cheatsheet",
  refPct: 55,
  challengeId: null,
};

const codeKey = (slug: string) => `hu-compiler-code:${slug}`;
const noop = () => {};

// The rail: every course with a compiler page, in the Learn icon rows'
// order, with a divider between the rows.
const RAIL = courseRows(COMPILER_COURSES);

/** Your code per language is the one thing saved across reloads. */
function savedCode(lang: CompilerLang): string {
  if (typeof window === "undefined") return lang.starter;
  try {
    return localStorage.getItem(codeKey(lang.slug)) ?? lang.starter;
  } catch {
    return lang.starter;
  }
}

export function CompilerApp({
  lang,
  lessons,
  playground: playgroundHref = null,
}: {
  lang: CompilerLang;
  /** Learn lessons in course order; empty when this language has no course. */
  lessons: LessonRef[];
  /** Where Open playground goes, once the course has a playground. */
  playground?: string | null;
}) {
  // Read while initializing, not in an effect, so the editor opens straight on
  // your code: no starter flash, and ⌘Z can't undo back to the starter. The
  // code never reaches the server markup (CodeMirror mounts client-side), so
  // hydration is unaffected.
  const [code, setCode] = useState(() => savedCode(lang));
  const [stdin, setStdin] = useState("");
  const [showStdin, setShowStdin] = useState(false);
  const stdinId = useId();
  // The command line, for courses whose programs take arguments (Bash). Like
  // stdin, it lasts for the visit.
  const [argsText, setArgsText] = useState("");
  const [run, setRun] = useState<RunState>({ status: "idle" });
  const [announcement, setAnnouncement] = useState("");
  const outputId = useId();
  const [orient, setOrient] = useState<Orient>(() => sessionLayout.orient);
  const [splitPct, setSplitPct] = useState(() => sessionLayout.splitPct);
  // Full screen, the same one Learn uses, lasts while you switch languages
  // and go to Learn and back. It's in the address (?full=1), and Escape
  // leaves it.
  const [full, setFull] = useFullScreen();

  // The cheatsheet or the challenges, in a panel on the right with the
  // output tucked under the editor (refTab says which).
  const [refOpen, setRefOpenState] = useState(() => sessionLayout.refOpen);
  const [refMounted, setRefMounted] = useState(() => sessionLayout.refOpen);
  const [refTab, setRefTabState] = useState<ReferenceTab>(() => sessionLayout.refTab);
  const [refPct, setRefPctState] = useState(() => sessionLayout.refPct);
  const { data: refData, error: refError } = useReferenceData(lang.slug, refOpen);
  const progress = useChallengeProgress(lang.slug);

  // The open challenge takes over the editor with its own saved code, until
  // you leave it. The answer eye and the check results belong to it.
  const [challengeId, setChallengeId] = useState<string | null>(() => sessionLayout.challengeId);
  const challenge = refOpen && challengeId ? refData?.challenges.find((c) => c.id === challengeId) ?? null : null;
  const challengeIndex = challenge && refData ? refData.challenges.indexOf(challenge) : -1;
  const nextChallenge = refData && challengeIndex >= 0 ? refData.challenges[challengeIndex + 1] ?? null : null;
  const previousChallenge = refData && challengeIndex > 0 ? refData.challenges[challengeIndex - 1] ?? null : null;
  const [challengeCodes, setChallengeCodes] = useState<Record<string, string>>({});
  const [challengeStdins, setChallengeStdins] = useState<Record<string, string>>({});
  const [challengeArgs, setChallengeArgs] = useState<Record<string, string>>({});
  const [answerFor, setAnswerFor] = useState<string | null>(null);
  const [unlockedFor, setUnlockedFor] = useState<string | null>(null);
  const [checkFor, setCheckFor] = useState<{ id: string; state: CheckState } | null>(null);

  // SQL's playground: one PostgreSQL database for the visit, results shown
  // as tables, and a view of the database itself.
  const sqlMode = isSql(lang.slug);
  const [sqlRun, setSqlRun] = useState<SqlRun | null>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [sqlView, setSqlView] = useState<"results" | "database">("results");
  const [dbVersion, setDbVersion] = useState(0);

  const running = run.status === "running";
  const checking = checkFor?.state.status === "checking";
  const busy = running || checking;
  // Run and Check are disabled while busy: from the keyboard, focus comes
  // back to them after, and a screen reader hears how it ended.
  const rememberRunButton = useReturnFocus(busy);

  const splitRef = useRef<HTMLDivElement>(null);
  const refGridRef = useRef<HTMLDivElement>(null);
  // With the panel open the output always sits under the editor.
  const effectiveOrient: Orient = refOpen ? "vertical" : orient;
  const orientRef = useRef(effectiveOrient);
  orientRef.current = effectiveOrient;

  // Learn picks up where you left off: the last part you opened while it's
  // still in the course, else the first lesson. The button keeps its size
  // either way, so nothing shifts.
  const learnHref = useResumeHref(lang.slug, lessons);

  // Opening a challenge counts as viewing it (also when you arrive on it from
  // another language).
  useEffect(() => {
    if (challenge) markChallengeViewed(lang.slug, challenge.id);
  }, [challenge, lang.slug]);

  const showingAnswer = Boolean(challenge && answerFor === challenge.id);
  const challengeCode = challenge
    ? challengeCodes[challenge.id] ?? loadChallengeCode(lang.slug, challenge.id, challenge.starter)
    : "";
  const editorCode = challenge ? (showingAnswer ? challenge.solution : challengeCode) : code;
  // A SQL challenge's input is its setup SQL plus the test's own setup.
  const challengeInput = (stdin: string | undefined) =>
    challenge && sqlMode ? [challenge.setup, stdin].filter((x) => x && x.trim()).join("\n") : stdin ?? "";
  const currentStdin = challenge ? challengeStdins[challenge.id] ?? challengeInput(challenge.tests[0]?.stdin) : stdin;
  const currentArgs = challenge ? challengeArgs[challenge.id] ?? joinArgs(challenge.tests[0]?.args ?? []) : argsText;
  const playground = sqlMode && !challenge;
  const checkState = challenge && checkFor?.id === challenge.id ? checkFor.state : null;

  function updateCode(next: string) {
    setCode(next);
    try {
      localStorage.setItem(codeKey(lang.slug), next);
    } catch {
      /* ignore */
    }
  }

  function updateEditor(next: string) {
    if (!challenge) return updateCode(next);
    setChallengeCodes((all) => ({ ...all, [challenge.id]: next }));
    saveChallengeCode(lang.slug, challenge.id, next, challenge.starter);
  }

  function setCurrentStdin(next: string) {
    if (challenge) setChallengeStdins((all) => ({ ...all, [challenge.id]: next }));
    else setStdin(next);
  }

  function setCurrentArgs(next: string) {
    if (challenge) setChallengeArgs((all) => ({ ...all, [challenge.id]: next }));
    else setArgsText(next);
  }

  function resetCode() {
    if (challenge) updateEditor(challenge.starter);
    else updateCode(lang.starter);
  }

  function setOrientation(next: Orient) {
    setOrient(next);
    sessionLayout.orient = next;
  }

  function setSplit(next: number) {
    const clamped = Math.min(80, Math.max(20, Math.round(next)));
    setSplitPct(clamped);
    sessionLayout.splitPct = clamped;
  }

  function setRefPct(next: number) {
    const clamped = Math.min(75, Math.max(30, Math.round(next)));
    setRefPctState(clamped);
    sessionLayout.refPct = clamped;
  }

  function setRefTab(tab: ReferenceTab) {
    setRefTabState(tab);
    sessionLayout.refTab = tab;
  }

  function openChallenge(id: string) {
    sessionLayout.challengeId = id;
    setChallengeId(id);
    setAnswerFor(null);
    setUnlockedFor(null);
    setCheckFor(null);
    setRun({ status: "idle" });
    setRefTab("challenges");
  }

  // Leaving a challenge hands the editor back to your own code. Coming back
  // later asks before showing its answer again.
  function leaveChallenge() {
    sessionLayout.challengeId = null;
    setChallengeId(null);
    setAnswerFor(null);
    setUnlockedFor(null);
    setCheckFor(null);
  }

  function setRefOpen(open: boolean) {
    sessionLayout.refOpen = open;
    setRefOpenState(open);
    if (open) setRefMounted(true);
    if (!open) leaveChallenge();
  }

  // A reload with a place in the address opens it again: the panel, its tab,
  // the challenge, and (for the cheatsheet) the search and section. The
  // workspace stays hidden until it's all there, so nothing pops in.
  const restoring = useRef(false);
  useLayoutEffect(() => {
    if (sqlMode && urlParam("view") === "database") setSqlView("database");
    const place = readCompilerUrl();
    if (!place.panel) return revealWorkspace();
    cheatsheetPlace.q = place.q;
    cheatsheetPlace.at = place.at;
    setRefTab(place.panel);
    if (place.panel === "challenges" && place.challenge) {
      sessionLayout.challengeId = place.challenge;
      setChallengeId(place.challenge);
    }
    setRefOpen(true);
    restoring.current = true;
    // Once, on load: the address is read before anything changes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLayoutEffect(() => {
    if (!restoring.current || (!refData && !refError)) return;
    restoring.current = false;
    // Two frames on, the editor has taken a restored challenge's code.
    requestAnimationFrame(() => requestAnimationFrame(revealWorkspace));
  }, [refData, refError]);
  // And the address follows along.
  useEffect(() => {
    const onChallenge = refOpen && refTab === "challenges" && challengeId;
    writeUrl(
      refOpen
        ? {
            panel: refTab,
            challenge: onChallenge ? challengeId : null,
            // The open challenge keeps its own hints in the address.
            hints: onChallenge ? undefined : null,
            q: cheatsheetPlace.q,
            at: cheatsheetPlace.at,
          }
        : { panel: null, challenge: null, hints: null, difficulty: null, status: null, q: null, at: null }
    );
  }, [refOpen, refTab, challengeId]);
  useEffect(() => {
    if (sqlMode) writeUrl({ view: sqlView === "database" ? "database" : null });
  }, [sqlMode, sqlView]);
  // The homepage brings you back to this compiler next time: the server sets
  // the HttpOnly hu-lang cookie the redirect in next.config.ts reads. Only a
  // real visit mounts this page, never a prefetch, so hovering the rail
  // doesn't move the homepage.
  useEffect(() => {
    void fetch("/api/lang", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-HU": "1" },
      body: JSON.stringify({ lang: lang.slug }),
    }).catch(() => {});
  }, [lang.slug]);

  // The panel slides in from the right when you open it, and back out before
  // the layout returns to side by side.
  const refPanelRef = useRef<HTMLElement>(null);
  const refSlideIn = useRef(false);
  const refClosing = useRef(false);
  function openReference() {
    refSlideIn.current = true;
    setRefOpen(true);
  }
  // Cheatsheet and Challenges each open the panel on themselves, switch it
  // over when it shows the other, and close it when they're already showing.
  // The buttons move between the output and the panel as it opens and
  // closes. When one of them (or the panel's close button) had keyboard
  // focus, focus follows to the same button in its new place.
  const refocusButton = useRef<ReferenceTab | null>(null);
  useLayoutEffect(() => {
    const tab = refocusButton.current;
    if (!tab) return;
    refocusButton.current = null;
    document.querySelector<HTMLElement>(`[data-panel-button="${tab}"]`)?.focus({ preventScroll: true });
  });
  function toggleReference(tab: ReferenceTab) {
    const keepFocus = document.activeElement instanceof HTMLElement && Boolean(document.activeElement.dataset.panelButton);
    if (refOpen && refTab === tab) return closeReference(keepFocus ? tab : null);
    if (keepFocus && !refOpen) refocusButton.current = tab;
    setRefTab(tab);
    if (!refOpen) openReference();
  }
  function closeReference(refocus: ReferenceTab | null = null) {
    const panel = refPanelRef.current;
    if (!panel) return setRefOpen(false);
    if (refClosing.current) return;
    refClosing.current = true;
    gsap.to(panel, {
      opacity: 0,
      x: 24,
      duration: dur(0.18),
      ease: EASE.in,
      overwrite: true,
      onComplete: () => {
        refClosing.current = false;
        refocusButton.current = refocus;
        setRefOpen(false);
      },
    });
  }
  useLayoutEffect(() => {
    const panel = refPanelRef.current;
    if (!refOpen || !refSlideIn.current || !panel) return;
    refSlideIn.current = false;
    gsap.fromTo(
      panel,
      { opacity: 0, x: 24 },
      { opacity: 1, x: 0, duration: dur(0.3), ease: EASE.slide, overwrite: true, clearProps: "opacity,transform" }
    );
  }, [refOpen]);

  async function execute() {
    setRun({ status: "running" });
    setCheckFor(null);
    setAnnouncement("");
    if (playground) {
      try {
        const { runPlayground } = await import("@/lib/sql/browser");
        const result = await runPlayground(editorCode);
        setSqlRun(result);
        setSqlError(null);
        setSqlView("results");
        setAnnouncement(result.error ? `Error: ${result.error.message}` : `Ran ${result.results.length} statement${result.results.length === 1 ? "" : "s"}.`);
      } catch (err) {
        setSqlError(`Couldn't start PostgreSQL: ${err instanceof Error ? err.message : String(err)}`);
      }
      setRun({ status: "idle" });
      setDbVersion((v) => v + 1);
      return;
    }
    const result = await runInSandbox(lang.slug, editorCode, currentStdin, { args: lang.args ? splitArgs(currentArgs) : undefined });
    const done: RunState = result.ok ? { status: "done", ...result.run } : { status: "error", error: result.error };
    setRun(done);
    setAnnouncement(runSummary(done));
  }

  async function checkChallenge() {
    if (!challenge || busy) return;
    const { id, tests } = challenge;
    const code = challengeCode;
    setRun({ status: "idle" });
    setAnnouncement("");
    setCheckFor({ id, state: { status: "checking", total: tests.length } });
    const outcome = await runTests(
      lang.slug,
      code,
      tests.map((t) => ({ stdin: challengeInput(t.stdin), args: t.args }))
    );
    const finish = (state: CheckState) => {
      setCheckFor({ id, state });
      setAnnouncement(checkSummary(state));
    };
    if (!outcome.ok) return finish({ status: "error", error: outcome.error });
    const { runs } = outcome;
    const compileError = runs.find((r) => r.compileCode != null && r.compileCode !== 0);
    if (compileError) return finish({ status: "compile-error", output: compileError.compileOutput || "Compilation failed." });
    // The runner's courses also want a clean exit (lib/single-checks.mjs),
    // and a failed test says what was wrong, since its output can be right.
    // The rest compare output, as they always have.
    const onTheRunner = onRunner(lang.slug);
    const results = runs.map((r, i) => {
      const timedOut = r.verdict === "TO";
      const judged = onTheRunner ? judgeTest(tests[i], { ...r, status: r.verdict }) : null;
      return {
        stdin: tests[i].stdin ?? "",
        expected: tests[i].output,
        actual: r.stdout,
        stderr: timedOut ? "Timed out. Your code ran too long (usually an infinite loop). It was stopped." : r.stderr,
        passed: judged ? judged.passed : !timedOut && normalizeOutput(r.stdout) === normalizeOutput(tests[i].output),
        ...(judged && !judged.passed ? { problems: judged.problems } : {}),
      };
    });
    if (results.every((r) => r.passed)) markChallengeSolved(lang.slug, id);
    finish({ status: "done", results, lessonComplete: false });
  }

  // Drag the divider between editor and output. Pointer capture keeps move
  // events flowing even when the cursor is over the code editor, and disabling
  // text selection stops the drag from highlighting code (the jank source).
  function startDrag(e: React.PointerEvent) {
    e.preventDefault();
    const container = splitRef.current;
    if (!container) return;
    const isH = orientRef.current === "horizontal";
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture?.(e.pointerId);
    const prevSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = isH ? "col-resize" : "row-resize";

    function move(ev: PointerEvent) {
      const r = container!.getBoundingClientRect();
      setSplit(
        isH
          ? ((ev.clientX - r.left) / r.width) * 100
          : ((ev.clientY - r.top) / r.height) * 100
      );
    }
    function up() {
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = prevCursor;
      handle.releasePointerCapture?.(e.pointerId);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  function nudgeSplit(delta: number) {
    setSplit(splitPct + delta);
  }

  const horizontal = effectiveOrient === "horizontal";
  const iconBtn =
    "inline-flex size-8 items-center justify-center rounded-btn text-ink-muted transition-colors hover:bg-raised hover:text-ink";
  const headerBtn =
    "inline-flex items-center gap-1.5 rounded-btn border border-line-strong px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-raised";

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
      className={`code-stdin-toggle flex ${lang.args ? "min-w-0 flex-1" : "w-full"} items-center gap-1 px-3 py-1.5 text-left font-mono text-xs font-medium text-code-gutter transition-colors [--ink:var(--code-ink)] focus-visible:outline-offset-[-3px]! ${
        showStdin ? "" : lang.args ? "rounded-bl-[calc(var(--radius-card)-1px)]" : "rounded-b-[calc(var(--radius-card)-1px)]"
      }`}
    >
      <span aria-hidden>{showStdin ? "▾" : "▸"}</span>
      <span>{sqlMode ? "setup (runs first)" : "stdin"}</span>
      {!showStdin && currentStdin ? (
        <span className="truncate text-code-gutter">· {currentStdin.split("\n")[0]}</span>
      ) : null}
    </button>
  );

  // Cheatsheet, Challenges, and Learn: above the output, or in the panel's
  // header while it's open, so they stay put and switching is one click.
  const panelButtons = (
    <>
      {(
        [
          ["cheatsheet", "Cheatsheet", BookOpenText],
          ["challenges", "Challenges", ListChecks],
        ] as const
      ).map(([tab, label, Icon]) => {
        const active = refOpen && refTab === tab;
        return (
          <button
            key={tab}
            type="button"
            data-panel-button={tab}
            onClick={() => toggleReference(tab)}
            aria-pressed={active}
            title={active ? `Close the ${label.toLowerCase()}` : `${lang.label} ${label.toLowerCase()}`}
            className={`${headerBtn} ${active ? "bg-raised" : ""}`}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </button>
        );
      })}
      {learnHref && (
        // Asks first, so a stray click doesn't leave the compiler.
        <ConfirmButton
          tooltip={`Learn ${lang.label} step by step`}
          title="Open Learn mode?"
          description={`Short lessons and practice problems for ${lang.label}. Your code here stays saved.`}
          confirmLabel="Open Learn"
          href={learnHref}
          className={headerBtn}
        >
          <GraduationCap className="size-3.5" aria-hidden />
          Learn
        </ConfirmButton>
      )}
      {playgroundHref && (
        // A whole project to work in, with files and a terminal. Your code
        // here stays saved.
        <Link href={playgroundHref} title={`A ${lang.label} project with files and a terminal`} className={headerBtn}>
          <FolderCode className="size-3.5" aria-hidden />
          Open playground
        </Link>
      )}
    </>
  );

  return (
    <div
      data-workspace
      className={`flex bg-canvas ${
        // In the shell the app fills the panel's content area exactly
        // (definite height on lg); on phones the panel isn't height-capped, so
        // fall back to a viewport-sized block.
        full ? "fixed inset-0 z-[100]" : "h-[calc(100dvh-4rem-1px)] lg:h-full lg:shrink-0"
      }`}
    >
      {/* Language rail: the Learn icon rows' courses in order, with a
          divider between the two rows */}
      <nav
        aria-label="Languages"
        className="slim-scroll flex w-12 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-line py-2 sm:w-14"
      >
        {RAIL.map((row, r) => (
          <Fragment key={r}>
            {r > 0 && <span aria-hidden className="my-1 h-px w-6 shrink-0 bg-line" />}
            {row.map((l) => {
              const active = l.slug === lang.slug;
              return (
                <Link
                  key={l.slug}
                  href={`/${l.slug}`}
                  title={`${l.label} compiler`}
                  aria-label={`${l.label} compiler`}
                  aria-current={active ? "page" : undefined}
                  className={`flex size-10 shrink-0 items-center justify-center rounded-btn transition-colors ${
                    active
                      ? "text-ink dark:text-gold"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  <LangIcon slug={l.slug} className="size-5" />
                </Link>
              );
            })}
          </Fragment>
        ))}
      </nav>

      {/* Main: the editor and output, plus the cheatsheet or challenges panel when it's open */}
      <div
        ref={refGridRef}
        className={`flex min-w-0 flex-1 flex-col ${
          refOpen ? "overflow-y-auto lg:grid lg:grid-cols-[var(--ref-left)_9px_minmax(0,1fr)] lg:overflow-hidden" : ""
        }`}
        style={refOpen ? ({ "--ref-left": `${refPct}%` } as React.CSSProperties) : undefined}
      >
        {/* Editor | output split */}
        <div
          ref={splitRef}
          className={`min-h-0 flex-1 ${refOpen ? "max-lg:h-[calc(100dvh-4rem-1px)] max-lg:shrink-0 lg:h-full" : ""} ${
            horizontal
              ? "flex flex-col lg:grid lg:grid-cols-[var(--compiler-left)_10px_minmax(0,1fr)] lg:gap-0 lg:overflow-hidden"
              : "flex flex-col lg:grid lg:grid-rows-[var(--split-pct)_10px_minmax(0,1fr)] lg:gap-0 lg:overflow-hidden"
          }`}
          style={
            {
              "--compiler-left": `${splitPct}%`,
              "--split-pct": `${splitPct}%`,
            } as React.CSSProperties
          }
        >
          {/* Editor pane */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col p-2 lg:flex-none">

            {/* Toolbar, right above the editor so Run is always close. A
                scroller clips what overflows it, so it gets padding (offset
                by negative margins) to keep the focus rings whole. */}
            <div className="slim-scroll -mx-1.5 -mt-1.5 flex shrink-0 items-center gap-2 overflow-x-auto px-1.5 pt-1.5 pb-3">
              <span className="shrink-0 font-mono text-sm font-medium">{lang.fileName}</span>
              {challenge && (
                <span className="min-w-0 truncate text-xs text-ink-faint">
                  {showingAnswer ? "The answer (read only, your code is kept)" : challenge.title}
                </span>
              )}
              <div className="ms-auto flex shrink-0 items-center gap-1">
                {!refOpen && (
                  <button
                    type="button"
                    onClick={() => setOrientation(horizontal ? "vertical" : "horizontal")}
                    title={horizontal ? "Stack output below" : "Output beside editor"}
                    aria-label="Toggle layout"
                    className={`${iconBtn} hidden lg:inline-flex`}
                  >
                    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="4" width="18" height="16" rx="1.5" />
                      {horizontal ? <path d="M12 4v16" /> : <path d="M3 12h18" />}
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setFull((v) => !v)}
                  title={full ? "Exit full screen" : "Full screen"}
                  aria-label="Toggle full screen"
                  className={`${iconBtn} hidden sm:inline-flex`}
                >
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                  </svg>
                </button>
                {challenge && (
                  <AnswerToggle
                    shown={showingAnswer}
                    unlocked={unlockedFor === challenge.id}
                    onShow={() => {
                      setAnswerFor(challenge.id);
                      setUnlockedFor(challenge.id);
                    }}
                    onHide={() => setAnswerFor(null)}
                    className={`${iconBtn} shrink-0`}
                  />
                )}
                {!showingAnswer && (
                  <ResetCodeButton
                    label="Reset to the starter code"
                    title="Reset to starter code?"
                    description={
                      challenge
                        ? "This replaces your code for this challenge with its starter."
                        : "This replaces what's in the editor with the original starter code."
                    }
                    onReset={resetCode}
                    className={`${iconBtn} shrink-0`}
                  />
                )}
                <EditorSettingsButton
                  buttonClassName={`${iconBtn} shrink-0`}
                  className="shrink-0"
                  tools={
                    <CodeThemePicker className="field w-full rounded-btn px-2 py-1.5 text-xs font-medium text-ink" />
                  }
                />
                <button
                  type="button"
                  onClick={(e) => {
                    rememberRunButton(e);
                    execute();
                  }}
                  disabled={busy}
                  // Greyed out while it runs, with the same label, so the
                  // bar never shifts.
                  aria-busy={running}
                  className={`shrink-0 rounded-btn border border-edge-strong text-sm font-medium disabled:opacity-50 ${
                    challenge ? "px-3 py-1.5 text-ink transition-colors hover:bg-raised" : "px-4 py-1.5 btn-grad"
                  }`}
                >
                  ▶ Run
                </button>
                {challenge && (
                  <button
                    type="button"
                    onClick={(e) => {
                      rememberRunButton(e);
                      checkChallenge();
                    }}
                    disabled={busy || showingAnswer}
                    aria-busy={checking}
                    title={showingAnswer ? "Close the answer to check your own code" : undefined}
                    className="shrink-0 rounded-btn border border-edge-strong px-4 py-1.5 text-sm font-medium btn-grad disabled:opacity-50"
                  >
                    Check
                  </button>
                )}
              </div>
            </div>
            <div className="code-dark flex min-h-0 flex-1 flex-col overflow-hidden rounded-card border border-code-line bg-code-bg">
              <div className="min-h-0 flex-1">
                <CmEditor
                  key={challenge ? `challenge:${challenge.id}:${showingAnswer ? "answer" : "code"}` : "scratch"}
                  value={editorCode}
                  language={lang.slug}
                  onChange={showingAnswer ? noop : updateEditor}
                  ariaLabel={showingAnswer ? "The answer, read only" : challenge ? `${challenge.title} editor` : `${lang.label} editor`}
                  readOnly={showingAnswer}
                />
              </div>
              {/* SQL's playground has no input: the database is the input. */}
              <div className={`shrink-0 border-t border-code-content-line bg-code-bg ${playground ? "hidden" : ""}`}>
                {lang.args ? (
                  // The command line goes beside stdin, on the same row. With
                  // no border of its own, the field shows focus the way the
                  // stdin toggle does (.code-args-field in globals.css).
                  <div className="flex items-stretch">
                    {stdinToggle}
                    <label
                      className={`code-args-field flex min-w-0 flex-1 items-center gap-2 border-l border-code-content-line ps-3 font-mono text-xs font-medium text-code-gutter ${
                        showStdin ? "" : "rounded-br-[calc(var(--radius-card)-1px)]"
                      }`}
                    >
                      <span className="shrink-0">args</span>
                      <input
                        type="text"
                        value={currentArgs}
                        onChange={(e) => setCurrentArgs(e.target.value)}
                        spellCheck={false}
                        autoComplete="off"
                        autoCapitalize="off"
                        placeholder="arguments for $1, $2..."
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
                    value={currentStdin}
                    onChange={(e) => setCurrentStdin(e.target.value)}
                    rows={2}
                    placeholder="Input passed to your program on stdin..."
                    className="code-stdin-input slim-scroll block w-full resize-none border-0 border-t border-code-content-line bg-code-bg px-3 py-2 font-mono text-base text-code-ink outline-none placeholder:text-code-gutter focus:outline-none sm:text-sm"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div
            role="separator"
            aria-orientation={horizontal ? "vertical" : "horizontal"}
            aria-label="Resize"
            aria-valuemin={20}
            aria-valuemax={80}
            aria-valuenow={splitPct}
            tabIndex={0}
            onPointerDown={startDrag}
            onDoubleClick={() => nudgeSplit(55 - splitPct)}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 10 : 5;
              if (horizontal && e.key === "ArrowLeft") {
                e.preventDefault();
                nudgeSplit(-step);
              } else if (horizontal && e.key === "ArrowRight") {
                e.preventDefault();
                nudgeSplit(step);
              } else if (!horizontal && e.key === "ArrowUp") {
                e.preventDefault();
                nudgeSplit(-step);
              } else if (!horizontal && e.key === "ArrowDown") {
                e.preventDefault();
                nudgeSplit(step);
              } else if (e.key === "Home") {
                e.preventDefault();
                nudgeSplit(20 - splitPct);
              } else if (e.key === "End") {
                e.preventDefault();
                nudgeSplit(80 - splitPct);
              }
            }}
            title="Drag to resize. Double-click to reset."
            className={`group hidden shrink-0 touch-none select-none outline-none lg:flex ${
              horizontal
                ? "cursor-col-resize items-stretch justify-center"
                : "cursor-row-resize items-center justify-center"
            }`}
          >
            <div
              className={`pointer-events-none bg-line transition-colors group-hover:bg-accent-strong group-focus-visible:bg-accent-strong group-active:bg-accent-strong ${
                horizontal ? "w-px group-hover:w-[2px]" : "h-px w-full group-hover:h-[2px]"
              }`}
            />
          </div>

          {/* Output (beside the editor, or under it) */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col p-2">
            {/* Padded for whole focus rings, like the toolbar. */}
            <div className="slim-scroll -mx-1.5 -mt-1.5 flex shrink-0 items-center gap-1 overflow-x-auto px-1.5 pt-1.5 pb-3">
              {playground ? (
                <div role="tablist" aria-label="Output" className="flex shrink-0 items-center gap-1">
                  {(["results", "database"] as const).map((v) => (
                    <button
                      key={v}
                      id={v === "results" ? outputId : undefined}
                      type="button"
                      role="tab"
                      aria-selected={sqlView === v}
                      onClick={() => setSqlView(v)}
                      className={`shrink-0 rounded-btn px-2.5 py-1 text-xs font-medium uppercase tracking-wider transition-colors ${
                        sqlView === v ? "bg-raised text-ink dark:text-gold" : "text-ink-faint hover:text-ink dark:hover:text-gold"
                      }`}
                    >
                      {v === "results" ? "Results" : "Database"}
                    </button>
                  ))}
                </div>
              ) : (
                <h2 id={outputId} className="shrink-0 rounded-btn px-2.5 py-1 text-xs font-medium uppercase tracking-wider text-ink dark:text-gold">
                  {checkState ? "Results" : "Output"}
                </h2>
              )}
              <div className="ms-auto flex shrink-0 items-center gap-1">
                {playground && (
                  <ConfirmButton
                    label="Reset the database"
                    title="Reset the database?"
                    description="This puts the sample tables and rows back and drops anything you created."
                    confirmLabel="Reset"
                    onConfirm={() => {
                      void import("@/lib/sql/browser")
                        .then((m) => m.resetPlayground())
                        .then(() => {
                          setSqlRun(null);
                          setDbVersion((v) => v + 1);
                        });
                    }}
                    className={`${iconBtn} size-7`}
                  >
                    <RotateCcw className="size-3.5" aria-hidden />
                  </ConfirmButton>
                )}
                {(run.status === "done" || checkState?.status === "done" || (playground && sqlRun && sqlView === "results")) && (
                  <button
                    type="button"
                    onClick={() => {
                      setRun({ status: "idle" });
                      setCheckFor(null);
                      setSqlRun(null);
                    }}
                    className="rounded-btn px-2.5 py-1 text-xs font-medium text-ink-faint transition-colors hover:text-ink"
                  >
                    Clear
                  </button>
                )}
                {!refOpen && panelButtons}
              </div>
            </div>

            {/* Focusable, so long output can be scrolled from the keyboard. */}
            <div
              role="region"
              aria-labelledby={outputId}
              tabIndex={0}
              className="code-terminal slim-scroll min-h-0 flex-1 overflow-auto rounded-card border border-line bg-surface"
            >
              {playground ? (
                sqlView === "database" ? (
                  <SqlDatabase version={dbVersion} />
                ) : running ? (
                  <p className="p-4 text-sm text-ink-faint">Running…</p>
                ) : sqlError ? (
                  <p className="p-4 font-mono text-sm text-danger">⚠ {sqlError}</p>
                ) : sqlRun ? (
                  <SqlResults run={sqlRun} />
                ) : (
                  <p className="p-4 text-sm text-ink-faint">
                    Press ▶ Run to query the sample database. The Database tab shows its tables.
                  </p>
                )
              ) : checkState ? (
                <CheckResults
                  check={checkState}
                  next={nextChallenge ? { onClick: () => openChallenge(nextChallenge.id), label: `Next challenge: ${nextChallenge.title}` } : null}
                />
              ) : (
                <OutputPanel run={run} />
              )}
            </div>
            <p role="status" className="sr-only">
              {announcement}
            </p>
          </div>
        </div>

        {refOpen && (
          <ResizeHandle
            label="Resize the code and the panel"
            value={refPct}
            min={30}
            max={75}
            step={5}
            bigStep={10}
            onChange={setRefPct}
            onDrag={(x) => {
              const r = refGridRef.current?.getBoundingClientRect();
              if (r && r.width > 0) setRefPct(((x - r.left) / r.width) * 100);
            }}
            onReset={() => setRefPct(55)}
            className="hidden lg:flex"
          />
        )}
        {/* Mounted from the first time it opens, then only hidden when closed,
            so it reopens exactly as you left it. */}
        {refMounted && (
          <ReferencePanel
            ref={refPanelRef}
            hidden={!refOpen}
            lang={lang.slug}
            langLabel={lang.label}
            data={refData}
            error={refError}
            tab={refTab}
            buttons={refOpen ? panelButtons : null}
            challenge={challenge}
            next={nextChallenge}
            previous={previousChallenge}
            progress={progress}
            onOpenChallenge={openChallenge}
            onLeaveChallenge={leaveChallenge}
            onClose={() => closeReference(refPanelRef.current?.contains(document.activeElement) ? refTab : null)}
          />
        )}
      </div>
      {/* In full screen the header is covered, so back, forward, and the
          theme picker float. */}
      {full && <FloatingNav />}
    </div>
  );
}
