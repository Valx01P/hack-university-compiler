"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Eye, KeyRound, RefreshCw, Table2 } from "lucide-react";
import { ResultTable, SqlResults } from "@/components/compiler/sql-results";
import { Collapse } from "@/components/ui/collapse";
import type { SqlRun } from "@/lib/sql/core.mjs";
import { workspaceApi, WorkspaceError, type DbAnswer, type DbSchema } from "@/lib/workspace-client";
import { useStore, type WorkspaceStore } from "@/lib/workspace-store";

/**
 * The Database panel (architecture §4.5, §8.3): the workspace's own
 * database, read as its own role through the runner (GET …/db/schema and
 * POST …/db/query). PostgreSQL lists every table and view with its columns,
 * keys, and row count, a preview of its rows, and a box that runs SQL the
 * way psql does. MongoDB lists the collections with their indexes and a few
 * documents. Reset database puts the rows back to the template's in a
 * moment, and every tab reads the tables again after a reset.
 */

type Engine = "postgres" | "mongo";

/** What a query answers, as the SQL page's results read it. */
function asRun(answer: DbAnswer): SqlRun {
  return {
    results: answer.results ?? [],
    error: answer.error ? { message: answer.error.message, statement: answer.error.statement ?? "" } : null,
  };
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

export function DatabasePanel({ store }: { store: WorkspaceStore }) {
  useStore(store, "db", "status");
  const engines = (["postgres", "mongo"] as const).filter((e) => store.props.template.services.includes(e));
  const [engine, setEngine] = useState<Engine>(engines[0] ?? "postgres");
  const [schema, setSchema] = useState<DbSchema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; answer: DbAnswer } | null>(null);
  const [sql, setSql] = useState("");
  const [run, setRun] = useState<SqlRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [reload, setReload] = useState(0);
  const version = store.version("db");
  const offline = store.runner === "offline";

  useEffect(() => {
    if (offline) return;
    let live = true;
    workspaceApi
      .dbSchema(store.id, engine)
      .then((s) => live && (setSchema(s), setError(null)))
      .catch((e) => live && (setSchema(null), setError(e instanceof WorkspaceError ? e.message : "The database didn't answer.")));
    return () => {
      live = false;
    };
    // The status slice re-renders this when the workspace starts (its first start makes the database).
  }, [store, store.id, engine, version, reload, offline, store.status]);

  // A preview is a snapshot: read it again when the database changes.
  useEffect(() => {
    if (!open || !schema) return;
    let live = true;
    const query =
      schema.engine === "postgres"
        ? { sql: `SELECT * FROM ${open.split(".").map(quote).join(".")} LIMIT 50` }
        : { collection: open, limit: 20 };
    workspaceApi
      .dbQuery(store.id, query)
      .then((answer) => live && setPreview({ name: open, answer }))
      .catch(() => live && setPreview(null));
    return () => {
      live = false;
    };
  }, [open, schema, store.id]);

  async function runSql() {
    if (!sql.trim() || busy) return;
    setBusy(true);
    try {
      setRun(asRun(await workspaceApi.dbQuery(store.id, { sql })));
      setReload((n) => n + 1);
    } catch (e) {
      setRun({ results: [], error: { message: e instanceof WorkspaceError ? e.message : "The query didn't run.", statement: sql } });
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setConfirm(false);
    setBusy(true);
    if (await store.resetDatabase()) {
      setRun(null);
      setReload((n) => n + 1);
    }
    setBusy(false);
  }

  const btn = "inline-flex items-center gap-1 rounded-btn border border-edge-strong px-2 py-0.5 text-xs font-medium text-ink transition-colors hover:bg-raised disabled:opacity-40";
  const tables = schema?.engine === "postgres" ? schema.tables : [];
  const collections = schema?.engine === "mongo" ? schema.collections : [];
  const name = (t: { schema: string; name: string }) => (t.schema === "public" ? t.name : `${t.schema}.${t.name}`);

  return (
    <div className="slim-scroll flex h-full flex-col overflow-auto">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-1.5 text-xs">
        {engines.length > 1 && (
          <select value={engine} onChange={(e) => setEngine(e.target.value as Engine)} aria-label="Database" className="field rounded-btn px-1.5 py-0.5 text-base sm:text-xs">
            {engines.map((e) => (
              <option key={e} value={e}>
                {e === "postgres" ? "PostgreSQL" : "MongoDB"}
              </option>
            ))}
          </select>
        )}
        <span className="font-mono text-ink-muted">{schema ? schema.database : engine === "postgres" ? "PostgreSQL" : "MongoDB"}</span>
        {schema && <span className="text-ink-faint">{Math.max(1, Math.round(schema.sizeBytes / 1024 / 1024))} MB</span>}
        <span className="ms-auto flex items-center gap-1">
          <button type="button" className={btn} disabled={offline || busy} onClick={() => setReload((n) => n + 1)} title="Read the tables again">
            <RefreshCw className="size-3" aria-hidden />
            Refresh
          </button>
          {confirm ? (
            <>
              <span className="text-ink-muted">Put every row back to the starting point?</span>
              <button type="button" className={btn} onClick={() => setConfirm(false)}>
                Cancel
              </button>
              <button type="button" className={`${btn} btn-grad`} onClick={() => void reset()}>
                Reset
              </button>
            </>
          ) : (
            <button type="button" className={btn} disabled={offline || busy || !schema} onClick={() => setConfirm(true)}>
              Reset database
            </button>
          )}
        </span>
      </div>
      {error ? (
        <p className="p-4 text-sm text-ink-muted">{error}</p>
      ) : !schema ? (
        <p className="p-4 text-sm text-ink-faint">{offline ? store.runnerMessage : "Reading the database…"}</p>
      ) : schema.engine === "postgres" ? (
        <>
          {!tables.length && <p className="p-4 text-sm text-ink-muted">The database has no tables yet.</p>}
          <ul className="divide-y divide-content-line">
            {tables.map((t) => {
              const key = name(t);
              const expanded = open === key;
              const answer = preview?.name === key ? preview.answer : null;
              const rows = answer?.results?.find((r) => r.kind === "rows");
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : key)}
                    aria-expanded={expanded}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-raised"
                  >
                    <ChevronRight className={`size-3.5 shrink-0 text-ink-faint transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden />
                    {t.kind === "table" ? <Table2 className="size-3.5 shrink-0 text-ink-faint" aria-hidden /> : <Eye className="size-3.5 shrink-0 text-ink-faint" aria-hidden />}
                    <span className="font-mono font-medium text-ink">{key}</span>
                    {t.kind !== "table" && <span className="shrink-0 text-xs text-ink-faint">{t.kind}</span>}
                    <span className="truncate font-mono text-xs text-ink-faint">({t.columns.map((c) => c.name).join(", ")})</span>
                    <span className="ms-auto shrink-0 text-xs text-ink-faint">{t.rows === null ? "" : `${t.rows} row${t.rows === 1 ? "" : "s"}`}</span>
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
                      {rows?.kind === "rows" && (
                        <div className="rounded-btn border border-content-line">
                          <ResultTable columns={rows.columns} rows={rows.rows} />
                          {t.rows !== null && t.rows > rows.rows.length && (
                            <p className="border-t border-content-line px-3 py-1 text-xs text-ink-faint">First {rows.rows.length} of {t.rows} rows</p>
                          )}
                        </div>
                      )}
                    </div>
                  </Collapse>
                </li>
              );
            })}
          </ul>
          <form
            className="border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void runSql();
            }}
          >
            <label htmlFor={`${store.id}-sql`} className="text-xs font-medium uppercase tracking-wider text-ink-faint">
              SQL, as this workspace&apos;s role
            </label>
            <textarea
              id={`${store.id}-sql`}
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void runSql();
                }
              }}
              rows={3}
              spellCheck={false}
              placeholder="SELECT * FROM … (Ctrl+Enter runs it)"
              className="field mt-1 w-full rounded-btn px-2 py-1.5 font-mono text-base sm:text-xs"
            />
            <div className="mt-1.5 flex justify-end">
              <button type="submit" className={btn} disabled={offline || busy || !sql.trim()}>
                Run
              </button>
            </div>
            {run && <SqlResults run={run} />}
          </form>
        </>
      ) : (
        <>
          {!collections.length && <p className="p-4 text-sm text-ink-muted">The database has no collections yet.</p>}
          <ul className="divide-y divide-content-line">
            {collections.map((c) => {
              const expanded = open === c.name;
              const answer = preview?.name === c.name ? preview.answer : null;
              return (
                <li key={c.name}>
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : c.name)}
                    aria-expanded={expanded}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-raised"
                  >
                    <ChevronRight className={`size-3.5 shrink-0 text-ink-faint transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden />
                    <Table2 className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
                    <span className="font-mono font-medium text-ink">{c.name}</span>
                    {c.type !== "collection" && <span className="shrink-0 text-xs text-ink-faint">{c.type}</span>}
                    <span className="truncate font-mono text-xs text-ink-faint">{c.indexes.map((i) => i.name).join(", ")}</span>
                    <span className="ms-auto shrink-0 text-xs text-ink-faint">{c.count === null ? "" : `${c.count} document${c.count === 1 ? "" : "s"}`}</span>
                  </button>
                  <Collapse open={expanded} className="px-3 pb-3">
                    {answer && (
                      <div className="rounded-btn border border-content-line">
                        <ResultTable columns={answer.columns.map((col) => ({ name: col.name, type: col.type ?? 0 }))} rows={answer.rows} />
                        {c.count !== null && c.count > answer.rows.length && (
                          <p className="border-t border-content-line px-3 py-1 text-xs text-ink-faint">First {answer.rows.length} of {c.count} documents</p>
                        )}
                      </div>
                    )}
                  </Collapse>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
