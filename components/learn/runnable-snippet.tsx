"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Play, RotateCcw, X } from "lucide-react";
import { OutputPanel } from "@/components/compiler/output-panel";
import { CodeCopyButton } from "@/components/ui/code-copy-button";
import { Highlight, stripComments } from "@/lib/highlight";
import { runInSandbox, type RunState } from "@/lib/run-code";
import { buildProgram, type SnippetRuntime } from "@/lib/snippet-harness.mjs";
import { saveSnippetEdit, useSnippetEdit } from "@/lib/snippet-edits";
import { useCodeCommentsHidden } from "@/lib/theme";

const loadEditor = () => import("@/components/code/cm-editor");
const CmEditor = lazy(() => loadEditor().then((m) => ({ default: m.CmEditor })));

/** Gets ready for an edit or a run as soon as you point at a snippet: the
    editor's code, and PostgreSQL for SQL. Both load once. */
function warm(runtime: SnippetRuntime) {
  void loadEditor();
  if (runtime === "sql") void import("@/lib/sql/browser");
}

const LABELS: Record<SnippetRuntime, string> = {
  python: "Python",
  javascript: "JavaScript",
  typescript: "TypeScript",
  cpp: "C++",
  java: "Java",
  go: "Go",
  sql: "SQL",
  bash: "Bash",
};

const BLOCK = "font-mono text-[13px] leading-6";
// Plain icons in the code's top-right corner, in the code's own colors.
const TOOL =
  "inline-flex size-7 items-center justify-center rounded-btn text-code-gutter transition-colors hover:text-code-ink focus-visible:text-code-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong";

/**
 * A code example you can run and change. It shows as ordinary highlighted
 * code until you click or tab into it, then becomes an editor that looks the
 * same (loaded while you hover). Clicking or tabbing off it, or Escape, makes
 * it plain code again, so typing elsewhere can't change it by accident. Run
 * (or Mod-Enter) runs it in the sandbox, through its hidden harness when it
 * has one, and the output opens below.
 * Your changes are saved until you reset them. With comments hidden (the
 * Code comments setting) it reads, and edits, without them, but runs as
 * written until you change it. Your own edits always show as you wrote them.
 */
