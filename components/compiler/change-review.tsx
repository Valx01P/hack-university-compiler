"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, GitCompare } from "lucide-react";
import type { OutsideChange } from "@/lib/outside-changes";

/**
 * The bar over the compiler's editor while files have changes made outside
 * it (an AI tool in the Terminal, lib/outside-changes.ts): which file, of how
 * many, a step to the next or the one before, the open file's Accept and
 * Reject, and Accept all and Reject all. Each change in the open file has its
 * own accept and reject in the editor (its removed lines red, added green).
 * It never opens a file by itself: the learner goes to it.
 */
export function ChangeReview({
  pending,
  open,
  onShow,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
}: {
  pending: OutsideChange[];
  /** The file the editor shows, or null (a challenge has it). */
  open: string | null;
  /** Shows a file in the editor. */
  onShow: (path: string) => void;
  onAccept: (path: string) => void;
  onReject: (path: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
}) {
  // A removed file can't be shown, so the bar says so, chosen here.
  const [picked, setPicked] = useState<string | null>(null);
  if (!pending.length || open === null) return null;
  const current = pending.find((c) => c.path === open) ?? pending.find((c) => c.path === picked) ?? null;
  const index = current ? pending.indexOf(current) : -1;

  const go = (change: OutsideChange) => {
    if (change.after === null) setPicked(change.path);
    else {
      setPicked(null);
      onShow(change.path);
    }
  };
  // After this one's done, the next one there is (or none).
  const then = (path: string) => {
    const rest = pending.filter((c) => c.path !== path);
    const next = rest[index % Math.max(rest.length, 1)] ?? rest[0];
    if (next && next.path !== open) go(next);
  };
  const step = (by: number) => go(pending[(index + by + pending.length) % pending.length]);

  const btn = "inline-flex shrink-0 items-center rounded-btn border border-code-line px-2 py-0.5 text-xs font-medium text-code-ink transition-colors hover:bg-[color-mix(in_oklab,var(--code-ink)_10%,transparent)]";
  const icon = "inline-flex size-6 shrink-0 items-center justify-center rounded-btn text-code-gutter transition-colors hover:text-code-ink";
  const what = !current
    ? `${pending.length} ${pending.length === 1 ? "file" : "files"} changed outside the editor`
    : current.after === null
      ? `${current.path} was deleted outside the editor`
      : current.before === null
        ? `${current.path} is new, from outside the editor`
        : `Changes to ${current.path} from outside the editor`;

  return (
    <div role="region" aria-label="Changes to review" className="flex shrink-0 items-center gap-2 border-b border-code-line px-2 py-1 text-xs text-code-ink">
      <GitCompare className="size-3.5 shrink-0 text-code-gutter" aria-hidden />
      <span className="min-w-0 flex-1 truncate" role="status">
        {what}
        {current && pending.length > 1 && <span className="text-code-gutter"> · {index + 1} of {pending.length}</span>}
      </span>
      {pending.length > 1 && current && (
        <>
          <button type="button" className={icon} onClick={() => step(-1)} aria-label="The change before">
            <ChevronLeft className="size-3.5" aria-hidden />
          </button>
          <button type="button" className={icon} onClick={() => step(1)} aria-label="The next change">
            <ChevronRight className="size-3.5" aria-hidden />
          </button>
        </>
      )}
      {current ? (
        <>
          <button
            type="button"
            className={btn}
            onClick={() => {
              onReject(current.path);
              then(current.path);
            }}
          >
            {current.after === null ? "Restore" : current.before === null ? "Remove" : "Reject"}
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => {
              onAccept(current.path);
              then(current.path);
            }}
          >
            {current.after === null ? "Keep deleted" : "Accept"}
          </button>
        </>
      ) : (
        <button type="button" className={btn} onClick={() => go(pending[0])}>
          Review
        </button>
      )}
      {pending.length > 1 && (
        <>
          <span aria-hidden className="h-4 w-px shrink-0 bg-code-line" />
          <button type="button" className={btn} onClick={onRejectAll}>
            Reject all
          </button>
          <button type="button" className={`${btn} btn-grad`} onClick={onAcceptAll}>
            Accept all
          </button>
        </>
      )}
    </div>
  );
}
