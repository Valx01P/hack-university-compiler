"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { CmEditor } from "@/components/code/cm-editor";
import { EditorSettingsButton } from "@/components/code/editor-settings";
import { CodeThemePicker } from "@/components/code/code-theme";
import { OutputPanel } from "@/components/compiler/output-panel";
import { AnchoredPanel } from "@/components/ui/anchored-panel";
import { CopyableCodeBlock } from "@/components/ui/copyable-code-block";
import { LessonMarkdown } from "@/components/learn/lesson-md";
import { CompleteIcon } from "@/components/learn/complete-icon";
import { CheckResults, type CheckState } from "@/components/learn/check-results";
import { Highlight } from "@/lib/highlight";
import type { CompilerLang } from "@/lib/compiler";
import { problemId, type Lesson, type LessonMeta } from "@/lib/learn-types";
import { clearCode, loadCode, markSolved, saveCode, setLastLesson, useSolved } from "@/lib/learn-progress";
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
  const solved = useSolved(lang.slug);
  const isSolved = (step: number) => solved.has(problemId(lesson.id, step));
  const complete = lesson.steps.every((_, i) => isSolved(i));
  const tabs: Tab[] = lesson.steps.flatMap((_, step) => [
    { kind: "example" as const, step },
    { kind: "practice" as const, step },
  ]);
  const many = lesson.steps.length > 1;

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
  const [busy, setBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const resetAnchorRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const key = tabKey(active);
  const code = codes[key];
  const stdin = stdins[key];
  const panel: Panel = panels[key] ?? { mode: "run", run: { status: "idle" } };

  useEffect(() => {
    setLastLesson(lang.slug, lesson.id);
  }, [lang.slug, lesson.id]);

  function openTab(t: Tab) {
    setActive(t);
    setShowStdin(stdins[tabKey(t)] !== "");
    // On narrow screens the editor sits below the lesson: bring it into view.
    if (window.innerWidth < 1024) editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function updateCode(next: string) {
    setCodes((c) => ({ ...c, [key]: next }));
    saveCode(lang.slug, lesson.id, key, next);
  }

  function resetTab() {
    setCodes((c) => ({ ...c, [key]: defaultCode(active) }));
    setStdins((s) => ({ ...s, [key]: defaultStdin(active) }));
    setPanels((p) => ({ ...p, [key]: { mode: "run", run: { status: "idle" } } }));
    clearCode(lang.slug, lesson.id, key);
  }

  const setPanel = (k: string, p: Panel) => setPanels((all) => ({ ...all, [k]: p }));

  async function run() {
    const k = key;
    setBusy(true);
    setPanel(k, { mode: "run", run: { status: "running" } });
    const result = await runInSandbox(lang.slug, code, stdin);
    setPanel(k, { mode: "run", run: result.ok ? { status: "done", ...result.run } : { status: "error", error: result.error } });
    setBusy(false);
  }

  async function check() {
    const k = key;
    const step = active.step;
    const { tests } = lesson.steps[step].practice;
    setBusy(true);
    setPanel(k, { mode: "check", check: { status: "checking", total: tests.length } });
    const outcomes = await Promise.all(
      tests.map((t) => runInSandbox(lang.slug, code, t.stdin ?? "", { refreshStatus: false }))
    );
    refreshSandboxStatus();
    setBusy(false);

    const failed = outcomes.find((o) => !o.ok);
    if (failed && !failed.ok) return setPanel(k, { mode: "check", check: { status: "error", error: failed.error } });
    const runs = outcomes.map((o) => (o.ok ? o.run : null)).filter((r) => r !== null);
    const compileError = runs.find((r) => r.compileCode != null && r.compileCode !== 0);
    if (compileError) {
      return setPanel(k, { mode: "check", check: { status: "compile-error", output: compileError.compileOutput || "Compilation failed." } });
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
    setPanel(k, { mode: "check", check: { status: "done", results, lessonComplete } });
  }

  const tabLabel = (t: Tab) =>
    `${t.kind === "example" ? "Example" : "Your code"}${many ? ` ${t.step + 1}` : ""}`;
  const iconBtn =
    "inline-flex size-8 items-center justify-center rounded-btn text-ink-muted transition-colors hover:bg-raised hover:text-ink";
  const nextLink = next ? { href: `/${lang.slug}/learn/${next.id}`, title: next.title } : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Left: the lesson */}
      <div className="slim-scroll relative flex min-h-0 flex-col lg:overflow-y-auto lg:border-r lg:border-edge">
        <article className="mx-auto w-full max-w-[46rem] flex-1 px-5 pb-10 pt-6 sm:px-7">
          <p className="eyebrow">
            {lesson.section} · Lesson {position.index + 1} of {position.total}
          </p>
          <h1 className="font-display mt-2 text-headline">{lesson.title}</h1>
          {complete && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-ink">
              <CompleteIcon /> Lesson complete
            </p>
          )}
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

        {/* Floating lesson nav: only Next on the first lesson, only Prev on the last. */}
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
      </div>

      {/* Right: the editor */}
      <div ref={editorRef} className="flex h-[88dvh] min-h-0 min-w-0 flex-col p-2 lg:h-auto">
        <div role="tablist" aria-label="Editor tabs" className="slim-scroll flex shrink-0 items-center gap-1 overflow-x-auto pb-2">
          {tabs.map((t) => {
            const selected = tabKey(t) === key;
            return (
              <button
                key={tabKey(t)}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => openTab(t)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-btn px-2.5 py-1 text-xs font-medium uppercase tracking-wider transition-colors ${
                  selected ? "bg-raised text-ink dark:text-gold" : "text-ink-faint hover:text-ink dark:hover:text-gold"
                }`}
              >
                {tabLabel(t)}
                {t.kind === "practice" && isSolved(t.step) && <CompleteIcon className="size-3" />}
              </button>
            );
          })}
        </div>

        <div className="slim-scroll flex shrink-0 items-center gap-2 overflow-x-auto pb-2">
          <span className="shrink-0 font-mono text-sm font-medium">{lang.fileName}</span>
          <span className="hidden truncate text-xs text-ink-faint sm:inline">
            {active.kind === "example"
              ? lesson.steps[active.step].example.title
              : lesson.steps[active.step].practice.title}
          </span>
          <div className="ms-auto flex shrink-0 items-center gap-1">
            <button
              ref={resetAnchorRef}
              type="button"
              onClick={() => setResetOpen((v) => !v)}
              aria-label={active.kind === "example" ? "Reset to the original example" : "Reset to the starter code"}
              title={active.kind === "example" ? "Reset to the original example" : "Reset to the starter code"}
              aria-pressed={resetOpen}
              className={iconBtn}
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3c-2 0-3 1-3 3v3c0 1-1 2-2 2 1 0 2 1 2 2v3c0 2 1 3 3 3" />
                <path d="M16 3c2 0 3 1 3 3v3c0 1 1 2 2 2-1 0-2 1-2 2v3c0 2-1 3-3 3" />
              </svg>
            </button>
            <AnchoredPanel
              anchorRef={resetAnchorRef}
              open={resetOpen}
              onClose={() => setResetOpen(false)}
              align="right"
              className="z-[130] w-60 rounded-card border border-edge bg-surface p-3 text-sm shadow-[var(--shadow-card)]"
            >
              <p className="font-medium text-ink">
                {active.kind === "example" ? "Reset this example?" : "Reset to the starter code?"}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                This replaces what&apos;s in this tab with the original code.
              </p>
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetOpen(false)}
                  className="rounded-btn px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-raised hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetTab();
                    setResetOpen(false);
                  }}
                  className="rounded-btn border border-edge-strong px-3 py-1.5 text-xs font-medium btn-grad"
                >
                  Reset
                </button>
              </div>
            </AnchoredPanel>
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
                  {busy && panel.mode === "check" ? "Checking…" : "Check"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={run}
                disabled={busy}
                className="shrink-0 rounded-btn border border-edge-strong px-4 py-1.5 text-sm font-medium btn-grad disabled:opacity-50"
              >
                {busy ? "Running…" : "▶ Run"}
              </button>
            )}
          </div>
        </div>

        <div className="code-dark flex min-h-0 flex-[3] flex-col overflow-hidden rounded-card border border-code-edge bg-code-bg">
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
            <button
              type="button"
              onClick={() => setShowStdin((v) => !v)}
              className="code-stdin-toggle flex w-full items-center gap-1 px-3 py-1.5 text-left font-mono text-xs font-medium text-code-gutter transition-colors"
            >
              <span aria-hidden>{showStdin ? "▾" : "▸"}</span>
              <span>stdin</span>
              {!showStdin && stdin ? <span className="truncate text-code-gutter">· {stdin.split("\n")[0]}</span> : null}
            </button>
            {showStdin && (
              <textarea
                value={stdin}
                onChange={(e) => setStdins((s) => ({ ...s, [key]: e.target.value }))}
                rows={2}
                placeholder="Input passed to your program on stdin..."
                className="code-stdin-input slim-scroll block w-full resize-none border-0 border-t border-code-edge bg-code-bg px-3 py-2 font-mono text-base text-code-ink outline-none placeholder:text-code-gutter focus:outline-none sm:text-sm"
              />
            )}
          </div>
        </div>

        <div className="mt-2 flex min-h-[9rem] flex-[2] flex-col">
          <div className="flex shrink-0 items-center gap-1 pb-2">
            <h2 className="shrink-0 rounded-btn px-2.5 py-1 text-xs font-medium uppercase tracking-wider text-ink dark:text-gold">
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
          <div className="slim-scroll min-h-0 flex-1 overflow-auto rounded-card border border-edge bg-surface">
            {panel.mode === "check" ? <CheckResults check={panel.check} next={nextLink} /> : <OutputPanel run={panel.run} />}
          </div>
        </div>
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
        <CopyableCodeBlock code={example.code} className="mt-3" preClassName={CODE_BLOCK}>
          <Highlight code={example.code} language={language} />
        </CopyableCodeBlock>
        {example.stdin ? (
          <>
            <p className="mt-4 text-xs font-medium text-ink-faint">Input</p>
            <pre className={PLAIN_BLOCK}>{example.stdin}</pre>
          </>
        ) : null}
        <p className="mt-4 text-xs font-medium text-ink-faint">Output</p>
        <pre className={PLAIN_BLOCK}>{example.output}</pre>
        <p className="mt-4 text-sm font-medium text-ink">How it works</p>
        <Prose md={example.explanation} className="mt-1 text-ink-muted" />
      </div>

      <div className="mt-8 border-l-2 border-edge-strong pl-5">
        <p className="eyebrow flex items-center gap-1.5">
          {solved && <CompleteIcon className="size-3.5" />}
          {solved ? "Your turn · solved" : "Your turn"}
        </p>
        <h3 className="mt-1.5 font-medium text-ink">{practice.title}</h3>
        <Prose md={practice.prompt} className="mt-1.5" />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenPractice}
            className="inline-flex items-center gap-1.5 rounded-btn border border-edge-strong px-3 py-1.5 text-xs font-medium btn-grad"
          >
            {solved ? "Open your code" : "Start coding"}
            <ArrowRight className="size-3.5" aria-hidden />
          </button>
          {hints.length > 0 && hintsShown < hints.length && (
            <button
              type="button"
              onClick={() => setHintsShown((n) => n + 1)}
              className="rounded-btn px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-raised hover:text-ink"
            >
              {hintsShown === 0 ? "Show a hint" : `Another hint (${hintsShown}/${hints.length})`}
            </button>
          )}
          {solution !== "shown" && (
            <button
              type="button"
              onClick={() => setSolution(solution === "armed" ? "shown" : "armed")}
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
              <li key={i}>
                <Prose md={h} />
              </li>
            ))}
          </ol>
        )}
        {solution === "shown" && (
          <div className="mt-4">
            <p className="text-xs font-medium text-ink-faint">One solution</p>
            <CopyableCodeBlock code={practice.solution} className="mt-1.5" preClassName={CODE_BLOCK}>
              <Highlight code={practice.solution} language={language} />
            </CopyableCodeBlock>
          </div>
        )}
      </div>
    </section>
  );
}