export function RunnableSnippet({
  code,
  runtime,
  harness,
  stdin,
  storageKey,
  setup,
  fixtures,
  clock,
  className = "",
}: {
  code: string;
  runtime: SnippetRuntime;
  harness: string | null;
  stdin: string | null;
  /** Where your edits are saved. */
  storageKey: string;
  /** SQL that builds the tables the snippet works on. */
  setup?: string;
  /** On the runner: the fixture set it starts in, and its frozen clock. */
  fixtures?: string;
  clock?: string;
  className?: string;
}) {
  const edited = useSnippetEdit(storageKey);
  const hideComments = useCodeCommentsHidden();
  // The example as it reads: without its comments while they're hidden.
  const shown = useMemo(() => (hideComments ? stripComments(code, runtime) : code), [hideComments, code, runtime]);
  // What the editor and the copy button get.
  const current = edited ?? shown;
  const modified = edited !== null && edited !== code && edited !== shown;
  // False while it's static; an editor (with where to put the cursor) after.
  const [editing, setEditing] = useState<{ x: number; y: number } | false>(false);
  const active = editing !== false;
  const editorRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLPreElement>(null);
  // Focus goes back to the code block once it's plain again (after Escape,
  // or a Reset, whose button goes away).
  const refocus = useRef(false);
  const [run, setRun] = useState<RunState | null>(null);
  // What runs: the example as written until you change it.
  const latest = useRef(edited ?? code);
  latest.current = edited ?? code;

  async function execute() {
    setRun({ status: "running" });
    const program = buildProgram(runtime, latest.current, harness);
    const input = runtime === "sql" ? [setup, stdin].filter((x) => x && x.trim()).join("\n") : (stdin ?? "");
    const r = await runInSandbox(runtime, program, input, { fixtures, clock });
    setRun(r.ok ? { status: "done", ...r.run } : { status: "error", error: r.error });
  }

  const edit = (at: { x: number; y: number }) => {
    if (editing === false) setEditing(at);
  };

  // Editing lasts while the editor has focus. Once focus goes anywhere else
  // (a click on the page, Tab, even this snippet's own buttons), it's plain
  // code again. Your edits stay until you reset them. When the window loses
  // focus instead, focus stays put, so switching windows keeps you editing.
  useEffect(() => {
    if (!active) return;
    const editor = editorRef.current;
    if (!editor) return;
    const away = () => !editor.contains(document.activeElement);
    // Check where focus settled: a click on plain text moves it to nothing.
    let timer = 0;
    const onFocusOut = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (away()) setEditing(false);
      });
    };
    // Before the editor takes focus (it's still loading, say), a click or
    // focus anywhere else counts too.
    const onElsewhere = (e: Event) => {
      if (e.target instanceof Node && !editor.contains(e.target) && away()) setEditing(false);
    };
    editor.addEventListener("focusout", onFocusOut);
    document.addEventListener("pointerdown", onElsewhere, true);
    document.addEventListener("focusin", onElsewhere, true);
    return () => {
      window.clearTimeout(timer);
      editor.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("pointerdown", onElsewhere, true);
      document.removeEventListener("focusin", onElsewhere, true);
    };
  }, [active]);

  useEffect(() => {
    if (!refocus.current || active) return;
    refocus.current = false;
    codeRef.current?.focus({ preventScroll: true });
  });

  const box = `code-dark slim-scroll overflow-x-auto rounded-card border border-code-content-line bg-code-bg text-code-ink`;
  const staticCode = (
    <pre
      ref={codeRef}
      tabIndex={0}
      aria-label={`${LABELS[runtime]} example. Press Enter to edit it.`}
      onClick={(e) => {
        // A selection made by dragging is for copying: keep the static block.
        if (!window.getSelection()?.toString()) edit({ x: e.clientX, y: e.clientY });
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        // The cursor starts on the first line, past the block's padding.
        const r = e.currentTarget.getBoundingClientRect();
        edit({ x: r.left + 16, y: r.top + 28 });
      }}
      data-own-code={edited !== null ? "" : undefined}
      className={`${box} cursor-text p-4 pr-28 ${BLOCK} focus-visible:outline-2 focus-visible:outline-offset-2`}
    >
      <Highlight code={edited ?? code} language={runtime} />
    </pre>
  );

  return (
    <div className={`group relative ${className}`} onPointerEnter={() => warm(runtime)} onFocusCapture={() => warm(runtime)}>
      {editing === false ? (
        staticCode
      ) : (
        <div
          ref={editorRef}
          className={box}
          onKeyDown={(e) => {
            // Escape stops editing, once the editor's own Escape (closing
            // its completions, or a selection) has had its turn.
            if (e.key !== "Escape" || e.defaultPrevented) return;
            e.preventDefault();
            refocus.current = true;
            setEditing(false);
          }}
        >
          <Suspense fallback={staticCode}>
            <CmEditor
              variant="snippet"
              value={current}
              language={runtime}
              ariaLabel={`Edit this ${LABELS[runtime]} example`}
              onChange={(next) => saveSnippetEdit(storageKey, next === code || next === shown ? null : next)}
              onRun={() => void execute()}
              focusAt={editing}
            />
          </Suspense>
        </div>
      )}

      {/* Reset (once it's changed), Copy, then Run, always shown. */}
      <div className="code-dark absolute right-2 top-2 z-10 flex items-center gap-0.5">
        {modified && (
          <button
            type="button"
            onClick={(e) => {
              refocus.current = e.currentTarget === document.activeElement;
              saveSnippetEdit(storageKey, null);
            }}
            title="Reset to the original"
            aria-label="Reset this example to the original"
            className={TOOL}
          >
            <RotateCcw aria-hidden className="size-3.5" />
          </button>
        )}
        <CodeCopyButton compact plain text={current} className="size-7 justify-center" />
        <button
          type="button"
          onClick={() => void execute()}
          disabled={run?.status === "running"}
          title="Run (Mod-Enter while editing)"
          aria-label={`Run this ${LABELS[runtime]} example`}
          className={`${TOOL} disabled:opacity-60`}
        >
          <Play aria-hidden className="size-3.5" />
        </button>
      </div>

      {run && (
        <div role="region" aria-label="Output" className="stars-through code-terminal mt-2 overflow-hidden rounded-card border border-content-line bg-surface">
          <div className="flex items-center justify-between border-b border-content-line px-3 py-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">Output</span>
            <button
              type="button"
              onClick={() => setRun(null)}
              aria-label="Close the output"
              title="Close the output"
              className="inline-flex size-6 items-center justify-center rounded-btn text-ink-faint transition-colors hover:bg-raised hover:text-ink"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </div>
          <div className="slim-scroll max-h-72 overflow-auto">
            <OutputPanel run={run} />
          </div>
        </div>
      )}
    </div>
  );
}
