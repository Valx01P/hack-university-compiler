"use client";

import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { BookOpenText, FolderCode, GraduationCap, ListChecks, RotateCcw } from "lucide-react";
import { AnswerToggle } from "@/components/code/answer-toggle";
import { CmEditor } from "@/components/code/cm-editor";
import { EditorSettingsButton } from "@/components/code/editor-settings";
import { inputCorners, setStdinOpen, stdinRows, useStdinOpen, type InputPlace } from "@/components/code/program-input";
import { CodeThemePicker } from "@/components/code/code-theme";
import { ResetCodeButton } from "@/components/code/reset-code-button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { OUTPUT_PAD, OutputPanel } from "@/components/compiler/output-panel";
import { ReferencePanel, useReferenceData, type ReferenceTab } from "@/components/compiler/reference-panel";
import { CourseRail } from "@/components/chrome/course-rail";
import { FloatingNav } from "@/components/chrome/floating-nav";
import { FULL_SCREEN_TITLE, useFullScreen } from "@/lib/full-screen";
import { cheatsheetPlace, readCompilerUrl, revealWorkspace, urlParam, writeUrl } from "@/lib/compiler-url";
import { runSummary, useReturnFocus } from "@/components/compiler/run-feedback";
import { SqlDatabase } from "@/components/compiler/sql-database";
import { SqlResults } from "@/components/compiler/sql-results";
import { CheckResults, checkSummary, type CheckState } from "@/components/learn/check-results";
import { isSql, onRunner, type CompilerLang } from "@/lib/compiler";
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
import { PANES, paneValue } from "@/lib/panes";
import { setPaneSize, usePaneSize } from "@/lib/pane-size";

type Orient = "horizontal" | "vertical";

// The splits (the editor and output side by side, and stacked, each on its
// own, and both beside the panel) are saved where you leave them and applied
// before first paint (lib/panes.ts). The rest lives for this page load, which
// keeps it in place while you switch languages: the layout, the cheatsheet or
// challenges panel, and the challenge you're on (every challenge exists in
// every language). Those are also kept in the address (lib/compiler-url.ts),
// so a reload opens them again.
const sessionLayout: {
  orient: Orient;
  refOpen: boolean;
  refTab: ReferenceTab;
  challengeId: string | null;
} = {
  orient: "horizontal",
  refOpen: false,
  refTab: "cheatsheet",
  challengeId: null,
};

const codeKey = (slug: string) => `hu-compiler-code:${slug}`;
const noop = () => {};

/** Your code per language is the one thing saved across reloads. */
function savedCode(lang: CompilerLang): string {
  if (typeof window === "undefined") return lang.starter;
  try {
    return localStorage.getItem(codeKey(lang.slug)) ?? lang.starter;
  } catch {
    return lang.starter;
  }
}

