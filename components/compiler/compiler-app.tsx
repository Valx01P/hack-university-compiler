"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { GraduationCap } from "lucide-react";
import { CmEditor } from "@/components/code/cm-editor";
import { EditorSettingsButton } from "@/components/code/editor-settings";
import { CodeThemePicker } from "@/components/code/code-theme";
import { ResetCodeButton } from "@/components/code/reset-code-button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { LangIcon } from "@/components/compiler/lang-icon";
import { OutputPanel } from "@/components/compiler/output-panel";
import { runSummary, useReturnFocus } from "@/components/compiler/run-feedback";
import { COMPILER_LANGS, type CompilerLang } from "@/lib/compiler";
import { useResumeHref } from "@/lib/learn-progress";
import type { LessonRef } from "@/lib/learn-types";
import { runInSandbox, type RunState } from "@/lib/run-code";

type Orient = "horizontal" | "vertical";

// The layout is never saved, so every reload renders the default split with
// nothing to restore and nothing to shift. It only lives for this page load,
// which keeps it in place while you switch languages.
const sessionLayout: { orient: Orient; splitPct: number } = {
  orient: "horizontal",
  splitPct: 55,
};

const codeKey = (slug: string) => `hu-compiler-code:${slug}`;

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
}: {
  lang: CompilerLang;
  /** Learn lessons in course order; empty when this language has no course. */
  lessons: LessonRef[];
}) {
  // Read while initializing, not in an effect, so the editor opens straight on
  // your code: no starter flash, and ⌘Z can't undo back to the starter. The
  // code never reaches the server markup (CodeMirror mounts client-side), so
  // hydration is unaffected.
  const [code, setCode] = useState(() => savedCode(lang));
  const [stdin, setStdin] = useState("");
  const [showStdin, setShowStdin] = useState(false);
  const stdinId = useId();
  const [run, setRun] = useState<RunState>({ status: "idle" });
  const running = run.status === "running";
  // Run is disabled while it runs: from the keyboard, focus comes back to it
  // after, and a screen reader hears how the run ended.
  const rememberRunButton = useReturnFocus(running);
  const [announcement, setAnnouncement] = useState("");
  const outputId = useId();
  const [orient, setOrient] = useState<Orient>(() => sessionLayout.orient);
  const [splitPct, setSplitPct] = useState(() => sessionLayout.splitPct);
  const [full, setFull] = useState(false);

  const splitRef = useRef<HTMLDivElement>(null);
  const orientRef = useRef(orient);
  orientRef.current = orient;

  // Learn picks up where you left off: the last part you opened while it's
  // still in the course, else the first lesson. The button keeps its size
  // either way, so nothing shifts.
  const learnHref = useResumeHref(lang.slug, lessons);

  function updateCode(next: string) {
    setCode(next);
    try {
      localStorage.setItem(codeKey(lang.slug), next);
    } catch {
      /* ignore */
    }
  }

  function resetCode() {
    updateCode(lang.starter);
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

  async function execute() {
    setRun({ status: "running" });
    setAnnouncement("");
    const result = await runInSandbox(lang.slug, code, stdin);
    const done: RunState = result.ok ? { status: "done", ...result.run } : { status: "error", error: result.error };
    setRun(done);
    setAnnouncement(runSummary(done));
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

  const horizontal = orient === "horizontal";
  const iconBtn =
    "inline-flex size-8 items-center justify-center rounded-btn text-ink-muted transition-colors hover:bg-raised hover:text-ink";

  return (
    <div
      className={`flex bg-canvas ${
        // In the shell the app fills the panel's content area exactly
        // (definite height on lg); on phones the panel isn't height-capped, so
        // fall back to a viewport-sized block.
        full ? "fixed inset-0 z-[100]" : "h-[calc(100dvh-4rem-1px)] lg:h-full lg:shrink-0"
      }`}
    >
      {/* Language rail */}
      <nav
        aria-label="Languages"
        className="slim-scroll flex w-12 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-edge py-2 sm:w-14"
      >
        {COMPILER_LANGS.map((l) => {
          const active = l.slug === lang.slug;
          return (
            <Link
              key={l.slug}
              href={`/${l.slug}`}
              title={`${l.label} compiler`}
              aria-label={`${l.label} compiler`}
              aria-current={active ? "page" : undefined}
              className={`flex size-10 items-center justify-center rounded-btn transition-colors ${
                active
                  ? "text-ink dark:text-gold"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              <LangIcon slug={l.slug} className="size-5" />
            </Link>
          );
        })}
      </nav>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Editor | output split */}
        <div
          ref={splitRef}
          className={`min-h-0 flex-1 ${
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
              <div className="ms-auto flex shrink-0 items-center gap-1">
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
                <ResetCodeButton
                  label="Reset to the starter code"
                  title="Reset to starter code?"
                  description="This replaces what's in the editor with the original starter code."
                  onReset={resetCode}
                  className={`${iconBtn} shrink-0`}
                />
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
                  disabled={running}
                  className="shrink-0 rounded-btn border border-edge-strong px-4 py-1.5 text-sm font-medium btn-grad disabled:opacity-50"
                >
                  {running ? "Running…" : "▶ Run"}
                </button>
              </div>
            </div>
            <div className="code-dark flex min-h-0 flex-1 flex-col overflow-hidden rounded-card border border-code-edge bg-code-bg">
              <div className="min-h-0 flex-1">
                <CmEditor
                  value={code}
                  language={lang.slug}
                  onChange={updateCode}
                  ariaLabel={`${lang.label} editor`}
                />
              </div>
              <div className="shrink-0 border-t border-code-edge bg-code-bg">
                {/* The code box clips anything outside it, so this focus ring
                    sits inside the button (rounded like the box's corners
                    when it's the last row), in the code text color. */}
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
                  {!showStdin && stdin ? (
                    <span className="truncate text-code-gutter">· {stdin.split("\n")[0]}</span>
                  ) : null}
                </button>
                {showStdin && (
                  <textarea
                    id={stdinId}
                    value={stdin}
                    onChange={(e) => setStdin(e.target.value)}
                    rows={2}
                    placeholder="Input passed to your program on stdin..."
                    className="code-stdin-input slim-scroll block w-full resize-none border-0 border-t border-code-edge bg-code-bg px-3 py-2 font-mono text-base text-code-ink outline-none placeholder:text-code-gutter focus:outline-none sm:text-sm"
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
              className={`pointer-events-none bg-edge transition-colors group-hover:bg-accent-strong group-focus-visible:bg-accent-strong group-active:bg-accent-strong ${
                horizontal ? "w-px group-hover:w-[2px]" : "h-px w-full group-hover:h-[2px]"
              }`}
            />
          </div>

          {/* Right pane: output */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col p-2">
            {/* Padded for whole focus rings, like the toolbar. */}
            <div className="slim-scroll -mx-1.5 -mt-1.5 flex shrink-0 items-center gap-1 overflow-x-auto px-1.5 pt-1.5 pb-3">
              <h2 id={outputId} className="shrink-0 rounded-btn px-2.5 py-1 text-xs font-medium uppercase tracking-wider text-ink dark:text-gold">
                Output
              </h2>
              <div className="ms-auto flex shrink-0 items-center gap-1">
                {run.status === "done" && (
                  <button
                    type="button"
                    onClick={() => setRun({ status: "idle" })}
                    className="rounded-btn px-2.5 py-1 text-xs font-medium text-ink-faint transition-colors hover:text-ink"
                  >
                    Clear
                  </button>
                )}
                {learnHref && (
                  // Asks first, so a stray click doesn't leave the compiler.
                  <ConfirmButton
                    tooltip={`Learn ${lang.label} step by step`}
                    title="Open Learn mode?"
                    description={`Short lessons and practice problems for ${lang.label}. Your code here stays saved.`}
                    confirmLabel="Open Learn"
                    href={learnHref}
                    className="inline-flex items-center gap-1.5 rounded-btn border border-edge-strong px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-raised"
                  >
                    <GraduationCap className="size-3.5" aria-hidden />
                    Learn
                  </ConfirmButton>
                )}
              </div>
            </div>

            {/* Focusable, so long output can be scrolled from the keyboard. */}
            <div
              role="region"
              aria-labelledby={outputId}
              tabIndex={0}
              className="slim-scroll min-h-0 flex-1 overflow-auto rounded-card border border-edge bg-surface"
            >
              <OutputPanel run={run} />
            </div>
            <p role="status" className="sr-only">
              {announcement}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
