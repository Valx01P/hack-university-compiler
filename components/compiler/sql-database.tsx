"use client";

import { useEffect, useState } from "react";
import { ChevronRight, KeyRound, Table2, Eye } from "lucide-react";
import { ResultTable } from "@/components/compiler/sql-results";
import { Collapse } from "@/components/ui/collapse";
import type { SqlRun } from "@/lib/sql/core.mjs";
import type { TableInfo } from "@/lib/sql/browser";

/**
 * The playground database as it is right now: every table, view, and
 * materialized view with its columns, keys, and row count, and a preview of
 * its rows. It reloads after
 * every run (`version`), so you can watch CREATE, INSERT, and DROP land.
 */
export function SqlDatabase({ version }: { version: number }) {
  const [tables, setTables] = useState<TableInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; run: SqlRun } | null>(null);

  useEffect(() => {
    let live = true;
    import("@/lib/sql/browser")
      .then((m) => m.describePlayground())
      .then((t) => live && (setTables(t), setError(null)))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [version]);

  // A preview is a snapshot: refresh it too when the database changes.
  useEffect(() => {
    if (!open) return;
    let live = true;
    import("@/lib/sql/browser")
      .then((m) => m.previewTable(open))
      .then((run) => live && setPreview({ name: open, run }))
      .catch(() => live && setPreview(null));
    return () => {
      live = false;
    };
  }, [open, version]);

  if (error) return <p className="p-4 text-sm text-danger">{error}</p>;
  if (!tables) return <p className="p-4 text-sm text-ink-faint">Starting PostgreSQL…</p>;
  if (!tables.length) return <p className="p-4 text-sm text-ink-muted">The database has no tables. Create one with CREATE TABLE.</p>;

  return (
    <ul className="divide-y divide-content-line">
      {tables.map((t) => {
        const expanded = open === t.name;
        // Kept while it folds shut, so the fold starts from the full height.
        const result = preview?.name === t.name ? preview.run.results[0] : null;
        return (
          <li key={t.name}>
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : t.name)}
              aria-expanded={expanded}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-highlight"
            >
              <ChevronRight className={`size-3.5 shrink-0 text-ink-faint transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden />
              {t.kind === "table" ? (
                <Table2 className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
              ) : (
                <Eye className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
              )}
              <span className="font-mono font-medium text-ink">{t.name}</span>
              {t.kind !== "table" && <span className="shrink-0 text-xs text-ink-faint">{t.kind}</span>}
              <span className="truncate font-mono text-xs text-ink-faint">({t.columns.map((c) => c.name).join(", ")})</span>
              <span className="ms-auto shrink-0 text-xs text-ink-faint">
                {t.rows === null ? "" : `${t.rows} row${t.rows === 1 ? "" : "s"}`}
              </span>
            </button>
            <Collapse open={expanded} className="px-3 pb-3">
              <div className="space-y-2">
                <table className="font-mono text-xs">
                  <tbody>
                    {t.columns.map((c) => (
                      <tr key={c.name}>
                        <td className="py-0.5 pr-3 text-ink">
                          <span className="inline-flex items-center gap-1">
                            {c.key && <KeyRound className="size-3 text-ink-faint" aria-label="primary key" />}
                            {c.name}
                          </span>
                        </td>
                        <td className="py-0.5 pr-3 text-ink-muted">{c.type}</td>
                        <td className="py-0.5 text-ink-faint">{c.nullable ? "" : "not null"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result?.kind === "rows" && (
                  <div className="rounded-btn border border-content-line">
                    <ResultTable columns={result.columns} rows={result.rows} />
                    {t.rows !== null && t.rows > result.rows.length && (
                      <p className="border-t border-content-line px-3 py-1 text-xs text-ink-faint">First {result.rows.length} of {t.rows} rows</p>
                    )}
                  </div>
                )}
              </div>
            </Collapse>
          </li>
        );
      })}
    </ul>
  );
}