// The stacked split's border (the editor's share), and how far down a drag
// goes (past the output's smallest, at STACK.max) before the output folds
// away (at STACK.fold.at).
const STACK = PANES["compiler-stack"];
const STACK_FOLD_PAST = 90;

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
  // Folded at first, then as you leave it, saved (lib/stdin-shown.ts).
  const showStdin = useStdinOpen("compiler");
  const stdinId = useId();
  // The command line, for courses whose programs take arguments (Bash). Like
  // stdin, it lasts for the visit.
  const [argsText, setArgsText] = useState("");
  const [run, setRun] = useState<RunState>({ status: "idle" });
  const [announcement, setAnnouncement] = useState("");
  const outputId = useId();
  const [orient, setOrient] = useState<Orient>(() => sessionLayout.orient);
  const sideBySidePct = usePaneSize("compiler-split");
  const stackedPct = usePaneSize("compiler-stack");
  // Full screen, the same one Learn uses, lasts while you switch languages
  // and go to Learn and back. Its button hides the header first, then covers
  // the window. It's in the address (?full=semi, ?full=1), and Escape leaves
  // it.
  const [full, stepFull, screenMode] = useFullScreen();

  // The cheatsheet or the challenges, in a panel on the right with the
  // output tucked under the editor (refTab says which).
  const [refOpen, setRefOpenState] = useState(() => sessionLayout.refOpen);
  const [refMounted, setRefMounted] = useState(() => sessionLayout.refOpen);
  const [refTab, setRefTabState] = useState<ReferenceTab>(() => sessionLayout.refTab);
  const refPct = usePaneSize("compiler-ref");
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
  // Side by side and stacked are two borders, each kept where you left it.
  const splitPane = effectiveOrient === "horizontal" ? "compiler-split" : "compiler-stack";
  const splitPct = effectiveOrient === "horizontal" ? sideBySidePct : stackedPct;

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

  // The border of the layout showing now (read at the time, for a drag).
  function setSplit(next: number) {
    setPaneSize(orientRef.current === "horizontal" ? "compiler-split" : "compiler-stack", next);
  }

  // Running with the output folded away opens it at its smallest, to show
  // what came back.
  function unfoldOutput() {
    if (orientRef.current === "vertical" && stackedPct === STACK.fold.at) setPaneSize("compiler-stack", STACK.max);
  }

  function setRefPct(next: number) {
    setPaneSize("compiler-ref", next);
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
    unfoldOutput();
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
    unfoldOutput();
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
        ...(judged && !judged.passed ? { detail: { test: tests[i], run: r, problems: judged.problems } } : {}),
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
      const pct = isH ? ((ev.clientX - r.left) / r.width) * 100 : ((ev.clientY - r.top) / r.height) * 100;
      // Stacked, dragged well past the output's smallest, it folds away.
      setSplit(!isH && pct >= STACK_FOLD_PAST ? STACK.fold.at : pct);
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

  // Stacked, a step down from the output's smallest folds it away, and a step
  // up from folded opens it at its smallest.
  function nudgeSplit(delta: number) {
    if (stackFolded) return delta < 0 ? setSplit(STACK.max) : undefined;
    if (!horizontal && delta > 0 && splitPct >= STACK.max) return setSplit(STACK.fold.at);
    setSplit(splitPct + delta);
  }

  const horizontal = effectiveOrient === "horizontal";
  const stackFolded = !horizontal && stackedPct === STACK.fold.at;
  const iconBtn =
    "inline-flex size-8 items-center justify-center rounded-btn text-ink-muted transition-colors hover:bg-raised hover:text-ink";
  const headerBtn =
    "inline-flex items-center gap-1.5 rounded-btn border border-content-line-strong px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-raised";

  // The program's input: the stdin row (with the Arguments field beside it,
  // each half the row) and the open field. Side by side it's the code box's
  // last rows, and stacked it's a box of its own at the top of the output,
  // over what comes back. A phone stacks a side-by-side layout too, so it
  // renders in both places then and CSS shows the one that fits. The box
  // clips anything outside it, so focus rings sit inside, in the code text
  // color, rounded at the box's corners (inputCorners). Open or folded is by
  // CSS from <html> (the stdin-open: and stdin-closed: variants, inside
  // data-stdin-of), so a reload paints it as you left it.
  const programInput = (place: InputPlace) => {
    const id = `${stdinId}-${place}`;
    const toggle = (
      <button
        type="button"
        onClick={() => setStdinOpen("compiler", !showStdin)}
        aria-expanded={showStdin}
        aria-controls={id}
        className={`code-stdin-toggle flex ${lang.args ? "min-w-0 flex-1" : "w-full"} items-center gap-1 px-3 py-1.5 text-left font-mono text-xs font-medium text-code-gutter transition-colors [--ink:var(--code-ink)] focus-visible:outline-offset-[-3px]! ${inputCorners(
          place,
          lang.args ? "left" : "whole"
        )}`}
      >
        <span aria-hidden className="stdin-open:hidden">▸</span>
        <span aria-hidden className="stdin-closed:hidden">▾</span>
        <span>{sqlMode ? "setup (runs first)" : "stdin"}</span>
        {currentStdin ? <span className="truncate text-code-gutter stdin-open:hidden">· {currentStdin.split("\n")[0]}</span> : null}
      </button>
    );
    return (
      <>
        {lang.args ? (
          // With no border of its own, the Arguments field shows focus the
          // way the stdin toggle does (.code-args-field in globals.css).
          <div className="flex items-stretch">
            {toggle}
            <label
              className={`code-args-field flex min-w-0 flex-1 items-center gap-2 border-l border-code-content-line ps-3 font-mono text-xs font-medium text-code-gutter ${inputCorners(place, "right")}`}
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
          toggle
        )}
        <textarea
          id={id}
          value={currentStdin}
          onChange={(e) => setCurrentStdin(e.target.value)}
          rows={stdinRows(currentStdin)}
          placeholder="Input passed to your program on stdin..."
          className="code-stdin-input slim-scroll block w-full resize-none border-0 border-t border-code-content-line bg-transparent px-3 py-2 font-mono text-base text-code-ink outline-none placeholder:text-code-gutter focus:outline-none stdin-closed:hidden sm:text-sm"
        />
      </>
    );
  };

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
        full ? "fixed inset-0 z-[100]" : "h-[calc(100dvh_-_var(--header-h))] lg:h-full lg:shrink-0"
      }`}
    >
      {/* Language rail: every course, in the Learn icon rows' order */}
      <CourseRail current={lang.slug} />

      {/* Main: the editor and output, plus the cheatsheet or challenges panel when it's open */}
      <div
        ref={refGridRef}
        className={`flex min-w-0 flex-1 flex-col ${
          refOpen ? "overflow-y-auto lg:grid lg:grid-cols-[var(--ref-left)_9px_minmax(0,1fr)] lg:overflow-hidden" : ""
        }`}
        style={refOpen ? ({ "--ref-left": paneValue("compiler-ref") } as React.CSSProperties) : undefined}
      >
        {/* Editor | output split. On a phone with a panel open it's a screen
            tall, the panel under it (not flex-1's share, which the panel's
            own height would leave at almost nothing). */}
        <div
          ref={splitRef}
          data-split={horizontal ? undefined : "stack"}
          className={`min-h-0 flex-1 ${refOpen ? "max-lg:h-[calc(100dvh_-_var(--header-h))] max-lg:flex-none lg:h-full" : ""} ${
            horizontal
              ? "flex flex-col lg:grid lg:grid-cols-[var(--compiler-left)_10px_minmax(0,1fr)] lg:gap-0 lg:overflow-hidden"
              : "flex flex-col lg:grid lg:grid-rows-[var(--split-pct)_10px_minmax(0,1fr)] lg:gap-0 lg:overflow-hidden"
          }`}
          style={
            {
              "--compiler-left": paneValue("compiler-split"),
              "--split-pct": paneValue("compiler-stack"),
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
                  onClick={stepFull}
                  title={FULL_SCREEN_TITLE[screenMode]}
                  aria-label="Toggle full screen"
                  aria-pressed={screenMode === "full" ? true : screenMode === "semi" ? "mixed" : false}
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
              {/* Side by side, the program's input is the box's last rows (only
                  on wide screens, a phone stacking them). SQL's playground has
                  none: the database is the input. */}
              {!playground && horizontal && (
                <div data-stdin-of="compiler" className="hidden shrink-0 border-t border-code-content-line bg-code-bg lg:block">
                  {programInput("editor")}
                </div>
              )}
            </div>
          </div>

          {/* Divider */}
          <div
            role="separator"
            aria-orientation={horizontal ? "vertical" : "horizontal"}
            aria-label="Resize"
            aria-valuemin={20}
            aria-valuemax={horizontal ? 80 : STACK.fold.at}
            aria-valuenow={splitPct}
            aria-valuetext={stackFolded ? "Output folded away" : undefined}
            tabIndex={0}
            onPointerDown={startDrag}
            onDoubleClick={() => setSplit(PANES[splitPane].initial)}
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
                // Stacked, the end is the output folded away.
                e.preventDefault();
                setSplit(horizontal ? 80 : STACK.fold.at);
              }
            }}
            title={horizontal ? "Drag to resize. Double-click to reset." : "Drag to resize, all the way down to fold the output away. Double-click to reset."}
            className={`group hidden shrink-0 touch-none select-none outline-none lg:flex ${
              horizontal
                ? "cursor-col-resize items-stretch justify-center"
                : "cursor-row-resize items-center justify-center"
            }`}
          >
            <div
              className={`pointer-events-none bg-line transition-colors handle-hover:bg-accent-strong group-focus-visible:bg-accent-strong handle-active:bg-accent-strong ${
                horizontal ? "w-px handle-hover:w-[2px]" : "h-px w-full handle-hover:h-[2px]"
              }`}
            />
          </div>

          {/* Output (beside the editor, or under it, where it can fold away) */}
          <div data-split-output className="flex min-h-0 min-w-0 flex-1 flex-col p-2">
            {/* Padded for whole focus rings, like the toolbar. Under the
                editor it goes, for the height (its label still naming the
                output), or only its label while it holds the panel buttons.
                SQL's tabs stay, being buttons. */}
            <div
              className={`slim-scroll -mx-1.5 -mt-1.5 flex shrink-0 items-center gap-1 overflow-x-auto px-1.5 pt-1.5 pb-3 ${
                refOpen && !playground ? "hidden" : ""
              }`}
            >
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
                <h2
                  id={outputId}
                  className={`shrink-0 rounded-btn px-2.5 py-1 text-xs font-medium uppercase tracking-wider text-ink dark:text-gold ${
                    horizontal ? "max-lg:hidden" : "hidden"
                  }`}
                >
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

            {/* Stacked, the program's input sits over what comes back (on a
                phone too, side by side or not). */}
            {!playground && (
              <div
                data-stdin-of="compiler"
                className={`code-dark mb-2 shrink-0 overflow-hidden rounded-card border border-code-line bg-code-bg ${horizontal ? "lg:hidden" : ""}`}
              >
                {programInput("output")}
              </div>
            )}

            {/* Focusable, so long output can be scrolled from the keyboard.
                What it says sits closer to its top and bottom under the
                editor (on phones too), where height is short (OUTPUT_PAD). */}
            <div
              role="region"
              aria-labelledby={outputId}
              tabIndex={0}
              className={`code-terminal slim-scroll min-h-0 flex-1 overflow-auto rounded-card border border-line bg-surface [--output-py:0.5rem] ${
                horizontal ? "lg:[--output-py:1rem]" : ""
              }`}
            >
              {playground ? (
                sqlView === "database" ? (
                  <SqlDatabase version={dbVersion} />
                ) : running ? (
                  <p className={`${OUTPUT_PAD} text-sm text-ink-faint`}>Running…</p>
                ) : sqlError ? (
                  <p className={`${OUTPUT_PAD} font-mono text-sm text-danger`}>⚠ {sqlError}</p>
                ) : sqlRun ? (
                  <SqlResults run={sqlRun} />
                ) : (
                  <p className={`${OUTPUT_PAD} text-sm text-ink-faint`}>
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
            onReset={() => setRefPct(PANES["compiler-ref"].initial)}
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
      <FloatingNav />
    </div>
  );
}
