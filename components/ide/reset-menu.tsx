"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { AnchoredPanel } from "@/components/ui/anchored-panel";
import { workspaceApi, type Snapshot } from "@/lib/workspace-client";
import { useStore, type WorkspaceStore } from "@/lib/workspace-store";

/**
 * The reset menu (architecture §4.2.7, §8.2): this file, this folder, the
 * database, or everything back to the starting point, and save points. Each
 * reset first says exactly what changes ("2 files restored, 1 new file
 * removed, 1 unsaved buffer discarded"). Resetting everything takes a save
 * point first, so Undo brings your version back, and takes the database
 * back too when the template has one. Only a template that says
 * restartOnReset restarts its running server after a database reset.
 */

type Scope = "file" | "dir" | "all" | "db";

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** What a reset of `scope` at `path` would change, in words. */
export function resetSummary(store: WorkspaceStore, scope: Scope, path: string | null): string {
  const inside = (p: string) => scope === "all" || p === path || (scope === "dir" && path !== null && (path === "" || p.startsWith(`${path}/`)));
  let restored = 0;
  let removed = 0;
  for (const node of store.nodes.values()) {
    if (node.type === "dir" || !inside(node.path)) continue;
    if (node.state === "modified") restored++;
    if (node.state === "new") removed++;
  }
  restored += store.removed.filter(inside).length;
  const unsaved = [...store.buffers.values()].filter((b) => b.dirty && inside(b.path)).length;
  const parts = [
    restored && `${plural(restored, "file")} restored`,
    removed && `${plural(removed, "new file")} removed`,
    unsaved && `${plural(unsaved, "unsaved buffer")} discarded`,
  ].filter(Boolean);
  return parts.length ? `${parts.join(", ")}.` : "Nothing differs from the starting point.";
}

