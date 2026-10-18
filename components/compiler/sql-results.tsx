"use client";

import type { SqlColumn, SqlRun } from "@/lib/sql/core.mjs";

/** Postgres type ids shown right-aligned, like psql does. */
const NUMERIC = new Set([20, 21, 23, 26, 700, 701, 790, 1700]);

/** One result set as a table: right-aligned numbers, NULL shown faintly. */
export function ResultTable({ columns, rows }: { columns: SqlColumn[]; rows: (string | null)[][] }) {
  return (
    <div className="slim-scroll overflow-x-auto">
      <table className="min-w-full border-collapse font-mono text-[13px]">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th
                key={i}
                scope="col"
                className={`border-b border-content-line px-3 py-1.5 font-semibold text-ink ${NUMERIC.has(c.type) ? "text-right" : "text-left"}`}
              >
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-content-line last:border-0">
              {r.map((v, ci) => (
                <td
                  key={ci}
                  className={`whitespace-pre px-3 py-1 align-top ${NUMERIC.has(columns[ci].type) ? "text-right tabular-nums" : "text-left"} ${
                    v === null ? "text-ink-faint italic" : "text-ink"
                  }`}
                >
                  {v === null ? "NULL" : v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The SQL playground's output: every statement's result in order, a table
 * for the ones that return rows and the command tag for the rest, then the
 * error that stopped the script, if any.
 */
export function SqlResults({ run }: { run: SqlRun }) {
  if (!run.results.length && !run.error) {
    return <p className="p-4 font-mono text-sm text-ink-faint">The script had no statements to run.</p>;
  }
  return (
    <div className="space-y-3 p-3">
      {run.results.map((r, i) =>
        r.kind === "rows" ? (
          <section key={i} className="rounded-btn border border-content-line">
            <ResultTable columns={r.columns} rows={r.rows} />
            <p className="border-t border-content-line px-3 py-1 font-mono text-xs text-ink-faint">
              ({r.rows.length} row{r.rows.length === 1 ? "" : "s"})
            </p>
          </section>
        ) : (
          <p key={i} className="px-1 font-mono text-sm text-ink-muted">
            {r.tag}
          </p>
        )
      )}
      {run.error && (
        <div className="px-1 font-mono text-sm text-danger">
          <p>ERROR: {run.error.message}</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-ink-faint">in: {run.error.statement.split("\n")[0]}</p>
        </div>
      )}
    </div>
  );
}
