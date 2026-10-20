"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileIcon } from "@/components/ide/file-icon";
import { fuzzyScore } from "@/lib/fuzzy";
import type { WorkspaceStore } from "@/lib/workspace-store";

/**
 * Quick open (Mod+P): every file in the workspace, open ones first, filtered
 * as you type with a fuzzy match on the path (the letters in order, words
 * and folder starts counting most). Enter opens, Escape closes and hands
 * focus back.
 */

export function QuickOpen({ store, onClose }: { store: WorkspaceStore; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnTo = useRef<Element | null>(null);

  const files = useMemo(() => {
    const all = [...store.nodes.values()].filter((n) => n.type === "file" && !n.path.startsWith("node_modules/") && !n.path.startsWith(".git/")).map((n) => n.path);
    const open = store.tabs.filter((t) => all.includes(t));
    return [...open, ...all.filter((p) => !open.includes(p)).sort()];
  }, [store]);
  const results = useMemo(() => {
    if (!query.trim()) return files.slice(0, 50);
    return files
      .map((p) => ({ p, s: fuzzyScore(p, query) }))
      .filter((r) => r.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 50)
      .map((r) => r.p);
  }, [files, query]);

  useEffect(() => {
    returnTo.current = document.activeElement;
    inputRef.current?.focus();
    return () => {
      if (returnTo.current instanceof HTMLElement) returnTo.current.focus({ preventScroll: true });
    };
  }, []);

  const pick = (path: string | undefined) => {
    if (!path) return;
    returnTo.current = null;
    onClose();
    store.openFile(path);
  };

  return createPortal(
    <div className="fixed inset-0 z-[160] flex justify-center bg-black/20 pt-[12vh]" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div data-popup role="dialog" aria-label="Go to file" className="h-fit w-[min(36rem,calc(100vw-2rem))] rounded-card border border-edge bg-surface p-1.5 shadow-[var(--shadow-card)]">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setAt(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setAt((i) => Math.min(results.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setAt((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              pick(results[at]);
            }
          }}
          role="combobox"
          aria-expanded
          aria-controls={`${store.id}-quick-open`}
          aria-activedescendant={results[at] ? `${store.id}-qo-${at}` : undefined}
          placeholder="Go to file…"
          spellCheck={false}
          className="field w-full rounded-btn px-3 py-2 text-base sm:text-sm"
        />
        <ul id={`${store.id}-quick-open`} role="listbox" className="slim-scroll mt-1 max-h-[50vh] overflow-auto">
          {results.map((path, i) => (
            <li
              key={path}
              id={`${store.id}-qo-${i}`}
              role="option"
              aria-selected={i === at}
              onPointerDown={(e) => {
                e.preventDefault();
                pick(path);
              }}
              onPointerMove={() => setAt(i)}
              className={`flex cursor-pointer items-center gap-2 rounded-btn px-2.5 py-1.5 text-[13px] ${i === at ? "bg-raised text-ink" : "text-ink-muted"}`}
            >
              <FileIcon name={path.slice(path.lastIndexOf("/") + 1)} />
              <span className="truncate">{path.slice(path.lastIndexOf("/") + 1)}</span>
              <span className="truncate text-xs text-ink-faint">{path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ""}</span>
            </li>
          ))}
          {!results.length && <li className="px-2.5 py-1.5 text-sm text-ink-faint">No file matches.</li>}
        </ul>
      </div>
    </div>,
    document.body
  );
}
