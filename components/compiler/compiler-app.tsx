"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CmEditor } from "@/components/code/cm-editor";
import { EditorSettingsButton } from "@/components/code/editor-settings";
import { CodeThemePicker } from "@/components/code/code-theme";
import { AnchoredPanel } from "@/components/ui/anchored-panel";
import { LangIcon } from "@/components/compiler/lang-icon";
import { COMPILER_LANGS, SANDBOX_REFRESH_EVENT, type CompilerLang } from "@/lib/compiler";

type RunState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "error"; error: string }
  | {
      status: "done";
      stdout: string;
      stderr: string;
      code: number | null;
      signal: string | null;
      /** The sandbox's verdict: "TO" timed out, "OL"/"EL" output too large. */
      verdict: string | null;
      compileCode: number | null;
      compileOutput: string;
    };

type Orient = "horizontal" | "vertical";

export function CompilerApp({ lang }: { lang: CompilerLang }) {
  const [code, setCode] = useState(lang.starter);
  const [stdin, setStdin] = useState("");
  const [showStdin, setShowStdin] = useState(false);
  const [run, setRun] = useState<RunState>({ status: "idle" });
  // Reset-to-starter confirm popover.
  const [resetOpen, setResetOpen] = useState(false);
  const resetAnchorRef = useRef<HTMLButtonElement>(null);
  const [orient, setOrient] = useState<Orient>("horizontal");
  const [splitPct, setSplitPct] = useState(55);
  const [full, setFull] = useState(false);

  const splitRef = useRef<HTMLDivElement>(null);
  const orientRef = useRef(orient);
  orientRef.current = orient;
  const codeKey = `hu-compiler-code:${lang.slug}`;

  // Restore per-language code + layout prefs.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(codeKey);
      if (saved != null) setCode(saved);
      const o = localStorage.getItem("hu-compiler-orient");
      if (o === "horizontal" || o === "vertical") setOrient(o);
      const s = Number(localStorage.getItem("hu-compiler-split-v2"));
      if (s >= 20 && s <= 80) setSplitPct(s);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateCode(next: string) {
    setCode(next);
    try {
      localStorage.setItem(codeKey, next);
    } catch {
      /* ignore */
    }
  }

  function resetCode() {
    updateCode(lang.starter);
  }

  function setOrientation(next: Orient) {
    setOrient(next);
    try {
      localStorage.setItem("hu-compiler-orient", next);
    } catch {
      /* ignore */
    }
  }

  async function execute() {
    setRun({ status: "running" });
    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: lang.slug, code, stdin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRun({ status: "error", error: data?.error ?? "The run failed. Try again." });
        return;
      }
      const r = data.run ?? {};
      setRun({
        status: "done",
        stdout: r.stdout ?? "",
        stderr: r.stderr ?? "",
        code: r.code ?? null,
        signal: r.signal ?? null,
        verdict: r.status ?? null,
        compileCode: r.compileCode ?? null,
        compileOutput: r.compileOutput ?? "",
      });
    } catch {
      setRun({
        status: "error",
        error: "Couldn't reach the compiler server. Make sure npm run dev is still running.",
      });
    } finally {
      window.dispatchEvent(new Event(SANDBOX_REFRESH_EVENT));
    }
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
      const pct = isH
        ? ((ev.clientX - r.left) / r.width) * 100
        : ((ev.clientY - r.top) / r.height) * 100;
      setSplitPct(Math.min(80, Math.max(20, Math.round(pct))));
    }
    function up() {
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = prevCursor;
      handle.releasePointerCapture?.(e.pointerId);
      setSplitPct((p) => {
        try {
          localStorage.setItem("hu-compiler-split-v2", String(p));
        } catch {
          /* ignore */
        }
        return p;
      });
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  function nudgeSplit(delta: number) {
    setSplitPct((current) => {
      const next = Math.min(80, Math.max(20, current + delta));
      try {
        localStorage.setItem("hu-compiler-split-v2", String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
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

            {/* Toolbar, right above the editor so Run is always close. */}
            <div className="slim-scroll flex shrink-0 items-center gap-2 overflow-x-auto pb-3">
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
                <button
                  ref={resetAnchorRef}
                  type="button"
                  onClick={() => setResetOpen((v) => !v)}
                  aria-label="Reset to the starter code"
                  title="Reset to the starter code"
                  aria-pressed={resetOpen}
                  className={`${iconBtn} shrink-0`}
                >
                  {/* Curly braces: reset to the starter definition. */}
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
                  <p className="font-medium text-ink">Reset to starter code?</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    This replaces what&apos;s in the editor with the original
                    starter code.
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
                        resetCode();
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
                  tools={
                    <CodeThemePicker className="field w-full rounded-btn px-2 py-1.5 text-xs font-medium text-ink" />
                  }
                />
                <button
                  type="button"
                  onClick={execute}
                  disabled={run.status === "running"}
                  className="shrink-0 rounded-btn border border-edge-strong px-4 py-1.5 text-sm font-medium btn-grad disabled:opacity-50"
                >
                  {run.status === "running" ? "Running…" : "▶ Run"}
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
                <button
                  type="button"
                  onClick={() => setShowStdin((v) => !v)}
                  className="code-stdin-toggle flex w-full items-center gap-1 px-3 py-1.5 text-left font-mono text-xs font-medium text-code-gutter transition-colors"
                >
                  <span aria-hidden>{showStdin ? "▾" : "▸"}</span>
                  <span>stdin</span>
                  {!showStdin && stdin ? (
                    <span className="truncate text-code-gutter">· {stdin.split("\n")[0]}</span>
                  ) : null}
                </button>
                {showStdin && (
                  <textarea
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
            <div className="slim-scroll flex shrink-0 items-center gap-1 overflow-x-auto pb-3">
              <h2 className="shrink-0 rounded-btn px-2.5 py-1 text-xs font-medium uppercase tracking-wider text-ink dark:text-gold">
                Output
              </h2>
              {run.status === "done" && (
                <button
                  type="button"
                  onClick={() => setRun({ status: "idle" })}
                  className="ms-auto rounded-btn px-2.5 py-1 text-xs font-medium text-ink-faint transition-colors hover:text-ink"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="slim-scroll min-h-0 flex-1 overflow-auto rounded-card border border-edge bg-surface">
              <OutputPanel run={run} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OutputPanel({ run }: { run: RunState }) {
  if (run.status === "idle") {
    return (
      <p className="p-4 text-sm text-ink-faint">
        Press ▶ Run to execute your code. Output appears here.
      </p>
    );
  }
  if (run.status === "running") {
    return <p className="p-4 text-sm text-ink-faint">Running…</p>;
  }
  if (run.status === "error") {
    return <p className="p-4 font-mono text-sm text-danger">⚠ {run.error}</p>;
  }
  const compileFailed = run.compileCode != null && run.compileCode !== 0;
  const timedOut = run.verdict === "TO";
  const outputCapped = run.verdict === "OL" || run.verdict === "EL";
  const stopped = timedOut || outputCapped;
  return (
    <div className="space-y-2 p-4 font-mono text-sm">
      {compileFailed ? (
        <pre className="whitespace-pre-wrap text-danger">
          {run.compileOutput || "Compilation failed."}
        </pre>
      ) : (
        <>
          {run.stdout && <pre className="whitespace-pre-wrap text-ink">{run.stdout}</pre>}
          {run.stderr && <pre className="whitespace-pre-wrap text-danger">{run.stderr}</pre>}
          {timedOut && (
            <pre className="whitespace-pre-wrap text-danger">
              Timed out. Your code ran too long (usually an infinite loop, or far too
              slow). It was stopped.
            </pre>
          )}
          {outputCapped && (
            <pre className="whitespace-pre-wrap text-danger">
              Output limit reached. Your program printed too much, so it was stopped.
            </pre>
          )}
          {!run.stdout && !run.stderr && !stopped && (
            <p className="text-ink-faint">(no output)</p>
          )}
        </>
      )}
      {!compileFailed && !stopped && (
        <p className="text-xs text-ink-faint">
          {run.signal ? `killed by ${run.signal}` : `exit code ${run.code ?? "?"}`}
        </p>
      )}
    </div>
  );
}
