"use client";

import { lazy, Suspense, useRef, useState } from "react";
import { Play, RotateCcw, X } from "lucide-react";
import { OutputPanel } from "@/components/compiler/output-panel";
import { CodeCopyButton } from "@/components/ui/code-copy-button";
import { Highlight } from "@/lib/highlight";
import { runInSandbox, type RunState } from "@/lib/run-code";
import { buildProgram, type SnippetRuntime } from "@/lib/snippet-harness.mjs";
import { saveSnippetEdit, useSnippetEdit } from "@/lib/snippet-edits";

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
  cpp: "C++",
  java: "Java",
  go: "Go",
  sql: "SQL",
};

const BLOCK = "font-mono text-[13px] leading-6";
// Icon buttons, so the three of them fit in the code's top-right corner.
const TOOL =
  "inline-flex size-7 items-center justify-center rounded-btn border border-white/15 bg-[#111111] px-2 text-[11px] font-medium text-[#fafafa] shadow-sm transition-colors hover:bg-[#2a2a2a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong";

/**
 * A code example you can run and change. It shows as ordinary highlighted
 * code until you click or tab into it, then becomes an editor that looks the
 * same (loaded while you hover). Run (or Mod-Enter) runs it in the sandbox,
 * through its hidden harness when it has one, and the output opens below.
 * Your changes are saved until you reset them.
 */
export function RunnableSnippet({
  code,
  runtime,
  harness,
  stdin,
  storageKey,
  setup,
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
  className?: string;
}) {
  const edited = useSnippetEdit(storageKey);
  const current = edited ?? code;
  const modified = edited !== null && edited !== code;
  // False while it's static; an editor (with where to put the cursor) after.
  const [editing, setEditing] = useState<{ x: number; y: number } | false>(false);
  const [run, setRun] = useState<RunState | null>(null);
  const latest = useRef(current);
  latest.current = current;

  async function execute() {
    setRun({ status: "running" });
    const program = buildProgram(runtime, latest.current, harness);
    const input = runtime === "sql" ? [setup, stdin].filter((x) => x && x.trim()).join("\n") : (stdin ?? "");
    const r = await runInSandbox(runtime, program, input);
    setRun(r.ok ? { status: "done", ...r.run } : { status: "error", error: r.error });
  }

  const edit = (at: { x: number; y: number }) => {
    if (editing === false) setEditing(at);
  };

  const box = `code-dark slim-scroll overflow-x-auto rounded-card border border-code-content-line bg-code-bg text-code-ink`;
  const staticCode = (
    <pre
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
      className={`${box} cursor-text p-4 pr-28 ${BLOCK} focus-visible:outline-2 focus-visible:outline-offset-2`}
    >
      <Highlight code={current} language={runtime} />
    </pre>
  );

  return (
    <div className={`group relative ${className}`} onPointerEnter={() => warm(runtime)} onFocusCapture={() => warm(runtime)}>
      {editing === false ? (
        staticCode
      ) : (
        <div className={box}>
          <Suspense fallback={staticCode}>
            <CmEditor
              variant="snippet"
              value={current}
              language={runtime}
              ariaLabel={`Edit this ${LABELS[runtime]} example`}
              onChange={(next) => saveSnippetEdit(storageKey, next === code ? null : next)}
              onRun={() => void execute()}
              focusAt={editing}
            />
          </Suspense>
        </div>
      )}

      <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
        {modified && (
          <button
            type="button"
            onClick={() => saveSnippetEdit(storageKey, null)}
            title="Reset to the original"
            aria-label="Reset this example to the original"
            className={TOOL}
          >
            <RotateCcw aria-hidden className="size-3.5" />
          </button>
        )}
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
        <CodeCopyButton compact text={current} className="size-7 justify-center px-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100" />
      </div>

      {run && (
        <div role="region" aria-label="Output" className="code-terminal mt-2 overflow-hidden rounded-card border border-content-line bg-surface">
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
