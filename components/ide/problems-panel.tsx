"use client";

import { useStore, type WorkspaceStore } from "@/lib/workspace-store";

/**
 * The Problems panel (architecture §8.3): file:line entries from the
 * template's on-save diagnostics (tsc, go vet, ruff, shellcheck) and from
 * Check, each a link that opens the file at its line. The editor underlines
 * the same places.
 */
export function ProblemsPanel({ store }: { store: WorkspaceStore }) {
  useStore(store, "diag");
  const all = [...store.diagnostics.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (!all.length) return <p className="p-4 text-sm text-ink-faint">No problems. They show here after a save, as the type checker finds them.</p>;
  return (
    <ul className="slim-scroll h-full overflow-auto py-1 text-xs">
      {all.map(([file, items]) =>
        items.map((d, i) => (
          <li key={`${file}:${d.line}:${d.col}:${i}`}>
            <button
              type="button"
              onClick={() => store.openFile(file, { line: d.line })}
              className="flex w-full items-baseline gap-2 px-3 py-1 text-left hover:bg-raised"
            >
              <span className={`w-12 shrink-0 font-medium ${d.severity === "error" ? "text-ink" : "text-ink-faint"}`}>{d.severity}</span>
              <span className="min-w-0 flex-1 text-ink-muted">
                {d.code && <span className="mr-1.5 font-mono text-ink-faint">{d.code}</span>}
                {d.message}
              </span>
              <span className="shrink-0 font-mono text-ink-faint">
                {file}:{d.line}:{d.col}
              </span>
            </button>
          </li>
        ))
      )}
    </ul>
  );
}