export function ResetMenu({ store, className }: { store: WorkspaceStore; className: string }) {
  useStore(store, "tree", "files");
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<Scope | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [label, setLabel] = useState("");
  const [undo, setUndo] = useState<string | null>(null);
  // What the confirm says: the runner's own count (a dry run) when it answers.
  const [summary, setSummary] = useState<string | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const active = store.active;
  const folder = active ? (active.includes("/") ? active.slice(0, active.lastIndexOf("/")) : "") : null;
  const offline = store.runner === "offline";

  useEffect(() => {
    if (!open || offline) return;
    let cancelled = false;
    workspaceApi
      .snapshots(store.id)
      .then((list) => !cancelled && setSnapshots(list))
      .catch(() => !cancelled && setSnapshots([]));
    return () => {
      cancelled = true;
    };
  }, [open, offline, store.id]);

  useEffect(() => {
    setSummary(null);
    if (!confirm || confirm === "db") return;
    const path = confirm === "file" ? active : confirm === "dir" ? folder : null;
    let cancelled = false;
    workspaceApi
      .reset(store.id, confirm, path ?? undefined, true)
      .then((dry) => {
        if (cancelled || !dry.restored || !dry.removed) return;
        const unsaved = [...store.buffers.values()].filter(
          (b) => b.dirty && (confirm === "all" || b.path === path || (confirm === "dir" && path !== null && (path === "" || b.path.startsWith(`${path}/`))))
        ).length;
        const parts = [
          dry.restored.length && `${plural(dry.restored.length, "file")} restored`,
          dry.removed.length && `${plural(dry.removed.length, "new file")} removed`,
          unsaved && `${plural(unsaved, "unsaved buffer")} discarded`,
        ].filter(Boolean);
        setSummary(parts.length ? `${parts.join(", ")}.` : "Nothing differs from the starting point.");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [confirm, active, folder, store]);

  useEffect(() => {
    if (!open) setConfirm(null);
    else requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus());
  }, [open]);

  async function doReset(scope: Scope) {
    setOpen(false);
    if (scope === "db") {
      await store.resetDatabase();
      return;
    }
    const path = scope === "file" ? active : scope === "dir" ? folder : undefined;
    const snapshot = await store.reset(scope === "all" ? (hasDb ? "everything" : "all") : scope, path ?? undefined);
    if (scope === "all" && snapshot) setUndo(snapshot);
  }

  const item = "flex w-full items-center justify-between gap-3 rounded-btn px-2.5 py-1.5 text-left text-[13px] text-ink-muted hover:bg-raised hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent";
  const fileChanged = active ? store.nodes.get(active)?.state === "modified" || store.buffers.get(active)?.dirty : false;
  const inOriginal = active ? store.props.tree.entries.some((e) => e.path === active) : false;
  const hasDb = store.props.template.services.length > 0;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Reset and save points"
        aria-label="Reset and save points"
        className={`${className} w-auto gap-0.5 px-1.5`}
      >
        <RotateCcw className="size-4" aria-hidden />
        <ChevronDown className="size-3" aria-hidden />
      </button>
      {undo && (
        <button
          type="button"
          onClick={async () => {
            const sid = undo;
            setUndo(null);
            await store.restoreSnapshot(sid);
          }}
          className="shrink-0 rounded-btn border border-line-strong px-2 py-1 text-xs font-medium text-ink hover:bg-raised"
        >
          Undo reset
        </button>
      )}
      <AnchoredPanel anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} align="right" className="z-[150] w-72 rounded-card border border-edge bg-surface p-1.5 text-sm shadow-[var(--shadow-card)]">
        <div ref={panelRef} role="menu" aria-label="Reset and save points" data-popup>
          {confirm ? (
            <div className="p-2" role="dialog" aria-label="Confirm the reset">
              <p className="font-medium text-ink">
                {confirm === "file" ? `Reset ${active}?` : confirm === "dir" ? `Reset ${folder || "the workspace root"}/?` : confirm === "db" ? "Reset the database?" : "Reset everything?"}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {confirm === "db"
                  ? "Every table goes back to the starting point's rows. Your files stay as they are."
                  : (summary ?? resetSummary(store, confirm, confirm === "file" ? active : confirm === "dir" ? folder : null))}
              </p>
              {confirm === "all" && (
                <p className="mt-1 text-xs text-ink-faint">A save point is taken first, so Undo brings your version back.{hasDb ? " The database goes back to its starting rows too." : ""}</p>
              )}
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setConfirm(null)} className="rounded-btn px-2.5 py-1.5 text-xs font-medium text-ink-muted hover:bg-raised hover:text-ink">
                  Cancel
                </button>
                <button type="button" onClick={() => void doReset(confirm)} className="rounded-btn border border-edge-strong px-3 py-1.5 text-xs font-medium btn-grad">
                  Reset
                </button>
              </div>
            </div>
          ) : (
            <>
              <button type="button" role="menuitem" className={item} disabled={offline || !active || !inOriginal || !fileChanged} onClick={() => setConfirm("file")}>
                Reset this file
                <span className="truncate font-mono text-[11px] text-ink-faint">{active?.slice(active.lastIndexOf("/") + 1)}</span>
              </button>
              <button type="button" role="menuitem" className={item} disabled={offline || folder === null} onClick={() => setConfirm("dir")}>
                Reset this folder
                <span className="truncate font-mono text-[11px] text-ink-faint">{folder ? `${folder}/` : "/"}</span>
              </button>
              {hasDb && (
                <button type="button" role="menuitem" className={item} disabled={offline} onClick={() => setConfirm("db")}>
                  Reset the database
                </button>
              )}
              <button type="button" role="menuitem" className={item} disabled={offline} onClick={() => setConfirm("all")}>
                Reset everything
              </button>
              <div className="my-1 border-t border-line" />
              <p className="px-2.5 pt-1 text-xs font-medium uppercase tracking-wider text-ink-faint">Save points</p>
              <form
                className="flex gap-1.5 px-2.5 py-1.5"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await store.saveAll();
                  const saved = await workspaceApi.saveSnapshot(store.id, label.trim() || undefined).catch(() => null);
                  if (saved) {
                    setLabel("");
                    setSnapshots((s) => [saved, ...(s ?? [])]);
                    store.announce(`Saved "${saved.label ?? "Save point"}"`);
                  }
                }}
              >
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  aria-label="Save point name"
                  placeholder="Name this version"
                  maxLength={80}
                  disabled={offline}
                  className="field min-w-0 flex-1 rounded-btn px-2 py-1 text-base sm:text-xs"
                />
                <button type="submit" disabled={offline} className="rounded-btn border border-edge-strong px-2 py-1 text-xs font-medium text-ink hover:bg-raised disabled:opacity-40">
                  Save
                </button>
              </form>
              <a
                href={workspaceApi.archiveUrl(store.id)}
                download
                role="menuitem"
                className={`${item} ${offline ? "pointer-events-none opacity-40" : ""}`}
                onClick={() => setOpen(false)}
              >
                Download as a zip
                <span className="text-[11px] text-ink-faint">without .git</span>
              </a>
              {snapshots === null ? (
                <p className="px-2.5 py-1 text-xs text-ink-faint">{offline ? store.runnerMessage : "Loading…"}</p>
              ) : snapshots.length === 0 ? (
                <p className="px-2.5 py-1 text-xs text-ink-faint">None yet.</p>
              ) : (
                <ul className="slim-scroll max-h-48 overflow-auto">
                  {snapshots.map((s) => (
                    <li key={s.sid}>
                      <button
                        type="button"
                        role="menuitem"
                        className={item}
                        onClick={async () => {
                          setOpen(false);
                          await store.restoreSnapshot(s.sid);
                        }}
                      >
                        <span className="min-w-0 truncate">{s.label ?? (s.auto ? "Before a reset" : "Save point")}</span>
                        <span className="shrink-0 text-[11px] text-ink-faint">{s.createdAt ? new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </AnchoredPanel>
    </>
  );
}
